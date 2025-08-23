// src/components/Sidebar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./Sidebar.css";

/* ========= CSS داخلية للّمعان والبادج ========= */
const extraStyles = `
.sb-badge {
  position: absolute;
  top: 6px;
  inset-inline-end: 8px;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  color: #fff;
  background: linear-gradient(135deg, #ef4444, #f59e0b);
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
  pointer-events: none;
}
@keyframes sbGlow { 0%{box-shadow:0 0 0 rgba(245,158,11,0)} 100%{box-shadow:0 0 18px rgba(245,158,11,.75)} }
.sb-item.is-glow, .sb-item.is-glow:hover { animation: sbGlow .8s ease-in-out infinite alternate; border-radius:10px; }
.sb-shine{ position:absolute; inset:0; overflow:hidden; border-radius:inherit; pointer-events:none; }
.sb-shine::before{ content:""; position:absolute; top:0; bottom:0; left:-150%; width:50%;
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.25),rgba(255,255,255,0));
  transform:skewX(-20deg); animation: sbShineMove 1.2s ease-in-out 2;
}
@keyframes sbShineMove{ 0%{left:-150%} 100%{left:200%} }
.sb-item-button{ position:relative; }
.sb-item-button .sb-badge{ top:6px; inset-inline-end:8px; }
.sb-item-button.is-glow{ animation: sbGlow .8s ease-in-out infinite alternate; border-radius:10px; }
`;

