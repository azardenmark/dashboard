import { Routes, Route, Link, Navigate } from "react-router-dom";
import { useCallback } from "react";
import Sidebar from "./components/Sidebar";
import AddGuardian from "./pages/AddGuardian";
import "./index.css"; // الأنماط العامة

function Home() {
  return (
    <div className="card" style={{ margin: 12 }}>
      <h2 style={{ margin: 0, fontWeight: 800 }}>ابدأ من الشريط الجانبي</h2>
      <p style={{ marginTop: 8, color: "#94a3b8" }}>
        اضغط <strong>الأشخاص</strong> لإضافة مستخدمين جدد.
      </p>
      <div style={{ marginTop: 12 }}>
        <Link to="/people/guardian" className="text-link">الانتقال إلى الأشخاص →</Link>
      </div>
    </div>
  );
}

function ComingSoon({ label }) {
  return (
    <div className="page-content">
      <div className="card" style={{ margin: 12 }}>
        <div style={{ fontWeight: 800 }}>{label}</div>
        <div style={{ marginTop: 8, color: "#94a3b8" }}>هذه الصفحة سنبنيها لاحقًا.</div>
      </div>
    </div>
  );
}

export default function App() {
  const toggleSidebar = useCallback(() => {
    window.dispatchEvent(new CustomEvent("sb:toggle"));
  }, []);

  return (
    <div className="app-shell">
      {/* رأس صغير موحّد */}
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleSidebar}
            aria-label="إظهار/إخفاء الشريط الجانبي"
            title="إظهار/إخفاء الشريط الجانبي"
            style={{
              height: 32, width: 32, display: "grid", placeItems: "center",
              borderRadius: 8, border: "1px solid #2b3a4c",
              background: "#0f172a", color: "#e5e7eb"
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <h1 className="title">تحكم الروضة</h1>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
          <Link to="/" className="text-link">الرئيسية</Link>
          <Link to="/people/guardian" className="text-link">الأشخاص</Link>
        </nav>
      </header>

      {/* .app-main تضبط padding حسب حالة السايدبار (open/rail/hidden) */}
      <main className="app-main">
        <Sidebar />

        {/* غلاف المحتوى العالمي */}
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Home />} />

            {/* توجيه /people إلى وليّ الأمر مؤقتًا */}
            <Route path="/people" element={<Navigate to="/people/guardian" replace />} />

            {/* الصفحات */}
            <Route path="/people/guardian" element={<AddGuardian />} />
            <Route path="/people/teacher" element={<ComingSoon label="إضافة معلّم" />} />
            <Route path="/people/driver" element={<ComingSoon label="إضافة سائق" />} />

            {/* 404 → الرئيسية */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
