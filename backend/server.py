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
  POST /api/scores             → save a game score sheet
  GET  /api/scores             → search scores by player name or tournament
  GET  /                       → serve the built React frontend (index.html)
"""

import os
import sys
import time
import json
import base64
import sqlite3
import hashlib
import datetime
from typing import Optional
from urllib.parse import unquote

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response, HTMLResponse
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
            "deck": r.get("DeckLabel", "") or "",
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
            "pwrRaw": round(r.get("PWR_raw") or 0, 2) if r.get("PWR_raw") is not None else None,
            "adpRaw": round(r.get("ADP_raw") or 0, 2) if r.get("ADP_raw") is not None else None,
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
    if "combos" not in cols:
        conn.execute("ALTER TABLE drafts ADD COLUMN combos TEXT DEFAULT '[]'")
    if "challengeId" not in cols:
        conn.execute("ALTER TABLE drafts ADD COLUMN challengeId TEXT DEFAULT NULL")

    # ── Challenges table ──────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS challenges (
            id                 TEXT PRIMARY KEY,
            seed               INTEGER NOT NULL,
            draftType          TEXT NOT NULL,
            drafterMode        TEXT NOT NULL,
            deckSelection      TEXT NOT NULL,
            norwayOnly         INTEGER NOT NULL DEFAULT 1,
            creatorName        TEXT NOT NULL,
            creatorPicks       TEXT NOT NULL DEFAULT '[]',
            creatorPickOrder   TEXT NOT NULL DEFAULT '[]',
            creatorComment     TEXT DEFAULT '',
            creatorCombos      TEXT DEFAULT '[]',
            challengerName     TEXT DEFAULT NULL,
            challengerPicks    TEXT DEFAULT NULL,
            challengerPickOrder TEXT DEFAULT NULL,
            challengerComment  TEXT DEFAULT NULL,
            challengerCombos   TEXT DEFAULT NULL,
            createdAt          TEXT NOT NULL,
            completedAt        TEXT DEFAULT NULL
        )
    """)

    # ── Challenge attempts table (one row per player attempt) ────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS challenge_attempts (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            challengeId    TEXT NOT NULL,
            challengerName TEXT NOT NULL,
            picks          TEXT NOT NULL,
            pickOrder      TEXT NOT NULL,
            comment        TEXT DEFAULT '',
            combos         TEXT DEFAULT '[]',
            overlapCount   INTEGER NOT NULL DEFAULT 0,
            completedAt    TEXT NOT NULL,
            UNIQUE (challengeId, challengerName)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_attempts_challenge ON challenge_attempts(challengeId, overlapCount DESC)")

    # Migration: copy any legacy single-challenger data from challenges into challenge_attempts
    legacy = conn.execute(
        """SELECT id, creatorPicks, challengerName, challengerPicks, challengerPickOrder,
                  challengerComment, challengerCombos, completedAt
           FROM challenges
           WHERE challengerName IS NOT NULL AND challengerPicks IS NOT NULL"""
    ).fetchall()
    for r in legacy:
        existing = conn.execute(
            "SELECT 1 FROM challenge_attempts WHERE challengeId = ? AND challengerName = ?",
            (r["id"], r["challengerName"])
        ).fetchone()
        if existing:
            continue
        try:
            creator_picks = json.loads(r["creatorPicks"] or "[]")
            challenger_picks = json.loads(r["challengerPicks"] or "[]")
            overlap_count = sum(1 for p in creator_picks if p in challenger_picks)
            conn.execute(
                """INSERT INTO challenge_attempts
                   (challengeId, challengerName, picks, pickOrder, comment, combos, overlapCount, completedAt)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (r["id"], r["challengerName"],
                 r["challengerPicks"], r["challengerPickOrder"] or "[]",
                 r["challengerComment"] or "", r["challengerCombos"] or "[]",
                 overlap_count, r["completedAt"] or datetime.datetime.utcnow().isoformat() + "Z")
            )
        except Exception as e:
            print(f"  [migration] skipped legacy attempt on {r['id']}: {e}")

    # ── Wiki tables ──────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wiki_combos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cardIds     TEXT NOT NULL,
            comment     TEXT DEFAULT '',
            submittedBy TEXT NOT NULL,
            createdAt   TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wiki_combos_cards ON wiki_combos(cardIds)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wiki_nobos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cardIds     TEXT NOT NULL,
            comment     TEXT DEFAULT '',
            submittedBy TEXT NOT NULL,
            createdAt   TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wiki_nobos_cards ON wiki_nobos(cardIds)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wiki_tips (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cardId      TEXT NOT NULL,
            tip         TEXT NOT NULL,
            submittedBy TEXT NOT NULL,
            createdAt   TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_wiki_tips_card ON wiki_tips(cardId)")

    # ── Live rooms tables ────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            code            TEXT PRIMARY KEY,
            phase           TEXT NOT NULL DEFAULT 'lobby',
            creatorName     TEXT NOT NULL,
            maxPlayers      INTEGER NOT NULL DEFAULT 5,
            deckSelection   TEXT NOT NULL DEFAULT '[]',
            norwayOnly      INTEGER NOT NULL DEFAULT 1,
            seed            INTEGER,
            draftRound      INTEGER NOT NULL DEFAULT 0,
            draftPhase      TEXT NOT NULL DEFAULT 'occ',
            packs           TEXT NOT NULL DEFAULT '[]',
            roundCards      TEXT NOT NULL DEFAULT '[]',
            gameRound       INTEGER NOT NULL DEFAULT 0,
            settings        TEXT NOT NULL DEFAULT '{}',
            createdAt       TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS room_players (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            roomCode        TEXT NOT NULL,
            seat            INTEGER NOT NULL,
            username        TEXT NOT NULL,
            hand            TEXT NOT NULL DEFAULT '[]',
            playedCards     TEXT NOT NULL DEFAULT '[]',
            discardedCards  TEXT NOT NULL DEFAULT '[]',
            currentPick     TEXT DEFAULT NULL,
            connected       INTEGER NOT NULL DEFAULT 1,
            UNIQUE (roomCode, seat),
            UNIQUE (roomCode, username)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_room_players_room ON room_players(roomCode)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS room_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            roomCode        TEXT NOT NULL,
            action          TEXT NOT NULL,
            seat            INTEGER,
            data            TEXT NOT NULL DEFAULT '{}',
            timestamp       TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_room_log_room ON room_log(roomCode)")

    # ── Scores table ──────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scores (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            tournament   TEXT,
            tableNumber  TEXT,
            gameNumber   TEXT,
            valuesJson   TEXT NOT NULL,
            pointsJson   TEXT NOT NULL,
            total        INTEGER NOT NULL,
            timestamp    TEXT NOT NULL
        )
    """)
    # Migration: add startingPosition and cardLog columns to scores if missing
    score_cols = {row[1] for row in conn.execute("PRAGMA table_info(scores)").fetchall()}
    if "startingPosition" not in score_cols:
        conn.execute("ALTER TABLE scores ADD COLUMN startingPosition TEXT")
    if "cardLog" not in score_cols:
        conn.execute("ALTER TABLE scores ADD COLUMN cardLog TEXT")
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
    d["combos"] = json.loads(d.get("combos") or "[]")
    return d

class ComboTag(BaseModel):
    cardIds: list[str]         # 2+ card IDs that form the combo
    comment: str = ""          # player's note about why these combo

class DraftSaveRequest(BaseModel):
    username: str
    draftType: str             # "Occupation", "MinorImprovement", "FullCombo"
    picks: list[str]           # card IDs in pick order
    pickOrder: list[int]       # round number for each pick
    comment: str = ""          # optional player note
    combos: list[ComboTag] = []  # tagged card combos
    challengeId: Optional[str] = None  # if part of a challenge

