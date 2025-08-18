// src/pages/AddStudent.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./FormStyles.css";
import { db, storage, saveToFirestore, linkStudentToGuardians } from "../firebase";

import { collection, getDocs, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ————— Utils —————
function normalizeDigits(str = "") {
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
    "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4",
    "۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}
function pretty(err) {
  const c = err?.code || "";
  if (c.includes("permission")) return "صلاحيات غير كافية للكتابة في قاعدة البيانات.";
  return err?.message || "حدث خطأ غير متوقع.";
}
const emptyParent = { name:"", phone:"", email:"", job:"", nationalId:"", notes:"" };

// ————————————————————————————————————————————————————————————————
export default function AddStudent() {
  // تبويب
  const [tab, setTab] = useState("profile"); // profile | health

  // أساسية
  const [code, setCode]           = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [dob, setDob]             = useState(""); // yyyy-mm-dd
  const [gender, setGender]       = useState("female");
  const [address, setAddress]     = useState("");
  const [status, setStatus]       = useState("active"); // active | inactive

  // حقول مطلوبة: أخطاء + مراجع للتركيز
  const [errors, setErrors] = useState({ code:"", firstName:"", lastName:"" });
  const refCode = useRef(null);
  const refFirst = useRef(null);
  const refLast = useRef(null);

  // تسلسل الروضة ← الفرع ← الصف
  const [kgList, setKgList]         = useState([]); // {id,name}
  const [kgId, setKgId]             = useState("");
  const [branchList, setBranchList] = useState([]); // {id,name,kindergartenId}
  const [branchId, setBranchId]     = useState("");
  const [classList, setClassList]   = useState([]); // {id,name,branchId}
  const [classId, setClassId]       = useState("");

  // صورة
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // أولياء الأمور (من الحسابات الموجودة)
  const [guardians, setGuardians]             = useState([]); // {id, fullName, email, phone}
  const [gFilter, setGFilter]                 = useState("");
  const [selectedGuardianIds, setSelectedGuardianIds] = useState([]); // قائمة مختارة
  const [primaryGuardianId, setPrimaryGuardianId]     = useState("");
  const [pickerOpen, setPickerOpen]           = useState(false);

  // نافذة تفاصيل الأب/الأم
  const [father, setFather]       = useState({ ...emptyParent });
  const [mother, setMother]       = useState({ ...emptyParent });
  const [parentModal, setParentModal] = useState(null); // 'father' | 'mother' | null
  const [parentDraft, setParentDraft] = useState({ ...emptyParent });

  // صحة (أقرب للواقع)
  const [health, setHealth] = useState({
    heightCm:"", weightKg:"", bloodGroup:"Unknown",
    allergy:"", chronic:"", medications:"", vaccinationsUpToDate:false,
    doctorName:"", doctorPhone:"", lastCheckup:"", dietNotes:"",
    vision:""
  });

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ————— تحميل القوائم —————
  useEffect(() => {
    // Guardians
    (async () => {
      try {
        const snap = await getDocs(collection(db, "guardians"));
        const arr = [];
        snap.forEach(d => {
          const x = d.data() || {};
          arr.push({
            id: d.id,
            fullName: [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—",
            email: x.email || "",
            phone: x.phone || "",
          });
        });
        arr.sort((a,b)=>a.fullName.localeCompare(b.fullName, "ar"));
        setGuardians(arr);
      } catch (e) { /* تجاهل */ }
    })();

    // Kindergartens
    (async () => {
      try {
        const snap = await getDocs(collection(db, "kindergartens"));
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setKgList(arr);
      } catch (e) { /* تجاهل */ }
    })();
  }, []);

  // تحميل الفروع عند اختيار الروضة
  useEffect(() => {
    setBranchList([]); setBranchId(""); setClassList([]); setClassId("");
    if (!kgId) return;
    (async () => {
      try {
        const qy = query(collection(db, "branches"), where("kindergartenId","==",kgId));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setBranchList(arr);
      } catch (e) { /* تجاهل */ }
    })();
  }, [kgId]);

  // تحميل الصفوف عند اختيار الفرع
  useEffect(() => {
    setClassList([]); setClassId("");
    if (!branchId) return;
    (async () => {
      try {
        const qy = query(collection(db, "classes"), where("branchId","==",branchId));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setClassList(arr);
      } catch (e) { /* تجاهل */ }
    })();
  }, [branchId]);

  // معاينة الصورة
  function onPickPhoto(file) {
    setPhotoFile(file || null);
    if (!file) return setPhotoPreview("");
    const r = new FileReader();
    r.onload = ()=>setPhotoPreview(r.result);
    r.readAsDataURL(file);
  }

  // القوائم المفلترة
  const filteredGuardians = useMemo(() => {
    const key = normalizeDigits(gFilter).toLowerCase().trim();
    if (!key) return guardians;
    return guardians.filter(g => {
      const hay = [g.fullName, g.email, g.phone].join(" ").toLowerCase();
      return hay.includes(key);
    });
  }, [gFilter, guardians]);

  // التحقق الخفيف + تركيز على أول حقل ناقص
  function validate() {
    const next = {
      code: code.trim() ? "" : "رمز الطالب مطلوب",
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName: lastName.trim() ? "" : "الكنية مطلوبة",
    };
    setErrors(next);

    if (next.code) { setTab("profile"); setTimeout(()=>refCode.current?.focus(), 0); return false; }
    if (next.firstName) { setTab("profile"); setTimeout(()=>refFirst.current?.focus(), 0); return false; }
    if (next.lastName) { setTab("profile"); setTimeout(()=>refLast.current?.focus(), 0); return false; }

    return true;
  }

  // تفريغ
  function resetForm() {
    setTab("profile");
    setCode(""); setFirstName(""); setLastName(""); setDob("");
    setGender("female"); setAddress(""); setStatus("active");
    setErrors({ code:"", firstName:"", lastName:"" });
    setKgId(""); setBranchId(""); setClassId("");
    setPhotoFile(null); setPhotoPreview("");
    setSelectedGuardianIds([]); setPrimaryGuardianId(""); setGFilter("");
    setFather({ ...emptyParent }); setMother({ ...emptyParent });
    setHealth({
      heightCm:"", weightKg:"", bloodGroup:"Unknown",
      allergy:"", chronic:"", medications:"", vaccinationsUpToDate:false,
      doctorName:"", doctorPhone:"", lastCheckup:"", dietNotes:"",
      vision:""
    });
    setError(""); setSuccess("");
  }

  // حفظ
  async function submit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (loading) return;

    if (!validate()) return;

    try {
      setLoading(true);

      const kg = kgList.find(x=>x.id===kgId) || {};
      const br = branchList.find(x=>x.id===branchId) || {};
      const cl = classList.find(x=>x.id===classId) || {};

      const primary  = guardians.find(g=>g.id===primaryGuardianId) || null;
      const guardianIds = Array.from(new Set(selectedGuardianIds));

      const base = {
        role: "student",
        code: code.trim(),
        firstName: firstName.trim(),
        lastName : lastName.trim(),
        dob      : dob || null,
        gender,
        address  : address.trim() || "",
        status,
        active   : status === "active",

        // الربط
        primaryGuardianId: primaryGuardianId || null,
        guardianIds,

        // ننسخ للأعمدة في Users (بريد/هاتف من الحساب الرئيسي إن وُجد)
        phone: primary?.phone || null,
        email: primary?.email || null,

        // الروضة ← الفرع ← الصف
        kindergartenId: kgId || null,
        kindergartenName: kg?.name || "",
        branchId: branchId || null,
        branchName: br?.name || "",
        classId: classId || null,
        className: cl?.name || "",

        // الأبوين
        parents: {
          father: { ...father },
          mother: { ...mother },
        },

        // الصحة
        health: {
          heightCm: health.heightCm || null,
          weightKg: health.weightKg || null,
          bloodGroup: health.bloodGroup || "Unknown",
          allergy: health.allergy || "",
          chronic: health.chronic || "",
          medications: health.medications || "",
          vaccinationsUpToDate: !!health.vaccinationsUpToDate,
          doctorName: health.doctorName || "",
          doctorPhone: health.doctorPhone || "",
          lastCheckup: health.lastCheckup || null,
          dietNotes: health.dietNotes || "",
          vision: health.vision || "",
        },
      };

      const { id } = await saveToFirestore("students", base);
     // اربط الطالب المختار مع أولياء الأمور (studentIds داخل وثائق guardians)
await linkStudentToGuardians({
  studentId: id,
  guardianIds: guardiansAll, // نفس المصفوفة التي كوّنتها من اختياراتك
});

      if (photoFile) {
        const path = `students/${id}/avatar_${Date.now()}_${photoFile.name}`;
        const r = ref(storage, path);
        await uploadBytes(r, photoFile);
        const url = await getDownloadURL(r);
        await saveToFirestore("students", { photoURL: url }, { id, merge: true });
      }

      setSuccess("✅ تم إضافة الطالب وربط البيانات بنجاح.");
      resetForm();
    } catch (err) {
      console.error(err);
      setError(pretty(err));
    } finally {
      setLoading(false);
    }
  }

  // ————— واجهة —————
  return (
    <div className="ap-page">
      {/* مودال الأب/الأم */}
      {parentModal && (
        <div style={styles.backdrop} onClick={()=>setParentModal(null)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <div style={styles.modalHead}>
              <b>معلومات {parentModal === "father" ? "الأب" : "الأم"}</b>
              <button className="ap-btn" onClick={()=>setParentModal(null)}>✕</button>
            </div>
            <div className="ap-form" style={{paddingTop:8}}>
              <div className="ap-field">
                <label>الاسم الكامل</label>
                <input className="ap-input" dir="auto" value={parentDraft.name}
                  onChange={(e)=>setParentDraft(d=>({...d, name:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>رقم الهاتف</label>
                <input className="ap-input" dir="ltr" value={parentDraft.phone}
                  onChange={(e)=>setParentDraft(d=>({...d, phone: normalizeDigits(e.target.value)}))}/>
              </div>
              <div className="ap-field">
                <label>البريد الإلكتروني</label>
                <input className="ap-input" dir="ltr" value={parentDraft.email}
                  onChange={(e)=>setParentDraft(d=>({...d, email:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>المهنة</label>
                <input className="ap-input" value={parentDraft.job}
                  onChange={(e)=>setParentDraft(d=>({...d, job:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>الرقم الوطني (اختياري)</label>
                <input className="ap-input" dir="ltr" value={parentDraft.nationalId}
                  onChange={(e)=>setParentDraft(d=>({...d, nationalId: normalizeDigits(e.target.value)}))}/>
              </div>
              <div className="ap-field ap-span-2">
                <label>ملاحظات</label>
                <textarea className="ap-input" rows={3} value={parentDraft.notes}
                  onChange={(e)=>setParentDraft(d=>({...d, notes:e.target.value}))}/>
              </div>

              <div className="ap-actions ap-span-2">
                <button className="ap-btn" onClick={()=>setParentModal(null)}>إلغاء</button>
                <button className="ap-btn ap-btn--primary" onClick={()=>{
                  if (parentModal === "father") setFather(parentDraft);
                  else setMother(parentDraft);
                  setParentModal(null);
                }}>
                  حفظ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال اختيار حسابات أولياء الأمور */}
      {pickerOpen && (
        <div style={styles.backdrop} onClick={()=>setPickerOpen(false)}>
          <div
            style={styles.pickerModal}
            onClick={(e)=>e.stopPropagation()}
            role="dialog"
            aria-label="اختيار حسابات أولياء الأمور"
          >
            <div style={styles.pickerHead}>
              <b>اختيار حسابات أولياء الأمور</b>
              <button className="ap-btn" onClick={()=>setPickerOpen(false)}>✕</button>
            </div>

            {/* فلتر */}
            <div className="ap-field" style={{marginTop:6}}>
              <input
                autoFocus
                className="ap-input"
                placeholder="بحث بالاسم / البريد / الهاتف…"
                value={gFilter}
                onChange={(e)=>setGFilter(e.target.value)}
              />
            </div>

            {/* القائمة */}
            <div style={styles.pickerList}>
              {filteredGuardians.map((g) => {
                const active  = selectedGuardianIds.includes(g.id);
                const primary = primaryGuardianId === g.id;
                return (
                  <div
                    key={g.id}
                    className="ap-line"
                    onClick={()=>{
                      setSelectedGuardianIds(prev=>{
                        const has  = prev.includes(g.id);
                        const next = has ? prev.filter(x=>x!==g.id) : [...prev, g.id];
                        if (!primaryGuardianId && next.length) setPrimaryGuardianId(next[0]);
                        if (primary && has) {
                          const rest = next.filter(x=>x!==g.id);
                          setPrimaryGuardianId(rest[0] || "");
                        }
                        return next;
                      });
                    }}
                    style={{
                      cursor:"pointer",
                      borderRadius:8,
                      padding:"10px 12px",
                      border:"1px solid #243244",
                      background: active ? "rgba(34,197,94,.12)" : "#0f172a",
                      display:"flex",
                      alignItems:"center",
                      justifyContent:"space-between"
                    }}
                  >
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div
                        aria-hidden
                        style={{
                          width:12, height:12, borderRadius:999,
                          border:"2px solid #22c55e",
                          background: active ? "#22c55e" : "transparent"
                        }}
                      />
                      <div>
                        <div style={{fontWeight:600}}>{g.fullName}</div>
                        <div style={{color:"#94a3b8", fontSize:12}}>{g.phone || "لا هاتف"}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ap-btn ap-btn--soft"
                      onClick={(e)=>{ e.stopPropagation(); setPrimaryGuardianId(g.id); }}
                      title="تعيين كحساب رئيسي"
                    >
                      {primary ? "رئيسي ✓" : "جعل رئيسي"}
                    </button>
                  </div>
                );
              })}
              {filteredGuardians.length === 0 && (
                <div className="ap-note">لا نتائج مطابقة للبحث الحالي.</div>
              )}
            </div>

            <div className="ap-actions">
              <button type="button" className="ap-btn" onClick={()=>setPickerOpen(false)}>إلغاء</button>
              <button
                type="button"
                className="ap-btn ap-btn--primary"
                onClick={()=>setPickerOpen(false)}
              >
                تأكيد الاختيار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* رأس */}
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة طالب</h1>
        <p className="ap-hero__sub">سجّل بيانات الطالب واربطه بوليّ الأمر والصف.</p>
      </div>

      {/* تبويبات */}
      <div className="ap-card" style={{marginBottom:10}}>
        <div className="ap-card__head">
          <div className="ap-tabs">
            <button
              type="button"
              className={`ap-btn ${tab === "profile" ? "ap-btn--primary" : ""}`}
              onClick={() => setTab("profile")}
              style={{marginInlineEnd: 8}}
            >
              المعلومات الأساسية
            </button>
            <button
              type="button"
              className={`ap-btn ${tab === "health" ? "ap-btn--primary" : ""}`}
              onClick={() => setTab("health")}
            >
              معلومات الصحة
            </button>
          </div>
          <div className="ap-note">ستُحفَظ كل البيانات ضمن مجموعة <b>students</b>.</div>
        </div>
      </div>

      {/* بطاقة المحتوى */}
      <section className="ap-card">
        <div className="ap-card__body">
          {formError && <div className="ap-error" style={{marginBottom:8}}>⚠️ {formError}</div>}
          {success   && <div className="ap-success" style={{marginBottom:8}}>{success}</div>}

          {tab === "profile" ? (
            <form className="ap-form" onSubmit={submit}>
              {/* صف أول */}
              <div className="ap-field">
                <label><span className="ap-required">*</span> رمز الطالب</label>
                <input
                  ref={refCode}
                  className={`ap-input ${errors.code ? "ap-invalid":""}`}
                  dir="ltr"
                  placeholder="HM001"
                  value={code}
                  onChange={(e)=>setCode(normalizeDigits(e.target.value))}
                />
                {errors.code && <div className="ap-error">{errors.code}</div>}
              </div>
              <div className="ap-field">
                <label><span className="ap-required">*</span> الاسم</label>
                <input
                  ref={refFirst}
                  className={`ap-input ${errors.firstName ? "ap-invalid":""}`}
                  dir="auto"
                  value={firstName}
                  onChange={(e)=>setFirstName(e.target.value)}
                  placeholder="الاسم"
                />
                {errors.firstName && <div className="ap-error">{errors.firstName}</div>}
              </div>
              <div className="ap-field">
                <label><span className="ap-required">*</span> الكنية</label>
                <input
                  ref={refLast}
                  className={`ap-input ${errors.lastName ? "ap-invalid":""}`}
                  dir="auto"
                  value={lastName}
                  onChange={(e)=>setLastName(e.target.value)}
                  placeholder="الكنية"
                />
                {errors.lastName && <div className="ap-error">{errors.lastName}</div>}
              </div>

              {/* الميلاد + الجنس */}
              <div className="ap-field">
                <label>تاريخ الميلاد</label>
                <input className="ap-input" type="date" value={dob} onChange={(e)=>setDob(e.target.value)}/>
              </div>
              <div className="ap-field">
                <label>الجنس</label>
                <div className="ap-radio">
                  <label><input type="radio" checked={gender==="female"} onChange={()=>setGender("female")} /> أنثى</label>
                  <label><input type="radio" checked={gender==="male"} onChange={()=>setGender("male")} /> ذكر</label>
                </div>
              </div>
              <div className="ap-field">
                <label>الحالة</label>
                <select className="ap-input" value={status} onChange={(e)=>setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* العنوان */}
              <div className="ap-field ap-span-3">
                <label>العنوان</label>
                <input className="ap-input" dir="auto" placeholder="المدينة، الشارع…" value={address}
                  onChange={(e)=>setAddress(e.target.value)}/>
              </div>

              {/* الروضة ← الفرع ← الصف */}
              <div className="ap-field">
                <label>الروضة</label>
                <select className="ap-input" value={kgId} onChange={(e)=>setKgId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {kgList.map(k=><option key={k.id} value={k.id}>{k.name || k.id}</option>)}
                </select>
              </div>
              <div className="ap-field">
                <label>الفرع</label>
                <select className="ap-input" value={branchId} onChange={(e)=>setBranchId(e.target.value)} disabled={!kgId}>
                  <option value="">{kgId ? "— اختر —" : "اختر الروضة أولًا"}</option>
                  {branchList.map(b=><option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                </select>
              </div>
              <div className="ap-field">
                <label>الصف</label>
                <select className="ap-input" value={classId} onChange={(e)=>setClassId(e.target.value)} disabled={!branchId}>
                  <option value="">{branchId ? "— اختر —" : "اختر الفرع أولًا"}</option>
                  {classList.map(c=><option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                </select>
              </div>

              {/* الصورة */}
              <div className="ap-field">
                <label>الصورة</label>
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  <label className="ap-upload" style={{whiteSpace:"nowrap"}}>
                    اختيار صورة
                    <input type="file" accept="image/*" onChange={(e)=>onPickPhoto(e.target.files?.[0])}/>
                  </label>
                  {photoPreview ? (
                    <img src={photoPreview} alt="" style={{width:80, height:80, objectFit:"cover", borderRadius:8, border:"1px solid #2b3a4c"}} />
                  ) : (
                    <div style={{width:80, height:80, display:"grid", placeItems:"center", borderRadius:8, border:"1px dashed #2b3a4c", color:"#94a3b8"}}>👦</div>
                  )}
                </div>
              </div>

              {/* معلومات الأب/الأم + ملخص */}
              <div className="ap-field ap-span-3">
                <label>معلومات وليّي الأمر (داخل وثيقة الطالب)</label>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                  <div style={styles.parentCard}>
                    <div style={styles.parentHead}>
                      <b>الأب</b>
                      <button type="button" className="ap-btn ap-btn--soft" onClick={()=>{
                        setParentDraft({...father}); setParentModal("father");
                      }}>إضافة/تعديل</button>
                    </div>
                    <ParentSummary p={father} />
                  </div>
                  <div style={styles.parentCard}>
                    <div style={styles.parentHead}>
                      <b>الأم</b>
                      <button type="button" className="ap-btn ap-btn--soft" onClick={()=>{
                        setParentDraft({...mother}); setParentModal("mother");
                      }}>إضافة/تعديل</button>
                    </div>
                    <ParentSummary p={mother} />
                  </div>
                </div>
              </div>

              {/* ربط بحساب/حسابات أولياء الأمور */}
              <div className="ap-field ap-span-3">
                <label>ربط بحساب/حسابات أولياء الأمور</label>

                {/* زر فتح المنتقي */}
                <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                  <button
                    type="button"
                    className="ap-btn ap-btn--soft"
                    onClick={()=>setPickerOpen(true)}
                    title="اختيار حسابات أولياء الأمور"
                  >
                    اختيار مسؤول الحساب
                  </button>

                  {/* عرض الشارات المختارة */}
                  {selectedGuardianIds.length > 0 ? (
                    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                      {selectedGuardianIds.map((gid) => {
                        const g = guardians.find(x=>x.id===gid);
                        if (!g) return null;
                        const isPrimary = gid === primaryGuardianId;
                        return (
                          <div
                            key={gid}
                            style={{
                              display:"inline-flex",
                              alignItems:"center",
                              gap:8,
                              background:"rgba(34,197,94,.12)",
                              border:"1px solid rgba(34,197,94,.4)",
                              color:"#a7f3d0",
                              padding:"6px 10px",
                              borderRadius:999
                            }}
                            title={isPrimary ? "الحساب الرئيسي" : "اضغط لجعله رئيسيًا"}
                          >
                            <span
                              onClick={()=>setPrimaryGuardianId(gid)}
                              style={{
                                width:8, height:8, background:"#22c55e", borderRadius:999,
                                boxShadow: isPrimary ? "0 0 0 3px rgba(34,197,94,.35)" : "none",
                                cursor:"pointer"
                              }}
                            />
                            <span>{g.fullName}</span>
                            {g.phone && <span style={{opacity:.7}}>— {g.phone}</span>}
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={()=>{
                                const rest = selectedGuardianIds.filter(x=>x!==gid);
                                setSelectedGuardianIds(rest);
                                if (gid === primaryGuardianId) setPrimaryGuardianId(rest[0] || "");
                              }}
                              title="إزالة"
                              style={{marginInlineStart:4}}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ap-note">لم يتم اختيار أي حساب بعد.</div>
                  )}
                </div>

                <div className="ap-note" style={{ marginTop: 8 }}>
                  تلميح: يمكنك تعيين “الرئيسي” من القائمة أو بالنقر على النقطة داخل الشارة.
                </div>
              </div>

              {/* أزرار */}
              <div className="ap-actions ap-span-3">
                <button type="button" className="ap-btn" onClick={resetForm}>تفريغ</button>
                <button type="submit" className="ap-btn ap-btn--primary" disabled={loading}>
                  {loading ? "جاري الحفظ…" : "إضافة الطالب"}
                </button>
              </div>
            </form>
          ) : (
            // ——— تبويب الصحة ———
            <form className="ap-form" onSubmit={submit}>
              <div className="ap-field">
                <label>الطول (سم)</label>
                <input className="ap-input" dir="ltr" value={health.heightCm}
                  onChange={(e)=>setHealth(h=>({...h, heightCm: normalizeDigits(e.target.value)}))}
                  placeholder="Height"/>
              </div>
              <div className="ap-field">
                <label>الوزن (كغ)</label>
                <input className="ap-input" dir="ltr" value={health.weightKg}
                  onChange={(e)=>setHealth(h=>({...h, weightKg: normalizeDigits(e.target.value)}))}
                  placeholder="Weight"/>
              </div>

              <div className="ap-field">
                <label>فصيلة الدم</label>
                <input className="ap-input" value={health.bloodGroup}
                  onChange={(e)=>setHealth(h=>({...h, bloodGroup: e.target.value}))} placeholder="Unknown / A+ / O- …"/>
              </div>
              <div className="ap-field">
                <label>حساسية</label>
                <input className="ap-input" value={health.allergy}
                  onChange={(e)=>setHealth(h=>({...h, allergy: e.target.value}))} placeholder="Allergy"/>
              </div>

              <div className="ap-field">
                <label>أمراض مزمنة</label>
                <input className="ap-input" value={health.chronic}
                  onChange={(e)=>setHealth(h=>({...h, chronic: e.target.value}))} placeholder="Chronic conditions"/>
              </div>
              <div className="ap-field">
                <label>أدوية دائمة</label>
                <input className="ap-input" value={health.medications}
                  onChange={(e)=>setHealth(h=>({...h, medications: e.target.value}))} placeholder="Medications"/>
              </div>

              <div className="ap-field">
                <label>مطعّم حتى الآن؟</label>
                <label className="ap-line">
                  <input type="checkbox" checked={health.vaccinationsUpToDate}
                    onChange={(e)=>setHealth(h=>({...h, vaccinationsUpToDate: e.target.checked}))}/>
                  <span style={{marginInlineStart:8}}>نعم</span>
                </label>
              </div>
              <div className="ap-field">
                <label>تاريخ آخر فحص</label>
                <input className="ap-input" type="date" value={health.lastCheckup}
                  onChange={(e)=>setHealth(h=>({...h, lastCheckup: e.target.value}))}/>
              </div>

              <div className="ap-field">
                <label>طبيب العائلة</label>
                <input className="ap-input" value={health.doctorName}
                  onChange={(e)=>setHealth(h=>({...h, doctorName: e.target.value}))} placeholder="Doctor name"/>
              </div>
              <div className="ap-field">
                <label>هاتف الطبيب</label>
                <input className="ap-input" dir="ltr" value={health.doctorPhone}
                  onChange={(e)=>setHealth(h=>({...h, doctorPhone: normalizeDigits(e.target.value)}))}
                  placeholder="Doctor phone"/>
              </div>

              <div className="ap-field">
                <label>البصر</label>
                <input className="ap-input" value={health.vision}
                  onChange={(e)=>setHealth(h=>({...h, vision: e.target.value}))} placeholder="Vision notes"/>
              </div>
              <div className="ap-field ap-span-2">
                <label>ملاحظات غذائية</label>
                <textarea className="ap-input" rows={3} value={health.dietNotes}
                  onChange={(e)=>setHealth(h=>({...h, dietNotes: e.target.value}))}
                  placeholder="حساسية طعام، قيود غذائية…"/>
              </div>

              <div className="ap-actions ap-span-2">
                <button type="button" className="ap-btn" onClick={()=>setTab("profile")}>الرجوع للمعلومات الأساسية</button>
                <button type="submit" className="ap-btn ap-btn--primary" disabled={loading}>
                  {loading ? "جاري الحفظ…" : "إضافة الطالب"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

// ————— مكوّن صغير لعرض ملخص الأب/الأم —————
function ParentSummary({ p }) {
  const none = !p?.name && !p?.phone && !p?.email && !p?.job && !p?.nationalId && !p?.notes;
  if (none) return <div className="ap-note">لا توجد بيانات بعد.</div>;
  return (
    <ul style={{margin:0, paddingInlineStart:16, color:"#cbd5e1"}}>
      {p.name && <li>الاسم: {p.name}</li>}
      {p.phone && <li>الهاتف: {p.phone}</li>}
      {p.email && <li>البريد: {p.email}</li>}
      {p.job && <li>المهنة: {p.job}</li>}
      {p.nationalId && <li>الرقم الوطني: {p.nationalId}</li>}
      {p.notes && <li>ملاحظات: {p.notes}</li>}
    </ul>
  );
}

// ————— أنماط بسيطة للمودالات والبطاقات —————
const styles = {
  backdrop: {
    position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
    display:"grid", placeItems:"center", zIndex: 50
  },
  modal: {
    width:"min(720px, 92vw)", background:"#0b1220", border:"1px solid #243244",
    borderRadius:12, padding:16, boxShadow:"0 10px 40px rgba(0,0,0,.5)"
  },
  modalHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  parentCard: { border:"1px solid #243244", borderRadius:10, padding:12, background:"#0f172a" },
  parentHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },

  pickerModal: {
    width:"min(720px, 92vw)",
    background:"#0b1220",
    border:"1px solid #243244",
    borderRadius:12,
    padding:12,
    boxShadow:"0 14px 40px rgba(0,0,0,.45)"
  },
  pickerHead: {
    display:"flex", alignItems:"center", justifyContent:"space-between"
  },
  pickerList: {
    marginTop:10,
    display:"grid",
    gap:8,
    maxHeight:360,
    overflow:"auto",
    paddingRight:4
  },
};
