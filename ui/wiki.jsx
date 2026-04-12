import { useState, useEffect, useMemo, useCallback } from "react";

const API_BASE = "";

// ── Theme matching the Ontology documentation CSS ──────────────────────────
const T = {
  bg: "#fafaf9", fg: "#1c1917", muted: "#78716c", accent: "#b45309",
  border: "#e7e5e4", cardBg: "#ffffff", codeBg: "#f5f5f4",
  link: "#b45309", linkHover: "#92400e",
  green: "#166534", greenBg: "#dcfce7",
  red: "#dc2626", redBg: "#fee2e2",
  blue: "#1e40af", blueBg: "#dbeafe",
  purple: "#7c3aed", purpleBg: "#f3e8ff",
};
const DECK_COLOURS = {
  E: "#3b82f6", I: "#8b5cf6", K: "#ec4899", Major: "#f59e0b",
  Fr: "#10b981", Wm: "#ef4444", G: "#6366f1", G4: "#14b8a6",
  G5: "#f97316", G6: "#a855f7", G7: "#06b6d4",
};
const TYPE_ICONS = { Occupation: "\uD83D\uDC64", MinorImprovement: "\uD83D\uDD27", MajorImprovement: "\u2B50" };

function cardImgSrc(c) {
  if (!c?.imageUrl) return null;
  return c.imageUrl.startsWith("/img/") ? c.imageUrl
    : `${API_BASE}/api/imgproxy?url=${encodeURIComponent(c.imageUrl)}`;
}

// ── Card Wiki ──────────────────────────────────────────────────────────────

