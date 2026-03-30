import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import Drafter from "./drafter.jsx";
import CommunityHands from "./hands.jsx";
import ScoreSheet from "./scoresheet.jsx";

// ── API helpers ─────────────────────────────────────────────────────────────
const API_BASE = "";  // same origin in production; Vite proxy in dev

async function fetchCards() {
  const res = await fetch(`${API_BASE}/api/cards`);
  return res.json();
}

async function fetchMeta() {
  const res = await fetch(`${API_BASE}/api/meta`);
  return res.json();
}

async function runSparql(query) {
  const res = await fetch(`${API_BASE}/api/sparql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// ── Responsive hook ────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
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

// ── Colour palette ──────────────────────────────────────────────────────────
const DECK_COLOURS = {
  E: "#3b82f6", I: "#8b5cf6", K: "#ec4899", Major: "#f59e0b",
  Fr: "#10b981", Wm: "#ef4444", G: "#6366f1", G4: "#14b8a6",
  G5: "#f97316", G6: "#a855f7", G7: "#06b6d4",
};

// PWR-based colour scheme for Explorer graph & table
// Three tiers: low (<1), medium (1–2), high (>2)
const PWR_COLOURS = {
  low:    "#ef4444",  // red – weak cards
  mid:    "#f59e0b",  // amber – average
  high:   "#10b981",  // green – strong
  banned: "#6b7280",  // grey
  none:   "#94a3b8",  // no PWR data — visible on both light & dark
};
function pwrColor(card) {
  if (card.banned) return PWR_COLOURS.banned;
  const p = card.pwr || 0;
  if (p <= 0) return PWR_COLOURS.none;
  if (p < 1) return PWR_COLOURS.low;
  if (p <= 2) return PWR_COLOURS.mid;
  return PWR_COLOURS.high;
}
const TYPE_ICONS = { Occupation: "\uD83D\uDC64", MinorImprovement: "\uD83D\uDD27", MajorImprovement: "\u2B50" };

// Corrected-value indicator: shows purple text + star when PWR/ADP differs from raw
function isCorrected(card, field) {
  const raw = card[field + "Raw"];
  const val = card[field];
  return raw != null && val != null && Math.abs(val - raw) > 0.001;
}
const CORR_COLOR = "#7c3aed";
function CorrStat({ card, field, decimals = 1, baseColor }) {
  const val = card[field];
  if (!val || val <= 0) return "\u2013";
  const corrected = isCorrected(card, field);
  const color = corrected ? CORR_COLOR : baseColor;
  const raw = card[field + "Raw"];
  const [hover, setHover] = useState(false);
  if (!corrected) {
    return (
      <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {val.toFixed(decimals)}
      </span>
    );
  }
  return (
    <span style={{ position: "relative", display: "inline-block", color, fontWeight: 600, fontVariantNumeric: "tabular-nums", cursor: "help" }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => setHover(h => !h)}>
      {val.toFixed(decimals)}<span style={{ fontSize: "0.7em", verticalAlign: "super" }}>*</span>
      {hover && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#1c1917", color: "#fafaf9", fontSize: 11, fontWeight: 400,
          padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap", zIndex: 1000,
          pointerEvents: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}>
          {field.toUpperCase()} corrected (raw: {raw.toFixed(decimals)})
        </span>
      )}
    </span>
  );
}

const PRESET_QUERIES = [
  { label: "Food Engines", description: "Cards that gain food on recurring triggers", filters: { gains: ["food"], affects: ["each_round", "harvest", "whenever"] } },
  { label: "Hidden Gems", description: "High win rate, rarely played", filters: { minWin: 0.30, maxPlay: 0.20 } },
  { label: "Versatile Cards", description: "Cards with 4+ distinct gain type", filters: { minGains: 4 } },
  { label: "Animal Strategy", description: "Cards that gain animals", filters: { gains: ["sheep", "boar", "cattle"] } },
  { label: "Baking Strategy", description: "Cards related to baking", filters: { gains: ["bake", "cooking"] } },
  { label: "Cost ≤ 2 resources", description: "Cheap improvements with good win rates", filters: { maxCostLen: 2, minWin: 0.28 } },
];

// ── Explorer theme objects ──────────────────────────────────────────────────
const EXPLORER_DARK = {
  bg: "#0f172a",
  surface: "#1e293b",
  surfaceAlt: "#334155",
  border: "#1e293b",
  edgeDefault: "#475569",
  text: "#f1f5f9",
  textSecondary: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textFaint: "#475569",
  accent: "#f59e0b",
  blue: "#3b82f6",
  green: "#10b981",
  purple: "#8b5cf6",
  pink: "#ec4899",
  graphBg: "#0f172a",
  codeBg: "#020617",
  chipBg: "transparent",
  chipBorder: "#334155",
  chipActiveOpacity: "22",
  tableHoverBg: "#1e293b66",
  bannedBg: "#1e1e24",
  bannedHoverBg: "#2a2a32",
  selectedBg: "#1e293b",
};

const EXPLORER_LIGHT = {
  bg: "#f8fafc",
  surface: "#ffffff",
  surfaceAlt: "#e2e8f0",
  border: "#cbd5e1",
  edgeDefault: "#334155",
  text: "#0f172a",
  textSecondary: "#1e293b",
  textMuted: "#64748b",
  textDim: "#94a3b8",
  textFaint: "#94a3b8",
  accent: "#b45309",
  blue: "#2563eb",
  green: "#059669",
  purple: "#7c3aed",
  pink: "#db2777",
  graphBg: "#f1f5f9",
  codeBg: "#f1f5f9",
  chipBg: "transparent",
  chipBorder: "#94a3b8",
  chipActiveOpacity: "22",
  tableHoverBg: "#e2e8f088",
  bannedBg: "#f1f5f9",
  bannedHoverBg: "#e2e8f0",
  selectedBg: "#dbeafe",
};

// ── Pagination bar ──────────────────────────────────────────────────────────
function PaginationBar({ page, totalPages, onPageChange, showAll, onToggleShowAll, totalCards, pageSize, themeE: E, compact }) {
  if (totalCards <= pageSize && !showAll) return null;
  const fs = compact ? 10 : 11;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, padding: compact ? "8px 0" : "10px 0", flexWrap: "wrap" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: fs, color: E.textDim, cursor: "pointer", userSelect: "none" }}>
        <input type="checkbox" checked={showAll} onChange={onToggleShowAll}
          style={{ accentColor: E.blue, cursor: "pointer" }} />
        Show all
      </label>
      {!showAll && totalPages > 1 && (
        <>
          <button disabled={page <= 0} onClick={() => onPageChange(page - 1)}
            style={{
              padding: compact ? "3px 8px" : "4px 10px", borderRadius: 6, border: `1px solid ${E.border}`,
              background: page <= 0 ? "transparent" : E.surface, color: page <= 0 ? E.textFaint : E.text,
              fontSize: fs, cursor: page <= 0 ? "default" : "pointer", opacity: page <= 0 ? 0.4 : 1,
            }}>{"\u2190"} Prev</button>
          <span style={{ fontSize: fs, color: E.textMuted }}>
            Page {page + 1} of {totalPages}
          </span>
          <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}
            style={{
              padding: compact ? "3px 8px" : "4px 10px", borderRadius: 6, border: `1px solid ${E.border}`,
              background: page >= totalPages - 1 ? "transparent" : E.surface, color: page >= totalPages - 1 ? E.textFaint : E.text,
              fontSize: fs, cursor: page >= totalPages - 1 ? "default" : "pointer", opacity: page >= totalPages - 1 ? 0.4 : 1,
            }}>Next {"\u2192"}</button>
        </>
      )}
      <span style={{ fontSize: fs, color: E.textDim, marginLeft: "auto" }}>
        {showAll ? totalCards : `${Math.min(page * pageSize + 1, totalCards)}–${Math.min((page + 1) * pageSize, totalCards)} of ${totalCards}`} cards
      </span>
    </div>
  );
}

// ── Build SPARQL string from filters ────────────────────────────────────────
function buildSparql(filters, _unused, allTypes) {
  const lines = [
    "PREFIX : <http://agricola.veronahe.no/>",
    "",
    "SELECT ?name ?deck ?winRatio",
    "WHERE {"
  ];
  lines.push("  ?card rdfs:label ?name ; :deck ?deck ; :winRatio ?winRatio .");

  if (filters.types.length > 0 && filters.types.length < allTypes.length) {
    const typeIris = filters.types.map(t => ":" + t).join(", ");
    lines.push("  ?card rdf:type ?type . FILTER(?type IN (" + typeIris + "))");
  }
  if (filters.gains.length > 0) {
    filters.gains.forEach(g => lines.push("  ?card :gains :" + g + " ."));
  }
  if (filters.affects.length > 0) {
    const affIris = filters.affects.map(a => ":" + a).join(", ");
    lines.push("  ?card :affects ?aff . FILTER(?aff IN (" + affIris + "))");
  }
  if (filters.decks.length > 0 && filters.decks.length < (filters._allDecksLen || 999)) {
    const deckVals = filters.decks.map(d => '"' + d + '"').join(", ");
    lines.push("  FILTER(?deck IN (" + deckVals + "))");
  }

  lines.push("  FILTER(?winRatio >= " + filters.winRange[0] + " && ?winRatio <= " + filters.winRange[1] + ")");
  lines.push("}");
  lines.push("ORDER BY DESC(?winRatio)");
  // no LIMIT — pagination is client-side

  return lines.join("\n");
}


// ── Graph visualisation ─────────────────────────────────────────────────────
const GRAPH_MAX_CARDS = 300;

function GraphView({ cards, onSelectCard, selectedId, onOverflow, themeE }) {
  const svgRef = useRef(null);
  const circlesRef = useRef(null);  // store d3 selection for highlight updates
  const tooMany = cards.length > GRAPH_MAX_CARDS;

  // ── Build the graph only when cards change (NOT on selection) ──────────
  useEffect(() => {
    if (tooMany || !svgRef.current || cards.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    circlesRef.current = null;
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const nodeMap = new Map();
    cards.forEach(c => nodeMap.set(c.id, { ...c, nodeType: "card" }));

    const gainNodes = new Set();
    cards.forEach(c => c.gains.forEach(g => gainNodes.add(g)));
    gainNodes.forEach(g => {
      if (!nodeMap.has(g)) nodeMap.set(g, { id: g, name: g.replace(/_/g, " "), nodeType: "gain" });
    });

    const links = [];
    const cardById = new Map(cards.map(c => [c.id, c]));
    cards.forEach(c => {
      c.gains.forEach(g => links.push({ source: c.id, target: g, type: "gains" }));
      c.relations.forEach(r => {
        const target = cards.find(x => x.name.replace(/\s/g, "") === r || x.id === r);
        if (target) links.push({ source: c.id, target: target.id, type: "relatedTo" });
      });
      // Combo edges ("works well with")
      (c.combos || []).forEach(combo => {
        if (cardById.has(combo.id) && nodeMap.has(combo.id)) {
          // Only add link once (from the card with the smaller id)
          if (c.id < combo.id) {
            links.push({ source: c.id, target: combo.id, type: "combo", reason: combo.reason });
          }
        }
      });
    });

    const nodes = [...nodeMap.values()];

    // Scale forces based on node count for readable layouts at 10–1000+ nodes
    const n = nodes.length;
    const linkDist = n > 200 ? 120 : n > 60 ? 90 : n > 30 ? 70 : 60;
    const charge = n > 200 ? -80 : n > 60 ? -200 : n > 30 ? -160 : -120;
    const collisionR = n > 200 ? 16 : n > 60 ? 28 : 20;

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(linkDist).strength(0.2))
      .force("charge", d3.forceManyBody().strength(charge))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(collisionR))
      .force("x", d3.forceX(width / 2).strength(0.03))
      .force("y", d3.forceY(height / 2).strength(0.03));

    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.1, 6]).on("zoom", (e) => g.attr("transform", e.transform)));

    const link = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", d => d.type === "combo" ? themeE.green : d.type === "relatedTo" ? themeE.accent : themeE.edgeDefault)
      .attr("stroke-width", d => d.type === "combo" ? 1.5 : d.type === "relatedTo" ? 2 : 1)
      .attr("stroke-dasharray", d => d.type === "combo" ? "4,4" : d.type === "relatedTo" ? "6,3" : "none")
      .attr("opacity", d => d.type === "combo" ? 0.6 : 0.5);

    const node = g.append("g").selectAll("g").data(nodes).join("g")
      .attr("cursor", "pointer")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (e, d) => { if (d.nodeType === "card") onSelectCard(d.id); });

    const circles = node.filter(d => d.nodeType === "card").append("circle")
      .attr("r", d => 6 + (d.winRatio || 0) * 20)
      .attr("fill", d => pwrColor(d))
      .attr("stroke", d => d.banned ? "#dc2626" : "transparent")
      .attr("stroke-width", 3).attr("opacity", d => d.banned ? 0.6 : 0.85);

    // Store reference so the highlight effect can update strokes without rebuilding
    circlesRef.current = circles;

    node.filter(d => d.nodeType === "gain").append("rect")
      .attr("x", -8).attr("y", -8).attr("width", 16).attr("height", 16).attr("rx", 3)
      .attr("fill", themeE.surface).attr("stroke", themeE.edgeDefault).attr("opacity", 0.7);

    // Show labels when ≤50 cards; hover-only above 50
    const cardCount = nodes.filter(d => d.nodeType === "card").length;
    const showLabels = cardCount <= 50;
    node.append("text")
      .text(d => d.name)
      .attr("font-size", d => d.nodeType === "card" ? 9 : 7)
      .attr("fill", d => d.nodeType === "card" ? themeE.textSecondary : themeE.textMuted)
      .attr("dx", 12).attr("dy", 3)
      .attr("font-family", "Inter, system-ui, sans-serif")
      .attr("opacity", showLabels ? 1 : 0)
      .attr("pointer-events", "none");

    if (!showLabels) {
      node.on("mouseenter", function () { d3.select(this).select("text").attr("opacity", 1); })
          .on("mouseleave", function () { d3.select(this).select("text").attr("opacity", 0); });
    }

    sim.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [cards, onSelectCard, themeE]);

  // ── Lightweight highlight update — no simulation restart ──────────────
  useEffect(() => {
    if (!circlesRef.current) return;
    circlesRef.current
      .attr("stroke", d => d.id === selectedId ? "#fff" : d.banned ? "#dc2626" : "transparent");
  }, [selectedId]);

  if (tooMany) {
    return (
      <div style={{
        width: "100%", height: "100%", background: themeE.graphBg, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 40, opacity: 0.4 }}>{"\uD83C\uDF3E"}</div>
        <div style={{ color: themeE.textMuted, fontSize: 14, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
          Too many cards to render as a graph ({cards.length} cards, max {GRAPH_MAX_CARDS}).
          <br />Reduce your selection with filters or a lower limit.
        </div>
        <button onClick={onOverflow}
          style={{
            padding: "8px 20px", borderRadius: 8, border: `1px solid ${themeE.border}`,
            background: themeE.surface, color: themeE.blue, fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "all 0.15s",
          }}>
          Switch to table view
        </button>
      </div>
    );
  }

  return <svg ref={svgRef} style={{ width: "100%", height: "100%", background: themeE.graphBg, borderRadius: 12 }} />;
}

// ── Filter chips ────────────────────────────────────────────────────────────
function ChipSelect({ label, options, selected, onToggle, colour, themeE }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: themeE.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(o => {
          const active = selected.includes(o);
          return (
            <button key={o} onClick={() => onToggle(o)}
              style={{
                padding: "3px 10px", borderRadius: 99, border: "1px solid",
                borderColor: active ? (colour || themeE.blue) : themeE.chipBorder,
                background: active ? (colour || themeE.blue) + themeE.chipActiveOpacity : themeE.chipBg,
                color: active ? (colour || themeE.blue) : themeE.textMuted,
                fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }}
            >{o.replace(/_/g, " ")}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Range slider ────────────────────────────────────────────────────────────
function RangeFilter({ label, min, max, value, onChange, step = 0.01, themeE }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: themeE.textMuted, marginBottom: 2 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ color: themeE.textSecondary, fontVariantNumeric: "tabular-nums" }}>{value[0].toFixed(2)} – {value[1].toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="range" min={min} max={max} step={step} value={value[0]}
          onChange={e => onChange([parseFloat(e.target.value), value[1]])}
          style={{ flex: 1, accentColor: themeE.blue }} />
        <input type="range" min={min} max={max} step={step} value={value[1]}
          onChange={e => onChange([value[0], parseFloat(e.target.value)])}
          style={{ flex: 1, accentColor: themeE.blue }} />
      </div>
    </div>
  );
}

// ── Card detail panel ───────────────────────────────────────────────────────
function ClickableChip({ label, color, bgColor, borderColor, onClick }) {
  return (
    <span onClick={onClick}
      style={{
        padding: "2px 8px", borderRadius: 99, background: bgColor, color, fontSize: 11,
        border: `1px solid ${borderColor}`, cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
      }}
      onMouseEnter={onClick ? e => { e.target.style.filter = "brightness(1.3)"; } : undefined}
      onMouseLeave={onClick ? e => { e.target.style.filter = "none"; } : undefined}
    >
      {label}
    </span>
  );
}

function CardSearchBox({ allCards, onSelect, themeE }) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allCards.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allCards]);

  const showDropdown = focused && query.trim().length > 0 && matches.length > 0;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
          fontSize: 12, color: themeE.textDim, pointerEvents: "none",
        }}>{"\uD83D\uDD0D"}</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search card by name..."
          style={{
            width: "100%", padding: "7px 10px 7px 28px", borderRadius: 6,
            border: `1px solid ${focused ? themeE.accent : themeE.border}`,
            background: themeE.bg, fontSize: 12, color: themeE.text,
            outline: "none", boxSizing: "border-box",
            transition: "border-color 0.15s",
          }}
        />
      </div>
      {showDropdown && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: themeE.surface, border: `1px solid ${themeE.border}`,
          borderRadius: 6, marginTop: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          maxHeight: 240, overflow: "auto",
        }}>
          {matches.map(c => (
            <button key={c.id}
              onMouseDown={() => { onSelect(c.id); setQuery(""); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "6px 10px", border: "none",
                background: "transparent", cursor: "pointer", textAlign: "left",
                borderBottom: `1px solid ${themeE.border}11`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = themeE.tableHoverBg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ color: pwrColor(c), fontSize: 10 }}>{"\u25CF"}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: themeE.text }}>{c.name}</div>
                <div style={{ fontSize: 10, color: themeE.textMuted }}>
                  {c.deck} · {c.type.replace(/([A-Z])/g, " $1").trim()}
                  {c.winRatio > 0 && <span style={{ color: themeE.blue, marginLeft: 4 }}>Win {(c.winRatio * 100).toFixed(0)}%</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryView({ cards, onSelectCard, selectedId, themeE }) {
  const isMobile = useIsMobile();
  const gridCols = isMobile ? "repeat(auto-fill, minmax(140px, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))";

  return (
    <div style={{ padding: "16px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 12 }}>
        {cards.map(c => {
          const imgSrc = c.imageUrl ? `${API_BASE}/api/imgproxy?url=${encodeURIComponent(c.imageUrl)}` : null;
          const isSelected = c.id === selectedId;
          return (
            <div
              key={c.id}
              onClick={() => onSelectCard(c.id)}
              style={{
                background: themeE.surface,
                border: isSelected ? `2px solid ${themeE.blue}` : `1px solid ${themeE.border}`,
                borderRadius: 12,
                overflow: "hidden",
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = themeE.accent;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = `0 4px 12px ${themeE.text}11`;
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = isSelected ? themeE.blue : themeE.border;
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {/* Image */}
              {imgSrc && (
                <div style={{
                  width: "100%",
                  aspectRatio: "3 / 4",
                  background: themeE.surfaceAlt,
                  overflow: "hidden",
                }}>
                  <img
                    src={imgSrc}
                    alt={c.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: "top",
                    }}
                    onError={e => {
                      e.target.parentElement.style.display = "none";
                    }}
                  />
                </div>
              )}
              {!imgSrc && (
                <div style={{
                  width: "100%",
                  aspectRatio: "3 / 4",
                  background: themeE.surfaceAlt,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: isMobile ? 32 : 40,
                }}>
                  {TYPE_ICONS[c.type] || "\uD83D\uDCBC"}
                </div>
              )}

              {/* Card info */}
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Name */}
                <div style={{
                  fontSize: isMobile ? 12 : 13,
                  fontWeight: 700,
                  color: themeE.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {c.name}
                </div>

                {/* Deck badge */}
                <div style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: DECK_COLOURS[c.deck] + "22",
                  color: DECK_COLOURS[c.deck],
                  fontSize: 10,
                  fontWeight: 600,
                  width: "fit-content",
                  border: `1px solid ${DECK_COLOURS[c.deck]}44`,
                }}>
                  {c.deck}
                </div>

                {/* Stats */}
                <div style={{
                  display: "flex",
                  gap: 8,
                  fontSize: isMobile ? 10 : 11,
                  color: themeE.textMuted,
                  borderTop: `1px solid ${themeE.border}`,
                  paddingTop: 6,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: themeE.textDim, fontSize: 9, marginBottom: 2 }}>PWR</div>
                    <div><CorrStat card={c} field="pwr" decimals={1} baseColor={c.pwr > 2 ? themeE.purple : themeE.textSecondary} /></div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: themeE.textDim, fontSize: 9, marginBottom: 2 }}>Win %</div>
                    <div style={{ color: c.winRatio > 0.33 ? themeE.green : themeE.textSecondary, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {(c.winRatio * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardDetail({ card, onClose, onFilterGain, onFilterAffect, onFilterPrereq, onSelectCardByName, themeE }) {
  if (!card) return (
    <div style={{ padding: 24, color: themeE.textDim, fontSize: 13, textAlign: "center" }}>
      Click a card node or table row to inspect it.
    </div>
  );

  const barW = Math.round(card.winRatio * 200);
  const imgSrc = card.imageUrl ? `${API_BASE}/api/imgproxy?url=${encodeURIComponent(card.imageUrl)}` : null;

  return (
    <div style={{ padding: 16 }}>
      {onClose && (
        <button onClick={onClose} style={{
          float: "right", background: "none", border: "none", color: themeE.textDim,
          fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1,
        }}>{"\u2715"}</button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{TYPE_ICONS[card.type]}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: themeE.text }}>{card.name}</div>
          <div style={{ fontSize: 11, color: themeE.textMuted }}>
            {card.type.replace(/([A-Z])/g, " $1").trim()} · Deck {card.deck}
            {card.banned && <span style={{ marginLeft: 6, color: "#dc2626", fontWeight: 600 }}>BANNED</span>}
          </div>
        </div>
      </div>

      {imgSrc && (
        <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden", border: `1px solid ${themeE.border}` }}>
          <img src={imgSrc} alt={card.name}
            style={{ width: "100%", display: "block", background: themeE.surface }}
            onError={e => { e.target.parentElement.style.display = "none"; }}
          />
        </div>
      )}

      {card.costLabel && (
        <div style={{ fontSize: 12, color: themeE.textFaint, marginBottom: 8 }}>
          <span style={{ color: themeE.textDim }}>Cost:</span> {card.costLabel}
        </div>
      )}

      {card.prerequisite && (
        <div style={{ fontSize: 12, color: themeE.textFaint, marginBottom: 8 }}>
          <span style={{ color: themeE.textDim }}>Prerequisite:</span>{" "}
          <span onClick={() => onFilterPrereq && onFilterPrereq(card.prerequisite)}
            style={{ color: themeE.accent, cursor: onFilterPrereq ? "pointer" : "default", textDecoration: onFilterPrereq ? "underline dotted" : "none" }}
            title={onFilterPrereq ? `Show all cards requiring "${card.prerequisite}"` : undefined}
          >{card.prerequisite}</span>
        </div>
      )}

      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <span style={{ color: themeE.textDim }}>Win rate: </span>
        <span style={{ color: themeE.blue, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{(card.winRatio * 100).toFixed(1)}%</span>
        <div style={{ height: 4, background: themeE.surface, borderRadius: 2, marginTop: 4 }}>
          <div style={{ width: barW, maxWidth: "100%", height: 4, background: `linear-gradient(90deg, ${themeE.blue}, ${themeE.purple})`, borderRadius: 2 }} />
        </div>
      </div>

      {card.pwr != null && card.pwr > 0 && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: themeE.textDim }}>PWR: </span>
          <CorrStat card={card} field="pwr" decimals={2} baseColor={themeE.purple} />
        </div>
      )}
      {card.adp != null && card.adp > 0 && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <span style={{ color: themeE.textDim }}>ADP: </span>
          <CorrStat card={card} field="adp" decimals={2} baseColor={themeE.accent} />
        </div>
      )}

      {card.text && (
        <div style={{ fontSize: 12, color: themeE.textMuted, marginBottom: 10, lineHeight: 1.5, fontStyle: "italic", borderLeft: `2px solid ${themeE.chipBorder}`, paddingLeft: 8 }}>
          {card.text}
        </div>
      )}

      {card.gains.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: themeE.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Gains</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.gains.map(g => (
              <ClickableChip key={g} label={g.replace(/_/g, " ")}
                color={themeE.green} bgColor={themeE.green + "22"} borderColor={themeE.green + "44"}
                onClick={() => onFilterGain && onFilterGain(g)} />
            ))}
          </div>
        </div>
      )}

      {card.affects.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: themeE.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Affects</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.affects.map(a => (
              <ClickableChip key={a} label={a.replace(/_/g, " ")}
                color={themeE.accent} bgColor={themeE.accent + "22"} borderColor={themeE.accent + "44"}
                onClick={() => onFilterAffect && onFilterAffect(a)} />
            ))}
          </div>
        </div>
      )}

      {card.relations.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: themeE.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Related Cards</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.relations.map(r => (
              <ClickableChip key={r} label={r.replace(/([A-Z])/g, " $1").trim()}
                color={themeE.pink} bgColor={themeE.pink + "22"} borderColor={themeE.pink + "44"}
                onClick={() => onSelectCardByName && onSelectCardByName(r)} />
            ))}
          </div>
        </div>
      )}

      {card.combos && card.combos.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: themeE.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Works Well With</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.combos.map(combo => (
              <ClickableChip key={combo.id} label={combo.name || combo.id}
                color={themeE.green} bgColor={themeE.green + "22"} borderColor={themeE.green + "44"}
                onClick={() => onSelectCardByName && onSelectCardByName(combo.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── (Hand system removed — drafting is now in the Drafter) ──────────────────


// ── SPARQL Editor ───────────────────────────────────────────────────────────
function SparqlEditor({ sparql, onChange, onRun, queryResult, isRunning, themeE }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 16px" }}>
      {/* Editor */}
      <div style={{ position: "relative" }}>
        <textarea
          value={sparql}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onRun(); }}
          spellCheck={false}
          style={{
            width: "100%", minHeight: 140, maxHeight: 260, resize: "vertical",
            background: themeE.codeBg, border: `1px solid ${themeE.border}`, borderRadius: 8,
            padding: 12, paddingBottom: 40, fontSize: 12, color: themeE.textSecondary,
            lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            outline: "none", boxSizing: "border-box",
          }}
        />
        {/* Run button overlay */}
        <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: themeE.textFaint }}>Ctrl+Enter</span>
          <button onClick={onRun}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: isRunning ? themeE.surfaceAlt : `linear-gradient(135deg, ${themeE.green}, #059669)`,
              color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: isRunning ? 0.6 : 1, transition: "all 0.15s",
              boxShadow: isRunning ? "none" : `0 2px 8px ${themeE.green}44`,
            }}>
            <span style={{ fontSize: 14 }}>{isRunning ? "\u23F3" : "\u25B6"}</span>
            {isRunning ? "Running..." : "Run Query"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {queryResult && queryResult.error && (
        <div style={{
          background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8,
          padding: "8px 12px", fontSize: 12, color: "#fca5a5",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {queryResult.error}
        </div>
      )}

      {/* Results */}
      {queryResult && queryResult.columns && (
        <div style={{
          background: themeE.codeBg, border: `1px solid ${themeE.border}`, borderRadius: 8,
          maxHeight: 200, overflow: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: `1px solid ${themeE.border}` }}>
            <span style={{ fontSize: 11, color: themeE.textDim }}>
              {queryResult.rows.length} of {queryResult.total} results
            </span>
            <span style={{ fontSize: 10, color: themeE.surfaceAlt }}>
              {queryResult.time}ms
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {queryResult.columns.map(col => (
                  <th key={col} style={{ padding: "4px 8px", textAlign: "left", color: themeE.textDim, borderBottom: `1px solid ${themeE.border}`, fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    ?{col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryResult.rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${themeE.bg}` }}>
                  {queryResult.columns.map(col => (
                    <td key={col} style={{ padding: "4px 8px", color: themeE.textFaint, fontVariantNumeric: "tabular-nums" }}>
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
              {queryResult.rows.length === 0 && (
                <tr><td colSpan={queryResult.columns.length} style={{ padding: 12, color: themeE.textFaint, textAlign: "center" }}>No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Overlay / Drawer for mobile panels ──────────────────────────────────────
function Drawer({ open, onClose, side, children, title, themeE }) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90,
      }} />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, bottom: 0, zIndex: 100,
        [side]: 0,
        width: "min(320px, 85vw)",
        background: themeE.bg, borderRight: side === "left" ? `1px solid ${themeE.border}` : "none",
        borderLeft: side === "right" ? `1px solid ${themeE.border}` : "none",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 0 40px rgba(0,0,0,0.5)",
      }}>
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: `1px solid ${themeE.border}`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: themeE.textSecondary }}>{title}</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: themeE.textDim, fontSize: 18,
            cursor: "pointer", padding: 4, lineHeight: 1,
          }}>{"\u2715"}</button>
        </div>
        {/* Drawer body */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {children}
        </div>
      </div>
    </>
  );
}


// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();

  // App mode: "home" (mobile only) | "explorer" | "drafter" | "hands" | "score"
  const [appMode, setAppMode] = useState(isMobile ? "home" : "explorer");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [handsDraftType, setHandsDraftType] = useState(null); // for linking from drafter
  const [explorerTheme, setExplorerTheme] = useState("light");
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupMsg, setBackupMsg] = useState(null); // {text, type}
  const restoreFileRef = useRef(null);

  // Auto-collapse sidebar when entering drafter/hands, expand when returning to explorer
  const setAppModeWithSidebar = useCallback((mode, opts) => {
    setAppMode(mode);
    setSidebarCollapsed(mode === "drafter" || mode === "hands" || mode === "score");
    if (opts?.draftType) setHandsDraftType(opts.draftType);
  }, []);

  // ── Backup / Restore handlers ─────────────────────────────────────────
  const handleBackup = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/backup`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agricola-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg({ text: `Backup: ${data.drafts.length} drafts, ${data.scores.length} scores`, type: "ok" });
      setTimeout(() => setBackupMsg(null), 4000);
      setBackupOpen(false);
    } catch (err) {
      setBackupMsg({ text: "Backup failed", type: "err" });
      setTimeout(() => setBackupMsg(null), 4000);
    }
  }, []);

  const handleRestore = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setBackupMsg({ text: `Restored ${result.draftsAdded} drafts, ${result.scoresAdded} scores`, type: "ok" });
      setTimeout(() => setBackupMsg(null), 4000);
      setBackupOpen(false);
    } catch (err) {
      setBackupMsg({ text: "Restore failed: " + err.message, type: "err" });
      setTimeout(() => setBackupMsg(null), 4000);
    } finally {
      if (restoreFileRef.current) restoreFileRef.current.value = "";
    }
  }, []);

  const handleExportRdf = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/export-rdf`);
      const ttl = await res.text();
      const blob = new Blob([ttl], { type: "text/turtle" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "agricola-cards.ttl";
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg({ text: "RDF export downloaded", type: "ok" });
      setTimeout(() => setBackupMsg(null), 4000);
      setBackupOpen(false);
    } catch (err) {
      setBackupMsg({ text: "RDF export failed", type: "err" });
      setTimeout(() => setBackupMsg(null), 4000);
    }
  }, []);

  // Compute theme object
  const E = explorerTheme === "dark" ? EXPLORER_DARK : EXPLORER_LIGHT;

  // Data from backend
  const [allCards, setAllCards] = useState([]);
  const [meta, setMeta] = useState({ gains: [], affects: [], decks: [], types: [], totalCards: 0 });
  const [loading, setLoading] = useState(true);

  // Norway Deck toggle
  const [norwayOnly, setNorwayOnly] = useState(true);
  const activeCards = useMemo(() => {
    if (!norwayOnly) return allCards;
    const noCards = allCards.filter(c => c.isNo);
    // For duplicate card names, exclude the Revised version and keep the
    // original deck version (Globus/G4/G5/K/I/E etc.) in the Norwegian deck.
    const byName = new Map();
    for (const c of noCards) {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c);
    }
    const excludeIds = new Set();
    for (const [, copies] of byName) {
      if (copies.length < 2) continue;
      const hasOriginal = copies.some(c => !(c.deck || "").startsWith("Revised"));
      if (hasOriginal) {
        for (const c of copies) {
          if ((c.deck || "").startsWith("Revised")) excludeIds.add(c.id);
        }
      }
    }
    return excludeIds.size > 0 ? noCards.filter(c => !excludeIds.has(c.id)) : noCards;
  }, [allCards, norwayOnly]);

  // Filters & UI state
  const [filters, setFilters] = useState({
    gains: [], affects: [], decks: [], types: [],
    winRange: [0, 1], playRange: [0, 1],
    prerequisite: null,  // string or null
  });
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("graph");
  const [tableStyle, setTableStyle] = useState("list"); // "list" | "gallery"
  const [showSparql, setShowSparql] = useState(false);
  const [graphLimit, setGraphLimit] = useState(35);
  const [tablePage, setTablePage] = useState(0);      // current page index for table pagination
  const [showAllTable, setShowAllTable] = useState(false); // bypass pagination
  const [sparql, setSparql] = useState("");
  const [sparqlEdited, setSparqlEdited] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [sortCol, setSortCol] = useState(null);      // "winRatio" | "playRatio" | "pwr" | null
  const [sortDir, setSortDir] = useState("desc");     // "asc" | "desc"

  // Callbacks for clickable tags in Card Inspector
  const handleFilterGain = useCallback((gain) => {
    setSparqlEdited(false);
    setFilters(f => {
      const arr = f.gains;
      return { ...f, gains: arr.includes(gain) ? arr : [...arr, gain] };
    });
  }, []);

  const handleFilterAffect = useCallback((affect) => {
    setSparqlEdited(false);
    setFilters(f => {
      const arr = f.affects;
      return { ...f, affects: arr.includes(affect) ? arr : [...arr, affect] };
    });
  }, []);

  const handleFilterPrereq = useCallback((prereq) => {
    setSparqlEdited(false);
    setFilters(f => ({ ...f, prerequisite: prereq }));
  }, []);

  const handleSelectCardByName = useCallback((nameOrId) => {
    // Try matching by ID first (for combo clicks), then by CamelCase name (for relation clicks)
    let card = allCards.find(c => c.id === nameOrId);
    if (!card) {
      const normalized = nameOrId.replace(/([A-Z])/g, " $1").trim().toLowerCase();
      card = allCards.find(c => c.name.toLowerCase() === normalized);
    }
    if (card) {
      setSelectedId(card.id);
      if (isMobile) setShowInspector(true);
    }
  }, [allCards, isMobile]);

  // Mobile drawer state
  const [showFilters, setShowFilters] = useState(false);
  const [showInspector, setShowInspector] = useState(false);

  // Auto-open inspector on mobile when a card is selected
  const handleSelectCard = useCallback((id) => {
    setSelectedId(id);
    if (isMobile) setShowInspector(true);
  }, [isMobile]);

  // ── Load data from backend on mount ────────────────────────────────────
  useEffect(() => {
    Promise.all([fetchCards(), fetchMeta()])
      .then(([cards, meta]) => {
        setAllCards(cards);
        setMeta(meta);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load data:", err);
        setLoading(false);
      });
  }, []);

  // Regenerate SPARQL from filters (only if user hasn't hand-edited)
  const generatedSparql = useMemo(
    () => buildSparql({ ...filters, _allDecksLen: meta.decks.length }, null, meta.types),
    [filters, meta]
  );

  useEffect(() => {
    if (!sparqlEdited) setSparql(generatedSparql);
  }, [generatedSparql, sparqlEdited]);

  const handleSparqlChange = useCallback((val) => {
    setSparql(val);
    setSparqlEdited(true);
  }, []);

  const handleResetSparql = useCallback(() => {
    setSparqlEdited(false);
    setSparql(generatedSparql);
    setQueryResult(null);
  }, [generatedSparql]);

  // ── Run SPARQL against real backend ────────────────────────────────────
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await runSparql(sparql);
      setQueryResult(result);
    } catch (err) {
      setQueryResult({ error: err.message, time: 0 });
    }
    setIsRunning(false);
  }, [sparql]);

  const toggle = useCallback((key, val) => {
    setSparqlEdited(false);
    setFilters(f => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }, []);

  // Apply filters to cards shown in graph/table (client-side filtering)
  const filtered = useMemo(() => {
    let cards = activeCards.filter(c => {
      if (filters.gains.length > 0 && !filters.gains.some(g => c.gains.includes(g))) return false;
      if (filters.affects.length > 0 && !filters.affects.some(a => c.affects.includes(a))) return false;
      if (filters.decks.length > 0 && !filters.decks.includes(c.deck)) return false;
      if (filters.types.length > 0 && !filters.types.includes(c.type)) return false;
      if (c.winRatio < filters.winRange[0] || c.winRatio > filters.winRange[1]) return false;
      if (c.playRatio < filters.playRange[0] || c.playRatio > filters.playRange[1]) return false;
      if (filters.prerequisite && c.prerequisite !== filters.prerequisite) return false;
      return true;
    });
    return cards;
  }, [activeCards, filters]);

  const toggleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }, [sortCol]);

  // Apply sorting to filtered cards
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => ((a[sortCol] || 0) - (b[sortCol] || 0)) * dir);
  }, [filtered, sortCol, sortDir]);

  // Reset table page when filters/sort change
  useEffect(() => { setTablePage(0); }, [filtered, sortCol, sortDir]);

  const totalTablePages = Math.max(1, Math.ceil(sorted.length / graphLimit));
  const pagedCards = showAllTable ? sorted : sorted.slice(tablePage * graphLimit, (tablePage + 1) * graphLimit);

  const applyPreset = (preset) => {
    setSparqlEdited(false);
    setQueryResult(null);
    const f = { gains: [], affects: [], decks: [], types: [], winRange: [0, 1], playRange: [0, 1] };
    if (preset.filters.gains) f.gains = preset.filters.gains;
    if (preset.filters.affects) f.affects = preset.filters.affects;
    if (preset.filters.minWin) f.winRange[0] = preset.filters.minWin;
    if (preset.filters.maxPlay) f.playRange[1] = preset.filters.maxPlay;
    setFilters(f);
  };

  const selected = allCards.find(c => c.id === selectedId);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: E.bg, color: E.textSecondary, fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: isMobile ? 22 : 32, marginBottom: 12 }}>Loading knowledge graph...</div>
          <div style={{ fontSize: 14, color: E.textDim }}>Loading {meta.totalCards || ""} cards...</div>
        </div>
      </div>
    );
  }

  // ── Sidebar content (shared between desktop sidebar and mobile drawer) ─
  const filterContent = (
    <>

      {/* Norway Deck toggle */}
      <div style={{ padding: "12px 16px 4px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setNorwayOnly(false)}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid",
              borderColor: !norwayOnly ? E.blue : E.border,
              background: !norwayOnly ? E.blue + "22" : "transparent",
              color: !norwayOnly ? E.blue : E.textMuted,
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>All Cards</button>
          <button onClick={() => setNorwayOnly(true)}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid",
              borderColor: norwayOnly ? "#ef4444" : E.border,
              background: norwayOnly ? "#ef444422" : "transparent",
              color: norwayOnly ? "#ef4444" : E.textMuted,
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>{"\uD83C\uDDF3\uD83C\uDDF4"} Norway Deck</button>
        </div>
      </div>

      {/* Presets */}
      <div style={{ padding: "12px 16px 4px" }}>
        <div style={{ fontSize: 10, color: E.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Preset Queries</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PRESET_QUERIES.map(p => (
            <button key={p.label} onClick={() => { applyPreset(p); if (isMobile) setShowFilters(false); }} title={p.description}
              style={{
                padding: "3px 10px", borderRadius: 99, border: `1px solid ${E.border}`,
                background: "transparent", color: E.textFaint, fontSize: 11,
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.target.style.borderColor = E.accent; e.target.style.color = E.accent; }}
              onMouseLeave={e => { e.target.style.borderColor = E.border; e.target.style.color = E.textFaint; }}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        <ChipSelect label="Gains" options={meta.gains} selected={filters.gains} onToggle={v => toggle("gains", v)} colour={E.green} themeE={E} />
        <ChipSelect label="Affects" options={meta.affects} selected={filters.affects} onToggle={v => toggle("affects", v)} colour={E.accent} themeE={E} />
        <ChipSelect label="Deck" options={meta.decks} selected={filters.decks} onToggle={v => toggle("decks", v)} colour={E.purple} themeE={E} />
        <ChipSelect label="Type" options={meta.types} selected={filters.types} onToggle={v => toggle("types", v)} colour={E.pink} themeE={E} />
        <RangeFilter label="Win Ratio" min={0} max={1} value={filters.winRange} onChange={v => { setSparqlEdited(false); setFilters(f => ({ ...f, winRange: v })); }} themeE={E} />
        <RangeFilter label="Play Ratio" min={0} max={1} value={filters.playRange} onChange={v => { setSparqlEdited(false); setFilters(f => ({ ...f, playRange: v })); }} themeE={E} />
        {filters.prerequisite && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: E.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Prerequisite Filter</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ padding: "2px 8px", borderRadius: 99, background: E.accent + "22", color: E.accent, fontSize: 11, border: `1px solid ${E.accent}44` }}>
                {filters.prerequisite}
              </span>
              <button onClick={() => { setSparqlEdited(false); setFilters(f => ({ ...f, prerequisite: null })); }}
                style={{ background: "none", border: "none", color: E.textDim, fontSize: 14, cursor: "pointer", padding: 2, lineHeight: 1 }}
                title="Clear prerequisite filter"
              >{"\u2715"}</button>
            </div>
          </div>
        )}
      </div>

      {/* SPARQL toggle */}
      <div style={{ borderTop: `1px solid ${E.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => setShowSparql(s => !s)}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${E.border}`,
            background: showSparql ? E.surface : "transparent", color: E.textMuted,
            fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}>
          <span style={{ fontFamily: "monospace", fontSize: 14, color: E.blue }}>&lt;/&gt;</span>
          {showSparql ? "Hide" : "Show"} SPARQL Editor
        </button>
      </div>
    </>
  );

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────
  if (isMobile) {
    // Mobile mode switcher — pill buttons with home icon
    const mobileModes = [
      { mode: "home", emoji: "\uD83C\uDFE0", label: "" },
      { mode: "explorer", emoji: "\uD83D\uDDFA\uFE0F", label: "Explore" },
      { mode: "drafter", emoji: "\uD83C\uDCCF", label: "Draft" },
      { mode: "hands", emoji: "\uD83E\uDD1D", label: "Hands" },
      { mode: "score", emoji: "\uD83D\uDCCB", label: "Score" },
    ];
    const mobileModeSwitcher = (
      <div style={{ display: "flex", gap: 3, background: E.surface, borderRadius: 8, padding: 2, border: `1px solid ${E.border}` }}>
        {mobileModes.map(({ mode, emoji, label }) => {
          const isActive = appMode === mode;
          return (
            <button key={mode} onClick={() => setAppModeWithSidebar(mode)}
              style={{
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: isActive ? E.accent + "22" : "transparent",
                color: isActive ? E.accent : E.textMuted,
                fontSize: 11, fontWeight: isActive ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}>
              <span style={{ fontSize: mode === "home" ? 15 : 13 }}>{emoji}</span>{label}
            </button>
          );
        })}
      </div>
    );

    // ── Mobile home screen ────────────────────────────────────────────
    if (appMode === "home") {
      const homeItems = [
        { mode: "explorer", emoji: "\uD83D\uDDFA\uFE0F", title: "Card Explorer", desc: `Browse & search ${activeCards.length} cards` },
        { mode: "drafter", emoji: "\uD83C\uDCCF", title: "Drafter", desc: "Draft cards against 3 NPCs" },
        { mode: "hands", emoji: "\uD83E\uDD1D", title: "Community Hands", desc: "Browse drafted hands" },
        { mode: "score", emoji: "\uD83D\uDCCB", title: "Score Sheet", desc: "Calculate your game score" },
      ];
      return (
        <div style={{
          display: "flex", flexDirection: "column", height: "100vh",
          fontFamily: "Inter, system-ui, sans-serif",
          position: "relative", overflow: "hidden",
        }}>
          {/* Background image */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 0,
            backgroundImage: "url(/mobile-bg.png)",
            backgroundSize: "cover", backgroundPosition: "center top",
          }} />
          {/* Dark overlay for readability */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: "linear-gradient(to bottom, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0.7) 50%, rgba(15,23,42,0.92) 100%)",
          }} />

          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "24px 20px 20px" }}>
            {/* Logo / title */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <img src="/agricola-icon-no.png" alt="Agricola" style={{
                width: 72, height: 72, borderRadius: 16, marginBottom: 10,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }} />
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", letterSpacing: -0.5, textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
                Agricola Explorer
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                {activeCards.length} cards in the Norwegian deck
              </div>
            </div>

            {/* Menu cards — frosted glass style */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400, margin: "0 auto", width: "100%" }}>
              {homeItems.map(({ mode, emoji, title, desc }) => (
                <button key={mode} onClick={() => setAppModeWithSidebar(mode)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "16px 18px", borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                    cursor: "pointer", transition: "all 0.15s",
                    textAlign: "left", width: "100%",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                  }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, flexShrink: 0,
                  }}>{emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", lineHeight: 1.2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{desc}</div>
                  </div>
                  <div style={{ fontSize: 20, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{"\u203A"}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "14px 20px", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
            <a href="/about" style={{ color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>App documentation</a>
          </div>
        </div>
      );
    }

    if (appMode === "drafter" || appMode === "hands" || appMode === "score") {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: E.bg, color: E.textSecondary, fontFamily: "Inter, system-ui, sans-serif" }}>
          {/* Mobile drafter/hands/score header */}
          <div style={{
            display: "flex", alignItems: "center", padding: "10px 12px",
            borderBottom: `1px solid ${E.border}`, gap: 8, flexShrink: 0,
          }}>
            {mobileModeSwitcher}
            <div style={{ marginLeft: "auto" }}>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {appMode === "drafter"
              ? <Drafter allCards={activeCards} norwayOnly={norwayOnly} setNorwayOnly={setNorwayOnly} onViewHands={(dt) => setAppModeWithSidebar("hands", { draftType: dt })} />
              : appMode === "hands"
              ? <CommunityHands allCards={allCards} initialDraftType={handsDraftType} />
              : <ScoreSheet allCards={activeCards} />
            }
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: E.bg, color: E.textSecondary, fontFamily: "Inter, system-ui, sans-serif" }}>

        {/* Mobile header */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 12px",
          borderBottom: `1px solid ${E.border}`, gap: 8, flexShrink: 0,
        }}>
          {mobileModeSwitcher}

          {/* Hamburger / Filters */}
          <button onClick={() => setShowFilters(true)} style={{
            background: E.surface, border: `1px solid ${E.border}`, borderRadius: 8,
            color: E.textSecondary, padding: "6px 10px", fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ fontSize: 16 }}>{"\u2630"}</span>
            <span style={{ fontSize: 11 }}>Filters</span>
          </button>

          {/* View toggle */}
          <div style={{ display: "flex", background: E.surface, borderRadius: 8, overflow: "hidden" }}>
            {["graph", "table"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: "6px 12px", border: "none", fontSize: 11, cursor: "pointer",
                  background: view === v ? E.surfaceAlt : "transparent",
                  color: view === v ? E.text : E.textDim,
                  textTransform: "capitalize",
                }}>{v}</button>
            ))}
          </div>

          {/* Card count */}
          <div style={{ fontSize: 11, color: E.textDim, marginLeft: "auto" }}>
            <span style={{ color: E.blue, fontWeight: 600 }}>{filtered.length}</span>/{activeCards.length}
          </div>

          {/* Inspector toggle */}
          <button onClick={() => setShowInspector(true)} style={{
            background: selected ? E.surface : E.bg, border: `1px solid ${E.border}`, borderRadius: 8,
            color: selected ? E.blue : E.textFaint, padding: "6px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {"\uD83D\uDD0D"}
          </button>

        </div>

        {/* SPARQL Editor (below header on mobile too) */}
        {showSparql && (
          <SparqlEditor
            sparql={sparql}
            onChange={handleSparqlChange}
            onRun={handleRun}
            queryResult={queryResult}
            isRunning={isRunning}
            themeE={E}
          />
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {view === "graph" ? (
            <GraphView cards={filtered.slice(0, graphLimit)} onSelectCard={handleSelectCard} selectedId={selectedId} onOverflow={() => setView("table")} themeE={E} />
          ) : (
            <div style={{ overflow: "auto", height: "100%", padding: "0 8px 8px" }}>
              {/* List / Gallery sub-toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 4px", position: "sticky", top: 0, background: E.bg, zIndex: 2 }}>
                <div style={{ display: "flex", background: E.surface, borderRadius: 6, overflow: "hidden", border: `1px solid ${E.border}` }}>
                  {[["list", "\u2630"], ["gallery", "\u25A6"]].map(([s, icon]) => (
                    <button key={s} onClick={() => setTableStyle(s)}
                      style={{
                        padding: "4px 10px", border: "none", fontSize: 11, cursor: "pointer",
                        background: tableStyle === s ? E.surfaceAlt : "transparent",
                        color: tableStyle === s ? E.text : E.textDim,
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                      {icon} {s === "list" ? "List" : "Gallery"}
                    </button>
                  ))}
                </div>
                {/* Sort chips (visible in both modes) */}
                <div style={{ display: "flex", gap: 4, marginLeft: "auto", fontSize: 10 }}>
                  {[["pwr", "PWR"], ["winRatio", "Win"], ["adp", "ADP"]].map(([key, label]) => (
                    <button key={key} onClick={() => toggleSort(key)}
                      style={{
                        padding: "3px 8px", borderRadius: 99, border: `1px solid ${sortCol === key ? E.blue : E.border}`,
                        background: sortCol === key ? E.blue + "22" : "transparent",
                        color: sortCol === key ? E.blue : E.textDim,
                        fontSize: 10, cursor: "pointer",
                      }}>
                      {label} {sortCol === key ? (sortDir === "desc" ? "\u25BC" : "\u25B2") : ""}
                    </button>
                  ))}
                </div>
              </div>
              <PaginationBar page={tablePage} totalPages={totalTablePages} onPageChange={setTablePage}
                showAll={showAllTable} onToggleShowAll={() => setShowAllTable(s => !s)}
                totalCards={sorted.length} pageSize={graphLimit} themeE={E} compact />
              {tableStyle === "gallery" ? (
                <GalleryView cards={pagedCards} onSelectCard={handleSelectCard} selectedId={selectedId} themeE={E} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, color: E.text }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${E.border}`, color: E.textDim, textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>Card</th>
                      <th style={{ padding: "6px 4px" }}>Dk</th>
                      {[["winRatio", "Win"], ["playRatio", "Play"], ["pwr", "PWR"], ["adp", "ADP"]].map(([key, label]) => (
                        <th key={key} onClick={() => toggleSort(key)}
                          style={{ padding: "6px 4px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                          <span style={{ color: sortCol === key ? E.blue : "inherit" }}>{label}</span>
                          <span style={{ marginLeft: 2, fontSize: 8, opacity: sortCol === key ? 1 : 0.3 }}>
                            {sortCol === key ? (sortDir === "desc" ? "\u25BC" : "\u25B2") : "\u25BC"}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCards.map(c => {
                      const bannedBg = c.banned ? E.bannedBg : "transparent";
                      const rowBg = c.id === selectedId ? (c.banned ? E.bannedHoverBg : E.selectedBg) : bannedBg;
                      return (
                      <tr key={c.id} onClick={() => handleSelectCard(c.id)}
                        style={{ borderBottom: `1px solid ${E.border}11`, cursor: "pointer", background: rowBg }}>
                        <td style={{ padding: "5px 4px", fontWeight: 500, color: E.text, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ color: pwrColor(c), marginRight: 3 }}>{"\u25CF"}</span>{c.name}
                        </td>
                        <td style={{ padding: "5px 4px", color: E.textMuted }}>{c.deck}</td>
                        <td style={{ padding: "5px 4px", fontVariantNumeric: "tabular-nums", color: c.winRatio > 0.33 ? E.green : E.textMuted }}>
                          {(c.winRatio * 100).toFixed(0)}%
                        </td>
                        <td style={{ padding: "5px 4px", fontVariantNumeric: "tabular-nums", color: E.textMuted }}>
                          {(c.playRatio * 100).toFixed(0)}%
                        </td>
                        <td style={{ padding: "5px 4px" }}>
                          <CorrStat card={c} field="pwr" decimals={1} baseColor={c.pwr > 2 ? E.purple : E.textMuted} />
                        </td>
                        <td style={{ padding: "5px 4px" }}>
                          <CorrStat card={c} field="adp" decimals={1} baseColor={c.adp > 0 ? E.accent : E.textMuted} />
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              )}
              <PaginationBar page={tablePage} totalPages={totalTablePages} onPageChange={setTablePage}
                showAll={showAllTable} onToggleShowAll={() => setShowAllTable(s => !s)}
                totalCards={sorted.length} pageSize={graphLimit} themeE={E} compact />
            </div>
          )}
        </div>

        {/* Mobile drawers */}
        <Drawer open={showFilters} onClose={() => setShowFilters(false)} side="left" title="Filters & Queries" themeE={E}>
          {filterContent}
        </Drawer>

        <Drawer open={showInspector} onClose={() => setShowInspector(false)} side="right" title="Card Inspector" themeE={E}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${E.border}` }}>
            <CardSearchBox allCards={allCards} onSelect={(id) => { handleSelectCard(id); }} themeE={E} />
          </div>
          <CardDetail card={selected} onClose={() => setShowInspector(false)}
            onFilterGain={handleFilterGain} onFilterAffect={handleFilterAffect}
            onFilterPrereq={handleFilterPrereq} onSelectCardByName={handleSelectCardByName} themeE={E} />
        </Drawer>
      </div>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: E.bg, color: E.textSecondary, fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Top navigation bar ── */}
      <div style={{ display: "flex", alignItems: "center", height: 44, borderBottom: `1px solid ${E.border}`, background: E.surface, padding: "0 16px", gap: 16, flexShrink: 0 }}>
        {/* Left: App title */}
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.5, color: E.accent, whiteSpace: "nowrap" }}>
          {"\uD83C\uDF3E"} Agricola
        </div>

        {/* Center: Mode buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { mode: "explorer", emoji: "\uD83D\uDDFA\uFE0F", label: "Explorer" },
            { mode: "drafter", emoji: "\uD83C\uDCCF", label: "Drafter" },
            { mode: "hands", emoji: "\uD83E\uDD1D", label: "Hands" },
            { mode: "score", emoji: "\uD83D\uDCCB", label: "Score" },
          ].map(({ mode, emoji, label }) => {
            const isActive = appMode === mode;
            return (
              <button key={mode} onClick={() => setAppModeWithSidebar(mode)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 6, border: `1px solid ${isActive ? E.accent : E.border}`,
                  background: isActive ? E.accent + "18" : "transparent",
                  color: isActive ? E.accent : E.textMuted,
                  fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: "pointer",
                  transition: "all 0.15s", whiteSpace: "nowrap",
                }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Right: Theme toggle + Norway deck toggle */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setNorwayOnly(!norwayOnly)}
            style={{
              padding: "6px 10px", borderRadius: 6, border: `1px solid ${norwayOnly ? "#ef4444" : E.border}`,
              background: norwayOnly ? "#ef444422" : "transparent",
              color: norwayOnly ? "#ef4444" : E.textMuted,
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>{"\uD83C\uDDF3\uD83C\uDDF4"} NO</button>
          <button onClick={() => setExplorerTheme("dark")}
            style={{
              padding: "6px 10px", borderRadius: 6, border: `1px solid ${explorerTheme === "dark" ? E.blue : E.border}`,
              background: explorerTheme === "dark" ? E.blue + "22" : "transparent",
              color: explorerTheme === "dark" ? E.blue : E.textMuted,
              fontSize: 12, cursor: "pointer", transition: "all 0.15s",
            }}>{"\uD83C\uDF19"}</button>
          <button onClick={() => setExplorerTheme("light")}
            style={{
              padding: "6px 10px", borderRadius: 6, border: `1px solid ${explorerTheme === "light" ? E.blue : E.border}`,
              background: explorerTheme === "light" ? E.blue + "22" : "transparent",
              color: explorerTheme === "light" ? E.blue : E.textMuted,
              fontSize: 12, cursor: "pointer", transition: "all 0.15s",
            }}>{"\u2600\uFE0F"}</button>

          {/* Backup / Restore dropdown */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setBackupOpen(o => !o)}
              style={{
                padding: "6px 10px", borderRadius: 6, border: `1px solid ${backupOpen ? E.blue : E.border}`,
                background: backupOpen ? E.blue + "22" : "transparent",
                color: backupOpen ? E.blue : E.textMuted,
                fontSize: 12, cursor: "pointer", transition: "all 0.15s",
              }} title="Backup & Restore">{"\uD83D\uDCBE"}</button>
            {backupOpen && (
              <>
                <div onClick={() => setBackupOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                  background: E.surface, border: `1px solid ${E.border}`, borderRadius: 10,
                  padding: 8, minWidth: 180, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ fontSize: 10, color: E.textDim, textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px", fontWeight: 600 }}>
                    Data Backup
                  </div>
                  <button onClick={handleBackup}
                    style={{
                      padding: "8px 12px", borderRadius: 6, border: "none",
                      background: "transparent", color: E.text, fontSize: 12,
                      cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = E.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span>{"\u2B07"}</span> Export backup
                  </button>
                  <input ref={restoreFileRef} type="file" accept=".json" onChange={handleRestore} style={{ display: "none" }} />
                  <button onClick={() => restoreFileRef.current?.click()}
                    style={{
                      padding: "8px 12px", borderRadius: 6, border: "none",
                      background: "transparent", color: E.text, fontSize: 12,
                      cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = E.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span>{"\u2B06"}</span> Import backup
                  </button>
                  <div style={{ height: 1, background: E.border, margin: "4px 8px" }} />
                  <button onClick={handleExportRdf}
                    style={{
                      padding: "8px 12px", borderRadius: 6, border: "none",
                      background: "transparent", color: E.text, fontSize: 12,
                      cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = E.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span>{"\uD83C\uDF10"}</span> Export cards RDF
                  </button>
                </div>
              </>
            )}
          </div>
          <a href="/about" target="_blank" rel="noopener" style={{
            padding: "6px 10px", borderRadius: 6, border: `1px solid ${E.border}`,
            background: "transparent", color: E.textMuted,
            fontSize: 12, cursor: "pointer", textDecoration: "none", transition: "all 0.15s",
          }}>{"\u2139\uFE0F"}</a>
        </div>
        {backupMsg && (
          <div style={{
            position: "fixed", top: 12, right: 12, zIndex: 200,
            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: backupMsg.type === "ok" ? "#10b98122" : "#ef444422",
            color: backupMsg.type === "ok" ? "#10b981" : "#ef4444",
            border: `1px solid ${backupMsg.type === "ok" ? "#10b98144" : "#ef444444"}`,
          }}>
            {backupMsg.text}
          </div>
        )}
      </div>

      {/* Main flex row: sidebar + content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

      {/* ── Left sidebar: Query Builder (Explorer only) ── */}
      {appMode === "explorer" && (
      <div style={{
        width: sidebarCollapsed ? 40 : 280, minWidth: sidebarCollapsed ? 40 : 280,
        borderRight: `1px solid ${E.border}`, display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "width 0.2s, min-width 0.2s",
      }}>
        {sidebarCollapsed ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 8 }}>
            <button onClick={() => setSidebarCollapsed(false)}
              title="Expand sidebar"
              style={{
                background: "none", border: "none", color: E.textDim, fontSize: 16,
                cursor: "pointer", padding: 4, lineHeight: 1,
              }}>{"\u25B6"}</button>
          </div>
        ) : (
          <>
            {filterContent}
            {(appMode === "drafter" || appMode === "hands" || appMode === "score") && (
              <button onClick={() => setSidebarCollapsed(true)}
                style={{
                  background: "none", border: "none", borderTop: `1px solid ${E.border}`,
                  color: E.textDim, fontSize: 11, padding: "8px 16px", cursor: "pointer",
                  textAlign: "center",
                }}>{"\u25C0"} Collapse</button>
            )}
          </>
        )}
      </div>
      )}

      {/* ── Centre: Drafter / Hands / Explorer ── */}
      {appMode === "drafter" ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Drafter allCards={activeCards} norwayOnly={norwayOnly} setNorwayOnly={setNorwayOnly} onViewHands={(dt) => setAppModeWithSidebar("hands", { draftType: dt })} />
        </div>
      ) : appMode === "hands" ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <CommunityHands allCards={allCards} initialDraftType={handsDraftType} />
        </div>
      ) : appMode === "score" ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ScoreSheet allCards={activeCards} />
        </div>
      ) : (
      <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${E.border}`, gap: 12 }}>
          <div style={{ display: "flex", background: E.surface, borderRadius: 8, overflow: "hidden" }}>
            {["graph", "table"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: "6px 16px", border: "none", fontSize: 12, cursor: "pointer",
                  background: view === v ? E.surfaceAlt : "transparent",
                  color: view === v ? E.text : E.textDim,
                  textTransform: "capitalize",
                }}>{v}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: E.textDim }}>
            {view === "graph" ? (
              <>
                Showing <span style={{ color: E.blue, fontWeight: 600 }}>{Math.min(graphLimit, filtered.length)}</span> of <span style={{ color: E.blue, fontWeight: 600 }}>{filtered.length}</span> cards
                {filtered.length > graphLimit && (
                  <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                    <button onClick={() => setGraphLimit(gl => Math.min(gl * 2, filtered.length))}
                      style={{
                        padding: "2px 8px", borderRadius: 4, border: `1px solid ${E.border}`,
                        background: "transparent", color: E.textFaint, fontSize: 11, cursor: "pointer",
                      }}>Show more</button>
                    {graphLimit < filtered.length && (
                      <button onClick={() => setGraphLimit(filtered.length)}
                        style={{
                          padding: "2px 8px", borderRadius: 4, border: `1px solid ${E.border}`,
                          background: "transparent", color: E.textFaint, fontSize: 11, cursor: "pointer",
                        }}>Show all</button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                Showing <span style={{ color: E.blue, fontWeight: 600 }}>{showAllTable ? sorted.length : pagedCards.length}</span> of <span style={{ color: E.blue, fontWeight: 600 }}>{sorted.length}</span> cards
              </>
            )}
          </div>

          {sparqlEdited && (
            <button onClick={handleResetSparql}
              style={{
                padding: "3px 10px", borderRadius: 6, border: `1px solid ${E.border}`,
                background: "transparent", color: E.accent, fontSize: 11, cursor: "pointer",
              }}>
              Reset to filters
            </button>
          )}

          {/* PWR Legend */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 10, color: E.textDim, alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: E.textMuted }}>PWR:</span>
            {[
              ["< 1", PWR_COLOURS.low],
              ["1\u20132", PWR_COLOURS.mid],
              ["> 2", PWR_COLOURS.high],
              ["N/A", PWR_COLOURS.none],
              ["Banned", PWR_COLOURS.banned],
            ].map(([label, color]) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: "inline-block", opacity: label === "Banned" ? 0.5 : 0.85 }} />{label}
              </span>
            ))}
          </div>
        </div>

        {/* SPARQL Editor panel */}
        {showSparql && (
          <SparqlEditor
            sparql={sparql}
            onChange={handleSparqlChange}
            onRun={handleRun}
            queryResult={queryResult}
            isRunning={isRunning}
            themeE={E}
          />
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {view === "graph" ? (
            <GraphView cards={filtered.slice(0, graphLimit)} onSelectCard={handleSelectCard} selectedId={selectedId} onOverflow={() => setView("table")} themeE={E} />
          ) : (
            <div style={{ overflow: "auto", height: "100%", padding: "0 16px 16px" }}>
              {/* List / Gallery sub-toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 6px", position: "sticky", top: 0, background: E.bg, zIndex: 2 }}>
                <div style={{ display: "flex", background: E.surface, borderRadius: 6, overflow: "hidden", border: `1px solid ${E.border}` }}>
                  {[["list", "\u2630"], ["gallery", "\u25A6"]].map(([s, icon]) => (
                    <button key={s} onClick={() => setTableStyle(s)}
                      style={{
                        padding: "5px 14px", border: "none", fontSize: 12, cursor: "pointer",
                        background: tableStyle === s ? E.surfaceAlt : "transparent",
                        color: tableStyle === s ? E.text : E.textDim,
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                      {icon} {s === "list" ? "List" : "Gallery"}
                    </button>
                  ))}
                </div>
              </div>
              <PaginationBar page={tablePage} totalPages={totalTablePages} onPageChange={setTablePage}
                showAll={showAllTable} onToggleShowAll={() => setShowAllTable(s => !s)}
                totalCards={sorted.length} pageSize={graphLimit} themeE={E} />
              {tableStyle === "gallery" ? (
                <GalleryView cards={pagedCards} onSelectCard={handleSelectCard} selectedId={selectedId} themeE={E} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: E.text }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${E.border}`, color: E.textDim, textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}>Card</th>
                      <th style={{ padding: "8px 6px" }}>Deck</th>
                      <th style={{ padding: "8px 6px" }}>Type</th>
                      {[["winRatio", "Win %"], ["playRatio", "Play %"], ["pwr", "PWR"], ["adp", "ADP"]].map(([key, label]) => (
                        <th key={key} onClick={() => toggleSort(key)}
                          style={{ padding: "8px 6px", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                          onMouseEnter={e => e.currentTarget.style.color = E.textSecondary}
                          onMouseLeave={e => e.currentTarget.style.color = sortCol === key ? E.blue : E.textDim}
                        >
                          <span style={{ color: sortCol === key ? E.blue : "inherit" }}>{label}</span>
                          <span style={{ marginLeft: 4, fontSize: 10, opacity: sortCol === key ? 1 : 0.3 }}>
                            {sortCol === key ? (sortDir === "desc" ? "\u25BC" : "\u25B2") : "\u25BC"}
                          </span>
                        </th>
                      ))}
                      <th style={{ padding: "8px 6px" }}>Gains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCards.map(c => {
                      const bannedBg = c.banned ? E.bannedBg : "transparent";
                      const rowBg = c.id === selectedId ? (c.banned ? E.bannedHoverBg : E.selectedBg) : bannedBg;
                      return (
                      <tr key={c.id} onClick={() => handleSelectCard(c.id)}
                        style={{
                          borderBottom: `1px solid ${E.border}11`, cursor: "pointer",
                          background: rowBg,
                        }}
                        onMouseEnter={e => { if (c.id !== selectedId) e.currentTarget.style.background = c.banned ? E.bannedHoverBg : E.tableHoverBg; }}
                        onMouseLeave={e => { if (c.id !== selectedId) e.currentTarget.style.background = bannedBg; }}
                      >
                        <td style={{ padding: "6px", fontWeight: 500, color: E.text }}>
                          <span style={{ color: pwrColor(c), marginRight: 4 }}>{"\u25CF"}</span>{c.name}
                        </td>
                        <td style={{ padding: "6px", color: E.textMuted }}>{c.deck}</td>
                        <td style={{ padding: "6px", color: E.text, whiteSpace: "nowrap" }}>{TYPE_ICONS[c.type]} {c.type.replace(/([A-Z])/g, " $1").trim()}</td>
                        <td style={{ padding: "6px", fontVariantNumeric: "tabular-nums", color: c.winRatio > 0.33 ? E.green : E.textMuted }}>
                          {(c.winRatio * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: "6px", fontVariantNumeric: "tabular-nums", color: E.textMuted }}>
                          {(c.playRatio * 100).toFixed(1)}%
                        </td>
                        <td style={{ padding: "6px" }}>
                          <CorrStat card={c} field="pwr" decimals={2} baseColor={c.pwr > 2 ? E.purple : E.textMuted} />
                        </td>
                        <td style={{ padding: "6px" }}>
                          <CorrStat card={c} field="adp" decimals={2} baseColor={c.adp > 0 ? E.accent : E.textMuted} />
                        </td>
                        <td style={{ padding: "6px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                            {c.gains.slice(0, 4).map(g => (
                              <span key={g} style={{ padding: "1px 6px", borderRadius: 99, background: E.green + "15", color: E.green, fontSize: 10 }}>
                                {g.replace(/_/g, " ")}
                              </span>
                            ))}
                            {c.gains.length > 4 && <span style={{ color: E.textDim, fontSize: 10 }}>+{c.gains.length - 4}</span>}
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              )}
              <PaginationBar page={tablePage} totalPages={totalTablePages} onPageChange={setTablePage}
                showAll={showAllTable} onToggleShowAll={() => setShowAllTable(s => !s)}
                totalCards={sorted.length} pageSize={graphLimit} themeE={E} />
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar: Card Inspector ── */}
      <div style={{ width: 280, borderLeft: `1px solid ${E.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ borderBottom: `1px solid ${E.border}`, flexShrink: 0, background: E.surface }}>
          <div style={{ padding: "10px 12px 6px", color: E.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: 1,
            fontWeight: 600, textAlign: "center" }}>
            Card Inspector
          </div>
          <div style={{ padding: "0 10px 10px" }}>
            <CardSearchBox allCards={allCards} onSelect={handleSelectCard} themeE={E} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <CardDetail card={selected} onClose={() => setSelectedId(null)}
            onFilterGain={handleFilterGain}
            onFilterAffect={handleFilterAffect}
            onFilterPrereq={handleFilterPrereq}
            onSelectCardByName={handleSelectCardByName}
            themeE={E} />
        </div>
      </div>
      </>
      )}
      </div>
    </div>
  );
}
