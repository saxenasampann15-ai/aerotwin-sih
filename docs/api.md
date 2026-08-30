# API reference

The interactive source of truth is the FastAPI OpenAPI UI at `http://localhost:8000/docs`.

## Read endpoints

- `GET /api/status` — Demo Mode state and settings.
- `GET /api/health` — overall health, state and configured interpretation thresholds.
- `GET /api/engine` — engine identity, operating state, settings and component health.
- `GET /api/telemetry/latest` — latest raw synthetic telemetry.
- `GET /api/telemetry/history?limit=300` — bounded telemetry series (1–900).
- `GET /api/history?limit=300` — full in-memory Digital Twin snapshots.
- `GET /api/faults`, `/api/prediction`, `/api/mission`, `/api/maintenance`, `/api/alerts` — named dashboard domains.

## Control endpoints

- `POST /api/simulation/start`, `/api/simulation/pause`, `/api/simulation/reset`
- `POST /api/simulation/fault` with `{ "fault": "cooling_degradation" }`
- `POST /api/simulation/settings` with all validated settings: `speed` (1–10), `throttle` (15–100), `load` (10–100), `altitude` (0–10000), `ambient_temperature` (-30–55).
- `POST /api/alerts/{alert_id}/acknowledge`
- `POST /api/models/retrain` regenerates only local synthetic model artifacts.

## WebSocket

Connect to `ws://localhost:8000/ws/telemetry`. Each JSON message is a complete current Digital Twin snapshot including telemetry, health, components, prediction, RUL, mission, maintenance, settings and current live alerts. Clients should replace their current state rather than assume unbounded history.
