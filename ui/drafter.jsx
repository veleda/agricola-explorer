import { useState, useCallback, useEffect, useMemo } from "react";

const API_BASE = "";
const NUM_PLAYERS = 4;    // you + 3 NPCs

// Draft mode configs
const MODES = {
  full:  { maxPicks: 7, packSize: 9, label: "Full Drafter",  desc: "Draft 7 cards from packs of 9" },
  mini:  { maxPicks: 5, packSize: 7, label: "Mini Drafter",  desc: "Draft 5 cards from packs of 7" },
};
// ── Fixed Mini Drafter pools (100 occ + 100 minor from Norway Deck) ─────────
const MINI_OCC_IDS = new Set([
  "05f6fcdc-c5be-4436-8806-ab70dd9c5dbb", "08f3bd93-436d-49e6-984f-f2fea01af351", "0b450c18-806e-49ae-8298-0579f128408d",
  "0b9658fa-ee5a-43a9-b92a-35177de12c55", "0e5c758a-4136-47f8-8459-7edd7bb26548", "0f064a21-25dd-437c-8bff-325bb1a0b41e",
  "17072391-757b-46f6-a8f5-28762d336909", "17a63bdb-77e0-4042-b41d-ca20ac735c89", "17be8534-07ab-49d6-aebe-0c5c79373b05",
  "1b24ae30-6848-4562-8084-00e2e3c25773", "1de09b7e-2b10-4dd9-b569-681298149ae7", "1df56e2b-a7d7-426c-8a6d-c75d62a79558",
  "1e16f539-c91d-40c3-9640-bcda0fba4dca", "1f4c03d8-1792-4b9a-8cba-5abcc8944612", "242bcd22-7a0d-40f2-8a7b-902791b35435",
  "257c7582-07bc-429c-9492-5f326acfd6c0", "27397538-32fe-41dd-9938-7491adffe706", "29a37fdd-2307-40af-b8c5-6a97c8533b0d",
  "29f11346-8178-450f-bd8e-e8a76020c875", "2aba7716-c325-49c1-a83f-ab8b54f26d61", "2b1e785e-08bf-4e53-8efa-ee6dbdb83b02",
  "350a431c-906b-4050-b873-857b7bf3d56c", "398e7def-d405-4ea3-ad94-d9413ac73abb", "3b411bd5-c84a-43d2-ae5d-f238a920a85c",
  "3b50752e-0239-41f3-9ae6-4ef7af0b5b87", "3c5f11f5-05f7-42a8-8324-1947d8c37da9", "405a72eb-1e2c-46ab-89bf-d63a3bf849a2",
  "413c8b48-8ad9-4175-9a09-4b9d19c5a655", "47273ab5-3daf-404d-b391-b460c6c176b3", "47bdb28c-9750-4926-bec0-eebdc1737eb7",
  "483dfc77-27f8-4bbf-9643-750adb988dd3", "50f0c157-3c4a-4556-9d85-254042a7708f", "514897fd-09ea-478f-9df6-5ce2a413ed53",
  "575ca4b7-27ba-4e5a-b955-0a4ce70a043b", "6055faa0-7ff4-4b34-aceb-3c1592146f0c", "619cf393-db80-4c32-bd9d-744984a9dbe6",
  "625f7fff-8672-4fc2-96a3-6c15c0fa879e", "62a5be8c-cf75-493f-8945-61e32fbadf91", "689ecba9-d1ad-4e71-9f1c-0d1a1e5c5b0a",
  "6a37e763-3a3e-49d2-ad88-964b6a6fe4ab", "6e1b6b75-d169-4bd9-8d27-d3ebebe97254", "6e26d576-aee4-488b-810b-976593b5061e",
  "6e7c3bfe-10a3-45cb-aeb9-9bf7eea21062", "6fb10b6f-f3a4-45fe-bb27-be5fbe0ff888", "71c0fcb4-6df9-48a3-aabf-8cd488194883",
  "736cb3d7-692b-43a9-8741-06d1d9d360c5", "75b52169-7a90-43bd-9c22-0ea004063d5d", "8026f141-51f1-4840-af45-19b5fd819ac8",
  "80a3f423-8e1d-41db-873f-f0a8001c870d", "81b57954-548e-485b-a04b-9eb8d6710eaa", "835ce271-dc9f-4d6b-a7b9-2838f061a9e4",
  "854ed0fb-f1ee-4e64-8ba6-38f926afc118", "86f908b2-8338-4f88-b4ea-b713ad5ed2df", "8da73ba7-b605-467b-a411-bc092c5e24b5",
  "8e558d61-c4d1-4bb1-87be-dd36812c9418", "8fa6bd0e-340f-45d7-88d2-e5db309f068f", "93106c77-6565-427b-92e2-4b638f7a4155",
  "9c846bd5-e61d-46be-9166-6077cc6a398d", "9de767af-3ad8-441e-9140-c04cabcbbede", "a2a1cb1e-fe35-405c-816a-e775b234f1c9",
  "aaf0f634-476d-4a3e-ac3a-6f16b4499897", "acc5d14d-0819-42c2-80f8-c074cfc0546c", "b0caeb41-4bc3-4b63-b4f6-a2ded5601aff",
  "b21fe996-2d69-4ca2-b70b-a35ca216bc2b", "b5406897-1f83-40eb-ba35-c56a4b0305fc", "b545ad56-8e69-4fc7-bac4-ec5dbd1c3c17",
  "b94fdcee-842f-4e0b-8ed0-cc728b6737c5", "bb83592c-adf1-4ae3-b2cb-97209f7ddcf9", "c1925690-ce86-4ec5-b5de-9f1897653cc2",
  "c2e6da2d-c907-40fa-bc12-c5b7411937d8", "c637694b-880a-43d7-bb8a-a3df75101818", "c6fd13ed-7cd8-43df-8bd1-531e3addc3ca",
  "c7e7445e-129c-4f3a-a941-a6c755932017", "c8d9044a-1e92-4cab-b589-222f1cd22447", "c983e8f5-9fa9-467f-889c-64aeb9c69478",
  "cca40942-116a-4c6c-b3d1-c1473cadc7b9", "d0828a82-f1df-40d0-b651-72df226f443d", "d3225414-2809-420d-94dd-c32db2332f97",
  "d3cc624f-96ec-405b-b45d-0ceb770ba892", "d5120427-8df6-4587-95d4-cd47347cb1c8", "d791f4ea-231c-4142-9729-61120ea03837",
  "d7b222cf-7047-4297-98d4-9915c063588c", "d92653a9-6b3c-4ed9-a4d7-ce611e681460", "dc1e11c7-c1fd-4d6d-a6fa-026db589c3ff",
  "dccf191f-330a-47a4-86fe-fd6d058e3a38", "e02398e7-419c-48f7-8cee-5e5236a8ef51", "e51f266f-8613-428d-8670-de912ad3ac26",
  "e98ce41e-2fcf-4683-ac81-6377becb3060", "ea088ef3-b060-4ff6-97d7-95ef5dabefd1", "eda9ed1c-489e-4c8b-9e6f-b4906156d4d4",
  "eddc8966-306b-4762-ba8d-0326839da0db", "ef6fd109-c6e4-4fad-8ae7-3a1e7577b03e", "ef719b76-d2a3-4a3e-94e4-fcceac03192e",
  "f2fc13b3-1b3d-4170-93b1-29d590f6d0c8", "f51864d7-151c-40f5-a612-288eb3da8fee", "f5b9f3a5-b4ae-4d23-beb2-1468a5f2cfd5",
  "f8981b45-c12b-45f8-87f6-5ede10fbaba7", "f9845508-7483-4bc9-ab27-2e76616b8120", "fae6eee5-9da7-4953-85e0-f1af7dcea0ef",
  "fb307224-e533-4d2a-99a9-475f3e859a18",
]);
const MINI_MINOR_IDS = new Set([
  "025752c2-58ef-47f4-82ce-902b0c9e8224", "026d4535-17bd-4ab0-844f-41d749c7227c", "0a59989f-26ac-48d2-b868-dfd4defbb247",
  "0c10fd43-8d16-4bd9-82d7-e1f5c2c75d10", "0c316d0b-3b39-41fc-b226-04ccc65262ed", "0df4643a-93be-42d2-b9cd-c6a19f734ce6",
  "0f77e8ce-c9de-4a7f-8cd3-49a836f7b464", "10d51282-800a-4031-a716-98c678514a4b", "1323dd3b-6592-4c85-adcd-432d6210e4c4",
  "16c44d24-779a-45c3-a39e-393dac2530a4", "1817cf7d-a58f-4a91-90c8-a9dfb56cf155", "1832419a-41b6-41f5-adc3-256b43f043f3",
  "18bf69d5-ef44-46e3-aa20-efdbf4df5b6d", "1b586628-34a4-471d-bb34-cf18faf14b70", "1b8d8917-4612-48ad-9ca3-4e6d0bc93966",
  "2224dbf9-6842-4bcb-b594-0142cbd87172", "2ce959e0-0f7e-43da-9026-81681c85e034", "2e8547ed-6f27-46f9-959b-7e4b01bd6a9d",
  "2f98562e-1b7f-4ca4-a4ba-b4de66add9fc", "2ff3c2e8-df79-437e-9546-97902b641ed6", "335c8881-1929-45c6-82a9-119b4c0754da",
  "354e714d-912f-4c32-ad48-75598a511b68", "3c299e42-8f65-4491-a933-4999f578a4f8", "3d63d304-ce48-4685-99f3-46c3739b704d",
  "42325a22-73a8-43b9-970c-ca9bf8ac841d", "45a18e83-3ea9-4033-9feb-fe96c0aeca33", "4bd84242-370b-44b5-a49a-c98e42e606f4",
  "4e804c18-44d3-4fd9-bf09-2d8730071af5", "4f6a536e-a50b-497b-91df-0df7fd9da65e", "514c47a0-28b8-4ae3-8bdb-958b53f2c00c",
  "543cacc4-a5d2-4b50-92b7-fbc5db2bb75e", "5592549c-b173-4f1e-844b-05797a84be76", "571f1f71-8b20-4724-a3c5-6d24171018f1",
  "5aad5316-7914-466d-b9c7-09654b6c72f7", "5eb0ff3b-3d9b-4392-a270-9d91cc9ccae6", "609a3ea0-12ff-46b6-a970-d256dc5b0737",
  "6495dd47-a04d-4907-a574-fc35a05b5124", "681ec145-e1e3-49ea-a95a-83c5c746745c", "6a25088b-6f61-46c0-b25b-01d04eac1ab7",
  "6e69d2a0-98de-4d64-8053-294f49d1914f", "71aad987-2244-4442-9d9d-21ba0d2a9050", "71b6bb97-1785-4a58-ac71-8e9949c5382e",
  "74945e62-d09e-4904-a6c6-3e397ae1f3c0", "7d45fd9f-2b30-44e3-8597-dcb48dd2748d", "7f0e484e-46f2-4b52-98b8-2835914c9e58",
  "8511ef3c-a77e-49bd-8823-9324a16330be", "85a5208e-f82a-4154-90ac-6ed4de5d2a96", "865a1390-ccd6-4cfc-91ba-ed3ef9ef4255",
  "8dcad7db-1f0b-4716-a4f8-6f0dafcaac0d", "94651c6d-ced5-4dc9-87be-f50014d05b4a", "95646a2b-72e0-45b7-be57-3d751ab85aba",
  "9573800b-fa10-43e2-928d-39125d085334", "962e9796-20f6-4bc3-83d5-cb66d2c5ca9e", "97383b75-d2a7-4cb8-90ee-9c5bd9917709",
  "99558846-49b2-4b62-806f-7148ec0256cb", "9ca3684e-5175-40be-abf4-eb54a24fe6ac", "9e28f255-e9b2-49e7-932d-af6aa72003ad",
  "9e4d1f39-5dda-4a1d-b8c1-14a59b8673da", "a522721b-8530-4a26-8e57-e6f8e749ca41", "a61b78f3-4edf-488e-a15c-bcaf5eb83da7",
  "a90fefb0-3f92-4ad0-82b8-fdf23946ec21", "ab89a55a-4df2-4ace-b939-5f61edfb9b90", "ae73f197-6075-4a0d-9917-9074e6ee05cc",
  "aeb2768c-3bb3-48e9-b169-2576323bd429", "b25966c0-6e82-4dca-abd4-c82b6cd1bb12", "b716ceb4-de8a-4625-976e-d7117de0e8c0",
  "b8f7d224-87c6-45f7-bf5d-63d5551e2811", "b905021f-8db0-4315-b074-32d8f6e90dd8", "b91627fe-25e3-4153-b5ff-99657f1d856a",
  "b9a47513-79f7-4795-b799-69222e3e75bd", "bab454fd-23c8-4f95-9dfe-dec6fa38035f", "bc27712a-0d95-4823-9c2d-2913e14519b5",
  "bda89f8f-300b-47df-afb3-ea38b0714e72", "c3c5e323-f7de-4c9e-8ba1-eb2f0389ab75", "c429785f-937b-454d-a82c-91857426b1e1",
  "c8a40628-47fc-4ac9-ba8b-e269cb880359", "cce08aae-08c7-4ebf-84ed-20a0bac11f4d", "ceb69750-8b07-4445-9cab-9fb368f57afd",
  "d2018cae-8033-436c-a74e-d10c5e455b3a", "d2e43128-1d14-4aae-a421-de9582274439", "d583fcc3-cff9-4266-b763-2eb22b1ab183",
  "d9d66b0a-d9ad-4859-a2f5-4fe1cd95165f", "db2b3373-e4e7-4002-bb85-fc0289c19ae3", "dfe4694f-5828-453b-9c6b-bbb874f7eb84",
  "e120b18a-2051-4d7a-9f20-268be009d6e2", "e1f1d230-db70-4a72-bfc3-17b2041d94ae", "e31f9b4f-9e91-4800-a404-fe49deb9ae18",
  "e718536c-02c2-4780-b0b2-a95f28e22ebf", "ec94004d-f1ad-47a9-ae43-482e20a3ab74", "ef9ae0a4-f07a-4318-80b9-e2bc2db0d524",
  "f21c8107-4de2-49be-bbf0-0b8cec1f5768", "f2a6d561-e441-4c70-8fdf-9fca8e830d88", "f2eb80cb-dda1-4ae1-98b6-b24f1d38737d",
  "f66cfe5f-14b5-4bf4-a20b-7e981c28577d", "f7ab59dd-ca95-4750-9767-80b5062a5ab1", "f9bced1f-6ba2-4bcb-a50e-8be66b1fd75e",
  "fa6365e0-3b52-4904-a52c-1210838327ae", "fb82cfd4-7937-440e-b319-7b864d8600a1", "fcc295f7-b49d-4d96-9575-0b74ee8b781e",
  "fef19107-a254-4bb5-a9e1-0c0d1a8174b9",
]);

