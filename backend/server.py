"""
Agricola Knowledge Graph – FastAPI backend.

Endpoints:
  GET  /api/cards              → full card list as JSON (for graph / table)
  POST /api/sparql             → run arbitrary SPARQL, return {columns, rows}
  GET  /api/meta               → gain/affect/deck/type facets for filter chips
  POST /api/drafts             → save a completed draft hand (returns twin count)
  GET  /api/drafts             → list all saved draft hands
  GET  /api/drafts/stats       → community pick popularity stats
  GET  /api/hands              → search community hands by card name / player nick
  GET  /api/hands/twins/{hash} → find hands with identical card selections
  GET  /api/hands/popular      → most popular cards across community hands
  GET  /                       → serve the built React frontend (index.html)
"""

import os
import sys
import time
import json
import sqlite3
import hashlib
import datetime
from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Add parent dir so we can import data_engineering & build the model ──────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import data_engineering as de
from maplib import Model

# ── Build the maplib RDF model at startup ────────────────────────────────────

def _build_model() -> Model:
    m = Model()
    tpl_path = os.path.join(PROJECT_ROOT, "tpl", "tpl.ttl")
    with open(tpl_path, "r") as f:
        m.add_template(f.read())
    m.map(de.ns + "Card", de.cards_for_rdf)
    m.map(de.ns + "CostPermutation", de.cost_permutations)
    m.map(de.ns + "CardGain", de.card_gains)
    m.map(de.ns + "CardAffect", de.card_affects)
    m.map(de.ns + "CardRelation", de.card_relations)
    ont_path = os.path.join(PROJECT_ROOT, "ontology.ttl")
    m.read(ont_path)
    return m

print("Building maplib model …")
model = _build_model()
print("Model ready.")

# ── Pre-compute card JSON from DataFrames (much faster than SPARQL) ──────────

NS = de.ns

def _strip(iri: str) -> str:
    """Strip the namespace prefix from an IRI string."""
    if isinstance(iri, str) and iri.startswith(NS):
        return iri[len(NS):]
    return iri or ""

def _build_cards_json() -> list[dict]:
    gains_map: dict[str, list[str]] = {}
    for row in de.card_gains.iter_rows(named=True):
        gains_map.setdefault(row["subject"], []).append(_strip(row["gain"]))

    affects_map: dict[str, list[str]] = {}
    for row in de.card_affects.iter_rows(named=True):
        affects_map.setdefault(row["subject"], []).append(_strip(row["affect"]))

    rels_map: dict[str, list[str]] = {}
    for row in de.card_relations.iter_rows(named=True):
        rels_map.setdefault(row["subject"], []).append(_strip(row["relation"]))

    # Build combos map: subject → [{id, name, reason}]
    COMBO_REASON_PRIORITY = {
        "card_reference": 0, "multi_signal": 1, "vegetable_supply": 2,
        "grain_supply": 3, "animal_breeding": 4, "baking_strategy": 5,
        "family_room": 6,
    }
    COMBO_REASON_LABELS = {
        "card_reference": "Referenced in card text",
        "multi_signal": "Multiple shared mechanics",
        "vegetable_supply": "Vegetable supply chain",
        "grain_supply": "Grain supply chain",
        "animal_breeding": "Animal + breeding synergy",
        "baking_strategy": "Baking strategy",
        "family_room": "Family growth + room",
    }
    MAX_COMBOS_PER_CARD = 15
    # Name lookup for combo partners
    subj_to_name: dict[str, str] = {}
    for row in de.cards.iter_rows(named=True):
        subj_to_name[row["subject"]] = row["Name"]
    combos_raw: dict[str, list[tuple[str, str]]] = {}
    for row in de.card_combos.iter_rows(named=True):
        a, b, reason = row["subject_a"], row["subject_b"], row["combo_reason"]
        combos_raw.setdefault(a, []).append((b, reason))
        combos_raw.setdefault(b, []).append((a, reason))
    combos_map: dict[str, list[dict]] = {}
    for subj, partners in combos_raw.items():
        partners.sort(key=lambda p: COMBO_REASON_PRIORITY.get(p[1], 99))
        combos_map[subj] = [
            {"id": p.replace(NS, ""), "name": subj_to_name.get(p, ""), "reason": r,
             "reasonLabel": COMBO_REASON_LABELS.get(r, r)}
            for p, r in partners[:MAX_COMBOS_PER_CARD]
        ]

    cards = []
    for r in de.cards.iter_rows(named=True):
        subj = r.get("subject", "")
        cards.append({
            "id": r.get("Card_ID", ""),
            "name": r.get("Name", ""),
            "type": _strip(r.get("Type", "")),
            "deck": r.get("Deck", "") or "",
            "winRatio": round(r.get("win_ratio") or 0, 4),
            "playRatio": round(r.get("play_ratio") or 0, 4),
            "pwr": round(r.get("PWR") or 0, 2),
            "cost": _strip(r.get("hasCost", "")) or None,
            "costLabel": r.get("cost_label") or None,
            "imageUrl": r.get("image_url") or None,
            "gains": gains_map.get(subj, []),
            "affects": affects_map.get(subj, []),
            "relations": rels_map.get(subj, []),
            "text": r.get("Card_Text") or "",
            "prerequisite": r.get("Prerequisite") or None,
            "adp": round(r.get("ADP") or 0, 2),
            "banned": bool(r.get("banned")),
            "isNo": bool(r.get("is_no")),
            "pwrCorrected": round(r.get("PWRcorr") or 0, 2),
            "deck2": r.get("Deck2"),
            "hasBonusSymbol": bool(r.get("has_bonus_symbol")),
            "combos": combos_map.get(subj, []),
        })
    return cards

