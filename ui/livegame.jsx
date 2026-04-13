import { useState, useCallback, useEffect, useRef } from "react";

const API_BASE = "";

// ── Light theme palette (matches drafter.jsx) ───────────────────────────────
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

// ── Helpers ─────────────────────────────────────────────────────────────────
function cardImgSrc(card) {
  if (!card || !card.imageUrl) return null;
  if (card.imageUrl.startsWith("/img/")) return card.imageUrl;
  return `${API_BASE}/api/imgproxy?url=${encodeURIComponent(card.imageUrl)}`;
}

function CardImageOrFallback({ card }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = cardImgSrc(card);
  if (!src || imgFailed) {
    return (
      <div style={{
        minHeight: 140, display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", padding: 12, background: T.surfaceAlt, color: T.textSecondary, fontSize: 11,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: T.text, textAlign: "center", marginBottom: 4 }}>{card.name}</div>
        <div style={{ color: T.textMuted }}>{card.deck} · {card.type}</div>
        {card.pwr > 0 && <div style={{ color: T.purple, marginTop: 2 }}>PWR {card.pwr.toFixed(1)}</div>}
      </div>
    );
  }
  return <img src={src} alt={card.name} style={{ width: "100%", display: "block", background: T.surfaceAlt }} onError={() => setImgFailed(true)} />;
}

// ── Deck selection helper ───────────────────────────────────────────────────
const AVAILABLE_DECKS = [
  { id: "E", label: "E-deck", color: "#3b82f6" },
  { id: "I", label: "I-deck", color: "#8b5cf6" },
  { id: "K", label: "K-deck", color: "#ec4899" },
  { id: "Fr", label: "France", color: "#10b981" },
  { id: "Wm", label: "World", color: "#ef4444" },
  { id: "G", label: "Gamers", color: "#6366f1" },
  { id: "G4", label: "G4", color: "#14b8a6" },
  { id: "G5", label: "G5", color: "#f97316" },
  { id: "G6", label: "G6", color: "#a855f7" },
  { id: "G7", label: "G7", color: "#06b6d4" },
];

// ── Phase 1: Home — Create or Join ─────────────────────────────────────────
function LiveHome({ onCreated, onJoined, storedUsername }) {
  const [tab, setTab] = useState("create"); // create | join
  const [username, setUsername] = useState(storedUsername || "");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [norwayOnly, setNorwayOnly] = useState(true);
  const [selectedDecks, setSelectedDecks] = useState([]);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleDeck = (id) => {
    setSelectedDecks(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const handleCreate = async () => {
    if (!username.trim()) { setError("Enter your name"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), maxPlayers, deckSelection: selectedDecks, norwayOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create room");
      onCreated(data.code, data.seat, username.trim());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!username.trim()) { setError("Enter your name"); return; }
    if (!joinCode.trim()) { setError("Enter room code"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${joinCode.trim().toUpperCase()}/join`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join room");
      onJoined(data.code, data.seat, username.trim());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.text }}>Live Draft</div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>Draft cards with friends at the table</div>
      </div>

      {/* Name input */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: 4 }}>Your Name</label>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your name..."
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
            fontSize: 14, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box",
          }} />
      </div>

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, background: T.surfaceAlt, borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
        {["create", "join"].map(t => (
          <button key={t} onClick={() => { setTab(t); setError(""); }}
            style={{
              flex: 1, padding: "10px 0", border: "none", fontSize: 13, fontWeight: 600,
              background: tab === t ? T.accent : "transparent",
              color: tab === t ? "#fff" : T.textMuted,
              cursor: "pointer", transition: "all 0.15s",
            }}>
            {t === "create" ? "Create Room" : "Join Room"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div>
          {/* Max players */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: 6 }}>Players</label>
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setMaxPlayers(n)}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 6, border: `1px solid ${maxPlayers === n ? T.accent : T.border}`,
                    background: maxPlayers === n ? T.accentBg : T.surface,
                    color: maxPlayers === n ? T.accent : T.textSecondary,
                    fontWeight: maxPlayers === n ? 700 : 500, fontSize: 13, cursor: "pointer",
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Norway only */}
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setNorwayOnly(!norwayOnly)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none",
                background: norwayOnly ? T.accent : T.border,
                cursor: "pointer", position: "relative", transition: "background 0.2s",
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: "#fff",
                position: "absolute", top: 2, left: norwayOnly ? 20 : 2, transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              }} />
            </button>
            <span style={{ fontSize: 13, color: T.textSecondary }}>Norway tournament cards only</span>
          </div>

          {/* Deck selection */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: 6 }}>
              Decks {selectedDecks.length === 0 && <span style={{ fontWeight: 400, color: T.textMuted }}>(all included)</span>}
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AVAILABLE_DECKS.map(d => {
                const sel = selectedDecks.includes(d.id);
                return (
                  <button key={d.id} onClick={() => toggleDeck(d.id)}
                    style={{
                      padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: sel ? 600 : 500,
                      border: `1px solid ${sel ? d.color : T.border}`,
                      background: sel ? d.color + "18" : T.surface,
                      color: sel ? d.color : T.textMuted,
                      cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={handleCreate} disabled={loading}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
              background: T.accent, color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
            }}>
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, display: "block", marginBottom: 4 }}>Room Code</label>
            <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123"
              maxLength={6}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                fontSize: 20, fontWeight: 700, letterSpacing: 4, textAlign: "center", textTransform: "uppercase",
                background: T.surface, color: T.text, outline: "none", boxSizing: "border-box",
              }} />
          </div>

          <button onClick={handleJoin} disabled={loading}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
              background: T.blue, color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
            }}>
            {loading ? "Joining..." : "Join Room"}
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: T.red + "12", color: T.red, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}


// ── Phase 2: Lobby — Waiting for players ───────────────────────────────────
function Lobby({ code, seat, username, state, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const isCreator = seat === 0;

  const copyCode = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Room Code</div>
        <button onClick={copyCode}
          style={{
            fontSize: 36, fontWeight: 800, letterSpacing: 6, color: T.accent,
            background: "none", border: "none", cursor: "pointer", padding: "4px 0",
          }}>
          {code}
        </button>
        <div style={{ fontSize: 12, color: copied ? T.green : T.textMuted }}>
          {copied ? "Copied!" : "Tap to copy"}
        </div>
      </div>

      {/* Player list */}
      <div style={{
        background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`,
        overflow: "hidden", marginBottom: 20,
      }}>
        <div style={{ padding: "10px 14px", background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, fontSize: 12, fontWeight: 600, color: T.textSecondary }}>
          Players ({state?.players?.length || 0}/{state?.maxPlayers || "?"})
        </div>
        {(state?.players || []).map((p, i) => (
          <div key={i} style={{
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
            borderBottom: i < (state.players.length - 1) ? `1px solid ${T.borderLight}` : "none",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 14, background: T.accentBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: T.accent,
            }}>
              {p.seat + 1}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.username}</div>
            {p.seat === 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: T.accentLight, color: T.accent }}>Host</span>}
            {p.username === username && <span style={{ fontSize: 10, color: T.textMuted }}>(you)</span>}
          </div>
        ))}
      </div>

      {/* Settings summary */}
      <div style={{
        background: T.surfaceAlt, borderRadius: 8, padding: "10px 14px", marginBottom: 20,
        fontSize: 12, color: T.textSecondary, display: "flex", gap: 12, flexWrap: "wrap",
      }}>
        <span>{state?.norwayOnly ? "Norway only" : "All cards"}</span>
        <span>{(state?.deckSelection || []).length === 0 ? "All decks" : (state?.deckSelection || []).join(", ")}</span>
      </div>

      {isCreator ? (
        <button onClick={onStart}
          disabled={!state?.players || state.players.length < 1}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
            background: (state?.players?.length || 0) >= 1 ? T.accent : T.border,
            color: (state?.players?.length || 0) >= 1 ? "#fff" : T.textMuted,
            fontSize: 15, fontWeight: 700, cursor: (state?.players?.length || 0) >= 1 ? "pointer" : "default",
          }}>
          Start Draft ({state?.players?.length || 0} {(state?.players?.length || 0) === 1 ? "player" : "players"})
        </button>
      ) : (
        <div style={{ textAlign: "center", padding: "12px 0", fontSize: 14, color: T.textMuted }}>
          Waiting for host to start...
        </div>
      )}

      <button onClick={onLeave}
        style={{
          width: "100%", padding: "10px 0", borderRadius: 8, border: `1px solid ${T.border}`,
          background: "transparent", color: T.textMuted, fontSize: 13, fontWeight: 500,
          cursor: "pointer", marginTop: 10,
        }}>
        Leave
      </button>
    </div>
  );
}


