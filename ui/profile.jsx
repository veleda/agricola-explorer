import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, ChangePasswordForm } from "./auth.jsx";

const API_BASE = "";

const T = {
  bg: "#faf9f7", surface: "#ffffff", surfaceAlt: "#f5f3f0",
  border: "#e8e4df", borderLight: "#f0ece7",
  text: "#1a1a1a", textSecondary: "#6b6560", textMuted: "#9e9790",
  accent: "#b45309", accentLight: "#fef3c7", accentBg: "#fffbeb",
  blue: "#2563eb", green: "#059669", greenLight: "#ecfdf5",
  red: "#dc2626", purple: "#7c3aed",
};

const CATEGORY_LABELS = {
  fields: "Fields", pastures: "Pastures", grain: "Grain", vegetables: "Vegetables",
  sheep: "Sheep", wildBoar: "Wild boar", cattle: "Cattle", unusedSpaces: "Unused spaces",
  fencedStables: "Fenced stables", clayRooms: "Clay rooms", stoneRooms: "Stone rooms",
  familyMembers: "Family", pointsForCards: "Cards", bonusPoints: "Bonus", beggingCards: "Begging",
};

const CATEGORY_ICONS = {
  fields: "🌾", pastures: "🌿", grain: "🌽", vegetables: "🥕",
  sheep: "🐑", wildBoar: "🐗", cattle: "🐄", unusedSpaces: "⬜",
  fencedStables: "🏠", clayRooms: "🧱", stoneRooms: "🪨",
  familyMembers: "👤", pointsForCards: "🃏", bonusPoints: "⭐", beggingCards: "🪹",
};

function SectionCard({ title, children, icon }) {
  return (
    <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {icon && <span style={{ marginRight: 6 }}>{icon}</span>}{title}
      </div>
      {children}
    </div>
  );
}

/* ── Favourite card row with inline note editing ── */
function FavCardRow({ fav, card, onUpdate, onRemove, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fav.notes || "");

  const save = () => { onUpdate(draft.trim()); setEditing(false); };

  return (
    <div style={{
      background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
      padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: T.red, fontSize: 16, cursor: "pointer" }} onClick={onRemove} title="Remove">{"❤️"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: onNavigate ? T.accent : T.text, cursor: onNavigate ? "pointer" : "default", textDecoration: onNavigate ? "none" : "none" }}
            onClick={() => onNavigate && onNavigate(fav.cardId)}>
            {card?.name || fav.cardId}
          </div>
          {card && (
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
              {card.type} · {card.deck}
            </div>
          )}
        </div>
        <button onClick={() => { setDraft(fav.notes || ""); setEditing(!editing); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.textMuted, padding: 4 }}
          title={fav.notes ? "Edit note" : "Add note"}>
          {fav.notes ? "✏️" : "📝"}
        </button>
      </div>
      {editing ? (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Add a note about this card…"
            onKeyDown={e => e.key === "Enter" && save()}
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
              fontSize: 12, outline: "none", fontFamily: "inherit",
            }} autoFocus />
          <button onClick={save} style={{
            padding: "6px 12px", borderRadius: 6, border: "none",
            background: T.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Save</button>
        </div>
      ) : fav.notes ? (
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6, paddingLeft: 28, fontStyle: "italic" }}>
          {fav.notes}
        </div>
      ) : null}
    </div>
  );
}

/* ── Combo row with inline note editing ── */
function ComboRow({ combo, cardById, onUpdateNotes, onRemove, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(combo.notes || "");

  const save = () => { onUpdateNotes(draft.trim()); setEditing(false); };

  return (
    <div style={{
      background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
      padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: T.accent, fontSize: 14 }}>🔗</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {(combo.cardIds || []).map((id, i) => (
              <span key={id}>
                {i > 0 && " + "}
                <span style={{ color: onNavigate ? T.accent : T.text, cursor: onNavigate ? "pointer" : "default" }}
                  onClick={() => onNavigate && onNavigate(id)}>
                  {cardById[id]?.name || id}
                </span>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
            {combo.cardIds.length} cards · {new Date(combo.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </div>
        </div>
        <button onClick={() => { setDraft(combo.notes || ""); setEditing(!editing); }}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.textMuted, padding: 4 }}
          title={combo.notes ? "Edit note" : "Add note"}>
          {combo.notes ? "✏️" : "📝"}
        </button>
        <button onClick={onRemove}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.textMuted, padding: 4 }}
          title="Remove combo">🗑️</button>
      </div>
      {editing ? (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Add a note about this combo…"
            onKeyDown={e => e.key === "Enter" && save()}
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
              fontSize: 12, outline: "none", fontFamily: "inherit",
            }} autoFocus />
          <button onClick={save} style={{
            padding: "6px 12px", borderRadius: 6, border: "none",
            background: T.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}>Save</button>
        </div>
      ) : combo.notes ? (
        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6, paddingLeft: 26, fontStyle: "italic" }}>
          {combo.notes}
        </div>
      ) : null}
    </div>
  );
}

