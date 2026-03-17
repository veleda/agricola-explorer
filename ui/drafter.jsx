import { useState, useCallback, useEffect, useMemo } from "react";

const API_BASE = "";
const MAX_PICKS = 7;
const PACK_SIZE = 9;      // initial cards per pack
const NUM_PLAYERS = 4;    // you + 3 NPCs

// ── Light theme palette ─────────────────────────────────────────────────────
const T = {
  bg: "#faf9f7",          // warm off-white
  surface: "#ffffff",
  surfaceAlt: "#f5f3f0",
  border: "#e8e4df",
  borderLight: "#f0ece7",
  text: "#1a1a1a",
  textSecondary: "#6b6560",
  textMuted: "#9e9790",
  accent: "#b45309",       // warm amber-brown
  accentLight: "#fef3c7",
  accentBg: "#fffbeb",
  blue: "#2563eb",
  purple: "#7c3aed",
  green: "#059669",
  greenLight: "#ecfdf5",
  red: "#dc2626",
};

// ── NPC strategy ────────────────────────────────────────────────────────────
function npcPick(cards, strategyIndex) {
  if (cards.length === 0) return null;
  if (strategyIndex === 0) {
    return cards[Math.floor(Math.random() * cards.length)];
  }
  const sorted = [...cards].sort((a, b) => (b.winRatio || 0) - (a.winRatio || 0));
  const topN = sorted.slice(0, Math.min(3, sorted.length));
  return topN[Math.floor(Math.random() * topN.length)];
}

