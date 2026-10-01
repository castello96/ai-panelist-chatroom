import type { ModelOption, ProviderId, ProviderStatus } from "../types";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";
import { openaiAdapter } from "./openai";
import { pickModel, type ProviderAdapter } from "./types";

export const adapters: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Unknown provider "${id}"`);
  return adapter;
}

/**
 * Model ids move faster than any list that could be hardcoded here, so the
 * catalog is read from each provider at runtime and the UI only ever offers
 * models the key in use can actually reach.
 */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  return Promise.all(
    (Object.keys(adapters) as ProviderId[]).map(async (id) => {
      const adapter = adapters[id];
      const base = {
        id,
        label: adapter.label,
        keyVar: adapter.keyVar,
        configured: adapter.isConfigured(),
      };

      if (!base.configured) {
        return { ...base, models: [], defaultModel: null };
      }

      try {
        const models = await adapter.listModels();
        return { ...base, models, defaultModel: pickModel(models, adapter.modelPreference) };
      } catch (error) {
        return {
          ...base,
          models: [],
          defaultModel: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

export interface UtilityTarget {
  provider: ProviderId;
  model: string;
}

/** Resolves which cheap model runs the moderator and synthesizer. */
export async function resolveUtility(
  preferred: ProviderId | "auto",
  configured: ProviderId[],
): Promise<UtilityTarget | null> {
  const order =
    preferred === "auto"
      ? configured
      : [preferred, ...configured.filter((id) => id !== preferred)];

  for (const id of order) {
    const adapter = adapters[id];
    if (!adapter?.isConfigured()) continue;
    try {
      const models: ModelOption[] = await adapter.listModels();
      const model = pickModel(models, adapter.utilityPreference);
      if (model) return { provider: id, model };
    } catch {
      // Fall through to the next provider rather than failing the whole turn.
    }
  }

  return null;
}

export { pickModel };
export type { ProviderAdapter };
