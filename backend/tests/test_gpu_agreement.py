"""GPU tests: skipped unless a REAL CUDA library loads. Run these in Colab (see notebooks/)."""
import unittest

import numpy as np

from app.services.detection import compare_results, detect_cpu
from app.services.datasets import generate_values
from app.services.gpu_backend import LocalCudaBackend, get_backend


def _gpu():
    b = get_backend()
    return b if isinstance(b, LocalCudaBackend) else None


@unittest.skipUnless(_gpu(), "No local CUDA backend (build backend/cuda first and run on a GPU machine)")
class GpuAgreement(unittest.TestCase):
    def test_agrees_with_cpu_for_several_sizes(self):
        gpu = _gpu()
        gpu.warmup()
        for n in (1, 2, 255, 256, 257, 10_000, 1_000_000):
            x, _ = generate_values(max(n, 1), 50, 2, min(5, n), seed=n)
            cpu = detect_cpu(x, 3.0)
            g = gpu.analyze(x, 3.0)
            cmp = compare_results(cpu, g.z, g.flags, g.mean, g.std, 3.0)
            self.assertTrue(cmp["passed"], (n, cmp))
            self.assertLess(cmp["mean_abs_diff"], 1e-9)

    def test_constant_input_is_degenerate_on_gpu(self):
        g = _gpu().analyze(np.full(1000, 3.0), 3.0)
        self.assertEqual(int(g.flags.sum()), 0)

    def test_timings_are_positive_and_consistent(self):
        g = _gpu().analyze(np.random.default_rng(0).normal(0, 1, 100_000), 3.0)
        t = g.timing
        self.assertGreater(t["kernel_ms"], 0)
        self.assertGreaterEqual(t["total_ms"], t["kernel_ms"])


if __name__ == "__main__":
    unittest.main()
