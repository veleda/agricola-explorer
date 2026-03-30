import { useState, useCallback, useMemo, useEffect, useRef } from "react";

const API_BASE = "";

// ── Responsive hook ──────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Light theme palette (matches drafter & hands) ────────────────────────────
const T = {
  bg: "#faf9f7",
  surface: "#ffffff",
  surfaceAlt: "#f5f3f0",
  border: "#e8e4df",
  borderLight: "#f0ece7",
  text: "#1a1a1a",
  textSecondary: "#6b6560",
  textMuted: "#9e9790",
  accent: "#b45309",
  accentLight: "#fef3c7",
  accentBg: "#fffbeb",
  blue: "#2563eb",
  purple: "#7c3aed",
  green: "#059669",
  greenLight: "#ecfdf5",
  red: "#dc2626",
};

// ── Agricola scoring rules ───────────────────────────────────────────────────
const SCORING_TABLES = {
  fields:     [[0, -1], [2, 1], [3, 2], [4, 3], [5, 4]],
  pastures:   [[0, -1], [1, 1], [2, 2], [3, 3], [4, 4]],
  grain:      [[0, -1], [1, 1], [4, 2], [6, 3], [8, 4]],
  vegetables: [[0, -1], [1, 1], [2, 2], [3, 3], [4, 4]],
  sheep:      [[0, -1], [1, 1], [4, 2], [6, 3], [8, 4]],
  wildBoar:   [[0, -1], [1, 1], [3, 2], [5, 3], [7, 4]],
  cattle:     [[0, -1], [1, 1], [2, 2], [4, 3], [6, 4]],
};

function lookupScore(table, value) {
  if (value === "" || value === null || value === undefined) return null;
  const v = Number(value);
  if (isNaN(v) || v < 0) return null;
  const tiers = SCORING_TABLES[table];
  let pts = tiers[0][1];
  for (const [threshold, points] of tiers) {
    if (v >= threshold) pts = points;
    else break;
  }
  return pts;
}

// ── Default values: tiered categories default to 0 (= -1 point each) ────────
function defaultValues() {
  return {
    fields: 0, pastures: 0, grain: 0, vegetables: 0,
    sheep: 0, wildBoar: 0, cattle: 0,
    unusedSpaces: 13, familyMembers: 2,
  };
}

// ── Scoring category definitions ─────────────────────────────────────────────
const CATEGORIES = [
  { key: "fields",     label: "Fields",           group: "land",   type: "tiered", icon: "🌾", hint: "Plowed fields" },
  { key: "pastures",   label: "Pastures",         group: "land",   type: "tiered", icon: "🌿", hint: "Fenced pastures" },
  { key: "grain",      label: "Grain",            group: "crops",  type: "tiered", icon: "🌽", hint: "Planted & harvested" },
  { key: "vegetables", label: "Vegetables",       group: "crops",  type: "tiered", icon: "🥕", hint: "Planted & harvested" },
  { key: "sheep",      label: "Sheep",            group: "animals",type: "tiered", icon: "🐑", hint: "Total sheep" },
  { key: "wildBoar",   label: "Wild boar",        group: "animals",type: "tiered", icon: "🐗", hint: "Total wild boar" },
  { key: "cattle",     label: "Cattle",           group: "animals",type: "tiered", icon: "🐄", hint: "Total cattle" },
  { key: "unusedSpaces",    label: "Unused spaces",     group: "farmyard", type: "fixed", rate: -1, icon: "⬜", hint: "−1 each · starts at 13" },
  { key: "fencedStables",   label: "Fenced stables",    group: "farmyard", type: "fixed", rate: 1,  icon: "🏠", hint: "+1 per fenced stable" },
  { key: "clayRooms",       label: "Clay hut rooms",    group: "housing",  type: "fixed", rate: 1,  icon: "🧱", hint: "+1 per room" },
  { key: "stoneRooms",      label: "Stone house rooms", group: "housing",  type: "fixed", rate: 2,  icon: "🪨", hint: "+2 per room" },
  { key: "familyMembers",   label: "Family members",    group: "family",   type: "fixed", rate: 3,  icon: "👤", hint: "+3 each · starts at 2" },
  { key: "pointsForCards",  label: "Points for cards",  group: "cards",    type: "direct", icon: "🃏", hint: "Victory points on cards" },
  { key: "bonusPoints",     label: "Bonus points",      group: "cards",    type: "direct", icon: "⭐", hint: "Bonus point cards" },
  { key: "beggingCards",    label: "Begging cards",      group: "penalty",  type: "fixed", rate: -3, icon: "🪹", hint: "−3 per begging card" },
];

const GROUP_LABELS = {
  land: "Land", crops: "Crops", animals: "Animals",
  farmyard: "Farmyard", housing: "Housing", family: "Family", cards: "Cards", penalty: "Penalty",
};
const GROUP_ORDER = ["land", "crops", "animals", "farmyard", "housing", "family", "cards", "penalty"];

// Scoring reference table: [label, -1pt, 1pt, 2pt, 3pt, 4pt]
const SCORING_REF = [
  { label: "Fields",     cols: ["0–1", "2", "3", "4", "5+"] },
  { label: "Pastures",   cols: ["0",   "1", "2", "3", "4+"] },
  { label: "Grain",      cols: ["0",   "1–3", "4–5", "6–7", "8+"] },
  { label: "Vegetables", cols: ["0",   "1", "2", "3", "4+"] },
  { label: "Sheep",      cols: ["0",   "1–3", "4–5", "6–7", "8+"] },
  { label: "Wild boar",  cols: ["0",   "1–2", "3–4", "5–6", "7+"] },
  { label: "Cattle",     cols: ["0",   "1", "2–3", "4–5", "6+"] },
];
const POINT_HEADERS = ["-1", "1", "2", "3", "4"];

