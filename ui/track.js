// Anonymous, cookie-free usage tracking (see /api/track in the backend).
let lastKey = null;

export function track({ mode, cardId = null, entry = false }) {
  const key = `${mode}|${cardId || ""}`;
  if (key === lastKey && !entry) return; // ignore duplicate consecutive events
  lastKey = key;
  try {
    fetch("/api/track", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, cardId, entry, referrer: entry ? document.referrer || null : null }),
    }).catch(() => {});
  } catch { /* never let tracking break the app */ }
}