// ── Phase 3: Drafting — Pick cards from pack ───────────────────────────────
function DraftView({ state, seat, allCards, onPick }) {
  const [picking, setPicking] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [hideStats, setHideStats] = useState(false);
  const cardsById = useRef({});

  // Build cards lookup
  useEffect(() => {
    const map = {};
    for (const c of allCards) map[c.id] = c;
    cardsById.current = map;
  }, [allCards]);

  const packCards = (state?.myPack || []).map(c => {
    // myPack from server already has card objects (from _CARDS_BY_ID_WIKI)
    if (c && c.id) return c;
    return cardsById.current[c] || null;
  }).filter(Boolean);

  const myPlayer = (state?.players || []).find(p => p.seat === seat);
  const handCards = (myPlayer?.hand || []).map(id => cardsById.current[id] || allCards.find(c => c.id === id)).filter(Boolean);
  const hasPicked = myPlayer?.hasPicked;
  const waitingForOthers = hasPicked && !state?.allPicked;

  const handlePick = async (card) => {
    if (picking || hasPicked) return;
    setSelectedCard(card.id);
    setPicking(true);
    try {
      await fetch(`${API_BASE}/api/rooms/${state.code}/pick?seat=${seat}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
    } catch (e) { console.error(e); }
    setPicking(false);
    setSelectedCard(null);
  };

  const draftPhaseLabel = state?.draftPhase === "occ" ? "Occupations" : "Minor Improvements";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header bar */}
      <div style={{
        padding: "8px 14px", background: T.surface, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Round {state?.draftRound || 0}/7</span>
          <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 8 }}>{draftPhaseLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setHideStats(s => !s)}
            title={hideStats ? "Show card stats" : "Hide card stats"}
            style={{
              background: !hideStats ? T.greenLight : T.surfaceAlt,
              border: `1px solid ${!hideStats ? T.green : T.border}`,
              borderRadius: 8, color: !hideStats ? T.green : T.textMuted,
              padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}>
            {!hideStats ? "\uD83D\uDCCA" : "\uD83D\uDE48"} Stats
          </button>
          {(state?.players || []).map(p => (
            <div key={p.seat} title={p.username} style={{
              width: 24, height: 24, borderRadius: 12, fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: p.hasPicked ? T.green + "22" : T.surfaceAlt,
              color: p.hasPicked ? T.green : T.textMuted,
              border: `2px solid ${p.hasPicked ? T.green : T.border}`,
            }}>
              {p.hasPicked ? "\u2713" : p.seat + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
        {waitingForOthers ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\u23F3"}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>Waiting for others...</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>
              {(state?.players || []).filter(p => !p.hasPicked).map(p => p.username).join(", ")} still picking
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 10 }}>
              Pick a card ({packCards.length} remaining)
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10, marginBottom: 20,
            }}>
              {packCards.map(card => (
                <div key={card.id} onClick={() => handlePick(card)}
                  style={{
                    cursor: picking ? "default" : "pointer",
                    borderRadius: 10, overflow: "hidden",
                    border: selectedCard === card.id ? `2px solid ${T.accent}` : `2px solid ${T.border}`,
                    background: T.surface,
                    transition: "all 0.2s",
                    opacity: picking && selectedCard !== card.id ? 0.4 : 1,
                  }}>
                  <CardImageOrFallback card={card} />
                  <div style={{ padding: "5px 8px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</div>
                    {hideStats ? (
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>{card.deck}</div>
                    ) : (
                      <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 6, marginTop: 1 }}>
                        <span>{card.deck}</span>
                        {card.pwr > 0 && <span style={{ color: T.purple }}>PWR {card.pwr.toFixed(1)}</span>}
                        {card.adp > 0 && <span style={{ color: T.accent }}>ADP {card.adp.toFixed(1)}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Hand so far */}
        {handCards.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSecondary, marginBottom: 8, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              Your Hand ({handCards.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {handCards.map(card => (
                <div key={card.id} style={{
                  padding: "4px 10px", borderRadius: 6, background: T.accentBg,
                  fontSize: 11, fontWeight: 600, color: T.accent, border: `1px solid ${T.accentLight}`,
                }}>
                  {card.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── Expandable player card row ─────────────────────────────────────────────
function OtherPlayerCards({ player, cardsById, playRounds }) {
  const [expanded, setExpanded] = useState(false);
  const cards = (player.playedCards || []).map(id => cardsById[id]).filter(Boolean);
  if (cards.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", padding: 0, marginBottom: 6,
          fontSize: 12, fontWeight: 600, color: T.textSecondary,
        }}>
        <span style={{
          display: "inline-block", transition: "transform 0.2s",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)", fontSize: 10,
        }}>{"\u25B6"}</span>
        {player.username}'s played cards ({cards.length})
      </button>

      {!expanded ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cards.map(c => {
            const rd = playRounds[c.id];
            return (
              <div key={c.id} style={{
                padding: "4px 10px", borderRadius: 6, background: T.surfaceAlt,
                fontSize: 11, fontWeight: 500, color: T.textSecondary, border: `1px solid ${T.border}`,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {c.name}
                {rd > 0 && <span style={{ fontSize: 9, color: T.textMuted, background: T.border, borderRadius: 3, padding: "0 4px" }}>R{rd}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {cards.map(c => {
            const rd = playRounds[c.id];
            return (
              <div key={c.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, background: T.surface }}>
                <CardImageOrFallback card={c} />
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 6, marginTop: 1 }}>
                    <span>{c.deck}</span>
                    {c.pwr > 0 && <span style={{ color: T.purple }}>PWR {c.pwr.toFixed(1)}</span>}
                    {rd > 0 && <span style={{ color: T.accent }}>Round {rd}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── Phase 4: Playing — Hand management ─────────────────────────────────────
function PlayingView({ state, seat, allCards, code }) {
  const [actionLoading, setActionLoading] = useState(null);
  const [hideStats, setHideStats] = useState(false);
  const cardsById = useRef({});

  useEffect(() => {
    const map = {};
    for (const c of allCards) map[c.id] = c;
    cardsById.current = map;
  }, [allCards]);

  const myPlayer = (state?.players || []).find(p => p.seat === seat);
  const handCards = (myPlayer?.hand || []).map(id => cardsById.current[id]).filter(Boolean);
  const playedCards = (myPlayer?.playedCards || []).map(id => cardsById.current[id]).filter(Boolean);
  const gameRound = state?.gameRound || 0;
  const playRounds = state?.playRounds || {};

  const doAction = async (action, cardId, extra = "") => {
    setActionLoading(cardId + action);
    try {
      await fetch(`${API_BASE}/api/rooms/${code}/${action}?seat=${seat}${extra}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const setRound = async (r) => {
    try {
      await fetch(`${API_BASE}/api/rooms/${code}/round?round=${r}`, { method: "POST" });
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "8px 14px", background: T.surface, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, flexWrap: "wrap", gap: 8,
      }}>
        {/* Round selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => gameRound > 0 && setRound(gameRound - 1)}
            disabled={gameRound <= 0}
            style={{
              width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`,
              background: T.surface, color: gameRound > 0 ? T.text : T.textMuted,
              fontSize: 14, fontWeight: 700, cursor: gameRound > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{"\u2212"}</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text, minWidth: 70, textAlign: "center" }}>
            {gameRound === 0 ? "Pre-game" : `Round ${gameRound}`}
          </span>
          <button onClick={() => gameRound < 14 && setRound(gameRound + 1)}
            disabled={gameRound >= 14}
            style={{
              width: 24, height: 24, borderRadius: 12, border: `1px solid ${T.border}`,
              background: T.surface, color: gameRound < 14 ? T.text : T.textMuted,
              fontSize: 14, fontWeight: 700, cursor: gameRound < 14 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>+</button>
        </div>

        {/* Stats toggle + player pills */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setHideStats(s => !s)}
            title={hideStats ? "Show card stats" : "Hide card stats"}
            style={{
              background: !hideStats ? T.greenLight : T.surfaceAlt,
              border: `1px solid ${!hideStats ? T.green : T.border}`,
              borderRadius: 8, color: !hideStats ? T.green : T.textMuted,
              padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}>
            {!hideStats ? "\uD83D\uDCCA" : "\uD83D\uDE48"} Stats
          </button>
          {(state?.players || []).map(p => (
            <div key={p.seat} title={`${p.username}: ${p.handSize} in hand, ${p.playedCards.length} played`}
              style={{
                padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
                background: p.seat === seat ? T.accentBg : T.surfaceAlt,
                color: p.seat === seat ? T.accent : T.textMuted,
                border: `1px solid ${p.seat === seat ? T.accent + "44" : T.border}`,
              }}>
              {p.username} ({p.handSize})
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
        {/* Hand */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>
            Your Hand ({handCards.length})
          </div>
          {handCards.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textMuted, padding: "12px 0" }}>No cards in hand</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {handCards.map(card => (
                <div key={card.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, background: T.surface }}>
                  <CardImageOrFallback card={card} />
                  <div style={{ padding: "6px 8px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</div>
                    {!hideStats && (
                      <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 6, marginTop: 1 }}>
                        <span>{card.deck}</span>
                        {card.pwr > 0 && <span style={{ color: T.purple }}>PWR {card.pwr.toFixed(1)}</span>}
                        {card.adp > 0 && <span style={{ color: T.accent }}>ADP {card.adp.toFixed(1)}</span>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      <button onClick={() => doAction("play", card.id)}
                        disabled={actionLoading}
                        style={{
                          flex: 1, padding: "4px 0", borderRadius: 4, border: "none",
                          background: T.green, color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer",
                        }}>
                        Play
                      </button>
                      <button onClick={() => doAction("discard", card.id)}
                        disabled={actionLoading}
                        style={{
                          flex: 1, padding: "4px 0", borderRadius: 4, border: "none",
                          background: T.red + "22", color: T.red, fontSize: 10, fontWeight: 600, cursor: "pointer",
                        }}>
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Played cards */}
        {playedCards.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>
              Played ({playedCards.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {playedCards.map(card => {
                const isMinor = card.type === "MinorImprovement";
                const rd = playRounds[card.id];
                return (
                  <div key={card.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.green}44`, background: T.greenLight }}>
                    <CardImageOrFallback card={card} />
                    <div style={{ padding: "6px 8px" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</div>
                      {rd > 0 && (
                        <div style={{ fontSize: 10, color: T.accent, marginTop: 1 }}>Played round {rd}</div>
                      )}
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {isMinor && (
                          <button onClick={() => doAction("pass-minor", card.id)}
                            disabled={actionLoading}
                            style={{
                              flex: 1, padding: "4px 0", borderRadius: 4, border: "none",
                              background: T.blue + "22", color: T.blue, fontSize: 10, fontWeight: 600, cursor: "pointer",
                            }}>
                            Pass
                          </button>
                        )}
                        <button onClick={() => doAction("discard", card.id)}
                          disabled={actionLoading}
                          style={{
                            flex: 1, padding: "4px 0", borderRadius: 4, border: "none",
                            background: T.red + "12", color: T.red, fontSize: 10, fontWeight: 600, cursor: "pointer",
                          }}>
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other players' played cards — expandable */}
        {(state?.players || []).filter(p => p.seat !== seat && p.playedCards.length > 0).map(p => (
          <OtherPlayerCards key={p.seat} player={p} cardsById={cardsById.current} playRounds={playRounds} />
        ))}
      </div>
    </div>
  );
}


// ── Main LiveGame component ─────────────────────────────────────────────────
export default function LiveGame({ allCards }) {
  const [roomCode, setRoomCode] = useState(null);
  const [mySeat, setMySeat] = useState(-1);
  const [myUsername, setMyUsername] = useState("");
  const [roomState, setRoomState] = useState(null);
  const [pollError, setPollError] = useState("");
  const pollRef = useRef(null);

  // Try to restore from localStorage
  const storedUsername = (() => {
    try { return localStorage.getItem("agricola_drafter_username") || ""; } catch { return ""; }
  })();

  const saveUsername = (name) => {
    try { localStorage.setItem("agricola_drafter_username", name); } catch {}
  };

  // Polling
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${roomCode}/state?seat=${mySeat}`);
        if (res.ok && active) {
          const data = await res.json();
          setRoomState(data);
          setPollError("");
        }
      } catch (e) {
        if (active) setPollError("Connection lost...");
      }
      if (active) pollRef.current = setTimeout(poll, 1500);
    };
    poll();
    return () => { active = false; clearTimeout(pollRef.current); };
  }, [roomCode, mySeat]);

  const handleCreated = (code, seat, username) => {
    setRoomCode(code); setMySeat(seat); setMyUsername(username);
    saveUsername(username);
  };

  const handleJoined = (code, seat, username) => {
    setRoomCode(code); setMySeat(seat); setMyUsername(username);
    saveUsername(username);
  };

  const handleStart = async () => {
    try {
      await fetch(`${API_BASE}/api/rooms/${roomCode}/start`, { method: "POST" });
    } catch (e) { console.error(e); }
  };

  const handleLeave = () => {
    setRoomCode(null); setMySeat(-1); setRoomState(null);
  };

  // No room yet — show create/join
  if (!roomCode) {
    return <LiveHome onCreated={handleCreated} onJoined={handleJoined} storedUsername={storedUsername} />;
  }

  // Waiting for first poll
  if (!roomState) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.textMuted, fontSize: 14 }}>
        Connecting to room {roomCode}...
        {pollError && <div style={{ color: T.red, marginTop: 8 }}>{pollError}</div>}
      </div>
    );
  }

  // Route to the right phase
  const phase = roomState.phase;

  if (phase === "lobby") {
    return <Lobby code={roomCode} seat={mySeat} username={myUsername} state={roomState} onStart={handleStart} onLeave={handleLeave} />;
  }

  if (phase === "drafting") {
    return <DraftView state={roomState} seat={mySeat} allCards={allCards} onPick={() => {}} />;
  }

  if (phase === "playing") {
    return <PlayingView state={roomState} seat={mySeat} allCards={allCards} code={roomCode} />;
  }

  return (
    <div style={{ textAlign: "center", padding: 40, color: T.textMuted }}>
      Unknown phase: {phase}
    </div>
  );
}