_VALID_DRAFT_TYPES = {"Occupation", "MinorImprovement", "FullCombo"}
_PICK_COUNTS = {"Occupation": 7, "MinorImprovement": 7, "FullCombo": 14}

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

    # Serialize combos: list of {cardIds, comment}
    combos_json = json.dumps([{"cardIds": c.cardIds, "comment": (c.comment or "").strip()[:200]} for c in (req.combos or [])])

    conn.execute(
        "INSERT INTO drafts (id, username, draftType, picks, pickOrder, timestamp, comment, picksHash, combos, challengeId) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (draft_id, req.username.strip(), req.draftType,
         json.dumps(req.picks), json.dumps(req.pickOrder), ts,
         (req.comment or "").strip()[:500], ph, combos_json, req.challengeId),
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
        "combos": [{"cardIds": c.cardIds, "comment": (c.comment or "").strip()[:200]} for c in (req.combos or [])],
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

# ── Challenge endpoints ──────────────────────────────────────────────────────

def _generate_challenge_id() -> str:
    """Generate a short URL-friendly challenge ID (8 alphanumeric chars)."""
    import secrets
    import string
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(8))

class CreateChallengeRequest(BaseModel):
    seed: int
    draftType: str
    drafterMode: str
    deckSelection: list[str]  # card IDs in the available pool
    norwayOnly: int           # 0 or 1
    creatorName: str
    creatorPicks: list[str]   # card IDs picked by creator
    creatorPickOrder: list[int]  # round numbers
    creatorComment: str = ""
    creatorCombos: list[ComboTag] = []

@app.post("/api/challenges")
def create_challenge(req: CreateChallengeRequest):
    if not req.creatorName.strip():
        return JSONResponse(status_code=400, content={"error": "creatorName required"})
    if req.draftType not in _VALID_DRAFT_TYPES:
        return JSONResponse(status_code=400, content={"error": "invalid draftType"})
    if len(req.creatorPicks) != _PICK_COUNTS.get(req.draftType):
        return JSONResponse(status_code=400, content={"error": f"invalid pick count for {req.draftType}"})

    challenge_id = _generate_challenge_id()
    ts = datetime.datetime.utcnow().isoformat() + "Z"

    conn = _get_db()
    conn.execute(
        """INSERT INTO challenges
           (id, seed, draftType, drafterMode, deckSelection, norwayOnly,
            creatorName, creatorPicks, creatorPickOrder, creatorComment, creatorCombos, createdAt)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (challenge_id, req.seed, req.draftType, req.drafterMode,
         json.dumps(req.deckSelection), req.norwayOnly,
         req.creatorName.strip(),
         json.dumps(req.creatorPicks), json.dumps(req.creatorPickOrder),
         (req.creatorComment or "").strip()[:500],
         json.dumps([{"cardIds": c.cardIds, "comment": (c.comment or "").strip()[:200]} for c in (req.creatorCombos or [])]),
         ts)
    )
    conn.commit()
    conn.close()

    return {"ok": True, "challengeId": challenge_id}

def _fetch_attempt_summaries(conn, challenge_id: str) -> list[dict]:
    """Return all attempts for a challenge as lightweight summaries (no picks)."""
    rows = conn.execute(
        """SELECT id, challengerName, overlapCount, completedAt
           FROM challenge_attempts
           WHERE challengeId = ?
           ORDER BY overlapCount DESC, completedAt ASC""",
        (challenge_id,)
    ).fetchall()
    return [
        {"id": r["id"], "name": r["challengerName"],
         "overlapCount": r["overlapCount"], "completedAt": r["completedAt"]}
        for r in rows
    ]

def _fetch_full_attempts(conn, challenge_id: str) -> list[dict]:
    """Return all attempts with full pick data, sorted by overlap DESC."""
    rows = conn.execute(
        """SELECT * FROM challenge_attempts
           WHERE challengeId = ?
           ORDER BY overlapCount DESC, completedAt ASC""",
        (challenge_id,)
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        out.append({
            "id": d["id"],
            "name": d["challengerName"],
            "picks": json.loads(d["picks"]),
            "pickOrder": json.loads(d["pickOrder"]),
            "combos": json.loads(d.get("combos") or "[]"),
            "comment": d.get("comment") or "",
            "overlapCount": d["overlapCount"],
            "completedAt": d["completedAt"],
        })
    return out

@app.get("/api/challenges/{id}")
def get_challenge(id: str):
    """Challenge metadata for the drafter. Spoilers (creator picks, attempt picks)
    are always hidden from this endpoint; use /compare to reveal them."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM challenges WHERE id = ?", (id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "Challenge not found"})

    attempts = _fetch_attempt_summaries(conn, id)
    conn.close()

    d = dict(row)
    d["deckSelection"] = json.loads(d["deckSelection"])
    d["attempts"] = attempts
    d["attemptCount"] = len(attempts)
    d["completed"] = len(attempts) > 0

    # Always hide creator picks/combos/comment from the drafter fetch.
    # These are revealed via the /compare endpoint after the user finishes or opens the leaderboard.
    for k in ("creatorPicks", "creatorPickOrder", "creatorComment", "creatorCombos",
              "challengerName", "challengerPicks", "challengerPickOrder",
              "challengerComment", "challengerCombos"):
        d.pop(k, None)

    return d

class SubmitChallengeRequest(BaseModel):
    challengerName: str
    picks: list[str]
    pickOrder: list[int]
    comment: str = ""
    combos: list[ComboTag] = []

@app.post("/api/challenges/{id}/complete")
def complete_challenge(id: str, req: SubmitChallengeRequest):
    if not req.challengerName.strip():
        return JSONResponse(status_code=400, content={"error": "challengerName required"})

    conn = _get_db()
    row = conn.execute("SELECT * FROM challenges WHERE id = ?", (id,)).fetchone()

    if not row:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "Challenge not found"})

    d = dict(row)
    expected_picks = _PICK_COUNTS.get(d["draftType"])
    if len(req.picks) != expected_picks:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "invalid pick count"})

    challenger_name = req.challengerName.strip()

    # Reject duplicate name on same challenge
    existing = conn.execute(
        "SELECT 1 FROM challenge_attempts WHERE challengeId = ? AND lower(challengerName) = lower(?)",
        (id, challenger_name)
    ).fetchone()
    if existing:
        conn.close()
        return JSONResponse(
            status_code=409,
            content={"error": f"'{challenger_name}' has already taken this challenge. Try a different name."}
        )

    creator_picks = json.loads(d["creatorPicks"])
    overlap_count = sum(1 for p in creator_picks if p in req.picks)

    ts = datetime.datetime.utcnow().isoformat() + "Z"
    combos_json = json.dumps(
        [{"cardIds": c.cardIds, "comment": (c.comment or "").strip()[:200]} for c in (req.combos or [])]
    )

    conn.execute(
        """INSERT INTO challenge_attempts
           (challengeId, challengerName, picks, pickOrder, comment, combos, overlapCount, completedAt)
           VALUES (?,?,?,?,?,?,?,?)""",
        (id, challenger_name,
         json.dumps(req.picks), json.dumps(req.pickOrder),
         (req.comment or "").strip()[:500], combos_json, overlap_count, ts)
    )

    # Also update the first-completedAt on the challenge for legacy compatibility
    if not row["completedAt"]:
        conn.execute("UPDATE challenges SET completedAt = ? WHERE id = ?", (ts, id))

    conn.commit()
    attempts = _fetch_full_attempts(conn, id)
    conn.close()

    # Locate the attempt the user just submitted so the UI can highlight it
    my_attempt_idx = next((i for i, a in enumerate(attempts) if a["name"] == challenger_name), -1)

    comparison = {
        "challengeId": id,
        "creator": {
            "name": row["creatorName"],
            "picks": creator_picks,
            "combos": json.loads(row["creatorCombos"] or "[]"),
            "comment": row["creatorComment"] or "",
        },
        "attempts": attempts,
        "myAttemptIndex": my_attempt_idx,
        "draftType": d["draftType"],
        "drafterMode": d["drafterMode"],
    }

    return {"ok": True, "comparison": comparison}

