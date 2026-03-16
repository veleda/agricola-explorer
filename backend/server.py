"""
Agricola Knowledge Graph – FastAPI backend.

Endpoints:
  GET  /api/cards              → full card list as JSON (for graph / table)
  POST /api/sparql             → run arbitrary SPARQL, return {columns, rows}
  GET  /api/meta               → gain/affect/deck/type facets for filter chips
  GET  /                       → serve the built React frontend (index.html)
"""

import os
import sys
import time
import json
import hashlib
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

# ── Image proxy (avoids mixed-content blocking) ─────────────────────────────

ALLOWED_IMAGE_HOSTS = {"play-agricola.com", "www.play-agricola.com"}
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
