"use client";

import type { Synthesis } from "@/lib/types";

export default function SynthesisPanel({
  synthesis,
  enabled,
}: {
  synthesis: Synthesis | null;
  enabled: boolean;
}) {
  return (
    <aside className="rail right">
      <h2>Where the panel stands</h2>

      {!enabled ? (
        <p className="placeholder">Synthesis is turned off for this room.</p>
      ) : !synthesis ? (
        <p className="placeholder">
          After each round this tracks what the panel agrees on, what it is still arguing about, and
          what nobody has answered.
        </p>
      ) : (
        <>
          <div className="synth-group">
            <h3>Agreed</h3>
            {synthesis.agreements.length === 0 ? (
              <p className="placeholder">Nothing yet.</p>
            ) : (
              <ul>
                {synthesis.agreements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="synth-group">
            <h3>Disputed</h3>
            {synthesis.disputes.length === 0 ? (
              <p className="placeholder">Nothing yet.</p>
            ) : (
              synthesis.disputes.map((dispute, index) => (
                <div className="dispute" key={index}>
                  <div className="topic">{dispute.topic}</div>
                  {dispute.positions.map((position, positionIndex) => (
                    <div className="stance" key={positionIndex}>
                      <b>{position.panelist}</b>: {position.stance}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="synth-group">
            <h3>Open questions</h3>
            {synthesis.openQuestions.length === 0 ? (
              <p className="placeholder">Nothing yet.</p>
            ) : (
              <ul>
                {synthesis.openQuestions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