@app.get("/api/challenges/{id}/compare")
def get_challenge_comparison(id: str):
    """Full comparison view: creator hand + all attempts sorted by overlap."""
    conn = _get_db()
    row = conn.execute("SELECT * FROM challenges WHERE id = ?", (id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "Challenge not found"})

    d = dict(row)
    attempts = _fetch_full_attempts(conn, id)
    conn.close()

    creator_picks = json.loads(d["creatorPicks"])

    return {
        "challengeId": id,
        "creator": {
            "name": d["creatorName"],
            "picks": creator_picks,
            "combos": json.loads(d.get("creatorCombos") or "[]"),
            "comment": d.get("creatorComment") or "",
        },
        "attempts": attempts,
        "attemptCount": len(attempts),
        "draftType": d["draftType"],
        "drafterMode": d["drafterMode"],
    }

@app.get("/api/challenges")
def list_challenges(page: int = 1, pageSize: int = 20):
    """List all challenges, newest first, with attempt counts and summaries."""
    conn = _get_db()
    offset = (page - 1) * pageSize

    total = conn.execute("SELECT COUNT(*) FROM challenges").fetchone()[0]
    rows = conn.execute(
        "SELECT * FROM challenges ORDER BY createdAt DESC LIMIT ? OFFSET ?",
        (pageSize, offset)
    ).fetchall()

    challenges = []
    for row in rows:
        d = dict(row)
        d["creatorPicks"] = json.loads(d["creatorPicks"])
        d["creatorPickOrder"] = json.loads(d["creatorPickOrder"])
        d["creatorCombos"] = json.loads(d.get("creatorCombos") or "[]")
        d["deckSelection"] = json.loads(d["deckSelection"])
        attempts = _fetch_attempt_summaries(conn, d["id"])
        d["attempts"] = attempts
        d["attemptCount"] = len(attempts)
        d["completed"] = len(attempts) > 0
        # Drop the legacy single-challenger columns from the response
        for k in ("challengerName", "challengerPicks", "challengerPickOrder",
                  "challengerComment", "challengerCombos"):
            d.pop(k, None)
        challenges.append(d)
    conn.close()

    return {
        "challenges": challenges,
        "total": total,
        "page": page,
        "totalPages": max(1, (total + pageSize - 1) // pageSize),
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


# ── Score Sheet endpoints ─────────────────────────────────────────────────────

class ScoreSaveRequest(BaseModel):
    name: str
    tournament: Optional[str] = None
    tableNumber: Optional[str] = None
    gameNumber: Optional[str] = None
    startingPosition: Optional[str] = None  # "1st", "2nd", etc.
    values: dict          # {fields: 3, pastures: 1, ...}
    points: dict          # {fields: 2, pastures: 1, ...}
    total: int
    cardLog: Optional[list] = None  # [{id, name, type, played, order, round, comment}]

@app.post("/api/scores")
def save_score(req: ScoreSaveRequest):
    if not req.name.strip():
        return JSONResponse(status_code=400, content={"error": "name required"})

    score_id = hashlib.md5(f"{req.name}{time.time()}".encode()).hexdigest()[:12]
    ts = datetime.datetime.utcnow().isoformat() + "Z"

    card_log_json = json.dumps(req.cardLog) if req.cardLog else None

    conn = _get_db()
    conn.execute(
        "INSERT INTO scores (id, name, tournament, tableNumber, gameNumber, startingPosition, valuesJson, pointsJson, total, timestamp, cardLog) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (score_id, req.name.strip(),
         (req.tournament or "").strip() or None,
         (req.tableNumber or "").strip() or None,
         (req.gameNumber or "").strip() or None,
         (req.startingPosition or "").strip() or None,
         json.dumps(req.values), json.dumps(req.points),
         req.total, ts, card_log_json),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "id": score_id}


@app.get("/api/scores")
def list_scores(q: str = "", page: int = 1, pageSize: int = 20):
    conn = _get_db()
    offset = (max(page, 1) - 1) * pageSize

    if q.strip():
        like = f"%{q.strip()}%"
        total = conn.execute(
            "SELECT COUNT(*) FROM scores WHERE name LIKE ? OR tournament LIKE ?",
            (like, like)
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM scores WHERE name LIKE ? OR tournament LIKE ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (like, like, pageSize, offset)
        ).fetchall()
    else:
        total = conn.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM scores ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            (pageSize, offset)
        ).fetchall()

    scores = []
    for row in rows:
        d = dict(row)
        d["values"] = json.loads(d.pop("valuesJson"))
        d["points"] = json.loads(d.pop("pointsJson"))
        d["cardLog"] = json.loads(d["cardLog"]) if d.get("cardLog") else None
        scores.append(d)

    conn.close()
    return {"scores": scores, "total": total, "page": page, "pageSize": pageSize}


class ScoreDeleteRequest(BaseModel):
    confirmName: str  # must match the player name on the score

