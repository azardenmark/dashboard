// src/pages/AddTeacher.jsx
import React, { useState } from "react";
import "./FormStyles.css";

// Firebase (نستخدم المثيل الثانوي + التخزين)
import {
  storage,
  createUserOnSecondary,
  signOutSecondary,
  deleteSecondaryUser,
} from "../firebase";
import { saveToFirestore } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// يحوّل الأرقام العربية/الفارسية إلى لاتينية
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
  if (!err?.code) return err.message || "حدث خطأ غير معروف";
  switch (err.code) {
    case "auth/email-already-in-use":
      return "هذا البريد مستخدم بالفعل.";
    case "auth/weak-password":
      return "كلمة المرور ضعيفة جداً.";
    case "auth/invalid-email":
      return "البريد الإلكتروني غير صالح.";
    default:
      return err.message || "فشل العملية.";
  }
}

export default function AddTeacher() {
  // الحقول
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // شهادات/ملفات متعددة (اختياري)
  const [files, setFiles] = useState([]); // File[]

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  // أخطاء الحقول
  const [errors, setErrors] = useState({
    firstName: "", lastName: "", contact: "", password: "", confirm: ""
  });

  // إظهار/إخفاء كلمات المرور
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // اختيار ملفات
  function onPickFiles(fileList) {
    if (!fileList?.length) return;
    setFiles((prev) => [...prev, ...Array.from(fileList)]);
  }
  // حذف ملف من القائمة
  function removeFileAt(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // رفع جميع الملفات إلى Storage وإرجاع ميتاداتا
  async function uploadCertificates(uid) {
    const uploaded = [];
    for (const f of files) {
      const path = `teachers/${uid}/certificates/${Date.now()}_${f.name}`;
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

  // تفريغ النموذج
  function resetForm() {
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setGender("male"); setAddress(""); setPassword(""); setConfirm("");
    setFiles([]);
    setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"" });
    setFormError(""); setSuccess("");
  }

  // إرسال
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
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    let cred = null;
    try {
      setLoading(true);

      // 1) إنشاء المعلّم على المثيل الثانوي (لا يغيّر جلسة الأدمن)
      // ✅ التصحيح: تمرير كائن { email, password } والاعتماد على أن createUserOnSecondary تُعيد user مباشرة
      cred = await createUserOnSecondary({ email: email.trim(), password });
      const uid = cred.uid; // ✅ بدلاً من cred.user.uid

      // 2) رفع الشهادات (اختياري)
      const certs = await uploadCertificates(uid);

      try {
        // 3) حفظ بيانات المعلّم في Firestore
        await saveToFirestore("teachers", {
          firstName: firstName.trim(),
          lastName : lastName.trim(),
          email    : email.trim(),
          phone    : phoneNorm.trim(),
          gender,
          address  : address.trim() || null,
          certificates: certs,
          createdAt: new Date().toISOString(),
        }, { id: uid });

        setSuccess("✅ تم إنشاء حساب المعلّم وحفظ بياناته بنجاح.");
        resetForm();
      } catch (dbErr) {
        // فشل الحفظ → نحذف المستخدم الذي أنشأناه (rollback)
        console.error("Firestore save failed, rolling back user:", dbErr);
        if (cred?.uid) await deleteSecondaryUser(); // ✅ بدون تمرير user
        throw dbErr;
      }
    } catch (err) {
      console.error(err);
      setFormError(prettyFirebaseError(err));
    } finally {
      // تنظيف: نسجّل خروج المثيل الثانوي فقط — جلسة الأدمن تبقى
      await signOutSecondary(); // ✅ بدون باراميترات
      setLoading(false);
    }
  }

  return (
    <div className="ap-page">
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة معلّم</h1>
        <p className="ap-hero__sub">أدخل البيانات الأساسية للمعلّم الجديد.</p>
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
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>معلّم</b>.</span>
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