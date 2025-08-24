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
  where,
  getDocs,
  getDoc,
} from "firebase/firestore";

// ✅ نعتمد ملف الأنماط الموحّد
import "./FormStyles.css";

/* خرائط مساعدة */
const ROLE_TO_COLLECTION = {
  guardian: "guardians",
  teacher:  "teachers",
  driver:   "drivers",
  student:  "students",
};
const ROLE_LABEL = {
  guardian: "وليّ أمر",
  teacher:  "معلّم",
  driver:   "سائق",
  student:  "طالب",
};
const ROLE_CLASS = {
  guardian: "role-chip role-guardian",
  teacher:  "role-chip role-teacher",
  driver:   "role-chip role-driver",
  student:  "role-chip role-student",
};

/* محافظات افتراضيًا */
const DEFAULT_PROVINCES = [
  { code:"DAM", name:"دمشق" }, { code:"RDI", name:"ريف دمشق" }, { code:"ALE", name:"حلب" },
  { code:"HMS", name:"حمص" },  { code:"HMA", name:"حماة" },      { code:"LAZ", name:"اللاذقية" },
  { code:"TAR", name:"طرطوس" },{ code:"IDL", name:"إدلب" },      { code:"DEZ", name:"دير الزور" },
  { code:"RAQ", name:"الرقة" },{ code:"HAS", name:"الحسكة" },    { code:"DRA", name:"درعا" },
  { code:"SWA", name:"السويداء" }, { code:"QUN", name:"القنيطرة" },
];

