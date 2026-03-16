import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";

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

// ── Colour palette ──────────────────────────────────────────────────────────
const DECK_COLOURS = {
  E: "#3b82f6", I: "#8b5cf6", K: "#ec4899", Major: "#f59e0b",
  Fr: "#10b981", Wm: "#ef4444", G: "#6366f1", G4: "#14b8a6",
  G5: "#f97316", G6: "#a855f7", G7: "#06b6d4",
};
const TYPE_ICONS = { Occupation: "\uD83D\uDC64", MinorImprovement: "\uD83D\uDD27", MajorImprovement: "\u2B50" };

const PRESET_QUERIES = [
  { label: "Food Engines", description: "Cards that gain food on recurring triggers", filters: { gains: ["food"], affects: ["each_round", "harvest", "whenever"] } },
  { label: "Hidden Gems", description: "High win rate, rarely played", filters: { minWin: 0.30, maxPlay: 0.20 } },
  { label: "Versatile Cards", description: "Cards with 4+ distinct gain types", filters: { minGains: 4 } },
  { label: "Animal Strategy", description: "Cards that gain animals", filters: { gains: ["sheep", "boar", "cattle"] } },
  { label: "Baking Strategy", description: "Cards related to baking", filters: { gains: ["bake", "cooking"] } },
  { label: "Cost \u2264 2 resources", description: "Cheap improvements with good win rates", filters: { maxCostLen: 2, minWin: 0.28 } },
];

// ── Build SPARQL string from filters ────────────────────────────────────────
function buildSparql(filters, limit, allTypes) {
  const lines = [
    "PREFIX : <http://veronahe.no/agricola/>",
    "PREFIX def: <urn:maplib_default:>",
    "",
    "SELECT ?name ?deck ?winRatio",
    "WHERE {"
  ];
  lines.push("  ?card rdfs:label ?name ; def:Deck ?deck ; def:win_ratio ?winRatio .");

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
  if (limit !== "all") lines.push("LIMIT " + limit);

  return lines.join("\n");
}


// ── Graph visualisation ─────────────────────────────────────────────────────
const GRAPH_MAX_CARDS = 300;

