import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "./auth.jsx";

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

export default function ProfilePage({ allCards = [] }) {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState("overview"); // overview | scores | drafts | challenges | favourites
  const [stats, setStats] = useState(null);
  const [scores, setScores] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [challenges, setChallenges] = useState(null);
  const [favourites, setFavourites] = useState(null);
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
  }, [tab, user, scores, drafts, challenges, favourites]);

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
          <button onClick={handleLogout} style={{
            padding: "6px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.surface, color: T.textMuted, fontSize: 11, cursor: "pointer",
          }}>Sign out</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "7px 14px", borderRadius: 8, border: "none", whiteSpace: "nowrap",
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
                <div style={{ fontSize: 12, marginTop: 4 }}>Star cards in the Explorer or Wiki to save them here</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {favourites.map(f => {
                  const card = cardById[f.cardId];
                  return (
                    <div key={f.cardId} style={{
                      background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`,
                      padding: "10px 14px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: T.accent, fontSize: 16 }}>⭐</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                            {card?.name || f.cardId}
                          </div>
                          {card && (
                            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                              {card.type} · {card.deck}
                            </div>
                          )}
                        </div>
                      </div>
                      {f.notes && (
                        <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6, paddingLeft: 28, fontStyle: "italic" }}>
                          {f.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
