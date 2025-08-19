// src/pages/AddGuardian.jsx
import React, { useState } from "react";
import {
  createUserOnSecondary,
  deleteSecondaryUser,
  signOutSecondary, // ✅ إضافة للاستيراد للتنظيف النهائي
} from "../firebase";
// 👈 بدّلنا الاستيراد
import { saveToFirestore } from "../firebase";
import "./FormStyles.css";

// يحوّل الأرقام العربية/الفارسية إلى لاتينية قبل التحقق/الحفظ
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

export default function AddGuardian() {
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  const [children, setChildren] = useState([{ id: 1, name: "", img: "" }]);

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  const [errors, setErrors] = useState({
    firstName: "", lastName: "", contact: "", password: "", confirm: ""
  });

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    const phoneNorm = normalizeDigits(phone);

    const nextErrors = {
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName : lastName.trim()  ? "" : "الكنية مطلوبة",
      contact  : (email.trim() || phoneNorm.trim()) ? "" : "أدخل البريد أو رقم الهاتف",
      password : password.length >= 6 ? "" : "كلمة المرور لا تقل عن 6 أحرف",
      confirm  : password === confirm ? "" : "كلمتا المرور غير متطابقتين",
    };
    setErrors(nextErrors);

    const hasError = Object.values(nextErrors).some(Boolean);
    if (hasError) return;

    let userCred = null;
    try {
      setLoading(true);

      // 1) إنشاء المستخدم على المثيل الثانوي (لا يغيّر جلسة الأدمن)
      // ✅ التصحيح: تمرير كائن { email, password } حسب تعريف الدالة في firebase.js
      userCred = await createUserOnSecondary({ email: email.trim(), password });
      const uid = userCred.uid; // ✅ الدالة ترجع user مباشرة، لذا نستخدم userCred.uid

      try {
        // 2) تخزين البيانات في Firestore
        await saveToFirestore("guardians", {
          firstName: firstName.trim(),
          lastName : lastName.trim(),
          email    : email.trim() || null,
          phone    : phoneNorm.trim() || null,
          gender,
          address  : address.trim() || null,
          children : children.map(c => ({
            name: c.name?.trim() || "",
            img : c.img || ""
          })),
          createdAt: new Date().toISOString(),
        }, { id: uid });

        setSuccess("🎉 تم إنشاء حساب وليّ الأمر وحفظ البيانات بنجاح.");

        // 3) تفريغ النموذج
        setFirstName(""); setLastName(""); setEmail(""); setPhone("");
        setGender("male"); setAddress(""); setPassword(""); setConfirm("");
        setChildren([{ id: 1, name: "", img: "" }]);
        setErrors({ firstName: "", lastName: "", contact: "", password: "", confirm: "" });
      } catch (dbErr) {
        // فشل حفظ Firestore → حذف المستخدم الذي أنشأناه (rollback)
        console.error("Firestore save failed, rolling back user:", dbErr);
        // ✅ deleteSecondaryUser لا يحتاج باراميتر حسب تعريفه الحالي
        if (userCred?.uid) await deleteSecondaryUser();
        throw dbErr; // إلى الـ catch الخارجي
      }
    } catch (err) {
      console.error(err);
      setFormError(prettyFirebaseError(err));
    } finally {
      // تنظيف: نسجّل خروج المثيل الثانوي فقط — جلسة الأدمن تبقى
      await signOutSecondary(); // ✅ متوفر كـ alias في firebase.js
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
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>وليّ أمر</b>.</span>
              <button
                type="button"
                className="ap-btn"
                onClick={() => {
                  setFormError(""); setSuccess("");
                  setErrors({ firstName: "", lastName: "", contact: "", password: "", confirm: "" });
                  setFirstName(""); setLastName(""); setEmail(""); setPhone("");
                  setGender("male"); setAddress(""); setPassword(""); setConfirm("");
                  setChildren([{ id: 1, name: "", img: "" }]);
                }}
              >
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