@app.delete("/api/scores/{score_id}")
def delete_score(score_id: str, req: ScoreDeleteRequest):
    conn = _get_db()
    row = conn.execute("SELECT name FROM scores WHERE id = ?", (score_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "Score not found"})

    if req.confirmName.strip().lower() != row["name"].strip().lower():
        conn.close()
        return JSONResponse(status_code=403, content={"error": "Player name does not match"})

    conn.execute("DELETE FROM scores WHERE id = ?", (score_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


# ── Backup / Restore ─────────────────────────────────────────────────────────

@app.get("/api/export-rdf")
def export_rdf():
    """Export the full card knowledge graph as Turtle RDF."""
    ttl = model.writes(format="turtle")
    return Response(
        content=ttl,
        media_type="text/turtle",
        headers={
            "Content-Disposition": 'attachment; filename="agricola-cards.ttl"',
        },
    )


@app.get("/api/backup")
def backup_data():
    """Export all drafts and scores as a single JSON download."""
    conn = _get_db()

    drafts = []
    for row in conn.execute("SELECT * FROM drafts ORDER BY timestamp DESC").fetchall():
        d = dict(row)
        d["picks"] = json.loads(d["picks"])
        d["pickOrder"] = json.loads(d["pickOrder"])
        if d.get("combos"):
            d["combos"] = json.loads(d["combos"])
        drafts.append(d)

    scores = []
    for row in conn.execute("SELECT * FROM scores ORDER BY timestamp DESC").fetchall():
        d = dict(row)
        d["values"] = json.loads(d.pop("valuesJson"))
        d["points"] = json.loads(d.pop("pointsJson"))
        d["cardLog"] = json.loads(d["cardLog"]) if d.get("cardLog") else None
        scores.append(d)

    # Wiki data
    wiki_combos = [
        {**dict(row), "cardIds": json.loads(row["cardIds"])}
        for row in conn.execute("SELECT * FROM wiki_combos ORDER BY createdAt DESC").fetchall()
    ]
    wiki_nobos = [
        {**dict(row), "cardIds": json.loads(row["cardIds"])}
        for row in conn.execute("SELECT * FROM wiki_nobos ORDER BY createdAt DESC").fetchall()
    ]
    wiki_tips = [dict(row) for row in conn.execute("SELECT * FROM wiki_tips ORDER BY createdAt DESC").fetchall()]

    conn.close()

    return {
        "version": 2,
        "exportedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "drafts": drafts,
        "scores": scores,
        "wikiCombos": wiki_combos,
        "wikiNobos": wiki_nobos,
        "wikiTips": wiki_tips,
    }


@app.post("/api/restore")
async def restore_data(request: Request):
    """Import drafts, scores, and wiki data from a backup JSON. Skips duplicates by ID."""
    body = await request.json()

    if body.get("version") not in (1, 2):
        return JSONResponse(status_code=400, content={"error": "Unknown backup format"})

    conn = _get_db()
    drafts_added = 0
    scores_added = 0
    wiki_combos_added = 0
    wiki_nobos_added = 0
    wiki_tips_added = 0

    for d in body.get("drafts", []):
        existing = conn.execute("SELECT id FROM drafts WHERE id = ?", (d["id"],)).fetchone()
        if existing:
            continue
        conn.execute(
            "INSERT INTO drafts (id, username, draftType, picks, pickOrder, timestamp, comment, picksHash, combos) VALUES (?,?,?,?,?,?,?,?,?)",
            (d["id"], d.get("username", ""), d.get("draftType", ""),
             json.dumps(d.get("picks", [])), json.dumps(d.get("pickOrder", [])),
             d.get("timestamp", ""), d.get("comment", ""),
             d.get("picksHash", ""), json.dumps(d.get("combos", []))),
        )
        drafts_added += 1

    for s in body.get("scores", []):
        existing = conn.execute("SELECT id FROM scores WHERE id = ?", (s["id"],)).fetchone()
        if existing:
            continue
        conn.execute(
            "INSERT INTO scores (id, name, tournament, tableNumber, gameNumber, startingPosition, valuesJson, pointsJson, total, timestamp, cardLog) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (s["id"], s.get("name", ""), s.get("tournament"),
             s.get("tableNumber"), s.get("gameNumber"), s.get("startingPosition"),
             json.dumps(s.get("values", {})), json.dumps(s.get("points", {})),
             s.get("total", 0), s.get("timestamp", ""),
             json.dumps(s["cardLog"]) if s.get("cardLog") else None),
        )
        scores_added += 1

    # Wiki data (version 2+)
    for wc in body.get("wikiCombos", []):
        existing = conn.execute("SELECT id FROM wiki_combos WHERE id = ?", (wc["id"],)).fetchone()
        if existing:
            continue
        conn.execute(
            "INSERT INTO wiki_combos (id, cardIds, comment, submittedBy, createdAt) VALUES (?,?,?,?,?)",
            (wc["id"], json.dumps(wc.get("cardIds", [])), wc.get("comment", ""),
             wc.get("submittedBy", ""), wc.get("createdAt", "")),
        )
        wiki_combos_added += 1

    for wn in body.get("wikiNobos", []):
        existing = conn.execute("SELECT id FROM wiki_nobos WHERE id = ?", (wn["id"],)).fetchone()
        if existing:
            continue
        conn.execute(
            "INSERT INTO wiki_nobos (id, cardIds, comment, submittedBy, createdAt) VALUES (?,?,?,?,?)",
            (wn["id"], json.dumps(wn.get("cardIds", [])), wn.get("comment", ""),
             wn.get("submittedBy", ""), wn.get("createdAt", "")),
        )
        wiki_nobos_added += 1

    for wt in body.get("wikiTips", []):
        existing = conn.execute("SELECT id FROM wiki_tips WHERE id = ?", (wt["id"],)).fetchone()
        if existing:
            continue
        conn.execute(
            "INSERT INTO wiki_tips (id, cardId, tip, submittedBy, createdAt) VALUES (?,?,?,?,?)",
            (wt["id"], wt.get("cardId", ""), wt.get("tip", ""),
             wt.get("submittedBy", ""), wt.get("createdAt", "")),
        )
        wiki_tips_added += 1

    conn.commit()
    conn.close()
    return {
        "ok": True, "draftsAdded": drafts_added, "scoresAdded": scores_added,
        "wikiCombosAdded": wiki_combos_added, "wikiNobosAdded": wiki_nobos_added,
        "wikiTipsAdded": wiki_tips_added,
    }


# ── Card OCR via Claude Vision ────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Pre-build the card name list once (used as context for Claude)
_ALL_CARD_NAMES: list[str] = [c["name"] for c in ALL_CARDS]

@app.post("/api/ocr-cards")
async def ocr_cards(request: Request):
    """Accept a photo (as base64 data-URI), ask Claude Vision to identify Agricola card names."""
    if not ANTHROPIC_API_KEY:
        return JSONResponse(status_code=500, content={"error": "ANTHROPIC_API_KEY not configured on server"})

    body = await request.json()
    image_data: str = body.get("image", "")      # data:image/jpeg;base64,... or raw base64

    # Strip data-URI prefix if present
    if image_data.startswith("data:"):
        # "data:image/jpeg;base64,/9j/..."
        header, _, b64 = image_data.partition(",")
        media_type = header.split(";")[0].replace("data:", "")
    else:
        b64 = image_data
        media_type = "image/jpeg"

    if not b64:
        return JSONResponse(status_code=400, content={"error": "no image data"})

    # Build the card name reference (send the full list so Claude can match precisely)
    card_names_str = "\n".join(_ALL_CARD_NAMES)

    prompt = (
        "You are looking at a photo of one or more Agricola board game cards. "
        "Identify the NAME of every card visible in the photo. "
        "Return ONLY the card names, one per line, nothing else. "
        "No numbering, no bullets, no explanations. "
        "Match names exactly from this reference list:\n\n"
        f"{card_names_str}"
    )

    try:
        client = await _get_http_client()
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 512,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }],
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()

        # Extract text from Claude's response
        reply_text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                reply_text += block["text"]

        # Parse card names from reply
        lines = [l.strip() for l in reply_text.strip().split("\n") if l.strip()]

        # Match each returned name against our card database
        name_to_card = {c["name"].lower(): c for c in ALL_CARDS}
        results = []
        seen_ids = set()
        for line in lines:
            line_lower = line.lower().strip().rstrip(".")
            # Try exact match first
            card = name_to_card.get(line_lower)
            if not card:
                # Fuzzy: find closest card name
                best, best_score = None, 0
                for cname, cobj in name_to_card.items():
                    # Simple containment + length similarity
                    if cname in line_lower or line_lower in cname:
                        score = min(len(cname), len(line_lower)) / max(len(cname), len(line_lower))
                        if score > best_score:
                            best_score = score
                            best = cobj
                card = best
            if card and card["id"] not in seen_ids:
                seen_ids.add(card["id"])
                results.append({
                    "cardId": card["id"],
                    "name": card["name"],
                    "ocrLine": line,
                    "confidence": 1.0 if card["name"].lower() == line_lower else 0.85,
                })

        return {"cards": results}

    except httpx.HTTPStatusError as e:
        err_body = e.response.text[:500] if hasattr(e.response, "text") else str(e)
        return JSONResponse(status_code=e.response.status_code, content={"error": f"Claude API error: {err_body}"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"OCR failed: {str(e)}"})


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

# ── Live Rooms API ────────────────────────────────────────────────────────────

import random as _random
import string as _string

def _generate_room_code(length=6):
    """Generate a short uppercase room code."""
    return "".join(_random.choices(_string.ascii_uppercase + _string.digits, k=length))


def _build_draft_packs(deck_selection: list[str], norway_only: bool, seed: int, num_players: int):
    """Build draft packs for a live room using the same logic as the solo drafter."""
    rng = _random.Random(seed)
    eligible = [c for c in ALL_CARDS if not c.get("banned")]
    if norway_only:
        eligible = [c for c in eligible if c.get("isNo")]
    if deck_selection:
        eligible = [c for c in eligible if c.get("deck") in deck_selection]
    occs = [c for c in eligible if c["type"] == "Occupation"]
    minors = [c for c in eligible if c["type"] == "MinorImprovement"]
    rng.shuffle(occs)
    rng.shuffle(minors)
    pack_size = 9  # Always 9 cards per pack — pick 7, discard 2
    occ_packs = []
    minor_packs = []
    for p in range(num_players):
        occ_packs.append([c["id"] for c in occs[p * pack_size:(p + 1) * pack_size]])
        minor_packs.append([c["id"] for c in minors[p * pack_size:(p + 1) * pack_size]])
    return occ_packs, minor_packs


