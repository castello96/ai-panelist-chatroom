import { z } from "zod";
import { getAdapter, resolveUtility } from "./providers";
import {
  BLIND_INSTRUCTION,
  DEBATE_INSTRUCTION,
  DIRECT_INSTRUCTION,
  MODERATOR_SYSTEM,
  SYNTHESIS_SYSTEM,
  moderatorPrompt,
  panelistSystemPrompt,
  synthesisPrompt,
} from "./prompts";
import { renderForObserver, renderForSpeaker, withInstruction } from "./transcript";
import type {
  Panelist,
  Phase,
  ProviderId,
  RoomMessage,
  RoomSettings,
  Synthesis,
  TurnEvent,
  TurnRequest,
} from "./types";

/** Generous ceiling: the word limit in the prompt is what actually keeps replies short. */
const PANELIST_MAX_TOKENS = 16000;
const UTILITY_MAX_TOKENS = 4000;

const ModeratorPick = z.object({
  speakers: z.array(z.object({ id: z.string(), reason: z.string() })),
});

const SynthesisShape = z.object({
  agreements: z.array(z.string()),
  disputes: z.array(
    z.object({
      topic: z.string(),
      positions: z.array(z.object({ panelist: z.string(), stance: z.string() })),
    }),
  ),
  openQuestions: z.array(z.string()),
});

type Emit = (event: TurnEvent) => void;

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Providers report failures very differently. OpenAI sends one readable sentence,
 * while Google nests a JSON error document inside the message field of another
 * JSON error document. Dumping that raw into a chat bubble is unreadable, so peel
 * the envelopes off and keep the innermost human-readable sentence.
 */
function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  let text = raw.trim();

  for (let depth = 0; depth < 4; depth += 1) {
    const start = text.indexOf("{");
    if (start === -1) break;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text.slice(start));
    } catch {
      break;
    }

    const message = innerMessage(parsed);
    if (!message) break;

    const next = `${text.slice(0, start)}${message}`.trim();
    if (next === text) break;
    text = next;
  }

  text = text.replace(/\s+/g, " ").trim();
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

function innerMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;

  const error = node.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }

  return typeof node.message === "string" ? node.message : null;
}

/**
 * Runs one speaking round. Every selected panelist streams concurrently into the
 * same event sink, and a panelist that fails is reported in place rather than
 * taking the round down with it.
 */
async function runRound(
  speakers: Panelist[],
  everyone: Panelist[],
  history: RoomMessage[],
  settings: RoomSettings,
  phase: Phase,
  instruction: string,
  turn: number,
  emit: Emit,
  signal: AbortSignal | undefined,
): Promise<RoomMessage[]> {
  const results = await Promise.all(
    speakers.map(async (panelist): Promise<RoomMessage> => {
      const message: RoomMessage = {
        id: newId(),
        authorId: panelist.id,
        authorName: panelist.name,
        content: "",
        turn,
        phase,
        provider: panelist.provider,
        model: panelist.model,
      };

      emit({ type: "message_start", message });

      try {
        const adapter = getAdapter(panelist.provider);
        const messages = withInstruction(renderForSpeaker(history, panelist.id), instruction);

        const result = await adapter.streamText({
          model: panelist.model,
          system: panelistSystemPrompt(panelist, everyone, settings),
          messages,
          maxTokens: PANELIST_MAX_TOKENS,
          effort: settings.effort,
          signal,
          onDelta: (text) => emit({ type: "delta", id: message.id, text }),
        });

        const content = stripSelfLabel(result.text, panelist.name);
        emit({ type: "message_end", id: message.id, usage: result.usage });
        return { ...message, content, usage: result.usage };
      } catch (error) {
        const text = errorText(error);
        emit({ type: "message_error", id: message.id, error: text });
        return { ...message, error: text };
      }
    }),
  );

  return results;
}

/** Models occasionally echo the speaker label the transcript taught them. */
function stripSelfLabel(text: string, name: string): string {
  const pattern = new RegExp(`^\\s*\\[?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]?\\s*:\\s*`, "i");
  return text.replace(pattern, "").trim();
}

