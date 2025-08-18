import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom";

// Layout
import Sidebar from "./components/Sidebar";

// Pages
import AddGuardian from "./pages/AddGuardian";
import AddTeacher from "./pages/AddTeacher";
import AddDriver from "./pages/AddDriver";
import AddStudent from "./pages/AddStudent"; // 👈 جديد
import Users from "./pages/Users.jsx";
import Login from "./pages/Login";

// Auth guard
import ProtectedRoute from "./components/ProtectedRoute";

// Firebase Auth (لزر تسجيل الخروج وإظهار/إخفاء الزر حسب حالة الدخول)
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";

// Styles
import "./index.css";

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

export default function App() {
  const toggleSidebar = useCallback(() => {
    window.dispatchEvent(new CustomEvent("sb:toggle"));
  }, []);

  const loc = useLocation();
  const navigate = useNavigate();
  const isAuthPage = loc.pathname.startsWith("/login");

  // لإظهار زر الخروج فقط عند وجود مستخدم مسجّل
  const [user, setUser] = useState(null);
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function handleLogout() {
    try {
      const auth = getAuth();
      await signOut(auth);
      navigate("/login", { replace: true });
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  }

  return (
    <div className="app-shell">
      {/* الهيدر لا يظهر في صفحة تسجيل الدخول */}
      {!isAuthPage && (
        <header className="app-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggleSidebar}
              aria-label="إظهار/إخفاء الشريط الجانبي"
              title="إظهار/إخفاء الشريط الجانبي"
              style={{
                height: 32,
                width: 32,
                display: "grid",
                placeItems: "center",
                borderRadius: 8,
                border: "1px solid #2b3a4c",
                background: "#0f172a",
                color: "#e5e7eb",
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <h1 className="title">تحكم الروضة</h1>

            {/* زر تسجيل الخروج — يظهر فقط إذا كان هناك مستخدم */}
            {user && (
              <button
                type="button"
                className="logout-btn"
                onClick={handleLogout}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
              >
                <span>🚪</span>
                <span>تسجيل الخروج</span>
              </button>
            )}
          </div>

          <nav style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
            <Link to="/" className="text-link">الرئيسية</Link>
            <Link to="/people/guardian" className="text-link">الأشخاص</Link>
            <Link to="/users" className="text-link">المستخدمون</Link>
          </nav>
        </header>
      )}

      <main className="app-main">
        {/* السايدبار لا يظهر في صفحة تسجيل الدخول */}
        {!isAuthPage && <Sidebar />}

        <div className="page-content">
          <Routes>
            {/* الصفحات المحمية */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            <Route path="/people" element={<Navigate to="/people/guardian" replace />} />

            <Route
              path="/people/guardian"
              element={
                <ProtectedRoute>
                  <AddGuardian />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people/teacher"
              element={
                <ProtectedRoute>
                  <AddTeacher />
                </ProtectedRoute>
              }
            />
            <Route
              path="/people/driver"
              element={
                <ProtectedRoute>
                  <AddDriver />
                </ProtectedRoute>
              }
            />

            {/* الجديد: صفحة الطالب */}
            <Route
              path="/people/student"
              element={
                <ProtectedRoute>
                  <AddStudent />
                </ProtectedRoute>
              }
            />

            <Route
              path="/users"
              element={
                <ProtectedRoute>
                  <Users />
                </ProtectedRoute>
              }
            />

            {/* صفحة الدخول عامة */}
            <Route path="/login" element={<Login />} />

            {/* 404 → الرئيسية */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