// ── API helpers ──────────────────────────────────────────────────────────────
async function saveScore(payload) {
  const res = await fetch(`${API_BASE}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function searchScores(q, page = 1) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", page);
  params.set("pageSize", 20);
  const res = await fetch(`${API_BASE}/api/scores?${params}`);
  return res.json();
}

async function deleteScore(scoreId, confirmName) {
  const res = await fetch(`${API_BASE}/api/scores/${scoreId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Delete failed");
  }
  return res.json();
}

// ── Points badge ─────────────────────────────────────────────────────────────
function PointsBadge({ pts }) {
  if (pts === null) return (
    <span style={{
      display: "inline-block", minWidth: 32, textAlign: "center",
      padding: "2px 8px", borderRadius: 6,
      background: T.surfaceAlt, color: T.textMuted, fontSize: 13, fontWeight: 500,
    }}>—</span>
  );
  const isNeg = pts < 0;
  const isZero = pts === 0;
  return (
    <span style={{
      display: "inline-block", minWidth: 32, textAlign: "center",
      padding: "2px 8px", borderRadius: 6, fontWeight: 700, fontSize: 13,
      background: isNeg ? "#fef2f2" : isZero ? T.surfaceAlt : T.greenLight,
      color: isNeg ? T.red : isZero ? T.textMuted : T.green,
    }}>
      {pts > 0 ? `+${pts}` : pts}
    </span>
  );
}

// ── Score Browser sub-component ──────────────────────────────────────────────
function ScoreBrowser({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { scoreId, scoreName } or null
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const doSearch = useCallback(async (q, pg) => {
    setLoading(true);
    try {
      const data = await searchScores(q, pg);
      setResults(data.scores || []);
      setTotalCount(data.total || 0);
      setPage(pg);
    } catch (e) {
      console.error("Score search failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => { doSearch("", 1); }, [doSearch]);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteScore(deleteConfirm.scoreId, deleteInput);
      setDeleteConfirm(null);
      setDeleteInput("");
      // Refresh the list
      doSearch(query, page);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    doSearch(query, 1);
  };

  const totalPages = Math.ceil(totalCount / 20);

  return (
    <div style={{
      background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`,
      padding: "20px 18px", marginTop: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Score Database</div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: T.textMuted, fontSize: 18,
          cursor: "pointer", padding: "2px 6px", lineHeight: 1,
        }}>×</button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search by player name or tournament..."
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: `1.5px solid ${T.border}`, background: T.bg,
            fontSize: 13, color: T.text, outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => e.target.style.borderColor = T.accent}
          onBlur={e => e.target.style.borderColor = T.border}
        />
        <button type="submit" style={{
          padding: "8px 16px", borderRadius: 8, border: "none",
          background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}>Search</button>
      </form>

      {/* Results */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: T.textMuted, fontSize: 13 }}>Loading...</div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: "center", padding: 20, color: T.textMuted, fontSize: 13 }}>
          {query ? "No scores found" : "No scores saved yet"}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
            {totalCount} score{totalCount !== 1 ? "s" : ""} found
          </div>
          {results.map((score) => (
            <div key={score.id} style={{
              borderRadius: 10, border: `1px solid ${T.borderLight}`,
              marginBottom: 8, overflow: "hidden",
              background: expanded === score.id ? T.surfaceAlt : T.surface,
              transition: "background 0.15s",
            }}>
              {/* Summary row */}
              <button onClick={() => setExpanded(expanded === score.id ? null : score.id)} style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", border: "none", background: "transparent",
                cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{score.name}</span>
                    {score.tournament && (
                      <span style={{ fontSize: 11, color: T.accent, fontWeight: 500 }}>{score.tournament}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                    {new Date(score.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    {score.tableNumber ? ` · Table ${score.tableNumber}` : ""}
                    {score.gameNumber ? ` · Game ${score.gameNumber}` : ""}
                  </div>
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800, letterSpacing: -0.5,
                  color: score.total >= 0 ? T.accent : T.red,
                }}>
                  {score.total}
                </div>
                <span style={{ fontSize: 12, color: T.textMuted, transition: "transform 0.2s", transform: expanded === score.id ? "rotate(90deg)" : "none" }}>▸</span>
              </button>

              {/* Expanded detail */}
              {expanded === score.id && (
                <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${T.borderLight}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", paddingTop: 10, fontSize: 12 }}>
                    {CATEGORIES.map(cat => {
                      const v = score.values?.[cat.key];
                      const pts = score.points?.[cat.key];
                      if (v === undefined && pts === undefined) return null;
                      return (
                        <div key={cat.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: T.textSecondary }}>{cat.icon} {cat.label}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: T.textMuted, fontSize: 11 }}>{v ?? "—"}</span>
                            <PointsBadge pts={pts ?? null} />
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Card Log */}
                  {score.cardLog && score.cardLog.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.borderLight}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {"\uD83C\uDCCF"} Card Log ({score.cardLog.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {score.cardLog.map((card, ci) => (
                          <div key={ci} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 8px", borderRadius: 6,
                            background: card.played ? T.greenLight : T.surfaceAlt,
                            fontSize: 11,
                          }}>
                            <span style={{ flexShrink: 0 }}>
                              {card.type === "Occupation" ? "\uD83D\uDC64" : "\uD83D\uDD27"}
                            </span>
                            <span style={{ fontWeight: 600, color: T.text, flex: 1, minWidth: 0 }}>
                              {card.name}
                            </span>
                            {card.played ? (
                              <span style={{ color: T.green, fontWeight: 600, whiteSpace: "nowrap" }}>
                                {"\u2713"}
                                {card.round ? ` R${card.round}` : ""}
                                {card.order ? ` #${card.order}` : ""}
                              </span>
                            ) : (
                              <span style={{ color: T.textMuted, fontSize: 10 }}>not played</span>
                            )}
                            {card.comment && (
                              <span style={{ color: T.textMuted, fontSize: 10, fontStyle: "italic", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                title={card.comment}>
                                {card.comment}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
                        {score.cardLog.filter(c => c.played).length} of {score.cardLog.length} played
                      </div>
                    </div>
                  )}

                  {/* Delete button */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.borderLight}`, display: "flex", justifyContent: "flex-end" }}>
                    {deleteConfirm?.scoreId === score.id ? (
                      <div style={{ width: "100%" }}>
                        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 6 }}>
                          Type the player name "{score.name}" to confirm deletion:
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            type="text" value={deleteInput}
                            onChange={e => { setDeleteInput(e.target.value); setDeleteError(""); }}
                            placeholder={score.name}
                            autoFocus
                            style={{
                              flex: 1, padding: "6px 10px", borderRadius: 6,
                              border: `1.5px solid ${deleteError ? T.red : T.border}`,
                              background: T.bg, fontSize: 12, color: T.text, outline: "none",
                            }}
                            onKeyDown={e => { if (e.key === "Enter") handleDeleteConfirm(); }}
                          />
                          <button onClick={handleDeleteConfirm} disabled={deleting || !deleteInput.trim()}
                            style={{
                              padding: "6px 12px", borderRadius: 6, border: "none",
                              background: T.red, color: "#fff", fontSize: 12, fontWeight: 600,
                              cursor: deleting || !deleteInput.trim() ? "default" : "pointer",
                              opacity: deleting || !deleteInput.trim() ? 0.5 : 1,
                            }}>{deleting ? "..." : "Delete"}</button>
                          <button onClick={() => { setDeleteConfirm(null); setDeleteInput(""); setDeleteError(""); }}
                            style={{
                              padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                              background: "transparent", color: T.textMuted, fontSize: 12,
                              cursor: "pointer",
                            }}>Cancel</button>
                        </div>
                        {deleteError && (
                          <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{deleteError}</div>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm({ scoreId: score.id, scoreName: score.name })}
                        style={{
                          padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.red}33`,
                          background: "transparent", color: T.red, fontSize: 11,
                          cursor: "pointer", opacity: 0.7,
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                      >Delete score</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              <button disabled={page <= 1} onClick={() => doSearch(query, page - 1)}
                style={{
                  padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
                  background: T.surface, color: page <= 1 ? T.borderLight : T.textSecondary,
                  fontSize: 12, cursor: page <= 1 ? "default" : "pointer",
                }}>Prev</button>
              <span style={{ fontSize: 12, color: T.textMuted, padding: "4px 0" }}>
                {page} / {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => doSearch(query, page + 1)}
                style={{
                  padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
                  background: T.surface, color: page >= totalPages ? T.borderLight : T.textSecondary,
                  fontSize: 12, cursor: page >= totalPages ? "default" : "pointer",
                }}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Backup / Restore */}
      <BackupRestore onRestored={() => doSearch(query, 1)} />
    </div>
  );
}

// ── Backup / Restore sub-component ───────────────────────────────────────────
function BackupRestore({ onRestored }) {
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [message, setMessage] = useState(null); // {text, type: "ok" | "err"}
  const restoreInputRef = useRef(null);

  const handleBackup = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/backup`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const d = new Date().toISOString().slice(0, 10);
      a.download = `agricola-backup-${d}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: `Backup downloaded (${data.drafts.length} drafts, ${data.scores.length} scores)`, type: "ok" });
      setTimeout(() => setMessage(null), 5000);
    } catch (err) {
      setMessage({ text: "Backup failed: " + err.message, type: "err" });
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreBusy(true);
    setMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch(`${API_BASE}/api/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Restore failed");
      }
      const result = await res.json();
      setMessage({ text: `Restored ${result.draftsAdded} drafts, ${result.scoresAdded} scores`, type: "ok" });
      onRestored?.();
    } catch (err) {
      setMessage({ text: "Restore failed: " + err.message, type: "err" });
    } finally {
      setRestoreBusy(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.borderLight}` }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={handleBackup}
          style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.surface, color: T.textSecondary, fontSize: 12,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          }}>
          {"\u2B07"} Export backup
        </button>
        <input ref={restoreInputRef} type="file" accept=".json" onChange={handleRestore} style={{ display: "none" }} />
        <button onClick={() => restoreInputRef.current?.click()} disabled={restoreBusy}
          style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.surface, color: T.textSecondary, fontSize: 12,
            cursor: restoreBusy ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 4,
            opacity: restoreBusy ? 0.5 : 1,
          }}>
          {"\u2B06"} Import backup
        </button>
        <span style={{ fontSize: 10, color: T.textMuted }}>Scores & drafts</span>
      </div>
      {message && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 6, fontSize: 11,
          background: message.type === "ok" ? T.greenLight : "#fef2f2",
          color: message.type === "ok" ? T.green : T.red,
        }}>
          {message.text}
        </div>
      )}
    </div>
  );
}

