// src/pages/ClassCreate.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./FormStyles.css";
import { useParams, useNavigate } from "react-router-dom";
import { db, storage } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  documentId,
  increment,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ---------------- أدوات مساعدة ---------------- */
function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function fullName(x) {
  return [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—";
}
// يقبل "5 سنوات" أو "4-6 سنوات"
function parseAgeSpec(str = "") {
  const s = String(str);
  const mRange = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (mRange) {
    const a = Number(mRange[1]), b = Number(mRange[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const mSingle = s.match(/(\d+)/);
  if (mSingle) {
    const n = Number(mSingle[1]);
    return { min: n, max: n };
  }
  return null;
}
function yearsFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(+d)) return null;
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return y;
}
function summarizeAges(arr = []) {
  if (!arr.length) return "— اختر —";
  return arr.length > 3
    ? `مختار ${arr.length}`
    : arr.join("، ").replace(/\s*سنوات?/g, " س");
}

/* ——— تجزئة إسناد الطلاب لتفادي حدود فايرستور ——— */
async function assignStudentsInChunks({ studentIds, classRef, className, parentId, kgId, branchId }) {
  const groups = [];
  for (let i = 0; i < studentIds.length; i += 400) groups.push(studentIds.slice(i, i + 400));
  for (let i = 0; i < groups.length; i++) {
    const batch = writeBatch(db);
    groups[i].forEach((sid) => {
      batch.update(doc(db, "students", sid), {
        classId: classRef.id,
        className: className.trim(),
        parentId,
        kindergartenId: kgId,
        branchId: branchId || null,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }
}

/* ---------------- الصفحة ---------------- */
export default function ClassCreatePage() {
  const { kgId: kgIdParam } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // الروضات/الفروع
  const [kgList, setKgList] = useState([]);
  const [kgId, setKgId] = useState(kgIdParam || "");
  const [kg, setKg] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");

  // المحافظة
  const [provinceName, setProvinceName] = useState("");

  // خيارات المراحل/الأعمار (من الروضة)
  const [stageOptions, setStageOptions] = useState([]);
  const [ageOptions, setAgeOptions] = useState([]); // نصوص مثل "5 سنوات" أو "4-6 سنوات"

  // المعلّمون
  const [teacherOptions, setTeacherOptions] = useState([]); // {id,label,subtitle,active}
  const [teacherId, setTeacherId] = useState("");

  // الطلاب
  const [students, setStudents] = useState([]); // {id, fullName, age, branchId, classId, photoURL}
  const [filterText, setFilterText] = useState("");
  const [hideAssigned, setHideAssigned] = useState(true);
  const [selected, setSelected] = useState([]);

  // بيانات الصف
  const [className, setClassName] = useState("");
  const [stage, setStage] = useState("");
  const [ageSelected, setAgeSelected] = useState([]); // اختيار متعدد
  const [ageMenuOpen, setAgeMenuOpen] = useState(false);

  // صورة الصف
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState("");

  const nameInputRef = useRef(null);

  /* ---------- جلب الروضات (Realtime) ---------- */
  useEffect(() => {
    const qKg = query(collection(db, "kindergartens"), orderBy("name"));
    const stop = onSnapshot(qKg, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      setKgList(arr);
      setLoading(false);
      if (kgIdParam && !kgId) setKgId(kgIdParam);
    });
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- عند اختيار الروضة: بيانات + فروع + طلاب (Realtime) ---------- */
  useEffect(() => {
    setError(""); setSuccess("");
    setBranches([]); setBranchId("");
    setTeacherOptions([]); setTeacherId("");
    setStudents([]);
    setStageOptions([]); setAgeOptions([]);
    setProvinceName("");
    setAgeSelected([]);

    if (!kgId) { setKg(null); return; }

    const kRef = doc(db, "kindergartens", kgId);
    const unsubKg = onSnapshot(kRef, (d) => {
      if (!d.exists()) { setError("الروضة غير موجودة."); return; }
      const x = d.data() || {};
      setKg({ id: d.id, ...x });
      setStageOptions(Array.isArray(x.stages) ? x.stages : []);
      setAgeOptions(Array.isArray(x.ageGroups) ? x.ageGroups : []);
      setProvinceName(x.provinceName || x.province || "");
    });

    const qBranches = query(collection(db, "branches"), where("parentId", "==", kgId));
    const unsubBranches = onSnapshot(qBranches, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      setBranches(list);
    });

    const qStudents = query(collection(db, "students"), where("kindergartenId", "==", kgId));
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      const arr = snap.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          fullName: fullName(x),
          age: yearsFromDob(x.dob),
          branchId: x.branchId || null,
          classId: x.classId || null,
          photoURL: x.photoURL || x.avatarURL || x.imageURL || "",
        };
      });
      arr.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
      setStudents(arr);
    });

    setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => { try {unsubKg();} catch{} try {unsubBranches();} catch{} try {unsubStudents();} catch{} };
  }, [kgId]);

  /* ---------- المعلّمون (Realtime مجموعات IDs) ---------- */
  useEffect(() => {
    let unsubs = [];
    const stop = () => { unsubs.forEach(u => { try { u(); } catch {} }); unsubs = []; };

    (async () => {
      stop();
      setTeacherOptions([]); setTeacherId("");

      const rootIds = Array.from(new Set(kg?.teacherIds || []));
      let ids = [...rootIds];
      if (branchId) {
        const br = branches.find(b => b.id === branchId);
        ids = Array.from(new Set([...(br?.teacherIds || []), ...rootIds]));
      }
      if (!ids.length) return;

      chunk(ids, 10).forEach(group => {
        const unsub = onSnapshot(
          query(collection(db, "teachers"), where(documentId(), "in", group)),
          (snap) => {
            setTeacherOptions(prev => {
              const map = new Map(prev.map(o => [o.id, o]));
              snap.forEach(d => {
                const x = d.data() || {};
                map.set(d.id, {
                  id: d.id,
                  label: fullName(x),
                  subtitle: x.email || x.phone || "",
                  active: !!x.active,
                });
              });
              const arr = Array.from(map.values());
              arr.sort((a, b) => a.label.localeCompare(b.label, "ar"));
              return arr;
            });
          }
        );
        unsubs.push(unsub);
      });
    })();

    return () => stop();
  }, [kg?.id, kg?.teacherIds, branchId, branches]);

  /* ---------- الفلترة بحسب “الفئات العمرية” المختارة ---------- */
  const parsedAgeRanges = useMemo(
    () => ageSelected.map(parseAgeSpec).filter(Boolean),
    [ageSelected]
  );

  const filteredStudents = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return students.filter((s) => {
      if (hideAssigned && s.classId) return false;
      if (q && !s.fullName.toLowerCase().includes(q)) return false;

      // إن لم تُحدَّد فئات عمرية → لا قيد على العمر
      if (!parsedAgeRanges.length) return true;

      if (s.age == null) return false;
      // صالح إن طابق أي مدى
      return parsedAgeRanges.some(r => s.age >= r.min && s.age <= r.max);
    });
  }, [students, hideAssigned, filterText, parsedAgeRanges]);

  const allFilteredIds = useMemo(() => filteredStudents.map(s => s.id), [filteredStudents]);

  const stats = useMemo(() => {
    const total = students.length;
    const assigned = students.filter(s => !!s.classId).length;
    const visible = filteredStudents.length;
    const unassigned = total - assigned;
    return { total, assigned, visible, unassigned };
  }, [students, filteredStudents]);

  function toggleSelect(id) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }
  function selectAllFiltered() {
    setSelected(prev => Array.from(new Set([...prev, ...allFilteredIds])));
  }
  function clearSelection() { setSelected([]); }

  /* ---------- صورة الصف ---------- */
  function onPickThumb(file) {
    setThumbFile(file || null);
    if (!file) return setThumbPreview("");
    const r = new FileReader();
    r.onload = () => setThumbPreview(r.result);
    r.readAsDataURL(file);
  }

  /* ---------- حفظ (محسّن مع التجزئة) ---------- */
  async function save(e) {
    e?.preventDefault?.();
    setError(""); setSuccess("");

    if (!kgId) return setError("اختر الروضة.");
    if (!className.trim()) return setError("أدخل اسم الصف.");
    if (stageOptions.length && !stage) return setError("اختر المرحلة التعليمية.");

    try {
      setSaving(true);

      const parentId = branchId || kgId;
      const parentName = branchId
        ? (branches.find(b => b.id === branchId)?.name || "فرع")
        : (kg?.name || "");

      const classRef = doc(collection(db, "classes"));
      let thumbnailURL = "";

      if (thumbFile) {
        const path = `classes/${classRef.id}/thumb_${Date.now()}_${thumbFile.name}`;
        const r = ref(storage, path);
        await uploadBytes(r, thumbFile);
        thumbnailURL = await getDownloadURL(r);
      }

      const teacher = teacherOptions.find(t => t.id === teacherId) || null;

      // لا نسجّل طلابًا لديهم صف بالفعل (حماية إضافية)
      const selectedEligible = Array.from(new Set(
        selected.filter(sid => {
          const s = students.find(x => x.id === sid);
          return !s?.classId;
        })
      ));

      // نُخزّن كلا الحقلين: ageGroup (توافق قديم) + ageGroups (جديد متعدد)
      const ageGroupCompat = ageSelected.length === 1 ? ageSelected[0] : null;

      // 1) إنشاء الصف + تحديث عدّاد الأب
      {
        const batch = writeBatch(db);

        batch.set(classRef, {
          name: className.trim(),
          stage: stage || null,
          ageGroup: ageGroupCompat,       // توافق قديم
          ageGroups: ageSelected || [],   // الجديد (متعدد)
          thumbnailURL,
          parentId,
          parentName,
          kindergartenId: kg?.id || kgId,
          kindergartenName: kg?.name || "",
          teacherId: teacherId || null,
          teacherName: teacher?.label || "",
          teacherActive: !!teacher?.active,
          studentIds: selectedEligible,
          studentCount: selectedEligible.length || 0,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (branchId) {
          batch.set(doc(db, "branches", branchId), {}, { merge: true });
          batch.update(doc(db, "branches", branchId), {
            classCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.update(doc(db, "kindergartens", kgId), {
            classCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }

        await batch.commit();
      }

      // 2) إسناد الطلاب على دفعات آمنة
      if (selectedEligible.length) {
        await assignStudentsInChunks({
          studentIds: selectedEligible,
          classRef,
          className,
          parentId,
          kgId,
          branchId,
        });
      }

      // توجيه لقائمة الصفوف (ستظهر مباشرة بفضل Realtime في صفحة القائمة)
      navigate("/classes");
    } catch (e1) {
      console.error(e1);
      setError(e1?.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  function kgDisplayCode(x) {
    return x.registrationCode || x.code || x.kgCode || "";
  }

  /* ---------- أنماط خفيفة للمنسدلة الخاصة بالفئات ---------- */
  const localStyles = `
  .age-select{position:relative}
  .age-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
  .age-menu{position:absolute;inset-inline:0;top:100%;margin-top:6px;background:#0b1220;border:1px solid #243244;border-radius:10px;box-shadow:0 18px 40px rgba(0,0,0,.35);z-index:20;overflow:hidden}
  .age-head{display:flex;gap:8px;padding:8px;border-bottom:1px solid #1f2a37}
  .age-chip{border:1px solid #204b36;background:rgba(34,197,94,.08);color:#c7ffd8;border-radius:9999px;padding:4px 8px;font-size:12px;cursor:pointer}
  .age-chip--ghost{border:1px solid #2b3a4c;background:transparent;color:#cbd5e1}
  .age-list{max-height:220px;overflow:auto}
  .age-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #12202c;cursor:pointer}
  .age-row:hover{background:rgba(255,255,255,.03)}
  .age-row.selected{background:rgba(34,197,94,.10)}
  .age-check{width:18px;height:18px;border-radius:4px;border:2px solid #22c55e;display:inline-grid;place-items:center}
  .age-check svg{display:block}
  .ap-student{display:flex;align-items:center;gap:10px}
  .ap-ava{width:34px;height:34px;border-radius:50%;overflow:hidden;border:1px solid #243244;background:#12202c;display:grid;place-items:center;font-size:16px}
  .ap-ava img{width:100%;height:100%;object-fit:cover}
  `;

  return (
    <div className="ap-page">
      <style>{localStyles}</style>

      <div className="ap-hero">
        <h1 className="ap-hero__title">إنشاء صف</h1>
        <p className="ap-hero__sub">
          اختر الروضة (ويظهر <b>رمزها</b> بجانب الاسم)، ثم حدّد فرعًا إن وُجد، وبعدها المرحلة و<span>الفئات العمرية</span> والمعلّم واختر الطلاب.
        </p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>بيانات الصف</div>
          {kg && <div className="ap-note">المحافظة: <b>{provinceName || "—"}</b></div>}
        </div>

        <form className="ap-card__body ap-form" onSubmit={save}>
          {error && <div className="ap-error" style={{ marginBottom: 8 }}>⚠️ {error}</div>}
          {success && <div className="ap-success" style={{ marginBottom: 8 }}>{success}</div>}

          {/* الروضة */}
          <div className="ap-field">
            <label><span className="ap-required">*</span> الروضة</label>
            <select className="ap-input" value={kgId} onChange={(e) => setKgId(e.target.value)}>
              <option value="">{loading ? "جارِ التحميل…" : "— اختر —"}</option>
              {kgList.map((k) => {
                const code = kgDisplayCode(k);
                const label = code ? `${k.name || k.id} — [${code}]` : (k.name || k.id);
                return <option key={k.id} value={k.id}>{label}</option>;
              })}
            </select>
          </div>

          {/* الفرع */}
          <div className="ap-field">
            <label>الفرع (اختياري)</label>
            <select className="ap-input" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!kgId || branches.length === 0}>
              <option value="">{kgId ? (branches.length ? "الفرع الرئيسي" : "لا توجد فروع") : "اختر الروضة أولًا"}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
            </select>
          </div>

          {/* صورة الصف */}
          <div className="ap-field">
            <label>صورة الصف</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label className="ap-upload" style={{ whiteSpace: "nowrap" }}>
                اختيار صورة
                <input type="file" accept="image/*" onChange={(e) => onPickThumb(e.target.files?.[0])} />
              </label>
              {thumbPreview ? (
                <img src={thumbPreview} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid #2b3a4c" }} />
              ) : (
                <div style={{ width: 80, height: 80, display: "grid", placeItems: "center", borderRadius: 8, border: "1px dashed #2b3a4c", color: "#94a3b8" }}>🏫</div>
              )}
            </div>
          </div>

          {/* اسم الصف */}
          <div className="ap-field">
            <label><span className="ap-required">*</span> اسم الصف</label>
            <input ref={nameInputRef} className="ap-input" dir="auto" placeholder="مثال: تمهيدي (أ)" value={className} onChange={(e) => setClassName(e.target.value)} />
          </div>

          {/* المرحلة التعليمية */}
          <div className="ap-field">
            <label>المرحلة التعليمية</label>
            <select className="ap-input" value={stage} onChange={(e) => setStage(e.target.value)} disabled={!kgId || !stageOptions.length}>
              <option value="">{stageOptions.length ? "— اختر —" : "لا مراحل مُسجَّلة"}</option>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* الفئات العمرية (منسدلة متعددة مثل الـ select) */}
          <div className="ap-field age-select">
            <label>الفئات العمرية (لفئة الطلاب)</label>
            <button
              type="button"
              className="ap-input age-trigger"
              onClick={() => setAgeMenuOpen((v) => !v)}
              aria-expanded={ageMenuOpen ? "true" : "false"}
            >
              <span>{ageSelected.length ? summarizeAges(ageSelected) : "— اختر —"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
            </button>

            {ageMenuOpen && (
              <div className="age-menu" role="listbox">
                <div className="age-head">
                  <button type="button" className="age-chip" onClick={() => setAgeSelected(ageOptions)}>تحديد الكل</button>
                  <button type="button" className="age-chip age-chip--ghost" onClick={() => setAgeSelected([])}>إلغاء الكل</button>
                </div>
                <div className="age-list">
                  {ageOptions.length === 0 && <div className="age-row" style={{ opacity: .7, cursor: "default" }}>لا فئات مُسجَّلة.</div>}
                  {ageOptions.map((g) => {
                    const sel = ageSelected.includes(g);
                    return (
                      <div
                        key={g}
                        className={`age-row ${sel ? "selected" : ""}`}
                        onClick={() =>
                          setAgeSelected((prev) => sel ? prev.filter(x => x !== g) : [...prev, g])
                        }
                      >
                        <div className="age-check" aria-checked={sel}>
                          {sel && (
                            <svg viewBox="0 0 24 24" width="14" height="14">
                              <path d="M4 12l5 5 11-11" fill="none" stroke="currentColor" strokeWidth="3" />
                            </svg>
                          )}
                        </div>
                        <div>{g}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* المعلّم */}
          <div className="ap-field">
            <label>المعلّم المسؤول</label>
            <select className="ap-input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!kgId || !teacherOptions.length}>
              <option value="">{teacherOptions.length ? "— اختر —" : (kgId ? "لا معلّمين مرتبطين" : "اختر الروضة أولًا")}</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.label}{t.active ? "" : " — (غير نشِط)"}</option>
              ))}
            </select>
            <div className="ap-note">تظهر معلّمو الفرع أولًا (إن وُجدوا) ثم معلّمو الروضة.</div>
          </div>

          {/* اختيار الطلاب */}
          <div className="ap-section ap-span-2" style={{ marginTop: 6 }}>
            <div className="ap-section__head">
              <h3>اختيار الطلاب</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="ap-btn ap-btn--soft" onClick={selectAllFiltered} disabled={!kgId}>تحديد كل الظاهر</button>
                <button type="button" className="ap-btn" onClick={clearSelection}>إلغاء التحديد</button>
              </div>
            </div>

            {/* فلاتر مصغرة: بحث + إخفاء المسجّلين */}
            <div className="ap-grid-3" style={{ marginBottom: 8, gap: 8 }}>
              <div className="ap-field">
                <label>بحث</label>
                <input className="ap-input" placeholder="بحث بالاسم…" value={filterText} onChange={(e) => setFilterText(e.target.value)} disabled={!kgId} />
              </div>
              <div className="ap-field" style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: 0 }}>
                  <input type="checkbox" checked={hideAssigned} onChange={(e) => setHideAssigned(e.target.checked)} disabled={!kgId} />
                  إخفاء الطلاب المسجّلين مسبقًا
                </label>
              </div>
            </div>

            {/* ملحوظة حيّة */}
            {kgId && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  border: "1px solid #243244",
                  background: "linear-gradient(0deg, rgba(34,197,94,.08), rgba(34,197,94,.04))",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 8
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {branchId ? <>سيُسجَّل الصف ضمن الفرع <b>“{branches.find(b => b.id === branchId)?.name || "فرع"}”</b></>
                           : <>سيُسجَّل الصف ضمن <b>الروضة الرئيسية</b></>}
                </div>
                <div style={{ color: "#a1a1aa" }}>
                  {hideAssigned
                    ? <>تم إخفاء الطلاب المسجّلين مسبقًا. المعروض الآن <b>{stats.visible}</b> طالبًا غير مسجّل من أصل <b>{stats.unassigned}</b>.</>
                    : <>المعروض الآن <b>{stats.visible}</b> طالبًا من أصل <b>{stats.total}</b>.</>}
                  {ageSelected.length
                    ? <> — فلاتر العمر: <b>{summarizeAges(ageSelected)}</b>.</>
                    : <> — كل الأعمار.</>}
                </div>
              </div>
            )}

            {/* قائمة الطلاب */}
            <div style={{ display: "grid", gap: 6, maxHeight: 360, overflow: "auto", paddingRight: 4 }}>
              {filteredStudents.map((s) => {
                const isSel = selected.includes(s.id);
                const brName = s.branchId && branches.find((b) => b.id === s.branchId)?.name;
                return (
                  <div
                    key={s.id}
                    className="ap-line"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 10px",
                      border: "1px solid #243244",
                      borderRadius: 8,
                      background: isSel ? "rgba(34,197,94,.12)" : "#0f172a",
                      cursor: "pointer",
                    }}
                    onClick={() => toggleSelect(s.id)}
                  >
                    <div className="ap-student">
                      <div className="ap-ava">
                        {s.photoURL ? <img src={s.photoURL} alt="" /> : <span>👦</span>}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.fullName}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>
                          {s.age != null ? `${s.age} سنة` : "—"} {brName ? `— ${brName}` : (s.branchId ? "— فرع" : "— روضة")}
                        </div>
                      </div>
                    </div>
                    {s.classId && <span className="ap-note" title="منسّب مسبقًا">لديه صف</span>}
                  </div>
                );
              })}
              {kgId && filteredStudents.length === 0 && <div className="ap-note">لا نتائج مطابقة.</div>}
              {!kgId && <div className="ap-note">اختر الروضة لعرض الطلاب.</div>}
            </div>
          </div>

          {/* أزرار */}
          <div className="ap-actions ap-span-2" style={{ marginTop: 10 }}>
            <button type="button" className="ap-btn" onClick={() => navigate(-1)}>رجوع</button>
            <button type="submit" className="ap-btn ap-btn--primary" disabled={saving || !kgId}>
              {saving ? "جاري الإنشاء…" : "إنشاء الصف"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
