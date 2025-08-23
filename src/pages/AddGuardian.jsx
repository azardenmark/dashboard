// src/pages/AddGuardian.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  db,
  createUserOnSecondary,
  deleteSecondaryUser,
  signOutSecondary,
  saveToFirestore,
} from "../firebase";
import "./FormStyles.css";

import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ================= Utils ================= */
function normalizeDigits(str = "") {
  const map = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
    "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"
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

/* publicId generator with province prefix */
function randomLetters4(){ const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let s=""; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
function randomDigits4(){ return String(Math.floor(Math.random()*10000)).padStart(4,"0"); }

/** يولّد publicId مع بادئة كود المحافظة ويكتب فهرس الدخول logins/{publicId} */
async function assignPrefixedPublicId({
  uid, role, col, prefix, email=null, phone=null, displayName=""
}) {
  if (!uid || !col || !role || !prefix) throw new Error("assignPrefixedPublicId: معطيات ناقصة.");

  let publicId = "";
  for (let i=0; i<50; i++) {
    const base = `${randomLetters4()}${randomDigits4()}`;
    const candidate = `${prefix}-${base}`;
    const idxSnap = await getDoc(doc(db, "logins", candidate));
    if (!idxSnap.exists()) { publicId = candidate; break; }
  }
  if (!publicId) throw new Error("تعذر توليد publicId فريد.");

  await setDoc(
    doc(db, col, uid),
    { publicId, role, updatedAt: serverTimestamp() },
    { merge: true }
  );

  await setDoc(
    doc(db, "logins", publicId),
    {
      uid, role, col,
      email: email || null,
      phone: phone || null,
      displayName: displayName || "",
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return publicId;
}

/* ================= Component ================= */
export default function AddGuardian() {
  // الأساسيات
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // الأبناء
  const [children, setChildren]   = useState([{ id: 1, name: "", img: "" }]);

  // المحافظة
  const [provinces, setProvinces] = useState([]);
  const [provinceId, setProvinceId] = useState("");     // = code/id
  const selectedProvince = useMemo(
    () => provinces.find(p => p.id === provinceId) || null,
    [provinceId, provinces]
  );

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [errors, setErrors] = useState({
    firstName: "", lastName: "", contact: "", password: "", confirm: "", province: ""
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  /* -------- تحميل المحافظات -------- */
  useEffect(() => {
    (async () => {
      try {
        const qy = query(collection(db, "provinces"), orderBy("name"));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => {
          const x = d.data() || {};
          // اجعل id يساوي code إن وُجد ليكون ثابتًا
          const code = x.code || d.id;
          arr.push({ id: code, name: x.name || d.id, code });
        });
        setProvinces(arr.length ? arr : DEFAULT_PROVINCES);
      } catch {
        setProvinces(DEFAULT_PROVINCES);
      }
    })();
  }, []);

  /* -------- أبناء ولي الأمر (صورة محلية فقط كما كانت) -------- */
  function onUploadChild(index, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setChildren(prev => {
        const next = [...prev];
        next[index] = { ...next[index], img: reader.result };
        return next;
      });
    };
    reader.readAsDataURL(file);
  }
  function addChild() {
    setChildren(prev => [...prev, { id: Date.now(), name: "", img: "" }]);
  }
  function removeChild(id) {
    setChildren(prev => prev.filter(c => c.id !== id));
  }

  /* -------- تفريغ -------- */
  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setGender("male"); setAddress(""); setPassword(""); setConfirm("");
    setChildren([{ id: 1, name: "", img: "" }]);
    setProvinceId("");
    setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"", province:"" });
    setFormError(""); setSuccess("");
  }

  /* -------- إرسال -------- */
  async function submit(e) {
    e.preventDefault();
    setFormError(""); setSuccess("");

    const phoneNorm = normalizeDigits(phone);

    const nextErrors = {
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName : lastName.trim()  ? "" : "الكنية مطلوبة",
      contact  : (email.trim() || phoneNorm.trim()) ? "" : "أدخل البريد أو رقم الهاتف",
      password : password.length >= 6 ? "" : "كلمة المرور لا تقل عن 6 أحرف",
      confirm  : password === confirm ? "" : "كلمتا المرور غير متطابقتين",
      province : selectedProvince ? "" : "اختر المحافظة",
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    let uid = null;

    try {
      setLoading(true);

      // 1) Auth (مثيل ثانوي)
      const cred = await createUserOnSecondary({ email: email.trim(), password });
      uid = cred.uid;

      // 2) Firestore — وثيقة وليّ الأمر
      await saveToFirestore("guardians", {
        role     : "guardian",
        firstName: firstName.trim(),
        lastName : lastName.trim(),
        email    : email.trim() || null,
        phone    : phoneNorm.trim() || null,
        gender,
        address  : address.trim() || null,
        children : children.map(c => ({ name: c.name?.trim() || "", img: c.img || "" })),
        active   : true,
        provinceName: selectedProvince?.name || "",
        provinceCode: selectedProvince?.code || "",
        createdAt: serverTimestamp(), // ✅ طابع زمني من الخادم
      }, { id: uid });

      // 3) publicId مع بادئة المحافظة + فهرسة logins
      const publicId = await assignPrefixedPublicId({
        uid,
        role: "guardian",
        col : "guardians",
        prefix: selectedProvince.code,     // 👈 DAM / ALE ...
        email: email.trim() || null,
        phone: phoneNorm.trim() || null,
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      });

      setSuccess(`🎉 تم إنشاء حساب وليّ الأمر بنجاح. الكود: ${publicId}`);
      resetForm();
    } catch (err) {
      console.error(err);
      try { await deleteSecondaryUser(); } catch {/* ignore */}
      setFormError(prettyFirebaseError(err));
    } finally {
      await signOutSecondary();
      setLoading(false);
    }
  }

  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة وليّ أمر</h1>
        <p className="ap-hero__sub">أدخل البيانات الأساسية لوليّ الأمر وأبنائه.</p>
      </div>

      <section className="ap-card">
        <div className="ap-card__head">
          <div>البيانات الأساسية</div>
          <div className="ap-note">سيتم إنشاء الحساب بالدور: <b>وليّ أمر</b></div>
        </div>

        <div className="ap-card__body">
          {formError && <div className="ap-error" style={{ marginBottom: 8 }}>⚠️ {formError}</div>}
          {success   && <div className="ap-success" style={{ marginBottom: 8 }}>{success}</div>}

          <form className="ap-form" onSubmit={submit}>
            {/* الاسم */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> الاسم</label>
              <input
                dir="auto"
                className={`ap-input ${errors.firstName ? "ap-invalid" : ""}`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
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
                onChange={(e) => setLastName(e.target.value)}
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
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPhone(normalizeDigits(e.target.value))}
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
                <label><input type="radio" checked={gender === "male"} onChange={() => setGender("male")} /> ذكر</label>
                <label><input type="radio" checked={gender === "female"} onChange={() => setGender("female")} /> أنثى</label>
              </div>
            </div>

            {/* العنوان */}
            <div className="ap-field ap-span-2">
              <label><span className="ap-required">*</span> عنوان المنزل</label>
              <input
                dir="auto"
                className="ap-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                type="text"
                placeholder="المدينة، الشارع، رقم المنزل…"
              />
            </div>

            {/* المحافظة + كود المحافظة */}
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

            {/* كلمة المرور */}
            <div className="ap-field">
              <label><span className="ap-required">*</span> كلمة المرور</label>
              <div className="ap-input-wrap">
                <input
                  className={`ap-input ${errors.password ? "ap-invalid" : ""}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="ap-eye"
                  onClick={() => setShowPw(v => !v)}
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
                  onChange={(e) => setConfirm(e.target.value)}
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="ap-eye"
                  onClick={() => setShowConfirm(v => !v)}
                >
                  {showConfirm ? "🙈" : "👁️"}
                </button>
              </div>
              {errors.confirm && <div className="ap-error">{errors.confirm}</div>}
            </div>

            {/* أبناء وليّ الأمر */}
            <div className="ap-section ap-span-2">
              <div className="ap-section__head">
                <h3>أبناء وليّ الأمر</h3>
                <button type="button" onClick={addChild} className="ap-btn ap-btn--soft">+ إضافة ابن/ابنة</button>
              </div>

              <div className="ap-kids">
                {children.map((kid, idx) => (
                  <div key={kid.id} className="ap-kid">
                    <div className="ap-avatar">
                      {kid.img ? <img src={kid.img} alt="" /> : <div className="ap-avatar__ph">👧</div>}
                      <label className="ap-upload">
                        رفع صورة
                        <input type="file" accept="image/*" onChange={(e) => onUploadChild(idx, e.target.files?.[0])} />
                      </label>
                    </div>
                    <label><span className="ap-required">*</span> اسم الطفل</label>
                    <input
                      dir="auto"
                      className="ap-input"
                      placeholder="اسم الطفل"
                      value={kid.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setChildren(prev => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], name: val };
                          return next;
                        });
                      }}
                    />
                    <button type="button" onClick={() => removeChild(kid.id)} className="ap-btn ap-btn--danger">حذف</button>
                  </div>
                ))}
              </div>
            </div>

            {/* الأزرار */}
            <div className="ap-actions ap-span-2">
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>وليّ أمر</b>. الكود العام سيبدأ بكود المحافظة.</span>
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
