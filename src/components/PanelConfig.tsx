"use client";

import { nextPanelist } from "@/lib/defaults";
import type { Panelist, ProviderId, ProviderStatus, RoomSettings } from "@/lib/types";

export default function PanelConfig({
  statuses,
  panelists,
  setPanelists,
  settings,
  setSettings,
  disabled,
}: {
  statuses: ProviderStatus[];
  panelists: Panelist[];
  setPanelists: (next: Panelist[]) => void;
  settings: RoomSettings;
  setSettings: (next: RoomSettings) => void;
  disabled: boolean;
}) {
  const configured = statuses.filter((status) => status.configured);
  const missing = statuses.filter((status) => !status.configured);
  const failed = statuses.filter((status) => status.configured && status.error);

  function update(id: string, patch: Partial<Panelist>) {
    setPanelists(panelists.map((panelist) => (panelist.id === id ? { ...panelist, ...patch } : panelist)));
  }

  function modelsFor(provider: ProviderId) {
    return statuses.find((status) => status.id === provider)?.models ?? [];
  }

  return (
    <aside className="rail">
      <h2>Providers</h2>

      {missing.length > 0 ? (
        <div className="unconfigured">
          No key for {missing.map((status) => status.label).join(", ")}. Set{" "}
          <code>{missing.map((status) => status.keyVar).join(", ")}</code> in{" "}
          <code>.env.local</code> and restart the dev server.
        </div>
      ) : null}

      {failed.map((status) => (
        <div className="unconfigured" key={status.id}>
          {status.label} key is set but the model list failed: {status.error}
        </div>
      ))}

      <h2 style={{ marginTop: 18 }}>Panelists</h2>

      {panelists.map((panelist) => (
        <div className={`seat${panelist.enabled ? "" : " off"}`} key={panelist.id}>
          <div className="seat-head">
            <span className="swatch" style={{ background: panelist.color }} />
            <input
              type="text"
              value={panelist.name}
              onChange={(event) => update(panelist.id, { name: event.target.value })}
              disabled={disabled}
              aria-label="Panelist name"
            />
            <input
              type="checkbox"
              checked={panelist.enabled}
              onChange={(event) => update(panelist.id, { enabled: event.target.checked })}
              disabled={disabled}
              aria-label={`Enable ${panelist.name}`}
              style={{ width: "auto" }}
            />
            <button
              className="ghost"
              onClick={() => setPanelists(panelists.filter((other) => other.id !== panelist.id))}
              disabled={disabled || panelists.length <= 1}
              aria-label={`Remove ${panelist.name}`}
            >
              ×
            </button>
          </div>

          <div className="field">
            <label htmlFor={`provider-${panelist.id}`}>Provider</label>
            <select
              id={`provider-${panelist.id}`}
              value={panelist.provider}
              disabled={disabled}
              onChange={(event) => {
                const provider = event.target.value as ProviderId;
                const status = statuses.find((entry) => entry.id === provider);
                update(panelist.id, { provider, model: status?.defaultModel ?? "" });
              }}
            >
              {statuses.map((status) => (
                <option key={status.id} value={status.id} disabled={!status.configured}>
                  {status.label}
                  {status.configured ? "" : " (no key)"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`model-${panelist.id}`}>Model</label>
            <select
              id={`model-${panelist.id}`}
              value={panelist.model}
              disabled={disabled}
              onChange={(event) => update(panelist.id, { model: event.target.value })}
            >
              {modelsFor(panelist.provider).length === 0 ? (
                <option value="">No models available</option>
              ) : null}
              {modelsFor(panelist.provider).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`role-${panelist.id}`}>Role and instructions</label>
            <textarea
              id={`role-${panelist.id}`}
              rows={4}
              value={panelist.role}
              disabled={disabled}
              placeholder="Who are they and how do they answer?"
              onChange={(event) => update(panelist.id, { role: event.target.value })}
            />
          </div>
        </div>
      ))}

      <button
        onClick={() => setPanelists([...panelists, nextPanelist(panelists, statuses)])}
        disabled={disabled || configured.length === 0 || panelists.length >= 8}
        style={{ width: "100%" }}
      >
        Add panelist
      </button>

      <h2 style={{ marginTop: 22 }}>Room</h2>

      <div className="settings-row">
        <label htmlFor="debate">Debate round</label>
        <input
          id="debate"
          type="checkbox"
          checked={settings.debateRound}
          disabled={disabled}
          onChange={(event) => setSettings({ ...settings, debateRound: event.target.checked })}
        />
      </div>

      <div className="settings-row">
        <label htmlFor="speakers">Max debaters</label>
        <input
          id="speakers"
          type="number"
          min={1}
          max={8}
          value={settings.maxDebateSpeakers}
          disabled={disabled}
          onChange={(event) =>
            setSettings({ ...settings, maxDebateSpeakers: Number(event.target.value) || 1 })
          }
        />
      </div>

      <div className="settings-row">
        <label htmlFor="words">Word limit</label>
        <input
          id="words"
          type="number"
          min={20}
          max={1000}
          step={10}
          value={settings.wordLimit}
          disabled={disabled}
          onChange={(event) => setSettings({ ...settings, wordLimit: Number(event.target.value) || 120 })}
        />
      </div>

      <div className="settings-row">
        <label htmlFor="effort">Effort</label>
        <select
          id="effort"
          value={settings.effort}
          disabled={disabled}
          onChange={(event) =>
            setSettings({ ...settings, effort: event.target.value as RoomSettings["effort"] })
          }
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="settings-row">
        <label htmlFor="synthesis">Synthesis</label>
        <input
          id="synthesis"
          type="checkbox"
          checked={settings.synthesis}
          disabled={disabled}
          onChange={(event) => setSettings({ ...settings, synthesis: event.target.checked })}
        />
      </div>

      <div className="settings-row">
        <label htmlFor="utility">Moderator</label>
        <select
          id="utility"
          value={settings.utilityProvider}
          disabled={disabled}
          onChange={(event) =>
            setSettings({
              ...settings,
              utilityProvider: event.target.value as RoomSettings["utilityProvider"],
            })
          }
        >
          <option value="auto">Auto</option>
          {configured.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
