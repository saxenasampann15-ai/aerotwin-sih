from pathlib import Path

from fastapi.testclient import TestClient

from app.config import ENGINE_ID
from app.database import Database
from app.digital_twin import DigitalTwin
from app.ml import InferenceService
from app.simulation import EngineSimulator


def test_correlated_synthetic_telemetry_has_required_fields():
    sample = EngineSimulator().step()
    required = {"rpm", "oil_pressure", "cylinder_temperature", "fuel_flow", "vibration", "engine_hours", "timestamp"}
    assert required <= sample.keys()
    assert sample["rpm"] > 1000
    assert 0 < sample["oil_pressure"] < 6


def test_fault_injection_changes_relevant_signal():
    normal = EngineSimulator(seed=4)
    normal_sample = normal.step()
    faulty = EngineSimulator(seed=4)
    faulty.set_fault("low_oil_pressure")
    for _ in range(20):
        fault_sample = faulty.step()
    assert fault_sample["oil_pressure"] < normal_sample["oil_pressure"]


def test_twin_health_and_mission_decline_under_progressive_fault(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    starting = twin.snapshot()
    twin.set_fault("cooling_degradation")
    for _ in range(28):
        degraded = twin.step()
    assert degraded["health"]["overall"] < starting["health"]["overall"]
    assert degraded["mission"]["reliability_score"] < starting["mission"]["reliability_score"]
    assert degraded["prediction"]["predicted_fault"] == "cooling_degradation"


def test_fault_control_immediately_updates_twin_conditions(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    healthy = twin.snapshot()
    faulty = twin.set_fault("cooling_degradation")
    assert faulty["settings"]["fault_progress"] >= 42
    assert faulty["telemetry"]["cylinder_temperature"] > healthy["telemetry"]["cylinder_temperature"]
    assert faulty["health"]["overall"] < healthy["health"]["overall"]
    assert faulty["mission"]["reliability_score"] < healthy["mission"]["reliability_score"]


def test_settings_control_immediately_creates_new_telemetry(tmp_path: Path):
    database = Database(tmp_path / "test.db")
    database.initialize(ENGINE_ID)
    twin = DigitalTwin(database, InferenceService())
    before = twin.snapshot()
    updated = twin.update_settings({"throttle": 90, "load": 90, "altitude": 5000, "ambient_temperature": 35, "speed": 5})
    assert updated["settings"]["speed"] == 5
    assert updated["telemetry"]["throttle"] == 90
    assert updated["telemetry"]["load"] == 90
    assert updated["telemetry"]["timestamp"] != before["telemetry"]["timestamp"]


def test_api_health_and_simulation_controls():
    from app.main import app
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert 0 <= response.json()["overall"] <= 100
        response = client.post("/api/simulation/fault", json={"fault": "excessive_vibration"})
        assert response.status_code == 200
        response = client.post("/api/simulation/settings", json={"speed": 5, "throttle": 72, "load": 70, "altitude": 2200, "ambient_temperature": 26})
        assert response.status_code == 200
        assert response.json()["settings"]["speed"] == 5
        assert client.get("/api/telemetry/latest").status_code == 200
