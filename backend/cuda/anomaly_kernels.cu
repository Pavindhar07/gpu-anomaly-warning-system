// CUDA C++ kernels and C API for Z-score anomaly detection.
//
// Pipeline (all intermediate values stay on the GPU; only the input is copied in and z/flags out):
//   1. k_block_sum      grid-stride sum, shared-memory tree reduction -> one partial per block
//   2. k_finalize_mean  one block reduces the partials, writes mean
//   3. k_block_sqdev    sum of (x - mean)^2 per block (reads mean from device memory)
//   4. k_finalize_var   one block reduces partials, writes population variance and std
//   5. k_classify       z = (x - mean)/std ; flag = |z| > threshold
//
// Conventions match backend/app/services/detection.py (population variance, strict '>',
// degenerate if std <= 1e-12 * max(1, |mean|)).
//
// Build the shared library (see Makefile):  nvcc -O2 -shared -Xcompiler -fPIC anomaly_kernels.cu -o build/libanomaly.so
#include <cuda_runtime.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <stdexcept>
#include <string>

#define BLOCK_THREADS 256          // must be a power of two
#define MAX_REDUCE_BLOCKS 1024     // partial-sum buffer size and finalize-kernel input limit
#define MAX_CLASSIFY_BLOCKS 65535

struct CudaError : std::runtime_error { using std::runtime_error::runtime_error; };

