# ⚡ Tiradata

> Lightweight, self-hosted observability & SQL query platform.  
> Ingest logs, metrics, and traces — then query them with raw SQL.

---

## Overview

Tiradata is a **vendor-independent** observability core built to run on a single machine with minimal operational overhead. It is designed to teach you how observability actually works internally, bottom-up.

```
SDK / curl
    ↓
Ingestion API (HTTP / Hono)
    ↓
Normaliser + Validator
    ↓
In-Memory Ring Buffer Queue  ←── backpressure
    ↓  (batch flush every 250ms)
SQLite (WAL mode, prepared statements)
    ↓
Query Engine (raw SQL, sandboxed SELECT)
    ↓
React Frontend (Dashboard · Logs · Metrics · Traces · SQL Editor)
```

---

## Tech Stack

| Layer              | Technology                   |
| ------------------ | ---------------------------- |
| Runtime            | [Bun](https://bun.sh)        |
| HTTP Framework     | [Hono](https://hono.dev)     |
| Database           | SQLite (via `bun:sqlite`)    |
| Frontend Framework | React 19 + TypeScript        |
| Build Tool         | Vite 8                       |
| Routing            | TanStack Router (file-based) |
| Data Fetching      | TanStack Query               |
| Charts             | Recharts                     |
| SQL Editor         | Monaco Editor                |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.x
- Node.js ≥ 18 (for Vite dev server via `concurrently`)

### Install

```bash
bun install
```

### Environment Variables

| Variable           | Default                              | Description                             |
| ------------------ | ------------------------------------ | --------------------------------------- |
| `STORE`            | `sqlite`                             | Storage adapter: `sqlite` or `postgres` |
| `DB_PATH`          | `tiradata.db`                        | SQLite database file path               |
| `DATABASE_URL`     | `postgres://localhost:5432/tiradata` | PostgreSQL connection string            |
| `PORT`             | `3000`                               | Backend port                            |
| `TTL_LOGS_DAYS`    | `30`                                 | Log retention in days                   |
| `TTL_METRICS_DAYS` | `90`                                 | Metric retention in days                |
| `TTL_TRACES_DAYS`  | `7`                                  | Trace retention in days                 |

### Run (Development)

```bash
# Start both frontend (Vite :5173) and backend (Bun :3000) concurrently
npm run dev

# Push schema to database (uses STORE env var)
npm run db:push

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

| Service     | URL                   |
| ----------- | --------------------- |
| Frontend    | http://localhost:5173 |
| Backend API | http://localhost:3000 |

### Run Separately

```bash
# Backend only
npm run dev:backend   # bun --watch src/backend/app.ts

# Frontend only
npm run dev:frontend  # vite
```

---

## Project Structure

```
src/
├── backend/
│   ├── app.ts                              # Entry point + graceful shutdown
│   ├── domain/
│   │   ├── types.ts                        # Core domain types
│   │   ├── id.ts                           # crypto.randomUUID() helper
│   │   ├── ring-buffer.ts                  # O(1) ring buffer (backpressure queue)
│   │   └── store.interface.ts              # IStore — shared adapter contract
│   ├── infrastructure/
│   │   ├── db/
│   │   │   ├── schema.sqlite.ts            # Drizzle SQLite table + index definitions
│   │   │   └── schema.pg.ts               # Drizzle PostgreSQL table + index definitions
│   │   ├── http/
│   │   │   └── server.ts                   # Hono routes (ingest, query, admin)
│   │   ├── queue/
│   │   │   └── ingestion-queue.ts          # Async queue → batch DB writes
│   │   ├── sqlite/
│   │   │   └── store.ts                    # SQLiteStore implements IStore (Drizzle)
│   │   ├── postgres/
│   │   │   └── store.ts                    # PostgresStore implements IStore (Drizzle + pg)
│   │   └── store-factory.ts                # Picks adapter from STORE env var
│   └── usecases/
│       └── normalise.ts                    # Payload validation & sanitisation
└── frontend/
    ├── components/
    │   └── Sidebar.tsx                     # Nav sidebar with backend health indicator
    ├── routes/
    │   ├── __root.tsx                      # App shell layout
    │   ├── index.tsx                       # Dashboard
    │   ├── logs.tsx                        # Log Explorer
    │   ├── metrics.tsx                     # Metrics Chart
    │   ├── traces.tsx                      # Trace Viewer
    │   └── query.tsx                       # SQL Editor
    └── utils/
        ├── api.ts                          # Typed API client
        └── format.ts                       # Formatters (timestamps, durations, counts)
```

---

## HTTP API

### Ingestion

```bash
# Ingest a log
curl -X POST http://localhost:3000/api/ingest/log \
  -H 'Content-Type: application/json' \
  -d '{"level":"info","service":"api","message":"user logged in","attributes":{"user_id":"u_1"}}'

# Ingest a metric
curl -X POST http://localhost:3000/api/ingest/metric \
  -H 'Content-Type: application/json' \
  -d '{"name":"http.request.duration","value":142.5,"labels":{"env":"prod"}}'

# Ingest a trace span
curl -X POST http://localhost:3000/api/ingest/trace \
  -H 'Content-Type: application/json' \
  -d '{"trace_id":"t1","span_id":"s1","name":"POST /orders","duration":320}'
```

### Query

```bash
# List logs (supports ?service=&level=&limit=&offset=&from=&to=)
GET /api/logs

# List metrics (supports ?name=&limit=&from=&to=)
GET /api/metrics

# List distinct metric series names
GET /api/metrics/names

# List traces (supports ?trace_id=&limit=&from=&to=)
GET /api/traces

# Execute a SQL SELECT query
POST /api/query/sql
{ "sql": "SELECT level, COUNT(*) FROM logs GROUP BY level" }
```

### Admin

```bash
GET /api/health   # → { status: "ok", time: "..." }
GET /api/stats    # → { logs, metrics, traces, queue, uptime_s }
```

---

## Storage Schema

```sql
CREATE TABLE logs (
  id         TEXT    PRIMARY KEY,
  timestamp  INTEGER NOT NULL,   -- Unix ms
  level      TEXT    NOT NULL,   -- debug | info | warn | error | fatal
  service    TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  attributes TEXT    NOT NULL    -- JSON
);

CREATE TABLE metrics (
  timestamp  INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  value      REAL    NOT NULL,
  labels     TEXT    NOT NULL    -- JSON
);

CREATE TABLE traces (
  trace_id   TEXT    NOT NULL,
  span_id    TEXT    NOT NULL PRIMARY KEY,
  parent_id  TEXT,
  start_time INTEGER NOT NULL,
  duration   INTEGER NOT NULL,   -- ms
  name       TEXT    NOT NULL,
  attributes TEXT    NOT NULL    -- JSON
);
```

**Indexes:** `(timestamp DESC)` on logs and traces, `(name, timestamp DESC)` on metrics, `(trace_id)` on traces.

---

## Performance Design

| Decision                            | Reason                                             |
| ----------------------------------- | -------------------------------------------------- |
| WAL journal mode                    | Non-blocking concurrent reads                      |
| Prepared statements (compiled once) | Avoids re-parsing on every insert                  |
| Batch transactions (up to 500 rows) | Orders-of-magnitude faster than single-row inserts |
| Ring buffer queue (10k capacity)    | HTTP handlers never block on disk I/O              |
| 250ms flush interval                | Balances latency vs throughput                     |
| SELECT-only SQL sandbox             | Safety without a separate query engine             |
| Covering indexes on timestamp       | Fast time-range scans without full-table reads     |

---

## Frontend Pages

| Page             | Route      | Description                                            |
| ---------------- | ---------- | ------------------------------------------------------ |
| **Dashboard**    | `/`        | Live stats, queue utilization, system status           |
| **Log Explorer** | `/logs`    | Filter by service/level/limit, auto-refresh            |
| **Metrics**      | `/metrics` | Multi-series time-series chart (Recharts)              |
| **Trace Viewer** | `/traces`  | Traces grouped by ID, flame-bar timeline               |
| **SQL Editor**   | `/query`   | Monaco editor with `⌘+Enter`, preset queries, TSV copy |

---

## Development Notes

- **Adapter selection**: Set `STORE=postgres` and `DATABASE_URL=postgres://...` to use PostgreSQL. Default is SQLite.
- **Schema management**: Run `npm run db:push` to sync the Drizzle schema to your database. Run `npm run db:studio` to open the visual browser.
- **Backend type-checking**: `src/backend/` is excluded from `tsconfig.app.json` — Bun provides its own globals (`Bun`, `process`). Run backends directly via Bun.
- The SQLite database file (`tiradata.db`) is created in the working directory on first run.
- The ring buffer silently drops items when full and increments `queue.droppedCount`, surfaced at `GET /api/admin/config`.

---

## Roadmap

- [x] **Phase 1** — HTTP ingestion, memory queue, SQLite, SQL query editor, React UI
- [x] **Phase 2** — Drizzle ORM, IStore interface, PostgreSQL adapter (`pg`), TTL cleanup, admin endpoints
- [x] **Phase 2+** — Persistent WAL queue (crash recovery), index optimization
- [x] **Phase 3** — gRPC ingestion, OpenTelemetry native receiver (OTLP/HTTP)
- [x] **Phase 3** — Query result caching, automated background TTL cleanup job
- [x] **Phase 3** — API key authentication, RBAC
- [x] **Phase 4** — Real-time Log Tailing (WebSockets), Alerting Engine, Service Map
- [ ] **Phase 5** — Multi-Project Isolation, Dynamic API Keys, Advanced UI (React Flow, Alerting Dashboard)
