import type { ChatTurn, Panelist, RoomMessage } from "./types";

/**
 * Every provider only understands a two-role conversation, so the room has to be
 * re-rendered from the point of view of whoever is about to speak: their own past
 * messages become assistant turns, everyone else's become labelled user turns.
 * Getting this wrong is what makes panelists start impersonating each other.
 */
export function renderForSpeaker(
  history: RoomMessage[],
  speakerId: string,
): ChatTurn[] {
  const turns: ChatTurn[] = [];

  for (const message of history) {
    if (message.error) continue;
    if (!message.content.trim()) continue;

    if (message.authorId === speakerId) {
      turns.push({ role: "assistant", content: message.content });
    } else {
      turns.push({
        role: "user",
        content: `[${message.authorName}]: ${message.content}`,
      });
    }
  }

  return normalize(turns);
}

/**
 * Collapse consecutive same-role turns and guarantee the conversation opens on a
 * user turn. Anthropic and Google both reject or mangle histories that don't.
 */
export function normalize(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];

  for (const turn of turns) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === turn.role) {
      previous.content = `${previous.content}\n\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }

  if (merged.length > 0 && merged[0].role === "assistant") {
    merged.unshift({ role: "user", content: "[Moderator]: The room is now in session." });
  }

  return merged;
}

/** Appends the round instruction, which also guarantees we end on a user turn. */
export function withInstruction(turns: ChatTurn[], instruction: string): ChatTurn[] {
  return normalize([...turns, { role: "user", content: `[Moderator]: ${instruction}` }]);
}

/**
 * The whole room as one labelled document, for the moderator and synthesizer.
 * They are observers rather than participants, so there is no self to split out.
 */
export function renderForObserver(history: RoomMessage[]): string {
  return history
    .filter((message) => !message.error && message.content.trim())
    .map((message) => `[${message.authorName}]: ${message.content}`)
    .join("\n\n");
}

const MENTION_PATTERN = /@([\w-]+)/g;

/** Resolves @mentions in a message to panelist ids. Matching is loose on purpose. */
export function findAddressed(text: string, panelists: Panelist[]): string[] {
  const addressed = new Set<string>();

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const handle = match[1].toLowerCase();
    for (const panelist of panelists) {
      const name = panelist.name.toLowerCase();
      if (name === handle || name.replace(/\s+/g, "") === handle || name.split(/\s+/)[0] === handle) {
        addressed.add(panelist.id);
      }
    }
  }

  return [...addressed];
}
