# AeroTwin

> AI-enabled real-time Digital Twin for health monitoring, fault prediction, and simulated mission reliability of a **generic aero piston engine** in a MALE UAV simulation.

**Smart India Hackathon · Problem Statement 26054**

AeroTwin is a local-first software research demonstrator. It generates correlated synthetic engine telemetry, evolves a virtual engine state continuously, detects anomalies, predicts fault classes with local ML models, estimates a simulated RUL indicator, and shows the resulting simulated mission reliability and high-level maintenance guidance.

> Safety boundary: this project has no physical engine/UAV interface and no weapons, targeting, engagement, flight-control, or autonomous decision functionality. Values, evaluations, and reliability outputs are synthetic and are not certified aerospace data.

## What it demonstrates

- Real-time synthetic telemetry via FastAPI WebSockets: RPM, throttle, load, thermal, lubrication, fuel, vibration, ambient, altitude, airspeed, and operating hours.
- A continuously evolving Digital Twin rather than a static record.
- Eight progressive fault-injection scenarios: normal, overheating, low oil pressure, excessive vibration, abnormal fuel flow, cooling degradation, sensor anomaly, and progressive degradation.
- Isolation Forest anomaly detection trained against synthetic normal operation.
- Random Forest fault classification trained using the project’s reproducible synthetic data generator.
- Explainable AI signal cards: current values, expected ranges, deviation level, and model-importance-weighted contribution.
- Multi-component health index, estimated remaining useful life (simulated), dynamic alerts, SQLite event history, and mission-phase reliability calculation.
- A presentation-ready React dashboard with 12 dedicated views and responsive aerospace/mission-control styling.

## Quick start

Prerequisites: Python **3.10+** and Node.js **18+** are recommended. The project was developed and verified with current Python and local dependencies; Node 18+ provides the smoothest Vite experience.

macOS / Linux:

```bash
chmod +x start.sh
./start.sh
```

Windows:

```bat
start.bat
```

