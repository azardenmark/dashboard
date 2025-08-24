// src/pages/Classes.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  documentId,
} from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";
import "./FormStyles.css"; // ستايلات موحّدة

/* ---------------- أدوات صغيرة مشتركة ---------------- */
function chunk(arr, size = 400) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function fullName(x) {
  return [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—";
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
function studentCode(x) {
  return (
    x.code ||
    x.studentCode ||
    x.registrationCode ||
    (x.id ? x.id.slice(-6).toUpperCase() : "—")
  );
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
function initials(name = "") {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "👦";
}

/* ---------------- نافذة/مودال صغيرة بستايل FormStyles ---------------- */
function Modal({ open, title, onClose, children, actions }) {
  if (!open) return null;
  return (
    <div className="ap-modal__backdrop" onClick={onClose}>
      <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ap-modal__head">
          <div className="ap-modal__title">{title}</div>
          <button className="ap-btn" onClick={onClose} aria-label="إغلاق">✖</button>
        </div>
        <div className="ap-modal__body">{children}</div>
        {actions && <div className="ap-modal__foot">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------- جدول طلاب داخل الصف (مع الصور) ---------------- */
function StudentsTable({ classId }) {
  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (!classId) return;
    const unsub = onSnapshot(
      query(collection(db, "students"), where("classId", "==", classId)),
      (snap) => {
        const arr = snap.docs.map((d) => {
          const x = d.data() || {};
          const name = fullName(x);
          return {
            id: d.id,
            name,
            age: yearsFromDob(x.dob),
            code: studentCode({ ...x, id: d.id }),
            photoURL: pickPhotoURL(x),
          };
        });
        arr.sort((a, b) => a.name.localeCompare(b.name, "ar"));
        setStudents(arr);
      }
    );
    return () => unsub();
  }, [classId]);

  return (
    <div className="ap-table-wrap" style={{ marginTop: 6 }}>
      <table className="ap-table">
        <thead>
          <tr>
            <th style={{ width: 42 }}></th>
            <th>الاسم</th>
            <th style={{ width: 120 }}>العمر</th>
            <th style={{ width: 160 }}>الكود</th>
          </tr>
        </thead>
        <tbody>
          {students.length ? (
            students.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="ap-ava" title={s.name}>
                    {s.photoURL ? (
                      <img src={s.photoURL} alt="" />
                    ) : (
                      <span>{initials(s.name)}</span>
                    )}
                  </div>
                </td>
                <td>{s.name}</td>
                <td>{s.age != null ? `${s.age} سنة` : "—"}</td>
                <td>
                  <span className="ap-code">{s.code}</span>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="ap-note" colSpan={4}>
                لا طلاب حتى الآن.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- نافذة تعديل الصف ---------------- */
function EditClassModal({ open, onClose, klass, kg, branch, teacherOptions }) {
  const [name, setName] = useState(klass?.name || "");
  const [stage, setStage] = useState(klass?.stage || "");
  const [teacherId, setTeacherId] = useState(klass?.teacherId || "");
  const [active, setActive] = useState(klass?.active ?? true);

  useEffect(() => {
    if (!open) return;
    setName(klass?.name || "");
    setStage(klass?.stage || "");
    setTeacherId(klass?.teacherId || "");
    setActive(klass?.active ?? true);
  }, [open, klass]);

  async function save() {
    if (!klass?.id) return;
    const t = teacherOptions.find((t) => t.id === teacherId);
    await updateDoc(doc(db, "classes", klass.id), {
      name: name.trim() || klass.name,
      stage: stage || null,
      teacherId: teacherId || null,
      teacherName: t?.label || "",
      teacherActive: !!t?.active,
      active,
      updatedAt: serverTimestamp(),
    });
    onClose?.("saved");
  }

  return (
    <Modal
      open={open}
      onClose={() => onClose?.()}
      title={`تعديل الصف — ${klass?.name || ""}`}
      actions={
        <>
          <button className="ap-btn" onClick={() => onClose?.()}>إلغاء</button>
          <button className="ap-btn ap-btn--primary" onClick={save}>حفظ</button>
        </>
      }
    >
      <div className="ap-form ap-grid-2">
        <div className="ap-field">
          <label>اسم الصف</label>
          <input className="ap-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="ap-field">
          <label>المرحلة التعليمية</label>
          <select className="ap-input" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">{(kg?.stages?.length ? "— اختر —" : "لا مراحل")}</option>
            {(kg?.stages || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="ap-field">
          <label>المعلّم المسؤول</label>
          <select className="ap-input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">— بدون —</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.active ? "" : " — (غير نشِط)"}
              </option>
            ))}
          </select>
        </div>
        <div className="ap-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input id="active" type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <label htmlFor="active">الصف نشِط</label>
        </div>
        {branch && (
          <div className="ap-note ap-span-2">
            هذا الصف ضمن الفرع: <b>{branch?.name || branch?.id}</b>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- صف صفّ واحد ---------------- */
function ClassRow({ klass, kg, branch, teacherOptions, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(`سيتم حذف الصف «${klass.name}» وفكّ تنسيب جميع طلابه. هل أنت متأكد؟`)
    )
      return;

    // طلاب الصف
    const studentsSnap = await getDocs(
      query(collection(db, "students"), where("classId", "==", klass.id))
    );
    const students = studentsSnap.docs.map((d) => ({ id: d.id }));

    // الأب (روضة أو فرع)
    const parentRef = branch ? doc(db, "branches", branch.id) : doc(db, "kindergartens", kg.id);

    // دفعات آمنة
    const groups = chunk(students, 400);
    for (let i = 0; i < groups.length; i++) {
      const batch = writeBatch(db);
      groups[i].forEach((s) => {
        batch.update(doc(db, "students", s.id), {
          classId: null,
          className: null,
          updatedAt: serverTimestamp(),
        });
      });
      if (i === groups.length - 1) {
        batch.delete(doc(db, "classes", klass.id));
      }
      batch.update(parentRef, { updatedAt: serverTimestamp() });
      await batch.commit();
    }
    onDeleted?.(klass);
  }

  return (
    <>
      <div className="ap-line ap-line--click" onClick={() => setOpen((v) => !v)}>
        <div className="ap-line__left">
          <svg
            className={`ap-caret ${open ? "ap-caret--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="ap-line__title">{klass.name}</div>
          {!klass.active && <span className="ap-chip">غير نشِط</span>}
        </div>
        <div className="ap-line__right">
          <span className="ap-chip ap-chip--kpi">{klass.studentCount ?? "—"} طلاب</span>
          {klass.teacherName ? (
            <span className="ap-chip">المعلّم: {klass.teacherName}</span>
          ) : (
            <span className="ap-chip">بدون معلّم</span>
          )}
          {klass.stage ? <span className="ap-chip">المرحلة: {klass.stage}</span> : null}
          <button
            className="ap-btn"
            title="تعديل"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
          >
            ✏️
          </button>
          <button
            className="ap-btn ap-btn--danger"
            title="حذف"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      {open && (
        <div className="ap-nested">
          <StudentsTable classId={klass.id} />
        </div>
      )}

      <EditClassModal
        open={editOpen}
        onClose={(result) => {
          setEditOpen(false);
          if (result === "saved") {
            /* realtime سيحدّث تلقائيًا */
          }
        }}
        klass={klass}
        kg={kg}
        branch={branch}
        teacherOptions={teacherOptions}
      />
    </>
  );
}

/* ---------------- كتلة فرع ---------------- */
function BranchBlock({ branch, kg, teacherPoolMap }) {
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState([]);
  const [teacherOptions, setTeacherOptions] = useState([]);

  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(
      query(collection(db, "classes"), where("parentId", "==", branch.id)),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setClasses(arr);
      }
    );
    return () => unsub();
  }, [open, branch.id]);

  useEffect(() => {
    const ids = Array.from(new Set([...(branch.teacherIds || []), ...(kg.teacherIds || [])]));
    const options = ids.map((id) => teacherPoolMap.get(id)).filter(Boolean);
    options.sort((a, b) => a.label.localeCompare(b.label, "ar"));
    setTeacherOptions(options);
  }, [teacherPoolMap, branch.teacherIds, kg.teacherIds]);

  return (
    <>
      <div className="ap-line ap-line--click" onClick={() => setOpen((v) => !v)}>
        <div className="ap-line__left">
          <svg
            className={`ap-caret ${open ? "ap-caret--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="ap-line__title">فرع: {branch.name || branch.id}</div>
        </div>
        <div className="ap-line__right">
          <span className="ap-chip">الموقع: {branch.address || "—"}</span>
        </div>
      </div>

      {open && (
        <div className="ap-nested">
          {classes.length === 0 ? (
            <div className="ap-note ap-line">لا صفوف في هذا الفرع.</div>
          ) : (
            classes.map((c) => (
              <ClassRow
                key={c.id}
                klass={c}
                kg={kg}
                branch={branch}
                teacherOptions={teacherOptions}
                onDeleted={() => {}}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}

/* ---------------- كتلة روضة ---------------- */
function KgBlock({ kg, navigate }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [kgClasses, setKgClasses] = useState([]);
  const [teacherPoolMap, setTeacherPoolMap] = useState(new Map());

  useEffect(() => {
    if (!open) return;
    const unsubs = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, "branches"), where("parentId", "==", kg.id)),
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
          setBranches(arr);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "classes"), where("parentId", "==", kg.id)),
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
          setKgClasses(arr);
        }
      )
    );

    (async () => {
      const branchSnap = await getDocs(query(collection(db, "branches"), where("parentId", "==", kg.id)));
      const branchTeacherIds = new Set();
      branchSnap.forEach((d) => (d.data()?.teacherIds || []).forEach((t) => branchTeacherIds.add(t)));
      const allIds = Array.from(new Set([...(kg.teacherIds || []), ...branchTeacherIds]));
      if (!allIds.length) return setTeacherPoolMap(new Map());

      const chunks = chunk(allIds, 10);
      const map = new Map();
      const locals = chunks.map((ids) =>
        onSnapshot(
          query(collection(db, "teachers"), where(documentId(), "in", ids)),
          (snap) => {
            snap.forEach((d) => {
              const x = d.data() || {};
              map.set(d.id, { id: d.id, label: fullName(x), active: !!x.active });
            });
            setTeacherPoolMap(new Map(map));
          }
        )
      );
      unsubs.push(...locals);
    })();

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [open, kg.id]);

  const teacherOptionsForKgClasses = useMemo(() => {
    const ids = new Set([...(kg.teacherIds || [])]);
    branches.forEach((b) => (b.teacherIds || []).forEach((t) => ids.add(t)));
    const arr = Array.from(ids)
      .map((id) => teacherPoolMap.get(id))
      .filter(Boolean);
    arr.sort((a, b) => a.label.localeCompare(b.label, "ar"));
    return arr;
  }, [kg.teacherIds, branches, teacherPoolMap]);

  return (
    <section className="ap-card" style={{ marginBottom: 12 }}>
      <div className="ap-line ap-line--click" onClick={() => setOpen((v) => !v)}>
        <div className="ap-line__left">
          <svg
            className={`ap-caret ${open ? "ap-caret--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path d="M8 5l8 7-8 7" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div>
            <div className="ap-line__title">{kg.name}</div>
            <div className="ap-note">{kg.address || "—"}</div>
          </div>
        </div>
        <div className="ap-line__right">
          <button
            className="ap-btn ap-btn--primary"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${kg.id}`);
            }}
          >
            + إنشاء صف
          </button>
          <button
            className="ap-btn"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/classes/${kg.id}/move`);
            }}
          >
            نقل طلاب
          </button>
        </div>
      </div>

      {open && (
        <div className="ap-nested">
          {/* صفوف الروضة */}
          <div className="ap-line ap-line--section ap-line--kg">
            <div className="ap-line__title">صفوف الروضة</div>
          </div>
          {kgClasses.length === 0 ? (
            <div className="ap-note ap-line">لا توجد صفوف مباشرة على الروضة.</div>
          ) : (
            kgClasses.map((c) => (
              <ClassRow
                key={c.id}
                klass={c}
                kg={kg}
                branch={null}
                teacherOptions={teacherOptionsForKgClasses}
                onDeleted={() => {}}
              />
            ))
          )}

          {/* فروع الروضة */}
          <div className="ap-line ap-line--section ap-line--branches">
            <div className="ap-line__title">فروع الروضة</div>
          </div>
          {branches.length === 0 ? (
            <div className="ap-note ap-line">لا فروع لهذه الروضة.</div>
          ) : (
            branches.map((b) => (
              <BranchBlock key={b.id} branch={b} kg={kg} teacherPoolMap={teacherPoolMap} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- الصفحة الرئيسية ---------------- */
export default function ClassesPage() {
  const navigate = useNavigate();
  const [kgs, setKgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "kindergartens"), orderBy("createdAt", "desc")),
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setKgs(arr);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">الصفوف والطلاب</h1>
        <p className="ap-hero__sub">
          مستكشف هرمي قابل للنقر: الروضات ⟶ الفروع ⟶ الصفوف ⟶ الطلاب — مع صور الطلاب.
        </p>
      </div>

      {loading ? (
        <section className="ap-card">
          <div className="ap-card__body">جارِ التحميل…</div>
        </section>
      ) : kgs.length === 0 ? (
        <section className="ap-card">
          <div className="ap-card__body">لا توجد روضات — ابدأ بإضافة روضة.</div>
        </section>
      ) : (
        kgs.map((kg) => <KgBlock key={kg.id} kg={kg} navigate={navigate} />)
      )}
    </div>
  );
}