export default function CardWiki({ allCards, initialCardId }) {
  const [selectedCardId, setSelectedCardId] = useState(initialCardId || null);

  // When navigating from Explorer with a new card, update selection
  useEffect(() => {
    if (initialCardId) setSelectedCardId(initialCardId);
  }, [initialCardId]);
  const [search, setSearch] = useState("");
  const [deckFilter, setDeckFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [wikiStats, setWikiStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/wiki/stats`).then(r => r.json()).then(setWikiStats).catch(() => {});
  }, [selectedCardId]);

  const decks = useMemo(() => [...new Set(allCards.map(c => c.deck).filter(Boolean))].sort(), [allCards]);
  const types = useMemo(() => [...new Set(allCards.map(c => c.type).filter(Boolean))].sort(), [allCards]);

  const cardsById = useMemo(() => {
    const m = {};
    allCards.forEach(c => { m[c.id] = c; });
    return m;
  }, [allCards]);

  const filtered = useMemo(() => {
    let list = allCards;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.text?.toLowerCase().includes(q));
    }
    if (deckFilter) list = list.filter(c => c.deck === deckFilter);
    if (typeFilter) list = list.filter(c => c.type === typeFilter);
    const stats = wikiStats || {};
    const comboCount = (id) => (stats.comboCounts?.[id] || 0) + (stats.handComboCounts?.[id] || 0);
    const contentCount = (id) => comboCount(id) + (stats.noboCounts?.[id] || 0) + (stats.tipCounts?.[id] || 0);
    if (sortBy === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "adp") list = [...list].sort((a, b) => (a.adp || 999) - (b.adp || 999));
    else if (sortBy === "pwr") list = [...list].sort((a, b) => (b.pwr || 0) - (a.pwr || 0));
    else if (sortBy === "combos") list = [...list].sort((a, b) => contentCount(b.id) - contentCount(a.id));
    return list;
  }, [allCards, search, deckFilter, typeFilter, sortBy, wikiStats]);

  // Group cards by type for display
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach(c => {
      const key = c.type || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return groups;
  }, [filtered]);

  if (selectedCardId) {
    return (
      <CardWikiPage
        cardId={selectedCardId}
        allCards={allCards}
        cardsById={cardsById}
        onBack={() => setSelectedCardId(null)}
        onNavigate={setSelectedCardId}
      />
    );
  }

  const stats = wikiStats || {};
  const selectStyle = {
    padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
    background: T.cardBg, color: T.fg, fontSize: "0.85rem", outline: "none",
  };

  return (
    <div style={{ height: "100%", overflow: "auto", background: T.bg, color: T.fg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: T.fg, color: T.bg, padding: "20px 0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>Card Wiki</h1>
            <div style={{ color: T.muted, fontSize: "0.9rem" }}>Community combos, anti-combos & tips</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
            <a href="/ontology" style={{ color: T.bg, opacity: 0.7, textDecoration: "none" }}>Ontology</a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        {/* Search + Filters */}
        <div style={{ marginBottom: 20 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search cards by name or text..."
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.cardBg, color: T.fg,
              fontSize: "0.9rem", outline: "none", marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={deckFilter} onChange={e => setDeckFilter(e.target.value)} style={selectStyle}>
              <option value="">All decks</option>
              {decks.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
              <option value="">All types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
              <option value="name">Sort: Name</option>
              <option value="adp">Sort: ADP rank</option>
              <option value="pwr">Sort: PWR rating</option>
              <option value="combos">Sort: Most content</option>
            </select>
            <span style={{ fontSize: "0.85rem", color: T.muted }}>
              {filtered.length} cards
            </span>
          </div>
        </div>

        {/* Card table, grouped by type */}
        {Object.entries(grouped).map(([type, cards]) => (
          <section key={type} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, borderBottom: `2px solid ${T.accent}`, paddingBottom: 6, marginBottom: 16 }}>
              {TYPE_ICONS[type] || ""} {type}s ({cards.length})
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Deck</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>PWR</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>ADP</th>
                  <th style={thStyle}>Community</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(card => {
                  const cc = ((card.combos || []).length) + (stats.comboCounts?.[card.id] || 0) + (stats.handComboCounts?.[card.id] || 0);
                  const nc = stats.noboCounts?.[card.id] || 0;
                  const tc = stats.tipCounts?.[card.id] || 0;
                  return (
                    <tr key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      style={{ cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.codeBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={tdStyle}>
                        <span style={{ color: T.link, fontWeight: 500 }}>{card.name}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: DECK_COLOURS[card.deck] || T.muted }}>{card.deck}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {card.pwr > 0 ? card.pwr.toFixed(2) : "\u2014"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {card.adp > 0 ? card.adp.toFixed(1) : "\u2014"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {cc > 0 && <span style={badgeStyle(T.greenBg, T.green)}>{cc} combo{cc !== 1 ? "s" : ""}</span>}
                          {nc > 0 && <span style={badgeStyle(T.redBg, T.red)}>{nc} nobo{nc !== 1 ? "s" : ""}</span>}
                          {tc > 0 && <span style={badgeStyle(T.blueBg, T.blue)}>{tc} tip{tc !== 1 ? "s" : ""}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}

        {/* Footer */}
        <footer style={{ marginTop: 48, padding: "20px 0", borderTop: `1px solid ${T.border}`, fontSize: "0.8rem", color: T.muted, textAlign: "center" }}>
          Agricola Card Wiki &middot; <a href="/ontology" style={{ color: T.link }}>Ontology Documentation</a> &middot; <a href="/" style={{ color: T.link }}>Explorer</a>
        </footer>
      </div>
    </div>
  );
}

const thStyle = { padding: "8px 12px", borderBottom: `1px solid #e7e5e4`, textAlign: "left", fontWeight: 600, background: "#f5f5f4", fontSize: "0.85rem" };
const tdStyle = { padding: "8px 12px", textAlign: "left", verticalAlign: "middle" };
function badgeStyle(bg, color) {
  return { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: "0.75rem", fontWeight: 600, background: bg, color };
}

// ── Card Wiki Detail Page ──────────────────────────────────────────────────

function CardWikiPage({ cardId, allCards, cardsById, onBack, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("combos");
  const [showAddCombo, setShowAddCombo] = useState(false);
  const [showAddNobo, setShowAddNobo] = useState(false);
  const [showAddTip, setShowAddTip] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/wiki/cards/${cardId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cardId]);

  useEffect(() => { loadData(); setTab("combos"); }, [cardId]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.muted, fontFamily: "Inter, system-ui, sans-serif" }}>
        Loading...
      </div>
    );
  }
  if (!data?.card) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: T.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ color: T.muted }}>Card not found</div>
        <button onClick={onBack} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 6, background: T.cardBg, border: `1px solid ${T.border}`, color: T.fg, cursor: "pointer" }}>Back</button>
      </div>
    );
  }

  const card = data.card;
  const ontologyCombos = card.combos || [];
  const wikiCombos = data.wikiCombos || [];
  const handCombos = data.handCombos || [];
  const allCombos = [...ontologyCombos.map(c => ({ ...c, source: "ontology" })), ...wikiCombos, ...handCombos];
  const nobos = data.nobos || [];
  const tips = data.tips || [];
  const imgSrc = cardImgSrc(card);

  return (
    <div style={{ height: "100%", overflow: "auto", background: T.bg, color: T.fg, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: T.fg, color: T.bg, padding: "20px 0" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>{card.name}</h1>
            <div style={{ color: T.muted, fontSize: "0.9rem" }}>{card.type} &middot; Deck {card.deck}</div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
            <a href="/ontology" style={{ color: T.bg, opacity: 0.7, textDecoration: "none" }}>Ontology</a>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        {/* Back link */}
        <a onClick={onBack} style={{ fontSize: "0.9rem", marginBottom: 16, display: "block", color: T.link, cursor: "pointer" }}>
          &larr; Back to Card Wiki
        </a>

        {/* Hero: image + details table */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
          {imgSrc && (
            <img src={imgSrc} alt={card.name}
              style={{ width: 200, borderRadius: 8, border: `1px solid ${T.border}`, objectFit: "contain" }}
              onError={e => { e.target.style.display = "none"; }}
            />
          )}
          <div style={{ flex: 1, minWidth: 280 }}>
            {/* Properties table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <tbody>
                <tr><th style={propThStyle}>Type</th><td style={propTdStyle}>{card.type}</td></tr>
                <tr><th style={propThStyle}>Deck</th><td style={propTdStyle}><span style={{ color: DECK_COLOURS[card.deck] || T.fg }}>{card.deck}</span></td></tr>
                {card.costLabel && <tr><th style={propThStyle}>Cost</th><td style={propTdStyle}>{card.costLabel}</td></tr>}
                {card.prerequisite && <tr><th style={propThStyle}>Prerequisite</th><td style={propTdStyle}>{card.prerequisite}</td></tr>}
                {card.banned && <tr><th style={propThStyle}>Status</th><td style={{ ...propTdStyle, color: T.red, fontWeight: 600 }}>Banned</td></tr>}
                {card.isNo && <tr><th style={propThStyle}>Norwegian Deck</th><td style={propTdStyle}>Yes</td></tr>}
              </tbody>
            </table>

            {/* Card text */}
            {card.text && (
              <div style={{
                marginTop: 16, padding: 12, background: T.codeBg, borderRadius: 6, fontSize: "0.9rem", lineHeight: 1.6,
              }}>
                {card.text}
              </div>
            )}
          </div>
        </div>

        {/* Tournament Statistics */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeadingStyle}>Tournament Statistics</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginTop: 12 }}>
            <StatBox label="PWR" value={card.pwr > 0 ? card.pwr.toFixed(2) : "\u2014"} />
            <StatBox label="ADP" value={card.adp > 0 ? card.adp.toFixed(1) : "\u2014"} />
            <StatBox label="Play Ratio" value={card.playRatio > 0 ? `${(card.playRatio * 100).toFixed(1)}%` : "\u2014"} />
            <StatBox label="Win Ratio" value={card.winRatio > 0 ? `${(card.winRatio * 100).toFixed(1)}%` : "\u2014"} />
          </div>
        </section>

        {/* Semantic Tags */}
        {(card.gains?.length > 0 || card.affects?.length > 0) && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={sectionHeadingStyle}>Semantic Tags</h2>
            {card.gains?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong>Gains:</strong>{" "}
                {card.gains.map(g => <span key={g} style={tagStyle}>{g}</span>)}
              </div>
            )}
            {card.affects?.length > 0 && (
              <div>
                <strong>Affects:</strong>{" "}
                {card.affects.map(a => <span key={a} style={tagStyle}>{a}</span>)}
              </div>
            )}
          </section>
        )}

        {/* Community Content: tab switcher */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={sectionHeadingStyle}>Community Content</h2>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[
              { key: "combos", label: `Combos (${allCombos.length})`, color: T.green },
              { key: "nobos", label: `Anti-Combos (${nobos.length})`, color: T.red },
              { key: "tips", label: `Tips (${tips.length})`, color: T.blue },
            ].map(({ key, label, color }) => (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: `1px solid ${tab === key ? color : T.border}`,
                  background: tab === key ? (key === "combos" ? T.greenBg : key === "nobos" ? T.redBg : T.blueBg) : "transparent",
                  color: tab === key ? color : T.muted,
                  fontSize: "0.85rem", fontWeight: tab === key ? 700 : 500, cursor: "pointer",
                }}>
                {label}
              </button>
            ))}
          </div>

          {tab === "combos" && (
            <CombosTab
              card={card} allCombos={allCombos} cardsById={cardsById}
              onNavigate={onNavigate} showAdd={showAddCombo} setShowAdd={setShowAddCombo}
              allCards={allCards} onRefresh={loadData}
            />
          )}
          {tab === "nobos" && (
            <NobosTab
              card={card} nobos={nobos} cardsById={cardsById}
              onNavigate={onNavigate} showAdd={showAddNobo} setShowAdd={setShowAddNobo}
              allCards={allCards} onRefresh={loadData}
            />
          )}
          {tab === "tips" && (
            <TipsTab
              card={card} tips={tips}
              showAdd={showAddTip} setShowAdd={setShowAddTip}
              onRefresh={loadData}
            />
          )}
        </section>

        {/* Footer */}
        <footer style={{ marginTop: 48, padding: "20px 0", borderTop: `1px solid ${T.border}`, fontSize: "0.8rem", color: T.muted, textAlign: "center" }}>
          Agricola Card Wiki &middot; <a href="/ontology" style={{ color: T.link }}>Ontology Documentation</a> &middot; <a href="/" style={{ color: T.link }}>Explorer</a>
        </footer>
      </div>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const sectionHeadingStyle = { fontSize: "1.2rem", fontWeight: 700, borderBottom: `2px solid ${T.accent}`, paddingBottom: 6, marginBottom: 16 };