print("Building card JSON …")
ALL_CARDS = _build_cards_json()
print(f"  {len(ALL_CARDS)} cards ready.")

# Pre-compute facet lists
ALL_GAINS = sorted({g for c in ALL_CARDS for g in c["gains"]})
ALL_AFFECTS = sorted({a for c in ALL_CARDS for a in c["affects"]})
ALL_DECKS = sorted({c["deck"] for c in ALL_CARDS if c["deck"]})
ALL_TYPES = sorted({c["type"] for c in ALL_CARDS if c["type"]})

# ── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="Agricola Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ───────────────────────────────────────────────────────────────

@app.get("/api/cards")
def get_cards():
    return ALL_CARDS

@app.get("/api/meta")
def get_meta():
    return {
        "gains": ALL_GAINS,
        "affects": ALL_AFFECTS,
        "decks": ALL_DECKS,
        "types": ALL_TYPES,
        "totalCards": len(ALL_CARDS),
    }

class SparqlRequest(BaseModel):
    query: str

@app.post("/api/sparql")
def run_sparql(req: SparqlRequest):
    t0 = time.perf_counter()
    try:
        result_df = model.query(req.query)
        elapsed = round((time.perf_counter() - t0) * 1000)

        columns = list(result_df.columns)
        rows = []
        for row in result_df.iter_rows(named=True):
            rows.append({col: _format_value(row[col]) for col in columns})

        return {
            "columns": columns,
            "rows": rows,
            "total": len(rows),
            "time": elapsed,
        }
    except Exception as e:
        elapsed = round((time.perf_counter() - t0) * 1000)
        return JSONResponse(
            status_code=400,
            content={"error": str(e), "time": elapsed},
        )

def _format_value(val) -> str:
    """Format a SPARQL result value for JSON output."""
    if val is None:
        return ""
    if isinstance(val, float):
        if val == int(val):
            return str(int(val))
        return f"{val:.4f}"
    s = str(val)
    # Strip angle brackets from IRIs for readability
    if s.startswith("<") and s.endswith(">"):
        s = s[1:-1]
    # Strip namespace prefix for brevity
    if s.startswith(NS):
        s = ":" + s[len(NS):]
    return s

# ── Draft hands storage (SQLite — persists across deploys on Fly Volumes) ────
#
# Set DRAFTS_DB_PATH env var to point at a Fly Volume mount, e.g.:
#   DRAFTS_DB_PATH=/data/drafts.db
# Falls back to ./data/drafts.db for local development.

DRAFTS_DB_PATH = os.environ.get(
    "DRAFTS_DB_PATH",
    os.path.join(PROJECT_ROOT, "data", "drafts.db"),
)

