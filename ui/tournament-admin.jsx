import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "./auth.jsx";

/* Tournament admin view: participants & settings, table draw, live spreadsheet.
   Only for the users "tournament-admin" and "admin" (the server enforces this too). */

const T = {
  bg: "#faf9f7", surface: "#ffffff", surfaceAlt: "#f5f3f0",
  border: "#e8e4df", borderLight: "#f0ece7",
  text: "#1a1a1a", textSecondary: "#6b6560", textMuted: "#9e9790",
  accent: "#b45309", accentLight: "#fef3c7", accentBg: "#fffbeb",
  blue: "#2563eb", blueBg: "#eff6ff", green: "#059669", greenLight: "#ecfdf5",
  red: "#dc2626", redBg: "#fef2f2",
};

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method, credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const labelOf = (p) => (p.displayName || p.name || p.username || "").trim();

/** Same split as the server: bigger tables first. */
function tableSizes(n, fill = "3", numTables = 0) {
  if (n <= 0) return [];
  let t = numTables > 0 ? numTables : fill === "5" ? Math.max(1, Math.floor(n / 4)) : Math.max(1, Math.ceil(n / 4));
  t = Math.max(1, Math.min(t, n));
  const base = Math.floor(n / t), extra = n % t;
  return [...Array(extra).fill(base + 1), ...Array(t - extra).fill(base)];
}

function describeSizes(sizes) {
  const counts = {};
  sizes.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => b - a).map(s => `${counts[s]} × ${s}`).join(" + ");
}