const propThStyle = { padding: "8px 12px", borderBottom: `1px solid ${T.border}`, textAlign: "left", fontWeight: 600, background: T.codeBg, width: 140 };
const propTdStyle = { padding: "8px 12px", borderBottom: `1px solid ${T.border}`, textAlign: "left" };
const tagStyle = { display: "inline-block", padding: "2px 8px", margin: 2, borderRadius: 12, fontSize: "0.78rem", background: T.codeBg, border: `1px solid ${T.border}` };
const entryStyle = { background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, marginBottom: 12 };

function StatBox({ label, value }) {
  return (
    <div style={{ background: T.codeBg, borderRadius: 6, padding: 10, textAlign: "center" }}>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: T.accent }}>{value}</div>
      <div style={{ fontSize: "0.75rem", color: T.muted }}>{label}</div>
    </div>
  );
}


// ── Combos Tab ──────────────────────────────────────────────────────────────

function CombosTab({ card, allCombos, cardsById, onNavigate, showAdd, setShowAdd, allCards, onRefresh }) {
  const ontologyCombos = allCombos.filter(c => c.source === "ontology");
  const communityCombos = allCombos.filter(c => c.source !== "ontology");

  const renderCombo = (combo, i) => {
    const partnerIds = combo.source === "ontology"
      ? [combo.id]
      : (combo.cardIds || []).filter(id => id !== card.id);
    return (
      <li key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          {partnerIds.map(pid => {
            const partner = cardsById[pid];
            if (!partner) return <span key={pid} style={{ fontSize: "0.85rem", color: T.muted }}>{pid}</span>;
            return (
              <a key={pid} onClick={() => onNavigate(pid)}
                style={{ color: T.link, cursor: "pointer", fontWeight: 500, fontSize: "0.9rem" }}>
                {partner.name}
              </a>
            );
          })}
          {combo.source === "ontology" && combo.reasonLabel && (
            <span style={{ fontSize: "0.78rem", color: T.muted }}>{combo.reasonLabel}</span>
          )}
          {combo.submittedBy && (
            <span style={{ fontSize: "0.78rem", color: T.muted }}>by {combo.submittedBy}</span>
          )}
        </div>
        {combo.comment && (
          <div style={{ fontSize: "0.82rem", color: T.muted, marginTop: 2, fontStyle: "italic", paddingLeft: 2 }}>
            {combo.comment}
          </div>
        )}
      </li>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "0.9rem", color: T.muted }}>
          {allCombos.length === 0 ? "No combos yet \u2014 be the first to add one!" : `${allCombos.length} combo${allCombos.length !== 1 ? "s" : ""}`}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: "5px 14px", borderRadius: 6, border: `1px solid ${T.green}`,
            background: showAdd ? T.greenBg : "transparent",
            color: T.green, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
          }}>
          {showAdd ? "Cancel" : "+ Add Combo"}
        </button>
      </div>

      {showAdd && (
        <AddComboForm
          card={card} allCards={allCards} endpoint="/api/wiki/combos"
          onDone={() => { setShowAdd(false); onRefresh(); }}
          label="combo"
        />
      )}

      {/* Ontology combos group */}
      {ontologyCombos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...badgeStyle(T.purpleBg, T.purple), fontSize: "0.72rem" }}>Ontology</span>
            Works Well With ({ontologyCombos.length})
          </h3>
          <ul style={{ listStyle: "none", background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 14px" }}>
            {ontologyCombos.map(renderCombo)}
          </ul>
        </div>
      )}

      {/* Community combos group */}
      {communityCombos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...badgeStyle(T.greenBg, T.green), fontSize: "0.72rem" }}>Community</span>
            Player-Tagged Combos ({communityCombos.length})
          </h3>
          <ul style={{ listStyle: "none", background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 14px" }}>
            {communityCombos.map(renderCombo)}
          </ul>
        </div>
      )}
    </div>
  );
}


