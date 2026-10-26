import unittest

import numpy as np

from app.services import analysis, benchmark, store
from app.services.datasets import DatasetError, generate_dataframe, parse_csv, profile
from app.services.gpu_backend import GpuUnavailable, UnavailableBackend


class Csv(unittest.TestCase):
    def test_valid_csv_profile(self):
        df = parse_csv(b"timestamp,value\n2024-01-01 00:00:00,1.5\n2024-01-01 00:00:01,2.5\n2024-01-01 00:00:01,2.5\n", 100)
        p = profile(df)
        self.assertEqual((p["rows"], p["columns"], p["duplicate_rows"]), (3, 2, 1))
        self.assertEqual(p["suggested_sensor_column"], "value")
        self.assertEqual(p["suggested_timestamp_column"], "timestamp")

    def test_invalid_inputs(self):
        for bad in (b"", b"   \n", b"a,b\n", b"\xff\xfe\x00bad"):
            with self.assertRaises(DatasetError, msg=repr(bad)):
                parse_csv(bad, 100)

    def test_row_limit_enforced(self):
        with self.assertRaises(DatasetError):
            parse_csv(b"v\n" + b"1\n" * 50, 10)

    def test_missing_and_invalid_counted_in_profile(self):
        df = parse_csv(b"v,w\n1,a\n,b\nabc,c\n4,d\n", 100)
        col = profile(df)["column_info"][0]
        self.assertEqual(col["missing"], 1)
        self.assertEqual(col["invalid_numeric"], 1)


def _ds(df, name="t"):
    return {"id": "d1", "df": df, "name": name}


class Analysis(unittest.TestCase):
    cpu_only = UnavailableBackend("test: no GPU")

    def _run(self, df, **kw):
        args = dict(sensor_column="sensor_value", timestamp_column="timestamp", threshold=3.0, mode="auto",
                    missing_policy="drop", moderate_z=4.0, high_z=5.0, backend=self.cpu_only)
        args.update(kw)
        return analysis.run_analysis(_ds(df), **args)

    def setUp(self):
        self.df = generate_dataframe(5000, baseline=50.0, noise_std=2.0, anomaly_count=10, seed=3,
                                     magnitude_min=6, magnitude_max=9)

    def test_auto_without_gpu_runs_on_cpu_and_is_labeled_cpu(self):
        s = self._run(self.df)
        self.assertEqual(s["executed_on"], "cpu")
        self.assertIsNone(s["timing"]["gpu"])
        self.assertIsNotNone(s["timing"]["cpu_ms"])
        self.assertEqual(s["result_source"], "cpu-numpy")
        self.assertEqual(s["labels_eval"]["recall"], 1.0)

    def test_explicit_gpu_never_falls_back(self):
        with self.assertRaises(GpuUnavailable):
            self._run(self.df, mode="gpu")

    def test_unknown_column(self):
        with self.assertRaises(KeyError):
            self._run(self.df, sensor_column="nope")

    def test_constant_column_reports_degenerate(self):
        df = self.df.assign(sensor_value=5.0)
        s = self._run(df)
        self.assertEqual(s["anomaly_count"], 0)
        self.assertIn("zero variance", s["notes"][0])

    def test_dropped_rows_keep_original_index_and_are_reported(self):
        df = self.df.copy()
        df["sensor_value"] = df["sensor_value"].astype(object)
        df.loc[0, "sensor_value"] = None
        df.loc[1, "sensor_value"] = "bad"
        s = self._run(df)
        self.assertEqual(s["quality"]["dropped"], 2)
        self.assertEqual(s["readings_analyzed"], 4998)
        page = analysis.anomaly_frame(s["analysis_id"])
        self.assertTrue((page["row_index"] >= 2).all())

    def test_severity_counts_sum_to_total(self):
        s = self._run(self.df)
        self.assertEqual(sum(s["severity_counts"].values()), s["anomaly_count"])

    def test_series_downsampling_keeps_anomalies(self):
        s = self._run(self.df)
        out = analysis.series_for_chart(s["analysis_id"], 200)
        self.assertTrue(out["downsampled"])
        self.assertLess(out["returned_points"], 5000)
        self.assertEqual(sum(out["is_anomaly"]), s["anomaly_count"])


class Bench(unittest.TestCase):
    def test_cpu_only_benchmark_has_no_gpu_numbers(self):
        r = benchmark.run_benchmark([1000, 10000], 3, 1, 3.0, UnavailableBackend("test: no GPU"))
        self.assertEqual(len(r["records"]), 2)
        for rec in r["records"]:
            self.assertGreater(rec["cpu"]["median_ms"], 0)
            self.assertEqual(rec["cpu"]["runs"], 3)
            self.assertIsNone(rec["gpu"])
            self.assertIsNone(rec["speedup_end_to_end"])
            self.assertIsNone(rec["agreement"])
        self.assertTrue(any("GPU unavailable" in n for n in r["notes"]))
        rows = benchmark.benchmark_csv_rows(r)
        self.assertFalse(rows[0]["gpu_available"])


if __name__ == "__main__":
    unittest.main()