// ── Stepper button for mobile ────────────────────────────────────────────────
function StepperBtn({ direction, onClick }) {
  const isMinus = direction === "minus";
  return (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 10,
      border: `1.5px solid ${T.border}`,
      background: T.surface, color: isMinus ? T.red : T.green,
      fontSize: 20, fontWeight: 700, lineHeight: 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", transition: "all 0.12s",
      flexShrink: 0, padding: 0, WebkitTapHighlightColor: "transparent",
    }}
      onTouchStart={e => { e.currentTarget.style.background = isMinus ? "#fef2f2" : T.greenLight; }}
      onTouchEnd={e => { e.currentTarget.style.background = T.surface; }}
      onMouseDown={e => { e.currentTarget.style.background = isMinus ? "#fef2f2" : T.greenLight; }}
      onMouseUp={e => { e.currentTarget.style.background = T.surface; }}
      onMouseLeave={e => { e.currentTarget.style.background = T.surface; }}
    >
      {isMinus ? "−" : "+"}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ScoreSheet({ allCards = [] }) {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [tournament, setTournament] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [gameNumber, setGameNumber] = useState("");
  const [startingPosition, setStartingPosition] = useState("");
  const [values, setValues] = useState(defaultValues);
  const [showRef, setShowRef] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // {type: "ok"|"err", text}
  const [showBrowser, setShowBrowser] = useState(false);

  // ── Card log state ──────────────────────────────────────────────────────
  const [showCardLog, setShowCardLog] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [taggedCards, setTaggedCards] = useState([]); // [{id, name, type, played, order, round, comment}]

  const cardSearchResults = useMemo(() => {
    if (!cardSearch.trim() || cardSearch.length < 2) return [];
    const q = cardSearch.toLowerCase();
    const taggedIds = new Set(taggedCards.map(c => c.id));
    return allCards
      .filter(c => !taggedIds.has(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [cardSearch, allCards, taggedCards]);

  const addCardToLog = useCallback((card) => {
    setTaggedCards(prev => [...prev, {
      id: card.id, name: card.name, type: card.type || "",
      played: false, order: null, round: null, comment: "",
    }]);
    setCardSearch("");
  }, []);

  const removeCardFromLog = useCallback((cardId) => {
    setTaggedCards(prev => prev.filter(c => c.id !== cardId));
  }, []);

  const updateTaggedCard = useCallback((cardId, field, value) => {
    setTaggedCards(prev => prev.map(c => c.id === cardId ? { ...c, [field]: value } : c));
  }, []);

  // ── OCR / camera state ───────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrResults, setOcrResults] = useState(null); // [{card, ocrLine, confidence, selected, correctedCard}]

  const handlePhotoCapture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    setOcrProgress("Uploading photo...");
    try {
      // Convert file to base64 data-URI
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setOcrProgress("Identifying cards...");

      const resp = await fetch(`${API_BASE}/api/ocr-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: b64 }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${resp.status}`);
      }

      const data = await resp.json();
      const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));

      setOcrResults((data.cards || []).map(r => ({
        card: cardById[r.cardId] || { id: r.cardId, name: r.name, type: "" },
        ocrLine: r.ocrLine,
        confidence: r.confidence,
        selected: r.confidence >= 0.5,
        correctedCard: null,
        searchText: "",
      })));
      setOcrProgress("");
    } catch (err) {
      console.error("OCR failed:", err);
      setOcrProgress(err.message || "OCR failed — try a clearer photo");
      setTimeout(() => setOcrProgress(""), 4000);
    } finally {
      setOcrBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [allCards]);

  const updateOcrResult = useCallback((idx, field, value) => {
    setOcrResults(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }, []);

  const ocrCorrectionResults = useCallback((searchText) => {
    if (!searchText || searchText.length < 2) return [];
    const q = searchText.toLowerCase();
    return allCards.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [allCards]);

  const confirmOcrResults = useCallback(() => {
    if (!ocrResults) return;
    const taggedIds = new Set(taggedCards.map(c => c.id));
    const toAdd = ocrResults
      .filter(r => r.selected)
      .map(r => r.correctedCard || r.card)
      .filter(c => !taggedIds.has(c.id));
    setTaggedCards(prev => [
      ...prev,
      ...toAdd.map(c => ({
        id: c.id, name: c.name, type: c.type || "",
        played: false, order: null, round: null, comment: "",
      })),
    ]);
    setOcrResults(null);
  }, [ocrResults, taggedCards]);

  const setValue = useCallback((key, raw) => {
    if (raw === "") {
      setValues(v => ({ ...v, [key]: "" }));
      return;
    }
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= 0) {
      setValues(v => ({ ...v, [key]: n }));
    }
  }, []);

  const stepValue = useCallback((key, delta) => {
    setValues(v => {
      const cur = typeof v[key] === "number" ? v[key] : 0;
      const next = cur + delta;
      return { ...v, [key]: next >= 0 ? next : 0 };
    });
  }, []);

  // Compute points for each row
  const points = useMemo(() => {
    const p = {};
    for (const cat of CATEGORIES) {
      const raw = values[cat.key];
      if (raw === "" || raw === undefined || raw === null) {
        p[cat.key] = null;
        continue;
      }
      const v = Number(raw);
      if (isNaN(v)) { p[cat.key] = null; continue; }

      if (cat.type === "tiered") {
        p[cat.key] = lookupScore(cat.key, v);
      } else if (cat.type === "fixed") {
        p[cat.key] = v * cat.rate;
      } else {
        p[cat.key] = v;
      }
    }
    return p;
  }, [values]);

  const total = useMemo(() => {
    let sum = 0;
    let anyFilled = false;
    for (const cat of CATEGORIES) {
      if (points[cat.key] !== null) {
        sum += points[cat.key];
        anyFilled = true;
      }
    }
    return anyFilled ? sum : null;
  }, [points]);

  const handleReset = useCallback(() => {
    setValues(defaultValues());
    setName("");
    setTournament("");
    setTableNumber("");
    setGameNumber("");
    setStartingPosition("");
    setTaggedCards([]);
    setCardSearch("");
    setShowCardLog(false);
    setOcrResults(null);
    setOcrBusy(false);
    setOcrProgress("");
    setOcrCardCount(7);
    setSaveMsg(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setSaveMsg({ type: "err", text: "Player name is required" });
      return;
    }
    if (total === null) {
      setSaveMsg({ type: "err", text: "Fill in at least one scoring field" });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        name: name.trim(),
        tournament: tournament.trim() || null,
        tableNumber: tableNumber.trim() || null,
        gameNumber: gameNumber.trim() || null,
        startingPosition: startingPosition.trim() || null,
        values,
        points,
        total,
        cardLog: taggedCards.length > 0 ? taggedCards : null,
      };
      const res = await saveScore(payload);
      if (res.error) {
        setSaveMsg({ type: "err", text: res.error });
      } else {
        setSaveMsg({ type: "ok", text: "Score saved!" });
      }
    } catch (e) {
      setSaveMsg({ type: "err", text: "Failed to save — is the server running?" });
    } finally {
      setSaving(false);
    }
  }, [name, tournament, tableNumber, gameNumber, startingPosition, values, points, total, taggedCards]);

  // Group categories
  const grouped = useMemo(() => {
    const map = {};
    for (const cat of CATEGORIES) {
      if (!map[cat.group]) map[cat.group] = [];
      map[cat.group].push(cat);
    }
    return GROUP_ORDER.map(g => ({ group: g, label: GROUP_LABELS[g], items: map[g] || [] }));
  }, []);

  return (
    <div style={{
      height: "100%", overflow: "auto",
      background: T.bg, fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div style={{
        maxWidth: 520, margin: "0 auto", padding: "32px 20px 48px",
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: T.text }}>
            Score Sheet
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
            Enter your counts — points are calculated automatically
          </div>
        </div>

        {/* ── Name / Tournament / Table & Game ────────────────────────── */}
        <div style={{
          background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`,
          padding: "16px 18px", marginBottom: 16,
        }}>
          {/* Player name */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Player name <span style={{ color: T.red }}>*</span>
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: `1.5px solid ${name ? T.border : T.accent + "60"}`,
                background: T.bg, fontSize: 14, color: T.text,
                outline: "none", transition: "border-color 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = name ? T.border : T.accent + "60"}
            />
          </div>

          {/* Tournament */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Tournament <span style={{ fontSize: 10, fontWeight: 400, color: T.textMuted }}>(optional)</span>
            </label>
            <input
              type="text" value={tournament} onChange={e => setTournament(e.target.value)}
              placeholder="e.g. Friday Night Agricola"
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 8,
                border: `1.5px solid ${T.border}`,
                background: T.bg, fontSize: 14, color: T.text,
                outline: "none", transition: "border-color 0.15s",
                boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>

          {/* Table number + Game number + Starting position — side by side */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Table #
              </label>
              <input
                type="text" value={tableNumber} onChange={e => setTableNumber(e.target.value)}
                placeholder="—"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 8,
                  border: `1.5px solid ${T.border}`, background: T.bg,
                  fontSize: 13, color: T.text, outline: "none",
                  boxSizing: "border-box", transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Game #
              </label>
              <input
                type="text" value={gameNumber} onChange={e => setGameNumber(e.target.value)}
                placeholder="—"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 8,
                  border: `1.5px solid ${T.border}`, background: T.bg,
                  fontSize: 13, color: T.text, outline: "none",
                  boxSizing: "border-box", transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: T.textMuted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Start pos.
              </label>
              <input
                type="text" value={startingPosition} onChange={e => setStartingPosition(e.target.value)}
                placeholder="—"
                style={{
                  width: "100%", padding: "6px 10px", borderRadius: 8,
                  border: `1.5px solid ${T.border}`, background: T.bg,
                  fontSize: 13, color: T.text, outline: "none",
                  boxSizing: "border-box", transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </div>
          </div>
        </div>

        {/* ── Scoring Reference toggle ────────────────────────────────── */}
        <button onClick={() => setShowRef(r => !r)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", color: T.accent,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            padding: "4px 0", marginBottom: showRef ? 8 : 16,
          }}>
          <span style={{ transition: "transform 0.2s", transform: showRef ? "rotate(90deg)" : "rotate(0)", display: "inline-block" }}>▸</span>
          Scoring reference
        </button>

        {showRef && (
          <div style={{
            background: T.accentBg, borderRadius: 10, border: `1px solid ${T.accentLight}`,
            padding: "12px 14px", marginBottom: 16, fontSize: 11, overflowX: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 6px", color: T.accent, fontWeight: 700, borderBottom: `1px solid ${T.accentLight}` }}>Scoring</th>
                  {POINT_HEADERS.map(h => (
                    <th key={h} style={{
                      textAlign: "center", padding: "4px 6px", fontWeight: 700,
                      borderBottom: `1px solid ${T.accentLight}`,
                      color: h === "-1" ? T.red : T.green,
                      minWidth: 36,
                    }}>{h} pt</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCORING_REF.map((r, i) => (
                  <tr key={r.label} style={{ background: i % 2 === 0 ? "transparent" : T.accentLight + "40" }}>
                    <td style={{ padding: "3px 6px", fontWeight: 600, color: T.accent }}>{r.label}</td>
                    {r.cols.map((c, j) => (
                      <td key={j} style={{ textAlign: "center", padding: "3px 6px", color: T.textSecondary }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.accentLight}`, color: T.textSecondary, lineHeight: 1.6 }}>
              −1 per unused space · +1 per fenced stable · +1 per clay room · +2 per stone room · +3 per family member
            </div>
          </div>
        )}

        {/* ── Category groups ─────────────────────────────────────────── */}
        {grouped.map(({ group, label, items }) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1,
              color: T.textMuted, padding: "6px 4px 4px",
            }}>
              {label}
            </div>
            <div style={{
              background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`,
              overflow: "hidden",
            }}>
              {items.map((cat, i) => (
                <div key={cat.key} style={{
                  padding: isMobile ? "8px 10px" : "10px 16px",
                  borderTop: i > 0 ? `1px solid ${T.borderLight}` : "none",
                }}>
                  {isMobile ? (
                    /* ── Mobile: image | label + stepper | tall score badge ── */
                    <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                      {/* Left: large emoji as placeholder image */}
                      <div style={{
                        width: 56, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 36, lineHeight: 1,
                        background: T.surfaceAlt, borderRadius: 10,
                      }}>
                        {cat.image
                          ? <img src={cat.image} alt={cat.label} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6 }} />
                          : cat.icon}
                      </div>
                      {/* Centre: label + stepper row */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.1 }}>{cat.label}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <StepperBtn direction="minus" onClick={() => stepValue(cat.key, -1)} />
                          <input
                            type="text" inputMode="numeric" pattern="[0-9]*"
                            value={values[cat.key] ?? ""}
                            onChange={e => {
                              const v = e.target.value.replace(/[^0-9]/g, "");
                              setValue(cat.key, v);
                            }}
                            placeholder="0"
                            style={{
                              width: 48, minWidth: 36, textAlign: "center",
                              fontSize: 24, fontWeight: 800, color: T.text, lineHeight: 1,
                              border: "none", borderBottom: `2px solid transparent`,
                              background: "transparent", outline: "none",
                              padding: "2px 0", borderRadius: 0,
                            }}
                            onFocus={e => { e.target.style.borderBottomColor = T.accent; e.target.select(); }}
                            onBlur={e => e.target.style.borderBottomColor = "transparent"}
                          />
                          <StepperBtn direction="plus" onClick={() => stepValue(cat.key, 1)} />
                        </div>
                      </div>
                      {/* Right: tall score badge filling the row */}
                      {(() => {
                        const pts = points[cat.key];
                        const isNeg = pts !== null && pts < 0;
                        const isZero = pts === 0;
                        const isNull = pts === null;
                        return (
                          <div style={{
                            width: 48, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: 10, fontWeight: 800,
                            fontSize: isNull ? 16 : 20,
                            background: isNull ? T.surfaceAlt : isNeg ? "#fef2f2" : isZero ? T.surfaceAlt : T.greenLight,
                            color: isNull ? T.textMuted : isNeg ? T.red : isZero ? T.textMuted : T.green,
                          }}>
                            {isNull ? "—" : pts > 0 ? `+${pts}` : pts}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* ── Desktop: inline layout with stepper + number input ── */
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: "center" }}>{cat.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>{cat.label}</div>
                        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{cat.hint}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <StepperBtn direction="minus" onClick={() => stepValue(cat.key, -1)} />
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*"
                          value={values[cat.key] ?? ""}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, "");
                            setValue(cat.key, v);
                          }}
                          placeholder="0"
                          style={{
                            width: 48, padding: "6px 4px", borderRadius: 8, textAlign: "center",
                            border: `1.5px solid ${T.border}`, background: T.bg,
                            fontSize: 15, fontWeight: 600, color: T.text,
                            outline: "none", transition: "border-color 0.15s",
                          }}
                          onFocus={e => { e.target.style.borderColor = T.accent; e.target.select(); }}
                          onBlur={e => e.target.style.borderColor = T.border}
                        />
                        <StepperBtn direction="plus" onClick={() => stepValue(cat.key, 1)} />
                      </div>
                      <PointsBadge pts={points[cat.key]} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* ── Total ───────────────────────────────────────────────────── */}
        <div style={{
          background: T.surface, borderRadius: 14, border: `2px solid ${T.accent}`,
          padding: "16px 20px", marginTop: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Total</div>
            {name && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                {name}
                {tournament ? ` · ${tournament}` : ""}
                {tableNumber ? ` · T${tableNumber}` : ""}
                {gameNumber ? ` · G${gameNumber}` : ""}
                {startingPosition ? ` · P${startingPosition}` : ""}
              </div>
            )}
          </div>
          <div style={{
            fontSize: 32, fontWeight: 800, letterSpacing: -1,
            color: total === null ? T.textMuted : total >= 0 ? T.accent : T.red,
          }}>
            {total === null ? "—" : total}
          </div>
        </div>

        {/* ── Card Log ────────────────────────────────────────────────── */}
        <div style={{ marginTop: 24, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <button onClick={() => setShowCardLog(s => !s)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 10,
              border: `1px solid ${showCardLog ? T.purple + "44" : T.border}`,
              background: showCardLog ? T.purple + "0a" : T.surface,
              color: showCardLog ? T.purple : T.textSecondary,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <span style={{ fontSize: 16 }}>{"\uD83C\uDCCF"}</span>
            Card Log {taggedCards.length > 0 ? `(${taggedCards.length})` : ""}
            <span style={{ fontSize: 12, marginLeft: 4 }}>{showCardLog ? "\u25B2" : "\u25BC"}</span>
          </button>

          {showCardLog && (
            <div style={{ marginTop: 12 }}>
              {/* Search input + camera button */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={e => setCardSearch(e.target.value)}
                    placeholder="Search for a card..."
                    style={{
                      width: "100%", padding: "10px 14px", borderRadius: 8,
                      border: `1px solid ${T.border}`, background: T.surface,
                      fontSize: 13, color: T.text, outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={e => e.target.style.borderColor = T.purple}
                    onBlur={e => { setTimeout(() => e.target.style.borderColor = T.border, 200); }}
                  />
                {/* Search results dropdown */}
                {cardSearchResults.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.1)", marginTop: 4, overflow: "hidden",
                  }}>
                    {cardSearchResults.map(c => (
                      <button key={c.id}
                        onMouseDown={(e) => { e.preventDefault(); addCardToLog(c); }}
                        style={{
                          width: "100%", padding: "8px 14px", border: "none",
                          background: "transparent", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 8,
                          textAlign: "left", fontSize: 13, color: T.text,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{ fontSize: 14 }}>
                          {c.type === "Occupation" ? "\uD83D\uDC64" : "\uD83D\uDD27"}
                        </span>
                        <span style={{ fontWeight: 500 }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>{c.deck}</span>
                      </button>
                    ))}
                  </div>
                )}
                </div>

                {/* Camera button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={ocrBusy}
                  title="Scan cards from photo"
                  style={{
                    height: 44, flexShrink: 0, borderRadius: 8,
                    border: `1px solid ${T.purple + "44"}`,
                    background: T.purple + "0a",
                    color: T.purple, fontSize: 13, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 4, padding: "0 12px",
                    cursor: ocrBusy ? "wait" : "pointer",
                    opacity: ocrBusy ? 0.5 : 1,
                    whiteSpace: "nowrap",
                  }}>
                  {"\uD83D\uDCF7"} Scan
                </button>
              </div>

              {/* OCR progress indicator */}
              {ocrBusy && (
                <div style={{
                  textAlign: "center", padding: "10px 0", fontSize: 12,
                  color: T.purple, fontWeight: 500,
                }}>
                  {ocrProgress || "Processing..."}
                </div>
              )}

              {/* OCR results review modal */}
              {ocrResults && !ocrBusy && (
                <div style={{
                  padding: 14, borderRadius: 10, marginBottom: 12,
                  border: `1.5px solid ${T.purple + "44"}`,
                  background: T.purple + "06",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.purple, marginBottom: 8 }}>
                    {"\uD83D\uDCF7"} Recognized Cards
                  </div>
                  {ocrResults.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>
                      No cards recognized. Try a clearer photo with card names visible.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {ocrResults.map((r, idx) => {
                        const displayCard = r.correctedCard || r.card;
                        const confPct = Math.round(r.confidence * 100);
                        return (
                          <div key={idx} style={{
                            padding: "8px 10px", borderRadius: 8,
                            background: r.selected ? T.surface : T.surfaceAlt,
                            border: `1px solid ${r.selected ? T.purple + "44" : T.border}`,
                            opacity: r.selected ? 1 : 0.6,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {/* Checkbox */}
                              <input type="checkbox" checked={r.selected}
                                onChange={e => updateOcrResult(idx, "selected", e.target.checked)}
                                style={{ accentColor: T.purple, flexShrink: 0 }}
                              />
                              {/* Card info */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                                  {displayCard.type === "Occupation" ? "\uD83D\uDC64" : "\uD83D\uDD27"} {displayCard.name}
                                </div>
                                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                                  Read: "{r.ocrLine}" · {confPct}% match
                                </div>
                              </div>
                              {/* Confidence indicator */}
                              <div style={{
                                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                background: confPct >= 70 ? T.greenLight : confPct >= 50 ? T.accentLight : "#fef2f2",
                                color: confPct >= 70 ? T.green : confPct >= 50 ? T.accent : T.red,
                              }}>
                                {confPct >= 70 ? "\u2713" : confPct >= 50 ? "?" : "!"}
                              </div>
                            </div>
                            {/* Inline correction: small search to swap the card */}
                            <div style={{ marginTop: 6 }}>
                              <input
                                type="text"
                                value={r.searchText || ""}
                                onChange={e => updateOcrResult(idx, "searchText", e.target.value)}
                                placeholder="Wrong card? Type to correct..."
                                style={{
                                  width: "100%", padding: "5px 10px", borderRadius: 6,
                                  border: `1px solid ${T.border}`, background: T.bg,
                                  fontSize: 11, color: T.text, outline: "none", boxSizing: "border-box",
                                }}
                              />
                              {r.searchText && r.searchText.length >= 2 && (
                                <div style={{
                                  marginTop: 2, background: T.surface, border: `1px solid ${T.border}`,
                                  borderRadius: 6, overflow: "hidden", maxHeight: 150, overflowY: "auto",
                                }}>
                                  {ocrCorrectionResults(r.searchText).map(c => (
                                    <button key={c.id}
                                      onClick={() => {
                                        updateOcrResult(idx, "correctedCard", c);
                                        updateOcrResult(idx, "searchText", "");
                                        updateOcrResult(idx, "selected", true);
                                      }}
                                      style={{
                                        width: "100%", padding: "6px 10px", border: "none",
                                        background: "transparent", cursor: "pointer",
                                        display: "flex", alignItems: "center", gap: 6,
                                        textAlign: "left", fontSize: 12, color: T.text,
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                    >
                                      <span>{c.type === "Occupation" ? "\uD83D\uDC64" : "\uD83D\uDD27"}</span>
                                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Confirm / Cancel buttons */}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={confirmOcrResults}
                      disabled={!ocrResults.some(r => r.selected)}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                        background: T.purple, color: "#fff", fontSize: 13, fontWeight: 600,
                        cursor: "pointer", opacity: ocrResults.some(r => r.selected) ? 1 : 0.5,
                      }}>
                      Add {ocrResults.filter(r => r.selected).length} card{ocrResults.filter(r => r.selected).length !== 1 ? "s" : ""}
                    </button>
                    <button onClick={() => setOcrResults(null)}
                      style={{
                        padding: "8px 16px", borderRadius: 8,
                        border: `1px solid ${T.border}`, background: T.surface,
                        color: T.textSecondary, fontSize: 13, cursor: "pointer",
                      }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Tagged cards list */}
              {taggedCards.length === 0 ? (
                <div style={{ textAlign: "center", padding: 16, color: T.textMuted, fontSize: 12 }}>
                  Search and add the cards you picked in this game.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {taggedCards.map((card, idx) => (
                    <div key={card.id} style={{
                      padding: "10px 12px", borderRadius: 10,
                      border: `1px solid ${card.played ? T.green + "44" : T.border}`,
                      background: card.played ? T.greenLight : T.surface,
                    }}>
                      {/* Card header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 14 }}>
                          {card.type === "Occupation" ? "\uD83D\uDC64" : "\uD83D\uDD27"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1 }}>{card.name}</span>
                        <button onClick={() => removeCardFromLog(card.id)}
                          style={{
                            background: "none", border: "none", fontSize: 14,
                            color: T.textMuted, cursor: "pointer", padding: "2px 6px",
                          }}>{"\u2715"}</button>
                      </div>

                      {/* Controls row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {/* Played toggle */}
                        <button onClick={() => updateTaggedCard(card.id, "played", !card.played)}
                          style={{
                            padding: "4px 12px", borderRadius: 6,
                            border: `1px solid ${card.played ? T.green : T.border}`,
                            background: card.played ? T.green : T.surface,
                            color: card.played ? "#fff" : T.textMuted,
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}>
                          {card.played ? "\u2713 Played" : "Not played"}
                        </button>

                        {/* Order */}
                        {card.played && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 10, color: T.textMuted }}>Order:</span>
                            <input type="number" min={1} max={20}
                              value={card.order || ""}
                              onChange={e => updateTaggedCard(card.id, "order", e.target.value ? parseInt(e.target.value) : null)}
                              style={{
                                width: 44, padding: "3px 6px", borderRadius: 6,
                                border: `1px solid ${T.border}`, background: T.surface,
                                fontSize: 12, color: T.text, textAlign: "center", outline: "none",
                              }}
                            />
                          </div>
                        )}

                        {/* Round */}
                        {card.played && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 10, color: T.textMuted }}>Round:</span>
                            <input type="number" min={1} max={14}
                              value={card.round || ""}
                              onChange={e => updateTaggedCard(card.id, "round", e.target.value ? parseInt(e.target.value) : null)}
                              style={{
                                width: 44, padding: "3px 6px", borderRadius: 6,
                                border: `1px solid ${T.border}`, background: T.surface,
                                fontSize: 12, color: T.text, textAlign: "center", outline: "none",
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Comment */}
                      {card.played && (
                        <input type="text"
                          value={card.comment}
                          onChange={e => updateTaggedCard(card.id, "comment", e.target.value)}
                          placeholder="Note (optional)..."
                          style={{
                            width: "100%", marginTop: 6, padding: "5px 10px", borderRadius: 6,
                            border: `1px solid ${T.border}`, background: T.surface,
                            fontSize: 11, color: T.text, outline: "none", boxSizing: "border-box",
                          }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Summary */}
                  <div style={{ fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: 4 }}>
                    {taggedCards.filter(c => c.played).length} of {taggedCards.length} cards played
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Save + Reset + Browse buttons ───────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={handleSave} disabled={saving}
            style={{
              padding: "9px 24px", borderRadius: 8, border: "none",
              background: T.accent, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1, transition: "opacity 0.15s",
            }}>
            {saving ? "Saving..." : "Save Score"}
          </button>
          <button onClick={handleReset}
            style={{
              padding: "9px 24px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface,
              color: T.textSecondary, fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.target.style.background = T.surfaceAlt; }}
            onMouseLeave={e => { e.target.style.background = T.surface; }}
          >
            Reset
          </button>
          <button onClick={() => setShowBrowser(b => !b)}
            style={{
              padding: "9px 24px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: showBrowser ? T.accentBg : T.surface,
              color: showBrowser ? T.accent : T.textSecondary,
              fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!showBrowser) e.target.style.background = T.surfaceAlt; }}
            onMouseLeave={e => { if (!showBrowser) e.target.style.background = T.surface; }}
          >
            Browse Scores
          </button>
        </div>

        {/* Save feedback */}
        {saveMsg && (
          <div style={{
            textAlign: "center", marginTop: 10, fontSize: 12, fontWeight: 500,
            color: saveMsg.type === "ok" ? T.green : T.red,
          }}>
            {saveMsg.text}
          </div>
        )}

        {/* ── Score Browser ───────────────────────────────────────────── */}
        {showBrowser && <ScoreBrowser onClose={() => setShowBrowser(false)} />}

      </div>
    </div>
  );
}
