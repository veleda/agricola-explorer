import { useState, useCallback, useEffect, useMemo } from "react";

const API_BASE = "";

// ── Light theme palette (matches drafter) ────────────────────────────────────
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

const DRAFT_TYPE_TABS = [
  { key: "Occupation", label: "Occupations" },
  { key: "MinorImprovement", label: "Minor Improvements" },
  { key: "MiniOccupation", label: "Mini Occupations" },
  { key: "MiniMinorImprovement", label: "Mini Minor Imps" },
  { key: "FullCombo", label: "Full Draft" },
  { key: "MiniCombo", label: "Mini Full Draft" },
];

// Combo draft types have both occupations and minor improvements
const COMBO_DRAFT_TYPES = new Set(["FullCombo", "MiniCombo"]);
const COMBO_PICK_SPLIT = { FullCombo: 7, MiniCombo: 5 }; // first N picks are occupations

// ── API helpers ──────────────────────────────────────────────────────────────
async function searchHands(q, draftType, page) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (draftType) params.set("draftType", draftType);
  params.set("page", page);
  params.set("pageSize", 20);
  const res = await fetch(`${API_BASE}/api/hands?${params}`);
  return res.json();
}

async function fetchTwins(picksHash) {
  const res = await fetch(`${API_BASE}/api/hands/twins/${picksHash}`);
  return res.json();
}

async function fetchPopular(draftType) {
  const params = draftType ? `?draftType=${draftType}&limit=12` : "?limit=12";
  const res = await fetch(`${API_BASE}/api/hands/popular${params}`);
  return res.json();
}

function cardImgSrc(card) {
  if (!card || !card.imageUrl) return null;
  return `${API_BASE}/api/imgproxy?url=${encodeURIComponent(card.imageUrl)}`;
}

