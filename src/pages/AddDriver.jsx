// src/pages/AddDriver.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./FormStyles.css";

import {
  db,
  storage,
  createUserOnSecondary,
  signOutSecondary,
  deleteSecondaryUser,
} from "../firebase";

import { saveToFirestore } from "../firebase";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "firebase/storage";
import {
  doc, deleteDoc, collection, getDocs, getDoc, setDoc, serverTimestamp,
  query, orderBy, where, limit, writeBatch
} from "firebase/firestore";

/* ================= Provinces defaults (id = code) ================= */
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

// كتابة المحافظات الافتراضية مرة واحدة لو كانت المجموعة فارغة
async function seedDefaultProvinces() {
  const qy = query(collection(db, "provinces"), limit(1));
  const snap = await getDocs(qy);
  if (!snap.empty) return;
  const batch = writeBatch(db);
  DEFAULT_PROVINCES.forEach(p => {
    batch.set(
      doc(db, "provinces", p.id),
      { name: p.name, code: p.code, createdAt: serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
}

/* ================= Utils ================= */
function normalizeDigits(str = "") {
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
    "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4",
    "۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}
function prettyFirebaseError(err) {
  if (!err?.code) return err?.message || "حدث خطأ غير معروف.";
  switch (err.code) {
    case "auth/email-already-in-use": return "هذا البريد مستخدم بالفعل.";
    case "auth/weak-password":        return "كلمة المرور ضعيفة جداً.";
    case "auth/invalid-email":        return "البريد الإلكتروني غير صالح.";
    case "permission-denied":         return "صلاحيات غير كافية للكتابة في قاعدة البيانات.";
    default:                          return err.message || "فشلت العملية.";
  }
}

/* ====== توليد كود دخول مع بادئة المحافظة + فهرسته ====== */
function randomLetters4(){ const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let s=""; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
function randomDigits4(){ return String(Math.floor(Math.random()*10000)).padStart(4,"0"); }

async function createPrefixedLoginCode({ uid, role, col, email, phone, displayName, provinceCode }) {
  if (!provinceCode) throw new Error("لم يتم تحديد كود المحافظة.");

  for (let i = 0; i < 40; i++) {
    const cand = `${provinceCode}-${randomLetters4()}${randomDigits4()}`; // مثال: DAM-ABCD1234
    const idxSnap = await getDoc(doc(db, "logins", cand));
    if (!idxSnap.exists()) {
      // سجّل الكود في فهرس logins
      await setDoc(
        doc(db, "logins", cand),
        {
          uid, role, col,
          email: email || null,
          phone: phone || null,
          displayName: displayName || "",
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      // واكتبه أيضاً على وثيقة المستخدم كـ publicId
      await setDoc(
        doc(db, col, uid),
        { publicId: cand, updatedAt: serverTimestamp() },
        { merge: true }
      );
      return cand;
    }
  }
  throw new Error("تعذّر توليد كود دخول فريد. أعد المحاولة.");
}

// معاينة تقريبية (ليست نهائية) للكود قبل الحفظ
function previewLoginCode(provCode = "", firstName = "", lastName = "", phone = "") {
  if (!provCode) return "";
  const letters = (firstName + lastName)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
  const digits = normalizeDigits(phone).slice(-4).padStart(4, "0");
  return `${provCode}-${letters}${digits}`;
}

/* ================= Component ================= */
export default function AddDriver() {
  // الحقول الأساسية
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // المحافظة
  const [provinces, setProvinces] = useState([]); // [{id, name, code}]
  const [provinceId, setProvinceId] = useState("");
  const selProvince = useMemo(
    () => provinces.find(p => p.id === provinceId) || null,
    [provinces, provinceId]
  );

  // معاينة تقريبية للكود
  const codePreview = useMemo(
    () => previewLoginCode(selProvince?.code || "", firstName, lastName, phone),
    [selProvince?.code, firstName, lastName, phone]
  );

  // رخص القيادة
  const [files, setFiles] = useState([]);

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [errors, setErrors] = useState({
    firstName:"", lastName:"", contact:"", password:"", confirm:"", province:""
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* ==== تحميل المحافظات من Firestore ==== */
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "provinces"), orderBy("name"));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => {
          const x = d.data() || {};
          arr.push({ id: d.id, name: x.name || d.id, code: x.code || d.id });
        });

        if (arr.length === 0) {
          try { await seedDefaultProvinces(); } catch {}
          setProvinces(DEFAULT_PROVINCES);
        } else {
          setProvinces(arr);
        }
      } catch {
        setProvinces(DEFAULT_PROVINCES);
      }
    })();
  }, []);

  /* ==== مرفقات ==== */
  function onPickFiles(list) { if (!list?.length) return; setFiles(prev => [...prev, ...Array.from(list)]); }
  function removeFileAt(i) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }
  async function uploadLicenses(uid) {
    const uploaded = [];
    for (const f of files) {
      const path = `drivers/${uid}/licenses/${Date.now()}_${f.name}`;
      const r = ref(storage, path);
      await uploadBytes(r, f);
      const url = await getDownloadURL(r);
      uploaded.push({
        name: f.name,
        size: f.size,
        contentType: f.type || "application/octet-stream",
        url,
        path,
      });
    }
    return uploaded;
  }

  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setGender("male"); setAddress(""); setPassword(""); setConfirm("");
    setProvinceId(""); setFiles([]);
    setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"", province:"" });
    setFormError(""); setSuccess("");
  }

  // فحص تكرار سريع (قبل إنشاء مستخدم الـ Auth)
  async function ensureNotDuplicate({ email, phone }) {
    const e = email.trim();
    const p = phone.trim();
    const promises = [];
    if (e) promises.push(getDocs(query(collection(db, "drivers"), where("email", "==", e), limit(1))));
    if (p) promises.push(getDocs(query(collection(db, "drivers"), where("phone", "==", p), limit(1))));
    const [eSnap, pSnap] = await Promise.all(promises.length === 2 ? promises : [...promises, Promise.resolve({ empty:true })]);
    if (eSnap && !eSnap.empty) throw new Error("هذا البريد الإلكتروني مسجّل لسائق آخر.");
    if (pSnap && !pSnap.empty) throw new Error("رقم الهاتف مسجّل لسائق آخر.");
  }

  /* ==== حفظ ==== */
  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    setFormError(""); setSuccess("");

    const phoneNorm = normalizeDigits(phone);

    const nextErrors = {
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName : lastName.trim()  ? "" : "الكنية مطلوبة",
      contact  : (email.trim() && phoneNorm.trim()) ? "" : "أدخل البريد ورقم الهاتف",
      password : password.length >= 6 ? "" : "كلمة المرور لا تقل عن 6 أحرف",
      confirm  : password === confirm ? "" : "كلمتا المرور غير متطابقتين",
      province : selProvince ? "" : "اختر المحافظة",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    let uid = null;
    let uploadedPaths = [];

    try {
      setLoading(true);

      // 0) فحص تكرار سريع
      await ensureNotDuplicate({ email, phone: phoneNorm });

      // 1) إنشاء مستخدم Auth على المثيل الثانوي
      const cred = await createUserOnSecondary({ email: email.trim(), password });
      uid = cred.uid;

      // 2) رفع الرخص
      const licenses = await uploadLicenses(uid);
      uploadedPaths = licenses.map(x => x.path);

      // 3) حفظ مستند السائق (id = uid) + المحافظة
      const provinceName = selProvince?.name || "";
      const provinceCode = selProvince?.code || "";
      const displayName  = `${firstName.trim()} ${lastName.trim()}`.trim();

      await saveToFirestore("drivers", {
        role     : "driver",
        firstName: firstName.trim(),
        lastName : lastName.trim(),
        displayName,
        email    : email.trim(),
        phone    : phoneNorm.trim(),
        gender,
        address  : address.trim() || null,
        licenses,
        active   : true,
        province     : provinceName,
        provinceCode : provinceCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { id: uid });

      // 4) توليد كود دخول مع بادئة كود المحافظة + فهرسته وكتابته كـ publicId
      const fullCode = await createPrefixedLoginCode({
        uid,
        role: "driver",
        col : "drivers",
        email: email.trim(),
        phone: phoneNorm.trim(),
        displayName,
        provinceCode: provinceCode || "NA"
      });

      setSuccess(`🎉 تم إنشاء حساب السائق بنجاح. الكود: ${fullCode}`);
      resetForm();
    } catch (err) {
      console.error(err);

      // ===== Rollback شامل =====
      try { await deleteSecondaryUser(); } catch {/* تجاهل */}
      for (const p of uploadedPaths) {
        try { await deleteObject(ref(storage, p)); } catch {/* تجاهل */}
      }
      if (uid) { try { await deleteDoc(doc(db, "drivers", uid)); } catch {/* تجاهل */} }

      setFormError(prettyFirebaseError(err));
    } finally {
      await signOutSecondary(); // لا يمسّ جلسة الأدمن
      setLoading(false);
    }
  }

  /* ==== واجهة ==== */
  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة سائق</h1>
        <p className="ap-hero__sub">أدخل البيانات الأساسية للسائق الجديد. سيتم توليد كود دخول بصيغة <b>PROV-XXXX9999</b> تلقائيًا.</p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>البيانات الأساسية</div>
          <div className="ap-note">سيتم إنشاء الحساب كـ <b>سائق</b></div>
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

            {/* العنوان */}
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

            {/* المحافظة */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> المحافظة</label>
              <select
                className={`ap-input ${errors.province ? "ap-invalid" : ""}`}
                value={provinceId}
                onChange={(e)=>setProvinceId(e.target.value)}
              >
                <option value="">— اختر المحافظة —</option>
                {provinces.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {errors.province && <div className="ap-error">{errors.province}</div>}
            </div>

            {/* كود المحافظة (غير قابل للتعديل) */}
            <div className="ap-field">
              <label>كود المحافظة</label>
              <input
                className="ap-input"
                value={selProvince?.code || ""}
                readOnly
                disabled
                placeholder="اختر المحافظة أولاً"
                title="يعبّأ تلقائياً حسب المحافظة"
              />
            </div>

            {/* معاينة كود الدخول التقريبية */}
            <div className="ap-field ap-span-2">
              <label>معاينة كود الدخول (تقريبية — النهائي قد يختلف)</label>
              <input
                className="ap-input"
                value={selProvince ? (codePreview || `${selProvince.code}-XXXX0000`) : "اختر المحافظة وأكمِل البيانات لرؤية المعاينة"}
                readOnly
              />
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

            {/* رخصة القيادة (اختياري) */}
            <div className="ap-field ap-span-2">
              <label>رخصة القيادة (اختياري)</label>
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
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>سائق</b> وتوليد كود دخول تلقائي.</span>
              <button type="button" className="ap-btn" onClick={resetForm}>تفريغ</button>
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
