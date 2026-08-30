from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import ENGINE_ID, TELEMETRY_INTERVAL
from .database import Database
from .digital_twin import DigitalTwin
from .ml import InferenceService, train_models
from .schemas import FaultRequest, SimulationSettings


class Runtime:
    def __init__(self) -> None:
        self.db = Database()
        self.twin: DigitalTwin | None = None
        self.task: asyncio.Task | None = None

    async def startup(self) -> None:
        self.db.initialize(ENGINE_ID)
        inference = InferenceService()
        self.twin = DigitalTwin(self.db, inference)
        self.task = asyncio.create_task(self._telemetry_loop())

    async def shutdown(self) -> None:
        if self.task:
            self.task.cancel()
            with suppress(asyncio.CancelledError):
                await self.task

    async def _telemetry_loop(self) -> None:
        while True:
            if self.twin and self.twin.running:
                self.twin.step()
                interval = max(.2, TELEMETRY_INTERVAL / self.twin.simulator.speed)
            else:
                interval = .4
            await asyncio.sleep(interval)

    def get(self) -> DigitalTwin:
        if not self.twin:
            raise RuntimeError("Digital twin has not initialized")
        return self.twin


runtime = Runtime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await runtime.startup()
    yield
    await runtime.shutdown()


app = FastAPI(
    title="AeroTwin Digital Twin API",
    version="1.0.0",
    description="Synthetic, local-only generic aero piston engine health-monitoring demonstrator.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "AeroTwin Digital Twin API", "mode": "synthetic demo", "docs": "/docs"}


@app.get("/api/status")
def status() -> dict[str, Any]:
    twin = runtime.get()
    return {"live": twin.running, "mode": "DEMO MODE", "engine_id": ENGINE_ID, "simulated": True, "settings": twin.settings()}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return runtime.get().snapshot()["health"]


@app.get("/api/engine")
def engine() -> dict[str, Any]:
    snapshot = runtime.get().snapshot()
    return {key: snapshot[key] for key in ("engine_id", "operating_state", "simulated", "updated_at", "settings", "component_health")}


@app.get("/api/telemetry/latest")
def telemetry_latest() -> dict[str, Any]:
    return runtime.get().snapshot()["telemetry"]


@app.get("/api/telemetry/history")
def telemetry_history(limit: int = 300) -> list[dict[str, Any]]:
    if not 1 <= limit <= 900:
        raise HTTPException(422, "limit must be between 1 and 900")
    return [entry["telemetry"] for entry in runtime.get().history_data(limit)]


@app.get("/api/history")
def history(limit: int = 300) -> list[dict[str, Any]]:
    return runtime.get().history_data(max(1, min(limit, 900)))


@app.get("/api/faults")
def faults() -> dict[str, Any]:
    snapshot = runtime.get().snapshot()
    return {"active_scenario": snapshot["settings"]["active_fault"], "fault_progress": snapshot["settings"]["fault_progress"], "prediction": snapshot["prediction"]}


@app.get("/api/prediction")
def prediction() -> dict[str, Any]:
    return runtime.get().snapshot()["prediction"]


@app.get("/api/mission")
def mission() -> dict[str, Any]:
    return runtime.get().snapshot()["mission"]


@app.get("/api/maintenance")
def maintenance() -> dict[str, Any]:
    return runtime.get().snapshot()["maintenance"]


@app.get("/api/alerts")
def alerts() -> dict[str, Any]:
    return {"live": runtime.get().snapshot()["alerts"], "persisted": runtime.db.alerts()}


@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str) -> dict[str, Any]:
    twin = runtime.get()
    for alert in twin.alerts:
        if alert["id"] == alert_id:
            alert["acknowledged"] = True
            return {"acknowledged": True, "id": alert_id}
    if alert_id.isdigit() and runtime.db.acknowledge_alert(int(alert_id)):
        return {"acknowledged": True, "id": alert_id}
    raise HTTPException(404, "Alert not found")


@app.post("/api/simulation/start")
def start_simulation() -> dict[str, Any]:
    runtime.get().running = True
    return runtime.get().snapshot()


@app.post("/api/simulation/pause")
def pause_simulation() -> dict[str, Any]:
    runtime.get().running = False
    return runtime.get().snapshot()


@app.post("/api/simulation/reset")
def reset_simulation() -> dict[str, Any]:
    runtime.get().reset()
    return runtime.get().snapshot()


@app.post("/api/simulation/fault")
def inject_fault(request: FaultRequest) -> dict[str, Any]:
    twin = runtime.get()
    return twin.set_fault(request.fault)


@app.post("/api/simulation/settings")
def set_simulation_settings(settings: SimulationSettings) -> dict[str, Any]:
    twin = runtime.get()
    return twin.update_settings(settings.model_dump())


@app.post("/api/models/retrain")
def retrain() -> dict[str, Any]:
    # Safe local convenience endpoint for the synthetic-data pipeline.
    metrics = train_models(force=True)
    runtime.twin = DigitalTwin(runtime.db, InferenceService())
    return {"message": "Models retrained using synthetic data", "metrics": metrics}


@app.websocket("/ws/telemetry")
async def telemetry_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(runtime.get().snapshot())
            await asyncio.sleep(max(.25, TELEMETRY_INTERVAL / runtime.get().simulator.speed))
    except WebSocketDisconnect:
        return