/* أدوات صغيرة */
function normalizeDigits(str = "") {
  const map = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
                "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9" };
  return String(str).replace(/[٠-٩۰-۹]/g, d => map[d] ?? d);
}
function initials(name = "") {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0]||"") + (p[1]?.[0]||"")).toUpperCase() || "👤";
}
function calcAgeFromDob(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(+d)) return "";
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return String(y);
}
function dobFromAgeYears(years, currentDob) {
  const n = new Date();
  let month = n.getMonth(), day = n.getDate();
  if (currentDob) {
    const cd = new Date(currentDob);
    if (!isNaN(+cd)) { month = cd.getMonth(); day = cd.getDate(); }
  }
  const y = n.getFullYear() - (isFinite(Number(years)) ? Number(years) : 0);
  const dt = new Date(y, month, day);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function pickPhotoURL(x = {}) {
  return (
    x.photoURL || x.avatarURL || x.avatarUrl || x.imageURL || x.imageUrl ||
    x.profilePhotoURL || x.profilePhotoUrl || x.photo || x.image || ""
  );
}

/* ——— Modal ——— */
const modalStyles = {
  backdrop: "ap-modal__backdrop",
  card: "ap-modal",
  head: "ap-modal__head",
  title: "ap-modal__title",
  body: "ap-modal__body",
  foot: "ap-modal__foot",
  close: "ap-btn",
};

function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return (
    <div className={modalStyles.backdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={modalStyles.card}
        onClick={(e)=>e.stopPropagation()}
        // ✅ تمركز وعرض مناسب
        style={{ width: "min(92vw, 980px)", maxHeight: "min(84vh, 860px)" }}
      >
        <div className={modalStyles.head}>
          <div className={modalStyles.title}>{title}</div>
          <button className={modalStyles.close} onClick={onClose} aria-label="إغلاق">✖</button>
        </div>
        <div className={modalStyles.body}>{children}</div>
        {actions && <div className={modalStyles.foot}>{actions}</div>}
      </div>
    </div>
  );
}

function Confirm({ open, title="تأكيد", message, confirmText="نعم، متابعة", cancelText="إلغاء", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className={modalStyles.backdrop} role="dialog" aria-modal="true" onClick={onCancel}>
      <div
        className={modalStyles.card}
        onClick={(e)=>e.stopPropagation()}
        style={{ width: "min(92vw, 560px)" }}
      >
        <div className={modalStyles.head}>
          <div className={modalStyles.title}>{title}</div>
          <button className={modalStyles.close} onClick={onCancel} aria-label="إغلاق">✖</button>
        </div>
        <div style={{lineHeight:1.8}}>{message}</div>
        <div className={modalStyles.foot}>
          <button className="ap-btn" onClick={onCancel}>{cancelText}</button>
          <button className="ap-btn ap-btn--danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ———————————————————— الصفحة ———————————————————— */
export default function Users() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  /* تعديل/عرض */
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState("basic");
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState(null);

  /* حذف */
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* قوائم مساعدة (طلاب) */
  const [provinces, setProvinces] = useState(DEFAULT_PROVINCES);
  const [kgs, setKgs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [classes, setClasses] = useState([]);
  const [drivers, setDrivers] = useState([]);

  /* الاشتراك بالبيانات */
  useEffect(() => {
    setLoading(true);
    setErr("");
    const want = [
      { col:"guardians", role:"guardian" },
      { col:"teachers",  role:"teacher"  },
      { col:"drivers",   role:"driver"   },
      { col:"students",  role:"student"  },
    ];
    const unsubs = want.map(({col,role})=>{
      const qRef = query(collection(db, col), orderBy("firstName"));
      return onSnapshot(qRef, (snap)=>{
        setRows(prev=>{
          const others = prev.filter(r=>r.role!==role);
          const add = snap.docs.map(d=>{
            const x = d.data()||{};
            const full = [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—";
            return {
              id: d.id,
              ref: doc(db,col,d.id),
              role,
              fullName: full,
              email: x.email || "",
              phone: x.phone || "",
              active: x.active !== false,
              address: x.address || "",
              gender: x.gender || "",
              avatarUrl: pickPhotoURL(x),
              publicId: x.publicId || "",
              codeAlt:  x.code || "",
              raw: x,
            };
          });
          const next = [...others, ...add];
          next.sort((a,b)=>a.fullName.localeCompare(b.fullName,"ar"));
          return next;
        });
        setLoading(false);
      },(e)=>{
        setErr(e?.message || "فشل الاشتراك في التغييرات."); setLoading(false);
      });
    });
    return ()=>unsubs.forEach(u=>u && u());
  }, []);

  /* تحميل قوائم التحرير لمرة واحدة */
  useEffect(()=>{
    (async ()=>{
      try {
        const ps = await getDocs(query(collection(db,"provinces"), orderBy("name")));
        const arr = ps.docs.map(d=>({ code:(d.data()?.code||d.id), name:(d.data()?.name||d.id) }));
        setProvinces(arr.length?arr:DEFAULT_PROVINCES);
      } catch { setProvinces(DEFAULT_PROVINCES); }
    })();
    (async ()=>{
      try {
        const ks = await getDocs(collection(db,"kindergartens"));
        const arr = ks.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
        setKgs(arr);
      } catch {}
    })();
  }, []);

  /* عند تغيير قيم الروضة/الفرع في نموذج الطالب حمّل القوائم التابعة */
  useEffect(()=>{
    if (!editing || editing.role!=="student" || !form) return;
    (async ()=>{
      if (form.kindergartenId) {
        const qs = query(collection(db,"branches"), where("parentId","==", form.kindergartenId));
        const snap = await getDocs(qs);
        const arr = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
        setBranches(arr);
      } else { setBranches([]); }

      const parentId = form.branchId || form.kindergartenId || "";
      if (parentId) {
        const qc = query(collection(db,"classes"), where("parentId","==", parentId));
        const cs = await getDocs(qc);
        const arr = cs.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
        setClasses(arr);
      } else { setClasses([]); }

      let driverIds = [];
      if (form.branchId) {
        const b = await getDoc(doc(db,"branches",form.branchId));
        driverIds = b.exists()? (b.data()?.driverIds||[]) : [];
      }
      if (!driverIds.length && form.kindergartenId) {
        const k = await getDoc(doc(db,"kindergartens", form.kindergartenId));
        driverIds = k.exists()? (k.data()?.driverIds||[]) : [];
      }
      if (driverIds.length) {
        const list = await Promise.all(driverIds.map(async id=>{
          const s = await getDoc(doc(db,"drivers",id));
          return s.exists()? { id:s.id, ...(s.data()||{}) } : null;
        }));
        setDrivers(list.filter(Boolean));
      } else setDrivers([]);
    })();
  }, [editing, form?.kindergartenId, form?.branchId]);

  /* فلترة وباجينغ */
  const filtered = useMemo(()=>{
    const key = normalizeDigits(q).toLowerCase().trim();
    return rows.filter(r=>{
      if (role!=="all" && r.role!==role) return false;
      if (status!=="all") {
        const on = r.active===true;
        if (status==="active" && !on) return false;
        if (status==="inactive" && on) return false;
      }
      if (!key) return true;
      const codeVal = (r.publicId || r.codeAlt || "").toLowerCase();
      const hay = [r.fullName, r.email, r.phone, codeVal].join(" ").toLowerCase();
      return hay.includes(key);
    });
  },[rows,role,status,q]);

  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(1);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total/perPage));
  const curPage = Math.min(page, totalPages);
  const start = (curPage-1)*perPage;
  const pageRows = filtered.slice(start, start+perPage);

  async function toggleActive(row){
    try{ await updateDoc(row.ref,{ active:!row.active, updatedAt:serverTimestamp() }); }
    catch(e){ alert(e?.message || "تعذّر تحديث الحالة."); }
  }

  function askDelete(row){ setToDelete(row); }
  async function confirmDelete(){
    if(!toDelete) return;
    try{ setDeleting(true); await deleteDoc(toDelete.ref); setToDelete(null); }
    catch(e){ alert(e?.message || "تعذّر الحذف."); }
    finally{ setDeleting(false); }
  }

  /* فتح التحرير */
  function openEdit(row){
    const x = row.raw || {};
    const initAgeYears = (typeof x.ageYears !== "undefined" && x.ageYears !== null && x.ageYears !== "")
      ? String(x.ageYears)
      : calcAgeFromDob(x.dob);

    setEditing(row);
    setTab("basic");
    setForm({
      firstName: x.firstName || "",
      lastName : x.lastName  || "",
      email    : x.email     || "",
      phone    : x.phone     || "",
      gender   : x.gender    || "male",
      address  : x.address   || "",
      active   : row.active === true,
      avatarUrl: pickPhotoURL(x),
      dob      : x.dob || "",
      ageYears : initAgeYears,
      publicId : row.publicId || row.codeAlt || "",
      provinceName: x.provinceName || "",
      provinceCode: x.provinceCode || "",
      kindergartenId: x.kindergartenId || "",
      kindergartenName: x.kindergartenName || "",
      branchId: x.branchId || "",
      branchName: x.branchName || "",
      classId: x.classId || "",
      className: x.className || "",
      driverId: x.driverId || "",
      health: {
        heightCm: x.health?.heightCm || "",
        weightKg: x.health?.weightKg || "",
        bloodGroup: x.health?.bloodGroup || "",
        allergy: x.health?.allergy || "",
        chronic: x.health?.chronic || "",
        medications: x.health?.medications || "",
        hearingIssues: x.health?.hearingIssues || "",
        vision: x.health?.vision || "",
        otherIssues: x.health?.otherIssues || "",
        dietNotes: x.health?.dietNotes || "",
      },
      parents: {
        father: { ...(x.parents?.father || {name:"",phone:"",email:"",job:"",nationalId:"",notes:""}) },
        mother: { ...(x.parents?.mother || {name:"",phone:"",email:"",job:"",nationalId:"",notes:""}) },
      },
    });
  }
  function closeEdit(){ setEditing(null); setForm(null); setSaving(false); }
  function setF(k,v){ setForm(prev=>({ ...prev, [k]: v })); }

  useEffect(() => {
    if (!editing || editing.role !== "student" || !form) return;
    const ay = calcAgeFromDob(form.dob);
    if (form.ageYears !== ay) setForm((f) => ({ ...f, ageYears: ay }));
  }, [editing?.role, form?.dob]);

  async function saveEdit(){
    if(!editing || !form) return;
    const fn=form.firstName.trim(), ln=form.lastName.trim();
    if(!fn || !ln){ alert("الاسم والكنية مطلوبة."); return; }
    try{
      setSaving(true);
      const payload = {
        firstName: fn,
        lastName : ln,
        email    : form.email.trim() || null,
        phone    : form.phone.trim() || null,
        gender   : form.gender,
        address  : form.address.trim() || null,
        active   : !!form.active,
        updatedAt: serverTimestamp(),
      };

      if (editing.role === "student") {
        const cleanAge = Number(String(form.ageYears || "").replace(/[^\d]/g,""));
        payload.dob = form.dob || null;
        payload.ageYears = isNaN(cleanAge) ? null : cleanAge;
        payload.ageGroups = !isNaN(cleanAge) ? [`${cleanAge} سنوات`] : [];

        const prov = provinces.find(p=>p.name===form.provinceName || p.code===form.provinceCode) || null;
        payload.provinceName = prov?.name || form.provinceName || "";
        payload.provinceCode = prov?.code || form.provinceCode || "";

        const kg = kgs.find(k=>k.id===form.kindergartenId) || {};
        const br = branches.find(b=>b.id===form.branchId) || {};
        const cl = classes.find(c=>c.id===form.classId) || {};
        const dr = drivers.find(d=>d.id===form.driverId) || null;

        payload.kindergartenId = form.kindergartenId || null;
        payload.kindergartenName = kg.name || "";
        payload.branchId = form.branchId || null;
        payload.branchName = br.name || "";
        payload.classId = form.classId || null;
        payload.className = cl.name || "";
        payload.driverId = form.driverId || null;
        payload.driverName = dr ? [dr.firstName, dr.lastName].filter(Boolean).join(" ").trim() : "";
        payload.driverPhone = dr?.phone || "";

        payload.parents = form.parents;
        payload.health  = form.health;
      }

      await updateDoc(editing.ref, payload);
      closeEdit();
    } catch(e){
      alert(e?.message || "تعذّر حفظ التعديلات.");
      setSaving(false);
    }
  }

  /* عرض (قراءة فقط) */
  function openView(row){ setViewing(row); }
  function closeView(){ setViewing(null); }

  /* تصدير CSV */
  function exportCSV(){
    const rowsForCsv = filtered.map(r=>({
      id: r.id,
      role: ROLE_LABEL[r.role] || r.role,
      code: r.publicId || r.codeAlt || "",
      fullName: r.fullName, email:r.email, phone:r.phone,
      gender:r.gender, address:r.address, active:r.active?"Active":"Inactive",
    }));
    const header = Object.keys(rowsForCsv[0] || {id:"",role:"",code:"",fullName:"",email:"",phone:"",gender:"",address:"",active:""});
    const lines = [header.join(","), ...rowsForCsv.map(o=>header.map(k=>`"${String(o[k]??"").replace(/"/g,'""')}"`).join(","))];
    const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href=url; a.download="users.csv"; a.click(); URL.revokeObjectURL(url);
  }

  // شبكة الأعمدة (7 أعمدة) لضمان بقاء كل شيء في سطر واحد
  const gridCols = '2fr .9fr .9fr 1.1fr 1.4fr .9fr .8fr';

  return (
    // ✅ نقلل المقاسات الافتراضية عبر متغيرات CSS (أصغر من ut--large)
    <div
      className="ut-wrap"
      style={{
        // خط أصغر وارتفاع صف أقل وصورة أصغر
        "--ut-font": "13.5px",
        "--ut-row-pad": "8px",
        "--ut-ava": "36px",
      }}
    >
      <div className="ut-head">
        <h2>المستخدمون</h2>
        <div className="ut-actions">
          <button className="ap-btn" onClick={exportCSV}>تصدير CSV</button>
        </div>
      </div>

      {/* أدوات التحكم */}
      <div className="ut-toolbar">
        <div className="ut-search" title="بحث">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
          </svg>
          {/* يمكن وضع input هنا لكننا نحافظ على البنية الحالية */}
        </div>
        <input
          className="ut-search-input"
          placeholder="بحث بالاسم / البريد / الهاتف / الكود…"
          value={q}
          onChange={(e)=>{ setQ(e.target.value); setPage(1); }}
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

      {err && <div className="ut-error">⚠️ {err}</div>}

      {/* الجدول */}
      <div className="ut-table">
        <div className="ut-thead" style={{ gridTemplateColumns: gridCols }}>
          <div className="th th-name">الاسم الكامل</div>
          <div className="th">الدور</div>
          <div className="th">الحالة</div>
          <div className="th">رقم الهاتف</div>
          <div className="th">البريد الإلكتروني</div>
          <div className="th">الكود</div>
          <div className="th th-actions">إجراءات</div>
        </div>

        {loading ? (
          <div className="ut-skeleton">جاري التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="ut-empty">لا توجد سجلات مطابقة.</div>
        ) : (
          pageRows.map((r, idx)=>{
            const sub = r.role==="student"
              ? [r.raw.kindergartenName, r.raw.branchName, r.raw.className].filter(Boolean).join(" / ")
              : (r.address || "");
            const codeVal = r.publicId || r.codeAlt || "";
            const isEven = ((start + idx) % 2) === 0;
            const rowBg = isEven ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.06)";

            return (
              <div
                key={`${r.role}:${r.id}`}
                className="ut-row"
                style={{
                  gridTemplateColumns: gridCols,
                  alignItems: "center",
                  background: rowBg,                // ✅ تلوين متناوب
                }}
              >
                <div className="td td-name" title={sub || r.fullName} style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                  <div className="avatar">
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" /> : <div className="avatar-fallback">{initials(r.fullName)}</div>}
                  </div>
                  <div className="who" style={{minWidth:0}}>
                    <div className="name" style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{r.fullName}</div>
                    {/* نخفي السطر الفرعي داخل الجدول للحفاظ على سطر واحد، مع إبقائه كتلميح */}
                    {sub ? <div className="sub" style={{display:"none"}}>{sub}</div> : null}
                  </div>
                </div>

                <div className="td">
                  <span className={ROLE_CLASS[r.role] || "role-chip"}>{ROLE_LABEL[r.role] || r.role}</span>
                </div>

                <div className="td">
                  <button
                    type="button"
                    className={["st", r.active ? "st--on" : "st--off"].join(" ")}
                    onClick={()=>toggleActive(r)}
                    title={r.active?"نشِط — اضغط للإيقاف":"غير نشِط — اضغط للتفعيل"}
                    style={{whiteSpace:"nowrap"}}
                  >
                    <span className="dot" />{r.active ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="td">
                  <a className="link" href={r.phone?`tel:${r.phone}`:"#"} onClick={(e)=>!r.phone && e.preventDefault()} style={{whiteSpace:"nowrap"}}>
                    {r.phone || "—"}
                  </a>
                </div>

                <div className="td" style={{minWidth:0}}>
                  <a className="link" href={r.email?`mailto:${r.email}`:"#"} onClick={(e)=>!r.email && e.preventDefault()} style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
                    {r.email || "—"}
                  </a>
                </div>

                <div className="td" style={{whiteSpace:"nowrap"}}>
                  {codeVal ? <span className="code-chip">{codeVal}</span> : "—"}
                </div>

                <div className="td td-actions" style={{justifyContent:"flex-end"}}>
                  <button className="icon-btn" title="عرض" onClick={()=>openView(r)}>👁️</button>
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
          {total>0 ? `${start+1}–${Math.min(start+perPage,total)} من ${total}` : "0 من 0"}
        </div>
        <div className="pager">
          <button className="ap-btn" disabled={curPage<=1} onClick={()=>setPage(1)} title="الأولى">«</button>
          <button className="ap-btn" disabled={curPage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))} title="السابق">‹</button>
          <span className="pg">{curPage} / {totalPages}</span>
          <button className="ap-btn" disabled={curPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} title="التالي">›</button>
          <button className="ap-btn" disabled={curPage>=totalPages} onClick={()=>setPage(totalPages)} title="الأخيرة">»</button>
        </div>
      </div>

      {/* نافذة عرض 👁️ */}
      <Modal
        open={!!viewing}
        onClose={closeView}
        title={viewing ? `عرض: ${viewing.fullName}` : ""}
        actions={<button className="ap-btn" onClick={closeView}>إغلاق</button>}
      >
        {viewing && (
          <div className="ap-form ap-grid-2">
            <div className="ap-field ap-span-2" style={{display:"flex",alignItems:"center",gap:12}}>
              <div className="ap-ava" style={{width:64,height:64}}>
                {pickPhotoURL(viewing.raw)
                  ? <img src={pickPhotoURL(viewing.raw)} alt="" />
                  : <span>{initials(viewing.fullName)}</span>}
              </div>
              <div className="ap-read">{ROLE_LABEL[viewing.role]||viewing.role}</div>
            </div>

            <div className="ap-field"><label>الكود</label><div className="ap-read">{viewing.publicId || viewing.codeAlt || "—"}</div></div>
            <div className="ap-field"><label>الجنس</label><div className="ap-read">{viewing.gender || "—"}</div></div>
            <div className="ap-field"><label>الهاتف</label><div className="ap-read">{viewing.phone || "—"}</div></div>
            <div className="ap-field"><label>البريد</label><div className="ap-read">{viewing.email || "—"}</div></div>
            <div className="ap-field ap-span-2"><label>العنوان</label><div className="ap-read">{viewing.address || "—"}</div></div>

            {viewing.role==="student" && (
              <>
                <div className="ap-field"><label>العمر</label><div className="ap-read">
                  {typeof viewing.raw?.ageYears !== "undefined" && viewing.raw?.ageYears !== null && viewing.raw?.ageYears !== ""
                    ? `${viewing.raw.ageYears} سنوات`
                    : (viewing.raw?.dob ? `${calcAgeFromDob(viewing.raw.dob)} سنوات` : "—")}
                </div></div>
                <div className="ap-field"><label>تاريخ الميلاد</label><div className="ap-read">{viewing.raw?.dob || "—"}</div></div>
                <div className="ap-field"><label>المحافظة</label><div className="ap-read">{viewing.raw?.provinceName || "—"}</div></div>
                <div className="ap-field"><label>الروضة / الفرع / الصف</label>
                  <div className="ap-read">
                    {[viewing.raw?.kindergartenName, viewing.raw?.branchName, viewing.raw?.className].filter(Boolean).join(" / ") || "—"}
                  </div>
                </div>
                <div className="ap-field ap-span-2"><label>الصحة</label>
                  <div className="ap-read" style={{whiteSpace:"pre-line"}}>
                    {JSON.stringify(viewing.raw?.health || {}, null, 2)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* نافذة تعديل */}
      <Modal
        open={!!editing}
        onClose={saving ? undefined : closeEdit}
        title={editing ? `تعديل ${ROLE_LABEL[editing.role]} — ${editing.fullName}` : ""}
        actions={
          <>
            <span style={{flex:1}} />
            <span className="ap-code">CODE: {form?.publicId || "-"}</span>
            <span className="ap-code">UID: {editing?.id || "-"}</span>
            <button className="ap-btn" onClick={closeEdit} disabled={saving}>إلغاء</button>
            <button className="ap-btn ap-btn--primary" onClick={saveEdit} disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </>
        }
      >
        {form && (
          <>
            {editing.role==="student" && (
              <div className="ap-tabs" style={{marginBottom:10}}>
                <button type="button" className={`ap-btn ${tab==="basic"?"ap-btn--primary":""}`} onClick={()=>setTab("basic")} style={{marginInlineEnd:6}}>المعلومات الأساسية</button>
                <button type="button" className={`ap-btn ${tab==="health"?"ap-btn--primary":""}`} onClick={()=>setTab("health")} style={{marginInlineEnd:6}}>الصحة</button>
                <button type="button" className={`ap-btn ${tab==="parents"?"ap-btn--primary":""}`} onClick={()=>setTab("parents")}>الأبوين</button>
              </div>
            )}

            {(tab==="basic" || editing.role!=="student") && (
              <div className="ap-form ap-grid-2">
                <div className="ap-field">
                  <label>الاسم</label>
                  <input className="ap-input" value={form.firstName} onChange={e=>setF("firstName", e.target.value)} />
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
                  <input dir="ltr" className="ap-input" value={form.phone} onChange={e=>setF("phone", normalizeDigits(e.target.value))} />
                </div>

                {editing.role==="student" && (
                  <>
                    <div className="ap-field">
                      <label>تاريخ الميلاد</label>
                      <input className="ap-input" type="date" value={form.dob || ""} onChange={(e)=>setF("dob", e.target.value)} />
                    </div>

                    <div className="ap-field">
                      <label>العمر (بالسنوات)</label>
                      <input
                        className="ap-input"
                        type="number"
                        min="0"
                        dir="ltr"
                        placeholder="مثال: 5"
                        value={form.ageYears || ""}
                        onChange={(e)=>{
                          const v = normalizeDigits(e.target.value).replace(/[^\d]/g,"");
                          const newDob = dobFromAgeYears(Number(v || 0), form.dob);
                          setForm(prev => ({ ...prev, ageYears: v, dob: newDob }));
                        }}
                        title="تغيير العمر سيحدّث تاريخ الميلاد تلقائيًا"
                      />
                    </div>
                  </>
                )}

                <div className="ap-field">
                  <label>الجنس</label>
                  <select className="ap-input" value={form.gender} onChange={e=>setF("gender", e.target.value)}>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div className="ap-field">
                  <label>الحالة</label>
                  <select className="ap-input" value={form.active?"1":"0"} onChange={e=>setF("active", e.target.value==="1")}>
                    <option value="1">نشِط</option>
                    <option value="0">غير نشِط</option>
                  </select>
                </div>

                <div className="ap-field ap-span-2">
                  <label>العنوان</label>
                  <input className="ap-input" value={form.address} onChange={e=>setF("address", e.target.value)} />
                </div>

                {editing.role==="student" && (
                  <>
                    <div className="ap-field">
                      <label>المحافظة</label>
                      <select className="ap-input" value={form.provinceName} onChange={(e)=>setF("provinceName", e.target.value)}>
                        <option value="">— اختر —</option>
                        {provinces.map(p=><option key={p.code} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="ap-field">
                      <label>الروضة</label>
                      <select className="ap-input" value={form.kindergartenId} onChange={(e)=>setF("kindergartenId", e.target.value)}>
                        <option value="">— اختر —</option>
                        {kgs
                          .filter(k=>!form.provinceName || k.provinceName===form.provinceName || k.provinceCode===form.provinceCode)
                          .map(k=><option key={k.id} value={k.id}>{k.name||k.id}</option>)}
                      </select>
                    </div>

                    <div className="ap-field">
                      <label>الفرع</label>
                      <select className="ap-input" value={form.branchId} onChange={(e)=>setF("branchId", e.target.value)} disabled={!form.kindergartenId}>
                        <option value="">{form.kindergartenId ? "— بدون فرع / اختر —" : "اختر الروضة أولًا"}</option>
                        {branches.map(b=><option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                      </select>
                    </div>
                    <div className="ap-field">
                      <label>الصف</label>
                      <select className="ap-input" value={form.classId} onChange={(e)=>setF("classId", e.target.value)} disabled={!form.kindergartenId}>
                        <option value="">{form.kindergartenId ? (form.branchId ? "— اختر —" : "صفوف الروضة") : "اختر الروضة أولًا"}</option>
                        {classes.map(c=><option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                      </select>
                    </div>

                    <div className="ap-field ap-span-2">
                      <label>السائق (اختياري)</label>
                      <select className="ap-input" value={form.driverId} onChange={(e)=>setF("driverId", e.target.value)} disabled={!form.kindergartenId}>
                        <option value="">بدون سائق</option>
                        {drivers.map(d=>{
                          const nm=[d.firstName,d.lastName].filter(Boolean).join(" ").trim() || "سائق";
                          return <option key={d.id} value={d.id}>{nm}{d.phone?` — ${d.phone}`:""}</option>;
                        })}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* HEALTH */}
            {editing.role==="student" && tab==="health" && (
              <div className="ap-form ap-grid-2">
                <div className="ap-field"><label>الطول (سم)</label>
                  <input className="ap-input" dir="ltr" value={form.health.heightCm}
                    onChange={e=>setF("health",{...form.health, heightCm: normalizeDigits(e.target.value)})}/>
                </div>
                <div className="ap-field"><label>الوزن (كغ)</label>
                  <input className="ap-input" dir="ltr" value={form.health.weightKg}
                    onChange={e=>setF("health",{...form.health, weightKg: normalizeDigits(e.target.value)})}/>
                </div>

                <div className="ap-field"><label>فصيلة الدم</label>
                  <input className="ap-input" value={form.health.bloodGroup}
                    onChange={e=>setF("health",{...form.health, bloodGroup:e.target.value})}/>
                </div>
                <div className="ap-field"><label>حساسية</label>
                  <input className="ap-input" value={form.health.allergy}
                    onChange={e=>setF("health",{...form.health, allergy:e.target.value})}/>
                </div>

                <div className="ap-field"><label>أمراض مزمنة</label>
                  <input className="ap-input" value={form.health.chronic}
                    onChange={e=>setF("health",{...form.health, chronic:e.target.value})}/>
                </div>
                <div className="ap-field"><label>أدوية دائمة</label>
                  <input className="ap-input" value={form.health.medications}
                    onChange={e=>setF("health",{...form.health, medications:e.target.value})}/>
                </div>

                <div className="ap-field"><label>مشاكل السمع</label>
                  <input className="ap-input" value={form.health.hearingIssues}
                    onChange={e=>setF("health",{...form.health, hearingIssues:e.target.value})}/>
                </div>
                <div className="ap-field"><label>البصر</label>
                  <input className="ap-input" value={form.health.vision}
                    onChange={e=>setF("health",{...form.health, vision:e.target.value})}/>
                </div>

                <div className="ap-field ap-span-2"><label>مشاكل/أمراض أخرى</label>
                  <textarea className="ap-input" rows={3} value={form.health.otherIssues}
                    onChange={e=>setF("health",{...form.health, otherIssues:e.target.value})}/>
                </div>
                <div className="ap-field ap-span-2"><label>ملاحظات غذائية</label>
                  <textarea className="ap-input" rows={3} value={form.health.dietNotes}
                    onChange={e=>setF("health",{...form.health, dietNotes:e.target.value})}/>
                </div>
              </div>
            )}

            {/* PARENTS */}
            {editing.role==="student" && tab==="parents" && (
              <div className="ap-form ap-grid-2">
                <div className="ap-field"><label>الأب — الاسم</label>
                  <input className="ap-input" value={form.parents.father.name}
                    onChange={e=>setF("parents",{...form.parents, father:{...form.parents.father, name:e.target.value}})}/>
                </div>
                <div className="ap-field"><label>الأب — الهاتف</label>
                  <input dir="ltr" className="ap-input" value={form.parents.father.phone}
                    onChange={e=>setF("parents",{...form.parents, father:{...form.parents.father, phone:normalizeDigits(e.target.value)}})}/>
                </div>
                <div className="ap-field"><label>الأب — البريد</label>
                  <input dir="ltr" className="ap-input" value={form.parents.father.email}
                    onChange={e=>setF("parents",{...form.parents, father:{...form.parents.father, email:e.target.value}})}/>
                </div>
                <div className="ap-field"><label>الأب — المهنة</label>
                  <input className="ap-input" value={form.parents.father.job}
                    onChange={e=>setF("parents",{...form.parents, father:{...form.parents.father, job:e.target.value}})}/>
                </div>
                <div className="ap-field ap-span-2"><label>الأب — ملاحظات</label>
                  <textarea className="ap-input" rows={2} value={form.parents.father.notes}
                    onChange={e=>setF("parents",{...form.parents, father:{...form.parents.father, notes:e.target.value}})}/>
                </div>

                <div className="ap-field"><label>الأم — الاسم</label>
                  <input className="ap-input" value={form.parents.mother.name}
                    onChange={e=>setF("parents",{...form.parents, mother:{...form.parents.mother, name:e.target.value}})}/>
                </div>
                <div className="ap-field"><label>الأم — الهاتف</label>
                  <input dir="ltr" className="ap-input" value={form.parents.mother.phone}
                    onChange={e=>setF("parents",{...form.parents, mother:{...form.parents.mother, phone:normalizeDigits(e.target.value)}})}/>
                </div>
                <div className="ap-field"><label>الأم — البريد</label>
                  <input dir="ltr" className="ap-input" value={form.parents.mother.email}
                    onChange={e=>setF("parents",{...form.parents, mother:{...form.parents.mother, email:e.target.value}})}/>
                </div>
                <div className="ap-field"><label>الأم — المهنة</label>
                  <input className="ap-input" value={form.parents.mother.job}
                    onChange={e=>setF("parents",{...form.parents, mother:{...form.parents.mother, job:e.target.value}})}/>
                </div>
                <div className="ap-field ap-span-2"><label>الأم — ملاحظات</label>
                  <textarea className="ap-input" rows={2} value={form.parents.mother.notes}
                    onChange={e=>setF("parents",{...form.parents, mother:{...form.parents.mother, notes:e.target.value}})}/>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* تأكيد الحذف */}
      <Confirm
        open={!!toDelete}
        title="تأكيد الحذف"
        message={toDelete ? <>سيُحذف <b>“{toDelete.fullName}”</b> نهائيًا. لا يمكن التراجع.</> : ""}
        confirmText={deleting ? "جارٍ الحذف…" : "نعم، احذف"}
        cancelText="إلغاء"
        onCancel={()=>!deleting && setToDelete(null)}
        onConfirm={()=>!deleting && confirmDelete()}
      />
    </div>
  );
}
