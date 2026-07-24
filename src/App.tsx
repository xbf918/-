import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Dashboard } from "@/pages/Home";
import { LoginPage } from "@/pages/Login";
import { LayoutPreview } from "@/pages/LayoutPreview";
import { useAuthStore } from "@/store/useAuthStore";

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const forceShowDashboard = true;

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated || forceShowDashboard ? <Dashboard /> : <LoginPage />}
        />
        <Route path="/layout-preview" element={<LayoutPreview />} />
        <Route path="*" element={isAuthenticated || forceShowDashboard ? <Dashboard /> : <LoginPage />} />
      </Routes>
    </Router>
  );
}
