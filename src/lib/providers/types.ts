import type { z } from "zod";
import type { ChatTurn, Effort, ModelOption, ProviderId, TokenUsage } from "../types";

export interface StreamRequest {
  model: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  effort: Effort;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult {
  text: string;
  usage: TokenUsage;
}

export interface JsonRequest<T> {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /** Env var the key is read from, surfaced in setup errors. */
  keyVar: string;
  isConfigured(): boolean;
  listModels(): Promise<ModelOption[]>;
  /** Ordered regexes used to pick a sensible default from the live model list. */
  modelPreference: RegExp[];
  /** Cheap model for the moderator and synthesizer, matched against the live list. */
  utilityPreference: RegExp[];
  streamText(request: StreamRequest): Promise<StreamResult>;
  generateJson<T>(request: JsonRequest<T>): Promise<T>;
}

export const EMPTY_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** First model matching the earliest preference that hits, else the first listed. */
/**
 * Catalogs come back alphabetically, which puts gemini-2.5-flash-lite ahead of
 * gemini-3.5-flash-lite. Taking the first match therefore picks the OLDEST model
 * in a family, which is precisely the one the provider is about to retire. So
 * rank every match and take the newest instead.
 */
export function pickModel(models: ModelOption[], preference: RegExp[]): string | null {
  for (const pattern of preference) {
    const hits = models.filter((model) => pattern.test(model.id));
    if (hits.length === 0) continue;
    return hits.reduce((best, model) =>
      versionRank(model.id) > versionRank(best.id) ? model : best,
    ).id;
  }

  return models[0]?.id ?? null;
}

/**
 * Only the first number in the id is the version. Reading every number would let
 * the "08" in gpt-4o-2024-08-06 outrank gpt-5. A "latest" alias always points at
 * the current model in its family, so it outranks every pinned version and is the
 * one pick that cannot go stale.
 */
function versionRank(id: string): number {
  if (/latest$/.test(id)) return Number.MAX_SAFE_INTEGER;

  const match = id.match(/(\d+)(?:\.(\d+))?/);
  if (!match) return 0;

  return Number(match[1]) * 1000 + (match[2] ? Number(match[2]) : 0);
}
