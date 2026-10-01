"use client";

import { useRef, useState } from "react";
import type { Panelist } from "@/lib/types";

export default function Composer({
  panelists,
  running,
  canDebate,
  onSend,
  onContinueDebate,
  onStop,
}: {
  panelists: Panelist[];
  running: boolean;
  canDebate: boolean;
  onSend: (text: string) => void;
  onContinueDebate: () => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    if (!text.trim() || running) return;
    onSend(text);
    setText("");
    ref.current?.focus();
  }

  const names = panelists.filter((panelist) => panelist.enabled).map((panelist) => panelist.name);

  return (
    <div className="composer">
      <div className="row">
        <textarea
          ref={ref}
          rows={2}
          value={text}
          placeholder="Ask the panel. Use @name to address one of them directly."
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {running ? (
          <button onClick={onStop}>Stop</button>
        ) : (
          <button className="primary" onClick={submit} disabled={!text.trim()}>
            Send
          </button>
        )}
      </div>

      <div className="hint">
        <span>
          <kbd>Enter</kbd> to send, <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
        </span>
        {names.length > 0 ? <span>@{names.join("  @")}</span> : null}
        <span style={{ flex: 1 }} />
        <button className="ghost" onClick={onContinueDebate} disabled={running || !canDebate}>
          Continue debate
        </button>
      </div>
    </div>
  );
}
