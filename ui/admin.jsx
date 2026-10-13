import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./auth.jsx";

const T = {
  bg: "#faf9f7", surface: "#ffffff", surfaceAlt: "#f5f3f0",
  border: "#e8e4df", borderLight: "#f0ece7",
  text: "#1a1a1a", textSecondary: "#6b6560", textMuted: "#9e9790",
  accent: "#b45309", accentLight: "#fef3c7", accentBg: "#fffbeb",
  blue: "#2563eb", green: "#059669", red: "#dc2626",
};

const MODE_LABELS = {
  home: "🏠 Home (mobile)", explorer: "🗺️ Card Explorer", drafter: "🃏 Drafter", hands: "🤝 Community Hands",
  score: "📋 Score Sheet", wiki: "📖 Card Wiki (list)", "wiki-card": "📖 Wiki card pages", live: "🎯 Live Draft",
  tournament: "🏆 Tournaments", profile: "👤 My Agricola", admin: "🛠️ Admin", other: "Other",
};

const card = { background: T.surface, borderRadius: 10, border: `1px solid ${T.borderLight}`, padding: "12px 16px", marginBottom: 16 };
const sectionLabel = { fontSize: 11, fontWeight: 700, color: T.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 };

const fmtDate = (iso) => (iso ? iso.slice(0, 10) : "—");
const shortDay = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()}.${d.getMonth() + 1}`;
};

function BarList({ rows, labelKey, valueKey, color = T.accent, labelFn }) {
  const max = Math.max(1, ...rows.map(r => r[valueKey]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <div style={{ width: 150, flexShrink: 0, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {labelFn ? labelFn(r) : r[labelKey]}
          </div>
          <div style={{ flex: 1, background: T.surfaceAlt, height: 14 }}>
            <div style={{ width: `${(r[valueKey] / max) * 100}%`, height: "100%", background: color, minWidth: r[valueKey] ? 2 : 0 }} />
          </div>
          <div style={{ width: 40, textAlign: "right", fontWeight: 600, color: T.textSecondary }}>{r[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ daily, metric }) {
  const max = Math.max(1, ...daily.map(d => d[metric]));
  const labelEvery = daily.length > 45 ? 14 : daily.length > 14 ? 7 : 1;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: daily.length > 60 ? 1 : 2, height: 140 }}>
        {daily.map(d => (
          <div key={d.day} title={`${d.day}: ${d.visitors} visitors · ${d.visits} visits · ${d.views} page views`}
            style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{
              height: `${(d[metric] / max) * 100}%`, minHeight: d[metric] ? 2 : 0,
              background: d.day === daily[daily.length - 1].day ? T.accent : T.accent + "99",
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: daily.length > 60 ? 1 : 2, marginTop: 4 }}>
        {daily.map((d, i) => (
          <div key={d.day} style={{ flex: 1, fontSize: 9, color: T.textMuted, textAlign: "center", whiteSpace: "nowrap", overflow: "visible" }}>
            {(daily.length - 1 - i) % labelEvery === 0 ? shortDay(d.day) : ""}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 6, textAlign: "right" }}>max {max} · hover a bar for details</div>
    </div>
  );
}

function TrafficTab() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState("visitors");
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setStats(null);
    fetch(`/api/admin/stats?days=${days}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => (d.error ? setError(d.error) : setStats(d)))
      .catch(() => setError("Could not load statistics"));
  }, [days]);

  if (error) return <div style={{ padding: 24, color: T.red, textAlign: "center" }}>{error}</div>;
  if (!stats) return <div style={{ padding: 40, color: T.textMuted, textAlign: "center" }}>Loading statistics…</div>;

  const tiles = [
    { label: "Today", v: stats.today },
    { label: "Last 7 days", v: stats.last7 },
    { label: "Last 30 days", v: stats.last30 },
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
        {tiles.map(t => (
          <div key={t.label} style={{ ...card, marginBottom: 0, textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: T.accent, marginTop: 2 }}>{t.v.visitors}</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>visitors</div>
            <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 4 }}>{t.v.visits} visits · {t.v.views} views</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ ...sectionLabel, marginBottom: 0 }}>Per day</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            {[["visitors", "Visitors"], ["visits", "Visits"], ["views", "Views"]].map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} style={pill(metric === k)}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[7, 30, 90].map(n => (
              <button key={n} onClick={() => setDays(n)} style={pill(days === n)}>{n}d</button>
            ))}
          </div>
        </div>
        <DailyChart daily={stats.daily} metric={metric} />
      </div>

      <div style={card}>
        <div style={sectionLabel}>Most used sections ({days} days, page views)</div>
        {stats.byMode.length ? (
          <BarList rows={stats.byMode} valueKey="views" labelFn={r => MODE_LABELS[r.mode] || r.mode} />
        ) : <Empty />}
      </div>

      <div style={card}>
        <div style={sectionLabel}>Most viewed wiki cards</div>
        {stats.topCards.length ? (
          <BarList rows={stats.topCards} valueKey="views" color={T.blue}
            labelFn={r => r.slug ? <a href={`/wiki/${r.slug}`} target="_blank" rel="noopener" style={{ color: T.text }}>{r.name}</a> : r.name} />
        ) : <Empty />}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={sectionLabel}>Devices (visitors)</div>
          {stats.devices.length ? <BarList rows={stats.devices} labelKey="device" valueKey="visitors" color={T.green} /> : <Empty />}
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={sectionLabel}>Came from (other sites)</div>
          {stats.referrers.length ? <BarList rows={stats.referrers} labelKey="referrer" valueKey="visits" color={T.green} /> : <Empty text="No external referrers yet" />}
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 16, lineHeight: 1.5 }}>
        <b>Visitors</b> = unique devices per day (anonymous, no cookies; summed across days, so one person visiting on 3 days counts 3 times).{" "}
        <b>Visits</b> = times the app was opened. <b>Views</b> = sections and wiki cards opened. Bots and your own admin visits are not counted.
      </div>
    </>
  );
}

