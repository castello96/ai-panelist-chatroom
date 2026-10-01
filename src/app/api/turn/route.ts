import { z } from "zod";
import { runTurn } from "@/lib/orchestrator";
import type { TurnEvent, TurnRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PanelistShape = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["anthropic", "openai", "google"]),
  model: z.string(),
  role: z.string(),
  color: z.string(),
  enabled: z.boolean(),
});

const MessageShape = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  content: z.string(),
  turn: z.number(),
  phase: z.enum(["blind", "debate", "direct"]),
  provider: z.enum(["anthropic", "openai", "google"]).optional(),
  model: z.string().optional(),
  error: z.string().optional(),
  usage: z
    .object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
      cacheWrite: z.number(),
    })
    .optional(),
});

const RequestShape = z.object({
  panelists: z.array(PanelistShape).max(8),
  settings: z.object({
    debateRound: z.boolean(),
    maxDebateSpeakers: z.number().int().min(1).max(8),
    wordLimit: z.number().int().min(20).max(1000),
    synthesis: z.boolean(),
    utilityProvider: z.enum(["anthropic", "openai", "google", "auto"]),
    effort: z.enum(["low", "medium", "high"]),
  }),
  history: z.array(MessageShape),
  userMessage: z.string().optional(),
  mode: z.enum(["turn", "debate"]),
  turn: z.number(),
  addressed: z.array(z.string()),
});

export async function POST(request: Request) {
  let parsed: TurnRequest;

  try {
    parsed = RequestShape.parse(await request.json()) as TurnRequest;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const emit = (event: TurnEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await runTurn(parsed, emit, request.signal);
      } catch (error) {
        emit({
          type: "notice",
          text: `Turn failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        emit({ type: "done" });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed because the client went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps proxies from buffering the stream into one blob.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
