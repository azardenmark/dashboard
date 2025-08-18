// src/pages/Users.jsx
import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import "./UsersTable.css";


/* =========================
   إعدادات/ثوابت العرض
========================= */

// أسماء المجموعات في Firestore حسب الدور
const ROLE_TO_COLLECTION = {
  guardian: "guardians",
  teacher: "teachers",
  driver: "drivers",
  student: "students",
};

// ترجمة الدور للعرض
const ROLE_LABEL = {
  guardian: "وليّ أمر",
  teacher: "معلّم",
  driver: "سائق",
  student: "طالب",
};

// لون لكل دور (chips)
const ROLE_CLASS = {
  guardian: "role-chip role-guardian",
  teacher: "role-chip role-teacher",
  driver: "role-chip role-driver",
  student: "role-chip role-student",
};

// يحوّل الأرقام العربية/الفارسية إلى لاتينية للبحث
function normalizeDigits(str = "") {
  const map = {
    "٠": "0","١": "1","٢": "2","٣": "3","٤": "4",
    "٥": "5","٦": "6","٧": "7","٨": "8","٩": "9",
    "۰": "0","۱": "1","۲": "2","۳": "3","۴": "4",
    "۵": "5","۶": "6","۷": "7","۸": "8","۹": "9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}

// اختصار اسم (أول حرفين) لصورة افتراضية
function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last  = parts[1]?.[0] ?? "";
  return (first + last).toUpperCase() || "👤";
}

/* =========================
   أنماط Inline للحوارات (مركز الشاشة)
========================= */

const modalStyles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.55)",
    display: "grid",
    placeItems: "center",
    zIndex: 70,
  },
  card: {
    width: "min(720px, 92vw)",
    background: "#0b1220",
    border: "1px solid #243244",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 16px 60px rgba(0,0,0,.6)",
    color: "#e5e7eb",
  },
  smallCard: {
    width: "min(520px, 92vw)",
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  x: {
    height: 32,
    width: 32,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    border: "1px solid #2b3a4c",
    background: "#0f172a",
    color: "#e5e7eb",
    cursor: "pointer",
  },
  foot: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  uid: {
    padding: "4px 8px",
    background: "#0f172a",
    border: "1px solid #243244",
    borderRadius: 8,
    fontFamily: "monospace",
    fontSize: 12,
    color: "#94a3b8",
  },
};

/* =========================
   مكوّنات واجهة عامة (Modal + Confirm)
========================= */

function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return (
    <div style={modalStyles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        style={modalStyles.card}
        className="ap-modal__card"
        onClick={(e)=>e.stopPropagation()}
      >
        <div style={modalStyles.head} className="ap-modal__head">
          <div style={modalStyles.title} className="ap-modal__title">{title}</div>
          <button style={modalStyles.x} className="ap-modal__x" onClick={onClose} aria-label="إغلاق">✖</button>
        </div>
        <div className="ap-modal__body">{children}</div>
        {actions && <div style={modalStyles.foot} className="ap-modal__foot">{actions}</div>}
      </div>
    </div>
  );
}

