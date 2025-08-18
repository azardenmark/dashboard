// src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./FormStyles.css";

import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

function mapLoginError(err) {
  const code = err?.code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "البريد أو كلمة المرور غير صحيحة.";
    case "auth/too-many-requests":
      return "محاولات كثيرة. انتظر قليلاً ثم جرّب مجددًا.";
    case "auth/network-request-failed":
      return "مشكلة اتصال بالشبكة. تحقّق من الإنترنت.";
    default:
      return `حدث خطأ غير متوقع (${code || "unknown"}) – افتح Console للمزيد.`;
  }
}

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErrMsg("");
    setBusy(true);

    try {
      console.log("[LOGIN] trying …", email);
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      console.log("[LOGIN] success, uid =", cred.user.uid);

      // ✅ خطوة تشخيص: اقرأ وثيقة الدور مباشرة بعد تسجيل الدخول
      const roleRef = doc(db, "roles", cred.user.uid);
      const snap = await getDoc(roleRef);
      console.log("[ROLE] exists?", snap.exists(), "data:", snap.data());

      if (!snap.exists()) {
        setErrMsg(
          "لا توجد وثيقة صلاحيات لهذا المستخدم. أنشئ وثيقة في مجموعة roles بالـ Document ID = UID وبها isAdmin=true."
        );
        await signOut(auth);
        return;
      }
      const data = snap.data() || {};
      if (data.isAdmin !== true) {
        setErrMsg("حسابك ليس أدمن. المسموح فقط لمستخدمين isAdmin=true.");
        await signOut(auth);
        return;
      }

      // 👍 كل شيء تمام
      nav("/", { replace: true });
    } catch (err) {
      console.error("[LOGIN_ERROR]", err);
      setErrMsg(mapLoginError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-ico">🏫</div>
        <h2 className="login-title">تسجيل الدخول</h2>
        <p className="login-sub">ادخل بيانات المشرف للوصول إلى لوحة التحكّم</p>

        {errMsg && <div className="ap-error" style={{marginBottom:10}}>⚠️ {errMsg}</div>}

        <input
          dir="ltr"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          className="ap-input"
          required
        />

        <div className="ap-input-wrap" style={{marginTop:8}}>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            className="ap-input"
            required
          />
        </div>

        <button className="ap-btn ap-btn--primary" type="submit" disabled={busy} style={{marginTop:12}}>
          {busy ? "جاري الدخول…" : "دخول"}
        </button>
      </form>
    </div>
  );
}