/* عنصر رابط مع دعم الشارة واللمعان */
function Item({ to, label, icon, open, end = false, accent = false, badge = 0, glow = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-tip={label}
      title={!open ? label : undefined}
      className={({ isActive }) =>
        ["sb-item", accent ? "is-accent" : "", isActive ? "is-active" : "", glow ? "is-glow" : ""].join(" ")
      }
    >
      <span className="sb-ico">{icon}</span>
      {open && <span className="sb-label">{label}</span>}
      {badge > 0 && <span className="sb-badge">{badge > 99 ? "99+" : badge}</span>}
      {glow && <span className="sb-shine" />}
      <span className="sb-active-bar" />
    </NavLink>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // عدادات وبريق
  const [counts, setCounts] = useState({ kindergartens: 0, people: 0, users: 0 });
  const [glow, setGlow] = useState({ kindergartens: false, people: false, users: false });

  const loc = useLocation();
  const isInPeople = useMemo(() => /^\/people(\/|$)/.test(loc.pathname), [loc.pathname]);

  // لتلوين العناصر بشكل "accent" فقط عندما تكون أنت في هذا المسار
  const isInKindergartens = useMemo(() => /^\/kindergartens(\/|$)/.test(loc.pathname), [loc.pathname]);
  const isInClasses = useMemo(() => /^\/classes(\/|$)/.test(loc.pathname), [loc.pathname]);

  useEffect(() => { if (isInPeople) setPeopleOpen(true); }, [isInPeople]);

  useEffect(() => {
    const mode = hidden ? "hidden" : (open ? "open" : "rail");
    document.documentElement.setAttribute("data-sb", mode);
    return () => document.documentElement.removeAttribute("data-sb");
  }, [open, hidden]);

  useEffect(() => {
    const onToggle = () => {
      setHidden((was) => { if (was) setOpen(true); return !was; });
    };
    window.addEventListener("sb:toggle", onToggle);
    return () => window.removeEventListener("sb:toggle", onToggle);
  }, []);

  // أحداث التحديث واللمعان
  useEffect(() => {
    function onUpdate(e) {
      const { key, count, delta } = e.detail || {};
      if (!key) return;
      setCounts((prev) => {
        const next = { ...prev };
        if (typeof count === "number") next[key] = Math.max(0, count);
        if (typeof delta === "number") next[key] = Math.max(0, (next[key] || 0) + delta);
        return next;
      });
      setGlow((g) => ({ ...g, [key]: true }));
      setTimeout(() => setGlow((g) => ({ ...g, [key]: false })), 4000);
    }
    function onGlow(e) {
      const { key } = e.detail || {};
      if (!key) return;
      setGlow((g) => ({ ...g, [key]: true }));
      setTimeout(() => setGlow((g) => ({ ...g, [key]: false })), 4000);
    }
    window.addEventListener("sb:update", onUpdate);
    window.addEventListener("sb:glow", onGlow);
    return () => {
      window.removeEventListener("sb:update", onUpdate);
      window.removeEventListener("sb:glow", onGlow);
    };
  }, []);

  // إطفاء اللمعان عند دخول الصفحة
  useEffect(() => {
    const path = loc.pathname;
    const off = (key) => setGlow((g) => (g[key] ? { ...g, [key]: false } : g));
    if (/^\/kindergartens(\/|$)/.test(path)) off("kindergartens");
    if (/^\/users(\/|$)/.test(path)) off("users");
    if (/^\/people(\/|$)/.test(path)) off("people");
  }, [loc.pathname]);

  return (
    <>
      <style>{extraStyles}</style>
      <aside className={["sb", hidden ? "sb--hidden" : open ? "sb--open" : "sb--rail"].join(" ")}>
        {/* رأس */}
        <div className="sb-head">
          <div className="brand">
            <div className="logo">🏫</div>
            {open && !hidden && (
              <div className="meta">
                <div className="title">لوحة الروضة</div>
                <div className="sub">إدارة النظام</div>
              </div>
            )}
          </div>
          {!hidden && (
            <button
              onClick={() => setOpen(v => !v)}
              className="sb-toggle"
              aria-label={open ? "طيّ الشريط" : "فتح الشريط"}
              title={open ? "طيّ الشريط" : "فتح الشريط"}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h14M3 18h10" />}
              </svg>
            </button>
          )}
        </div>

        {/* بحث */}
        {open && !hidden && (
          <div className="sb-search">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="op70">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input placeholder="بحث…" />
          </div>
        )}

        {!hidden && <div className="sb-sep" />}

        {/* روابط */}
        {!hidden && (
          <nav className="sb-nav">
            {/* الرئيسية */}
            <Item
              to="/"
              end
              label="الصفحة الرئيسية"
              open={open}
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12l9-9 9 9" />
                  <path d="M9 21V9h6v12" />
                </svg>
              }
            />

            {/* الروضات والفروع — accent فقط عندما تكون داخلها */}
            <Item
              to="/kindergartens"
              label="أضافة روضة"
              open={open}
              accent={isInKindergartens}
              badge={counts.kindergartens}
              glow={glow.kindergartens}
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12h16M4 8l8-5 8 5M6 12v8h5v-6h2v6h5v-8" />
                </svg>
              }
            />

            {/* الصفوف والطلاب — داخل نفس <nav> و accent عندما تكون داخلها */}
            <Item
              to="/classes"
              label="الصفوف والطلاب"
              open={open}
              accent={isInClasses}
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 10L12 4 2 10l10 6 10-6z" />
                  <path d="M6 12v5a2 2 0 0 0 1 1.73L12 21l5-2.27A2 2 0 0 0 18 17v-5" />
                </svg>
              }
            />

            {/* الأشخاص (قائمة فرعية) */}
            <button
              type="button"
              onClick={() => setPeopleOpen(v => !v)}
              className={["sb-item", "sb-item-button", (isInPeople || peopleOpen) ? "is-active" : "", glow.people ? "is-glow" : ""].join(" ")}
              title={!open ? "الأشخاص" : undefined}
              data-tip="الأشخاص"
            >
              <span className="sb-ico">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" />
                  <path d="M6 21a8 8 0 1112 0" />
                </svg>
              </span>
              {open && <span className="sb-label">الأشخاص</span>}
              {counts.people > 0 && <span className="sb-badge">{counts.people > 99 ? "99+" : counts.people}</span>}
              {glow.people && <span className="sb-shine" />}
              {open && (
                <span className="ms-auto text-slate-400">
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${peopleOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              )}
            </button>

            {peopleOpen && (
              <div className={open ? "sb-sub" : "sb-sub is-rail"}>
                <NavLink to="/people/guardian" className={({ isActive }) => ["sb-sublink", isActive ? "is-active" : ""].join(" ")} data-tip="إضافة ولي أمر">
                  <span className="dot" /> <span className="text">إضافة ولي أمر 👪</span>
                </NavLink>
                <NavLink to="/people/teacher" className={({ isActive }) => ["sb-sublink", isActive ? "is-active" : ""].join(" ")} data-tip="إضافة معلّم">
                  <span className="dot" /> <span className="text">إضافة معلّم 📚</span>
                </NavLink>
                <NavLink to="/people/driver" className={({ isActive }) => ["sb-sublink", isActive ? "is-active" : ""].join(" ")} data-tip="إضافة سائق">
                  <span className="dot" /> <span className="text">إضافة سائق 🚌</span>
                </NavLink>
              </div>
            )}

            {/* إضافة طالب */}
            <Item
              to="/people/student"
              label="إضافة طالب"
              open={open}
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3l9 5-9 5-9-5 9-5z" />
                  <path d="M3 10l9 5 9-5" />
                  <path d="M7 12v5a5 5 0 0010 0v-5" />
                </svg>
              }
            />

            {/* المستخدمون */}
            <Item
              to="/users"
              label="المستخدمون"
              open={open}
              badge={counts.users}
              glow={glow.users}
              icon={
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 11a4 4 0 10-8 0 4 4 0 008 0z" />
                  <path d="M6 21a8 8 0 1112 0" />
                </svg>
              }
            />
          </nav>
        )}

        {!hidden && (
          <div className="sb-foot">
            <p>{open ? "يمكنك تحويله إلى Rail من الزر بالأعلى." : "وضع Rail — مرّر على الأيقونات لرؤية التلميحات."}</p>
          </div>
        )}
      </aside>
    </>
  );
}
