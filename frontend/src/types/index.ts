export type ExecMode = "cpu" | "gpu" | "auto";
export type MissingPolicy = "drop" | "mean" | "median" | "error";
export type Severity = "low" | "moderate" | "high";

export interface ColumnInfo {
  name: string; dtype: string; kind: "numeric" | "numeric_text" | "datetime" | "text" | "boolean";
  missing: number; invalid_numeric: number; infinite: number; unique: number;
}
export interface DatasetInfo {
  dataset_id: string; name: string; created_at: string; rows: number; columns: number;
  column_info: ColumnInfo[]; duplicate_rows: number; preview: Record<string, unknown>[];
  suggested_sensor_column: string | null; suggested_timestamp_column: string | null; has_labels: boolean;
  injected_anomalies?: number;
}
export interface GenerateParams {
  n: number; baseline: number; noise_std: number; anomaly_count: number; positive_fraction: number;
  magnitude_min: number; magnitude_max: number; drift_total: number; seed: number;
}
export interface GpuStatus {
  available: boolean; executes_cuda: boolean; source: "local-cuda" | "remote-cuda" | null; mode: string;
  device_name: string | null; compute_capability: string | null; cuda_runtime_version: string | null;
  cuda_driver_version: string | null; sm_count: number | null; total_memory_mb: number | null;
  library_path: string | null; remote_host: string | null; nvcc_found: boolean; reason: string | null;
}
export interface GpuTiming {
  alloc_ms: number; h2d_ms: number; kernel_ms: number; d2h_ms: number; total_ms: number;
  threads_per_block: number; blocks_reduce: number; blocks_classify: number; device_name: string;
  source: string; network_roundtrip_ms?: number;
}
export interface Quality {
  rows_total: number; missing: number; non_numeric: number; infinite: number; invalid_total: number;
  policy: MissingPolicy; dropped: number; imputed: number; imputed_with: number | null;
}
export interface LabelsEval {
  true_positives: number; false_positives: number; false_negatives: number;
  precision: number | null; recall: number | null; f1: number | null;
}
export interface AnalysisSummary {
  analysis_id: string; created_at: string; dataset_id: string; dataset_name: string; sensor_column: string;
  timestamp_column: string | null; method: string; variance_convention: string; threshold: number;
  moderate_z: number; high_z: number; requested_mode: ExecMode; executed_on: "cpu" | "gpu";
  result_source: string; rows_in_file: number; readings_analyzed: number; quality: Quality;
  stats: { mean: number; variance: number; std: number }; anomaly_count: number; anomaly_pct: number;
  severity_counts: Record<Severity, number>;
  timing: { cpu_ms: number | null; gpu: GpuTiming | null; pipeline_wall_ms: number };
  labels_eval: LabelsEval | null; notes: string[]; data_available: boolean;
}
export interface SeriesData {
  downsampled: boolean; total_points: number; returned_points: number; index: number[]; value: number[];
  z: number[]; is_anomaly: boolean[]; timestamp: string[] | null;
  histogram: { edges: number[]; counts: number[] };
}
export interface AnomalyRow {
  row_index: number; timestamp: string | null; value: number; z_score: number; severity: Severity;
  threshold: number; method: string; analysis_id: string;
}
export interface AnomalyPage { total: number; page: number; page_size: number; items: AnomalyRow[] }
export interface Stat { median_ms: number; min_ms: number; max_ms: number; stdev_ms: number; runs: number }
export interface Agreement {
  flags_identical: boolean; mismatches: number; mismatches_unexplained: number; max_abs_z_diff: number;
  mean_abs_diff: number; std_abs_diff: number; tolerance: number; passed: boolean;
}
export interface BenchmarkRecord {
  n: number; anomalies_cpu: number; cpu: Stat;
  gpu: null | { source: string; device_name: string; threads_per_block: number; blocks_reduce: number;
    blocks_classify: number; alloc: Stat; h2d: Stat; kernel: Stat; d2h: Stat; total: Stat };
  speedup_end_to_end: number | null; speedup_kernel_only: number | null; agreement: Agreement | null;
}
export interface BenchmarkResult {
  benchmark_id: string; created_at: string; repeats: number; seed: number; threshold: number;
  gpu_status: GpuStatus; records: BenchmarkRecord[]; notes: string[];
}
export interface HealthInfo {
  status: string; version: string; variance_convention: string;
  limits: { max_upload_mb: number; max_rows: number; max_synthetic_rows: number; max_benchmark_size: number };
}
export interface AppSettings {
  threshold: number; mode: ExecMode; maxUploadMb: number; missingPolicy: MissingPolicy; benchRepeats: number;
  seed: number; moderateZ: number; highZ: number; chartPoints: number; apiBase: string;
}
