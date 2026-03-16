# Deploying Agricola Explorer

## Architecture

```
Browser  →  FastAPI (Python)  →  maplib RDF model (in-memory)
            serves React UI       1354 cards, SPARQL engine
```

Single container: the FastAPI backend serves both the API and the built React frontend.

---

## Option A: Fly.io (recommended – free tier available)

### 1. Install the Fly CLI

```bash
# macOS
brew install flyctl

# Linux
curl -L https://fly.io/install.sh | sh

# Windows
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

### 2. Sign up and authenticate

```bash
fly auth signup     # first time
fly auth login      # returning user
```

### 3. Deploy

From the project root (`Agricola/`):

```bash
fly launch          # creates the app, pick a region close to you
fly deploy          # builds the Docker image and deploys
```

That's it. Fly gives you a URL like `https://agricola-explorer.fly.dev`.

### 4. After changes

```bash
cd ui && npm run build    # rebuild frontend if you changed React code
fly deploy                # redeploy
```

---

## Option B: Railway (one-click Docker deploy)

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app), create a new project, and connect the GitHub repo.
3. Railway auto-detects the Dockerfile and deploys.
4. Set the port to `8000` in the Railway service settings if prompted.

---

## Option C: Render

1. Push to GitHub.
2. Go to [render.com](https://render.com) → New Web Service → connect your repo.
3. Choose "Docker" as the environment.
4. Render builds and deploys automatically.

---

## Local development

### Backend

```bash
cd Agricola
pip install -r backend/requirements.txt
python -m uvicorn backend.server:app --reload --port 8000
```

### Frontend (with hot reload)

```bash
cd Agricola/ui
npm install
npm run dev          # starts Vite dev server on :5173, proxies /api to :8000
```

### Production build (local)

```bash
cd ui && npm run build
cd .. && python -m uvicorn backend.server:app --port 8000
# Open http://localhost:8000
```

---

## Docker (local test)

```bash
docker build -t agricola-explorer .
docker run -p 8000:8000 agricola-explorer
# Open http://localhost:8000
```
