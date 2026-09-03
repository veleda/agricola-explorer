import { useState, useEffect, useCallback, createContext, useContext } from "react";

const API_BASE = "";

// ── Auth Context ────────────────────────────────────────────────────────────
const AuthContext = createContext({ user: null, loading: true, refresh: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      const data = await res.json();
      setUser(data.user || null);
    } catch (e) {
      console.error("Auth check failed:", e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Theme (matches scoresheet) ──────────────────────────────────────────────
const T = {
  bg: "#faf9f7", surface: "#ffffff", surfaceAlt: "#f5f3f0",
  border: "#e8e4df", borderLight: "#f0ece7",
  text: "#1a1a1a", textSecondary: "#6b6560", textMuted: "#9e9790",
  accent: "#b45309", accentLight: "#fef3c7", accentBg: "#fffbeb",
  blue: "#2563eb", green: "#059669", greenLight: "#ecfdf5",
  red: "#dc2626", purple: "#7c3aed",
};

// ── Sign In Modal ───────────────────────────────────────────────────────────
export function SignInModal({ onClose }) {
  const { setUser } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSending(true);
    setError("");
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { username: username.trim(), password, displayName: displayName.trim() || username.trim() }
        : { username: username.trim(), password };
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setUser(data.user);
        onClose();
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (e) {
      setError("Network error — is the server running?");
    } finally {
      setSending(false);
    }
  };

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 9999, padding: 20,
  };

  const modalStyle = {
    background: T.surface, borderRadius: 16, padding: "32px 28px",
    maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
    position: "relative",
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: `1.5px solid ${T.border}`, background: T.bg,
    fontSize: 14, color: T.text, outline: "none", boxSizing: "border-box",
    marginBottom: 12,
  };

  const btnStyle = {
    width: "100%", padding: "11px 20px", borderRadius: 10, border: "none",
    background: T.accent, color: "#fff", fontSize: 14, fontWeight: 600,
    cursor: sending ? "wait" : "pointer", opacity: sending ? 0.7 : 1,
  };

  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary,
    marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 16, background: "none",
          border: "none", fontSize: 20, color: T.textMuted, cursor: "pointer",
        }}>×</button>

        <form onSubmit={handleSubmit}>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
            {mode === "register" ? "Create account" : "Sign in"}
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>
            {mode === "register"
              ? "If you've saved scores or drafts before, use the same username to link them to your account."
              : "Sign in with your username and password."}
          </div>

          <label style={labelStyle}>
            Username <span style={{ color: T.red }}>*</span>
          </label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="e.g. Magnus" autoFocus style={inputStyle}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />

          <label style={labelStyle}>
            Password <span style={{ color: T.red }}>*</span>
          </label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={mode === "register" ? "Choose a password" : "Your password"} style={inputStyle}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />

          {mode === "register" && (
            <>
              <label style={labelStyle}>
                Display name <span style={{ fontSize: 10, fontWeight: 400, color: T.textMuted }}>(optional)</span>
              </label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder={username || "Your name"} style={inputStyle}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border}
              />
            </>
          )}

          {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{error}</div>}

          <button type="submit" disabled={sending || !username.trim() || !password} style={btnStyle}>
            {sending ? "..." : mode === "register" ? "Create account" : "Sign in"}
          </button>

          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: T.textMuted }}>
            {mode === "login" ? (
              <>Don't have an account?{" "}
                <span onClick={() => { setMode("register"); setError(""); }}
                  style={{ color: T.accent, cursor: "pointer", fontWeight: 600 }}>Sign up</span>
              </>
            ) : (
              <>Already have an account?{" "}
                <span onClick={() => { setMode("login"); setError(""); }}
                  style={{ color: T.accent, cursor: "pointer", fontWeight: 600 }}>Sign in</span>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
