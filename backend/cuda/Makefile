# Usage:  make            (T4 = sm_75, the default)
#         make ARCH=sm_86 (Ampere consumer GPUs), ARCH=sm_89 (Ada), etc.
# CUDA 13 dropped support for architectures older than Turing (sm_75).
ARCH ?= sm_75
NVCC ?= nvcc
FLAGS = -O2 -arch=$(ARCH) -std=c++17

all: build/libanomaly.so build/selftest

build:
	mkdir -p build

build/libanomaly.so: anomaly_kernels.cu | build
	$(NVCC) $(FLAGS) -shared -Xcompiler -fPIC $< -o $@

build/selftest: selftest.cu anomaly_kernels.cu | build
	$(NVCC) $(FLAGS) selftest.cu -o $@

test: build/selftest
	./build/selftest 1000000

clean:
	rm -rf build