def _get_db() -> sqlite3.Connection:
    """Return a connection to the drafts database, creating the table if needed."""
    os.makedirs(os.path.dirname(DRAFTS_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DRAFTS_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # better concurrent read/write
    conn.execute("""
        CREATE TABLE IF NOT EXISTS drafts (
            id         TEXT PRIMARY KEY,
            username   TEXT NOT NULL,
            draftType  TEXT NOT NULL,
            picks      TEXT NOT NULL,
            pickOrder  TEXT NOT NULL,
            timestamp  TEXT NOT NULL
        )
    """)
    # Migration: add comment and picksHash columns if missing
    cols = {row[1] for row in conn.execute("PRAGMA table_info(drafts)").fetchall()}
    if "comment" not in cols:
        conn.execute("ALTER TABLE drafts ADD COLUMN comment TEXT DEFAULT ''")
    if "picksHash" not in cols:
        conn.execute("ALTER TABLE drafts ADD COLUMN picksHash TEXT DEFAULT ''")
        # Backfill picksHash for existing rows
        for row in conn.execute("SELECT id, picks FROM drafts").fetchall():
            h = _picks_hash(json.loads(row[1]))
            conn.execute("UPDATE drafts SET picksHash = ? WHERE id = ?", (h, row[0]))
    conn.commit()
    return conn


def _picks_hash(picks: list[str]) -> str:
    """Deterministic hash of a hand (sorted card IDs) for duplicate detection."""
    return hashlib.md5("|".join(sorted(picks)).encode()).hexdigest()

def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["picks"] = json.loads(d["picks"])
    d["pickOrder"] = json.loads(d["pickOrder"])
    d["comment"] = d.get("comment") or ""
    return d

class DraftSaveRequest(BaseModel):
    username: str
    draftType: str             # "Occupation", "MinorImprovement", "MiniOccupation", "MiniMinorImprovement"
    picks: list[str]           # card IDs in pick order
    pickOrder: list[int]       # round number for each pick
    comment: str = ""          # optional player note

_VALID_DRAFT_TYPES = {"Occupation", "MinorImprovement", "MiniOccupation", "MiniMinorImprovement"}
_PICK_COUNTS = {"Occupation": 7, "MinorImprovement": 7, "MiniOccupation": 5, "MiniMinorImprovement": 5}

@app.post("/api/drafts")
def save_draft(req: DraftSaveRequest):
    if not req.username.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    expected_picks = _PICK_COUNTS.get(req.draftType)
    if expected_picks is None:
        return JSONResponse(status_code=400, content={"error": "invalid draftType"})
    if len(req.picks) != expected_picks:
        return JSONResponse(status_code=400, content={"error": f"must have exactly {expected_picks} picks for {req.draftType}"})

    draft_id = hashlib.md5(f"{req.username}{time.time()}".encode()).hexdigest()[:12]
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    ph = _picks_hash(req.picks)

    conn = _get_db()

    # Prevent same user saving the exact same hand twice
    existing = conn.execute(
        "SELECT id FROM drafts WHERE username = ? AND picksHash = ? AND draftType = ?",
        (req.username.strip(), ph, req.draftType)
    ).fetchone()
    if existing:
        # Still return twin info so the UI shows it
        twin_count = conn.execute(
            "SELECT COUNT(*) FROM drafts WHERE picksHash = ? AND id != ?", (ph, existing[0])
        ).fetchone()[0]
        twin_rows = conn.execute(
            "SELECT id, username, timestamp FROM drafts WHERE picksHash = ? AND id != ? ORDER BY timestamp DESC LIMIT 5",
            (ph, existing[0])
        ).fetchall()
        conn.close()
        return JSONResponse(status_code=409, content={
            "error": "You already saved this exact hand",
            "ok": False,
            "twins": twin_count,
            "twinUsers": [{"id": r[0], "username": r[1], "timestamp": r[2]} for r in twin_rows],
        })

    conn.execute(
        "INSERT INTO drafts (id, username, draftType, picks, pickOrder, timestamp, comment, picksHash) VALUES (?,?,?,?,?,?,?,?)",
        (draft_id, req.username.strip(), req.draftType,
         json.dumps(req.picks), json.dumps(req.pickOrder), ts,
         (req.comment or "").strip()[:500], ph),
    )
    conn.commit()

    # Count twins (other hands with the exact same picks)
    twin_count = conn.execute(
        "SELECT COUNT(*) FROM drafts WHERE picksHash = ? AND id != ?", (ph, draft_id)
    ).fetchone()[0]
    twin_rows = conn.execute(
        "SELECT id, username, timestamp FROM drafts WHERE picksHash = ? AND id != ? ORDER BY timestamp DESC LIMIT 5",
        (ph, draft_id)
    ).fetchall()
    conn.close()

    entry = {
        "id": draft_id, "username": req.username.strip(),
        "draftType": req.draftType, "picks": req.picks,
        "pickOrder": req.pickOrder, "timestamp": ts,
        "comment": (req.comment or "").strip()[:500],
        "picksHash": ph,
    }
    return {
        "ok": True, "draft": entry,
        "twins": twin_count,
        "twinUsers": [{"id": r[0], "username": r[1], "timestamp": r[2]} for r in twin_rows],
    }

@app.get("/api/drafts")
def list_drafts(username: Optional[str] = None, draftType: Optional[str] = None):
    conn = _get_db()
    query = "SELECT * FROM drafts WHERE 1=1"
    params: list = []
    if username:
        query += " AND username = ?"
        params.append(username)
    if draftType:
        query += " AND draftType = ?"
        params.append(draftType)
    query += " ORDER BY timestamp DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    drafts = [_row_to_dict(r) for r in rows]
    return {"drafts": drafts, "total": len(drafts)}

@app.get("/api/drafts/stats")
def draft_stats(draftType: Optional[str] = None):
    """Community stats: most popular picks by round."""
    conn = _get_db()
    query = "SELECT picks, pickOrder FROM drafts"
    params: list = []
    if draftType:
        query += " WHERE draftType = ?"
        params.append(draftType)
    rows = conn.execute(query, params).fetchall()
    conn.close()

    round_picks: dict[int, dict[str, int]] = {}
    overall_picks: dict[str, int] = {}
    for row in rows:
        picks = json.loads(row["picks"])
        pick_order = json.loads(row["pickOrder"])
        for i, card_id in enumerate(picks):
            rnd = pick_order[i] if i < len(pick_order) else i + 1
            round_picks.setdefault(rnd, {})
            round_picks[rnd][card_id] = round_picks[rnd].get(card_id, 0) + 1
            overall_picks[card_id] = overall_picks.get(card_id, 0) + 1

    round_top = {}
    for rnd, pk in round_picks.items():
        sorted_picks = sorted(pk.items(), key=lambda x: x[1], reverse=True)[:5]
        round_top[str(rnd)] = [{"cardId": cid, "count": cnt} for cid, cnt in sorted_picks]

    overall_top = sorted(overall_picks.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "totalDrafts": len(rows),
        "roundTop": round_top,
        "overallTop": [{"cardId": cid, "count": cnt} for cid, cnt in overall_top],
    }

# ── Community Hands endpoints ────────────────────────────────────────────────

# Pre-compute card name → id lookup for search
_CARD_NAME_MAP: dict[str, str] = {c["name"].lower(): c["id"] for c in ALL_CARDS}
_CARD_ID_TO_NAME: dict[str, str] = {c["id"]: c["name"] for c in ALL_CARDS}

@app.get("/api/hands")
def search_hands(
    q: Optional[str] = None,
    draftType: Optional[str] = None,
    page: int = 1,
    pageSize: int = 20,
):
    """Search community hands by card name or player nickname."""
    conn = _get_db()
    base = "SELECT * FROM drafts WHERE 1=1"
    count_base = "SELECT COUNT(*) FROM drafts WHERE 1=1"
    params: list = []
    count_params: list = []

    if draftType:
        base += " AND draftType = ?"
        count_base += " AND draftType = ?"
        params.append(draftType)
        count_params.append(draftType)

    if q:
        q_lower = q.strip().lower()
        # Find card IDs whose name contains the search query
        matching_card_ids = [cid for name, cid in _CARD_NAME_MAP.items() if q_lower in name]

        if matching_card_ids:
            # Search both username and card picks
            card_likes = " OR ".join(["picks LIKE ?" for _ in matching_card_ids])
            clause = f" AND (LOWER(username) LIKE ? OR {card_likes})"
            base += clause
            count_base += clause
            like_param = f"%{q_lower}%"
            card_params = [f"%{cid}%" for cid in matching_card_ids]
            params.extend([like_param] + card_params)
            count_params.extend([like_param] + card_params)
        else:
            # Only search username
            base += " AND LOWER(username) LIKE ?"
            count_base += " AND LOWER(username) LIKE ?"
            like_param = f"%{q_lower}%"
            params.append(like_param)
            count_params.append(like_param)

    total = conn.execute(count_base, count_params).fetchone()[0]

    base += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([min(pageSize, 50), (page - 1) * min(pageSize, 50)])

    rows = conn.execute(base, params).fetchall()
    conn.close()

    drafts = [_row_to_dict(r) for r in rows]
    # Enrich each draft with picksHash and card names for frontend
    for d in drafts:
        d["cardNames"] = [_CARD_ID_TO_NAME.get(pid, pid) for pid in d["picks"]]

    return {
        "hands": drafts,
        "total": total,
        "page": page,
        "pageSize": min(pageSize, 50),
        "totalPages": max(1, (total + min(pageSize, 50) - 1) // min(pageSize, 50)),
    }


@app.get("/api/hands/twins/{picks_hash}")
def get_twins(picks_hash: str):
    """Get all hands with the same picksHash (identical card selections)."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT * FROM drafts WHERE picksHash = ? ORDER BY timestamp ASC",
        (picks_hash,)
    ).fetchall()
    conn.close()
    drafts = [_row_to_dict(r) for r in rows]
    for d in drafts:
        d["cardNames"] = [_CARD_ID_TO_NAME.get(pid, pid) for pid in d["picks"]]
    return {"twins": drafts, "total": len(drafts)}


@app.get("/api/hands/popular")
def popular_cards(draftType: Optional[str] = None, limit: int = 15):
    """Most popular cards across all community hands, with pick count and percentage."""
    conn = _get_db()
    query = "SELECT picks FROM drafts"
    params: list = []
    if draftType:
        query += " WHERE draftType = ?"
        params.append(draftType)
    rows = conn.execute(query, params).fetchall()
    conn.close()

    total_hands = len(rows)
    if total_hands == 0:
        return {"cards": [], "totalHands": 0}

    card_counts: dict[str, int] = {}
    for row in rows:
        picks = json.loads(row["picks"])
        for card_id in picks:
            card_counts[card_id] = card_counts.get(card_id, 0) + 1

    sorted_cards = sorted(card_counts.items(), key=lambda x: x[1], reverse=True)[:min(limit, 30)]
    return {
        "cards": [
            {
                "cardId": cid,
                "cardName": _CARD_ID_TO_NAME.get(cid, cid),
                "count": cnt,
                "percentage": round(cnt / total_hands * 100, 1),
            }
            for cid, cnt in sorted_cards
        ],
        "totalHands": total_hands,
    }


# ── Image proxy (avoids mixed-content blocking) ─────────────────────────────

ALLOWED_IMAGE_HOSTS = {"play-agricola.com", "www.play-agricola.com", "hauk88.github.io"}
_http_client: httpx.AsyncClient | None = None

async def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "AgricolaExplorer/1.0"},
        )
    return _http_client

@app.get("/api/imgproxy")
async def image_proxy(url: str = ""):
    """Proxy card images from play-agricola.com to avoid mixed-content issues."""
    url = unquote(url)
    if not url:
        return JSONResponse(status_code=400, content={"error": "missing url param"})

    # Security: only proxy from known image hosts
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host not in ALLOWED_IMAGE_HOSTS:
        return JSONResponse(status_code=403, content={"error": f"host not allowed: {host}"})

    try:
        client = await _get_http_client()
        resp = await client.get(url)
        resp.raise_for_status()

        content_type = resp.headers.get("content-type", "image/jpeg")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",  # cache 24h
                "Access-Control-Allow-Origin": "*",
            },
        )
    except httpx.HTTPStatusError as e:
        return JSONResponse(status_code=e.response.status_code, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})

# ── Serve static frontend (after build) ─────────────────────────────────────

DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "ui", "dist")
if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Try exact file first, then fallback to index.html (SPA routing)
        file_path = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