function GraphView({ cards, onSelectCard, selectedId, onOverflow }) {
  const svgRef = useRef(null);
  const tooMany = cards.length > GRAPH_MAX_CARDS;

  useEffect(() => {
    if (tooMany || !svgRef.current || cards.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
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
    cards.forEach(c => {
      c.gains.forEach(g => links.push({ source: c.id, target: g, type: "gains" }));
      c.relations.forEach(r => {
        const target = cards.find(x => x.name.replace(/\s/g, "") === r || x.id === r);
        if (target) links.push({ source: c.id, target: target.id, type: "relatedTo" });
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
      .attr("stroke", d => d.type === "relatedTo" ? "#f59e0b" : "#cbd5e1")
      .attr("stroke-width", d => d.type === "relatedTo" ? 2 : 1)
      .attr("stroke-dasharray", d => d.type === "relatedTo" ? "6,3" : "none")
      .attr("opacity", 0.5);

    const node = g.append("g").selectAll("g").data(nodes).join("g")
      .attr("cursor", "pointer")
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (e, d) => { if (d.nodeType === "card") onSelectCard(d.id); });

    node.filter(d => d.nodeType === "card").append("circle")
      .attr("r", d => 6 + (d.winRatio || 0) * 20)
      .attr("fill", d => DECK_COLOURS[d.deck] || "#94a3b8")
      .attr("stroke", d => d.id === selectedId ? "#fff" : "transparent")
      .attr("stroke-width", 3).attr("opacity", 0.85);

    node.filter(d => d.nodeType === "gain").append("rect")
      .attr("x", -8).attr("y", -8).attr("width", 16).attr("height", 16).attr("rx", 3)
      .attr("fill", "#1e293b").attr("stroke", "#475569").attr("opacity", 0.7);

    // Show labels when ≤50 nodes; hover-only above 50
    const showLabels = n <= 50;
    node.append("text")
      .text(d => d.name)
      .attr("font-size", d => d.nodeType === "card" ? 9 : 7)
      .attr("fill", d => d.nodeType === "card" ? "#e2e8f0" : "#94a3b8")
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
  }, [cards, selectedId, onSelectCard]);

  if (tooMany) {
    return (
      <div style={{
        width: "100%", height: "100%", background: "#0f172a", borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
      }}>
        <div style={{ fontSize: 40, opacity: 0.4 }}>{"\uD83C\uDF3E"}</div>
        <div style={{ color: "#94a3b8", fontSize: 14, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
          Too many cards to render as a graph ({cards.length} cards, max {GRAPH_MAX_CARDS}).
          <br />Reduce your selection with filters or a lower limit.
        </div>
        <button onClick={onOverflow}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "1px solid #334155",
            background: "#1e293b", color: "#3b82f6", fontSize: 13, fontWeight: 600,
            cursor: "pointer", transition: "all 0.15s",
          }}>
          Switch to table view
        </button>
      </div>
    );
  }

  return <svg ref={svgRef} style={{ width: "100%", height: "100%", background: "#0f172a", borderRadius: 12 }} />;
}

// ── Filter chips ────────────────────────────────────────────────────────────
function ChipSelect({ label, options, selected, onToggle, colour }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(o => {
          const active = selected.includes(o);
          return (
            <button key={o} onClick={() => onToggle(o)}
              style={{
                padding: "3px 10px", borderRadius: 99, border: "1px solid",
                borderColor: active ? (colour || "#3b82f6") : "#334155",
                background: active ? (colour || "#3b82f6") + "22" : "transparent",
                color: active ? (colour || "#3b82f6") : "#94a3b8",
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
function RangeFilter({ label, min, max, value, onChange, step = 0.01 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 2 }}>
        <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{value[0].toFixed(2)} \u2013 {value[1].toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="range" min={min} max={max} step={step} value={value[0]}
          onChange={e => onChange([parseFloat(e.target.value), value[1]])}
          style={{ flex: 1, accentColor: "#3b82f6" }} />
        <input type="range" min={min} max={max} step={step} value={value[1]}
          onChange={e => onChange([value[0], parseFloat(e.target.value)])}
          style={{ flex: 1, accentColor: "#3b82f6" }} />
      </div>
    </div>
  );
}

// ── Card detail panel ───────────────────────────────────────────────────────
function CardDetail({ card }) {
  if (!card) return (
    <div style={{ padding: 24, color: "#64748b", fontSize: 13, textAlign: "center" }}>
      Click a card node or table row to inspect it.
    </div>
  );

  const barW = Math.round(card.winRatio * 200);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{TYPE_ICONS[card.type]}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{card.name}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{card.id} \u00B7 {card.type.replace(/([A-Z])/g, " $1").trim()} \u00B7 Deck {card.deck}</div>
        </div>
      </div>

      {card.costLabel && (
        <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 8 }}>
          <span style={{ color: "#64748b" }}>Cost:</span> {card.costLabel}
        </div>
      )}

      <div style={{ fontSize: 12, marginBottom: 8 }}>
        <span style={{ color: "#64748b" }}>Win rate: </span>
        <span style={{ color: "#3b82f6", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{(card.winRatio * 100).toFixed(1)}%</span>
        <div style={{ height: 4, background: "#1e293b", borderRadius: 2, marginTop: 4 }}>
          <div style={{ width: barW, maxWidth: "100%", height: 4, background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: 2 }} />
        </div>
      </div>

      {card.text && (
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10, lineHeight: 1.5, fontStyle: "italic", borderLeft: "2px solid #334155", paddingLeft: 8 }}>
          {card.text}
        </div>
      )}

      {card.gains.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Gains</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.gains.map(g => (
              <span key={g} style={{ padding: "2px 8px", borderRadius: 99, background: "#10b98122", color: "#10b981", fontSize: 11, border: "1px solid #10b98144" }}>
                {g.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {card.affects.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Affects</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.affects.map(a => (
              <span key={a} style={{ padding: "2px 8px", borderRadius: 99, background: "#f59e0b22", color: "#f59e0b", fontSize: 11, border: "1px solid #f59e0b44" }}>
                {a.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {card.relations.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Related Cards</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {card.relations.map(r => (
              <span key={r} style={{ padding: "2px 8px", borderRadius: 99, background: "#ec489922", color: "#ec4899", fontSize: 11, border: "1px solid #ec489944" }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SPARQL Editor ───────────────────────────────────────────────────────────
function SparqlEditor({ sparql, onChange, onRun, queryResult, isRunning }) {
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
            background: "#020617", border: "1px solid #1e293b", borderRadius: 8,
            padding: 12, paddingBottom: 40, fontSize: 12, color: "#e2e8f0",
            lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            outline: "none", boxSizing: "border-box",
          }}
        />
        {/* Run button overlay */}
        <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#475569" }}>Ctrl+Enter</span>
          <button onClick={onRun}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: isRunning ? "#334155" : "linear-gradient(135deg, #10b981, #059669)",
              color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              opacity: isRunning ? 0.6 : 1, transition: "all 0.15s",
              boxShadow: isRunning ? "none" : "0 2px 8px #10b98144",
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
          background: "#020617", border: "1px solid #1e293b", borderRadius: 8,
          maxHeight: 200, overflow: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid #1e293b" }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>
              {queryResult.rows.length} of {queryResult.total} results
            </span>
            <span style={{ fontSize: 10, color: "#334155" }}>
              {queryResult.time}ms
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {queryResult.columns.map(col => (
                  <th key={col} style={{ padding: "4px 8px", textAlign: "left", color: "#64748b", borderBottom: "1px solid #1e293b", fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    ?{col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queryResult.rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #0f172a" }}>
                  {queryResult.columns.map(col => (
                    <td key={col} style={{ padding: "4px 8px", color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
              {queryResult.rows.length === 0 && (
                <tr><td colSpan={queryResult.columns.length} style={{ padding: 12, color: "#475569", textAlign: "center" }}>No results</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  // Data from backend
  const [allCards, setAllCards] = useState([]);
  const [meta, setMeta] = useState({ gains: [], affects: [], decks: [], types: [], totalCards: 0 });
  const [loading, setLoading] = useState(true);

  // Filters & UI state
  const [filters, setFilters] = useState({
    gains: [], affects: [], decks: [], types: [],
    winRange: [0, 1], playRange: [0, 1],
  });
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("graph");
  const [showSparql, setShowSparql] = useState(false);
  const [limit, setLimit] = useState(100);           // 10 | 20 | 50 | 100 | "all"
  const [sparql, setSparql] = useState("");
  const [sparqlEdited, setSparqlEdited] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

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
    () => buildSparql({ ...filters, _allDecksLen: meta.decks.length }, limit, meta.types),
    [filters, limit, meta]
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
    let cards = allCards.filter(c => {
      if (filters.gains.length > 0 && !filters.gains.some(g => c.gains.includes(g))) return false;
      if (filters.affects.length > 0 && !filters.affects.some(a => c.affects.includes(a))) return false;
      if (filters.decks.length > 0 && !filters.decks.includes(c.deck)) return false;
      if (filters.types.length > 0 && !filters.types.includes(c.type)) return false;
      if (c.winRatio < filters.winRange[0] || c.winRatio > filters.winRange[1]) return false;
      if (c.playRatio < filters.playRange[0] || c.playRatio > filters.playRange[1]) return false;
      return true;
    });
    if (limit !== "all") cards = cards.slice(0, limit);
    return cards;
  }, [allCards, filters, limit]);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>Loading knowledge graph...</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>Building RDF model from {meta.totalCards || "1354"} cards</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Left sidebar: Query Builder ── */}
      <div style={{ width: 280, borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: "#f59e0b" }}>Agricola</span> Explorer
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
            Knowledge Graph \u00B7 {allCards.length} cards
          </div>
        </div>

        {/* Presets */}
        <div style={{ padding: "12px 16px 4px" }}>
          <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Preset Queries</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PRESET_QUERIES.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} title={p.description}
                style={{
                  padding: "3px 10px", borderRadius: 99, border: "1px solid #334155",
                  background: "transparent", color: "#cbd5e1", fontSize: 11,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.target.style.borderColor = "#f59e0b"; e.target.style.color = "#f59e0b"; }}
                onMouseLeave={e => { e.target.style.borderColor = "#334155"; e.target.style.color = "#cbd5e1"; }}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
          <ChipSelect label="Gains" options={meta.gains} selected={filters.gains} onToggle={v => toggle("gains", v)} colour="#10b981" />
          <ChipSelect label="Affects" options={meta.affects} selected={filters.affects} onToggle={v => toggle("affects", v)} colour="#f59e0b" />
          <ChipSelect label="Deck" options={meta.decks} selected={filters.decks} onToggle={v => toggle("decks", v)} colour="#8b5cf6" />
          <ChipSelect label="Type" options={meta.types} selected={filters.types} onToggle={v => toggle("types", v)} colour="#ec4899" />
          <RangeFilter label="Win Ratio" min={0} max={1} value={filters.winRange} onChange={v => { setSparqlEdited(false); setFilters(f => ({ ...f, winRange: v })); }} />
          <RangeFilter label="Play Ratio" min={0} max={1} value={filters.playRange} onChange={v => { setSparqlEdited(false); setFilters(f => ({ ...f, playRange: v })); }} />
        </div>

        {/* SPARQL toggle + limit */}
        <div style={{ borderTop: "1px solid #1e293b", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Result limit */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Limit</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[10, 20, 50, 100, "all"].map(n => (
                <button key={n} onClick={() => { setLimit(n); setSparqlEdited(false); }}
                  style={{
                    padding: "3px 10px", borderRadius: 6, border: "1px solid",
                    borderColor: limit === n ? "#3b82f6" : "#334155",
                    background: limit === n ? "#3b82f622" : "transparent",
                    color: limit === n ? "#3b82f6" : "#64748b",
                    fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                    textTransform: n === "all" ? "uppercase" : "none",
                  }}>{n === "all" ? "All" : n}</button>
              ))}
            </div>
          </div>

          <button onClick={() => setShowSparql(s => !s)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #334155",
              background: showSparql ? "#1e293b" : "transparent", color: "#94a3b8",
              fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
            <span style={{ fontFamily: "monospace", fontSize: 14, color: "#3b82f6" }}>&lt;/&gt;</span>
            {showSparql ? "Hide" : "Show"} SPARQL Editor
          </button>
        </div>
      </div>

      {/* ── Centre: Graph / Table + SPARQL Editor ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #1e293b", gap: 12 }}>
          <div style={{ display: "flex", background: "#1e293b", borderRadius: 8, overflow: "hidden" }}>
            {["graph", "table"].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: "6px 16px", border: "none", fontSize: 12, cursor: "pointer",
                  background: view === v ? "#334155" : "transparent",
                  color: view === v ? "#f1f5f9" : "#64748b",
                  textTransform: "capitalize",
                }}>{v}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Showing <span style={{ color: "#3b82f6", fontWeight: 600 }}>{filtered.length}</span> of {allCards.length} cards
            {limit !== "all" && <span style={{ color: "#334155", marginLeft: 4 }}>(limit {limit})</span>}
          </div>

          {sparqlEdited && (
            <button onClick={handleResetSparql}
              style={{
                padding: "3px 10px", borderRadius: 6, border: "1px solid #334155",
                background: "transparent", color: "#f59e0b", fontSize: 11, cursor: "pointer",
              }}>
              Reset to filters
            </button>
          )}

          {/* Legend */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 10, color: "#64748b" }}>
            {Object.entries(DECK_COLOURS).slice(0, 7).map(([k, v]) => (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: v, display: "inline-block" }} />{k}
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
          />
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {view === "graph" ? (
            <GraphView cards={filtered} onSelectCard={setSelectedId} selectedId={selectedId} onOverflow={() => setView("table")} />
          ) : (
            <div style={{ overflow: "auto", height: "100%", padding: "0 16px 16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b", color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px" }}>Card</th>
                    <th style={{ padding: "8px 6px" }}>Deck</th>
                    <th style={{ padding: "8px 6px" }}>Type</th>
                    <th style={{ padding: "8px 6px" }}>Win %</th>
                    <th style={{ padding: "8px 6px" }}>Play %</th>
                    <th style={{ padding: "8px 6px" }}>Gains</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} onClick={() => setSelectedId(c.id)}
                      style={{
                        borderBottom: "1px solid #1e293b11", cursor: "pointer",
                        background: c.id === selectedId ? "#1e293b" : "transparent",
                      }}
                      onMouseEnter={e => { if (c.id !== selectedId) e.currentTarget.style.background = "#1e293b66"; }}
                      onMouseLeave={e => { if (c.id !== selectedId) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "6px", fontWeight: 500, color: "#f1f5f9" }}>
                        <span style={{ color: DECK_COLOURS[c.deck] || "#94a3b8", marginRight: 4 }}>\u25CF</span>{c.name}
                      </td>
                      <td style={{ padding: "6px", color: "#94a3b8" }}>{c.deck}</td>
                      <td style={{ padding: "6px" }}>{TYPE_ICONS[c.type]} {c.type.replace(/([A-Z])/g, " $1").trim()}</td>
                      <td style={{ padding: "6px", fontVariantNumeric: "tabular-nums", color: c.winRatio > 0.33 ? "#10b981" : "#94a3b8" }}>
                        {(c.winRatio * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "6px", fontVariantNumeric: "tabular-nums", color: "#94a3b8" }}>
                        {(c.playRatio * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: "6px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                          {c.gains.slice(0, 4).map(g => (
                            <span key={g} style={{ padding: "1px 6px", borderRadius: 99, background: "#10b98115", color: "#10b981", fontSize: 10 }}>
                              {g.replace(/_/g, " ")}
                            </span>
                          ))}
                          {c.gains.length > 4 && <span style={{ color: "#64748b", fontSize: 10 }}>+{c.gains.length - 4}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar: Card Inspector ── */}
      <div style={{ width: 260, borderLeft: "1px solid #1e293b", overflow: "auto" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e293b", fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
          Card Inspector
        </div>
        <CardDetail card={selected} />
      </div>
    </div>
  );
}
