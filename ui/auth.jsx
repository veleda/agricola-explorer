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

  // Check auth on mount
  useEffect(() => { refresh(); }, [refresh]);

  // Handle magic link token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("auth_token");
    if (!token) return;

    // Clean URL immediately
    window.history.replaceState({}, "", window.location.pathname);

    // Try to verify — might need username for new users
    (async () => {
      const res = await fetch(`${API_BASE}/api/auth/verify?token=${token}`, { credentials: "include" });
      const data = await res.json();
      if (data.ok) {
        setUser(data.user);
        setLoading(false);
      } else if (data.needsUsername) {
        // Store token for the sign-in modal to complete registration
        window.__agricola_pending_token = token;
        setLoading(false);
      } else {
        console.error("Verify failed:", data.error);
        setLoading(false);
      }
    })();
  }, []);

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
  const [step, setStep] = useState("email"); // email | sent | username
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const pendingToken = window.__agricola_pending_token;

  // If we have a pending token (new user from magic link), go straight to username step
  useEffect(() => {
    if (pendingToken) setStep("username");
  }, [pendingToken]);

  const handleRequestLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.isNew) {
          setStep("username");
        } else {
          setStep("sent");
        }
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (e) {
      setError("Network error — is the server running?");
    } finally {
      setSending(false);
    }
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    setSending(true);
    setError("");
    try {
      const token = pendingToken;
      if (token) {
        // Complete the magic link verification with username
        const res = await fetch(`${API_BASE}/api/auth/verify?token=${token}&username=${encodeURIComponent(username.trim())}&displayName=${encodeURIComponent(displayName.trim() || username.trim())}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          window.__agricola_pending_token = null;
          setUser(data.user);
          onClose();
        } else {
          setError(data.error || "Something went wrong");
        }
      } else {
        // Request link with username for new account
        const res = await fetch(`${API_BASE}/api/auth/request-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), username: username.trim(), displayName: displayName.trim() || username.trim() }),
        });
        const data = await res.json();
        if (data.ok) {
          setStep("sent");
        } else {
          setError(data.error || "Something went wrong");
        }
      }
    } catch (e) {
      setError("Network error");
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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{
          position: "absolute", top: 12, right: 16, background: "none",
          border: "none", fontSize: 20, color: T.textMuted, cursor: "pointer",
        }}>×</button>

        {step === "email" && (
          <form onSubmit={handleRequestLink}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              Sign in
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>
              We'll send you a magic link — no password needed.
            </div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com" autoFocus style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={sending || !email.trim()} style={btnStyle}>
              {sending ? "Sending..." : "Send magic link"}
            </button>
            {window.location.hostname === "localhost" && (
              <button type="button" onClick={async () => {
                setSending(true); setError("");
                try {
                  const res = await fetch(`${API_BASE}/api/auth/dev-login`, {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: email.trim() || "test@localhost", username: email.trim().split("@")[0] || "TestUser" }),
                  });
                  const data = await res.json();
                  if (data.ok) { setUser(data.user); onClose(); }
                  else setError(data.error || "Dev login failed");
                } catch (e) { setError("Network error"); }
                setSending(false);
              }} style={{ ...btnStyle, marginTop: 8, background: T.surfaceAlt, color: T.textSecondary, border: `1px solid ${T.border}` }}>
                Dev login (skip email)
              </button>
            )}
          </form>
        )}

        {step === "username" && (
          <form onSubmit={handleCompleteRegistration}>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>
              Welcome!
            </div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 20 }}>
              Pick a username. If you've saved scores or drafts before, use the same name to link them to your account.
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Username <span style={{ color: T.red }}>*</span>
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="e.g. Magnus" autoFocus style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Display name <span style={{ fontSize: 10, fontWeight: 400, color: T.textMuted }}>(optional)</span>
            </label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder={username || "Your name"} style={inputStyle}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            {error && <div style={{ fontSize: 12, color: T.red, marginBottom: 8 }}>{error}</div>}
            <button type="submit" disabled={sending || !username.trim()} style={btnStyle}>
              {sending ? "Creating..." : "Create account"}
            </button>
          </form>
        )}

        {step === "sent" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 8 }}>
              Check your email
            </div>
            <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.5 }}>
              We sent a sign-in link to <strong>{email}</strong>. Click it to log in — it expires in 15 minutes.
            </div>
            <button onClick={onClose} style={{ ...btnStyle, marginTop: 20, background: T.surfaceAlt, color: T.textSecondary }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
