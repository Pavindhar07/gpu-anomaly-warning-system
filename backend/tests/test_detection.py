"""Unit tests for the CPU reference (run anywhere: python -m unittest discover -s tests)."""
import unittest

import numpy as np
import pandas as pd

from app.services.detection import (DataQualityError, compare_results, detect_cpu, evaluate_labels,
                                    prepare_values, severity_of)
from app.services.datasets import generate_values


class DetectCpu(unittest.TestCase):
    def test_matches_numpy_population_statistics(self):
        x = np.random.default_rng(1).normal(10, 3, 5000)
        r = detect_cpu(x, 3.0)
        self.assertAlmostEqual(r.mean, x.mean(), places=10)
        self.assertAlmostEqual(r.variance, x.var(ddof=0), places=8)
        self.assertAlmostEqual(r.std, x.std(ddof=0), places=10)

    def test_positive_and_negative_outliers_detected(self):
        x = np.full(1000, 10.0) + np.random.default_rng(2).normal(0, 0.5, 1000)
        x[10], x[500] = 40.0, -20.0
        r = detect_cpu(x, 3.0)
        self.assertTrue(r.flags[10] and r.flags[500])
        self.assertGreater(r.z[10], 0)
        self.assertLess(r.z[500], 0)

    def test_threshold_change_is_monotonic(self):
        x = np.random.default_rng(3).normal(0, 1, 20000)
        counts = [int(detect_cpu(x, t).flags.sum()) for t in (1.0, 2.0, 3.0, 4.0)]
        self.assertEqual(counts, sorted(counts, reverse=True))
        self.assertGreater(counts[0], counts[-1])

    def test_strictly_greater_than_threshold(self):
        x = np.array([-1.0, 1.0])            # z = -1, +1 exactly
        self.assertEqual(int(detect_cpu(x, 1.0).flags.sum()), 0)
        self.assertEqual(int(detect_cpu(x, 0.999).flags.sum()), 2)

    def test_constant_values_are_degenerate_not_errors(self):
        r = detect_cpu(np.full(100, 7.0), 3.0)
        self.assertTrue(r.degenerate)
        self.assertEqual(int(r.flags.sum()), 0)
        self.assertTrue(np.all(r.z == 0))

    def test_single_reading(self):
        r = detect_cpu(np.array([5.0]), 3.0)
        self.assertTrue(r.degenerate)

    def test_empty_raises(self):
        with self.assertRaises(ValueError):
            detect_cpu(np.array([]), 3.0)

    def test_nan_rejected(self):
        with self.assertRaises(ValueError):
            detect_cpu(np.array([1.0, np.nan]), 3.0)

    def test_very_large_but_finite_readings(self):
        x = np.random.default_rng(4).normal(1e12, 1e9, 10000)
        x[7] = 1e12 + 1e11
        r = detect_cpu(x, 3.0)
        self.assertTrue(r.flags[7])

    def test_overflowing_readings_raise_clear_error(self):
        with self.assertRaises(ValueError) as cm:
            detect_cpu(np.array([1e200, -1e200, 3e200]), 3.0)
        self.assertIn("overflow", str(cm.exception).lower())

    def test_severity_rules(self):
        s = severity_of(np.array([3.2, 4.0, 4.9, 5.0, 9.0]), 4.0, 5.0)
        self.assertEqual(list(s), ["low", "moderate", "moderate", "high", "high"])


class Prepare(unittest.TestCase):
    raw = pd.Series([1.0, None, "abc", np.inf, 5.0, "7"])

    def test_drop_reports_counts_and_keeps_original_index(self):
        p = prepare_values(self.raw, "drop")
        self.assertEqual(list(p.values), [1.0, 5.0, 7.0])
        self.assertEqual(list(p.row_index), [0, 4, 5])
        q = p.quality
        self.assertEqual((q["missing"], q["non_numeric"], q["infinite"], q["dropped"]), (1, 1, 1, 3))

    def test_mean_and_median_imputation(self):
        m = prepare_values(self.raw, "mean")
        self.assertEqual(m.values.size, 6)
        self.assertAlmostEqual(m.quality["imputed_with"], (1 + 5 + 7) / 3)
        self.assertEqual(prepare_values(self.raw, "median").quality["imputed_with"], 5.0)

    def test_error_policy_raises(self):
        with self.assertRaises(DataQualityError):
            prepare_values(self.raw, "error")

    def test_all_invalid_raises(self):
        with self.assertRaises(ValueError):
            prepare_values(pd.Series([None, "x"]), "drop")

    def test_empty_and_bad_policy(self):
        with self.assertRaises(ValueError):
            prepare_values(pd.Series([], dtype=float))
        with self.assertRaises(ValueError):
            prepare_values(self.raw, "nope")


class SyntheticAndMetrics(unittest.TestCase):
    def test_seed_reproducible_and_counts(self):
        a, la = generate_values(5000, 50, 2, 25, seed=9)
        b, lb = generate_values(5000, 50, 2, 25, seed=9)
        c, _ = generate_values(5000, 50, 2, 25, seed=10)
        self.assertTrue(np.array_equal(a, b) and np.array_equal(la, lb))
        self.assertFalse(np.array_equal(a, c))
        self.assertEqual(int(la.sum()), 25)

    def test_known_injected_anomalies_are_recalled(self):
        x, labels = generate_values(20000, 50, 2, 40, seed=5, magnitude_min=6, magnitude_max=9)
        r = detect_cpu(x, 3.0)
        m = evaluate_labels(r.flags, labels)
        self.assertEqual(m["recall"], 1.0)                       # injected at >= 6 sigma, always above 3
        self.assertGreater(m["precision"], 0.0)
        self.assertEqual(m["true_positives"] + m["false_negatives"], 40)
        print(f"\n  [measured] injected-anomaly metrics (n=20000, thr=3): {m}")

    def test_metrics_zero_division_safe(self):
        m = evaluate_labels(np.zeros(5, bool), np.zeros(5, bool))
        self.assertIsNone(m["precision"])
        self.assertIsNone(m["f1"])

    def test_compare_results_detects_disagreement(self):
        x = np.random.default_rng(6).normal(0, 1, 1000)
        r = detect_cpu(x, 3.0)
        ok = compare_results(r, r.z.copy(), r.flags.copy(), r.mean, r.std, 3.0)
        self.assertTrue(ok["passed"])
        bad = r.flags.copy(); bad[np.argmax(np.abs(r.z))] ^= True
        self.assertFalse(compare_results(r, r.z, bad, r.mean, r.std, 3.0)["passed"])


if __name__ == "__main__":
    unittest.main()