// ── Nobos Tab ───────────────────────────────────────────────────────────────

function NobosTab({ card, nobos, cardsById, onNavigate, showAdd, setShowAdd, allCards, onRefresh }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "0.9rem", color: T.muted }}>
          {nobos.length === 0 ? "No anti-combos yet" : `${nobos.length} anti-combo${nobos.length !== 1 ? "s" : ""}`}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: "5px 14px", borderRadius: 6, border: `1px solid ${T.red}`,
            background: showAdd ? T.redBg : "transparent",
            color: T.red, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
          }}>
          {showAdd ? "Cancel" : "+ Add Anti-Combo"}
        </button>
      </div>

      {showAdd && (
        <AddComboForm
          card={card} allCards={allCards} endpoint="/api/wiki/nobos"
          onDone={() => { setShowAdd(false); onRefresh(); }}
          label="anti-combo"
        />
      )}

      {nobos.map((nobo, i) => {
        const partnerIds = (nobo.cardIds || []).filter(id => id !== card.id);
        return (
          <div key={i} style={entryStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ ...badgeStyle(T.redBg, T.red), fontSize: "0.75rem" }}>Anti-combo</span>
              {nobo.submittedBy && (
                <span style={{ fontSize: "0.82rem", color: T.muted, marginLeft: "auto" }}>by {nobo.submittedBy}</span>
              )}
            </div>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {partnerIds.map(pid => {
                const partner = cardsById[pid];
                if (!partner) return <li key={pid} style={{ padding: "4px 0", fontSize: "0.85rem", color: T.muted }}>{pid}</li>;
                return (
                  <li key={pid} style={{ padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                    <a onClick={() => onNavigate(pid)}
                      style={{ color: T.link, cursor: "pointer", fontWeight: 500, fontSize: "0.9rem" }}>
                      {partner.name}
                    </a>
                    <span style={{ fontSize: "0.78rem", color: T.muted, marginLeft: 8 }}>
                      {partner.deck} &middot; {partner.type}
                    </span>
                  </li>
                );
              })}
            </ul>
            {nobo.comment && (
              <div style={{ fontSize: "0.85rem", color: T.muted, marginTop: 6, fontStyle: "italic" }}>{nobo.comment}</div>
            )}
          </div>
        );
      })}

      {nobos.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: 24, color: T.muted, fontSize: "0.9rem" }}>
          Know cards that clash with {card.name}? Add the first anti-combo!
        </div>
      )}
    </div>
  );
}