function Confirm({ open, title="تأكيد", message, confirmText="نعم، متابعة", cancelText="إلغاء", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={modalStyles.backdrop} role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        style={{ ...modalStyles.card, ...modalStyles.smallCard }}
        className="ap-modal__card ap-modal__card--sm"
        onClick={(e)=>e.stopPropagation()}
      >
        <div style={modalStyles.head} className="ap-modal__head">
          <div style={modalStyles.title} className="ap-modal__title">{title}</div>
          <button style={modalStyles.x} className="ap-modal__x" onClick={onCancel} aria-label="إغلاق">✖</button>
        </div>
        <div className="ap-modal__body">
          <p style={{lineHeight:1.8}}>{message}</p>
        </div>
        <div style={modalStyles.foot} className="ap-modal__foot">
          <button className="btn" onClick={onCancel}>{cancelText}</button>
          <button className="btn btn--danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   صفحة المستخدمين
========================= */

export default function Users() {
  const [rows, setRows] = useState([]);     // بيانات موحدة من كل المجموعات
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // فلاتر
  const [role, setRole] = useState("all");      // all | guardian | teacher | driver | student
  const [status, setStatus] = useState("all");  // all | active | inactive
  const [q, setQ] = useState("");               // بحث عام

  // تحرير عبر نافذة منبثقة
  const [editing, setEditing] = useState(null);      // الصف الجاري تحريره
  const [form, setForm] = useState(null);            // قيم النافذة
  const [saving, setSaving] = useState(false);

  // تأكيد الحذف
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  // إحضار حيّ (Real-time) لكل المجموعات
  useEffect(() => {
    setLoading(true);
    setErr("");
    const wanted = [
      { col: "guardians", role: "guardian" },
      { col: "teachers",  role: "teacher"  },
      { col: "drivers",   role: "driver"   },
      { col: "students",  role: "student"  },
    ];

    const unsubs = wanted.map(({ col, role }) => {
      const qRef = query(collection(db, col), orderBy("firstName"));
      return onSnapshot(qRef, (snap) => {
        setRows((prev) => {
          // احذف بيانات هذا الكولكشن أولًا ثم أضف الجديدة
          const others = prev.filter(r => r.role !== role);
          const add = snap.docs.map(d => {
            const data = d.data() || {};
            const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
            return {
              id: d.id,
              role,
              ref: doc(db, col, d.id),
              fullName: fullName || "—",
              email: data.email || "",
              phone: data.phone || "",
              active: data.active !== false,
              address: data.address || "",
              avatarUrl: data.photoURL || data.avatarUrl || "",
              gender: data.gender || "",
              createdAt: data.createdAt || null,
              raw: data,
            };
          });
          const next = [...others, ...add];
          next.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
          return next;
        });
        setLoading(false);
      }, (e) => {
        if (e?.code === "permission-denied") {
    console.warn(`[Firestore] لا صلاحية لقراءة ${col}:`, e.message);
    // أظهر ملاحظة لطيفة مرة واحدة فقط
    setErr(prev => prev || "⚠️ بعض المجموعات محمية (permission-denied). عدّل القواعد أو تجاهلها من الواجهة.");
  } else {
    setErr(e?.message || "فشل الاشتراك في التغييرات.");
  }
  setLoading(false);
      });
    });

    return () => unsubs.forEach(u => u && u());
  }, []);

  // الفلترة/البحث
  const filtered = useMemo(() => {
    const key = normalizeDigits(q).toLowerCase().trim();
    return rows.filter((r) => {
      if (role !== "all" && r.role !== role) return false;
      if (status !== "all") {
        const isActive = r.active === true;
        if (status === "active" && !isActive) return false;
        if (status === "inactive" && isActive) return false;
      }
      if (!key) return true;
      const hay = [r.fullName, r.email, r.phone].join(" ").toLowerCase();
      return hay.includes(key);
    });
  }, [rows, role, status, q]);

  // تقسيم الصفحات
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(1);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const curPage = Math.min(page, totalPages);
  const start = (curPage - 1) * perPage;
  const pageRows = filtered.slice(start, start + perPage);

  /* ====== إجراءات الصف ====== */

  // زر تفعيل/إيقاف
  async function toggleActive(row) {
    try {
      await updateDoc(row.ref, { active: !row.active, updatedAt: serverTimestamp() });
    } catch (e) {
      alert(e?.message || "تعذّر تحديث الحالة.");
    }
  }

  // زر حذف (يفتح تأكيد)
  function askDelete(row) {
    setToDelete(row);
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      setDeleting(true);
      await deleteDoc(toDelete.ref);
      setToDelete(null);
    } catch (e) {
      alert(e?.message || "تعذّر الحذف (تحقّق من الصلاحيات).");
    } finally {
      setDeleting(false);
    }
  }

  // زر تعديل (يفتح النافذة المنبثقة)
  function openEdit(row) {
    setEditing(row);
    setForm({
      firstName: row.raw.firstName || "",
      lastName : row.raw.lastName || "",
      email    : row.raw.email || "",
      phone    : row.raw.phone || "",
      gender   : row.raw.gender || "male",
      address  : row.raw.address || "",
      active   : row.active === true,
    });
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
    setSaving(false);
  }

  function setF(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function saveEdit() {
    if (!editing || !form) return;
    // تحقق بسيط
    const fn = form.firstName.trim();
    const ln = form.lastName.trim();
    if (!fn || !ln) {
      alert("الاسم والكنية مطلوبة.");
      return;
    }
    try {
      setSaving(true);
      await updateDoc(editing.ref, {
        firstName: fn,
        lastName : ln,
        email    : form.email.trim() || null,
        phone    : form.phone.trim() || null,
        gender   : form.gender,
        address  : form.address.trim() || null,
        active   : !!form.active,
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch (e) {
      alert(e?.message || "تعذّر حفظ التعديلات.");
      setSaving(false);
    }
  }

  function openStudentAdvanced(row) {
    // يفتح صفحة الطالب للتعديل الكامل ثم يعيدك للائحة
    navigate(`/people/student?id=${row.id}`);
  }

  /* ====== تصدير CSV ====== */
  function exportCSV() {
    const rowsForCsv = filtered.map(r => ({
      id: r.id,
      role: ROLE_LABEL[r.role] || r.role,
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      gender: r.gender,
      address: r.address,
      active: r.active ? "Active" : "Inactive",
      ...(r.role === "student" ? {
        kindergarten: r.raw.kindergartenName || "",
        branch: r.raw.branchName || "",
        klass: r.raw.className || "",
      } : {})
    }));
    const header = Object.keys(rowsForCsv[0] || {id:"",role:"",fullName:"",email:"",phone:"",gender:"",address:"",active:""});
    const lines = [header.join(","), ...rowsForCsv.map(o => header.map(k => `"${String(o[k] ?? "").replace(/"/g,'""')}"`).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ====== العرض ====== */

  return (
    <div className="ut-wrap">
      <div className="ut-head">
        <h2>المستخدمون</h2>
        <div className="ut-actions">
          <button className="btn" onClick={exportCSV}>تصدير CSV</button>
        </div>
      </div>

      {/* أدوات التحكم */}
      <div className="ut-toolbar">
        <div className="ut-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
        <input
          className="ut-search-input"
          placeholder="بحث بالاسم / البريد / الهاتف…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />

        <div className="ut-filters">
          <select value={role} onChange={(e)=>{ setRole(e.target.value); setPage(1); }}>
            <option value="all">كل الأدوار</option>
            <option value="guardian">أوليّاء الأمور</option>
            <option value="teacher">المعلّمون</option>
            <option value="driver">السائقون</option>
            <option value="student">الطلاب</option>
          </select>

          <select value={status} onChange={(e)=>{ setStatus(e.target.value); setPage(1); }}>
            <option value="all">كل الحالات</option>
            <option value="active">نشِط</option>
            <option value="inactive">غير نشِط</option>
          </select>

          <select value={perPage} onChange={(e)=>{ setPerPage(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10 صفوف</option>
            <option value={15}>15 صفًا</option>
            <option value={25}>25 صفًا</option>
            <option value={50}>50 صفًا</option>
          </select>
        </div>
      </div>

      {/* رسائل */}
      {err && <div className="ut-error">⚠️ {err}</div>}

      {/* الجدول */}
      <div className="ut-table">
        <div className="ut-thead">
          <div className="th th-name">الاسم الكامل</div>
          <div className="th">الدور</div>
          <div className="th">الحالة</div>
          <div className="th">رقم الهاتف</div>
          <div className="th">البريد الإلكتروني</div>
          <div className="th th-actions">إجراءات</div>
        </div>

        {loading ? (
          <div className="ut-skeleton">جاري التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="ut-empty">لا توجد سجلات مطابقة.</div>
        ) : (
          pageRows.map((r) => {
            // سطر العنوان الفرعي: للطالب أعرض مسار الصف، لغيره أعرض العنوان
            const sub =
              r.role === "student"
                ? [r.raw.kindergartenName, r.raw.branchName, r.raw.className]
                    .filter(Boolean)
                    .join(" / ")
                : (r.address || "");
            return (
              <div key={`${r.role}:${r.id}`} className="ut-row">
                <div className="td td-name">
                  <div className="avatar">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt="" />
                    ) : (
                      <div className="avatar-fallback">{initials(r.fullName)}</div>
                    )}
                  </div>
                  <div className="who">
                    <div className="name">{r.fullName}</div>
                    {sub ? <div className="sub">{sub}</div> : null}
                  </div>
                </div>

                <div className="td">
                  <span className={ROLE_CLASS[r.role] || "role-chip"}>{ROLE_LABEL[r.role] || r.role}</span>
                </div>

                <div className="td">
                  <button
                    type="button"
                    className={["st", r.active ? "st--on" : "st--off"].join(" ")}
                    onClick={() => toggleActive(r)}
                    title={r.active ? "نشِط — اضغط للإيقاف" : "غير نشِط — اضغط للتفعيل"}
                  >
                    <span className="dot" />
                    {r.active ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="td">
                  <a className="link" href={`tel:${r.phone}`} onClick={(e)=>!r.phone && e.preventDefault()}>
                    {r.phone || "—"}
                  </a>
                </div>

                <div className="td">
                  <a className="link" href={`mailto:${r.email}`} onClick={(e)=>!r.email && e.preventDefault()}>
                    {r.email || "—"}
                  </a>
                </div>

                <div className="td td-actions">
                  <button className="icon-btn" title="تعديل" onClick={()=>openEdit(r)}>✏️</button>
                  <button className="icon-btn danger" title="حذف" onClick={()=>askDelete(r)}>🗑️</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* شريط الصفحات */}
      <div className="ut-footer">
        <div className="meta">
          {total > 0
            ? `${start + 1}–${Math.min(start + perPage, total)} من ${total}`
            : "0 من 0"}
        </div>

        <div className="pager">
          <button className="btn" disabled={curPage <= 1} onClick={()=>setPage(1)} title="الأولى">«</button>
          <button className="btn" disabled={curPage <= 1} onClick={()=>setPage(p => Math.max(1, p-1))} title="السابق">‹</button>
          <span className="pg">{curPage} / {totalPages}</span>
          <button className="btn" disabled={curPage >= totalPages} onClick={()=>setPage(p => Math.min(totalPages, p+1))} title="التالي">›</button>
          <button className="btn" disabled={curPage >= totalPages} onClick={()=>setPage(totalPages)} title="الأخيرة">»</button>
        </div>
      </div>

      {/* نافذة تعديل */}
      <Modal
        open={!!editing}
        onClose={saving ? undefined : closeEdit}
        title={editing ? `تعديل: ${editing.fullName}` : ""}
        actions={
          <>
            {/* زر يظهر فقط للطلاب للتعديل الموسّع */}
            {editing?.role === "student" && (
              <button
                className="btn"
                title="فتح صفحة الطالب للتعديل الموسّع"
                onClick={() => openStudentAdvanced(editing)}
                disabled={saving}
              >
                تعديل موسّع
              </button>
            )}
            <span style={{flex:1}} />
            <span style={modalStyles.uid} title="UID في Firestore">UID: {editing?.id || "-"}</span>
            <button className="btn" onClick={closeEdit} disabled={saving}>إلغاء</button>
            <button className="btn btn--primary" onClick={saveEdit} disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </>
        }
      >
        {form && (
          <div className="ap-form ap-grid-2">
            <div className="ap-field">
              <label>الاسم</label>
              <input autoFocus className="ap-input" value={form.firstName} onChange={e=>setF("firstName", e.target.value)} />
            </div>
            <div className="ap-field">
              <label>الكنية</label>
              <input className="ap-input" value={form.lastName} onChange={e=>setF("lastName", e.target.value)} />
            </div>

            <div className="ap-field">
              <label>البريد الإلكتروني</label>
              <input dir="ltr" className="ap-input" value={form.email} onChange={e=>setF("email", e.target.value)} />
            </div>
            <div className="ap-field">
              <label>رقم الهاتف</label>
              <input dir="ltr" className="ap-input" value={form.phone} onChange={e=>setF("phone", e.target.value)} />
            </div>

            <div className="ap-field">
              <label>الجنس</label>
              <select className="ap-input" value={form.gender} onChange={e=>setF("gender", e.target.value)}>
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>

            <div className="ap-field">
              <label>الحالة</label>
              <select className="ap-input" value={form.active ? "1" : "0"} onChange={e=>setF("active", e.target.value === "1")}>
                <option value="1">نشِط</option>
                <option value="0">غير نشِط</option>
              </select>
            </div>

            <div className="ap-field ap-span-2">
              <label>العنوان</label>
              <input className="ap-input" value={form.address} onChange={e=>setF("address", e.target.value)} />
            </div>

            {/* معلومات إضافية للطلاب للعرض (قراءة فقط) */}
            {editing?.role === "student" && (
              <div className="ap-field ap-span-2">
                <div className="ap-note">
                  الصف الحالي: {[editing.raw?.kindergartenName, editing.raw?.branchName, editing.raw?.className].filter(Boolean).join(" / ") || "—"}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* تأكيد حذف */}
      <Confirm
        open={!!toDelete}
        title="تأكيد الحذف"
        message={toDelete ? (
          <>
            سيتم حذف <b>“{toDelete.fullName}”</b> نهائيًا من قاعدة البيانات.<br />
            لا يمكن التراجع — هل أنت متأكد؟
          </>
        ) : ""}
        confirmText={deleting ? "جارٍ الحذف…" : "نعم، احذف"}
        cancelText="إلغاء"
        onCancel={()=>!deleting && setToDelete(null)}
        onConfirm={()=>!deleting && confirmDelete()}
      />
    </div>
  );
}
