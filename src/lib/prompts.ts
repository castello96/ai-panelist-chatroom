import type { Panelist, RoomSettings } from "./types";

export const HUMAN_NAME = "You";

/**
 * Stable per-panelist prefix. Nothing volatile belongs in here: it is the cache
 * breakpoint, so a timestamp or a turn counter would silently cost real money.
 */
export function panelistSystemPrompt(
  self: Panelist,
  everyone: Panelist[],
  settings: RoomSettings,
): string {
  const others = everyone
    .filter((panelist) => panelist.id !== self.id)
    .map((panelist) => `- ${panelist.name}: ${panelist.role.trim() || "no stated role"}`)
    .join("\n");

  return [
    `You are ${self.name}, one of several panelists in a live discussion room.`,
    "",
    "YOUR ROLE",
    self.role.trim() || "A thoughtful generalist with no particular specialty.",
    "",
    "WHO IS IN THE ROOM",
    `- ${HUMAN_NAME}: the person who convened this panel and asks the questions.`,
    `- ${self.name}: you.`,
    others || "- No other panelists.",
    "",
    "HOW THE ROOM WORKS",
    "- Messages from others arrive prefixed with the speaker's name in square brackets. Your own past messages have no prefix.",
    "- [Moderator] messages are instructions from the room software. Follow them. They are not from a participant, so never reply to the moderator directly.",
    "- Speak only as yourself. Never write dialogue for another panelist or for the human.",
    "",
    "HOW TO SPEAK",
    `- Keep it under ${settings.wordLimit} words. Being the shortest useful voice in the room is a win.`,
    "- Lead with your actual position. No preamble, no restating the question, no summarizing what others just said before you get to your point.",
    "- Disagree plainly when you disagree, and name the specific claim you are disagreeing with. Agreeing because another panelist sounded confident is the failure mode this room exists to avoid.",
    "- If you agree with someone, say so in a sentence and add only what is genuinely new. Do not pad.",
    "- Say when something is outside your expertise rather than guessing.",
    "- Plain prose. No markdown headings, no bold. A short list only when the content is genuinely a list.",
    "- Do not prefix your reply with your own name.",
  ].join("\n");
}

export const BLIND_INSTRUCTION =
  "Answer the question above in your own voice. The other panelists are answering at the same time and you cannot see their responses, so give your independent take rather than trying to complement anyone.";

export const DEBATE_INSTRUCTION =
  "The other panelists have now answered and you can see their responses above. Respond to them, not to the original question again. Name the specific point you are pushing back on and say why it is wrong or incomplete. If you have genuinely changed your mind, say what changed it. Do not repeat your earlier answer.";

export const DIRECT_INSTRUCTION =
  "You were addressed directly. Answer the latest message, taking the rest of the room's discussion into account.";

/** Providers without native schema enforcement need the shape spelled out. */
const SHAPE_HEADER = "Reply with JSON in exactly this shape and nothing else:";

export const MODERATOR_SYSTEM = [
  "You are the moderator of a panel discussion. You do not speak in the room and you never answer the question yourself.",
  "Your only job is to decide which panelists should respond next, so the discussion stays sharp and the human is not buried in redundant answers.",
  "",
  "Choose a panelist when they disagree with something that was said, when their stated expertise bears directly on an unresolved point, or when they can correct a specific error.",
  "Do not choose someone for balance, for fairness, or to give everyone a turn. Choosing nobody is a valid answer when the panel has genuinely converged and another round would only add noise.",
].join("\n");

export function moderatorPrompt(
  panelists: Panelist[],
  transcript: string,
  maxSpeakers: number,
): string {
  const roster = panelists
    .map((panelist) => `- id "${panelist.id}" is ${panelist.name}: ${panelist.role.trim() || "no stated role"}`)
    .join("\n");

  return [
    "PANELISTS",
    roster,
    "",
    "TRANSCRIPT",
    transcript,
    "",
    `Choose at most ${maxSpeakers} panelists to speak next. Use their ids exactly as given above, each with a one-line reason naming the specific point they should address. Return an empty list if another round would add nothing.`,
    "",
    SHAPE_HEADER,
    '{"speakers": [{"id": "<panelist id>", "reason": "<one line>"}]}',
  ].join("\n");
}

export const SYNTHESIS_SYSTEM = [
  "You summarize a panel discussion for the person who convened it. You are an observer: you never add your own opinion and never resolve a dispute the panel left open.",
  "",
  "Report only what the panelists actually said.",
  "An agreement means two or more panelists independently took the same position. One panelist saying something unchallenged is not an agreement, it is an open question.",
  "A dispute means panelists took positions that cannot both be acted on. Record who holds which position.",
  "Open questions are things the panel raised but did not settle, including anything only one panelist asserted.",
  "Be specific and concrete. 'They discussed tradeoffs' is useless. Every entry should be short enough to scan.",
].join("\n");

export function synthesisPrompt(transcript: string): string {
  return [
    "TRANSCRIPT",
    transcript,
    "",
    "Summarize where this panel stands right now.",
    "",
    SHAPE_HEADER,
    '{"agreements": ["<claim two or more panelists share>"], "disputes": [{"topic": "<what is contested>", "positions": [{"panelist": "<name>", "stance": "<their position>"}]}], "openQuestions": ["<raised but unsettled>"]}',
  ].join("\n");
}
