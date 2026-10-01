import type { Panelist, ProviderId, ProviderStatus } from "./types";

interface Seed {
  name: string;
  role: string;
  color: string;
}

/**
 * Three seats with deliberately non-overlapping jobs. The point of the room is
 * disagreement, so the defaults are chosen to pull in different directions
 * rather than to be three flavours of helpful.
 */
export const PANELIST_SEEDS: Seed[] = [
  {
    name: "Pragmatist",
    role: "You care about what can actually be built and shipped, and how soon. You push for the simplest thing that works, and you are suspicious of complexity that has not earned its place. When someone proposes something elaborate, you ask what the cut-down version looks like.",
    color: "#5b8def",
  },
  {
    name: "Skeptic",
    role: "You look for what breaks. Hidden costs, failure modes, the case nobody tested, and the assumption everyone is making without saying out loud. You are not contrarian for its own sake, but you would rather name a real problem early than be agreeable.",
    color: "#e0804a",
  },
  {
    name: "Strategist",
    role: "You zoom out. Who is this actually for, what are the second-order effects, what does this commit us to, and what is the opportunity cost of doing it at all. You are willing to argue that the question itself is the wrong one.",
    color: "#56b89a",
  },
];

/**
 * Spreads the default seats across whichever providers have keys, so a room with
 * one key still works and a room with three keys gets the cross-model contrast
 * that makes the panel worth running.
 */
export function buildDefaultPanelists(statuses: ProviderStatus[]): Panelist[] {
  const usable = statuses.filter((status) => status.configured && status.defaultModel);

  if (usable.length === 0) {
    return PANELIST_SEEDS.map((seed, index) => ({
      ...seed,
      id: `panelist-${index + 1}`,
      provider: "anthropic" as ProviderId,
      model: "",
      enabled: true,
    }));
  }

  return PANELIST_SEEDS.map((seed, index) => {
    const status = usable[index % usable.length];
    return {
      ...seed,
      id: `panelist-${index + 1}`,
      provider: status.id,
      model: status.defaultModel as string,
      enabled: true,
    };
  });
}

export function nextPanelist(existing: Panelist[], statuses: ProviderStatus[]): Panelist {
  const usable = statuses.filter((status) => status.configured && status.defaultModel);
  const status = usable[existing.length % Math.max(usable.length, 1)];
  const palette = ["#a07ad6", "#d16b8a", "#4aa3c7", "#b8974a"];

  return {
    id: `panelist-${Date.now()}`,
    name: `Panelist ${existing.length + 1}`,
    role: "",
    color: palette[existing.length % palette.length],
    provider: status?.id ?? "anthropic",
    model: status?.defaultModel ?? "",
    enabled: true,
  };
}
