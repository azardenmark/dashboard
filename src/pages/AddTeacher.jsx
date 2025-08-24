// src/pages/AddTeacher.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./FormStyles.css";

import {
  db,
  storage,
  createUserOnSecondary,
  signOutSecondary,
  deleteSecondaryUser,
  saveToFirestore,
} from "../firebase";

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import {
  doc,
  deleteDoc,
  collection,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  increment,
  arrayUnion,
} from "firebase/firestore";

/* ================= Utils ================= */
function normalizeDigits(str = "") {
  const map = {
    "٠": "0","١": "1","٢": "2","٣": "3","٤": "4",
    "٥": "5","٦": "6","٧": "7","٨": "8","٩": "9",
    "۰": "0","۱": "1","۲": "2","۳": "3","۴": "4",
    "۵": "5","۶": "6","۷": "7","۸": "8","۹": "9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}
function prettyFirebaseError(err) {
  if (!err?.code) return err?.message || "حدث خطأ غير معروف";
  switch (err.code) {
    case "auth/email-already-in-use": return "هذا البريد مستخدم بالفعل.";
    case "auth/weak-password":        return "كلمة المرور ضعيفة جداً.";
    case "auth/invalid-email":        return "البريد الإلكتروني غير صالح.";
    default:                          return err.message || "فشل العملية.";
  }
}

/* ============== Provinces (fallback) ============== */
const DEFAULT_PROVINCES = [
  { id:"DAM", name:"دمشق",      code:"DAM" },
  { id:"RDI", name:"ريف دمشق",  code:"RDI" },
  { id:"ALE", name:"حلب",       code:"ALE" },
  { id:"HMS", name:"حمص",       code:"HMS" },
  { id:"HMA", name:"حماة",      code:"HMA" },
  { id:"LAZ", name:"اللاذقية",  code:"LAZ" },
  { id:"TAR", name:"طرطوس",     code:"TAR" },
  { id:"IDL", name:"إدلب",      code:"IDL" },
  { id:"DEZ", name:"دير الزور", code:"DEZ" },
  { id:"RAQ", name:"الرقة",     code:"RAQ" },
  { id:"HAS", name:"الحسكة",    code:"HAS" },
  { id:"DRA", name:"درعا",      code:"DRA" },
  { id:"SWA", name:"السويداء",  code:"SWA" },
  { id:"QUN", name:"القنيطرة",  code:"QUN" },
];

/* ===== publicId generator with province prefix ===== */
function randomLetters4(){ const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let s=""; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
function randomDigits4(){ return String(Math.floor(Math.random()*10000)).padStart(4,"0"); }
async function assignPrefixedPublicId({ uid, role, col, prefix, email=null, phone=null, displayName="" }) {
  if (!uid || !col || !role || !prefix) throw new Error("assignPrefixedPublicId: معطيات ناقصة.");
  let publicId = "";
  for (let i=0;i<50;i++){
    const base = `${randomLetters4()}${randomDigits4()}`;
    const candidate = `${prefix}-${base}`;
    const idxSnap = await getDoc(doc(db,"logins",candidate));
    if (!idxSnap.exists()) { publicId = candidate; break; }
  }
  if (!publicId) throw new Error("تعذر توليد publicId فريد.");

  await setDoc(doc(db,col,uid), { publicId, role, updatedAt: serverTimestamp() }, { merge:true });
  await setDoc(doc(db,"logins",publicId), {
    uid, role, col, email: email||null, phone: phone||null, displayName: displayName||"", createdAt: serverTimestamp()
  }, { merge:true });

  return publicId;
}

export default function AddTeacher() {
  // ——— بيانات أساسية ———
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [subject,   setSubject]   = useState("");   // اختصاص/مادة
  const [active,    setActive]    = useState(true);
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // ——— ملفات الشهادات ———
  const [files, setFiles] = useState([]); // File[]
  function onPickFiles(fileList) {
    if (!fileList?.length) return;
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
  }
  function removeFileAt(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }
  async function uploadCertificates(uid) {
    const uploaded = [];
    for (const f of files) {
      const path = `teachers/${uid}/certificates/${Date.now()}_${f.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, f);
      const url = await getDownloadURL(r);
      uploaded.push({ name: f.name, size: f.size, contentType: f.type || "application/octet-stream", url, path });
    }
    return uploaded;
  }

  // ——— المحافظات ———
  const [provinces, setProvinces] = useState([]);
  const [provinceId, setProvinceId] = useState(""); // == code
  const selectedProvince = useMemo(
    () => provinces.find(p => p.id === provinceId) || null,
    [provinceId, provinces]
  );

  // ——— الروضات/الفروع ———
  const [kgList, setKgList] = useState([]);
  const [kgId, setKgId] = useState("");
  const [branchList, setBranchList] = useState([]);
  const [branchId, setBranchId] = useState("");

  // ——— واجهة ———
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [errors, setErrors] = useState({
    firstName: "", lastName: "", contact: "", password: "", confirm: "", province: "", kg: ""
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* تحميل المحافظات + الروضات */
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "provinces"), orderBy("name"));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => {
          const x = d.data() || {};
          const code = x.code || d.id;
          arr.push({ id: code, name: x.name || d.id, code });
        });
        setProvinces(arr.length ? arr : DEFAULT_PROVINCES);
      } catch {
        setProvinces(DEFAULT_PROVINCES);
      }
    })();

    (async () => {
      try {
        const snap = await getDocs(collection(db, "kindergartens"));
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setKgList(arr);
      } catch {
        setKgList([]);
      }
    })();
  }, []);

  // تحميل فروع الروضة
  useEffect(() => {
    setBranchList([]); setBranchId("");
    if (!kgId) return;
    (async () => {
      try {
        const qy = query(collection(db, "branches"), where("parentId", "==", kgId));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setBranchList(arr);
      } catch {
        setBranchList([]);
      }
    })();
  }, [kgId]);

  // فلترة الروضات حسب المحافظة المختارة
  const kgFiltered = useMemo(() => {
    if (!selectedProvince) return kgList;
    const code = selectedProvince.code;
    const name = selectedProvince.name;
    return kgList.filter(k =>
      (k.provinceCode && k.provinceCode === code) ||
      (k.provinceName && k.provinceName === name) ||
      (k.province && k.province === name)
    );
  }, [kgList, selectedProvince]);

  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setGender("male"); setAddress(""); setPassword(""); setConfirm("");
    setSubject(""); setActive(true);
    setFiles([]);
    setProvinceId("");
    setKgId(""); setBranchId("");
    setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"", province:"", kg:"" });
    setFormError(""); setSuccess("");
  }

  async function submit(e) {
    e.preventDefault();
    setFormError(""); setSuccess("");

    const phoneNorm = normalizeDigits(phone);

    const nextErrors = {
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName : lastName.trim()  ? "" : "الكنية مطلوبة",
      contact  : (email.trim() && phoneNorm.trim()) ? "" : "أدخل البريد ورقم الهاتف",
      password : password.length >= 6 ? "" : "كلمة المرور لا تقل عن 6 أحرف",
      confirm  : password === confirm ? "" : "كلمتا المرور غير متطابقتين",
      province : selectedProvince ? "" : "اختر المحافظة",
      kg       : kgId ? "" : "اختر الروضة",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    let uid = null;
    let uploadedPaths = [];

    try {
      setLoading(true);

      // 1) Auth
      const cred = await createUserOnSecondary({ email: email.trim(), password });
      uid = cred.uid;

      // 2) رفع الملفات
      const certs = await uploadCertificates(uid);
      uploadedPaths = certs.map(x => x.path);

      // 3) Firestore: وثيقة المعلّم (id = uid)
      const kg = kgList.find(k => k.id === kgId) || {};
      const br = branchList.find(b => b.id === branchId) || {};

      const base = {
        role     : "teacher",
        firstName: firstName.trim(),
        lastName : lastName.trim(),
        email    : email.trim(),
        phone    : phoneNorm.trim(),
        gender,
        address  : address.trim() || null,
        subject  : subject.trim() || "",
        certificates: certs,
        active   : Boolean(active),

        provinceName: selectedProvince?.name || "",
        provinceCode: selectedProvince?.code || "",

        kindergartenId: kgId,
        kindergartenName: kg?.name || "",
        branchId: branchId || null,
        branchName: br?.name || "",

        searchIndex: [
          firstName, lastName, email, phoneNorm, subject,
          selectedProvince?.name, kg?.name, br?.name
        ].filter(Boolean).join(" ").toLowerCase(),

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await saveToFirestore("teachers", base, { id: uid });

      // 4) publicId مع بادئة كود المحافظة + فهرسة
      const publicId = await assignPrefixedPublicId({
        uid,
        role: "teacher",
        col : "teachers",
        prefix: selectedProvince.code,
        email: email.trim() || null,
        phone: phoneNorm.trim() || null,
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      });

      // 5) تحديثات مترابطة للروضة/الفرع (عدادات + teacherIds)
      const batch = writeBatch(db);

      if (kgId) {
        const kRef = doc(db, "kindergartens", kgId);
        batch.set(kRef, {}, { merge: true });
        batch.update(kRef, {
          teacherCount: increment(1),
          ...(active ? { teacherActiveCount: increment(1) } : {}),
          teacherIds: arrayUnion(uid),
          updatedAt: serverTimestamp(),
        });
      }

      if (branchId) {
        const bRef = doc(db, "branches", branchId);
        batch.set(bRef, {}, { merge: true });
        batch.update(bRef, {
          teacherCount: increment(1),
          ...(active ? { teacherActiveCount: increment(1) } : {}),
          teacherIds: arrayUnion(uid),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      setSuccess(`✅ تم إنشاء حساب المعلّم بنجاح. الكود: ${publicId}`);
      resetForm();
    } catch (err) {
      console.error(err);

      // Rollback كامل
      try { await deleteSecondaryUser(); } catch {/* تجاهل */}
      for (const p of uploadedPaths) {
        try { await deleteObject(ref(storage, p)); } catch {/* تجاهل */}
      }
      if (uid) { try { await deleteDoc(doc(db, "teachers", uid)); } catch {/* تجاهل */} }

      setFormError(prettyFirebaseError(err));
    } finally {
      await signOutSecondary();
      setLoading(false);
    }
  }

  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة معلّم</h1>
        <p className="ap-hero__sub">أدخل البيانات الأساسية للمعلّم ثم اربطه بالروضة/الفرع ليتم تحديث اللوحات والعدادات تلقائيًا.</p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>البيانات الأساسية</div>
          <div className="ap-note">سيتم إنشاء الحساب كـ <b>معلّم</b></div>
        </div>

        <div className="ap-card__body">
          {formError && <div className="ap-error" style={{marginBottom:8}}>⚠️ {formError}</div>}
          {success   && <div className="ap-success" style={{marginBottom:8}}>{success}</div>}

          <form className="ap-form" onSubmit={submit}>
            {/* الاسم */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> الاسم</label>
              <input
                dir="auto"
                className={`ap-input ${errors.firstName ? "ap-invalid" : ""}`}
                value={firstName}
                onChange={(e)=>setFirstName(e.target.value)}
                type="text"
                placeholder="أدخل الاسم"
              />
              {errors.firstName && <div className="ap-error">{errors.firstName}</div>}
            </div>

            {/* الكنية */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> الكنية</label>
              <input
                dir="auto"
                className={`ap-input ${errors.lastName ? "ap-invalid" : ""}`}
                value={lastName}
                onChange={(e)=>setLastName(e.target.value)}
                type="text"
                placeholder="أدخل الكنية"
              />
              {errors.lastName && <div className="ap-error">{errors.lastName}</div>}
            </div>

            {/* البريد */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> البريد الإلكتروني</label>
              <input
                dir="ltr"
                className={`ap-input ${errors.contact ? "ap-invalid" : ""}`}
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
                type="email"
                placeholder="example@email.com"
                inputMode="email"
              />
            </div>

            {/* الهاتف */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> رقم الهاتف</label>
              <input
                dir="ltr"
                className={`ap-input ${errors.contact ? "ap-invalid" : ""}`}
                value={phone}
                onChange={(e)=>setPhone(normalizeDigits(e.target.value))}
                type="tel"
                placeholder="09xxxxxxxx"
                inputMode="tel"
              />
              {errors.contact && <div className="ap-error">{errors.contact}</div>}
            </div>

            {/* الجنس */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> الجنس</label>
              <div className="ap-radio">
                <label><input type="radio" checked={gender==="male"} onChange={()=>setGender("male")} /> ذكر</label>
                <label><input type="radio" checked={gender==="female"} onChange={()=>setGender("female")} /> أنثى</label>
              </div>
            </div>

            {/* العنوان (اختياري) */}
            <div className="ap-field ap-span-2">
              <label>العنوان</label>
              <input
                dir="auto"
                className="ap-input"
                value={address}
                onChange={(e)=>setAddress(e.target.value)}
                type="text"
                placeholder="المدينة، الشارع، رقم المنزل…"
              />
            </div>

            {/* الاختصاص */}
            <div className="ap-field">
              <label>الاختصاص / المادة</label>
              <input
                className="ap-input"
                value={subject}
                onChange={(e)=>setSubject(e.target.value)}
                type="text"
                placeholder="رياضيات، لغة عربية، أنشطة…"
              />
            </div>

            {/* الحالة */}
            <div className="ap-field">
              <label>الحالة</label>
              <div className="ap-radio">
                <label><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)} /> نشط</label>
              </div>
              <div className="ap-note">إذا كان المعلّم نشطًا فسيُحتسب ضمن «عدد المعلّمين النشطين» في الروضة/الفرع.</div>
            </div>

            {/* المحافظة + كود المحافظة */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> المحافظة</label>
              <select
                className={`ap-input ${errors.province ? "ap-invalid" : ""}`}
                value={provinceId}
                onChange={(e)=>{ setProvinceId(e.target.value); setKgId(""); setBranchId(""); }}
              >
                <option value="">— اختر المحافظة —</option>
                {provinces.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {errors.province && <div className="ap-error">{errors.province}</div>}
            </div>

            <div className="ap-field">
              <label>كود المحافظة (توليدي)</label>
              <input
                className="ap-input"
                value={selectedProvince?.code || ""}
                readOnly
                placeholder="اختر المحافظة أولًا"
                title="غير قابل للتعديل — يُستخدم كبادئة للكود العام"
              />
            </div>

            {/* الروضة + الفرع */}
            <div className="ap-field ap-span-2">
              <label><span className="ap-required">*</span> الروضة</label>
              <select
                className={`ap-input ${errors.kg ? "ap-invalid" : ""}`}
                value={kgId}
                onChange={(e)=>{ setKgId(e.target.value); setBranchId(""); }}
                disabled={!provinces.length}
              >
                <option value="">
                  {selectedProvince
                    ? (kgFiltered.length ? "— اختر —" : "لا توجد روضات ضمن هذه المحافظة")
                    : "اختر المحافظة أولًا"}
                </option>
                {selectedProvince && kgFiltered.map(k => (
                  <option key={k.id} value={k.id}>{k.name || k.id}</option>
                ))}
              </select>
              {errors.kg && <div className="ap-error">{errors.kg}</div>}

              <div style={{marginTop:8}}>
                <label>الفرع (اختياري)</label>
                <select
                  className="ap-input"
                  value={branchId}
                  onChange={(e)=>setBranchId(e.target.value)}
                  disabled={!kgId}
                >
                  <option value="">{kgId ? "— بدون فرع / اختر —" : "اختر الروضة أولًا"}</option>
                  {branchList.map(b => (
                    <option key={b.id} value={b.id}>{b.name || b.id}</option>
                  ))}
                </select>
              </div>
              <div className="ap-note" style={{marginTop:6}}>
                ربط المعلّم بالروضة/الفرع يتيح إظهار الأعداد الحقيقية تلقائيًا في جداول الروضات والصفوف.
              </div>
            </div>

            {/* كلمة المرور */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> كلمة المرور</label>
              <div className="ap-input-wrap">
                <input
                  className={`ap-input ${errors.password ? "ap-invalid" : ""}`}
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="ap-eye"
                  aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  title={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  onClick={()=>setShowPw(v=>!v)}
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.password && <div className="ap-error">{errors.password}</div>}
            </div>

            {/* تأكيد كلمة المرور */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> تأكيد كلمة المرور</label>
              <div className="ap-input-wrap">
                <input
                  className={`ap-input ${errors.confirm ? "ap-invalid" : ""}`}
                  value={confirm}
                  onChange={(e)=>setConfirm(e.target.value)}
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="ap-eye"
                  aria-label={showConfirm ? "إخفاء التأكيد" : "إظهار التأكيد"}
                  title={showConfirm ? "إخفاء التأكيد" : "إظهار التأكيد"}
                  onClick={()=>setShowConfirm(v=>!v)}
                >
                  {showConfirm ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.confirm && <div className="ap-error">{errors.confirm}</div>}
            </div>

            {/* الشهادات / ملفات داعمة (اختياري) */}
            <div className="ap-field ap-span-2">
              <label>شهادات / ملفات داعمة (اختياري)</label>
              <label className="ap-upload">
                اختر ملفات
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={(e)=>onPickFiles(e.target.files)}
                />
              </label>

              {files.length > 0 && (
                <div className="ap-files" style={{ marginTop: 8 }}>
                  {files.map((f, idx) => (
                    <div key={idx} className="ap-file-item">
                      <span>
                        📂 {f.name} —{" "}
                        {f.size >= 1024*1024
                          ? `${(f.size/1024/1024).toFixed(2)} MB`
                          : `${(f.size/1024).toFixed(1)} KB`}
                      </span>
                      <button
                        type="button"
                        className="ap-btn ap-btn--danger"
                        onClick={()=>removeFileAt(idx)}
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* الأزرار */}
            <div className="ap-actions ap-span-2">
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>معلّم</b>. الكود العام سيبدأ بكود المحافظة.</span>
              <button type="button" className="ap-btn" onClick={resetForm}>
                تفريغ
              </button>
              <button type="submit" className="ap-btn ap-btn--primary" disabled={loading}>
                {loading ? "جاري الحفظ…" : "إنشاء الحساب"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
