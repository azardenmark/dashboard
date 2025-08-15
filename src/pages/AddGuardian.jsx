import { useState } from "react";
import "./AddGuardian.css";

const API_BASE = "http://localhost:4000";

// يحوّل الأرقام العربية/الفارسية إلى لاتينية قبل التحقق/الحفظ
function normalizeDigits(str = "") {
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}

export default function AddGuardian() {
  // الحقول
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [gender,    setGender]    = useState("male");
  const [address,   setAddress]   = useState("");
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");

  // أبناء وليّ الأمر
  const [children, setChildren] = useState([{ id: 1, name: "", img: "" }]);

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");     // خطأ عام أعلى النموذج
  const [success, setSuccess] = useState("");         // رسالة نجاح

  // أخطاء حقلية (لا نمسح المدخلات عند ظهورها)
  const [errors, setErrors] = useState({
    firstName: "", lastName: "", contact: "", password: "", confirm: ""
  });

  // إظهار/إخفاء كلمات المرور
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

    // تنظيف الأرقام العربية في الهاتف قبل التحقق
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
    if (hasError) return; // لا نُرسل الطلب ونترك المدخلات كما هي

    const payload = {
      firstName: firstName.trim(),
      lastName : lastName.trim(),
      email    : email.trim() || null,
      phone    : phoneNorm.trim() || null,
      gender,
      address  : address.trim() || null,
      password,
      children : children.map(c => ({ name: c.name?.trim() || "", img: c.img || "" })),
    };

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error || "تعذّر إنشاء الحساب.");
        return;
      }
      setSuccess("✅ تم إنشاء حساب وليّ الأمر بنجاح.");
      // تفريغ اختياري بعد النجاح فقط
      setFirstName(""); setLastName(""); setEmail(""); setPhone("");
      setGender("male"); setAddress(""); setPassword(""); setConfirm("");
      setChildren([{ id: 1, name: "", img: "" }]);
      setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"" });
    } catch (err) {
      console.error(err);
      setFormError("انقطاع اتصال بالخادِم.");
    } finally {
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
          {/* رسائل عامة أعلى النموذج */}
          {formError && <div className="ap-error" style={{marginBottom:8}}>⚠️ {formError}</div>}
          {success && <div className="ap-success" style={{marginBottom:8}}>{success}</div>}

          <form className="ap-form" onSubmit={submit}>
            {/* الاسم والكنية — dir:auto للسماح بعربي/إنجليزي */}
            <div className="ap-field">
              <label>الاسم</label>
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
            <div className="ap-field">
              <label>الكنية</label>
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

            {/* البريد والهاتف — البريد والرقم يدعمان عربي/إنجليزي؛ الهاتف يُطبع لاتيني داخليًا */}
            <div className="ap-field">
              <label>البريد الإلكتروني</label>
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
            <div className="ap-field">
              <label>رقم الهاتف</label>
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
              <label>الجنس</label>
              <div className="ap-radio">
                <label><input type="radio" checked={gender==="male"} onChange={()=>setGender("male")} /> ذكر</label>
                <label><input type="radio" checked={gender==="female"} onChange={()=>setGender("female")} /> أنثى</label>
              </div>
            </div>

            {/* العنوان */}
            <div className="ap-field ap-span-2">
              <label>عنوان المنزل</label>
              <input
                dir="auto"
                className="ap-input"
                value={address}
                onChange={(e)=>setAddress(e.target.value)}
                type="text"
                placeholder="المدينة، الشارع، رقم المنزل…"
              />
            </div>

            {/* كلمة المرور — زر إظهار/إخفاء */}
            <div className="ap-field">
              <label>كلمة المرور</label>
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

            <div className="ap-field">
              <label>تأكيد كلمة المرور</label>
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
                        <input type="file" accept="image/*" onChange={(e)=>onUploadChild(idx, e.target.files?.[0])} />
                      </label>
                    </div>
                    <input
                      dir="auto"
                      className="ap-input"
                      placeholder="اسم الطفل"
                      value={kid.name}
                      onChange={(e)=>{
                        const val = e.target.value;
                        setChildren(prev=>{
                          const next=[...prev]; next[idx]={...next[idx], name:val}; return next;
                        });
                      }}
                    />
                    <button type="button" onClick={()=>removeChild(kid.id)} className="ap-btn ap-btn--danger">حذف</button>
                  </div>
                ))}
              </div>
            </div>

            {/* أزرار */}
            <div className="ap-actions ap-span-2">
              <span className="ap-note">سيتم إنشاء الحساب كـ <b>وليّ أمر</b>.</span>
              <button
                type="button"
                className="ap-btn"
                onClick={()=>{
                  setFormError(""); setSuccess("");
                  setErrors({ firstName:"", lastName:"", contact:"", password:"", confirm:"" });
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
