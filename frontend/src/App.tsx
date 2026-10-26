import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/Layout";
import Benchmark from "./pages/Benchmark";
import CudaPage from "./pages/CudaPage";
import Datasets from "./pages/Datasets";
import Detection from "./pages/Detection";
import Landing from "./pages/Landing";
import Overview from "./pages/Overview";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Warnings from "./pages/Warnings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Overview />} />
        <Route path="datasets" element={<Datasets />} />
        <Route path="detection" element={<Detection />} />
        <Route path="warnings" element={<Warnings />} />
        <Route path="benchmark" element={<Benchmark />} />
        <Route path="cuda" element={<CudaPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
