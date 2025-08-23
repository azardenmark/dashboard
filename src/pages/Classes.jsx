// src/pages/Classes.jsx
import React from "react";

const styles = `
.page-pad{padding:16px}
.section{background:#0b1220;border:1px solid rgba(255,255,255,.08);border-radius:14px}
.hero{background:linear-gradient(90deg,#6366f1,#7c3aed,#22c55e);padding:22px;border-radius:14px;color:#fff;margin-bottom:14px}
.hero h1{margin:0 0 6px 0;font-size:22px}
.toolbar{display:flex;gap:8px;align-items:center;padding:10px 12px}
.btn{border:0;border-radius:10px;padding:9px 12px;cursor:pointer}
.btn--primary{background:#16a34a;color:#fff}
.note{color:#cbd5e1;padding:14px}
`;

export default function ClassesPage() {
  return (
    <div className="page-pad">
      <style>{styles}</style>

      <div className="hero section">
        <h1>الصفوف والطلاب</h1>
        <div>هذه الصفحة مخصّصة لإدارة الصفوف وربطها بالروضات وإضافة الطلاب — سنقوم بتجهيزها لاحقًا.</div>
      </div>

      <div className="section toolbar">
        <button className="btn btn--primary">+ إضافة صف</button>
        {/* لاحقًا: فلاتر/اختيار الروضة/بحث… */}
      </div>

      <div className="section">
        <div className="note">
          لا يوجد محتوى بعد. ابدأ بالنقر على <strong>+ إضافة صف</strong> (سنربطه بالنماذج لاحقًا).
        </div>
      </div>
    </div>
  );
}