const card = { background: T.surface, border: `1px solid ${T.borderLight}`, padding: "14px 16px", marginBottom: 14 };
const label = { display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 };
const input = { width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: T.surface, color: T.text };
const btn = (kind = "primary", disabled = false) => ({
  padding: "8px 14px", border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? T.red : T.border}`,
  background: disabled ? T.borderLight : kind === "primary" ? T.accent : kind === "danger" ? T.redBg : T.surface,
  color: disabled ? T.textMuted : kind === "primary" ? "#fff" : kind === "danger" ? T.red : T.textSecondary,
  fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap",
});

/* ───────────────────────── Setup ───────────────────────── */
function SetupTab({ tour, onSaved, onDeleted }) {
  const [name, setName] = useState(tour?.name || "");
  const [startDate, setStartDate] = useState(tour?.startDate || "");
  const [endDate, setEndDate] = useState(tour?.endDate || "");
  const [participantsText, setParticipantsText] = useState((tour?.players || []).map(labelOf).filter(Boolean).join("\n"));
  const [numGames, setNumGames] = useState(tour?.numGames || 5);
  const [hasFinal, setHasFinal] = useState(tour ? !!tour.hasFinal : true);
  const [finalWeight, setFinalWeight] = useState(tour?.finalWeight ?? 1.25);
  const [tableFill, setTableFill] = useState(tour?.tableFill || "3");
  const [numTables, setNumTables] = useState(tour?.numTables || "");
  const [isActive, setIsActive] = useState(tour ? !!tour.isActive : true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const names = useMemo(() => participantsText.split("\n").map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean), [participantsText]);
  const dupes = useMemo(() => {
    const seen = new Set(), d = new Set();
    names.forEach(n => { const k = n.toLowerCase(); if (seen.has(k)) d.add(n); seen.add(k); });
    return [...d];
  }, [names]);
  const sizes = tableSizes(names.length, tableFill, parseInt(numTables) || 0);
  const badSizes = sizes.some(s => s < 3 || s > 5);

  const drawNames = useMemo(() => {
    const set = new Set();
    (tour?.draw?.rounds || []).forEach(r => r.forEach(t => t.forEach(n => set.add(n.toLowerCase()))));
    return set;
  }, [tour]);
  const drawOutdated = tour?.draw && (names.length !== drawNames.size || names.some(n => !drawNames.has(n.toLowerCase())));

  const save = async () => {
    if (!name.trim() || !startDate || dupes.length) return;
    setSaving(true); setMsg(null);
    const byLabel = new Map((tour?.players || []).map(p => [labelOf(p).toLowerCase(), p]));
    const body = {
      name: name.trim(), startDate, endDate,
      numGames: parseInt(numGames) || 0, numTables: parseInt(numTables) || 0,
      players: names.map(n => byLabel.get(n.toLowerCase()) || { name: n }),
      isActive, hasFinal, finalWeight: parseFloat(String(finalWeight).replace(",", ".")) || 1.25, tableFill,
    };
    try {
      if (tour) {
        await api(`/api/tournaments/${tour.id}`, { method: "PUT", body });
        onSaved(tour.id);
      } else {
        const r = await api("/api/tournaments", { method: "POST", body });
        onSaved(r.id);
      }
      setMsg({ ok: true, text: "Saved" });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setSaving(false);
  };

  const remove = async () => {
    if (!tour || !window.confirm(`Delete "${tour.name}"?\n\nThe tournament and its draw are removed; saved scores are kept.`)) return;
    try { await api(`/api/tournaments/${tour.id}`, { method: "DELETE" }); onDeleted(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
      <div>
        <div style={card}>
          <div style={{ marginBottom: 10 }}>
            <label style={label}>Tournament name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NM 2026" style={input} />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}><label style={label}>Start date *</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={input} /></div>
            <div style={{ flex: 1 }}><label style={label}>End date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={input} /></div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.text, cursor: "pointer" }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Active (players can pick it in the score sheet)
          </label>
        </div>

        <div style={card}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Games (excl. final)</label>
              <input type="number" min="1" max="20" value={numGames} onChange={e => setNumGames(e.target.value)} style={input} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={label}>Tables</label>
              <input type="number" min="1" value={numTables} onChange={e => setNumTables(e.target.value)}
                placeholder={`auto (${tableSizes(names.length, tableFill).length || "–"})`} style={input} />
            </div>
          </div>
          <label style={label}>When players don't divide into tables of 4</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[["3", "Add 3-player tables"], ["5", "Add 5-player tables"]].map(([v, l]) => (
              <button key={v} onClick={() => setTableFill(v)} style={{
                ...btn("secondary"), flex: 1, fontWeight: tableFill === v ? 700 : 500,
                borderColor: tableFill === v ? T.accent : T.border, color: tableFill === v ? T.accent : T.textSecondary,
                background: tableFill === v ? T.accentBg : T.surface,
              }}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: badSizes ? T.red : T.textSecondary, background: badSizes ? T.redBg : T.surfaceAlt, padding: "8px 10px", marginBottom: 10 }}>
            {names.length ? <>{names.length} players → {sizes.length} tables ({describeSizes(sizes)})</> : "Add participants to see the table split"}
            {badSizes && " — tables should have 3–5 players"}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: T.text, cursor: "pointer", marginBottom: 6 }}>
            <input type="checkbox" checked={hasFinal} onChange={e => setHasFinal(e.target.checked)} />
            Final after the last game (seated by standings)
          </label>
          {hasFinal && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textSecondary }}>
              Point weight in the final
              <input type="number" step="0.05" min="0" value={finalWeight} onChange={e => setFinalWeight(e.target.value)} style={{ ...input, width: 80 }} />
            </label>
          )}
        </div>
      </div>

      <div>
        <div style={card}>
          <label style={label}>Participants — one per line ({names.length})</label>
          <textarea value={participantsText} onChange={e => setParticipantsText(e.target.value)} rows={16}
            placeholder={"Anne\nAslak\nBernt Ivar\n…"} style={{ ...input, resize: "vertical", lineHeight: 1.5 }} />
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
            Use the names players will pick in the score sheet. You can paste a list from a spreadsheet.
          </div>
          {dupes.length > 0 && <div style={{ fontSize: 12, color: T.red, marginTop: 6 }}>Duplicate names: {dupes.join(", ")}</div>}
          {drawOutdated && (
            <div style={{ fontSize: 12, color: T.accent, background: T.accentBg, padding: "6px 8px", marginTop: 8 }}>
              The participant list differs from the current draw — draw again (or adjust the draw) after saving.
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={save} disabled={saving || !name.trim() || !startDate || dupes.length > 0}
            style={btn("primary", saving || !name.trim() || !startDate || dupes.length > 0)}>
            {saving ? "Saving…" : tour ? "Save changes" : "Create tournament"}
          </button>
          {msg && <span style={{ fontSize: 12, color: msg.ok ? T.green : T.red }}>{msg.text}</span>}
          {tour && <button onClick={remove} style={{ ...btn("danger"), marginLeft: "auto" }}>Delete tournament</button>}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Draw ───────────────────────── */
function RoundGrid({ title, tables, participants, selected, onPick, roundKey }) {
  const known = new Set(participants.map(n => n.toLowerCase()));
  const seated = new Set(tables.flat().map(n => n.toLowerCase()));
  const notSeated = participants.filter(n => !seated.has(n.toLowerCase()));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {tables.map((tbl, ti) => (
          <div key={ti} style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, padding: "5px 8px", background: T.surfaceAlt }}>
              Table {ti + 1} · {tbl.length}p
            </div>
            {tbl.map((n, pi) => {
              const isSel = selected && selected.round === roundKey && selected.table === ti && selected.idx === pi;
              return (
                <button key={pi} onClick={() => onPick(roundKey, ti, pi)} title="Click two players in this round to swap them"
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "5px 8px", border: "none",
                    borderTop: pi ? `1px solid ${T.borderLight}` : "none", cursor: "pointer", fontSize: 13,
                    background: isSel ? T.accentLight : "transparent",
                    color: known.has(n.toLowerCase()) ? T.text : T.red, fontWeight: isSel ? 700 : 400,
                  }}>{n}</button>
              );
            })}
          </div>
        ))}
      </div>
      {notSeated.length > 0 && (
        <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>Not seated: {notSeated.join(", ")}</div>
      )}
    </div>
  );
}

function DrawTab({ tour, onUpdated }) {
  const participants = useMemo(() => (tour.players || []).map(labelOf).filter(Boolean), [tour]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);       // local copy of {rounds, final} while swapping
  const [selected, setSelected] = useState(null);
  useEffect(() => { setEdit(null); setSelected(null); }, [tour.draw]);

  const draw = tour.draw;
  const view = edit || (draw ? { rounds: draw.rounds, final: draw.final } : null);
  const sizes = tableSizes(participants.length, tour.tableFill, tour.numTables || 0);

  const run = async (fn) => {
    setBusy(true); setError(null);
    try { onUpdated(await fn()); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const doDraw = () => {
    if (draw && !window.confirm("Draw all games again? The current table draw will be replaced.")) return;
    run(() => api(`/api/tournaments/${tour.id}/draw`, { method: "POST", body: { numGames: tour.numGames || 5, numTables: tour.numTables || null, tableFill: tour.tableFill } }));
  };
  const seatFinal = () => {
    if (draw?.final && !window.confirm("Seat the final again from the current standings?")) return;
    run(() => api(`/api/tournaments/${tour.id}/seat-final`, { method: "POST" }));
  };
  const clearDraw = () => {
    if (!window.confirm("Remove the table draw? Registered scores are kept.")) return;
    run(() => api(`/api/tournaments/${tour.id}/draw`, { method: "DELETE" }));
  };

  const pick = (roundKey, table, idx) => {
    if (!selected || selected.round !== roundKey) { setSelected({ round: roundKey, table, idx }); return; }
    if (selected.table === table && selected.idx === idx) { setSelected(null); return; }
    const copy = JSON.parse(JSON.stringify(view));
    const rnd = roundKey === "final" ? copy.final : copy.rounds[roundKey];
    const a = rnd[selected.table][selected.idx];
    rnd[selected.table][selected.idx] = rnd[table][idx];
    rnd[table][idx] = a;
    setEdit(copy); setSelected(null);
  };
  const saveEdit = () => run(() => api(`/api/tournaments/${tour.id}/draw`, { method: "PUT", body: edit }));

  const st = draw?.stats;
  return (
    <div>
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", fontSize: 13, color: T.textSecondary, lineHeight: 1.6 }}>
          <b style={{ color: T.text }}>{participants.length} players</b> · {tour.numGames || "?"} games{tour.hasFinal ? " + final" : ""}
          {" · "}{sizes.length} tables ({describeSizes(sizes)})
          {st && (
            <div style={{ fontSize: 12 }}>
              Each player meets <b>{st.minOpponents === st.maxOpponents ? st.minOpponents : `${st.minOpponents}–${st.maxOpponents}`}</b> different opponents ·{" "}
              {st.pairsMet} of {st.pairsPossible} possible pairs meet ·{" "}
              <span style={{ color: st.repeatMeetings ? T.accent : T.green, fontWeight: 600 }}>
                {st.repeatMeetings ? `${st.repeatMeetings} repeat meeting${st.repeatMeetings > 1 ? "s" : ""}` : "no repeat meetings"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={doDraw} disabled={busy || participants.length < 3} style={btn("primary", busy || participants.length < 3)}>
            {busy ? "Working…" : draw ? "🎲 Draw again" : "🎲 Draw tables"}
          </button>
          {tour.hasFinal && draw && (
            <button onClick={seatFinal} disabled={busy} style={btn("secondary", busy)}>🏆 {draw.final ? "Re-seat final" : "Seat final by standings"}</button>
          )}
          {draw && <button onClick={clearDraw} disabled={busy} style={btn("danger", busy)}>Remove draw</button>}
        </div>
      </div>
      {error && <div style={{ ...card, color: T.red, background: T.redBg }}>{error}</div>}
      {(draw?.warnings || []).map((w, i) => <div key={i} style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{w}</div>)}
      {participants.length < 3 && <div style={{ color: T.textMuted, fontSize: 13 }}>Add at least 3 participants under Setup first.</div>}

      {edit && (
        <div style={{ ...card, background: T.accentBg, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.accent, flex: 1 }}>You have unsaved changes to the draw.</span>
          <button onClick={saveEdit} disabled={busy} style={btn("primary", busy)}>Save draw</button>
          <button onClick={() => { setEdit(null); setSelected(null); }} style={btn("secondary")}>Discard</button>
        </div>
      )}
      {view && (
        <>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
            Tip: click a player, then another player in the same game, to swap their seats. Names in red are not on the participant list.
          </div>
          {view.rounds.map((rnd, ri) => (
            <RoundGrid key={ri} title={`Game ${ri + 1}`} tables={rnd} participants={participants}
              selected={selected} onPick={pick} roundKey={ri} />
          ))}
          {view.final && (
            <RoundGrid title={`Final (seated by standings${draw?.finalMissingScores ? ` — ${draw.finalMissingScores} score(s) were missing` : ""})`}
              tables={view.final} participants={participants} selected={selected} onPick={pick} roundKey="final" />
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Live sheet ───────────────────────── */
function ScoreCell({ seat, onCommit }) {
  const [val, setVal] = useState(seat.score ?? "");
  const [state, setState] = useState(null); // "saving" | "saved" | "error"
  useEffect(() => { setVal(seat.score ?? ""); }, [seat.score]);
  const commit = async () => {
    const v = String(val).trim();
    if (v === String(seat.score ?? "")) return;
    if (v !== "" && !/^-?\d+$/.test(v)) { setState("error"); return; }
    setState("saving");
    try { await onCommit(v === "" ? null : parseInt(v, 10)); setState("saved"); setTimeout(() => setState(null), 1200); }
    catch (e) { setState("error"); alert(e.message); setVal(seat.score ?? ""); }
  };
  return (
    <input value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setVal(seat.score ?? ""); e.currentTarget.blur(); } }}
      inputMode="numeric" placeholder="–"
      style={{
        width: 54, padding: "4px 6px", textAlign: "right", fontSize: 13, fontWeight: 600,
        border: `1px solid ${state === "error" ? T.red : state === "saved" ? T.green : seat.score == null ? T.accent + "88" : T.border}`,
        background: seat.score == null ? T.accentBg : state === "saved" ? T.greenLight : T.surface, outline: "none",
      }} />
  );
}

function SheetTab({ tour }) {
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const [auto, setAuto] = useState(true);
  const [updated, setUpdated] = useState(null);
  const [open, setOpen] = useState({});
  const [standingsIdx, setStandingsIdx] = useState(null);

  const load = useCallback(() => {
    api(`/api/tournaments/${tour.id}/sheet`).then(d => { setSheet(d); setError(null); setUpdated(new Date()); }).catch(e => setError(e.message));
  }, [tour.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [auto, load]);

  const commit = async (round, table, seat, value) => {
    if (seat.scoreId && value === null) {
      if (!window.confirm(`Delete ${seat.name}'s score in ${round.label}?`)) return;
      await api(`/api/scores/${seat.scoreId}`, { method: "DELETE", body: { confirmName: "" } });
    } else if (seat.scoreId) {
      await api(`/api/scores/${seat.scoreId}`, { method: "PUT", body: { total: value } });
    } else if (value !== null) {
      await api("/api/scores", { method: "POST", body: {
        name: seat.name, tournament: tour.name, tournamentId: tour.id,
        gameNumber: String(round.game), tableNumber: String(table.table), values: {}, points: {}, total: value,
      } });
    }
    load();
  };

  const download = async () => {
    try {
      const res = await fetch(`/api/tournaments/${tour.id}/export.xlsx`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not create Excel file");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = `${tour.name}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { alert(e.message); }
  };

  if (error) return <div style={{ ...card, color: T.red }}>{error}</div>;
  if (!sheet) return <div style={{ padding: 30, textAlign: "center", color: T.textMuted }}>Loading sheet…</div>;

  const played = sheet.rounds.filter(r => r.hasScores);
  const sIdx = standingsIdx ?? (played.length ? sheet.rounds.indexOf(played[played.length - 1]) : -1);
  const standings = sIdx >= 0 ? sheet.rounds[sIdx].standings : [];
  const latestKey = played.length ? played[played.length - 1].label : sheet.rounds[0]?.label;
  const missingByRound = {};
  sheet.missing.forEach(m => { (missingByRound[m.label] ||= []).push(m); });
  const fmt = (v, d = 1) => (v == null ? "" : Number.isInteger(v) ? v : v.toFixed(d));

  return (
    <div>
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>
          {updated ? `Updated ${updated.toLocaleTimeString()}` : ""} · scores you type are saved when you leave the cell (Enter)
        </span>
        <label style={{ fontSize: 12, color: T.textSecondary, display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto-refresh
        </label>
        <button onClick={load} style={btn("secondary")}>↻ Refresh</button>
        <button onClick={download} style={{ ...btn("secondary"), color: T.green, borderColor: T.green }}>⬇ Excel</button>
      </div>

      {sheet.missing.length > 0 && (
        <div style={{ ...card, background: T.accentBg, borderColor: T.accentLight }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 4 }}>Waiting for {sheet.missing.length} score{sheet.missing.length > 1 ? "s" : ""}</div>
          {Object.entries(missingByRound).map(([lbl, ms]) => (
            <div key={lbl} style={{ fontSize: 12, color: T.textSecondary }}>
              <b>{lbl}:</b> {ms.map(m => `${m.name} (T${m.table})`).join(", ")}
            </div>
          ))}
        </div>
      )}
      {sheet.notes.map((n, i) => <div key={i} style={{ fontSize: 12, color: T.textMuted, marginBottom: 6 }}>{n}</div>)}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, alignItems: "start" }}>
        {/* Rounds */}
        <div>
          {sheet.rounds.length === 0 && <div style={{ color: T.textMuted, fontSize: 13 }}>No draw and no scores yet.</div>}
          {sheet.rounds.map(r => {
            const isOpen = open[r.label] ?? (r.label === latestKey);
            const reported = r.tables.reduce((a, t) => a + t.seats.filter(s => s.score != null).length, 0);
            const total = r.tables.reduce((a, t) => a + t.seats.length, 0);
            return (
              <div key={r.label} style={{ ...card, padding: 0 }}>
                <button onClick={() => setOpen(o => ({ ...o, [r.label]: !isOpen }))} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                  border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>{r.isFinal ? "🏆 " : ""}{r.label}</span>
                  <span style={{ fontSize: 11, color: r.complete ? T.green : T.textMuted, fontWeight: 600 }}>
                    {r.complete ? "✓ complete" : `${reported}/${total} reported`}
                  </span>
                  <span style={{ color: T.textMuted }}>{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {r.tables.map(t => (
                      <div key={t.table} style={{ marginBottom: 10, border: `1px solid ${T.borderLight}` }}>
                        <div style={{ display: "flex", fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px", background: T.surfaceAlt }}>
                          <span style={{ flex: 1 }}>Table {t.table}{t.complete ? "" : " · waiting"}</span>
                          <span style={{ width: 60, textAlign: "right" }}>Score</span>
                          <span style={{ width: 46, textAlign: "right" }}>RelSc</span>
                          <span style={{ width: 30, textAlign: "right" }}>Rk</span>
                          <span style={{ width: 40, textAlign: "right" }}>Pts</span>
                        </div>
                        {t.seats.map(s => (
                          <div key={s.name} style={{ display: "flex", alignItems: "center", padding: "3px 8px", fontSize: 13, borderTop: `1px solid ${T.borderLight}` }}>
                            <span style={{ flex: 1, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                            <span style={{ width: 60, textAlign: "right" }}><ScoreCell seat={s} onCommit={v => commit(r, t, s, v)} /></span>
                            <span style={{ width: 46, textAlign: "right", color: (s.relSc || 0) >= 0 ? T.green : T.red }}>{fmt(s.relSc)}</span>
                            <span style={{ width: 30, textAlign: "right", color: T.textSecondary }} title={s.tie ? "Tie at this table" : ""}>{s.tabRank ?? ""}{s.tie ? "=" : ""}</span>
                            <span style={{ width: 40, textAlign: "right", fontWeight: 700, color: T.accent }}>{fmt(s.turnP, 2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {r.notSeated.length > 0 && <div style={{ fontSize: 12, color: T.textMuted }}>Not playing: {r.notSeated.join(", ")}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Standings */}
        <div style={{ ...card, position: "sticky", top: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>Standings</span>
            <select value={sIdx} onChange={e => setStandingsIdx(parseInt(e.target.value))} style={{ ...input, width: "auto", padding: "4px 8px", fontSize: 12 }}>
              {sheet.rounds.map((r, i) => r.hasScores && <option key={r.label} value={i}>after {r.label}</option>)}
            </select>
          </div>
          {standings.length === 0 ? <div style={{ fontSize: 12, color: T.textMuted }}>No scores yet.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <th style={{ textAlign: "left", padding: "4px 2px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "4px 2px" }}>Name</th>
                  <th style={{ textAlign: "right", padding: "4px 2px" }}>TurnP</th>
                  <th style={{ textAlign: "right", padding: "4px 2px" }}>RelSc</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => {
                  const move = s.prevRank ? s.prevRank - s.rank : 0;
                  return (
                    <tr key={s.name} style={{ borderTop: `1px solid ${T.borderLight}` }}>
                      <td style={{ padding: "4px 2px", fontWeight: 700, color: s.rank <= 3 ? T.accent : T.textSecondary, whiteSpace: "nowrap" }}>
                        {s.rank}
                        {move !== 0 && <span style={{ fontSize: 9, marginLeft: 3, color: move > 0 ? T.green : T.red }}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>}
                      </td>
                      <td style={{ padding: "4px 2px", color: T.text }}>{s.name}</td>
                      <td style={{ padding: "4px 2px", textAlign: "right", fontWeight: 700 }}>{fmt(s.turnP, 2)}</td>
                      <td style={{ padding: "4px 2px", textAlign: "right", color: s.relSc >= 0 ? T.green : T.red }}>{fmt(s.relSc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 8, lineHeight: 1.4 }}>
            Points per table 10/6/3/1{tour.hasFinal ? ` (×${tour.finalWeight} in the final)` : ""}. Ties broken by RelSc (score minus table average).
            {tour.hasFinal ? " In the final, placings are decided table by table." : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function TournamentAdminPage({ initialTab = "setup" }) {
  const { user } = useAuth();
  const isTD = ["admin", "tournament-admin"].includes(user?.username?.toLowerCase());
  const [list, setList] = useState(null);
  const [selId, setSelId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState(initialTab);

  const loadList = useCallback(async (selectId) => {
    const data = await api("/api/tournaments").catch(() => []);
    setList(data);
    if (selectId) setSelId(selectId);
    else setSelId(prev => prev && data.some(t => t.id === prev) ? prev : (data.find(t => t.isActive) || data[0])?.id || null);
  }, []);
  useEffect(() => { if (isTD) loadList(); }, [isTD, loadList]);

  if (!isTD) {
    return <div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>Sign in as <b>tournament-admin</b> to manage tournaments.</div>;
  }

  const tour = creating ? null : list?.find(t => t.id === selId) || null;
  const replaceTour = (t) => setList(prev => prev.map(x => (x.id === t.id ? t : x)));
  const sorted = (list || []).slice().sort((a, b) => (b.isActive - a.isActive) || (b.startDate || "").localeCompare(a.startDate || ""));

  return (
    <div style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", background: T.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 16px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: T.text, marginRight: "auto" }}>🎲 Tournament admin</div>
          {list && list.length > 0 && !creating && (
            <select value={selId || ""} onChange={e => { setSelId(e.target.value); setTab("setup"); }} style={{ ...input, width: "auto", minWidth: 200 }}>
              {sorted.map(t => <option key={t.id} value={t.id}>{t.isActive ? "● " : ""}{t.name} ({t.startDate})</option>)}
            </select>
          )}
          {creating
            ? <button onClick={() => setCreating(false)} style={btn("secondary")}>Cancel</button>
            : <button onClick={() => { setCreating(true); setTab("setup"); }} style={btn("primary")}>+ New tournament</button>}
        </div>

        {!list ? <div style={{ color: T.textMuted }}>Loading…</div> : creating || !tour ? (
          creating || list.length === 0 ? (
            <SetupTab key="new" tour={null} onSaved={async (id) => { setCreating(false); await loadList(id); setTab("draw"); }} onDeleted={() => {}} />
          ) : <div style={{ color: T.textMuted }}>Select a tournament.</div>
        ) : (
          <>
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 14 }}>
              {[["setup", "1 · Setup"], ["draw", "2 · Table draw"], ["sheet", "3 · Live sheet"]].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} style={{
                  padding: "8px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
                  fontWeight: tab === k ? 700 : 500, color: tab === k ? T.accent : T.textSecondary,
                  borderBottom: `2px solid ${tab === k ? T.accent : "transparent"}`, marginBottom: -1,
                }}>{l}</button>
              ))}
            </div>
            {tab === "setup" && <SetupTab key={tour.id + (tour.draw?.createdAt || "")} tour={tour} onSaved={(id) => loadList(id)} onDeleted={() => loadList(null)} />}
            {tab === "draw" && <DrawTab tour={tour} onUpdated={replaceTour} />}
            {tab === "sheet" && <SheetTab key={tour.id} tour={tour} />}
          </>
        )}
      </div>
    </div>
  );
}
