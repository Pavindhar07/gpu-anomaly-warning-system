"""API integration tests. Skipped automatically when fastapi/httpx are not installed."""
import importlib.util
import unittest

HAVE = all(importlib.util.find_spec(m) for m in ("fastapi", "httpx", "multipart"))


@unittest.skipUnless(HAVE, "fastapi, httpx and python-multipart are required")
class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app.main import app
        cls.c = TestClient(app)

    def _gen(self, **kw):
        body = {"n": 2000, "anomaly_count": 10, "seed": 7, "magnitude_min": 6, "magnitude_max": 9}
        body.update(kw)
        r = self.c.post("/api/datasets/generate", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_health_and_gpu_status_shape(self):
        self.assertEqual(self.c.get("/api/health").json()["status"], "ok")
        s = self.c.get("/api/gpu/status").json()
        self.assertIn("available", s)
        if not s["available"]:
            self.assertFalse(s["executes_cuda"])
            self.assertTrue(s["reason"])

    def test_generate_analyze_export_flow(self):
        ds = self._gen()
        r = self.c.post("/api/analyze", json={"dataset_id": ds["dataset_id"], "sensor_column": "sensor_value",
                                              "timestamp_column": "timestamp", "mode": "cpu"})
        self.assertEqual(r.status_code, 200, r.text)
        a = r.json()
        self.assertEqual(a["executed_on"], "cpu")
        page = self.c.get(f"/api/analysis/{a['analysis_id']}/anomalies?sort_by=z_score&order=desc").json()
        self.assertEqual(page["total"], a["anomaly_count"])
        csv = self.c.get(f"/api/reports/{a['analysis_id']}/anomalies")
        self.assertEqual(csv.status_code, 200)
        self.assertTrue(csv.text.startswith("row_index,timestamp,value,z_score,severity"))
        self.assertEqual(self.c.get(f"/api/analysis/{a['analysis_id']}/series?max_points=100").status_code, 200)

    def test_gpu_mode_without_gpu_returns_409(self):
        if self.c.get("/api/gpu/status").json()["available"]:
            self.skipTest("a GPU is available")
        ds = self._gen()
        r = self.c.post("/api/analyze", json={"dataset_id": ds["dataset_id"], "sensor_column": "sensor_value", "mode": "gpu"})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"]["code"], "gpu_unavailable")

    def test_bad_inputs(self):
        self.assertEqual(self.c.post("/api/analyze", json={"dataset_id": "x", "sensor_column": "v"}).status_code, 404)
        self.assertEqual(self.c.post("/api/datasets/generate", json={"n": 1}).status_code, 422)
        self.assertEqual(self.c.post("/api/datasets/generate", json={"n": 100, "anomaly_count": 500}).status_code, 422)
        ds = self._gen()
        self.assertEqual(self.c.post("/api/analyze", json={"dataset_id": ds["dataset_id"], "sensor_column": "nope"}).status_code, 422)
        self.assertEqual(self.c.post("/api/analyze", json={"dataset_id": ds["dataset_id"], "sensor_column": "sensor_value",
                                                           "threshold": -1}).status_code, 422)
        self.assertEqual(self.c.post("/api/analyze", json={"dataset_id": ds["dataset_id"], "sensor_column": "sensor_value",
                                                           "threshold": 5, "moderate_z": 4}).status_code, 422)

    def test_upload_validation(self):
        bad = self.c.post("/api/datasets/upload", files={"file": ("x.exe", b"abc", "application/octet-stream")})
        self.assertEqual(bad.status_code, 415)
        empty = self.c.post("/api/datasets/upload", files={"file": ("x.csv", b"", "text/csv")})
        self.assertEqual(empty.status_code, 400)
        ok = self.c.post("/api/datasets/upload", files={"file": ("x.csv", b"v\n1\n2\n3\n100\n", "text/csv")})
        self.assertEqual(ok.status_code, 200)

    def test_benchmark_validation_and_cpu_results(self):
        self.assertEqual(self.c.post("/api/benchmark", json={"sizes": [5]}).status_code, 422)
        self.assertEqual(self.c.post("/api/benchmark", json={"sizes": [10**9]}).status_code, 422)
        r = self.c.post("/api/benchmark", json={"sizes": [1000], "repeats": 2})
        self.assertEqual(r.status_code, 200)
        b = r.json()
        if not b["gpu_status"]["available"]:
            self.assertIsNone(b["records"][0]["gpu"])
        self.assertEqual(self.c.get(f"/api/reports/{b['benchmark_id']}/benchmark").status_code, 200)

    def test_gpu_analyze_endpoint_refuses_without_cuda(self):
        if self.c.get("/api/gpu/status").json()["available"]:
            self.skipTest("a GPU is available")
        r = self.c.post("/api/gpu/analyze", content=b"\x00" * 16)
        self.assertEqual(r.status_code, 503)


if __name__ == "__main__":
    unittest.main()
