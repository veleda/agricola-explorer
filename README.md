# Agricola Explorer

A companion web app for the Agricola board game, built for the Norwegian tournament community.

**Live at [agricola.veronahe.no](https://agricola.veronahe.no)**

## Features

- **Card Explorer**: Browse, search, and filter 965 cards in the Norwegian tournament deck. Graph and table views with win rate, play rate, PWR, and ADP statistics from tournament data.
- **Drafter** — Simulate draft sessions against 3 NPC opponents. Supports full drafts (pick 7 from packs of 9) and mini drafts (pick 5 from 100 fixed Norwegian decks), including combo full-draft modes.
- **Community Hands**: Browse and search drafted hands shared by the community. Find twin hands, popular cards, and tagged card combos.
- **Score Sheet**: Mobile-friendly score calculator with all Agricola categories, begging cards, bonus points, and stepper buttons for quick input.
- **Installable PWA**: Add to home screen on mobile for an app-like experience.

## Tech Stack

- **Frontend**: React 18, Vite, inline styles, D3 for graph visualization
- **Backend**: FastAPI, SQLite (WAL mode)
- **Knowledge Graph**: [maplib](https://github.com/DataTreehouse/maplib) with OTTR templates, OWL ontology, and SPARQL queries
- **Data Pipeline**: Polars DataFrames, NLP-based card text extraction for gains/affects/relations
- **Deployment**: Fly.io (Docker)

## Project Structure

```
├── data_engineering.py    # Card data pipeline, RDF construction, combo inference
├── ontology.ttl           # OWL ontology (classes, properties, cost individuals)
├── tpl/tpl.ttl            # OTTR templates for maplib
├── backend/server.py      # FastAPI server, SPARQL endpoint, draft/score APIs
├── ui/
│   ├── app.jsx            # Main app, explorer, mobile home screen
│   ├── drafter.jsx        # Draft simulator (full, mini, combo modes)
│   ├── hands.jsx          # Community hands browser
│   ├── scoresheet.jsx     # Score calculator
│   └── public/            # PWA manifest, icons, service worker
├── data/                  # Source data (cards.json, tournament CSV, database XLSX)
├── Dockerfile
└── fly.toml
```

## RDF Namespace

All resources use the namespace `http://agricola.veronahe.no/` with proper OWL class and property declarations.

## Development

```bash
# Backend
cd backend && pip install -r requirements.txt && uvicorn server:app --reload

# Frontend
cd ui && npm install && npm run dev
```

## Deploy

```bash
fly deploy
```

---

Vibe-coded with Claude Opus 4.6