/* ── Create-combo widget: pick 2+ cards, add notes, save ── */
function CreateComboWidget({ allCards, onCreated }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return allCards.slice(0, 40);
    const q = search.toLowerCase();
    return allCards.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 40);
  }, [search, allCards]);

  const save = async () => {
    if (selected.length < 2) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/me/combos`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: selected, notes: notes.trim() }),
      });
      const data = await res.json();
      if (data.id) {
        onCreated({ id: data.id, cardIds: selected, notes: notes.trim(), createdAt: new Date().toISOString() });
        setSelected([]); setNotes(""); setSearch(""); setOpen(false);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px dashed ${T.border}`,
        background: T.surfaceAlt, color: T.textSecondary, fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span style={{ fontSize: 16 }}>+</span> Create custom combo
      </button>
    );
  }

  return (
    <div style={{
      background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`,
      padding: 14, marginBottom: 4,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>
        Create Combo
      </div>

      {/* Selected cards */}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {selected.map(id => {
            const c = allCards.find(x => x.id === id);
            return (
              <span key={id} onClick={() => toggle(id)} style={{
                padding: "3px 8px", borderRadius: 6, background: T.accentBg, color: T.accent,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
                {c?.name || id} ✕
              </span>
            );
          })}
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search cards…"
        style={{
          width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
          fontSize: 12, outline: "none", fontFamily: "inherit", marginBottom: 6, boxSizing: "border-box",
        }} />

      {/* Card list */}
      <div style={{
        maxHeight: 180, overflowY: "auto", border: `1px solid ${T.borderLight}`,
        borderRadius: 6, marginBottom: 8,
      }}>
        {filtered.map(c => {
          const sel = selected.includes(c.id);
          return (
            <div key={c.id} onClick={() => toggle(c.id)} style={{
              padding: "6px 10px", cursor: "pointer", fontSize: 12,
              display: "flex", alignItems: "center", gap: 6,
              background: sel ? T.accentBg : "transparent",
              borderBottom: `1px solid ${T.borderLight}`,
            }}>
              <span style={{ width: 16, textAlign: "center", fontSize: 11 }}>
                {sel ? "✓" : ""}
              </span>
              <span style={{ fontWeight: sel ? 600 : 400, color: sel ? T.accent : T.text }}>
                {c.name}
              </span>
              <span style={{ fontSize: 10, color: T.textMuted, marginLeft: "auto" }}>
                {c.type}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: T.textMuted }}>No cards found</div>
        )}
      </div>

      {/* Notes */}
      <input value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes (optional)…"
        style={{
          width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
          fontSize: 12, outline: "none", fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box",
        }} />

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => { setOpen(false); setSelected([]); setNotes(""); setSearch(""); }}
          style={{
            padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.surface, color: T.textSecondary, fontSize: 11, cursor: "pointer",
          }}>Cancel</button>
        <button onClick={save} disabled={selected.length < 2 || saving}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "none",
            background: selected.length < 2 ? T.borderLight : T.accent,
            color: selected.length < 2 ? T.textMuted : "#fff",
            fontSize: 11, fontWeight: 600, cursor: selected.length < 2 ? "default" : "pointer",
          }}>
          {saving ? "Saving…" : `Save combo (${selected.length} cards)`}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage({ allCards = [], onViewInWiki }) {
  const { user, setUser } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [tab, setTab] = useState("overview"); // overview | scores | drafts | challenges | favourites
  const [stats, setStats] = useState(null);
  const [scores, setScores] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [challenges, setChallenges] = useState(null);
  const [favourites, setFavourites] = useState(null);
  const [combos, setCombos] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load stats on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/me/stats`, { credentials: "include" });
        const data = await res.json();
        setStats(data.stats);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [user]);

  // Lazy load tabs
  useEffect(() => {
    if (!user) return;
    if (tab === "scores" && !scores) {
      fetch(`${API_BASE}/api/me/scores`, { credentials: "include" })
        .then(r => r.json()).then(d => setScores(d.scores || []));
    }
    if (tab === "drafts" && !drafts) {
      fetch(`${API_BASE}/api/me/drafts`, { credentials: "include" })
        .then(r => r.json()).then(d => setDrafts(d.drafts || []));
    }
    if (tab === "challenges" && !challenges) {
      fetch(`${API_BASE}/api/me/challenges`, { credentials: "include" })
        .then(r => r.json()).then(d => setChallenges(d.challenges || []));
    }
    if (tab === "favourites" && !favourites) {
      fetch(`${API_BASE}/api/me/favourites`, { credentials: "include" })
        .then(r => r.json()).then(d => setFavourites(d.favourites || []));
    }
    if (tab === "combos" && !combos) {
      fetch(`${API_BASE}/api/me/combos`, { credentials: "include" })
        .then(r => r.json()).then(d => setCombos(d || []));
    }
  }, [tab, user, scores, drafts, challenges, favourites, combos]);

  const handleLogout = async () => {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  };

  const cardById = useMemo(() => {
    const m = {};
    for (const c of allCards) m[c.id] = c;
    return m;
  }, [allCards]);

  if (!user) return null;

  const tabs = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "scores", label: "Scores", icon: "📋", count: stats?.gamesScored },
    { id: "drafts", label: "Drafts", icon: "🃏", count: stats?.totalDrafts },
    { id: "challenges", label: "Challenges", icon: "⚔️", count: stats?.totalChallenges },
    { id: "favourites", label: "Cards", icon: "⭐", count: stats?.totalFavourites },
    { id: "combos", label: "Combos", icon: "🔗", count: stats?.totalCombos },
  ];

  return (
    <div style={{ height: "100%", overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", background: T.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px 48px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", background: T.accentBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: T.accent, flexShrink: 0,
          }}>
            {user.displayName?.[0]?.toUpperCase() || user.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.5 }}>
              {user.displayName || user.username}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted }}>@{user.username}</div>
          </div>
          <button onClick={() => setShowPw(v => !v)} style={{
            padding: "6px 10px", borderRadius: 8, border: `1px solid ${showPw ? T.accent : T.border}`,
            background: showPw ? T.accentBg : T.surface, color: showPw ? T.accent : T.textMuted, fontSize: 11, cursor: "pointer",
          }}>🔑 Password</button>
          <button onClick={handleLogout} style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.surface, color: T.textMuted, fontSize: 11, cursor: "pointer",
          }}>Sign out</button>
        </div>

        {(showPw || user.mustChangePassword) && (
          <div style={{
            background: user.mustChangePassword ? T.accentBg : T.surface, border: `1px solid ${user.mustChangePassword ? T.accent : T.border}`,
            borderRadius: 12, padding: "16px 18px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Change password</div>
            {user.mustChangePassword && (
              <div style={{ fontSize: 12, color: T.accent, marginBottom: 12 }}>
                You're using a temporary password from the admin — please choose your own. Enter the temporary password as "current password".
              </div>
            )}
            <ChangePasswordForm />
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "7px 12px", borderRadius: 8, border: "none",
              background: tab === t.id ? T.accentBg : T.surface,
              color: tab === t.id ? T.accent : T.textSecondary,
              fontSize: 12, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
              {t.count != null && <span style={{ fontSize: 10, opacity: 0.7 }}>({t.count})</span>}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === "overview" && (
          <>
            {loading || !stats ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : (
              <>
                {/* Quick stats grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Games", value: stats.gamesScored, color: T.accent },
                    { label: "Best Score", value: stats.bestScore ?? "—", color: T.green },
                    { label: "Avg Score", value: stats.avgScore ?? "—", color: T.blue },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: "12px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "Drafts", value: stats.totalDrafts, color: T.purple },
                    { label: "Challenges", value: stats.totalChallenges, color: T.accent },
                    { label: "Favourites", value: stats.totalFavourites, color: T.red },
                  ].map(s => (
                    <div key={s.label} style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: "12px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Category averages */}
                {stats.categoryAverages && Object.keys(stats.categoryAverages).length > 0 && (
                  <SectionCard title="Scoring Averages" icon="📈">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
                      {Object.entries(stats.categoryAverages).map(([key, avg]) => (
                        <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0" }}>
                          <span style={{ color: T.textSecondary }}>
                            {CATEGORY_ICONS[key] || ""} {CATEGORY_LABELS[key] || key}
                          </span>
                          <span style={{ fontWeight: 700, color: avg >= 0 ? T.green : T.red }}>
                            {avg > 0 ? "+" : ""}{avg}
                          </span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </>
            )}
          </>
        )}

        {/* Scores tab */}
        {tab === "scores" && (
          <>
            {!scores ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : scores.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div>No scores linked to your account yet</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {scores.map(s => (
                  <div key={s.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
                    padding: "10px 14px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                        {s.tournament || "Casual game"}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        {new Date(s.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                        {s.startingPosition ? ` · Pos ${s.startingPosition}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.total >= 0 ? T.accent : T.red, letterSpacing: -0.5 }}>
                      {s.total}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Drafts tab */}
        {tab === "drafts" && (
          <>
            {!drafts ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : drafts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🃏</div>
                <div>No drafts linked to your account yet</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {drafts.map(d => {
                  const picks = typeof d.picks === "string" ? JSON.parse(d.picks) : d.picks;
                  return (
                    <div key={d.id} style={{
                      background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
                      padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.draftType}</div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                            {new Date(d.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                            {" · "}{picks.length} cards
                          </div>
                        </div>
                      </div>
                      {d.comment && (
                        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6, fontStyle: "italic" }}>
                          "{d.comment}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Challenges tab */}
        {tab === "challenges" && (
          <>
            {!challenges ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : challenges.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div>
                <div>No challenges linked to your account yet</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {challenges.map((c, i) => (
                  <div key={c.id || i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
                    padding: "10px 14px",
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                        vs {c.creatorName}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        {c.draftType} · {new Date(c.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <div style={{
                      padding: "4px 10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: T.accentBg, color: T.accent,
                    }}>
                      {c.overlapCount} overlap
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Favourites tab */}
        {tab === "favourites" && (
          <>
            {!favourites ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : favourites.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
                <div>No favourite cards yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Heart cards in the Explorer or Wiki to save them here</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {favourites.map(f => (
                  <FavCardRow key={f.cardId} fav={f} card={cardById[f.cardId]}
                    onUpdate={(notes) => {
                      fetch(`${API_BASE}/api/me/favourites`, {
                        method: "POST", credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ cardId: f.cardId, notes }),
                      });
                      setFavourites(prev => prev.map(x => x.cardId === f.cardId ? { ...x, notes } : x));
                    }}
                    onRemove={() => {
                      fetch(`${API_BASE}/api/me/favourites/${f.cardId}`, { method: "DELETE", credentials: "include" });
                      setFavourites(prev => prev.filter(x => x.cardId !== f.cardId));
                    }}
                    onNavigate={onViewInWiki}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Combos tab */}
        {tab === "combos" && (
          <>
            {!combos ? (
              <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>Loading...</div>
            ) : (
              <>
                <CreateComboWidget allCards={allCards} onCreated={(combo) => setCombos(prev => [combo, ...(prev || [])])} />
                {combos.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                    <div>No saved combos yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Save combos from the Wiki or create your own above</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                    {combos.map(c => (
                      <ComboRow key={c.id} combo={c} cardById={cardById}
                        onUpdateNotes={(notes) => {
                          fetch(`${API_BASE}/api/me/combos/${c.id}`, {
                            method: "PUT", credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ cardIds: c.cardIds, notes }),
                          });
                          setCombos(prev => prev.map(x => x.id === c.id ? { ...x, notes } : x));
                        }}
                        onRemove={() => {
                          fetch(`${API_BASE}/api/me/combos/${c.id}`, { method: "DELETE", credentials: "include" });
                          setCombos(prev => prev.filter(x => x.id !== c.id));
                        }}
                        onNavigate={onViewInWiki}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