class CreateRoomRequest(BaseModel):
    username: str
    maxPlayers: int = 5
    deckSelection: list[str] = []
    norwayOnly: bool = True


class JoinRoomRequest(BaseModel):
    username: str


class PickCardRequest(BaseModel):
    cardId: str


@app.post("/api/rooms")
def create_room(req: CreateRoomRequest):
    """Create a new live draft room."""
    if not req.username.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    if req.maxPlayers < 1 or req.maxPlayers > 5:
        return JSONResponse(status_code=400, content={"error": "1-5 players allowed"})

    conn = _get_db()
    # Generate unique code
    for _ in range(20):
        code = _generate_room_code()
        existing = conn.execute("SELECT code FROM rooms WHERE code = ?", (code,)).fetchone()
        if not existing:
            break
    else:
        conn.close()
        return JSONResponse(status_code=500, content={"error": "could not generate unique room code"})

    ts = datetime.datetime.utcnow().isoformat() + "Z"
    seed = _random.randint(0, 2**31)
    conn.execute(
        """INSERT INTO rooms (code, phase, creatorName, maxPlayers, deckSelection, norwayOnly, seed, createdAt)
           VALUES (?,?,?,?,?,?,?,?)""",
        (code, "lobby", req.username.strip(), req.maxPlayers,
         json.dumps(req.deckSelection), 1 if req.norwayOnly else 0, seed, ts)
    )
    # Creator takes seat 0
    conn.execute(
        "INSERT INTO room_players (roomCode, seat, username) VALUES (?,?,?)",
        (code, 0, req.username.strip())
    )
    conn.commit()
    conn.close()
    return {"ok": True, "code": code, "seat": 0}


@app.post("/api/rooms/{code}/join")
def join_room(code: str, req: JoinRoomRequest):
    """Join an existing room."""
    if not req.username.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "room not found"})
    if room["phase"] != "lobby":
        # Allow rejoin if player is already in room
        existing = conn.execute(
            "SELECT seat FROM room_players WHERE roomCode = ? AND username = ?",
            (code.upper(), req.username.strip())
        ).fetchone()
        if existing:
            conn.close()
            return {"ok": True, "code": code.upper(), "seat": existing["seat"], "rejoined": True}
        conn.close()
        return JSONResponse(status_code=400, content={"error": "draft already started"})

    # Check if already in room
    existing = conn.execute(
        "SELECT seat FROM room_players WHERE roomCode = ? AND username = ?",
        (code.upper(), req.username.strip())
    ).fetchone()
    if existing:
        conn.close()
        return {"ok": True, "code": code.upper(), "seat": existing["seat"], "rejoined": True}

    # Find next available seat
    players = conn.execute(
        "SELECT seat FROM room_players WHERE roomCode = ? ORDER BY seat", (code.upper(),)
    ).fetchall()
    taken = {p["seat"] for p in players}
    if len(taken) >= room["maxPlayers"]:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "room is full"})
    seat = next(s for s in range(room["maxPlayers"]) if s not in taken)
    conn.execute(
        "INSERT INTO room_players (roomCode, seat, username) VALUES (?,?,?)",
        (code.upper(), seat, req.username.strip())
    )
    conn.commit()
    conn.close()
    return {"ok": True, "code": code.upper(), "seat": seat}


@app.get("/api/rooms/{code}/state")
def room_state(code: str, seat: int = -1):
    """Poll the current room state. Pass seat= to get your private hand/pack."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "room not found"})

    players = conn.execute(
        "SELECT seat, username, hand, playedCards, discardedCards, currentPick, connected FROM room_players WHERE roomCode = ? ORDER BY seat",
        (code.upper(),)
    ).fetchall()

    player_list = []
    my_hand = []
    my_pack = []
    picks_this_round = []
    for p in players:
        hand = json.loads(p["hand"])
        played = json.loads(p["playedCards"])
        discarded = json.loads(p["discardedCards"])
        has_picked = p["currentPick"] is not None
        picks_this_round.append(has_picked)

        info = {
            "seat": p["seat"],
            "username": p["username"],
            "handSize": len(hand),
            "playedCards": played,
            "discardedCards": discarded,
            "hasPicked": has_picked,
            "connected": bool(p["connected"]),
        }
        # Only reveal hand to the player themselves
        if p["seat"] == seat:
            info["hand"] = hand
            my_hand = hand
        player_list.append(info)

    # Current pack for this player during draft
    packs = json.loads(room["packs"] or "[]")
    if room["phase"] == "drafting" and 0 <= seat < len(packs):
        my_pack = packs[seat]

    # Card lookup for pack display
    cards_in_pack = [_CARDS_BY_ID_WIKI.get(cid) for cid in my_pack if _CARDS_BY_ID_WIKI.get(cid)]

    all_picked = all(picks_this_round) and len(picks_this_round) > 0

    # Build play-round map from log: { cardId: round } for all played cards
    play_rounds = {}
    if room["phase"] == "playing":
        log_rows = conn.execute(
            "SELECT data FROM room_log WHERE roomCode = ? AND action = 'play'",
            (code.upper(),)
        ).fetchall()
        for lr in log_rows:
            d = json.loads(lr["data"])
            if "cardId" in d and "round" in d:
                play_rounds[d["cardId"]] = d["round"]

    conn.close()
    return {
        "code": code.upper(),
        "phase": room["phase"],
        "creatorName": room["creatorName"],
        "maxPlayers": room["maxPlayers"],
        "norwayOnly": bool(room["norwayOnly"]),
        "deckSelection": json.loads(room["deckSelection"]),
        "draftRound": room["draftRound"],
        "draftPhase": room["draftPhase"],
        "gameRound": room["gameRound"],
        "roundCards": json.loads(room["roundCards"] or "[]"),
        "players": player_list,
        "myPack": cards_in_pack,
        "allPicked": all_picked,
        "playRounds": play_rounds,
    }


@app.post("/api/rooms/{code}/start")
def start_draft(code: str):
    """Creator starts the draft — generates packs and moves to drafting phase."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "room not found"})
    if room["phase"] != "lobby":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "draft already started"})

    players = conn.execute(
        "SELECT seat FROM room_players WHERE roomCode = ?", (code.upper(),)
    ).fetchall()
    num_players = len(players)
    if num_players < 1:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "need at least 1 player"})

    deck_sel = json.loads(room["deckSelection"])
    occ_packs, minor_packs = _build_draft_packs(
        deck_sel, bool(room["norwayOnly"]), room["seed"], num_players
    )

    # Store occ packs as current packs, save minor packs in settings for later
    settings = json.loads(room["settings"] or "{}")
    settings["minorPacks"] = minor_packs

    conn.execute(
        """UPDATE rooms SET phase = 'drafting', draftRound = 1, draftPhase = 'occ',
           packs = ?, settings = ? WHERE code = ?""",
        (json.dumps(occ_packs), json.dumps(settings), code.upper())
    )
    conn.commit()
    conn.close()
    return {"ok": True, "numPlayers": num_players}


