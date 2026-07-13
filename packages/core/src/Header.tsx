import { useState } from "react";
import { SERVICES, ENDPOINTS, TESTS, CONTRACTS } from "./data";
import { MUTATION } from "./mutation-data";
import { mutColor, mutLabel, displayName, COLORS, CONTRACT_TOPIC_COLOR } from "./helpers";
import type { ContractDef } from "./types";

interface Props {
  title?: string;
  /** Called when the user clicks a service row. Receiver is expected to
   *  focus the corresponding `svc:<name>` node in the 3D graph. */
  onSelectService?: (svc: string) => void;
  /** Called when the user clicks a contract row. Receiver is expected to
   *  open the contract InfoCard and pan the camera to the bond midpoint. */
  onSelectContract?: (contract: ContractDef) => void;
}

export default function Header({ title = "Galaxy Graph - System Coverage", onSelectService, onSelectContract }: Props) {
  const agg = MUTATION.aggregate;
  const aggColor = mutColor(agg.score);
  const hasMutationData = agg.total > 0;
  const [showSummary, setShowSummary] = useState(true);
  const [showServices, setShowServices] = useState(true);
  const [showContracts, setShowContracts] = useState(false);

  return (
    <div
      id="header"
      className="panel"
      style={{
        top: 16,
        left: 16,
        width: 320,
        // Wrapper sits below a 64px nav and clips overflow, so cap the
        // panel to viewport - nav - 16px top - 16px bottom margins and
        // scroll inside if content overflows.
        maxHeight: "calc(100vh - 96px)",
        overflowY: "auto",
      }}
    >
      <h1>{title}</h1>

      <SectionToggle
        label="Summary"
        open={showSummary}
        onToggle={() => setShowSummary((v) => !v)}
      />
      {showSummary && (
        <>
          {hasMutationData ? (
            <>
              <div className="big">
                <span style={{ color: aggColor }}>{Math.round(agg.score)}</span>
                <span className="pct">%</span>
              </div>
              <div>
                <span
                  className="status-pill"
                  style={{ color: aggColor, background: aggColor + "22", border: `1px solid ${aggColor}` }}
                >
                  {mutLabel(agg.score)}
                </span>
              </div>
            </>
          ) : (
            <div>
              <span
                className="status-pill"
                style={{ color: "#b0b6c9", background: "#5c637022", border: "1px solid #5c6370" }}
              >
                No mutation data
              </span>
            </div>
          )}
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            {hasMutationData
              ? "Mutation score = % of injected bugs caught by tests. Higher is better."
              : "No Stryker-style mutation report was found for this dataset."}
          </div>
        </>
      )}

      <hr />

      <SectionToggle
        label="Services"
        open={showServices}
        onToggle={() => setShowServices((v) => !v)}
      />
      {showServices && (
        <div>
          {SERVICES.map((s) => {
            const m = MUTATION.services[s.svc];
            const c = mutColor(m?.score);
            const clickable = !!onSelectService;
            const tagline = s.narrative?.description?.split(/\n\s*\n/)[0]?.trim();
            return (
              <div
                key={s.svc}
                className="svc-line"
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onSelectService!(s.svc) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectService!(s.svc);
                        }
                      }
                    : undefined
                }
                style={clickable ? { cursor: "pointer", alignItems: "flex-start" } : { alignItems: "flex-start" }}
                data-testid={`svc-row-${s.svc}`}
              >
                <span className="svc-name" style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <span
                      className="swatch"
                      style={{ display: "inline-block", background: COLORS[s.svc], marginRight: 6, verticalAlign: "middle" }}
                    />
                    {displayName(s.svc)}
                  </span>
                  {tagline && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        marginLeft: 14,
                        fontSize: 11,
                        color: "#7a8095",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 220,
                      }}
                      data-testid={`svc-tagline-${s.svc}`}
                    >
                      {tagline}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 80, height: 5, background: "#1c2030", borderRadius: 3, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${m ? Math.round(m.score) : 0}%`, background: c }} />
                  </span>
                  <span className="svc-score" style={{ color: c, minWidth: 40, textAlign: "right" }}>
                    {m ? Math.round(m.score) : "—"}
                    <span style={{ color: "#8b90a3", fontSize: 10 }}>%</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <hr />

      <SectionToggle
        label="Contracts"
        open={showContracts}
        onToggle={() => setShowContracts((v) => !v)}
      />
      {showContracts && (
        <div data-testid="contracts-list">
          {CONTRACTS.map((c) => {
            const clickable = !!onSelectContract;
            const accent = c.mode === "event-bus" ? CONTRACT_TOPIC_COLOR : "#f8d77a";
            const tagline = c.narrative?.description?.split(/\n\s*\n/)[0]?.trim();
            return (
              <div
                key={c.id}
                className="svc-line"
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => onSelectContract!(c) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectContract!(c);
                        }
                      }
                    : undefined
                }
                style={clickable ? { cursor: "pointer", alignItems: "flex-start" } : { alignItems: "flex-start" }}
                data-testid={`contract-row-${c.id}`}
              >
                <span className="svc-name" style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: accent,
                        boxShadow: `0 0 6px ${accent}88`,
                        flex: "0 0 auto",
                      }}
                    />
                    <span style={{ color: COLORS[c.producer], whiteSpace: "nowrap" }}>
                      {displayName(c.producer)}
                    </span>
                    <span style={{ color: "#5c6370" }}>
                      {c.mode === "event-bus" ? "⇢" : "→"}
                    </span>
                    <span
                      style={{
                        color: COLORS[c.consumer],
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {displayName(c.consumer)}
                    </span>
                  </span>
                  {tagline && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        marginLeft: 14,
                        fontSize: 11,
                        color: "#7a8095",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 220,
                      }}
                      data-testid={`contract-tagline-${c.id}`}
                    >
                      {tagline}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: "#7a8095", whiteSpace: "nowrap" }}>
                  {c.tests.length} test{c.tests.length === 1 ? "" : "s"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <hr />
      <div style={{ fontSize: 12 }}>
        <span className="stat"><b>{SERVICES.length}</b> svc</span>
        <span className="stat"><b>{ENDPOINTS.length}</b> ep</span>
        <span className="stat"><b>{CONTRACTS.length}</b> contract{CONTRACTS.length === 1 ? "" : "s"}</span>
        <span className="stat"><b>{TESTS.length}</b> test</span>
        <span className="stat"><b>{agg.killed + agg.survived}</b> mutants</span>
      </div>
      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        <kbd>drag</kbd> rotate · <kbd>scroll</kbd> zoom · <kbd>click</kbd> focus
      </div>
    </div>
  );
}

function SectionToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <h2
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      data-testid={`section-toggle-${label.toLowerCase()}`}
    >
      <span style={{ fontSize: 11, color: "#8b90a3", width: 10, display: "inline-block" }}>
        {open ? "▾" : "▸"}
      </span>
      {label}
    </h2>
  );
}
