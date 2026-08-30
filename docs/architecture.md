# Technical architecture

## Design principles

AeroTwin is local-first, laptop runnable, synthetic by design, and auditable. The system chooses a 2D engineering schematic rather than a dependency-heavy 3D CAD representation so live monitoring and fault demonstrations remain dependable on normal SIH demo hardware.

## Runtime flow

1. `EngineSimulator` creates correlated synthetic telemetry from throttle, load, altitude, ambient temperature, engine time and an optional fault ramp.
2. `DigitalTwin` accepts each telemetry point and updates its virtual engine identity, state, component health, overall health, simulated RUL, maintenance recommendation and mission result.
3. `InferenceService` builds the ML feature vector, invokes the Isolation Forest and Random Forest, and derives explainable signal deviations.
4. `DigitalTwin` emits dynamic alerts and persists bounded telemetry/event records to SQLite.
5. FastAPI exposes REST snapshots and pushes full snapshots over `/ws/telemetry`.
6. React retains a bounded visual history and refreshes cards, charts and gauges without a browser refresh.

## Components

| Component | Responsibility |
| --- | --- |
| `backend/app/simulation.py` | Generic correlated engine / fault telemetry simulation |
| `backend/app/digital_twin.py` | Evolving virtual asset state and engineering metrics |
| `backend/app/ml.py` | Synthetic data, training, local inference and explanations |
| `backend/app/database.py` | SQLite schema and persistence layer |
| `backend/app/main.py` | FastAPI REST API, lifecycle and WebSocket stream |
| `frontend/src/App.tsx` | Responsive dashboard, all visual pages and controls |

## Data lifecycle and bounds

The backend constrains its in-memory telemetry to `MAX_HISTORY` (default 900). The frontend keeps the last 180 live snapshots. SQLite is written at a controlled cadence rather than on every WebSocket send. This prevents indefinite memory growth while leaving enough data to demonstrate history and charts.

## Security and safety

Inputs use Pydantic bounds and fault names are a fixed allow-list. No external command is derived from dashboard input. There are no credentials or cloud dependencies. The platform only represents a generic simulated engine and has no interface to hardware, flight control or weapons systems.