@app.post("/api/rooms/{code}/pick")
def pick_card(code: str, req: PickCardRequest, seat: int = 0):
    """Player picks a card from their current pack."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "room not found"})
    if room["phase"] != "drafting":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in drafting phase"})

    packs = json.loads(room["packs"])
    if seat < 0 or seat >= len(packs):
        conn.close()
        return JSONResponse(status_code=400, content={"error": "invalid seat"})

    # Verify card is in this player's pack
    if req.cardId not in packs[seat]:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "card not in your pack"})

    # Check if player already picked this round
    player = conn.execute(
        "SELECT currentPick FROM room_players WHERE roomCode = ? AND seat = ?",
        (code.upper(), seat)
    ).fetchone()
    if player and player["currentPick"]:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "already picked this round"})

    # Record the pick
    conn.execute(
        "UPDATE room_players SET currentPick = ? WHERE roomCode = ? AND seat = ?",
        (req.cardId, code.upper(), seat)
    )
    conn.commit()

    # Check if ALL players have picked
    all_players = conn.execute(
        "SELECT seat, currentPick, hand FROM room_players WHERE roomCode = ? ORDER BY seat",
        (code.upper(),)
    ).fetchall()
    all_picked = all(p["currentPick"] for p in all_players)

    if all_picked:
        # Process the round: add picks to hands, remove from packs, rotate
        for p in all_players:
            hand = json.loads(p["hand"])
            hand.append(p["currentPick"])
            packs[p["seat"]] = [cid for cid in packs[p["seat"]] if cid != p["currentPick"]]
            conn.execute(
                "UPDATE room_players SET hand = ?, currentPick = NULL WHERE roomCode = ? AND seat = ?",
                (json.dumps(hand), code.upper(), p["seat"])
            )

        num_players = len(all_players)
        current_round = room["draftRound"]

        # Rotate packs: each player gets the next player's pack
        rotated = [packs[(i + 1) % num_players] for i in range(num_players)]

        if current_round >= 7:
            # Phase complete
            if room["draftPhase"] == "occ":
                # Switch to minor improvement draft
                settings = json.loads(room["settings"] or "{}")
                minor_packs = settings.get("minorPacks", [])
                conn.execute(
                    """UPDATE rooms SET draftRound = 1, draftPhase = 'minor',
                       packs = ? WHERE code = ?""",
                    (json.dumps(minor_packs), code.upper())
                )
            else:
                # Draft complete → playing phase
                conn.execute(
                    "UPDATE rooms SET phase = 'playing', packs = '[]' WHERE code = ?",
                    (code.upper(),)
                )
        else:
            # Next round
            conn.execute(
                "UPDATE rooms SET draftRound = ?, packs = ? WHERE code = ?",
                (current_round + 1, json.dumps(rotated), code.upper())
            )
        conn.commit()

    conn.close()
    return {"ok": True, "allPicked": all_picked}


@app.post("/api/rooms/{code}/play")
def play_card(code: str, req: PickCardRequest, seat: int = 0):
    """Player plays a card from their hand during the game phase."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room or room["phase"] != "playing":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in playing phase"})

    player = conn.execute(
        "SELECT hand, playedCards FROM room_players WHERE roomCode = ? AND seat = ?",
        (code.upper(), seat)
    ).fetchone()
    if not player:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "player not found"})

    hand = json.loads(player["hand"])
    if req.cardId not in hand:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "card not in your hand"})

    hand.remove(req.cardId)
    played = json.loads(player["playedCards"])
    played.append(req.cardId)

    conn.execute(
        "UPDATE room_players SET hand = ?, playedCards = ? WHERE roomCode = ? AND seat = ?",
        (json.dumps(hand), json.dumps(played), code.upper(), seat)
    )
    # Log the action with current game round
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    card_name = _CARDS_BY_ID_WIKI.get(req.cardId, {}).get("name", req.cardId)
    conn.execute(
        "INSERT INTO room_log (roomCode, action, seat, data, timestamp) VALUES (?,?,?,?,?)",
        (code.upper(), "play", seat, json.dumps({"cardId": req.cardId, "name": card_name, "round": room["gameRound"]}), ts)
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/rooms/{code}/round")
def set_game_round(code: str, round: int = 1):
    """Set the current game round (1-14 in Agricola)."""
    if round < 0 or round > 14:
        return JSONResponse(status_code=400, content={"error": "round must be 0-14"})
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room or room["phase"] != "playing":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in playing phase"})
    conn.execute("UPDATE rooms SET gameRound = ? WHERE code = ?", (round, code.upper()))
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO room_log (roomCode, action, seat, data, timestamp) VALUES (?,?,?,?,?)",
        (code.upper(), "round", -1, json.dumps({"round": round}), ts)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "round": round}


@app.post("/api/rooms/{code}/discard")
def discard_card(code: str, req: PickCardRequest, seat: int = 0):
    """Discard a card from hand or played cards."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room or room["phase"] != "playing":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in playing phase"})

    player = conn.execute(
        "SELECT hand, playedCards, discardedCards FROM room_players WHERE roomCode = ? AND seat = ?",
        (code.upper(), seat)
    ).fetchone()
    if not player:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "player not found"})

    hand = json.loads(player["hand"])
    played = json.loads(player["playedCards"])
    discarded = json.loads(player["discardedCards"])

    if req.cardId in hand:
        hand.remove(req.cardId)
    elif req.cardId in played:
        played.remove(req.cardId)
    else:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "card not found in hand or played"})

    discarded.append(req.cardId)
    conn.execute(
        "UPDATE room_players SET hand = ?, playedCards = ?, discardedCards = ? WHERE roomCode = ? AND seat = ?",
        (json.dumps(hand), json.dumps(played), json.dumps(discarded), code.upper(), seat)
    )
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO room_log (roomCode, action, seat, data, timestamp) VALUES (?,?,?,?,?)",
        (code.upper(), "discard", seat, json.dumps({"cardId": req.cardId}), ts)
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/rooms/{code}/draw")
def draw_cards(code: str, seat: int = 0, cardType: str = "Occupation", count: int = 1):
    """Draw new random cards (for Broom-type effects)."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room or room["phase"] != "playing":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in playing phase"})

    player = conn.execute(
        "SELECT hand FROM room_players WHERE roomCode = ? AND seat = ?",
        (code.upper(), seat)
    ).fetchone()
    if not player:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "player not found"})

    # Gather all cards already in the room (all players' hands, played, discarded)
    all_room_players = conn.execute(
        "SELECT hand, playedCards, discardedCards FROM room_players WHERE roomCode = ?",
        (code.upper(),)
    ).fetchall()
    used_ids = set()
    for rp in all_room_players:
        used_ids.update(json.loads(rp["hand"]))
        used_ids.update(json.loads(rp["playedCards"]))
        used_ids.update(json.loads(rp["discardedCards"]))

    # Find eligible cards not already in the room
    eligible = [c for c in ALL_CARDS if c["type"] == cardType and c["id"] not in used_ids and not c.get("banned")]
    if bool(room["norwayOnly"]):
        eligible = [c for c in eligible if c.get("isNo")]
    deck_sel = json.loads(room["deckSelection"])
    if deck_sel:
        eligible = [c for c in eligible if c.get("deck") in deck_sel]

    rng = _random.Random()
    rng.shuffle(eligible)
    drawn = [c["id"] for c in eligible[:count]]

    hand = json.loads(player["hand"])
    hand.extend(drawn)
    conn.execute(
        "UPDATE room_players SET hand = ? WHERE roomCode = ? AND seat = ?",
        (json.dumps(hand), code.upper(), seat)
    )
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO room_log (roomCode, action, seat, data, timestamp) VALUES (?,?,?,?,?)",
        (code.upper(), "draw", seat, json.dumps({"drawn": drawn, "type": cardType}), ts)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "drawn": drawn}


