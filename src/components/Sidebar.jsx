import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./Sidebar.css";

function Item({ to, label, icon, open }) {
  return (
    <NavLink
      to={to}
      data-tip={label}
      title={!open ? label : undefined}
      className={({ isActive }) => ["sb-item", isActive ? "is-active" : ""].join(" ")}
    >
      <span className="sb-ico">{icon}</span>
      {open && <span className="sb-label">{label}</span>}
      <span className="sb-active-bar" />
    </NavLink>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(true);   // open / rail
  const [hidden, setHidden] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);

  const loc = useLocation();
  const isInPeople = useMemo(() => /^\/people(\/|$)/.test(loc.pathname), [loc.pathname]);
  useEffect(() => { if (isInPeople) setPeopleOpen(true); }, [isInPeople]);

  // اضبط data-sb على <html> لتكييف .app-main تلقائيًا
  useEffect(() => {
    const mode = hidden ? "hidden" : (open ? "open" : "rail");
    document.documentElement.setAttribute("data-sb", mode);
    return () => document.documentElement.removeAttribute("data-sb");
  }, [open, hidden]);

  // مستمع زر خارجي اختياري
  useEffect(() => {
    const onToggle = () => {
      setHidden((was) => {
        if (was) setOpen(true);
        return !was;
      });
    };
    window.addEventListener("sb:toggle", onToggle);
    return () => window.removeEventListener("sb:toggle", onToggle);
  }, []);

  return (
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
          <Item
            to="/"
            label="الرئيسية"
            open={open}
            icon={
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12l9-9 9 9" />
                <path d="M9 21V9h6v12" />
              </svg>
            }
          />

          {/* الأشخاص */}
          <button
            type="button"
            onClick={() => setPeopleOpen(v => !v)}
            className={["sb-item", peopleOpen ? "is-active" : ""].join(" ")}
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
              <NavLink to="/people/guardian" className="sb-sublink" data-tip="إضافة ولي أمر">
                <span className="dot" /> <span className="text">إضافة ولي أمر 👪</span>
              </NavLink>
              <NavLink to="/people/teacher" className="sb-sublink" data-tip="إضافة معلّم">
                <span className="dot" /> <span className="text">إضافة معلّم 📚</span>
              </NavLink>
              <NavLink to="/people/driver" className="sb-sublink" data-tip="إضافة سائق">
                <span className="dot" /> <span className="text">إضافة سائق 🚌</span>
              </NavLink>
            </div>
          )}
        </nav>
      )}

      {!hidden && (
        <div className="sb-foot">
          <p>{open ? "يمكنك تحويله إلى Rail من الزر بالأعلى." : "وضع Rail — مرّر على الأيقونات لرؤية التلميحات."}</p>
        </div>
      )}
    </aside>
  );
}