// ── Light theme palette ─────────────────────────────────────────────────────
const T = {
  bg: "#faf9f7",          // warm off-white
  surface: "#ffffff",
  surfaceAlt: "#f5f3f0",
  border: "#e8e4df",
  borderLight: "#f0ece7",
  text: "#1a1a1a",
  textSecondary: "#6b6560",
  textMuted: "#9e9790",
  accent: "#b45309",       // warm amber-brown
  accentLight: "#fef3c7",
  accentBg: "#fffbeb",
  blue: "#2563eb",
  purple: "#7c3aed",
  green: "#059669",
  greenLight: "#ecfdf5",
  red: "#dc2626",
};

// ── NPC strategy ────────────────────────────────────────────────────────────
function npcPick(cards, strategyIndex) {
  if (cards.length === 0) return null;
  if (strategyIndex === 0) {
    return cards[Math.floor(Math.random() * cards.length)];
  }
  const sorted = [...cards].sort((a, b) => (b.winRatio || 0) - (a.winRatio || 0));
  const topN = sorted.slice(0, Math.min(3, sorted.length));
  return topN[Math.floor(Math.random() * topN.length)];
}

// ── Fisher-Yates shuffle ────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
      background: T.surfaceAlt, padding: "14px 12px", gap: 6,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
        {card.name}
      </div>
      {card.costLabel && (
        <div style={{ fontSize: 10, color: T.textSecondary }}>
          <span style={{ color: T.textMuted }}>Cost: </span>{card.costLabel}
        </div>
      )}
      {card.prerequisite && (
        <div style={{ fontSize: 10, color: T.accent }}>
          <span style={{ color: T.textMuted }}>Prereq: </span>{card.prerequisite}
        </div>
      )}
      {card.text && (
        <div style={{
          fontSize: 10, color: T.textSecondary, lineHeight: 1.45, fontStyle: "italic",
          borderLeft: `2px solid ${T.border}`, paddingLeft: 6, marginTop: 2,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical",
        }}>
          {card.text}
        </div>
      )}
      {card.gains && card.gains.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {card.gains.slice(0, 4).map(g => (
            <span key={g} style={{
              padding: "1px 6px", borderRadius: 99, background: T.greenLight,
              color: T.green, fontSize: 9,
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
      style={{ width: "100%", display: "block", background: T.surfaceAlt }}
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
        border: hover && !disabled ? `2px solid ${T.accent}` : `2px solid ${T.border}`,
        background: T.surface,
        transition: "all 0.2s",
        transform: hover && !disabled ? "scale(1.03)" : "scale(1)",
        opacity: disabled ? 0.4 : 1,
        maxWidth: 180,
        boxShadow: hover && !disabled ? "0 4px 16px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}>
      <CardImageOrFallback card={card} />
      <div style={{ padding: "6px 8px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.name}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 6, marginTop: 2 }}>
          <span>{card.deck}</span>
          {card.winRatio > 0 && <span style={{ color: T.blue }}>{(card.winRatio * 100).toFixed(0)}%</span>}
          {card.pwr > 0 && <span style={{ color: T.purple }}>PWR {card.pwr.toFixed(1)}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Draft results screen ────────────────────────────────────────────────────
function DraftResults({ picks, allCards, draftType, saveDraftType, username, onSave, onNewDraft, saved, isMini }) {
  const pickCards = picks.map(id => allCards.find(c => c.id === id)).filter(Boolean);
  const avgWin = pickCards.length > 0 ? pickCards.reduce((s, c) => s + (c.winRatio || 0), 0) / pickCards.length : 0;
  const pwrCards = pickCards.filter(c => c.pwr > 0);
  const avgPwr = pwrCards.length > 0 ? pwrCards.reduce((s, c) => s + c.pwr, 0) / pwrCards.length : 0;
  const totalCostItems = pickCards.reduce((s, c) => s + (c.costLabel ? c.costLabel.split(/\s+/).length : 0), 0);
  const baseName = draftType === "Occupation" ? "Occupations" : "Minor Improvements";
  const typeName = isMini ? `Mini ${baseName}` : baseName;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: T.accent, marginBottom: 4 }}>Draft Complete!</div>
        <div style={{ fontSize: 14, color: T.textSecondary }}>
          Your {typeName} hand
          {isMini && <span style={{ marginLeft: 6, fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#fef2f2", color: T.red }}>{"\uD83C\uDDF3\uD83C\uDDF4"} Mini</span>}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", gap: 16, justifyContent: "center", marginBottom: 24,
        flexWrap: "wrap",
      }}>
        {[
          ["Avg Win Rate", `${(avgWin * 100).toFixed(1)}%`, T.blue],
          ["Avg PWR", avgPwr > 0 ? avgPwr.toFixed(2) : "N/A", T.purple],
          ["Total Cost Items", totalCostItems, T.accent],
          ["Cards", pickCards.length, T.green],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            padding: "10px 20px", borderRadius: 10, background: T.surface,
            border: `1px solid ${T.border}`, textAlign: "center", minWidth: 100,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Card images grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {pickCards.map((c, i) => (
          <div key={c.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}`, background: T.surface }}>
            <div style={{ position: "relative" }}>
              <CardImageOrFallback card={c} />
              <div style={{
                position: "absolute", top: 4, left: 4, background: "rgba(255,255,255,0.9)", borderRadius: 99,
                padding: "2px 8px", fontSize: 10, fontWeight: 700, color: T.accent,
              }}>Pick {i + 1}</div>
            </div>
            <div style={{ padding: "6px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{c.name}</div>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                {c.deck} · {(c.winRatio * 100).toFixed(0)}%
                {c.pwr > 0 && <span style={{ color: T.purple, marginLeft: 4 }}>PWR {c.pwr.toFixed(1)}</span>}
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
              background: T.accent, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}>
            Save to Community
          </button>
        ) : (
          <div style={{ padding: "10px 24px", borderRadius: 8, background: T.greenLight, color: T.green, fontSize: 14, fontWeight: 600 }}>
            Saved!
          </div>
        )}
        <button onClick={onNewDraft}
          style={{
            padding: "10px 24px", borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.surface,
            color: T.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
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
    setLoading(true);
    Promise.all([fetchDraftStats(draftType), fetchDrafts(null, draftType)])
      .then(([s, d]) => { setStats(s); setDrafts(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [draftType]);

  const cardMap = useMemo(() => {
    const m = {};
    allCards.forEach(c => { m[c.id] = c; });
    return m;
  }, [allCards]);

  if (loading) return <div style={{ padding: 24, color: T.textMuted, textAlign: "center" }}>Loading community stats...</div>;
  if (!stats || stats.totalDrafts === 0) return <div style={{ padding: 24, color: T.textMuted, textAlign: "center" }}>No community drafts yet. Be the first!</div>;

  const isMini = draftType.startsWith("Mini");
  const baseName = draftType.includes("Occupation") ? "Occupation" : "Minor Improvement";
  const typeName = isMini ? `Mini ${baseName}` : baseName;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>
        Community {typeName} Drafts
        <span style={{ marginLeft: 8, fontSize: 11, color: T.textMuted }}>{stats.totalDrafts} total</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Most Drafted Overall</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {stats.overallTop.slice(0, 8).map(({ cardId, count }) => {
            const c = cardMap[cardId];
            return c ? (
              <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 28, textAlign: "right", color: T.accent, fontWeight: 700 }}>{count}x</div>
                <span style={{ color: T.text }}>{c.name}</span>
                <span style={{ color: T.textMuted, fontSize: 10 }}>{c.deck}</span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {["1", "2", "3"].map(rnd => stats.roundTop[rnd] && (
        <div key={rnd} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Most Popular Pick #{rnd}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {stats.roundTop[rnd].slice(0, 3).map(({ cardId, count }) => {
              const c = cardMap[cardId];
              return c ? (
                <div key={cardId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <div style={{ width: 24, textAlign: "right", color: T.blue, fontWeight: 600 }}>{count}</div>
                  <span style={{ color: T.textSecondary }}>{c.name}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      ))}

      {drafts && drafts.drafts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Recent Hands</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {drafts.drafts.slice(0, 10).map(d => (
              <div key={d.id} style={{
                padding: "6px 10px", borderRadius: 8, background: T.surfaceAlt,
                border: `1px solid ${T.border}`, fontSize: 11,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: T.text }}>{d.username}</span>
                  <span style={{ color: T.textMuted, fontSize: 10 }}>{new Date(d.timestamp).toLocaleDateString()}</span>
                </div>
                <div style={{ color: T.textSecondary, fontSize: 10 }}>
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
export default function Drafter({ allCards, norwayOnly, setNorwayOnly }) {
  const [drafterMode, setDrafterMode] = useState(null); // null = mode picker, "full" | "mini"
  const [phase, setPhase] = useState("setup");
  const [draftType, setDraftType] = useState("Occupation");
  const [username, setUsername] = useState("");
  const [selectedDecks, setSelectedDecks] = useState(null);

  const [packs, setPacks] = useState([[], [], [], []]);
  const [myPicks, setMyPicks] = useState([]);
  const [pickOrder, setPickOrder] = useState([]);
  const [round, setRound] = useState(1);
  const [saved, setSaved] = useState(false);

  const [showCommunity, setShowCommunity] = useState(false);
  const [showDraftHand, setShowDraftHand] = useState(false);

  const isMini = drafterMode === "mini";
  const modeConfig = MODES[drafterMode] || MODES.full;
  const maxPicks = modeConfig.maxPicks;
  const packSize = modeConfig.packSize;

  // For Mini Drafter: use the fixed hardcoded card pools (same 100+100 every time)
  const miniPool = useMemo(() => {
    if (!isMini) return null;
    const occ = allCards.filter(c => MINI_OCC_IDS.has(String(c.id)));
    const minor = allCards.filter(c => MINI_MINOR_IDS.has(String(c.id)));
    return { occ, minor };
  }, [isMini, allCards]);

  const availableDecks = useMemo(() => {
    if (isMini) return []; // no deck selection for mini
    const typeCards = allCards.filter(c =>
      draftType === "Occupation" ? c.type === "Occupation" : c.type === "MinorImprovement"
    );
    const deckSet = new Set(typeCards.map(c => c.deck).filter(Boolean));
    return [...deckSet].sort();
  }, [allCards, draftType, isMini]);

  useEffect(() => {
    if (!isMini) {
      setSelectedDecks(availableDecks.length > 0 ? [...availableDecks] : []);
    }
  }, [availableDecks, isMini]);

  const toggleDeck = useCallback((deck) => {
    setSelectedDecks(prev => {
      if (!prev) return [deck];
      if (prev.includes(deck)) {
        if (prev.length <= 1) return prev;
        return prev.filter(d => d !== deck);
      }
      return [...prev, deck];
    });
  }, []);

  const selectAllDecks = useCallback(() => setSelectedDecks([...availableDecks]), [availableDecks]);
  const selectNoDecksExcept = useCallback((deck) => setSelectedDecks([deck]), []);

  const draftableCards = useMemo(() => {
    if (isMini) {
      return draftType === "Occupation" ? (miniPool?.occ || []) : (miniPool?.minor || []);
    }
    const decks = selectedDecks || availableDecks;
    return allCards.filter(c => {
      if (draftType === "Occupation" ? c.type !== "Occupation" : c.type !== "MinorImprovement") return false;
      return decks.includes(c.deck);
    });
  }, [isMini, miniPool, allCards, draftType, selectedDecks, availableDecks]);

  const canStart = username.trim() && draftableCards.length >= packSize * NUM_PLAYERS && (isMini || (selectedDecks || []).length > 0);

  // The draftType key used for saving/stats (separates mini from full)
  const saveDraftType = isMini
    ? (draftType === "Occupation" ? "MiniOccupation" : "MiniMinorImprovement")
    : draftType;

  const startDraft = useCallback(() => {
    if (!canStart) return;
    const pool = shuffle(draftableCards);
    const newPacks = [];
    for (let p = 0; p < NUM_PLAYERS; p++) {
      newPacks.push(pool.splice(0, packSize));
    }
    setPacks(newPacks);
    setMyPicks([]);
    setPickOrder([]);
    setRound(1);
    setSaved(false);
    setPhase("drafting");
  }, [canStart, draftableCards, packSize]);

  const handlePick = useCallback((card) => {
    const currentPack = packs[0];
    if (!currentPack.find(c => c.id === card.id)) return;
    const newPicks = [...myPicks, card.id];
    const newPickOrder = [...pickOrder, round];
    const newPacks = packs.map((pack) => [...pack]);
    newPacks[0] = newPacks[0].filter(c => c.id !== card.id);
    for (let npc = 1; npc < NUM_PLAYERS; npc++) {
      const pick = npcPick(newPacks[npc], npc - 1);
      if (pick) newPacks[npc] = newPacks[npc].filter(c => c.id !== pick.id);
    }
    const rotated = [newPacks[1], newPacks[2], newPacks[3], newPacks[0]];
    setMyPicks(newPicks);
    setPickOrder(newPickOrder);
    setPacks(rotated);
    if (newPicks.length >= maxPicks) setPhase("results");
    else setRound(round + 1);
  }, [packs, myPicks, pickOrder, round, maxPicks]);

  const handleSave = useCallback(async () => {
    try {
      await saveDraft(username, saveDraftType, myPicks, pickOrder);
      setSaved(true);
    } catch (err) {
      console.error("Failed to save draft:", err);
    }
  }, [username, saveDraftType, myPicks, pickOrder]);

  const resetDraft = useCallback(() => {
    setPhase("setup");
    setMyPicks([]);
    setPickOrder([]);
    setPacks([[], [], [], []]);
    setSaved(false);
    setShowCommunity(false);
  }, []);

  const resetToModePicker = useCallback(() => {
    resetDraft();
    setDrafterMode(null);
  }, [resetDraft]);

  // ── Mode picker screen ──────────────────────────────────────────────────
  if (drafterMode === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", background: T.bg }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 520, width: "100%", padding: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: T.accent, marginBottom: 6 }}>Agricola Drafter</div>
              <div style={{ fontSize: 15, color: T.textSecondary }}>Choose your draft format</div>
            </div>

            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              {/* Full Drafter card */}
              <button onClick={() => setDrafterMode("full")}
                style={{
                  flex: "1 1 220px", maxWidth: 240, padding: "28px 20px", borderRadius: 14,
                  border: `2px solid ${T.border}`, background: T.surface, cursor: "pointer",
                  textAlign: "center", transition: "all 0.2s",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ fontSize: 36 }}>{"\uD83C\uDFAF"}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Full Drafter</div>
                <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>
                  Pick <strong>7 cards</strong> from packs of 9
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>
                  All cards or Norway Deck, choose your decks, full customization
                </div>
              </button>

              {/* Mini Drafter card */}
              <button onClick={() => setDrafterMode("mini")}
                style={{
                  flex: "1 1 220px", maxWidth: 240, padding: "28px 20px", borderRadius: 14,
                  border: `2px solid ${T.border}`, background: T.surface, cursor: "pointer",
                  textAlign: "center", transition: "all 0.2s",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ fontSize: 36 }}>{"\uD83C\uDDF3\uD83C\uDDF4"}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Mini Drafter</div>
                <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>
                  Pick <strong>5 cards</strong> from packs of 7
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>
                  Norway Deck, fixed pool of 100 occupations + 100 minors
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", background: T.bg }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 460, width: "100%", padding: 24 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: T.accent }}>
                  {isMini ? "\uD83C\uDDF3\uD83C\uDDF4 Mini Drafter" : "\uD83C\uDFAF Full Drafter"}
                </div>
              </div>
              <div style={{ fontSize: 14, color: T.textSecondary }}>
                {isMini
                  ? "Draft 5 cards from packs of 7 \u2014 Norway Deck"
                  : "Draft 7 cards from rotating packs against 3 NPCs"
                }
              </div>
              <button onClick={resetToModePicker}
                style={{
                  marginTop: 8, background: "none", border: "none",
                  color: T.blue, fontSize: 12, cursor: "pointer", textDecoration: "underline",
                }}>
                {"\u2190"} Change draft mode
              </button>
            </div>

            {/* Username */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Your Name
              </label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Enter your name..."
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: T.surface, border: `1px solid ${T.border}`, color: T.text,
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Draft type */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                Draft Type
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Occupation", "\uD83D\uDC64 Occupations"], ["MinorImprovement", "\uD83D\uDD27 Minor Improvements"]].map(([val, label]) => (
                  <button key={val} onClick={() => setDraftType(val)}
                    style={{
                      flex: 1, padding: "12px 16px", borderRadius: 10,
                      border: "1px solid", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      borderColor: draftType === val ? T.accent : T.border,
                      background: draftType === val ? T.accentBg : T.surface,
                      color: draftType === val ? T.accent : T.textSecondary,
                      transition: "all 0.15s",
                    }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Card pool toggle — only for Full Drafter */}
            {!isMini && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>
                  Card Pool
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setNorwayOnly(false)}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid",
                      borderColor: !norwayOnly ? T.blue : T.border,
                      background: !norwayOnly ? "#eff6ff" : T.surface,
                      color: !norwayOnly ? T.blue : T.textSecondary,
                      fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>All Cards</button>
                  <button onClick={() => setNorwayOnly(true)}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid",
                      borderColor: norwayOnly ? T.red : T.border,
                      background: norwayOnly ? "#fef2f2" : T.surface,
                      color: norwayOnly ? T.red : T.textSecondary,
                      fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                    }}>{"\uD83C\uDDF3\uD83C\uDDF4"} Norway Deck</button>
                </div>
              </div>
            )}

            {/* Mini Drafter info badge */}
            {isMini && (
              <div style={{
                marginBottom: 20, padding: "10px 14px", borderRadius: 10,
                background: "#fef2f2", border: `1px solid ${T.red}33`,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 18 }}>{"\uD83C\uDDF3\uD83C\uDDF4"}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Norway Deck Only</div>
                  <div style={{ fontSize: 11, color: T.textSecondary }}>
                    {draftableCards.length} {draftType === "Occupation" ? "occupations" : "minor improvements"} in pool
                  </div>
                </div>
              </div>
            )}

            {/* Deck selection — only for Full Drafter */}
            {!isMini && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ fontSize: 11, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>
                    Decks
                  </label>
                  <button onClick={selectAllDecks}
                    style={{
                      background: "none", border: "none", color: T.blue, fontSize: 10,
                      cursor: "pointer", textDecoration: "underline",
                    }}>Select all</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {availableDecks.map(deck => {
                    const active = (selectedDecks || []).includes(deck);
                    return (
                      <button key={deck}
                        onClick={() => toggleDeck(deck)}
                        onDoubleClick={() => selectNoDecksExcept(deck)}
                        title={active ? "Click to remove \u00B7 Double-click to select only this deck" : "Click to add"}
                        style={{
                          padding: "4px 10px", borderRadius: 99, border: "1px solid",
                          borderColor: active ? T.purple : T.border,
                          background: active ? "#f5f3ff" : "transparent",
                          color: active ? T.purple : T.textMuted,
                          fontSize: 11, cursor: "pointer", transition: "all 0.15s",
                          fontWeight: active ? 600 : 400,
                        }}>{deck}</button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>
                  {draftableCards.length} cards in pool
                  {draftableCards.length < packSize * NUM_PLAYERS && draftableCards.length > 0 && (
                    <span style={{ color: T.accent, marginLeft: 6 }}>
                      (need at least {packSize * NUM_PLAYERS} cards \u2014 select more decks)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Start */}
            <button onClick={startDraft}
              disabled={!canStart}
              style={{
                width: "100%", padding: "14px 24px", borderRadius: 10, border: "none",
                background: canStart ? T.accent : T.border,
                color: canStart ? "#fff" : T.textMuted,
                fontSize: 16, fontWeight: 700, cursor: canStart ? "pointer" : "default",
                transition: "all 0.2s",
              }}>
              Start {isMini ? "Mini " : ""}Draft
            </button>

            {/* Community stats link */}
            <button onClick={() => setShowCommunity(s => !s)}
              style={{
                width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 8,
                border: `1px solid ${T.border}`, background: showCommunity ? T.surfaceAlt : "transparent",
                color: T.textSecondary, fontSize: 12, cursor: "pointer",
              }}>
              {showCommunity ? "Hide" : "View"} Community Stats
            </button>

            {showCommunity && (
              <div style={{ marginTop: 12, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
                <CommunityStats allCards={allCards} draftType={saveDraftType} />
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

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: T.bg }}>
        {/* Top bar */}
        <div style={{
          display: "flex", alignItems: "center", padding: "10px 16px",
          borderBottom: `1px solid ${T.border}`, gap: 12, flexShrink: 0, flexWrap: "wrap",
          background: T.surface,
        }}>
          {isMini && (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "#fef2f2", color: T.red, fontWeight: 600 }}>
              {"\uD83C\uDDF3\uD83C\uDDF4"} Mini
            </span>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, color: T.accent }}>
            Round {round}/{maxPicks}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted }}>
            {currentPack.length} cards in pack \u00B7 Pick {myPicks.length + 1} of {maxPicks}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            {myPicks.length > 0 && (
              <button onClick={() => setShowDraftHand(s => !s)}
                style={{
                  background: showDraftHand ? T.accentBg : T.surfaceAlt,
                  border: `1px solid ${showDraftHand ? T.accent : T.border}`,
                  borderRadius: 8, color: showDraftHand ? T.accent : T.textMuted,
                  padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                {"\u270B"} {myPicks.length}
              </button>
            )}
            {myPicks.map((id, i) => {
              const c = allCards.find(x => x.id === id);
              return (
                <div key={id} title={c?.name} style={{
                  width: 28, height: 28, borderRadius: 6, background: T.accentLight,
                  border: `1px solid ${T.accent}44`, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 10, color: T.accent, fontWeight: 700,
                }}>{i + 1}</div>
              );
            })}
            {Array.from({ length: maxPicks - myPicks.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                width: 28, height: 28, borderRadius: 6,
                border: `1px dashed ${T.border}`,
              }} />
            ))}
          </div>
        </div>

        {/* Picked hand panel (collapsible) */}
        {showDraftHand && myPicks.length > 0 && (
          <div style={{
            borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt,
            padding: "10px 16px", flexShrink: 0,
          }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              My Picks ({myPicks.length}/{maxPicks})
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6,
            }}>
              {myPicks.map((id, i) => {
                const c = allCards.find(x => x.id === id);
                if (!c) return null;
                const src = cardImgSrc(c);
                return (
                  <div key={id} style={{
                    borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`,
                    background: T.surface, width: 105, flexShrink: 0,
                  }}>
                    <div style={{ position: "relative", width: 105, height: 138, overflow: "hidden", background: T.surfaceAlt }}>
                      {src ? (
                        <img src={src} alt={c.name}
                          style={{ width: 105, height: 138, objectFit: "cover", objectPosition: "top", display: "block" }}
                        />
                      ) : (
                        <div style={{ padding: 6, fontSize: 9, color: T.textMuted, textAlign: "center", lineHeight: 1.3 }}>
                          <div style={{ fontWeight: 700, color: T.text, marginBottom: 2 }}>{c.name}</div>
                          {c.deck}
                        </div>
                      )}
                      <div style={{
                        position: "absolute", top: 2, left: 2, background: "rgba(255,255,255,0.85)", borderRadius: 99,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700, color: T.accent,
                      }}>#{i + 1}</div>
                    </div>
                    <div style={{ padding: "4px 6px" }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Card grid */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{ textAlign: "center", marginBottom: 12, color: T.textSecondary, fontSize: 13 }}>
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
      <div style={{ height: "100%", overflow: "auto", background: T.bg }}>
        <DraftResults
          picks={myPicks}
          allCards={allCards}
          draftType={draftType}
          saveDraftType={saveDraftType}
          username={username}
          onSave={handleSave}
          onNewDraft={resetDraft}
          saved={saved}
          isMini={isMini}
        />

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 24px" }}>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
            <CommunityStats allCards={allCards} draftType={saveDraftType} />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
