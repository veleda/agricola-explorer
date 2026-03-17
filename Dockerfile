# ── Stage 1: Build the React frontend ────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci
COPY ui/ ./
RUN npm run build

# ── Stage 2: Python backend + built frontend ────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy project files
COPY data_engineering.py .
COPY ontology.ttl .
COPY tpl/ tpl/
COPY data/ data/
COPY backend/ backend/

# Copy built frontend from stage 1
COPY --from=frontend /app/ui/dist ui/dist

# Expose port
EXPOSE 8000

# Start the server
CMD ["python", "-m", "uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