// ── Card image with fallback (small version for table) ───────────────────────
function SmallCardImage({ card }) {
  const [failed, setFailed] = useState(false);
  const src = cardImgSrc(card);
  if (!src || failed) {
    return (
      <div style={{
        width: 36, height: 48, borderRadius: 4, background: T.surfaceAlt,
        border: `1px solid ${T.border}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 7, color: T.textMuted, textAlign: "center",
        lineHeight: 1.2, padding: 2, flexShrink: 0,
      }}>
        {card?.name?.split(" ")[0] || "?"}
      </div>
    );
  }
  return (
    <img src={src} alt={card.name} title={card.name}
      style={{ width: 36, height: 48, borderRadius: 4, objectFit: "cover", objectPosition: "top", flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

// ── Full card display for expanded view ──────────────────────────────────────
function ExpandedCardImage({ card }) {
  const [failed, setFailed] = useState(false);
  const src = cardImgSrc(card);
  if (!src || failed) {
    return (
      <div style={{
        width: 100, borderRadius: 6, background: T.surfaceAlt,
        border: `1px solid ${T.border}`, padding: 8, textAlign: "center",
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 4 }}>{card.name}</div>
        <div style={{ fontSize: 9, color: T.textMuted }}>{card.deck}</div>
        {card.winRatio > 0 && <div style={{ fontSize: 9, color: T.blue }}>Win {(card.winRatio * 100).toFixed(0)}%</div>}
      </div>
    );
  }
  return (
    <div style={{ width: 100, flexShrink: 0 }}>
      <img src={src} alt={card.name} title={card.name}
        style={{ width: 100, borderRadius: 6, display: "block", border: `1px solid ${T.border}` }}
        onError={() => setFailed(true)}
      />
      <div style={{ fontSize: 9, fontWeight: 600, color: T.text, marginTop: 3, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {card.name}
      </div>
      <div style={{ fontSize: 8, color: T.textMuted, textAlign: "center" }}>
        {card.deck}{card.winRatio > 0 ? ` · ${(card.winRatio * 100).toFixed(0)}%` : ""}
      </div>
    </div>
  );
}

// ── Twin badge ───────────────────────────────────────────────────────────────
function TwinBadge({ hand, onShowTwins }) {
  const [twinData, setTwinData] = useState(null);
  const hash = hand.picksHash;

  useEffect(() => {
    if (!hash) return;
    fetchTwins(hash).then(d => {
      if (d.total > 1) setTwinData(d);
    }).catch(() => {});
  }, [hash]);

  if (!twinData || twinData.total <= 1) return null;

  const otherCount = twinData.total - 1;
  return (
    <button onClick={(e) => { e.stopPropagation(); onShowTwins(twinData); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 99,
        background: "#fef2f2", border: `1px solid ${T.red}33`,
        color: T.red, fontSize: 10, fontWeight: 600,
        cursor: "pointer", whiteSpace: "nowrap",
      }}>
      <span style={{ fontSize: 12 }}>{"\uD83D\uDC6F"}</span>
      {otherCount} twin{otherCount > 1 ? "s" : ""}
    </button>
  );
}

// ── Popular cards bar ────────────────────────────────────────────────────────
function PopularCardsBar({ draftType, cardMap }) {
  const [popular, setPopular] = useState(null);

  useEffect(() => {
    fetchPopular(draftType).then(setPopular).catch(() => {});
  }, [draftType]);

  if (!popular || popular.totalHands === 0) return null;

  return (
    <div style={{
      padding: "14px 18px", background: T.surface,
      borderRadius: 10, border: `1px solid ${T.border}`,
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
          Most Popular Cards
        </div>
        <div style={{ fontSize: 10, color: T.textMuted }}>
          {popular.totalHands} hands total
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {popular.cards.map(({ cardId, cardName, count, percentage }, i) => {
          const card = cardMap[cardId];
          return (
            <div key={cardId} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 8,
              background: i < 3 ? T.accentBg : T.surfaceAlt,
              border: `1px solid ${i < 3 ? T.accent + "33" : T.border}`,
            }}>
              {i < 3 && <span style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>#{i + 1}</span>}
              <span style={{ fontSize: 11, fontWeight: 500, color: T.text }}>{cardName}</span>
              <span style={{ fontSize: 9, color: T.textMuted }}>{count}x</span>
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 99,
                background: percentage > 50 ? T.greenLight : "transparent",
                color: percentage > 50 ? T.green : T.blue,
                fontWeight: 600,
              }}>{percentage}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Twins modal ──────────────────────────────────────────────────────────────
function TwinsModal({ twinData, cardMap, onClose }) {
  if (!twinData) return null;
  const hand = twinData.twins[0];
  const pickCards = (hand?.picks || []).map(id => cardMap[id]).filter(Boolean);

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
      }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: T.surface, borderRadius: 12, padding: 24,
        maxWidth: 600, width: "90vw", maxHeight: "80vh", overflow: "auto",
        zIndex: 1001, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
              {"\uD83D\uDC6F"} Identical Hands ({twinData.total} players)
            </div>
            <div style={{ fontSize: 11, color: T.textMuted }}>These players all drafted the exact same cards</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: 20, color: T.textMuted, cursor: "pointer",
          }}>{"\u2715"}</button>
        </div>

        {/* Show the shared hand */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, justifyContent: "center" }}>
          {pickCards.map(c => (
            <ExpandedCardImage key={c.id} card={c} />
          ))}
        </div>

        {/* List all twin players */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {twinData.twins.map(d => (
            <div key={d.id} style={{
              padding: "8px 12px", borderRadius: 8, background: T.surfaceAlt,
              border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <span style={{ fontWeight: 600, color: T.text, fontSize: 13 }}>{d.username}</span>
                {d.comment && (
                  <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 2, fontStyle: "italic" }}>
                    "{d.comment}"
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, color: T.textMuted }}>{new Date(d.timestamp).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


// ── Expandable hand row ──────────────────────────────────────────────────────
function HandRow({ hand, cardMap, isExpanded, onToggle, onShowTwins }) {
  const pickCards = hand.picks.map(id => cardMap[id]).filter(Boolean);
  const avgWin = pickCards.length > 0 ? pickCards.reduce((s, c) => s + (c.winRatio || 0), 0) / pickCards.length : 0;
  const isMini = hand.draftType?.startsWith("Mini");
  const isCombo = COMBO_DRAFT_TYPES.has(hand.draftType);
  const comboSplit = COMBO_PICK_SPLIT[hand.draftType] || 0;
  const occCards = isCombo ? pickCards.slice(0, comboSplit) : [];
  const minorCards = isCombo ? pickCards.slice(comboSplit) : [];

  return (
    <div style={{
      borderRadius: 8, overflow: "hidden",
      border: `1px solid ${isExpanded ? T.accent + "66" : T.border}`,
      background: isExpanded ? T.surface : T.surface,
      transition: "all 0.15s",
    }}>
      {/* Summary row */}
      <div onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          cursor: "pointer", flexWrap: "wrap",
        }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.surfaceAlt; }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Player info */}
        <div style={{ minWidth: 100, flex: "0 0 auto" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{hand.username}</div>
          <div style={{ fontSize: 10, color: T.textMuted }}>
            {new Date(hand.timestamp).toLocaleDateString()}
            {isMini && <span style={{ marginLeft: 4, color: T.red }}>{"\uD83C\uDDF3\uD83C\uDDF4"}</span>}
          </div>
        </div>

        {/* Card thumbnails */}
        <div style={{ display: "flex", gap: 3, flex: 1, minWidth: 0, overflow: "hidden" }}>
          {pickCards.slice(0, isCombo ? 10 : 7).map((c, i) => (
            <span key={c.id} style={{ display: "inline-flex", borderLeft: isCombo && i === comboSplit ? `2px solid ${T.accent}44` : "none", paddingLeft: isCombo && i === comboSplit ? 3 : 0 }}>
              <SmallCardImage card={c} />
            </span>
          ))}
          {pickCards.length > (isCombo ? 10 : 7) && (
            <div style={{ fontSize: 10, color: T.textMuted, alignSelf: "center" }}>+{pickCards.length - (isCombo ? 10 : 7)}</div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.blue, fontWeight: 600 }}>
            {(avgWin * 100).toFixed(0)}% avg
          </span>
          <TwinBadge hand={hand} onShowTwins={onShowTwins} />
          <span style={{
            fontSize: 14, color: T.textMuted, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s", display: "inline-block",
          }}>{"\u25BC"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{
          padding: "12px 14px 16px", borderTop: `1px solid ${T.border}`,
          background: T.surfaceAlt,
        }}>
          {/* Comment */}
          {hand.comment && (
            <div style={{
              marginBottom: 12, padding: "8px 12px", borderRadius: 8,
              background: T.surface, border: `1px solid ${T.border}`,
              fontSize: 12, color: T.textSecondary, fontStyle: "italic", lineHeight: 1.5,
            }}>
              "{hand.comment}"
            </div>
          )}

          {/* Card images — split by type for combo hands */}
          {isCombo ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                {"\uD83D\uDC64"} Occupations
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 }}>
                {occCards.map((c, i) => (
                  <div key={c.id} style={{ position: "relative" }}>
                    <ExpandedCardImage card={c} />
                    <div style={{
                      position: "absolute", top: 2, left: 2,
                      background: "rgba(255,255,255,0.9)", borderRadius: 99,
                      padding: "1px 5px", fontSize: 8, fontWeight: 700, color: T.accent,
                    }}>#{i + 1}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                {"\uD83D\uDD27"} Minor Improvements
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {minorCards.map((c, i) => (
                  <div key={c.id} style={{ position: "relative" }}>
                    <ExpandedCardImage card={c} />
                    <div style={{
                      position: "absolute", top: 2, left: 2,
                      background: "rgba(255,255,255,0.9)", borderRadius: 99,
                      padding: "1px 5px", fontSize: 8, fontWeight: 700, color: T.purple,
                    }}>#{i + 1}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {pickCards.map((c, i) => (
                <div key={c.id} style={{ position: "relative" }}>
                  <ExpandedCardImage card={c} />
                  <div style={{
                    position: "absolute", top: 2, left: 2,
                    background: "rgba(255,255,255,0.9)", borderRadius: 99,
                    padding: "1px 5px", fontSize: 8, fontWeight: 700, color: T.accent,
                  }}>#{i + 1}</div>
                </div>
              ))}
            </div>
          )}

          {/* Stats summary */}
          <div style={{
            display: "flex", gap: 12, justifyContent: "center", marginTop: 12, flexWrap: "wrap",
          }}>
            {pickCards.map(c => (
              <div key={c.id} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text }}>{c.name}</div>
                <div style={{ fontSize: 9, color: T.textMuted }}>
                  {c.winRatio > 0 && <span style={{ color: T.blue }}>Win {(c.winRatio * 100).toFixed(0)}%</span>}
                  {c.pwr > 0 && <span style={{ color: T.purple, marginLeft: 4 }}>PWR {c.pwr.toFixed(1)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Combos */}
          {hand.combos && hand.combos.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, textAlign: "center" }}>
                Tagged Combos
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {hand.combos.map((combo, idx) => {
                  const comboCards = (combo.cardIds || []).map(id => cardMap[id]).filter(Boolean);
                  return (
                    <div key={idx} style={{
                      padding: "6px 10px", borderRadius: 6, background: T.surface,
                      border: `1px solid ${T.blue}22`, display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ fontSize: 12 }}>{"\uD83D\uDD17"}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
                          {comboCards.map(c => c.name).join(" + ")}
                        </div>
                        {combo.comment && (
                          <div style={{ fontSize: 10, color: T.textSecondary, fontStyle: "italic" }}>
                            "{combo.comment}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Main Component ───────────────────────────────────────────────────────────
export default function CommunityHands({ allCards, initialDraftType }) {
  const [activeTab, setActiveTab] = useState(initialDraftType || "Occupation");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [twinsModal, setTwinsModal] = useState(null);

  const cardMap = useMemo(() => {
    const m = {};
    allCards.forEach(c => { m[c.id] = c; });
    return m;
  }, [allCards]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch hands
  useEffect(() => {
    setLoading(true);
    searchHands(debouncedQuery, activeTab, page)
      .then(data => { setResults(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQuery, activeTab, page]);

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [activeTab]);

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div style={{
      height: "100%", overflow: "auto", background: T.bg,
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.accent, marginBottom: 4 }}>
            Community Hands
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary }}>
            Browse drafted hands from the community. Search by card name or player nickname.
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap",
          borderBottom: `1px solid ${T.border}`, paddingBottom: 1,
        }}>
          {DRAFT_TYPE_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "8px 16px", borderRadius: "8px 8px 0 0",
                  border: `1px solid ${isActive ? T.accent : "transparent"}`,
                  borderBottom: isActive ? `2px solid ${T.accent}` : `2px solid transparent`,
                  background: isActive ? T.accentBg : "transparent",
                  color: isActive ? T.accent : T.textSecondary,
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Popular cards */}
        <PopularCardsBar draftType={activeTab} cardMap={cardMap} />

        {/* Search bar */}
        <div style={{
          display: "flex", gap: 8, marginBottom: 16, alignItems: "center",
        }}>
          <div style={{ position: "relative", flex: 1 }}>
            <span style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 14, color: T.textMuted, pointerEvents: "none",
            }}>{"\uD83D\uDD0D"}</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by card name or player nickname..."
              style={{
                width: "100%", padding: "10px 14px 10px 36px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.surface,
                fontSize: 13, color: T.text, outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              style={{
                padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.surface, color: T.textMuted, fontSize: 12,
                cursor: "pointer",
              }}>Clear</button>
          )}
        </div>

        {/* Results count */}
        {results && (
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
            {results.total} hand{results.total !== 1 ? "s" : ""} found
            {debouncedQuery && ` for "${debouncedQuery}"`}
            {" "}— page {results.page} of {results.totalPages}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>
            Loading community hands...
          </div>
        )}

        {/* Empty state */}
        {!loading && results && results.hands.length === 0 && (
          <div style={{
            padding: 40, textAlign: "center", borderRadius: 10,
            background: T.surface, border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{"\uD83C\uDCCF"}</div>
            <div style={{ fontSize: 14, color: T.textSecondary }}>
              {debouncedQuery
                ? `No hands found matching "${debouncedQuery}"`
                : "No community hands yet for this category. Draft some cards and save to community!"}
            </div>
          </div>
        )}

        {/* Hands list */}
        {!loading && results && results.hands.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.hands.map(hand => (
              <HandRow
                key={hand.id}
                hand={hand}
                cardMap={cardMap}
                isExpanded={expandedId === hand.id}
                onToggle={() => toggleExpand(hand.id)}
                onShowTwins={setTwinsModal}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {results && results.totalPages > 1 && (
          <div style={{
            display: "flex", justifyContent: "center", gap: 8, marginTop: 20,
          }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              style={{
                padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
                background: page <= 1 ? T.surfaceAlt : T.surface,
                color: page <= 1 ? T.textMuted : T.text,
                fontSize: 12, cursor: page <= 1 ? "default" : "pointer",
              }}>{"\u2190"} Previous</button>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {Array.from({ length: Math.min(results.totalPages, 7) }, (_, i) => {
                let pageNum;
                if (results.totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= results.totalPages - 3) {
                  pageNum = results.totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    style={{
                      width: 32, height: 32, borderRadius: 6,
                      border: pageNum === page ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
                      background: pageNum === page ? T.accentBg : T.surface,
                      color: pageNum === page ? T.accent : T.text,
                      fontSize: 12, fontWeight: pageNum === page ? 700 : 400,
                      cursor: "pointer",
                    }}>{pageNum}</button>
                );
              })}
            </div>
            <button onClick={() => setPage(p => Math.min(results.totalPages, p + 1))}
              disabled={page >= (results?.totalPages || 1)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
                background: page >= (results?.totalPages || 1) ? T.surfaceAlt : T.surface,
                color: page >= (results?.totalPages || 1) ? T.textMuted : T.text,
                fontSize: 12, cursor: page >= (results?.totalPages || 1) ? "default" : "pointer",
              }}>Next {"\u2192"}</button>
          </div>
        )}
      </div>

      {/* Twins modal */}
      {twinsModal && (
        <TwinsModal
          twinData={twinsModal}
          cardMap={cardMap}
          onClose={() => setTwinsModal(null)}
        />
      )}
    </div>
  );
}
