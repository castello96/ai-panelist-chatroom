# AI Panelist Chatroom

A single chatroom where you talk to a panel of AI experts instead of one assistant. Each seat at the table is a separate model (Claude, GPT, or Gemini) with its own role, and the room is structured so the panelists actually disagree with each other rather than politely converging.

## Why the structure exists

If you just pipe one transcript into three models and let them talk in order, you get agreement. The second model sees the first one's answer and anchors to it, the third sees both and smooths the difference. You end up paying for three models and getting one opinion.

So every turn runs in phases:

1. **Blind round.** All enabled panelists answer your message concurrently, each one without seeing the others' answers for this turn. This is a Delphi-style independent round. Disagreement that survives it is real disagreement.
2. **Debate round.** A cheap moderator model reads the blind answers and picks the panelists with the sharpest substantive conflict (up to `maxDebateSpeakers`, default 2). Only those speak, and they are told to name the specific claim they are pushing back on. If the moderator finds nothing worth arguing about, it says the panel converged and skips the round.
3. **Synthesis.** A separate call summarizes what the panel agreed on, what is genuinely disputed and who is on which side, and what questions are still open. It renders in the right rail, not in the transcript.

You can hit **Continue debate** to run another debate round on the same message when the argument is going somewhere.

## Addressing one panelist

Start your message with `@Skeptic` (or any panelist name) to skip the blind round and the moderator entirely. The named panelists answer directly, with the full room transcript in view. Use this for follow-ups like `@Pragmatist what would that cost us in week one?`.

Multiple mentions work. Mentions are matched case-insensitively against panelist names.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in at least one key
npm run dev                  # http://localhost:3100
```

You do not need all three providers. The default roster spreads its seats across whichever keys are present, and the config panel only offers providers that are configured.

Keys are server-side only. The browser talks to two routes: `/api/providers`, which returns booleans and model lists but never key values, and `/api/turn`, which proxies the providers and streams back Server-Sent Events. Nothing in the client bundle can reach a provider directly.

## Models

The model dropdowns are populated from each provider's live catalog at request time, not from a hardcoded list, so new models show up without a code change and retired ones stop being offered. Defaults are picked by a preference list per provider (newest flagship first, falling back down the family). The moderator and synthesizer default to the cheapest capable model available, and you can pin them to a specific provider in room settings.

## The default panel

| Seat | Brief |
|---|---|
| Pragmatist | What can actually be built and shipped. Pushes for the simplest thing that works. |
| Skeptic | What breaks, what it hides, what costs are not on the table. Names unstated assumptions. |
| Strategist | Zooms out. Second-order effects, opportunity cost, willing to argue you are asking the wrong question. |

Rename them, rewrite their roles, change their models, disable a seat, or add more. Everything is editable in the left panel and persists to `localStorage` under `panel.panelists.v1` and `panel.settings.v1`. "New room" clears the transcript, not the roster.

## Room settings

- **Debate round** on/off, and **max debaters** per round.
- **Word limit** per panelist reply. This is a prompt instruction, not a hard token cap. It is the main lever on both cost and readability.
- **Effort** for the panelists, passed through to providers that support a depth control.
- **Synthesis** on/off.
- **Moderator provider**, or `auto` to use the cheapest configured one.

## Cost

A single turn with three panelists, a debate round, and synthesis is roughly 3 + 2 + 1 moderator + 1 synthesis = 7 model calls. That adds up faster than a normal chat, which is why the moderator trims the debate round to the panelists who actually disagree, why the word limit exists, and why Anthropic calls use two prompt cache breakpoints (the system prompt and the second-to-last turn, so the volatile moderator instruction falls outside the cached prefix).

The topbar shows live input and output token totals for the session. It deliberately does not show a dollar estimate, because per-model pricing drifts and a stale multiplier in the UI is worse than no number at all. Use the token counts against your provider's current rates.

## Failure behavior

A panelist whose provider errors reports the error in its own message bubble and the round continues without it. One bad key or one rate limit does not take down the turn. If the moderator call fails, the debate round falls back to the first N panelists rather than being skipped.

## Implementation notes

Every provider understands a two-role conversation, so a multi-party room has to be flattened per speaker. `src/lib/transcript.ts` re-renders the room from each panelist's point of view: their own messages become `assistant` turns, everyone else's become `user` turns prefixed with `[Name]: `, consecutive same-role turns are merged, and the sequence is forced to open on a `user` turn. Round instructions are appended as `[Moderator]: ...` user turns, which also guarantees the conversation ends on a user turn, as every provider requires.

The streaming path is a POST route handler returning a `ReadableStream` of SSE frames. `EventSource` cannot POST, so the client uses `fetch` plus a reader and splits on blank lines, with a buffer for frames that straddle chunk boundaries.
