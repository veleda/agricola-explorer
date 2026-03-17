import { useState, useCallback, useEffect, useMemo } from "react";

const API_BASE = "";
const MAX_PICKS = 7;
const PACK_SIZE = 9;      // initial cards per pack
const NUM_PLAYERS = 4;    // you + 3 NPCs

// ── NPC strategy ────────────────────────────────────────────────────────────
// 1 random NPC, 2 win-rate-weighted NPCs
function npcPick(cards, strategyIndex) {
  if (cards.length === 0) return null;
  if (strategyIndex === 0) {
    // Random
    return cards[Math.floor(Math.random() * cards.length)];
  }
  // Win-rate weighted: pick from top 3 by win rate with some randomness
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
      background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
      padding: "14px 12px", gap: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
        {card.name}
      </div>
      {card.costLabel && (
        <div style={{ fontSize: 10, color: "#cbd5e1" }}>
          <span style={{ color: "#64748b" }}>Cost: </span>{card.costLabel}
        </div>
      )}
      {card.prerequisite && (
        <div style={{ fontSize: 10, color: "#f59e0b" }}>
          <span style={{ color: "#64748b" }}>Prereq: </span>{card.prerequisite}
        </div>
      )}
      {card.text && (
        <div style={{
          fontSize: 10, color: "#94a3b8", lineHeight: 1.45, fontStyle: "italic",
          borderLeft: "2px solid #334155", paddingLeft: 6, marginTop: 2,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
        }}>
          {card.text}
        </div>
      )}
      {card.gains && card.gains.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {card.gains.slice(0, 4).map(g => (
            <span key={g} style={{
              padding: "1px 6px", borderRadius: 99, background: "#10b98118",
              color: "#10b981", fontSize: 9,
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
      style={{ width: "100%", display: "block", background: "#1e293b" }}
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
        border: hover && !disabled ? "2px solid #f59e0b" : "2px solid #1e293b",
        background: "#0f172a",
        transition: "all 0.2s",
        transform: hover && !disabled ? "scale(1.03)" : "scale(1)",
        opacity: disabled ? 0.4 : 1,
        maxWidth: 180,
      }}>
      <CardImageOrFallback card={card} />
      <div style={{ padding: "6px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.name}
        </div>
        <div style={{ fontSize: 10, color: "#64748b", display: "flex", gap: 6, marginTop: 2 }}>
          <span>{card.deck}</span>
          {card.winRatio > 0 && <span style={{ color: "#3b82f6" }}>{(card.winRatio * 100).toFixed(0)}%</span>}
          {card.pwr > 0 && <span style={{ color: "#a855f7" }}>PWR {card.pwr.toFixed(1)}</span>}
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
        <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>Draft Complete!</div>
        <div style={{ fontSize: 14, color: "#94a3b8" }}>Your {typeName} hand</div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", gap: 16, justifyContent: "center", marginBottom: 24,
        flexWrap: "wrap",
      }}>
        {[
          ["Avg Win Rate", `${(avgWin * 100).toFixed(1)}%`, "#3b82f6"],
          ["Avg PWR", avgPwr > 0 ? avgPwr.toFixed(2) : "N/A", "#a855f7"],
          ["Total Cost Items", totalCostItems, "#f59e0b"],
          ["Cards", pickCards.length, "#10b981"],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            padding: "10px 20px", borderRadius: 10, background: "#1e293b",
            border: "1px solid #334155", textAlign: "center", minWidth: 100,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Card images grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {pickCards.map((c, i) => (
          <div key={c.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #334155", background: "#0f172a" }}>
            <div style={{ position: "relative" }}>
              <CardImageOrFallback card={c} />
              <div style={{
                position: "absolute", top: 4, left: 4, background: "#0f172a", borderRadius: 99,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#f59e0b",
              }}>Pick {i + 1}</div>
            </div>
            <div style={{ padding: "6px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#f1f5f9" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>
                {c.deck} · {(c.winRatio * 100).toFixed(0)}%
                {c.pwr > 0 && <span style={{ color: "#a855f7", marginLeft: 4 }}>PWR {c.pwr.toFixed(1)}</span>}
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
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#0f172a", fontSize: 14, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 12px #f59e0b44",
            }}>
            Save to Community
          </button>
        ) : (
          <div style={{ padding: "10px 24px", borderRadius: 8, background: "#10b98122", color: "#10b981", fontSize: 14, fontWeight: 600 }}>
            Saved!
          </div>
        )}
        <button onClick={onNewDraft}
          style={{
            padding: "10px 24px", borderRadius: 8,
            border: "1px solid #334155", background: "#1e293b",
            color: "#e2e8f0", fontSize: 14, fontWeight: 600, cursor: "pointer",
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

  if (loading) return <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>Loading community stats...</div>;
  if (!stats || stats.totalDrafts === 0) return <div style={{ padding: 24, color: "#64748b", textAlign: "center" }}>No community drafts yet. Be the first!</div>;

  const typeName = draftType === "Occupation" ? "Occupation" : "Minor Improvement";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 12 }}>
        Community {typeName} Drafts
        <span style={{ marginLeft: 8, fontSize: 11, color: "#64748b" }}>{stats.totalDrafts} total</span>
      </div>

      {/* Overall most picked */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Most Drafted Overall</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {stats.overallTop.slice(0, 8).map(({ cardId, count }) => {
            const c = cardMap[cardId];
            return c ? (
              <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 28, textAlign: "right", color: "#f59e0b", fontWeight: 700 }}>{count}x</div>
                <span style={{ color: "#f1f5f9" }}>{c.name}</span>
                <span style={{ color: "#475569", fontSize: 10 }}>{c.deck}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Top picks by round */}
      {["1", "2", "3"].map(rnd => stats.roundTop[rnd] && (
        <div key={rnd} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Most Popular Pick #{rnd}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {stats.roundTop[rnd].slice(0, 3).map(({ cardId, count }) => {
              const c = cardMap[cardId];
              return c ? (
                <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 24, textAlign: "right", color: "#3b82f6", fontWeight: 600 }}>{count}</div>
                  <span style={{ color: "#cbd5e1" }}>{c.name}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      ))}

      {/* Recent drafts */}
      {drafts && drafts.drafts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Recent Hands</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drafts.drafts.slice(0, 10).map(d => (
              <div key={d.id} style={{
                padding: "6px 10px", borderRadius: 8, background: "#1e293b",
                border: "1px solid #334155", fontSize: 11,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{d.username}</span>
                  <span style={{ color: "#475569", fontSize: 10 }}>{new Date(d.timestamp).toLocaleDateString()}</span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 10 }}>
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
export default function Drafter({ allCards }) {
  // Phase: "setup" → "drafting" → "results"
  const [phase, setPhase] = useState("setup");
  const [draftType, setDraftType] = useState("Occupation");
  const [username, setUsername] = useState("");

  // Draft state
  const [packs, setPacks] = useState([[], [], [], []]);  // 4 player packs
  const [myPicks, setMyPicks] = useState([]);             // picked card IDs in order
  const [pickOrder, setPickOrder] = useState([]);          // round number per pick
  const [round, setRound] = useState(1);
  const [saved, setSaved] = useState(false);

  // Community tab
  const [showCommunity, setShowCommunity] = useState(false);

  // Cards available for drafting
  const draftableCards = useMemo(() => {
    return allCards.filter(c => {
      if (draftType === "Occupation") return c.type === "Occupation";
      return c.type === "MinorImprovement";
    });
  }, [allCards, draftType]);

  // Start a new draft
  const startDraft = useCallback(() => {
    if (!username.trim()) return;

    // Shuffle and deal 4 packs of PACK_SIZE
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
  }, [username, draftableCards]);

  // Player picks a card from their current pack
  const handlePick = useCallback((card) => {
    const myPackIndex = 0;  // player always picks from pack 0
    const currentPack = packs[myPackIndex];

    if (!currentPack.find(c => c.id === card.id)) return;

    // Record player pick
    const newPicks = [...myPicks, card.id];
    const newPickOrder = [...pickOrder, round];

    // NPCs pick from their packs
    const newPacks = packs.map((pack, i) => [...pack]);

    // Remove player's pick from pack 0
    newPacks[0] = newPacks[0].filter(c => c.id !== card.id);

    // NPCs pick from packs 1, 2, 3
    for (let npc = 1; npc < NUM_PLAYERS; npc++) {
      const pick = npcPick(newPacks[npc], npc - 1);  // 0=random, 1,2=smart
      if (pick) {
        newPacks[npc] = newPacks[npc].filter(c => c.id !== pick.id);
      }
    }

    // Rotate packs: each player passes their pack to the left
    const rotated = [
      newPacks[1],
      newPacks[2],
      newPacks[3],
      newPacks[0],
    ];

    setMyPicks(newPicks);
    setPickOrder(newPickOrder);
    setPacks(rotated);

    if (newPicks.length >= MAX_PICKS) {
      setPhase("results");
    } else {
      setRound(round + 1);
    }
  }, [packs, myPicks, pickOrder, round]);

  // Save to server
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
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 460, width: "100%", padding: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>Agricola Drafter</div>
              <div style={{ fontSize: 14, color: "#94a3b8" }}>
                Draft 7 cards from rotating packs against 3 NPCs
              </div>
            </div>

            {/* Username */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Your Name
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Enter your name..."
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "#020617", border: "1px solid #1e293b", color: "#e2e8f0",
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Draft type */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Draft Type
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Occupation", "\uD83D\uDC64 Occupations"], ["MinorImprovement", "\uD83D\uDD27 Minor Improvements"]].map(([val, label]) => (
                  <button key={val} onClick={() => setDraftType(val)}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: 10,
                      border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      borderColor: draftType === val ? "#f59e0b" : "#334155",
                      background: draftType === val ? "#f59e0b18" : "#1e293b",
                      color: draftType === val ? "#f59e0b" : "#94a3b8",
                      transition: "all 0.15s",
                    }}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                {draftableCards.length} cards in pool
              </div>
            </div>

            {/* Start */}
            <button onClick={startDraft}
              disabled={!username.trim()}
              style={{
                width: "100%", padding: "14px 24px", borderRadius: 10, border: "none",
                background: username.trim() ? "linear-gradient(135deg, #f59e0b, #d97706)" : "#334155",
                color: username.trim() ? "#0f172a" : "#64748b",
                fontSize: 16, fontWeight: 700, cursor: username.trim() ? "pointer" : "default",
                boxShadow: username.trim() ? "0 4px 20px #f59e0b33" : "none",
                transition: "all 0.2s",
              }}>
              Start Draft
            </button>

            {/* Community stats link */}
            <button onClick={() => setShowCommunity(s => !s)}
              style={{
                width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8,
                border: "1px solid #334155", background: showCommunity ? "#1e293b" : "transparent",
                color: "#94a3b8", fontSize: 12, cursor: "pointer",
              }}>
              {showCommunity ? "Hide" : "View"} Community Stats
            </button>

            {showCommunity && (
              <div style={{ marginTop: 12, border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
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
    const cardsLeft = PACK_SIZE - (round - 1);  // approximate

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 16px",
          borderBottom: "1px solid #1e293b", gap: 12, flexShrink: 0, flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b" }}>
            Round {round}/{MAX_PICKS}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {currentPack.length} cards in pack · Pick {myPicks.length + 1} of {MAX_PICKS}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {myPicks.map((id, i) => {
              const c = allCards.find(x => x.id === id);
              return (
                <div key={id} title={c?.name} style={{
                  width: 28, height: 28, borderRadius: 6, background: "#1e293b",
                  border: "1px solid #334155", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, color: "#f59e0b", fontWeight: 700,
                }}>{i + 1}</div>
              );
            })}
            {Array.from({ length: MAX_PICKS - myPicks.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                width: 28, height: 28, borderRadius: 6,
                border: "1px dashed #334155",
              }} />
            ))}
          </div>
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 12, color: "#94a3b8", fontSize: 13 }}>
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
      <div style={{ height: "100%", overflow: "auto" }}>
        <DraftResults
          picks={myPicks}
          allCards={allCards}
          draftType={draftType}
          username={username}
          onSave={handleSave}
          onNewDraft={resetDraft}
          saved={saved}
        />

        {/* Community stats below results */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 24px" }}>
          <div style={{ border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
            <CommunityStats allCards={allCards} draftType={draftType} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
