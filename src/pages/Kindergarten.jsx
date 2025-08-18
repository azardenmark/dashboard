// src/pages/Kindergarten.jsx
import React from "react";
import "./FormStyles.css";

export default function Kindergarten() {
  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">الروضة</h1>
        <p className="ap-hero__sub">إدارة بيانات الروضة، الفروع، والصفوف.</p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>نظرة عامة</div>
          <div className="ap-note">هذه الصفحة مبدئية — سنضيف إدارة الرواض والفروع والصفوف هنا لاحقًا.</div>
        </div>
        <div className="ap-card__body">
          <div className="ap-empty">ابدأ بإضافة روضة أو فرع أو صف من الأدوات التي سنضيفها هنا قريبًا.</div>
        </div>
      </section>
    </div>
  );
}
