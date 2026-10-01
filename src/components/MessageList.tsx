"use client";

import { useEffect, useRef } from "react";
import type { RoomItem } from "@/lib/useRoom";
import type { Panelist } from "@/lib/types";

const PHASE_LABEL: Record<string, string> = {
  blind: "Independent answers",
  debate: "Debate",
  direct: "Direct reply",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function MessageList({
  items,
  panelists,
  running,
}: {
  items: RoomItem[];
  panelists: Panelist[];
  running: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const colors = new Map(panelists.map((panelist) => [panelist.id, panelist.color]));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="transcript">
        <div className="empty">
          <h3>Ask the panel something</h3>
          <p>
            Everyone answers independently first, without seeing each other. Then the moderator picks
            who should push back, and the panel argues.
          </p>
          <p>
            Address one panelist directly with <code>@Skeptic</code> to skip the independent round
            and get a single reply.
          </p>
        </div>
        <div ref={endRef} />
      </div>
    );
  }

  return (
    <div className="transcript">
      {items.map((item) => {
        if (item.kind === "phase") {
          return (
            <div className="phase" key={item.id}>
              <span className="tag">{PHASE_LABEL[item.phase] ?? item.phase}</span>
              <span>{item.note}</span>
            </div>
          );
        }

        if (item.kind === "notice") {
          return (
            <div className="notice" key={item.id}>
              {item.text}
            </div>
          );
        }

        const { message } = item;
        const fromUser = message.authorId === "user";
        const color = fromUser ? "var(--accent)" : (colors.get(message.authorId) ?? "#777");
        const streaming = running && !fromUser && !message.usage && !message.error;

        return (
          <div className={`msg${fromUser ? " from-user" : ""}`} key={item.id}>
            <div className="avatar" style={{ background: color }}>
              {fromUser ? "You" : initials(message.authorName)}
            </div>
            <div className="bubble">
              <div className="byline">
                <span className="who">{message.authorName}</span>
                {message.model ? <span className="model">{message.model}</span> : null}
              </div>

              {message.error ? (
                <div className="body failed">{message.error}</div>
              ) : (
                <div className="body">
                  {message.content}
                  {streaming ? <i className="cursor" /> : null}
                </div>
              )}

              {message.usage ? (
                <div className="usage">
                  {message.usage.input.toLocaleString()} in · {message.usage.output.toLocaleString()} out
                  {message.usage.cacheRead > 0
                    ? ` · ${message.usage.cacheRead.toLocaleString()} cached`
                    : ""}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
