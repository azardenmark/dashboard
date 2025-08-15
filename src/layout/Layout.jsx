import React from "react";
import Sidebar from "../components/Sidebar";

export default function Layout({ children }) {
  return (
    <div className="app-shell">
      {/* هيدر (اختياري) — يضبط ارتفاعه مع sticky للـSidebar */}
      <header className="app-header">
        <h1 style={{ fontSize: 16, margin: 0 }}>لوحة تحكم الروضة</h1>
      </header>

      {/* منطقة العمل: Sidebar + محتوى بدون فراغات خارجية */}
      <div className="app-main">
        <Sidebar />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