export async function runTurn(
  request: TurnRequest,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const { settings } = request;
  const panelists = request.panelists.filter((panelist) => panelist.enabled);

  if (panelists.length === 0) {
    emit({ type: "notice", text: "No panelists are enabled." });
    emit({ type: "done" });
    return;
  }

  let history = [...request.history];

  if (request.userMessage?.trim()) {
    history.push({
      id: newId(),
      authorId: "user",
      authorName: "You",
      content: request.userMessage.trim(),
      turn: request.turn,
      phase: "direct",
    });
  }

  const addressed = panelists.filter((panelist) => request.addressed.includes(panelist.id));

  if (request.mode === "turn") {
    if (addressed.length > 0) {
      // A direct @mention is an explicit instruction, so it skips both the blind
      // round and the moderator: exactly the named panelists answer, and they
      // answer with the full room in view.
      emit({
        type: "phase",
        phase: "direct",
        note: `Addressed directly: ${addressed.map((p) => p.name).join(", ")}`,
      });
      const replies = await runRound(
        addressed, panelists, history, settings, "direct",
        DIRECT_INSTRUCTION, request.turn, emit, signal,
      );
      history = [...history, ...replies];
    } else {
      emit({
        type: "phase",
        phase: "blind",
        note: `${panelists.length} panelists answering independently`,
      });
      const replies = await runRound(
        panelists, panelists, history, settings, "blind",
        BLIND_INSTRUCTION, request.turn, emit, signal,
      );
      history = [...history, ...replies];

      if (!hasPanelistContent(replies)) {
        // Nobody actually spoke, so there is nothing to debate. Bailing out here is
        // what stops one bad key or one outage from buying a second round of the
        // same errors plus a moderator call on top.
        emit({
          type: "notice",
          text: "No panelist answered, so the debate and synthesis rounds were skipped.",
        });
      } else if (settings.debateRound) {
        history = await runDebate(panelists, history, settings, request.turn, emit, signal);
      }
    }
  } else {
    history = await runDebate(panelists, history, settings, request.turn, emit, signal);
  }

  if (settings.synthesis && hasPanelistContent(history)) {
    await runSynthesis(panelists, history, settings, emit, signal);
  }

  emit({ type: "done" });
}

/**
 * The moderator picks who speaks so a debate round costs one or two calls rather
 * than one per panelist, and so the human is not handed N near-identical replies.
 */
async function runDebate(
  panelists: Panelist[],
  history: RoomMessage[],
  settings: RoomSettings,
  turn: number,
  emit: Emit,
  signal: AbortSignal | undefined,
): Promise<RoomMessage[]> {
  const utility = await resolveUtility(settings.utilityProvider, configuredProviders(panelists));

  let speakers = panelists;
  let note = "Everyone responds (no moderator available)";

  if (utility) {
    try {
      const pick = await getAdapter(utility.provider).generateJson({
        model: utility.model,
        system: MODERATOR_SYSTEM,
        prompt: moderatorPrompt(panelists, renderForObserver(history), settings.maxDebateSpeakers),
        schema: ModeratorPick,
        schemaName: "moderator_pick",
        maxTokens: UTILITY_MAX_TOKENS,
        signal,
      });

      const chosen = pick.speakers
        .map((entry) => ({
          panelist: panelists.find((panelist) => panelist.id === entry.id),
          reason: entry.reason,
        }))
        .filter((entry): entry is { panelist: Panelist; reason: string } => Boolean(entry.panelist))
        .slice(0, settings.maxDebateSpeakers);

      if (chosen.length === 0) {
        emit({ type: "phase", phase: "debate", note: "Moderator: the panel has converged, no debate round" });
        return history;
      }

      speakers = chosen.map((entry) => entry.panelist);
      note = chosen.map((entry) => `${entry.panelist.name}: ${entry.reason}`).join("  •  ");
    } catch (error) {
      note = `Everyone responds (moderator failed: ${errorText(error)})`;
      speakers = panelists.slice(0, settings.maxDebateSpeakers);
    }
  } else {
    speakers = panelists.slice(0, settings.maxDebateSpeakers);
  }

  emit({ type: "phase", phase: "debate", note });

  const replies = await runRound(
    speakers, panelists, history, settings, "debate",
    DEBATE_INSTRUCTION, turn, emit, signal,
  );

  return [...history, ...replies];
}

async function runSynthesis(
  panelists: Panelist[],
  history: RoomMessage[],
  settings: RoomSettings,
  emit: Emit,
  signal: AbortSignal | undefined,
): Promise<void> {
  const utility = await resolveUtility(settings.utilityProvider, configuredProviders(panelists));
  if (!utility) return;

  try {
    const synthesis = await getAdapter(utility.provider).generateJson<Synthesis>({
      model: utility.model,
      system: SYNTHESIS_SYSTEM,
      prompt: synthesisPrompt(renderForObserver(history)),
      schema: SynthesisShape,
      schemaName: "panel_synthesis",
      maxTokens: UTILITY_MAX_TOKENS,
      signal,
    });
    emit({ type: "synthesis", synthesis });
  } catch (error) {
    emit({ type: "notice", text: `Synthesis unavailable: ${errorText(error)}` });
  }
}

/** A round in which every panelist errored has nothing to debate and nothing to summarize. */
function hasPanelistContent(messages: RoomMessage[]): boolean {
  return messages.some(
    (message) =>
      message.authorId !== "user" && !message.error && message.content.trim().length > 0,
  );
}

function configuredProviders(panelists: Panelist[]): ProviderId[] {
  const seen = new Set<ProviderId>();
  for (const panelist of panelists) seen.add(panelist.provider);
  return [...seen];
}