@app.post("/api/rooms/{code}/pass-minor")
def pass_minor(code: str, req: PickCardRequest, seat: int = 0):
    """Pass a played minor improvement to the next player in turn order."""
    conn = _get_db()
    room = conn.execute("SELECT * FROM rooms WHERE code = ?", (code.upper(),)).fetchone()
    if not room or room["phase"] != "playing":
        conn.close()
        return JSONResponse(status_code=400, content={"error": "not in playing phase"})

    players = conn.execute(
        "SELECT seat, hand, playedCards FROM room_players WHERE roomCode = ? ORDER BY seat",
        (code.upper(),)
    ).fetchall()
    num_players = len(players)

    player = next((p for p in players if p["seat"] == seat), None)
    if not player:
        conn.close()
        return JSONResponse(status_code=404, content={"error": "player not found"})

    played = json.loads(player["playedCards"])
    if req.cardId not in played:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "card not in your played cards"})

    # Remove from played, add to next player's hand
    played.remove(req.cardId)
    next_seat = (seat + 1) % num_players
    next_player = next((p for p in players if p["seat"] == next_seat), None)
    if not next_player:
        conn.close()
        return JSONResponse(status_code=400, content={"error": "next player not found"})

    next_hand = json.loads(next_player["hand"])
    next_hand.append(req.cardId)

    conn.execute(
        "UPDATE room_players SET playedCards = ? WHERE roomCode = ? AND seat = ?",
        (json.dumps(played), code.upper(), seat)
    )
    conn.execute(
        "UPDATE room_players SET hand = ? WHERE roomCode = ? AND seat = ?",
        (json.dumps(next_hand), code.upper(), next_seat)
    )
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    card_name = _CARDS_BY_ID_WIKI.get(req.cardId, {}).get("name", req.cardId)
    conn.execute(
        "INSERT INTO room_log (roomCode, action, seat, data, timestamp) VALUES (?,?,?,?,?)",
        (code.upper(), "pass_minor", seat,
         json.dumps({"cardId": req.cardId, "name": card_name, "toSeat": next_seat}), ts)
    )
    conn.commit()
    conn.close()
    return {"ok": True, "passedTo": next_seat}


@app.get("/api/rooms/{code}/log")
def room_log(code: str, since: int = 0):
    """Get the action log for a room (for spectator view and history)."""
    conn = _get_db()
    rows = conn.execute(
        "SELECT id, action, seat, data, timestamp FROM room_log WHERE roomCode = ? AND id > ? ORDER BY id",
        (code.upper(), since)
    ).fetchall()
    conn.close()
    return {
        "log": [{"id": r["id"], "action": r["action"], "seat": r["seat"],
                 "data": json.loads(r["data"]), "timestamp": r["timestamp"]} for r in rows]
    }


# ── Card Wiki API ─────────────────────────────────────────────────────────────

_CARDS_BY_ID_WIKI: dict[str, dict] = {c["id"]: c for c in ALL_CARDS}

class WikiComboRequest(BaseModel):
    cardIds: list[str]    # 2+ card IDs
    comment: str = ""
    submittedBy: str

class WikiTipRequest(BaseModel):
    cardId: str
    tip: str
    submittedBy: str


def _community_combos_for_card(conn, card_id: str) -> list[dict]:
    """Fetch combos from saved hands (drafts + challenge_attempts) that mention card_id."""
    results = []
    seen = set()
    for table, user_col in [("drafts", "username"), ("challenge_attempts", "challengerName")]:
        rows = conn.execute(f"SELECT {user_col}, combos FROM {table} WHERE combos LIKE ?",
                            (f'%{card_id}%',)).fetchall()
        for row in rows:
            combos = json.loads(row["combos"] or "[]")
            for combo in combos:
                cids = combo.get("cardIds", [])
                if card_id in cids and len(cids) >= 2:
                    key = tuple(sorted(cids)) + (combo.get("comment", ""),)
                    if key not in seen:
                        seen.add(key)
                        results.append({
                            "cardIds": cids,
                            "comment": combo.get("comment", ""),
                            "submittedBy": row[user_col],
                            "source": "hand",
                        })
    return results


@app.get("/api/wiki/cards/{card_id}")
def wiki_card_detail(card_id: str):
    """Full wiki page data for one card: combos, nobos, tips, hand combos."""
    card = _CARDS_BY_ID_WIKI.get(card_id)
    if not card:
        return JSONResponse(status_code=404, content={"error": "Card not found"})
    conn = _get_db()

    # Community-submitted combos
    wiki_combo_rows = conn.execute(
        "SELECT id, cardIds, comment, submittedBy, createdAt FROM wiki_combos"
    ).fetchall()
    wiki_combos = []
    for r in wiki_combo_rows:
        cids = json.loads(r["cardIds"])
        if card_id in cids:
            wiki_combos.append({
                "id": r["id"], "cardIds": cids, "comment": r["comment"],
                "submittedBy": r["submittedBy"], "createdAt": r["createdAt"],
                "source": "wiki",
            })

    # Combos from saved hands
    hand_combos = _community_combos_for_card(conn, card_id)

    # Anti-combos (nobos)
    nobo_rows = conn.execute(
        "SELECT id, cardIds, comment, submittedBy, createdAt FROM wiki_nobos"
    ).fetchall()
    nobos = []
    for r in nobo_rows:
        cids = json.loads(r["cardIds"])
        if card_id in cids:
            nobos.append({
                "id": r["id"], "cardIds": cids, "comment": r["comment"],
                "submittedBy": r["submittedBy"], "createdAt": r["createdAt"],
            })

    # Tips
    tips = [
        {"id": r["id"], "tip": r["tip"], "submittedBy": r["submittedBy"], "createdAt": r["createdAt"]}
        for r in conn.execute(
            "SELECT id, tip, submittedBy, createdAt FROM wiki_tips WHERE cardId = ? ORDER BY createdAt DESC",
            (card_id,)
        ).fetchall()
    ]

    conn.close()
    return {
        "card": card,
        "wikiCombos": wiki_combos,
        "handCombos": hand_combos,
        "nobos": nobos,
        "tips": tips,
    }


@app.post("/api/wiki/combos")
def create_wiki_combo(req: WikiComboRequest):
    if not req.submittedBy.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    if len(req.cardIds) < 2:
        return JSONResponse(status_code=400, content={"error": "combo needs at least 2 cards"})
    # Validate card IDs exist
    for cid in req.cardIds:
        if cid not in _CARDS_BY_ID_WIKI:
            return JSONResponse(status_code=400, content={"error": f"unknown card: {cid}"})
    conn = _get_db()
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO wiki_combos (cardIds, comment, submittedBy, createdAt) VALUES (?,?,?,?)",
        (json.dumps(sorted(req.cardIds)), (req.comment or "").strip()[:300], req.submittedBy.strip(), ts)
    )
    conn.commit()
    combo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"ok": True, "id": combo_id}


@app.post("/api/wiki/nobos")
def create_wiki_nobo(req: WikiComboRequest):
    if not req.submittedBy.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    if len(req.cardIds) < 2:
        return JSONResponse(status_code=400, content={"error": "nobo needs at least 2 cards"})
    for cid in req.cardIds:
        if cid not in _CARDS_BY_ID_WIKI:
            return JSONResponse(status_code=400, content={"error": f"unknown card: {cid}"})
    conn = _get_db()
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO wiki_nobos (cardIds, comment, submittedBy, createdAt) VALUES (?,?,?,?)",
        (json.dumps(sorted(req.cardIds)), (req.comment or "").strip()[:300], req.submittedBy.strip(), ts)
    )
    conn.commit()
    nobo_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"ok": True, "id": nobo_id}


@app.post("/api/wiki/tips")
def create_wiki_tip(req: WikiTipRequest):
    if not req.submittedBy.strip():
        return JSONResponse(status_code=400, content={"error": "username required"})
    if not req.tip.strip():
        return JSONResponse(status_code=400, content={"error": "tip text required"})
    if req.cardId not in _CARDS_BY_ID_WIKI:
        return JSONResponse(status_code=400, content={"error": "unknown card"})
    conn = _get_db()
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    conn.execute(
        "INSERT INTO wiki_tips (cardId, tip, submittedBy, createdAt) VALUES (?,?,?,?)",
        (req.cardId, req.tip.strip()[:1000], req.submittedBy.strip(), ts)
    )
    conn.commit()
    tip_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return {"ok": True, "id": tip_id}


