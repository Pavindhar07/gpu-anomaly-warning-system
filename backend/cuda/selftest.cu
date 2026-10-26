// Standalone CUDA self-test: compares the GPU pipeline with a plain C++ CPU reference.
//   nvcc -O2 -arch=sm_75 selftest.cu -o build/selftest && ./build/selftest [n]
#include "anomaly_kernels.cu"

#include <algorithm>
#include <random>
#include <vector>

int main(int argc, char** argv) {
    long long n = argc > 1 ? std::atoll(argv[1]) : 1000000;
    const double threshold = 3.0;
    char name[256]; int info[8] = {0};
    if (gpu_device_info(name, sizeof name, info) != 0) {
        std::printf("FAIL: no usable CUDA device: %s\n", gpu_last_error());
        return 2;
    }
    std::printf("Device: %s  (cc %d.%d, runtime %d, driver %d, %d SMs, %d MB)\n", name, info[0], info[1],
                info[2], info[3], info[4], info[5]);

    std::mt19937_64 rng(42);
    std::normal_distribution<double> noise(50.0, 2.0);
    std::vector<double> x(n);
    for (auto& v : x) v = noise(rng);
    for (long long k = 0; k < std::max(1LL, n / 1000); ++k) x[rng() % n] += (k % 2 ? 1 : -1) * 7.0 * 2.0;

    // CPU reference (population variance, same conventions)
    double sum = 0; for (double v : x) sum += v;
    double mean = sum / n, ss = 0; for (double v : x) ss += (v - mean) * (v - mean);
    double var = ss / n, sd = std::sqrt(var);
    std::vector<unsigned char> cpu_flags(n);
    long long cpu_count = 0;
    for (long long i = 0; i < n; ++i) { cpu_flags[i] = std::fabs((x[i] - mean) / sd) > threshold; cpu_count += cpu_flags[i]; }

    std::vector<double> z(n); std::vector<unsigned char> flags(n);
    double stats[3], timing[5]; int launch[4];
    if (gpu_analyze(x.data(), n, threshold, z.data(), flags.data(), stats, timing, launch) != 0) {   // warm-up
        std::printf("FAIL: %s\n", gpu_last_error()); return 3;
    }
    gpu_analyze(x.data(), n, threshold, z.data(), flags.data(), stats, timing, launch);              // timed run

    long long gpu_count = 0, mismatches = 0;
    for (long long i = 0; i < n; ++i) { gpu_count += flags[i]; mismatches += flags[i] != cpu_flags[i]; }
    double dmean = std::fabs(stats[0] - mean), dstd = std::fabs(stats[2] - sd);
    std::printf("n=%lld  threads/block=%d  reduce blocks=%d  classify blocks=%d\n", n, launch[0], launch[1], launch[2]);
    std::printf("CPU: mean=%.9f var=%.9f std=%.9f anomalies=%lld\n", mean, var, sd, cpu_count);
    std::printf("GPU: mean=%.9f var=%.9f std=%.9f anomalies=%lld\n", stats[0], stats[1], stats[2], gpu_count);
    std::printf("GPU timing ms: alloc=%.3f h2d=%.3f kernels=%.3f d2h=%.3f total=%.3f\n", timing[0], timing[1],
                timing[2], timing[3], timing[4]);
    std::printf("|dmean|=%.3e |dstd|=%.3e flag mismatches=%lld\n", dmean, dstd, mismatches);
    bool ok = mismatches == 0 && dmean < 1e-9 && dstd < 1e-9;
    std::printf(ok ? "PASS\n" : "FAIL\n");
    return ok ? 0 : 1;
}