function UsersTab() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [reset, setReset] = useState(null);   // { username, password }
  const [copied, setCopied] = useState(false);

  const resetPassword = async (username) => {
    if (!window.confirm(`Reset the password for "${username}"?\n\nThey will be signed out everywhere and must use the temporary password you get next.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, { method: "POST", credentials: "include" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not reset password");
      setReset({ username: d.username, password: d.password }); setCopied(false);
    } catch (e) { alert(e.message); }
  };

  useEffect(() => {
    fetch("/api/admin/users", { credentials: "include" })
      .then(r => r.json())
      .then(d => (Array.isArray(d) ? setUsers(d) : setError(d.error || "Could not load users")))
      .catch(() => setError("Could not load users"));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users || []).filter(u => !s || u.username.toLowerCase().includes(s) || (u.displayName || "").toLowerCase().includes(s));
  }, [users, q]);

  if (error) return <div style={{ padding: 24, color: T.red, textAlign: "center" }}>{error}</div>;
  if (!users) return <div style={{ padding: 40, color: T.textMuted, textAlign: "center" }}>Loading users…</div>;

  const th = { padding: "8px 6px", textAlign: "left", fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 };
  const td = { padding: "8px 6px", fontSize: 13, color: T.text, borderTop: `1px solid ${T.borderLight}` };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ ...sectionLabel, marginBottom: 0 }}>{users.length} registered users</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
          style={{ marginLeft: "auto", padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, outline: "none", width: 160 }} />
      </div>
      {reset && (
        <div style={{ background: T.accentBg, border: `1px solid ${T.accent}`, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>
            Temporary password for <b>{reset.username}</b> — send it to them. They'll be asked to choose their own password when they sign in.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, background: T.surface, padding: "4px 10px", border: `1px solid ${T.border}` }}>{reset.password}</code>
            <button onClick={async () => {
              try { await navigator.clipboard.writeText(`Username: ${reset.username}\nTemporary password: ${reset.password}`); setCopied(true); }
              catch { window.prompt("Copy:", reset.password); }
            }} style={{ padding: "5px 10px", border: `1px solid ${T.border}`, background: T.surface, fontSize: 12, cursor: "pointer" }}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
            <button onClick={() => setReset(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.textMuted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Done</button>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>The password is shown only once.</div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Username</th>
              <th style={th}>Display name</th>
              <th style={th}>Registered</th>
              <th style={th}>Last sign-in</th>
              <th style={{ ...th, textAlign: "right" }}>Scores</th>
              <th style={{ ...th, textAlign: "right" }}>Drafts</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.username}>
                <td style={{ ...td, fontWeight: 600 }}>{u.username}</td>
                <td style={{ ...td, color: T.textSecondary }}>{u.displayName !== u.username ? u.displayName : ""}</td>
                <td style={{ ...td, color: T.textSecondary, whiteSpace: "nowrap" }}>{fmtDate(u.createdAt)}</td>
                <td style={{ ...td, color: T.textSecondary, whiteSpace: "nowrap" }}>{fmtDate(u.lastLogin)}</td>
                <td style={{ ...td, textAlign: "right" }}>{u.scores}</td>
                <td style={{ ...td, textAlign: "right" }}>{u.drafts}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  {!["admin", "tournament-admin"].includes(u.username.toLowerCase()) && (
                    <button onClick={() => resetPassword(u.username)} style={{
                      padding: "3px 8px", border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary,
                      fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                    }}>🔑 Reset password</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pill = (active) => ({
  padding: "4px 10px", border: `1px solid ${active ? T.accent : T.border}`, borderRadius: 0,
  background: active ? T.accentBg : T.surface, color: active ? T.accent : T.textSecondary,
  fontSize: 11, fontWeight: 600, cursor: "pointer",
});

const Empty = ({ text = "No data yet" }) => <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>{text}</div>;

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("traffic");

  if (!user || user.username.toLowerCase() !== "admin") {
    return <div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>Admin access only.</div>;
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", background: T.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 48px" }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: T.text, marginBottom: 14 }}>🛠️ Admin</div>
        <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 16 }}>
          {[["traffic", "Traffic"], ["users", "Users"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tab === k ? 700 : 500,
              color: tab === k ? T.accent : T.textSecondary,
              borderBottom: `2px solid ${tab === k ? T.accent : "transparent"}`, marginBottom: -1,
            }}>{l}</button>
          ))}
        </div>
        {tab === "traffic" ? <TrafficTab /> : <UsersTab />}
      </div>
    </div>
  );
}