// ── Tips Tab ────────────────────────────────────────────────────────────────

function TipsTab({ card, tips, showAdd, setShowAdd, onRefresh }) {
  const [tipText, setTipText] = useState("");
  const [tipUser, setTipUser] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmitTip = async () => {
    if (!tipText.trim() || !tipUser.trim()) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/wiki/tips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, tip: tipText.trim(), submittedBy: tipUser.trim() }),
      });
      if (!res.ok) { const body = await res.json(); setError(body.error || "Failed"); }
      else { setTipText(""); setShowAdd(false); onRefresh(); }
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  const inputStyle = {
    padding: "8px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
    background: T.cardBg, color: T.fg, fontSize: "0.85rem", outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "0.9rem", color: T.muted }}>
          {tips.length === 0 ? "No tips yet" : `${tips.length} tip${tips.length !== 1 ? "s" : ""}`}
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: "5px 14px", borderRadius: 6, border: `1px solid ${T.blue}`,
            background: showAdd ? T.blueBg : "transparent",
            color: T.blue, fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
          }}>
          {showAdd ? "Cancel" : "+ Add Tip"}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...entryStyle, borderColor: T.blue + "60" }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8, color: T.blue }}>Share a tip for beginners</div>
          <textarea
            value={tipText} onChange={e => setTipText(e.target.value)}
            placeholder="e.g. Best played early with a food engine already in place..."
            rows={3}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <input value={tipUser} onChange={e => setTipUser(e.target.value)} placeholder="Your name"
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={handleSubmitTip} disabled={submitting || !tipText.trim() || !tipUser.trim()}
              style={{
                padding: "8px 18px", borderRadius: 6, border: "none",
                background: T.blue, color: "#fff", fontSize: "0.85rem", fontWeight: 600,
                cursor: "pointer", opacity: submitting || !tipText.trim() || !tipUser.trim() ? 0.5 : 1,
              }}>
              {submitting ? "Saving..." : "Submit"}
            </button>
          </div>
          {error && <div style={{ fontSize: "0.82rem", color: T.red, marginTop: 6 }}>{error}</div>}
        </div>
      )}

      {tips.map(tip => (
        <div key={tip.id} style={entryStyle}>
          <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{tip.tip}</div>
          <div style={{ fontSize: "0.82rem", color: T.muted, marginTop: 8 }}>
            by {tip.submittedBy} &middot; {new Date(tip.createdAt).toLocaleDateString()}
          </div>
        </div>
      ))}

      {tips.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: 24, color: T.muted, fontSize: "0.9rem" }}>
          Got advice on how to use {card.name}? Share the first tip!
        </div>
      )}
    </div>
  );
}