#define CUDA_CHECK(call)                                                                   \
    do {                                                                                   \
        cudaError_t _e = (call);                                                           \
        if (_e != cudaSuccess)                                                             \
            throw CudaError(std::string(#call) + " failed: " + cudaGetErrorString(_e) +    \
                            " (" + __FILE__ + ":" + std::to_string(__LINE__) + ")");       \
    } while (0)

static char g_last_error[1024] = "";

template <typename T>
struct DevBuf {                    // RAII wrapper so every cudaMalloc is freed, even on error
    T* p = nullptr;
    explicit DevBuf(size_t count) { CUDA_CHECK(cudaMalloc(&p, count * sizeof(T))); }
    ~DevBuf() { if (p) cudaFree(p); }
    DevBuf(const DevBuf&) = delete;
    DevBuf& operator=(const DevBuf&) = delete;
};

// Shared-memory tree reduction of one value per thread. Result valid in s[0].
__device__ void block_reduce(double* s, unsigned tid) {
    __syncthreads();
    for (unsigned off = blockDim.x / 2; off > 0; off >>= 1) {
        if (tid < off) s[tid] += s[tid + off];
        __syncthreads();
    }
}

__global__ void k_block_sum(const double* x, size_t n, double* partial) {
    __shared__ double s[BLOCK_THREADS];
    unsigned tid = threadIdx.x;
    size_t i = (size_t)blockIdx.x * blockDim.x + tid;
    size_t stride = (size_t)gridDim.x * blockDim.x;
    double acc = 0.0;
    for (; i < n; i += stride) acc += x[i];            // bounds-checked grid-stride loop
    s[tid] = acc;
    block_reduce(s, tid);
    if (tid == 0) partial[blockIdx.x] = s[0];
}

__global__ void k_block_sqdev(const double* x, size_t n, const double* stats, double* partial) {
    __shared__ double s[BLOCK_THREADS];
    unsigned tid = threadIdx.x;
    const double mean = stats[0];
    size_t i = (size_t)blockIdx.x * blockDim.x + tid;
    size_t stride = (size_t)gridDim.x * blockDim.x;
    double acc = 0.0;
    for (; i < n; i += stride) { double d = x[i] - mean; acc += d * d; }
    s[tid] = acc;
    block_reduce(s, tid);
    if (tid == 0) partial[blockIdx.x] = s[0];
}

// Launched with ONE block of BLOCK_THREADS threads.
__global__ void k_finalize_mean(const double* partial, int nblocks, size_t n, double* stats) {
    __shared__ double s[BLOCK_THREADS];
    unsigned tid = threadIdx.x;
    double acc = 0.0;
    for (int i = tid; i < nblocks; i += blockDim.x) acc += partial[i];
    s[tid] = acc;
    block_reduce(s, tid);
    if (tid == 0) stats[0] = s[0] / (double)n;
}

__global__ void k_finalize_var(const double* partial, int nblocks, size_t n, double* stats) {
    __shared__ double s[BLOCK_THREADS];
    unsigned tid = threadIdx.x;
    double acc = 0.0;
    for (int i = tid; i < nblocks; i += blockDim.x) acc += partial[i];
    s[tid] = acc;
    block_reduce(s, tid);
    if (tid == 0) {
        double var = s[0] / (double)n;                 // population variance
        stats[1] = var;
        stats[2] = sqrt(var);
    }
}

__global__ void k_classify(const double* x, size_t n, const double* stats, double threshold,
                           double* z, unsigned char* flags) {
    const double mean = stats[0], sd = stats[2];
    const bool degenerate = !(sd > 1e-12 * fmax(1.0, fabs(mean)));
    size_t i = (size_t)blockIdx.x * blockDim.x + threadIdx.x;
    size_t stride = (size_t)gridDim.x * blockDim.x;
    for (; i < n; i += stride) {
        double zi = degenerate ? 0.0 : (x[i] - mean) / sd;
        z[i] = zi;
        flags[i] = (!degenerate && fabs(zi) > threshold) ? 1 : 0;
    }
}

static double ms_between(cudaEvent_t a, cudaEvent_t b) {
    float ms = 0.f;
    CUDA_CHECK(cudaEventElapsedTime(&ms, a, b));
    return (double)ms;
}

struct Event {
    cudaEvent_t e;
    Event() { CUDA_CHECK(cudaEventCreate(&e)); }
    ~Event() { cudaEventDestroy(e); }
};

extern "C" {

const char* gpu_last_error() { return g_last_error; }

// out_ints (>= 8): [0]=cc_major [1]=cc_minor [2]=runtime_version [3]=driver_version [4]=sm_count [5]=total_mem_MB
int gpu_device_info(char* name, int name_len, int* out_ints) {
    try {
        int count = 0;
        CUDA_CHECK(cudaGetDeviceCount(&count));
        if (count < 1) throw CudaError("No CUDA device found.");
        cudaDeviceProp p;
        CUDA_CHECK(cudaGetDeviceProperties(&p, 0));
        std::snprintf(name, name_len, "%s", p.name);
        int rt = 0, drv = 0;
        CUDA_CHECK(cudaRuntimeGetVersion(&rt));
        CUDA_CHECK(cudaDriverGetVersion(&drv));
        out_ints[0] = p.major; out_ints[1] = p.minor; out_ints[2] = rt; out_ints[3] = drv;
        out_ints[4] = p.multiProcessorCount; out_ints[5] = (int)(p.totalGlobalMem / (1024 * 1024));
        return 0;
    } catch (const std::exception& ex) {
        std::snprintf(g_last_error, sizeof g_last_error, "%s", ex.what());
        return -1;
    }
}

// stats[3]  = mean, variance, std
// timing[5] = alloc_ms, h2d_ms, kernel_ms, d2h_ms, total_ms   (total = wall clock incl. allocation)
// launch[4] = threads_per_block, blocks_reduce, blocks_classify, 0
int gpu_analyze(const double* h_x, long long n_ll, double threshold, double* h_z, unsigned char* h_flags,
                double* stats, double* timing, int* launch) {
    try {
        if (!h_x || !h_z || !h_flags || !stats || !timing || !launch) throw CudaError("null pointer argument");
        if (n_ll < 1) throw CudaError("n must be >= 1");
        const size_t n = (size_t)n_ll;
        const int threads = BLOCK_THREADS;
        int blocks_reduce = (int)((n + threads - 1) / threads);
        if (blocks_reduce > MAX_REDUCE_BLOCKS) blocks_reduce = MAX_REDUCE_BLOCKS;
        size_t cls = (n + threads - 1) / threads;
        int blocks_classify = (int)(cls > MAX_CLASSIFY_BLOCKS ? MAX_CLASSIFY_BLOCKS : cls);

        auto wall0 = std::chrono::steady_clock::now();
        DevBuf<double> d_x(n), d_z(n), d_partial(MAX_REDUCE_BLOCKS), d_stats(3);
        DevBuf<unsigned char> d_flags(n);
        CUDA_CHECK(cudaMemset(d_stats.p, 0, 3 * sizeof(double)));
        auto wall_alloc = std::chrono::steady_clock::now();

        Event e0, e1, e2, e3;                       // start, after H2D, after kernels, after D2H
        CUDA_CHECK(cudaEventRecord(e0.e));
        CUDA_CHECK(cudaMemcpy(d_x.p, h_x, n * sizeof(double), cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaEventRecord(e1.e));

        k_block_sum<<<blocks_reduce, threads>>>(d_x.p, n, d_partial.p);
        CUDA_CHECK(cudaGetLastError());
        k_finalize_mean<<<1, threads>>>(d_partial.p, blocks_reduce, n, d_stats.p);
        CUDA_CHECK(cudaGetLastError());
        k_block_sqdev<<<blocks_reduce, threads>>>(d_x.p, n, d_stats.p, d_partial.p);
        CUDA_CHECK(cudaGetLastError());
        k_finalize_var<<<1, threads>>>(d_partial.p, blocks_reduce, n, d_stats.p);
        CUDA_CHECK(cudaGetLastError());
        k_classify<<<blocks_classify, threads>>>(d_x.p, n, d_stats.p, threshold, d_z.p, d_flags.p);
        CUDA_CHECK(cudaGetLastError());
        CUDA_CHECK(cudaEventRecord(e2.e));

        CUDA_CHECK(cudaMemcpy(h_z, d_z.p, n * sizeof(double), cudaMemcpyDeviceToHost));
        CUDA_CHECK(cudaMemcpy(h_flags, d_flags.p, n, cudaMemcpyDeviceToHost));
        CUDA_CHECK(cudaMemcpy(stats, d_stats.p, 3 * sizeof(double), cudaMemcpyDeviceToHost));
        CUDA_CHECK(cudaEventRecord(e3.e));
        CUDA_CHECK(cudaEventSynchronize(e3.e));     // everything finished before the clock stops
        auto wall1 = std::chrono::steady_clock::now();

        timing[0] = std::chrono::duration<double, std::milli>(wall_alloc - wall0).count();
        timing[1] = ms_between(e0.e, e1.e);
        timing[2] = ms_between(e1.e, e2.e);
        timing[3] = ms_between(e2.e, e3.e);
        timing[4] = std::chrono::duration<double, std::milli>(wall1 - wall0).count();
        launch[0] = threads; launch[1] = blocks_reduce; launch[2] = blocks_classify; launch[3] = 0;
        return 0;
    } catch (const std::exception& ex) {
        std::snprintf(g_last_error, sizeof g_last_error, "%s", ex.what());
        cudaGetLastError();                         // clear sticky error state
        return -1;
    }
}

}  // extern "C"