Then open [http://localhost:5173](http://localhost:5173). The API documentation is at [http://localhost:8000/docs](http://localhost:8000/docs).

The backend automatically creates the SQLite schema and trains the local models if the saved model files are absent. Demo Mode starts with a healthy engine simulation; no external hardware or cloud account is needed.

## Manual setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

On Windows, use `.venv\Scripts\python` and `.venv\Scripts\pip` in place of `.venv/bin/...`.

## Demo walkthrough

1. Open **Dashboard**; confirm the `LIVE` indicator and healthy baseline (~97 health).
2. Review live correlated telemetry and component health.
3. Open **Simulation** and select **Cooling degradation**.
4. Let the fault ramp progressively, or set simulation speed to 5× / 10×.
5. Observe cylinder/oil temperatures increase and cooling effectiveness fall.
6. Open **Fault Prediction** to show anomaly detection, the predicted cooling fault, probability distribution, and explainable signals.
7. Open **Health** and **Mission Reliability** to show health, simulated RUL and mission score decline.
8. Open **Maintenance** to show the high-level condition recommendation.
9. Use **Reset** to return to healthy operation, then inject **Low oil pressure** for a second narrative.

See [docs/demo-script.md](docs/demo-script.md) for a presentation-ready 5–10 minute script.

## Architecture

```text
Synthetic engine simulator
          ↓ WebSocket / REST telemetry
FastAPI ingestion + continuously updated Digital Twin
          ↓
Feature vector → Isolation Forest anomaly detector
               → Random Forest fault classifier
          ↓
Health index + component health + simulated RUL
          ↓
Mission reliability + alerts + maintenance recommendation
          ↓
React engineer dashboard + SQLite history
```

More detail: [docs/architecture.md](docs/architecture.md), [docs/ml.md](docs/ml.md).

## Project structure

```text
backend/app/           FastAPI API, simulation, Digital Twin, ML, SQLite layer
backend/data/          Generated dataset and local SQLite database
backend/models/        Saved joblib models and synthetic-data metrics
backend/tests/         Backend API, simulator, prediction and mission tests
frontend/src/          React dashboard and frontend rendering test
frontend/public/demo/  Drop project-demo.mp4 here to enable video playback
scripts/               Dataset generation and model training entry points
docs/                  Architecture, API, ML and SIH demo documentation
simulation/            Domain-oriented simulation folders for extension
```

## ML pipeline

Run these manually if you want to regenerate artifacts:

```bash
PYTHONPATH=backend .venv/bin/python scripts/generate_dataset.py
PYTHONPATH=backend .venv/bin/python scripts/train_models.py
```

The synthetic dataset includes varied operating conditions for normal operation, overheating, lubrication fault, vibration/mechanical fault, fuel-system fault, cooling degradation, sensor anomaly and progressive degradation. `train_models.py` performs a stratified train/test split, trains an Isolation Forest on normal data and a Random Forest classifier on all classes, saves both models under `backend/models/`, and prints **actual synthetic-data evaluation** accuracy. It also saves a full classification report and confusion matrix in `backend/models/training_metrics.json`.

## Health, RUL and mission methods

The health index is constructed from virtual cooling, lubrication, fuel, combustion, mechanical and sensor subsystem health. It penalizes measured deviations, anomaly evidence, classifier fault confidence, age in operating hours and degradation trend. The `Estimated RUL` calculation uses the current health index and operating hours. It is deliberately labeled simulated and is not a certified life prediction.

Mission reliability evaluates Takeoff, Climb, Cruise, Surveillance, Loiter, Return and Landing. Each phase uses the same twin health plus a load factor and anomaly adjustment; a duration-weighted mean produces the mission score. The formula is shown in the Mission view to make the demonstrator’s logic transparent.

## API and data

Key API endpoints:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health index and thresholds |
| `GET` | `/api/engine` | Twin identity and component state |
| `GET` | `/api/telemetry/latest` | Latest sensor record |
| `GET` | `/api/telemetry/history` | Bounded in-memory telemetry history |
| `GET` | `/api/prediction` | ML prediction, probabilities and explanations |
| `GET` | `/api/mission` | Mission score and phase breakdown |
| `GET` | `/api/alerts` | Live and persisted alerts |
| `POST` | `/api/simulation/start`, `/pause`, `/reset` | Simulation controls |
| `POST` | `/api/simulation/fault` | Inject a validated synthetic fault |
| `POST` | `/api/simulation/settings` | Update speed / environment controls |
| `WS` | `/ws/telemetry` | Live full Digital Twin snapshots |

FastAPI supplies interactive OpenAPI docs at `/docs`. SQLite tables are `engines`, `telemetry`, `fault_events`, `predictions`, `missions`, `alerts`, and `maintenance_events`. Data stays on the local machine in `backend/data/aerotwin.db`.

## Video integration

Place your own MP4 at `frontend/public/demo/project-demo.mp4`. The Video page checks for it and displays a native HTML5 player only when the file exists—there is no broken player placeholder. No code change is necessary.

## Tests and verification

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
npm --prefix frontend test
npm --prefix frontend run build
```

Backend tests cover correlated telemetry, fault injection, health decline, mission reliability impact and API controls. The frontend test verifies basic landing-page rendering; the production build checks TypeScript and Vite integration.

## Docker (optional)

```bash
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). Docker is optional; the local `start.sh` / `start.bat` path is the intended SIH demo path.

## Configuration and troubleshooting

Copy `.env.example` to `.env` to document your local values. The current implementation reads `TELEMETRY_INTERVAL` and `ENGINE_ID`; ports are supplied through the startup command. If the dashboard says disconnected, verify the backend at `http://localhost:8000/docs`. If a model artifact is corrupted or you want a fresh data split, remove `backend/models/*.joblib` and rerun the training script. If port 5173 or 8000 is occupied, stop the process or pass another Vite port and set `VITE_API_URL` for the frontend.

## Limitations and future work

The simulator is deliberately simplified and gives coherent synthetic behavior rather than certified engine physics. ML performance is synthetic-data evaluation, not a claim about operational accuracy. The next research stage would use validated test-cell data, formal uncertainty quantification, physics-informed models, sensor fusion, traceable configuration management and an approved safety/airworthiness process.