// ── Add Combo / Nobo Form (shared) ──────────────────────────────────────────

function AddComboForm({ card, allCards, endpoint, onDone, label }) {
  const [searchQ, setSearchQ] = useState("");
  const [selectedCards, setSelectedCards] = useState([]);
  const [comment, setComment] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const results = useMemo(() => {
    if (!searchQ || searchQ.length < 2) return [];
    const q = searchQ.toLowerCase();
    return allCards
      .filter(c => c.id !== card.id && !selectedCards.some(s => s.id === c.id))
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQ, allCards, card.id, selectedCards]);

  const handleSubmit = async () => {
    if (selectedCards.length === 0 || !username.trim()) return;
    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds: [card.id, ...selectedCards.map(c => c.id)], comment: comment.trim(), submittedBy: username.trim() }),
      });
      if (!res.ok) { const body = await res.json(); setError(body.error || "Failed"); }
      else { onDone(); }
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  const accentColor = label === "combo" ? T.green : T.red;
  const accentBg = label === "combo" ? T.greenBg : T.redBg;
  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 6,
    border: `1px solid ${T.border}`, background: T.cardBg, color: T.fg, fontSize: "0.85rem",
    outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ ...entryStyle, borderColor: accentColor + "60" }}>
      <div style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8, color: accentColor }}>
        New {label} with {card.name}
      </div>

      {selectedCards.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {selectedCards.map(c => (
            <span key={c.id} style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
              borderRadius: 6, background: T.codeBg, border: `1px solid ${T.border}`, fontSize: "0.82rem",
            }}>
              {c.name}
              <button onClick={() => setSelectedCards(prev => prev.filter(x => x.id !== c.id))}
                style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>
                {"\u2715"}
              </button>
            </span>
          ))}
        </div>
      )}

      <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
        placeholder="Search for a card to add..." style={inputStyle} />
      {results.length > 0 && (
        <div style={{ maxHeight: 180, overflow: "auto", marginTop: 4, borderRadius: 6, border: `1px solid ${T.border}`, background: T.cardBg }}>
          {results.map(c => (
            <div key={c.id} onClick={() => { setSelectedCards(prev => [...prev, c]); setSearchQ(""); }}
              style={{ padding: "6px 12px", cursor: "pointer", fontSize: "0.85rem", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8, alignItems: "center" }}
              onMouseEnter={e => { e.currentTarget.style.background = T.codeBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: DECK_COLOURS[c.deck] || T.muted, fontWeight: 600, fontSize: "0.78rem", width: 28 }}>{c.deck}</span>
              <span>{c.name}</span>
              <span style={{ color: T.muted, fontSize: "0.78rem", marginLeft: "auto" }}>{c.type?.replace("Improvement", "Imp.")}</span>
            </div>
          ))}
        </div>
      )}

      <input value={comment} onChange={e => setComment(e.target.value)}
        placeholder={label === "combo" ? "Why do these cards work together?" : "Why do these cards clash?"}
        style={{ ...inputStyle, marginTop: 8 }} />

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your name"
          style={{ ...inputStyle, flex: 1, width: "auto" }} />
        <button onClick={handleSubmit}
          disabled={submitting || selectedCards.length === 0 || !username.trim()}
          style={{
            padding: "8px 18px", borderRadius: 6, border: "none",
            background: accentColor, color: "#fff", fontSize: "0.85rem", fontWeight: 600,
            cursor: "pointer", opacity: submitting || selectedCards.length === 0 || !username.trim() ? 0.5 : 1,
          }}>
          {submitting ? "Saving..." : "Submit"}
        </button>
      </div>
      {error && <div style={{ fontSize: "0.82rem", color: T.red, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// badgeStyle already defined above
