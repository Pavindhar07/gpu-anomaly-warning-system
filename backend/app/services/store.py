"""In-memory stores. Metadata is kept for history; large arrays only for the most recent items."""
from __future__ import annotations

import threading
from collections import OrderedDict


class LruStore:
    def __init__(self, capacity: int):
        self.capacity, self._d, self._lock = capacity, OrderedDict(), threading.Lock()

    def put(self, key, value):
        with self._lock:
            self._d[key] = value
            self._d.move_to_end(key)
            while len(self._d) > self.capacity:
                self._d.popitem(last=False)

    def get(self, key):
        with self._lock:
            if key in self._d:
                self._d.move_to_end(key)
                return self._d[key]
            return None

    def values(self):
        with self._lock:
            return list(self._d.values())


datasets = LruStore(5)         # id -> {"df", "name", "profile", "created_at"}
analysis_data = LruStore(5)    # id -> numpy arrays
analysis_meta = LruStore(200)  # id -> summary dict (history)
benchmarks = LruStore(20)      # id -> benchmark result dict
