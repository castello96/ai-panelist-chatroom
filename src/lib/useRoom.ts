"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDefaultPanelists } from "./defaults";
import { findAddressed } from "./transcript";
import {
  DEFAULT_SETTINGS,
  type Panelist,
  type ProviderStatus,
  type RoomMessage,
  type RoomSettings,
  type Synthesis,
  type TurnEvent,
} from "./types";

export type RoomItem =
  | { kind: "message"; id: string; message: RoomMessage }
  | { kind: "phase"; id: string; phase: string; note: string }
  | { kind: "notice"; id: string; text: string };

const PANELISTS_KEY = "panel.panelists.v1";
const SETTINGS_KEY = "panel.settings.v1";

/** Browser storage can throw in private windows, so every access is guarded. */
function readStored<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing here is worth failing a render over.
  }
}

export function useRoom() {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [panelists, setPanelists] = useState<Panelist[]>([]);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [items, setItems] = useState<RoomItem[]>([]);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [running, setRunning] = useState(false);
  const turnRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/providers");
        const data = (await response.json()) as { providers: ProviderStatus[] };
        if (cancelled) return;

        setStatuses(data.providers);
        const storedPanelists = readStored<Panelist[]>(PANELISTS_KEY);
        setPanelists(
          storedPanelists?.length ? storedPanelists : buildDefaultPanelists(data.providers),
        );
        const storedSettings = readStored<RoomSettings>(SETTINGS_KEY);
        if (storedSettings) setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      } catch {
        if (!cancelled) setPanelists(buildDefaultPanelists([]));
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (panelists.length) writeStored(PANELISTS_KEY, panelists);
  }, [panelists]);

  useEffect(() => {
    writeStored(SETTINGS_KEY, settings);
  }, [settings]);

  const history = useMemo(
    () => items.filter((item): item is Extract<RoomItem, { kind: "message" }> => item.kind === "message")
      .map((item) => item.message),
    [items],
  );

  const totals = useMemo(() => {
    return history.reduce(
      (acc, message) => {
        if (!message.usage) return acc;
        return {
          input: acc.input + message.usage.input,
          output: acc.output + message.usage.output,
          cacheRead: acc.cacheRead + message.usage.cacheRead,
        };
      },
      { input: 0, output: 0, cacheRead: 0 },
    );
  }, [history]);

  const applyEvent = useCallback((event: TurnEvent) => {
    switch (event.type) {
      case "phase":
        setItems((prev) => [
          ...prev,
          { kind: "phase", id: `phase-${prev.length}-${Date.now()}`, phase: event.phase, note: event.note },
        ]);
        break;

      case "message_start":
        setItems((prev) => [...prev, { kind: "message", id: event.message.id, message: event.message }]);
        break;

      case "delta":
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "message" && item.id === event.id
              ? { ...item, message: { ...item.message, content: item.message.content + event.text } }
              : item,
          ),
        );
        break;

      case "message_end":
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "message" && item.id === event.id
              ? { ...item, message: { ...item.message, usage: event.usage, content: item.message.content.trim() } }
              : item,
          ),
        );
        break;

      case "message_error":
        setItems((prev) =>
          prev.map((item) =>
            item.kind === "message" && item.id === event.id
              ? { ...item, message: { ...item.message, error: event.error } }
              : item,
          ),
        );
        break;

      case "synthesis":
        setSynthesis(event.synthesis);
        break;

      case "notice":
        setItems((prev) => [...prev, { kind: "notice", id: `notice-${prev.length}-${Date.now()}`, text: event.text }]);
        break;

      case "done":
        break;
    }
  }, []);

  const post = useCallback(
    async (body: unknown) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);

      try {
        const response = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => "");
          applyEvent({ type: "notice", text: `Request failed (${response.status}). ${detail}`.trim() });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // SSE frames are separated by a blank line and can split across chunks.
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((part) => part.startsWith("data: "));
            if (!line) continue;
            try {
              applyEvent(JSON.parse(line.slice(6)) as TurnEvent);
            } catch {
              // A malformed frame should not kill the rest of the stream.
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          applyEvent({ type: "notice", text: `Connection lost: ${(error as Error).message}` });
        }
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [applyEvent],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || running) return;

      turnRef.current += 1;
      const turn = turnRef.current;
      const addressed = findAddressed(trimmed, panelists);

      const userMessage: RoomMessage = {
        id: globalThis.crypto.randomUUID(),
        authorId: "user",
        authorName: "You",
        content: trimmed,
        turn,
        phase: "direct",
      };

      const priorHistory = history;
      setItems((prev) => [...prev, { kind: "message", id: userMessage.id, message: userMessage }]);

      await post({
        panelists,
        settings,
        history: priorHistory,
        userMessage: trimmed,
        mode: "turn",
        turn,
        addressed,
      });
    },
    [history, panelists, post, running, settings],
  );

  const continueDebate = useCallback(async () => {
    if (running || history.length === 0) return;
    await post({
      panelists,
      settings,
      history,
      mode: "debate",
      turn: turnRef.current,
      addressed: [],
    });
  }, [history, panelists, post, running, settings]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setSynthesis(null);
    turnRef.current = 0;
  }, []);

  return {
    statuses,
    loadingProviders,
    panelists,
    setPanelists,
    settings,
    setSettings,
    items,
    history,
    synthesis,
    running,
    totals,
    send,
    continueDebate,
    stop,
    reset,
  };
}
