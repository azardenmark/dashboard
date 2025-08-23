// src/pages/Kindergartens.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "../firebase";

/* ============ قوائم احتياطية ============ */
const DEFAULT_PROVINCES = [
  { id: "DAM", name: "دمشق", code: "DAM" },
  { id: "RDI", name: "ريف دمشق", code: "RDI" },
  { id: "ALE", name: "حلب", code: "ALE" },
  { id: "HMS", name: "حمص", code: "HMS" },
  { id: "HMA", name: "حماة", code: "HMA" },
  { id: "LAZ", name: "اللاذقية", code: "LAZ" },
  { id: "TAR", name: "طرطوس", code: "TAR" },
  { id: "IDL", name: "إدلب", code: "IDL" },
  { id: "DEZ", name: "دير الزور", code: "DEZ" },
  { id: "RAQ", name: "الرقة", code: "RAQ" },
  { id: "HAS", name: "الحسكة", code: "HAS" },
  { id: "DRA", name: "درعا", code: "DRA" },
  { id: "SWA", name: "السويداء", code: "SWA" },
  { id: "QUN", name: "القنيطرة", code: "QUN" },
];

const AGE_GROUPS = ["3-4 سنوات", "4-5 سنوات", "5-6 سنوات"];
const STAGES = ["تمهيدي", "روضة 1", "روضة 2"];

const BLOCK_TYPES = [
  { key: "work", label: "فترة دوام" },
  { key: "break", label: "استراحة" },
  { key: "meal", label: "تناول طعام" },
];

const styles = `
/* تخطيط عام */
.page-pad{padding:16px;}
.section{background:#0b1220;border:1px solid rgba(255,255,255,.08);border-radius:14px;}
.hero{background:linear-gradient(90deg,#6366f1,#7c3aed,#22c55e);padding:22px;border-radius:14px;color:#fff;margin-bottom:14px;}
.hero h1{margin:0 0 6px 0;font-size:22px}

/* جدول */
.table-wrap{overflow:auto}
.table{width:100%;border-collapse:collapse;border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden}
.table th,.table td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06);text-align:start}
.table th{background:rgba(255,255,255,.04);color:#cbd5e1}
.table tr:hover td{background:rgba(255,255,255,.03)}
.nowrap{white-space:nowrap}

/* أزرار */
.btn{border:0;border-radius:10px;padding:9px 12px;cursor:pointer}
.btn--primary{background:#16a34a;color:#fff}
.btn--ghost{background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,.14)}
.btn--danger{background:#ef4444;color:#fff}

/* Chips */
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);padding:4px 8px;border-radius:999px;font-size:12px}
.pill{display:inline-block;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.35);color:#c7d2fe;padding:4px 10px;border-radius:999px;font-size:12px;cursor:pointer}

/* أيقونات أكشن صغيرة */
.icon-btn{width:34px;height:34px;display:inline-grid;place-items:center;border-radius:10px;background:transparent;border:1px solid rgba(203,213,225,.22);color:#cbd5e1}
.icon-btn.danger{border-color:rgba(239,68,68,.4);color:#ff9c9c}
.icon-btn.active{color:#22c55e}

/* محرر (إضافة/تعديل) داخل الصفحة */
.editor{margin-bottom:16px;padding:12px}
.editor-head{display:flex;align-items:center;gap:8px;padding:12px 14px;background:linear-gradient(90deg,#6366f1,#7c3aed,#22c55e);color:#fff;border-radius:10px}
.editor-title{font-weight:700}
.editor-body{padding:14px 10px}
.grid{display:grid;gap:10px;grid-template-columns:repeat(12,1fr)}
.col-12{grid-column:1/-1}.col-6{grid-column:span 6}.col-4{grid-column:span 4}
@media (max-width:980px){.col-6,.col-4{grid-column:1/-1}}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:13px;color:#cbd5e1}
.field input,.field select,.field textarea{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#e5e7eb;border-radius:10px;padding:9px 10px}
.field textarea{min-height:88px;resize:vertical}

/* MultiSelect / MultiPicker */
.ms-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:8px 10px}
.ms-badges{display:flex;gap:6px;flex-wrap:wrap}
.ms-badge{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);padding:3px 7px;border-radius:999px;font-size:12px}
.ms-menu{position:absolute;inset-inline:0;margin-top:6px;background:#0b1220;border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 16px 50px rgba(0,0,0,.35);z-index:2;padding:6px}
.ms-item{padding:8px;border-radius:8px;cursor:pointer}
.ms-item:hover{background:rgba(255,255,255,.06)}
.ms-search{width:100%;margin:6px 0 10px 0;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);color:#e5e7eb;border-radius:10px;padding:8px 10px}

/* فترات زمنية */
.block{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.block select,.block input[type=time]{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e5e7eb;border-radius:9px;padding:8px 10px}
.block .del{background:transparent;border:1px solid rgba(239,68,68,.45);color:#fda4af;border-radius:8px;padding:6px 10px}

/* بطاقة فروع */
.subcard{border:1px dashed rgba(255,255,255,.18);border-radius:10px;padding:10px;background:rgba(255,255,255,.03)}

/* لوحة الفروع أسفل صف الروضة */
.branch-panel{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;margin-top:10px}
.branch-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.subtable th{background:rgba(255,255,255,.03)}

/* نافذة تأكيد حذف */
.confirm{position:fixed;inset:0;background:rgba(8,12,20,.55);display:grid;place-items:center;z-index:1100}
.confirm-box{width:min(95vw,420px);background:#0b1220;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px}
.confirm-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px}
`;

