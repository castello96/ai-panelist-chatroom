export type ProviderId = "anthropic" | "openai" | "google";

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "google"];

export type Effort = "low" | "medium" | "high";

/** A single configured seat at the table. */
export interface Panelist {
  id: string;
  name: string;
  provider: ProviderId;
  model: string;
  /** Free-text system instructions: who they are and how they answer. */
  role: string;
  color: string;
  enabled: boolean;
}

export type Phase = "blind" | "debate" | "direct";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RoomMessage {
  id: string;
  /** "user" for the human, otherwise the panelist id. */
  authorId: string;
  authorName: string;
  content: string;
  /** Monotonic turn counter. Everything produced by one send shares a turn. */
  turn: number;
  phase: Phase;
  provider?: ProviderId;
  model?: string;
  usage?: TokenUsage;
  error?: string;
}

export interface Dispute {
  topic: string;
  positions: { panelist: string; stance: string }[];
}

export interface Synthesis {
  agreements: string[];
  disputes: Dispute[];
  openQuestions: string[];
}

export interface RoomSettings {
  /** Run a second, non-blind round where panelists critique each other. */
  debateRound: boolean;
  /** Upper bound on how many panelists the moderator may call on. */
  maxDebateSpeakers: number;
  /** Soft length cap handed to each panelist. */
  wordLimit: number;
  /** Keep the agreements / disputes panel up to date. */
  synthesis: boolean;
  /** Which provider runs the moderator and synthesizer. */
  utilityProvider: ProviderId | "auto";
  effort: Effort;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  debateRound: true,
  maxDebateSpeakers: 2,
  wordLimit: 120,
  synthesis: true,
  utilityProvider: "auto",
  effort: "medium",
};

/** Provider-neutral conversation turn handed to an adapter. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  /** Env var this provider's key is read from, so the UI can name it. */
  keyVar: string;
  configured: boolean;
  models: ModelOption[];
  defaultModel: string | null;
  /** Populated when the key is present but listing models failed. */
  error?: string;
}

/** Server-sent events emitted while a turn runs. */
export type TurnEvent =
  | { type: "phase"; phase: Phase; note: string }
  | { type: "message_start"; message: RoomMessage }
  | { type: "delta"; id: string; text: string }
  | { type: "message_end"; id: string; usage?: TokenUsage }
  | { type: "message_error"; id: string; error: string }
  | { type: "synthesis"; synthesis: Synthesis }
  | { type: "notice"; text: string }
  | { type: "done" };

export interface TurnRequest {
  panelists: Panelist[];
  settings: RoomSettings;
  /** Full room history, oldest first, excluding the message being sent now. */
  history: RoomMessage[];
  /** Omitted when continuing a debate on the existing history. */
  userMessage?: string;
  mode: "turn" | "debate";
  turn: number;
  /** Panelist ids the human addressed with @name. Empty means "the room". */
  addressed: string[];
}