// ── Drafter API helpers ─────────────────────────────────────────────────────
async function saveDraft(username, draftType, picks, pickOrder) {
  const res = await fetch(`${API_BASE}/api/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, draftType, picks, pickOrder }),
  });
  return res.json();
}

async function fetchDrafts(username, draftType) {
  const params = new URLSearchParams();
  if (username) params.set("username", username);
  if (draftType) params.set("draftType", draftType);
  const res = await fetch(`${API_BASE}/api/drafts?${params}`);
  return res.json();
}

async function fetchDraftStats(draftType) {
  const params = draftType ? `?draftType=${draftType}` : "";
  const res = await fetch(`${API_BASE}/api/drafts/stats${params}`);
  return res.json();
}

// ── Image helper ────────────────────────────────────────────────────────────
function cardImgSrc(card) {
  if (!card || !card.imageUrl) return null;
  return `${API_BASE}/api/imgproxy?url=${encodeURIComponent(card.imageUrl)}`;
}

// ── Card info fallback (shown when no image) ────────────────────────────────
function CardInfoFallback({ card }) {
  return (
    <div style={{
      minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "center",
      background: T.surfaceAlt, padding: "14px 12px", gap: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
        {card.name}
      </div>
      {card.costLabel && (
        <div style={{ fontSize: 10, color: T.textSecondary }}>
          <span style={{ color: T.textMuted }}>Cost: </span>{card.costLabel}
        </div>
      )}
      {card.prerequisite && (
        <div style={{ fontSize: 10, color: T.accent }}>
          <span style={{ color: T.textMuted }}>Prereq: </span>{card.prerequisite}
        </div>
      )}
      {card.text && (
        <div style={{
          fontSize: 10, color: T.textSecondary, lineHeight: 1.45, fontStyle: "italic",
          borderLeft: `2px solid ${T.border}`, paddingLeft: 6, marginTop: 2,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
        }}>
          {card.text}
        </div>
      )}
      {card.gains && card.gains.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {card.gains.slice(0, 4).map(g => (
            <span key={g} style={{
              padding: "1px 6px", borderRadius: 99, background: T.greenLight,
              color: T.green, fontSize: 9,
            }}>{g.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card image with fallback on error ────────────────────────────────────────
function CardImageOrFallback({ card }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = cardImgSrc(card);

  if (!src || imgFailed) return <CardInfoFallback card={card} />;

  return (
    <img src={src} alt={card.name}
      style={{ width: "100%", display: "block", background: T.surfaceAlt }}
      onError={() => setImgFailed(true)}
    />
  );
}

// ── Card in draft grid ──────────────────────────────────────────────────────
function DraftCard({ card, onPick, disabled }) {
  const [hover, setHover] = useState(false);

  return (
    <div onClick={() => !disabled && onPick(card)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        cursor: disabled ? "default" : "pointer",
        borderRadius: 10, overflow: "hidden",
        border: hover && !disabled ? `2px solid ${T.accent}` : `2px solid ${T.border}`,
        background: T.surface,
        transition: "all 0.2s",
        transform: hover && !disabled ? "scale(1.03)" : "scale(1)",
        opacity: disabled ? 0.4 : 1,
        maxWidth: 180,
        boxShadow: hover && !disabled ? "0 4px 16px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}>
      <CardImageOrFallback card={card} />
      <div style={{ padding: "6px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.name}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 6, marginTop: 2 }}>
          <span>{card.deck}</span>
          {card.winRatio > 0 && <span style={{ color: T.blue }}>{(card.winRatio * 100).toFixed(0)}%</span>}
          {card.pwr > 0 && <span style={{ color: T.purple }}>PWR {card.pwr.toFixed(1)}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Draft results screen ────────────────────────────────────────────────────
function DraftResults({ picks, allCards, draftType, username, onSave, onNewDraft, saved }) {
  const pickCards = picks.map(id => allCards.find(c => c.id === id)).filter(Boolean);
  const avgWin = pickCards.length > 0 ? pickCards.reduce((s, c) => s + (c.winRatio || 0), 0) / pickCards.length : 0;
  const pwrCards = pickCards.filter(c => c.pwr > 0);
  const avgPwr = pwrCards.length > 0 ? pwrCards.reduce((s, c) => s + c.pwr, 0) / pwrCards.length : 0;
  const totalCostItems = pickCards.reduce((s, c) => s + (c.costLabel ? c.costLabel.split(/\s+/).length : 0), 0);
  const typeName = draftType === "Occupation" ? "Occupations" : "Minor Improvements";

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.accent, marginBottom: 4 }}>Draft Complete!</div>
        <div style={{ fontSize: 14, color: T.textSecondary }}>Your {typeName} hand</div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", gap: 16, justifyContent: "center", marginBottom: 24,
        flexWrap: "wrap",
      }}>
        {[
          ["Avg Win Rate", `${(avgWin * 100).toFixed(1)}%`, T.blue],
          ["Avg PWR", avgPwr > 0 ? avgPwr.toFixed(2) : "N/A", T.purple],
          ["Total Cost Items", totalCostItems, T.accent],
          ["Cards", pickCards.length, T.green],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            padding: "10px 20px", borderRadius: 10, background: T.surface,
            border: `1px solid ${T.border}`, textAlign: "center", minWidth: 100,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Card images grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {pickCards.map((c, i) => (
          <div key={c.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, background: T.surface }}>
            <div style={{ position: "relative" }}>
              <CardImageOrFallback card={c} />
              <div style={{
                position: "absolute", top: 4, left: 4, background: "rgba(255,255,255,0.9)", borderRadius: 99,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.accent,
              }}>Pick {i + 1}</div>
            </div>
            <div style={{ padding: "6px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{c.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                {c.deck} · {(c.winRatio * 100).toFixed(0)}%
                {c.pwr > 0 && <span style={{ color: T.purple, marginLeft: 4 }}>PWR {c.pwr.toFixed(1)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        {!saved ? (
          <button onClick={onSave}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: T.accent, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>
            Save to Community
          </button>
        ) : (
          <div style={{ padding: "10px 24px", borderRadius: 8, background: T.greenLight, color: T.green, fontSize: 14, fontWeight: 600 }}>
            Saved!
          </div>
        )}
        <button onClick={onNewDraft}
          style={{
            padding: "10px 24px", borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.surface,
            color: T.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
          New Draft
        </button>
      </div>
    </div>
  );
}

// ── Community stats panel ───────────────────────────────────────────────────
function CommunityStats({ allCards, draftType }) {
  const [stats, setStats] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchDraftStats(draftType), fetchDrafts(null, draftType)])
      .then(([s, d]) => { setStats(s); setDrafts(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [draftType]);

  const cardMap = useMemo(() => {
    const m = {};
    allCards.forEach(c => { m[c.id] = c; });
    return m;
  }, [allCards]);

  if (loading) return <div style={{ padding: 24, color: T.textMuted, textAlign: "center" }}>Loading community stats...</div>;
  if (!stats || stats.totalDrafts === 0) return <div style={{ padding: 24, color: T.textMuted, textAlign: "center" }}>No community drafts yet. Be the first!</div>;

  const typeName = draftType === "Occupation" ? "Occupation" : "Minor Improvement";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>
        Community {typeName} Drafts
        <span style={{ marginLeft: 8, fontSize: 11, color: T.textMuted }}>{stats.totalDrafts} total</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Most Drafted Overall</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {stats.overallTop.slice(0, 8).map(({ cardId, count }) => {
            const c = cardMap[cardId];
            return c ? (
              <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 28, textAlign: "right", color: T.accent, fontWeight: 700 }}>{count}x</div>
                <span style={{ color: T.text }}>{c.name}</span>
                <span style={{ color: T.textMuted, fontSize: 10 }}>{c.deck}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {["1", "2", "3"].map(rnd => stats.roundTop[rnd] && (
        <div key={rnd} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Most Popular Pick #{rnd}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {stats.roundTop[rnd].slice(0, 3).map(({ cardId, count }) => {
              const c = cardMap[cardId];
              return c ? (
                <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 24, textAlign: "right", color: T.blue, fontWeight: 600 }}>{count}</div>
                  <span style={{ color: T.textSecondary }}>{c.name}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      ))}

      {drafts && drafts.drafts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Recent Hands</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drafts.drafts.slice(0, 10).map(d => (
              <div key={d.id} style={{
                padding: "6px 10px", borderRadius: 8, background: T.surfaceAlt,
                border: `1px solid ${T.border}`, fontSize: 11,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: T.text }}>{d.username}</span>
                  <span style={{ color: T.textMuted, fontSize: 10 }}>{new Date(d.timestamp).toLocaleDateString()}</span>
                </div>
                <div style={{ color: T.textSecondary, fontSize: 10 }}>
                  {d.picks.map(id => cardMap[id]?.name || id).join(", ")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main Drafter Component ──────────────────────────────────────────────────
export default function Drafter({ allCards, norwayOnly, setNorwayOnly }) {
  const [phase, setPhase] = useState("setup");
  const [draftType, setDraftType] = useState("Occupation");
  const [username, setUsername] = useState("");
  const [selectedDecks, setSelectedDecks] = useState(null);

  const [packs, setPacks] = useState([[], [], [], []]);
  const [myPicks, setMyPicks] = useState([]);
  const [pickOrder, setPickOrder] = useState([]);
  const [round, setRound] = useState(1);
  const [saved, setSaved] = useState(false);

  const [showCommunity, setShowCommunity] = useState(false);
  const [showDraftHand, setShowDraftHand] = useState(false);

  const availableDecks = useMemo(() => {
    const typeCards = allCards.filter(c =>
      draftType === "Occupation" ? c.type === "Occupation" : c.type === "MinorImprovement"
    );
    const deckSet = new Set(typeCards.map(c => c.deck).filter(Boolean));
    return [...deckSet].sort();
  }, [allCards, draftType]);

  useEffect(() => {
    setSelectedDecks(availableDecks.length > 0 ? [...availableDecks] : []);
  }, [availableDecks]);

  const toggleDeck = useCallback((deck) => {
    setSelectedDecks(prev => {
      if (!prev) return [deck];
      if (prev.includes(deck)) {
        if (prev.length <= 1) return prev;
        return prev.filter(d => d !== deck);
      }
      return [...prev, deck];
    });
  }, []);

  const selectAllDecks = useCallback(() => setSelectedDecks([...availableDecks]), [availableDecks]);
  const selectNoDecksExcept = useCallback((deck) => setSelectedDecks([deck]), []);

  const draftableCards = useMemo(() => {
    const decks = selectedDecks || availableDecks;
    return allCards.filter(c => {
      if (draftType === "Occupation" ? c.type !== "Occupation" : c.type !== "MinorImprovement") return false;
      return decks.includes(c.deck);
    });
  }, [allCards, draftType, selectedDecks, availableDecks]);

  const canStart = username.trim() && (selectedDecks || []).length > 0 && draftableCards.length >= PACK_SIZE * NUM_PLAYERS;

  const startDraft = useCallback(() => {
    if (!canStart) return;
    const pool = [...draftableCards];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const newPacks = [];
    for (let p = 0; p < NUM_PLAYERS; p++) {
      newPacks.push(pool.splice(0, PACK_SIZE));
    }
    setPacks(newPacks);
    setMyPicks([]);
    setPickOrder([]);
    setRound(1);
    setSaved(false);
    setPhase("drafting");
  }, [canStart, draftableCards]);

  const handlePick = useCallback((card) => {
    const currentPack = packs[0];
    if (!currentPack.find(c => c.id === card.id)) return;
    const newPicks = [...myPicks, card.id];
    const newPickOrder = [...pickOrder, round];
    const newPacks = packs.map((pack) => [...pack]);
    newPacks[0] = newPacks[0].filter(c => c.id !== card.id);
    for (let npc = 1; npc < NUM_PLAYERS; npc++) {
      const pick = npcPick(newPacks[npc], npc - 1);
      if (pick) newPacks[npc] = newPacks[npc].filter(c => c.id !== pick.id);
    }
    const rotated = [newPacks[1], newPacks[2], newPacks[3], newPacks[0]];
    setMyPicks(newPicks);
    setPickOrder(newPickOrder);
    setPacks(rotated);
    if (newPicks.length >= MAX_PICKS) setPhase("results");
    else setRound(round + 1);
  }, [packs, myPicks, pickOrder, round]);

  const handleSave = useCallback(async () => {
    try {
      await saveDraft(username, draftType, myPicks, pickOrder);
      setSaved(true);
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
  }, [username, draftType, myPicks, pickOrder]);

  const resetDraft = useCallback(() => {
    setPhase("setup");
    setMyPicks([]);
    setPickOrder([]);
    setPacks([[], [], [], []]);
    setSaved(false);
    setShowCommunity(false);
  }, []);

  // ── Setup screen ──────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", background: T.bg }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 460, width: "100%", padding: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: T.accent, marginBottom: 4 }}>Agricola Drafter</div>
              <div style={{ fontSize: 14, color: T.textSecondary }}>
                Draft 7 cards from rotating packs against 3 NPCs
              </div>
            </div>

            {/* Username */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Your Name
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Enter your name..."
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: T.surface, border: `1px solid ${T.border}`, color: T.text,
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Draft type */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Draft Type
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Occupation", "\uD83D\uDC64 Occupations"], ["MinorImprovement", "\uD83D\uDD27 Minor Improvements"]].map(([val, label]) => (
                  <button key={val} onClick={() => setDraftType(val)}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: 10,
                      border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      borderColor: draftType === val ? T.accent : T.border,
                      background: draftType === val ? T.accentBg : T.surface,
                      color: draftType === val ? T.accent : T.textSecondary,
                      transition: "all 0.15s",
                    }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Card pool toggle */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Card Pool
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setNorwayOnly(false)}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid",
                    borderColor: !norwayOnly ? T.blue : T.border,
                    background: !norwayOnly ? "#eff6ff" : T.surface,
                    color: !norwayOnly ? T.blue : T.textSecondary,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  }}>All Cards</button>
                <button onClick={() => setNorwayOnly(true)}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid",
                    borderColor: norwayOnly ? T.red : T.border,
                    background: norwayOnly ? "#fef2f2" : T.surface,
                    color: norwayOnly ? T.red : T.textSecondary,
                    fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                  }}>{"\uD83C\uDDF3\uD83C\uDDF4"} Norway Deck</button>
              </div>
            </div>

            {/* Deck selection */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                  Decks
                </label>
                <button onClick={selectAllDecks}
                  style={{
                    background: "none", border: "none", color: T.blue, fontSize: 10,
                    cursor: "pointer", textDecoration: "underline",
                  }}>Select all</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {availableDecks.map(deck => {
                  const active = (selectedDecks || []).includes(deck);
                  return (
                    <button key={deck}
                      onClick={() => toggleDeck(deck)}
                      onDoubleClick={() => selectNoDecksExcept(deck)}
                      title={active ? "Click to remove · Double-click to select only this deck" : "Click to add"}
                      style={{
                        padding: "4px 10px", borderRadius: 99, border: "1px solid",
                        borderColor: active ? T.purple : T.border,
                        background: active ? "#f5f3ff" : "transparent",
                        color: active ? T.purple : T.textMuted,
                        fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                        fontWeight: active ? 600 : 400,
                      }}>{deck}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                {draftableCards.length} cards in pool
                {draftableCards.length < PACK_SIZE * NUM_PLAYERS && draftableCards.length > 0 && (
                  <span style={{ color: T.accent, marginLeft: 6 }}>
                    (need at least {PACK_SIZE * NUM_PLAYERS} cards — select more decks)
                  </span>
                )}
              </div>
            </div>

            {/* Start */}
            <button onClick={startDraft}
              disabled={!canStart}
              style={{
                width: "100%", padding: "14px 24px", borderRadius: 10, border: "none",
                background: canStart ? T.accent : T.border,
                color: canStart ? "#fff" : T.textMuted,
                fontSize: 16, fontWeight: 700, cursor: canStart ? "pointer" : "default",
                transition: "all 0.2s",
              }}>
              Start Draft
            </button>

            {/* Community stats link */}
            <button onClick={() => setShowCommunity(s => !s)}
              style={{
                width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: showCommunity ? T.surfaceAlt : "transparent",
                color: T.textSecondary, fontSize: 12, cursor: "pointer",
              }}>
              {showCommunity ? "Hide" : "View"} Community Stats
            </button>

            {showCommunity && (
              <div style={{ marginTop: 12, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
                <CommunityStats allCards={allCards} draftType={draftType} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Drafting screen ───────────────────────────────────────────────────
  if (phase === "drafting") {
    const currentPack = packs[0] || [];

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: T.bg }}>
        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 16px",
          borderBottom: `1px solid ${T.border}`, gap: 12, flexShrink: 0, flexWrap: "wrap",
          background: T.surface,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.accent }}>
            Round {round}/{MAX_PICKS}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted }}>
            {currentPack.length} cards in pack · Pick {myPicks.length + 1} of {MAX_PICKS}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {myPicks.length > 0 && (
              <button onClick={() => setShowDraftHand(s => !s)}
                style={{
                  background: showDraftHand ? T.accentBg : T.surfaceAlt,
                  border: `1px solid ${showDraftHand ? T.accent : T.border}`,
                  borderRadius: 8, color: showDraftHand ? T.accent : T.textMuted,
                  padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                {"\u270B"} {myPicks.length}
              </button>
            )}
            {myPicks.map((id, i) => {
              const c = allCards.find(x => x.id === id);
              return (
                <div key={id} title={c?.name} style={{
                  width: 28, height: 28, borderRadius: 6, background: T.accentLight,
                  border: `1px solid ${T.accent}44`, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, color: T.accent, fontWeight: 700,
                }}>{i + 1}</div>
              );
            })}
            {Array.from({ length: MAX_PICKS - myPicks.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                width: 28, height: 28, borderRadius: 6,
                border: `1px dashed ${T.border}`,
              }} />
            ))}
          </div>
        </div>

        {/* Picked hand panel (collapsible) */}
        {showDraftHand && myPicks.length > 0 && (
          <div style={{
            borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt,
            padding: "10px 16px", flexShrink: 0,
          }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              My Picks ({myPicks.length}/{MAX_PICKS})
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
            }}>
              {myPicks.map((id, i) => {
                const c = allCards.find(x => x.id === id);
                if (!c) return null;
                const src = cardImgSrc(c);
                return (
                  <div key={id} style={{
                    borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`,
                    background: T.surface, width: 105, flexShrink: 0,
                  }}>
                    <div style={{ position: "relative", width: 105, height: 138, overflow: "hidden", background: T.surfaceAlt }}>
                      {src ? (
                        <img src={src} alt={c.name}
                          style={{ width: 105, height: 138, objectFit: "cover", objectPosition: "top", display: "block" }}
                        />
                      ) : (
                        <div style={{ padding: 6, fontSize: 9, color: T.textMuted, textAlign: "center", lineHeight: 1.3 }}>
                          <div style={{ fontWeight: 700, color: T.text, marginBottom: 2 }}>{c.name}</div>
                          {c.deck}
                        </div>
                      )}
                      <div style={{
                        position: "absolute", top: 2, left: 2, background: "rgba(255,255,255,0.85)", borderRadius: 99,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700, color: T.accent,
                      }}>#{i + 1}</div>
                    </div>
                    <div style={{ padding: "4px 6px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Card grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 12, color: T.textSecondary, fontSize: 13 }}>
            Choose a card from this pack:
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 12, maxWidth: 900, margin: "0 auto",
          }}>
            {currentPack.map(card => (
              <DraftCard key={card.id} card={card} onPick={handlePick} disabled={false} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────────────
  if (phase === "results") {
    return (
      <div style={{ height: "100%", overflow: "auto", background: T.bg }}>
        <DraftResults
          picks={myPicks}
          allCards={allCards}
          draftType={draftType}
          username={username}
          onSave={handleSave}
          onNewDraft={resetDraft}
          saved={saved}
        />

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 24px" }}>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
            <CommunityStats allCards={allCards} draftType={draftType} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
