"use client";

import Composer from "./Composer";
import MessageList from "./MessageList";
import PanelConfig from "./PanelConfig";
import SynthesisPanel from "./SynthesisPanel";
import { useRoom } from "@/lib/useRoom";

export default function ChatRoom() {
  const room = useRoom();

  const enabledCount = room.panelists.filter((panelist) => panelist.enabled).length;

  return (
    <div className="shell">
      <PanelConfig
        statuses={room.statuses}
        panelists={room.panelists}
        setPanelists={room.setPanelists}
        settings={room.settings}
        setSettings={room.setSettings}
        disabled={room.running}
      />

      <main className="center">
        <div className="topbar">
          <h1>Panel</h1>
          <span className="meter">
            {enabledCount} {enabledCount === 1 ? "panelist" : "panelists"}
          </span>
          <span className="spacer" />
          {room.totals.input + room.totals.output > 0 ? (
            <span className="meter">
              {room.totals.input.toLocaleString()} in · {room.totals.output.toLocaleString()} out
              {room.totals.cacheRead > 0
                ? ` · ${room.totals.cacheRead.toLocaleString()} cached`
                : ""}
            </span>
          ) : null}
          <button className="ghost" onClick={room.reset} disabled={room.items.length === 0}>
            New room
          </button>
        </div>

        {room.loadingProviders ? (
          <div className="transcript">
            <div className="empty">
              <p className="placeholder">Checking which providers have keys…</p>
            </div>
          </div>
        ) : (
          <MessageList items={room.items} panelists={room.panelists} running={room.running} />
        )}

        <Composer
          panelists={room.panelists}
          running={room.running}
          canDebate={room.history.length > 0}
          onSend={room.send}
          onContinueDebate={room.continueDebate}
          onStop={room.stop}
        />
      </main>

      <SynthesisPanel synthesis={room.synthesis} enabled={room.settings.synthesis} />
    </div>
  );
}
