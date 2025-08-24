// src/pages/ChangeClass.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  increment,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebase";
import "./FormStyles.css";

/* ——————— أدوات صغيرة ——————— */
function fullName(x) {
  return [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—";
}
function initials(n = "") {
  const p = String(n).trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "👦";
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
function pickPhotoURL(x = {}) {
  return (
    x.photoURL ||
    x.avatarURL ||
    x.avatarUrl ||
    x.imageURL ||
    x.imageUrl ||
    x.profilePhotoURL ||
    x.profilePhotoUrl ||
    x.photo ||
    x.image ||
    ""
  );
}
function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ——————— الصفحة ——————— */
export default function ChangeClass() {
  const { kgId: kgIdParam } = useParams();

  /* اختيار الروضة */
  const [kgList, setKgList] = useState([]);
  const [kgId, setKgId] = useState(kgIdParam || "");
  const [kg, setKg] = useState(null);

  /* الفروع + الصفوف */
  const [branches, setBranches] = useState([]); // {id,name}
  const [classes, setClasses] = useState([]);   // {id,name,parentId,parentName}

  /* الطلاب */
  const [students, setStudents] = useState([]); // all students in KG

  /* لوائح التحكم */
  const [srcClassId, setSrcClassId] = useState(""); // مصدر: صف محدّد أو كل الصفوف
  const [dstClassId, setDstClassId] = useState(""); // الوجهة
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState([]);     // ids

  /* تحميل الروضات العام */
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "kindergartens"), orderBy("name")),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setKgList(arr);
      }
    );
    return () => unsub();
  }, []);

  /* عند اختيار الروضة: حمّل فرع/صف/طلاب */
  useEffect(() => {
    setKg(null);
    setBranches([]);
    setClasses([]);
    setStudents([]);
    setSrcClassId("");
    setDstClassId("");
    setSelected([]);

    if (!kgId) return;

    const unsubKg = onSnapshot(doc(db, "kindergartens", kgId), (d) => {
      if (d.exists()) setKg({ id: d.id, ...(d.data() || {}) });
    });

    const unsubBranches = onSnapshot(
      query(collection(db, "branches"), where("parentId", "==", kgId)),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setBranches(arr);
      }
    );

    const unsubClasses = onSnapshot(
      query(collection(db, "classes"), where("kindergartenId", "==", kgId)),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setClasses(arr);
      }
    );

    const unsubStudents = onSnapshot(
      query(collection(db, "students"), where("kindergartenId", "==", kgId)),
      (snap) => {
        const arr = snap.docs.map((d) => {
          const x = d.data() || {};
          const nm = fullName(x);
          return {
            id: d.id,
            name: nm,
            age: yearsFromDob(x.dob),
            classId: x.classId || "",
            className: x.className || "",
            branchId: x.branchId || "",
            photoURL: pickPhotoURL(x),
          };
        });
        arr.sort((a, b) => a.name.localeCompare(b.name, "ar"));
        setStudents(arr);
      }
    );

    return () => {
      try { unsubKg(); } catch {}
      try { unsubBranches(); } catch {}
      try { unsubClasses(); } catch {}
      try { unsubStudents(); } catch {}
    };
  }, [kgId]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name || "";

  /* لوائح مشتقّة */
  const classLabel = (c) => {
    const isRoot = c.parentId === kgId;
    const prefix = isRoot ? "روضة" : `فرع: ${branchName(c.parentId) || c.parentName || ""}`;
    return `${prefix} — ${c.name || c.id}`;
  };

  const srcList = useMemo(() => {
    const key = q.trim().toLowerCase();
    return students.filter((s) => {
      if (srcClassId && s.classId !== srcClassId) return false;
      if (key && !s.name.toLowerCase().includes(key)) return false;
      return true;
    });
  }, [students, srcClassId, q]);

  const dstList = useMemo(
    () => (dstClassId ? students.filter((s) => s.classId === dstClassId) : []),
    [students, dstClassId]
  );

  const destClass = useMemo(
    () => (dstClassId ? classes.find((c) => c.id === dstClassId) : null),
    [classes, dstClassId]
  );

  const canMove = selected.length > 0 && !!destClass;

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function selectAllVisible() {
    const ids = srcList.map((s) => s.id);
    setSelected(ids);
  }
  function clearSelection() {
    setSelected([]);
  }

  /* تنفيذ النقل */
  async function moveSelected() {
    if (!canMove) return;
    // لا تنقل من صف إلى نفسه
    const selectedStudents = students.filter((s) => selected.includes(s.id));
    const sameClass = selectedStudents.every((s) => s.classId === destClass.id);
    if (sameClass) {
      alert("الطلاب المحدّدون موجودون بالفعل في الصف الوجهة.");
      return;
    }

    // إعداد الحقول الوجهة
    const isRoot = destClass.parentId === kgId;
    const destBranchId = isRoot ? null : destClass.parentId;

    // تجميع إنقاص/زيادة العدّاد حسب الصف المصدر
    const decMap = new Map(); // srcClassId -> count
    selectedStudents.forEach((s) => {
      if (s.classId) decMap.set(s.classId, (decMap.get(s.classId) || 0) + 1);
    });

    // نجزّئ الدفعات لتفادي الحجم
    const chunks = chunk(selectedStudents, 400);
    for (let i = 0; i < chunks.length; i++) {
      const batch = writeBatch(db);
      chunks[i].forEach((s) => {
        batch.update(doc(db, "students", s.id), {
          classId: destClass.id,
          className: destClass.name || "",
          parentId: destClass.parentId,
          kindergartenId: kgId, // ثابت
          branchId: destBranchId,
          updatedAt: serverTimestamp(),
        });
      });

      // تحديث عدّادات الصفوف (المقطع الأخير يكفي، ولكن لا ضرر بتكرار updatedAt)
      if (i === chunks.length - 1) {
        // إنقاص من المصادر
        decMap.forEach((count, srcId) => {
          if (srcId && srcId !== destClass.id) {
            batch.update(doc(db, "classes", srcId), {
              studentCount: increment(-count),
              updatedAt: serverTimestamp(),
            });
          }
        });
        // زيادة الوجهة
        const incBy = selectedStudents.filter((s) => s.classId !== destClass.id).length;
        if (incBy > 0) {
          batch.update(doc(db, "classes", destClass.id), {
            studentCount: increment(incBy),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    }

    // تفريغ الاختيار
    setSelected([]);
    alert("تم نقل الطلاب بنجاح.");
  }

  /* تنسيقات محلية بسيطة لجدول النقل (تعتمد FormStyles.css للألوان) */
  const localCss = `
  .mc-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width: 980px){ .mc-grid{grid-template-columns:1fr} }
  .mc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
  .mc-col{border:1px solid rgba(226,232,240,.14);border-radius:16px;background:rgba(255,255,255,.05)}
  .mc-col__body{padding:12px}
  .mc-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:8px}
  .mc-list{max-height:58vh;overflow:auto;display:grid;gap:6px}
  .mc-row{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #243244;border-radius:10px;background:#0f172a}
  .mc-left{display:flex;align-items:center;gap:10px}
  .mc-ava{width:34px;height:34px;border-radius:50%;overflow:hidden;background:#0b1324;border:1px solid #243244;display:grid;place-items:center}
  .mc-ava img{width:100%;height:100%;object-fit:cover}
  .mc-name{font-weight:700}
  .mc-sub{color:#94a3b8;font-size:12px}
  `;

  return (
    <div className="ap-page">
      <style>{localCss}</style>

      <div className="ap-hero">
        <h1 className="ap-hero__title">نقل الطلاب بين الصفوف</h1>
        <p className="ap-hero__sub">اختر الروضة ثم حدّد صف المصدر وطلابك، واختر صف الوجهة ثم انقل.</p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>الإعداد</div>
          {kg && <div className="ap-note">الروضة: <b>{kg.name}</b></div>}
        </div>

        <div className="ap-card__body">
          {/* اختيار الروضة */}
          <div className="ap-form">
            <div className="ap-field">
              <label>الروضة</label>
              <select className="ap-input" value={kgId} onChange={(e) => setKgId(e.target.value)}>
                <option value="">{kgList.length ? "— اختر —" : "جارِ التحميل…"}</option>
                {kgList.map((k) => (
                  <option key={k.id} value={k.id}>{k.name || k.id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* الأعمدة */}
          <div className="mc-grid" style={{ marginTop: 10 }}>
            {/* من صف */}
            <div className="mc-col">
              <div className="ap-card__head" style={{ borderBottom: "1px solid rgba(226,232,240,.14)" }}>
                <div>من الصف</div>
                <div className="ap-note">المصدر</div>
              </div>
              <div className="mc-col__body">
                <div className="mc-toolbar">
                  <select className="ap-input" value={srcClassId} onChange={(e) => setSrcClassId(e.target.value)} disabled={!kgId}>
                    <option value="">كل الصفوف</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{classLabel(c)}</option>
                    ))}
                  </select>
                  <input
                    className="ap-input"
                    placeholder="بحث بالاسم…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    disabled={!kgId}
                    style={{ flex: 1 }}
                  />
                  <button className="ap-btn" onClick={selectAllVisible} disabled={!kgId || srcList.length === 0}>تحديد الكل</button>
                  <button className="ap-btn" onClick={clearSelection} disabled={selected.length === 0}>مسح التحديد</button>
                </div>

                <div className="mc-list">
                  {!kgId ? (
                    <div className="ap-note">اختر الروضة أولًا.</div>
                  ) : srcList.length === 0 ? (
                    <div className="ap-note">لا نتائج.</div>
                  ) : (
                    srcList.map((s) => {
                      const br = s.branchId ? (branchName(s.branchId) || "فرع") : "روضة";
                      return (
                        <label key={s.id} className="mc-row" style={{ cursor: "pointer" }}>
                          <div className="mc-left">
                            <input
                              type="checkbox"
                              checked={selected.includes(s.id)}
                              onChange={() => toggle(s.id)}
                              aria-label={`اختر ${s.name}`}
                            />
                            <div className="mc-ava">
                              {s.photoURL ? <img src={s.photoURL} alt="" /> : <span>{initials(s.name)}</span>}
                            </div>
                            <div>
                              <div className="mc-name">{s.name}</div>
                              <div className="mc-sub">
                                {(s.age != null ? `${s.age} سنة` : "—")} — {s.className || "بدون صف"} — {br}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* إلى صف */}
            <div className="mc-col">
              <div className="ap-card__head" style={{ borderBottom: "1px solid rgba(226,232,240,.14)" }}>
                <div>إلى الصف</div>
                <div className="ap-note">الوجهة</div>
              </div>
              <div className="mc-col__body">
                <div className="mc-toolbar">
                  <select className="ap-input" value={dstClassId} onChange={(e) => setDstClassId(e.target.value)} disabled={!kgId} style={{ flex: 1 }}>
                    <option value="">— اختر الصف الوجهة —</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{classLabel(c)}</option>
                    ))}
                  </select>
                  <button className="ap-btn ap-btn--primary" onClick={moveSelected} disabled={!canMove}>
                    نقل {selected.length ? `(${selected.length})` : ""}
                  </button>
                </div>

                <div className="mc-list">
                  {!dstClassId ? (
                    <div className="ap-note">اختر صف الوجهة لعرض طلابه.</div>
                  ) : dstList.length === 0 ? (
                    <div className="ap-note">لا طلاب في الصف الوجهة.</div>
                  ) : (
                    dstList.map((s) => (
                      <div key={s.id} className="mc-row">
                        <div className="mc-left">
                          <div className="mc-ava">
                            {s.photoURL ? <img src={s.photoURL} alt="" /> : <span>{initials(s.name)}</span>}
                          </div>
                          <div>
                            <div className="mc-name">{s.name}</div>
                            <div className="mc-sub">{s.age != null ? `${s.age} سنة` : "—"}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ملاحظة فوتَر */}
          <div className="ap-note" style={{ marginTop: 8 }}>
            يتم تحديث العدّادات والصفوف لحظيًا. عند النقل من عدة صفوف، يتم إنقاص العدّاد من كل صفّ مصدر وزيادته في صفّ الوجهة.
          </div>
        </div>
      </section>
    </div>
  );
}