@app.get("/api/wiki/stats")
def wiki_stats():
    """Return combo/nobo/tip counts per card for the wiki list view."""
    conn = _get_db()
    # Count wiki combos per card
    combo_counts: dict[str, int] = {}
    for row in conn.execute("SELECT cardIds FROM wiki_combos").fetchall():
        for cid in json.loads(row["cardIds"]):
            combo_counts[cid] = combo_counts.get(cid, 0) + 1
    # Count hand combos per card
    hand_combo_counts: dict[str, int] = {}
    for table in ["drafts", "challenge_attempts"]:
        for row in conn.execute(f"SELECT combos FROM {table} WHERE combos != '[]'").fetchall():
            seen_in_row = set()
            for combo in json.loads(row["combos"] or "[]"):
                for cid in combo.get("cardIds", []):
                    if cid not in seen_in_row:
                        seen_in_row.add(cid)
                        hand_combo_counts[cid] = hand_combo_counts.get(cid, 0) + 1
    # Count nobos per card
    nobo_counts: dict[str, int] = {}
    for row in conn.execute("SELECT cardIds FROM wiki_nobos").fetchall():
        for cid in json.loads(row["cardIds"]):
            nobo_counts[cid] = nobo_counts.get(cid, 0) + 1
    # Count tips per card
    tip_counts: dict[str, int] = {}
    for row in conn.execute("SELECT cardId, COUNT(*) as cnt FROM wiki_tips GROUP BY cardId").fetchall():
        tip_counts[row["cardId"]] = row["cnt"]
    conn.close()
    return {
        "comboCounts": combo_counts,
        "handComboCounts": hand_combo_counts,
        "noboCounts": nobo_counts,
        "tipCounts": tip_counts,
    }


# ── Linked Data: dereferenceable IRIs ────────────────────────────────────────

try:
    import linked_data as ld
except ModuleNotFoundError:
    from backend import linked_data as ld

# Pre-build lookups for Linked Data pages
_CARDS_BY_ID: dict[str, dict] = {c["id"]: c for c in ALL_CARDS}

# Build deck metadata from ontology for the docs page
_DECK_INFO: list[dict] = []
for code, iri in sorted(de.DECK_CODE_TO_IRI.items(), key=lambda x: x[1]):
    local = iri.replace(de.ns, "")
    # Read metadata from ontology data embedded in the cards
    _DECK_INFO.append({
        "local": local,
        "code": code,
        "label": local.replace("deck_", "").replace("Revised", "Revised "),
        "description": "",
        "year": None,
        "publisher": "",
        "compatible": [],
    })

# Enrich deck info from the ontology.ttl (parsed by maplib)
try:
    _deck_q = model.query("""
        PREFIX : <http://agricola.veronahe.no/>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?deck ?label ?code ?desc ?year ?pub ?compat WHERE {
            ?deck a :Deck .
            OPTIONAL { ?deck rdfs:label ?label }
            OPTIONAL { ?deck :deckCode ?code }
            OPTIONAL { ?deck :description ?desc }
            OPTIONAL { ?deck :year ?year }
            OPTIONAL { ?deck :publisher ?pub }
            OPTIONAL { ?deck :compatibleWith ?compat }
        }
    """)
    _deck_meta: dict[str, dict] = {}
    for row in _deck_q.iter_rows(named=True):
        deck_iri = str(row.get("deck", "")).strip("<>")
        local = deck_iri.replace(de.ns, "")
        if local not in _deck_meta:
            _deck_meta[local] = {
                "local": local,
                "code": str(row.get("code", "") or ""),
                "label": str(row.get("label", "") or local).strip('"').split('"')[0],
                "description": str(row.get("desc", "") or "").strip('"').split('"')[0],
                "year": None,
                "publisher": str(row.get("pub", "") or "").strip('"').split('"')[0],
                "compatible": [],
            }
            try:
                _deck_meta[local]["year"] = int(float(str(row.get("year", "") or "0")))
            except (ValueError, TypeError):
                pass
        compat_iri = str(row.get("compat", "") or "").strip("<>").replace(de.ns, "")
        if compat_iri and compat_iri not in _deck_meta[local]["compatible"]:
            _deck_meta[local]["compatible"].append(compat_iri)
    _DECK_INFO = sorted(_deck_meta.values(), key=lambda d: (d.get("year") or 9999, d["code"]))
    print(f"  {len(_DECK_INFO)} deck instances loaded for Linked Data.")
except Exception as e:
    print(f"  Warning: could not query deck metadata: {e}")

_DECK_BY_LOCAL: dict[str, dict] = {d["local"]: d for d in _DECK_INFO}

# Pre-generate ontology page (static, only changes at deploy)
print("Building ontology documentation page …")
_ONTOLOGY_HTML = ld.build_ontology_page(ALL_CARDS, _DECK_INFO)
print("  Ontology page ready.")

print("Building about page …")
_ABOUT_HTML = ld.build_about_page(len(ALL_CARDS), len(_DECK_INFO))
print("  About page ready.")


def _wants_turtle(request: Request) -> bool:
    """Check if the client prefers Turtle over HTML."""
    accept = request.headers.get("accept", "")
    fmt = request.query_params.get("format", "")
    return fmt == "turtle" or "text/turtle" in accept


@app.get("/about")
def about_page():
    return HTMLResponse(_ABOUT_HTML)


@app.get("/ontology")
def ontology_page(request: Request):
    if _wants_turtle(request):
        ont_path = os.path.join(PROJECT_ROOT, "ontology.ttl")
        with open(ont_path, "r") as f:
            return Response(content=f.read(), media_type="text/turtle")
    return HTMLResponse(_ONTOLOGY_HTML)


@app.get("/cards")
@app.get("/occupations")
@app.get("/minor-improvements")
@app.get("/major-improvements")
@app.get("/decks")
def category_page(request: Request):
    slug = request.url.path.lstrip("/")
    html = ld.build_category_page(slug, ALL_CARDS, _DECK_INFO)
    return HTMLResponse(html)


@app.get("/deck_{code:path}")
def deck_page(code: str, request: Request):
    local = f"deck_{code}"
    deck = _DECK_BY_LOCAL.get(local)
    if not deck:
        return JSONResponse(status_code=404, content={"error": "Deck not found"})
    cards_in_deck = [c for c in ALL_CARDS if c["deck"] == deck["code"]]
    if _wants_turtle(request):
        # Return relevant triples from the model
        ttl = model.writes(format="turtle")
        # Filter to just this deck's triples (simple approach)
        return Response(content=ttl, media_type="text/turtle")
    html = ld.build_deck_page(deck, cards_in_deck)
    return HTMLResponse(html)


# ── Serve static frontend (after build) ─────────────────────────────────────

DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "ui", "dist")

# UUID regex for card IRIs
import re as _re
_UUID_RE = _re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

IMG_DIR = os.path.join(os.path.dirname(__file__), "..", "img")
if os.path.isdir(IMG_DIR):
    app.mount("/img", StaticFiles(directory=IMG_DIR), name="card-images")

if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str, request: Request):
        # Card IRI: if path is a UUID, serve the card page
        if _UUID_RE.match(full_path):
            card = _CARDS_BY_ID.get(full_path)
            if card:
                if _wants_turtle(request):
                    return Response(content=ld.card_to_turtle(card), media_type="text/turtle")
                return HTMLResponse(ld.build_card_page(card, _CARDS_BY_ID))

        # Try exact file first, then fallback to index.html (SPA routing)
        file_path = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