/* ============ أدوات ============ */
const byId = (id) => doc(db, "kindergartens", id);
const splitBlocks = (blocks = []) => {
  const work = [],
    brk = [],
    meal = [];
  blocks.forEach((b) => {
    const row = { start: b.start || "", end: b.end || "" };
    if (b.type === "meal") meal.push(row);
    else if (b.type === "break") brk.push(row);
    else work.push(row);
  });
  return { work, brk, meal };
};
const uniqueById = (arr) => {
  const m = new Map();
  arr.forEach((o) => m.set(o.id, o));
  return [...m.values()];
};

/* ============ MultiSelect بسيط لقوائم نصية ============ */
function MultiSelect({ label, options, values, onChange, placeholder = "اختر…" }) {
  const [open, setOpen] = useState(false);
  const toggle = (opt) => {
    const s = new Set(values || []);
    s.has(opt) ? s.delete(opt) : s.add(opt);
    onChange([...s]);
  };
  return (
    <div className="field" style={{ position: "relative" }}>
      <label>{label}</label>
      <button type="button" className="ms-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="ms-badges">
          {values && values.length ? (
            values.map((v) => (
              <span key={v} className="ms-badge">
                {v}
              </span>
            ))
          ) : (
            <span style={{ color: "#94a3b8" }}>{placeholder}</span>
          )}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>
      {open && (
        <div className="ms-menu">
          <div className="ms-item" onClick={() => onChange(options)}>
            تحديد الكل
          </div>
          {options.map((opt) => (
            <div key={opt} className="ms-item" onClick={() => toggle(opt)}>
              <input type="checkbox" readOnly checked={values?.includes(opt)} />{" "}
              <span style={{ marginInlineStart: 6 }}>{opt}</span>
            </div>
          ))}
          <div style={{ textAlign: "end" }}>
            <button className="btn btn--ghost" onClick={() => setOpen(false)}>
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ MultiPicker عام (ناس/خيارات مع بحث) ============ */
function MultiPicker({ label, options, values, onChange, placeholder = "اختر…" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return options;
    return options.filter((o) => [o.label, o.subtitle].filter(Boolean).join(" ").toLowerCase().includes(k));
  }, [q, options]);

  const toggle = (id) => {
    const set = new Set(values || []);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange([...set]);
  };

  return (
    <div className="field" style={{ position: "relative" }}>
      <label>{label}</label>
      <button type="button" className="ms-trigger" onClick={() => setOpen((v) => !v)}>
        <span className="ms-badges">
          {values && values.length ? (
            values
              .map((id) => options.find((o) => o.id === id)?.label || id)
              .map((label) => (
                <span key={label} className="ms-badge">
                  {label}
                </span>
              ))
          ) : (
            <span style={{ color: "#94a3b8" }}>{placeholder}</span>
          )}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="ms-menu">
          <input className="ms-search" placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.length === 0 && <div className="ms-item" style={{ opacity: 0.7 }}>لا نتائج.</div>}
          {filtered.map((opt) => (
            <div key={opt.id} className="ms-item" onClick={() => toggle(opt.id)}>
              <input type="checkbox" readOnly checked={(values || []).includes(opt.id)} />{" "}
              <span style={{ marginInlineStart: 6 }}>{opt.label}</span>
              {opt.subtitle && <span style={{ marginInlineStart: 8, opacity: 0.6 }}>— {opt.subtitle}</span>}
            </div>
          ))}
          <div style={{ textAlign: "end" }}>
            <button className="btn btn--ghost" onClick={() => setOpen(false)}>
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ فترات زمنية ============ */
function TimeBlocks({ label, blocks, onChange }) {
  const add = () => onChange([...(blocks || []), { type: "work", start: "08:00", end: "14:00" }]);
  const set = (i, k, v) => {
    const n = [...(blocks || [])];
    n[i] = { ...n[i], [k]: v };
    onChange(n);
  };
  const del = (i) => onChange((blocks || []).filter((_, idx) => idx !== i));
  return (
    <div className="field col-12">
      {label && <label>{label}</label>}
      {(blocks || []).map((b, i) => (
        <div className="block" key={i}>
          <select value={b.type || "work"} onChange={(e) => set(i, "type", e.target.value)}>
            {BLOCK_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <span style={{ color: "#94a3b8" }}>من</span>
          <input type="time" value={b.start || ""} onChange={(e) => set(i, "start", e.target.value)} />
          <span style={{ color: "#94a3b8" }}>إلى</span>
          <input type="time" value={b.end || ""} onChange={(e) => set(i, "end", e.target.value)} />
          <button type="button" className="del" onClick={() => del(i)}>
            حذف الفترة
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn--primary" onClick={add}>
          إضافة فترة
        </button>
      </div>
    </div>
  );
}

/* ============ محرّر الروضة ============ */
function Editor({ open, initial, onCancel, onSaved }) {
  const isEdit = !!initial?.id;

  // بيانات أساسية
  const [name, setName] = useState("");
  const [provinceId, setProvinceId] = useState(""); // id/code of province
  const [provinces, setProvinces] = useState(DEFAULT_PROVINCES);
  const selectedProvince = useMemo(
    () => provinces.find((p) => p.id === provinceId) || null,
    [provinceId, provinces]
  );

  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [teacherCount, setTeacherCount] = useState(0);
  const [stages, setStages] = useState([]);
  const [ageGroups, setAgeGroups] = useState([]);
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [notes, setNotes] = useState("");
  const [hasTransport, setHasTransport] = useState(false);
  const [timeBlocks, setTimeBlocks] = useState([{ type: "work", start: "08:00", end: "14:00" }]);

  // روابط موظفي الروضة
  const [teacherOptions, setTeacherOptions] = useState([]); // {id,label,subtitle}
  const [driverOptions, setDriverOptions] = useState([]);
  const [teacherIds, setTeacherIds] = useState(initial?.teacherIds || []);
  const [driverIds, setDriverIds] = useState(initial?.driverIds || []);

  // فروع اختيارية أثناء الإنشاء/التعديل (مع بريد + موظفين)
  const [branches, setBranches] = useState([]);

  // تحميل المحافظات
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "provinces"), orderBy("name")));
        const arr = [];
        snap.forEach((d) => {
          const x = d.data() || {};
          arr.push({ id: x.code || d.id, name: x.name || d.id, code: x.code || d.id });
        });
        setProvinces(arr.length ? arr : DEFAULT_PROVINCES);
      } catch {
        setProvinces(DEFAULT_PROVINCES);
      }
    })();
  }, []);

  // عندما يُفتح المحرّر نملأ الحقول من initial
  useEffect(() => {
    if (!open) return;
    const initialProvinceCode = initial?.provinceCode || "";
    const initialProvinceName = initial?.provinceName || initial?.province || "";
    const detected =
      provinces.find((p) => p.code === initialProvinceCode) ||
      provinces.find((p) => p.name === initialProvinceName) ||
      null;

    setName(initial?.name || "");
    setProvinceId(detected?.id || "");
    setAddress(initial?.address || "");
    setPhone(initial?.phone || "");
    setEmail(initial?.email || "");
    setTeacherCount(initial?.teacherCount || 0);
    setStages(initial?.stages || []);
    setAgeGroups(initial?.ageGroups || []);
    setMonthlyFee(initial?.monthlyFee || 0);
    setNotes(initial?.notes || "");
    setHasTransport(initial?.hasTransport ?? false);
    setTimeBlocks(
      initial?.timeBlocks ||
        (initial?.workRanges ? initial.workRanges.map((r) => ({ type: "work", ...r })) : [{ type: "work", start: "08:00", end: "14:00" }])
    );
    setTeacherIds(initial?.teacherIds || []);
    setDriverIds(initial?.driverIds || []);
    setBranches([]);
  }, [open, initial, provinces]);

  // جلب معلّمين/سائقين المحافظة المحددة
  useEffect(() => {
    (async () => {
      if (!selectedProvince) {
        setTeacherOptions([]);
        setDriverOptions([]);
        return;
      }
      const provCode = selectedProvince.code;
      const provName = selectedProvince.name;

      // Teachers
      const t1 = await getDocs(query(collection(db, "teachers"), where("provinceCode", "==", provCode)));
      const t2 = await getDocs(query(collection(db, "teachers"), where("provinceName", "==", provName)));
      let t = uniqueById(
        [...t1.docs, ...t2.docs].map((d) => {
          const x = d.data() || {};
          return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
        })
      );
      if (t.length === 0) {
        const all = await getDocs(collection(db, "teachers"));
        t = all.docs
          .filter((d) => (d.data()?.publicId || "").startsWith(`${provCode}-`))
          .map((d) => {
            const x = d.data() || {};
            return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
          });
      }
      t.sort((a, b) => a.label.localeCompare(b.label, "ar"));
      setTeacherOptions(t);
      setTeacherIds((prev) => prev.filter((id) => t.some((o) => o.id === id)));

      // Drivers
      const d1 = await getDocs(query(collection(db, "drivers"), where("provinceCode", "==", provCode)));
      const d2 = await getDocs(query(collection(db, "drivers"), where("provinceName", "==", provName)));
      let d = uniqueById(
        [...d1.docs, ...d2.docs].map((dd) => {
          const x = dd.data() || {};
          return { id: dd.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || dd.id, subtitle: x.email || "" };
        })
      );
      if (d.length === 0) {
        const all = await getDocs(collection(db, "drivers"));
        d = all.docs
          .filter((dd) => (dd.data()?.publicId || "").startsWith(`${provCode}-`))
          .map((dd) => {
            const x = dd.data() || {};
            return { id: dd.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || dd.id, subtitle: x.email || "" };
          });
      }
      d.sort((a, b) => a.label.localeCompare(b.label, "ar"));
      setDriverOptions(d);
      setDriverIds((prev) => prev.filter((id) => d.some((o) => o.id === id)));
    })();
  }, [selectedProvince]);

  const addBranch = () =>
    setBranches((p) => [
      ...p,
      {
        name: "",
        phone: "",
        address: "",
        email: "",
        timeBlocks: [{ type: "work", start: "08:00", end: "14:00" }],
        teacherIds: [],
        driverIds: [],
      },
    ]);
  const setB = (i, k, v) => {
    const nx = [...branches];
    nx[i] = { ...nx[i], [k]: v };
    setBranches(nx);
  };
  const delB = (i) => setBranches((p) => p.filter((_, idx) => idx !== i));

  if (!open) return null;

  const save = async () => {
    if (!name.trim() || !selectedProvince) {
      alert("أدخل اسم الروضة واختر المحافظة.");
      return;
    }
    const { work, brk, meal } = splitBlocks(timeBlocks);
    const payload = {
      name: name.trim(),
      provinceName: selectedProvince.name,
      provinceCode: selectedProvince.code,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      teacherCount: Number(teacherCount) || 0,
      stages,
      ageGroups,
      monthlyFee: Number(monthlyFee) || 0,
      notes: notes.trim(),
      hasTransport: !!hasTransport,
      timeBlocks,
      workRanges: work,
      breakRanges: brk,
      mealRanges: meal,
      teacherIds,
      driverIds,
      updatedAt: serverTimestamp(),
      ...(isEdit ? {} : { createdAt: serverTimestamp(), active: true, branchCount: 0 }),
    };

    let kgId = initial?.id;
    if (isEdit) {
      await updateDoc(byId(kgId), payload);
    } else {
      const ref = await addDoc(collection(db, "kindergartens"), payload);
      kgId = ref.id;
    }

    // إنشاء فروع مضافة من نفس المحرّر
    for (const b of branches) {
      const { work: w, brk: bk, meal: ml } = splitBlocks(b.timeBlocks || []);
      await addDoc(collection(db, "branches"), {
        parentId: kgId,
        parentName: name.trim(),
        provinceName: selectedProvince.name,
        provinceCode: selectedProvince.code,
        name: (b.name || "").trim(),
        phone: (b.phone || "").trim(),
        address: (b.address || "").trim(),
        email: (b.email || "").trim() || null,
        teacherIds: Array.from(new Set(b.teacherIds || [])),
        driverIds: Array.from(new Set(b.driverIds || [])),
        timeBlocks: b.timeBlocks || [],
        workRanges: w,
        breakRanges: bk,
        mealRanges: ml,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(byId(kgId), { branchCount: increment(1), updatedAt: serverTimestamp() });
    }

    onSaved?.();
  };

  return (
    <div className="section editor">
      <div className="editor-head">
        <div className="editor-title">{isEdit ? "تعديل بيانات الروضة" : "إضافة روضة جديدة"}</div>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn--ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn--primary" onClick={save}>
            {isEdit ? "حفظ" : "إنشاء"}
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="grid">
          {/* المحافظة + الاسم */}
          <div className="field col-6">
            <label>المحافظة</label>
            <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
              <option value="">اختر محافظة…</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field col-6">
            <label>اسم الروضة</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: روضة الزهور" />
          </div>

          {/* هاتف + بريد */}
          <div className="field col-6">
            <label>هاتف التواصل</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" />
          </div>
          <div className="field col-6">
            <label>البريد الإلكتروني (اختياري)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@example.com" />
          </div>

          {/* العنوان */}
          <div className="field col-12">
            <label>العنوان</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الحي/الشارع/قرب..." />
          </div>

          {/* معطيات تعليمية */}
          <div className="field col-6">
            <label>عدد المعلمين</label>
            <input type="number" min="0" value={teacherCount} onChange={(e) => setTeacherCount(e.target.value)} />
          </div>
          <div className="field col-6">
            <label>القسط الشهري (اختياري)</label>
            <input type="number" min="0" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
          </div>

          <div className="col-6">
            <MultiSelect label="المراحل التعليمية" options={STAGES} values={stages} onChange={setStages} placeholder="اختر المراحل (يمكن عدة عناصر)" />
          </div>
          <div className="col-6">
            <MultiSelect label="الفئات العمرية" options={AGE_GROUPS} values={ageGroups} onChange={setAgeGroups} placeholder="اختر الفئات (يمكن عدة عناصر)" />
          </div>

          <TimeBlocks label="الفترات الزمنية (دوام/استراحة/طعام)" blocks={timeBlocks} onChange={setTimeBlocks} />

          {/* موظفو الروضة ضمن المحافظة */}
          <div className="col-6">
            <MultiPicker
              label={`معلّمو الروضة ${selectedProvince ? `— (${selectedProvince.name})` : ""}`}
              options={teacherOptions}
              values={teacherIds}
              onChange={setTeacherIds}
              placeholder={selectedProvince ? "اختر المعلّمين…" : "اختر المحافظة أولاً"}
            />
          </div>
          <div className="col-6">
            <MultiPicker
              label={`سائقو الروضة ${selectedProvince ? `— (${selectedProvince.name})` : ""}`}
              options={driverOptions}
              values={driverIds}
              onChange={setDriverIds}
              placeholder={selectedProvince ? "اختر السائقين…" : "اختر المحافظة أولاً"}
            />
          </div>

          {/* ملاحظات */}
          <div className="field col-12">
            <label>ملاحظات</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="معلومات إضافية / خدمات / تعليمات…" />
          </div>

          {/* فروع اختيارية */}
          <div className="col-12 subcard">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <strong>إضافة فروع (اختياري)</strong>
              <button type="button" className="btn btn--ghost" onClick={addBranch}>
                + إضافة فرع
              </button>
            </div>

            {branches.map((b, i) => (
              <div key={i} className="grid" style={{ marginBottom: 8 }}>
                <div className="field col-4">
                  <label>اسم الفرع</label>
                  <input value={b.name} onChange={(e) => setB(i, "name", e.target.value)} placeholder="مثال: فرع المزة" />
                </div>
                <div className="field col-4">
                  <label>هاتف الفرع</label>
                  <input value={b.phone} onChange={(e) => setB(i, "phone", e.target.value)} placeholder="09xxxxxxxx" />
                </div>
                <div className="field col-4">
                  <label>عنوان الفرع</label>
                  <input value={b.address} onChange={(e) => setB(i, "address", e.target.value)} placeholder="الحي/الشارع…" />
                </div>

                <div className="field col-6">
                  <label>البريد الإلكتروني (اختياري)</label>
                  <input value={b.email} onChange={(e) => setB(i, "email", e.target.value)} placeholder="branch@example.com" />
                </div>

                <div className="col-6" />

                <div className="col-6">
                  <MultiPicker
                    label="معلّمو هذا الفرع"
                    options={teacherOptions}
                    values={b.teacherIds || []}
                    onChange={(vals) => setB(i, "teacherIds", vals)}
                    placeholder={selectedProvince ? "اختر المعلّمين…" : "اختر المحافظة أولاً"}
                  />
                </div>
                <div className="col-6">
                  <MultiPicker
                    label="سائقو هذا الفرع"
                    options={driverOptions}
                    values={b.driverIds || []}
                    onChange={(vals) => setB(i, "driverIds", vals)}
                    placeholder={selectedProvince ? "اختر السائقين…" : "اختر المحافظة أولاً"}
                  />
                </div>

                <TimeBlocks label="فترات الفرع" blocks={b.timeBlocks} onChange={(nb) => setB(i, "timeBlocks", nb)} />
                <div className="col-12" style={{ textAlign: "end" }}>
                  <button type="button" className="btn btn--danger" onClick={() => delB(i)}>
                    حذف الفرع
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ محرّر الفرع داخل لوحة الفروع ============ */
function BranchEditor({ parent, initial, onCancel, onSaved }) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [timeBlocks, setTimeBlocks] = useState(initial?.timeBlocks || [{ type: "work", start: "08:00", end: "14:00" }]);

  // اختيارات الموظفين لهذا الفرع
  const [teacherOptions, setTeacherOptions] = useState([]); // [{id,label}]
  const [driverOptions, setDriverOptions] = useState([]); // [{id,label}]
  const [teacherIds, setTeacherIds] = useState(initial?.teacherIds || []);
  const [driverIds, setDriverIds] = useState(initial?.driverIds || []);

  useEffect(() => {
    setName(initial?.name || "");
    setPhone(initial?.phone || "");
    setAddress(initial?.address || "");
    setEmail(initial?.email || "");
    setTimeBlocks(initial?.timeBlocks || [{ type: "work", start: "08:00", end: "14:00" }]);
    setTeacherIds(initial?.teacherIds || []);
    setDriverIds(initial?.driverIds || []);
  }, [initial]);

  // جلب معلّمي/سائقي المحافظة تبع الروضة الأم
  useEffect(() => {
    (async () => {
      const provName = parent?.provinceName || parent?.province || "";
      const provCode = parent?.provinceCode || "";
      if (!provName && !provCode) {
        setTeacherOptions([]);
        setDriverOptions([]);
        return;
      }

      // Teachers
      const t1 = provCode ? await getDocs(query(collection(db, "teachers"), where("provinceCode", "==", provCode))) : { docs: [] };
      const t2 = provName ? await getDocs(query(collection(db, "teachers"), where("provinceName", "==", provName))) : { docs: [] };
      let teachers = uniqueById(
        [...t1.docs, ...t2.docs].map((d) => {
          const x = d.data() || {};
          return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
        })
      );
      if (teachers.length === 0 && provCode) {
        const allT = await getDocs(collection(db, "teachers"));
        teachers = allT.docs
          .filter((d) => (d.data()?.publicId || "").startsWith(`${provCode}-`))
          .map((d) => {
            const x = d.data() || {};
            return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
          });
      }
      teachers.sort((a, b) => a.label.localeCompare(b.label, "ar"));
      setTeacherOptions(teachers);
      setTeacherIds((prev) => prev.filter((id) => teachers.some((t) => t.id === id)));

      // Drivers
      const d1 = provCode ? await getDocs(query(collection(db, "drivers"), where("provinceCode", "==", provCode))) : { docs: [] };
      const d2 = provName ? await getDocs(query(collection(db, "drivers"), where("provinceName", "==", provName))) : { docs: [] };
      let drivers = uniqueById(
        [...d1.docs, ...d2.docs].map((d) => {
          const x = d.data() || {};
          return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
        })
      );
      if (drivers.length === 0 && provCode) {
        const allD = await getDocs(collection(db, "drivers"));
        drivers = allD.docs
          .filter((d) => (d.data()?.publicId || "").startsWith(`${provCode}-`))
          .map((d) => {
            const x = d.data() || {};
            return { id: d.id, label: `${x.firstName || ""} ${x.lastName || ""}`.trim() || d.id, subtitle: x.email || "" };
          });
      }
      drivers.sort((a, b) => a.label.localeCompare(b.label, "ar"));
      setDriverOptions(drivers);
      setDriverIds((prev) => prev.filter((id) => drivers.some((t) => t.id === id)));
    })();
  }, [parent?.provinceName, parent?.province, parent?.provinceCode]);

  const save = async () => {
    if (!name.trim()) {
      alert("أدخل اسم الفرع.");
      return;
    }
    const { work, brk, meal } = splitBlocks(timeBlocks);
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      email: email.trim() || null,
      teacherIds: Array.from(new Set(teacherIds || [])),
      driverIds: Array.from(new Set(driverIds || [])),
      timeBlocks,
      workRanges: work,
      breakRanges: brk,
      mealRanges: meal,
      updatedAt: serverTimestamp(),
    };

    if (isEdit) {
      await updateDoc(doc(db, "branches", initial.id), payload);
    } else {
      await addDoc(collection(db, "branches"), {
        parentId: parent.id,
        parentName: parent.name,
        provinceName: parent.provinceName || parent.province || "",
        provinceCode: parent.provinceCode || "",
        ...payload,
        active: true,
        createdAt: serverTimestamp(),
      });
      await updateDoc(byId(parent.id), { branchCount: increment(1), updatedAt: serverTimestamp() });
    }
    onSaved?.();
  };

  return (
    <div className="subcard" style={{ marginBottom: 10 }}>
      <div className="grid">
        <div className="field col-4">
          <label>اسم الفرع</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فرع المزة" />
        </div>
        <div className="field col-4">
          <label>هاتف الفرع</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" />
        </div>
        <div className="field col-4">
          <label>عنوان الفرع</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الحي/الشارع…" />
        </div>

        <div className="field col-6">
          <label>البريد الإلكتروني (اختياري)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="branch@example.com" />
        </div>
        <div className="col-6" />

        <div className="col-6">
          <MultiPicker
            label="معلّمو هذا الفرع"
            options={teacherOptions}
            values={teacherIds}
            onChange={setTeacherIds}
            placeholder="اختر المعلّمين…"
          />
        </div>
        <div className="col-6">
          <MultiPicker
            label="سائقو هذا الفرع"
            options={driverOptions}
            values={driverIds}
            onChange={setDriverIds}
            placeholder="اختر السائقين…"
          />
        </div>

        <TimeBlocks label="فترات الفرع" blocks={timeBlocks} onChange={setTimeBlocks} />
        <div className="col-12" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn--ghost" onClick={onCancel}>
            إلغاء
          </button>
          <button className="btn btn--primary" onClick={save}>
            {isEdit ? "حفظ" : "إضافة الفرع"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ لوحة الفروع ============ */
function BranchPanel({ parent, onClose }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // فرع يتم تعديله، null = لا يوجد
  const [confirm, setConfirm] = useState({ open: false, branch: null });

  useEffect(() => {
    if (!parent?.id) return;
    const qRef = query(collection(db, "branches"), where("parentId", "==", parent.id), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      setBranches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [parent?.id]);

  const toggleActive = async (b) => {
    await updateDoc(doc(db, "branches", b.id), { active: !b.active, updatedAt: serverTimestamp() });
  };

  const askDelete = (b) => setConfirm({ open: true, branch: b });
  const doDelete = async () => {
    const b = confirm.branch;
    if (!b) return;
    await deleteDoc(doc(db, "branches", b.id));
    await updateDoc(byId(parent.id), { branchCount: increment(-1), updatedAt: serverTimestamp() });
    setConfirm({ open: false, branch: null });
  };

  return (
    <div className="branch-panel">
      <div className="branch-head">
        <strong>فروع — {parent.name}</strong>
        <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
          {editing ? null : (
            <button className="btn btn--primary" onClick={() => setEditing({})}>
              + إضافة فرع
            </button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>

      {/* محرر فرع */}
      {editing && <BranchEditor parent={parent} initial={editing.id ? editing : null} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />}

      <div className="table-wrap">
        {loading && <div style={{ color: "#cbd5e1", padding: 8 }}>جارِ التحميل…</div>}
        {!loading && branches.length === 0 && <div style={{ color: "#cbd5e1", padding: 8 }}>لا توجد فروع.</div>}
        {!loading && branches.length > 0 && (
          <table className="table subtable">
            <thead>
              <tr>
                <th>الفرع</th>
                <th>الهاتف</th>
                <th>العنوان</th>
                <th>البريد</th> {/* جديد */}
                <th>نشِط</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td>{b.name || "—"}</td>
                  <td>{b.phone || "—"}</td>
                  <td>{b.address || "—"}</td>
                  <td>{b.email || "—"}</td>
                  <td>
                    <button className={`icon-btn ${b.active ? "active" : ""}`} onClick={() => toggleActive(b)} title={b.active ? "نشِط (اضغط للتعطيل)" : "متوقف (اضغط للتفعيل)"}>
                      {b.active ? (
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="icon-btn" title="تعديل" onClick={() => setEditing(b)}>
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path d="M12 20h9" stroke="currentColor" strokeWidth="2" />
                          <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                      <button className="icon-btn danger" title="حذف" onClick={() => askDelete(b)}>
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path d="M3 6h18" stroke="currentColor" strokeWidth="2" />
                          <path d="M8 6v14m8-14v14" stroke="currentColor" strokeWidth="2" />
                          <path d="M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14M9 6l1-2h4l1 2" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* تأكيد حذف فرع */}
      {confirm.open && (
        <div className="confirm" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm({ open: false, branch: null }); }}>
          <div className="confirm-box">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>تأكيد الحذف</div>
            <div style={{ color: "#cbd5e1" }}>
              حذف الفرع: <strong>{confirm.branch?.name}</strong>؟
            </div>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setConfirm({ open: false, branch: null })}>
                لا
              </button>
              <button className="btn btn--danger" onClick={doDelete}>
                نعم، حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ نافذة تأكيد حذف روضة ============ */
function ConfirmDelete({ open, name, onNo, onYes }) {
  if (!open) return null;
  return (
    <div className="confirm" onMouseDown={(e) => { if (e.target === e.currentTarget) onNo?.(); }}>
      <div className="confirm-box">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>تأكيد الحذف</div>
        <div style={{ color: "#cbd5e1" }}>
          هل تريد حذف الروضة: <strong>{name}</strong>؟ هذا الإجراء لا يمكن التراجع عنه.
        </div>
        <div className="confirm-actions">
          <button className="btn btn--ghost" onClick={onNo}>
            لا
          </button>
          <button className="btn btn--danger" onClick={onYes}>
            نعم، حذف
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ الصفحة ============ */
export default function KindergartensPage(){
  const [list,setList]=useState([]);
  const [loading,setLoading]=useState(true);

  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);

  const [confirm,setConfirm]=useState({open:false,kg:null});

  // فتح لوحة فروع أسفل صف معيّن
  const [expandedKgId,setExpandedKgId]=useState(null);

  useEffect(()=>{
    const qRef=query(collection(db,"kindergartens"),orderBy("createdAt","desc"));
    const unsub=onSnapshot(qRef,(snap)=>{
      setList(snap.docs.map(d=>({id:d.id,...d.data()})));
      setLoading(false);
    });
    return ()=>unsub();
  },[]);

  const toggleActive=async (kg)=>{ await updateDoc(byId(kg.id),{active:!kg.active,updatedAt:serverTimestamp()}); };
  const askDelete=kg=> setConfirm({open:true,kg});
  const doDelete=async ()=>{
    const kg=confirm.kg; if(!kg) return;
    await deleteDoc(byId(kg.id));
    setConfirm({open:false,kg:null});
  };

  const toggleBranches=(kg)=>{
    setExpandedKgId(prev => prev===kg.id ? null : kg.id);
  };

  return (
    <div className="page-pad">
      <style>{styles}</style>

      <div className="hero section">
        <h1>الروضات والفروع</h1>
        <div>إدارة الروضات السورية، الفروع، والفترات الزمنية.</div>
      </div>

      {/* المحرّر (إضافة/تعديل) */}
      {showForm && (
        <Editor
          open={showForm}
          initial={editing}
          onCancel={()=>{ setShowForm(false); setEditing(null); }}
          onSaved={()=>{ setShowForm(false); setEditing(null); }}
        />
      )}

      {/* شريط أدوات أعلى الجدول */}
      <div className="section" style={{padding:"10px 12px",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn btn--primary" onClick={()=>{ setEditing(null); setShowForm(true); }}>+ إضافة روضة</button>
      </div>

      {/* الجدول */}
      <div className="section">
        <div style={{padding:"12px 14px",fontWeight:700,color:"#cbd5e1"}}>قائمة الروضات</div>
        <div className="table-wrap">
          {loading && <div style={{color:"#cbd5e1",padding:12}}>جارِ التحميل…</div>}
          {!loading && list.length===0 && <div style={{color:"#cbd5e1",padding:12}}>لا توجد روضات — ابدأ بإضافة روضة.</div>}
          {!loading && list.length>0 && (
            <table className="table">
              <thead>
                <tr>
                  <th className="nowrap">الروضة</th>
                  <th className="nowrap">المحافظة</th>
                  <th className="nowrap">الهاتف</th>
                  <th className="nowrap">المراحل</th>
                  <th className="nowrap">الفئات</th>
                  <th className="nowrap">الفروع</th>
                  <th className="nowrap">نشِطة</th>
                  <th className="nowrap">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map(kg=>(
                  <React.Fragment key={kg.id}>
                    <tr>
                      <td title={kg.address||""}>
                        <div style={{fontWeight:700}}>{kg.name}</div>
                        <div style={{fontSize:12,color:"#94a3b8"}}>{kg.address||"—"}</div>
                      </td>
                      <td>{kg.provinceName || kg.province || "—"}</td>
                      <td>{kg.phone||"—"}</td>
                      <td>
                        <div className="chips" title={(kg.stages||[]).join("، ")}>
                          {(kg.stages||[]).length? kg.stages.map(s=><span key={s} className="chip">{s}</span>) : "—"}
                        </div>
                      </td>
                      <td>
                        <div className="chips" title={(kg.ageGroups||[]).join("، ")}>
                          {(kg.ageGroups||[]).length? kg.ageGroups.map(a=><span key={a} className="chip">{a}</span>) : "—"}
                        </div>
                      </td>
                      <td>
                        {/* رقم فقط — مع فتح لوحة الفروع عند النقر */}
                        <span className="pill" title="عرض/إدارة الفروع" onClick={()=>toggleBranches(kg)}>
                          {kg.branchCount || 0}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`icon-btn ${kg.active?"active":""}`}
                          onClick={()=>toggleActive(kg)}
                          title={kg.active? "نشِطة (انقر للتعطيل)":"متوقفة (انقر للتفعيل)"}
                        >
                          {kg.active ? (
                            <svg viewBox="0 0 24 24" width="18" height="18">
                              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                              <path d="M8 12l3 3 5-6" fill="none" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="18" height="18">
                              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                              <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                          )}
                        </button>
                      </td>
                      <td>
                        <div style={{display:"flex",gap:8}}>
                          <button className="icon-btn" title="تعديل"
                                  onClick={()=>{ setEditing(kg); setShowForm(true); }}>
                            <svg viewBox="0 0 24 24" width="18" height="18">
                              <path d="M12 20h9" stroke="currentColor" strokeWidth="2"/>
                              <path d="M16.5 3.5a2.1 2.1 0 113 3L7 19l-4 1 1-4z" fill="none" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                          </button>
                          <button className="icon-btn danger" title="حذف"
                                  onClick={()=>askDelete(kg)}>
                            <svg viewBox="0 0 24 24" width="18" height="18">
                              <path d="M3 6h18" stroke="currentColor" strokeWidth="2"/>
                              <path d="M8 6v14m8-14v14" stroke="currentColor" strokeWidth="2"/>
                              <path d="M5 6l1 14a2 2 0 002 2h8a2 2 0 002-2l1-14M9 6l1-2h4l1 2" fill="none" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* لوحة الفروع للروضة المفتوحة */}
                    {expandedKgId===kg.id && (
                      <tr>
                        <td colSpan={8}>
                          <BranchPanel parent={kg} onClose={()=>setExpandedKgId(null)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* نافذة تأكيد حذف روضة */}
      <ConfirmDelete
        open={confirm.open}
        name={confirm.kg?.name||""}
        onNo={()=>setConfirm({open:false,kg:null})}
        onYes={doDelete}
      />
    </div>
  );
}
