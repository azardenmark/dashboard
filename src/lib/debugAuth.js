/* src/lib/debugAuth.js */
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export async function whoAmI() {
  const u = auth.currentUser;
  if (!u) return { loggedIn: false };
  const snap = await getDoc(doc(db, "roles", u.uid));
  return {
    loggedIn: true,
    uid: u.uid,
    email: u.email,
    isAdmin: !!(snap.exists() && snap.data().isAdmin),
    roleDocExists: snap.exists(),
    roleData: snap.data() || null,
  };
}

// مُسجّل حيّ اختياري — استدعِ window.debugAuthToggle() للتفعيل/الإيقاف
let _unsub = null;
export function toggleAuthLogger() {
  if (_unsub) {
    _unsub();
    _unsub = null;
    console.log("[debugAuth] unsubscribed");
    return;
  }
  _unsub = onAuthStateChanged(auth, async (u) => {
    console.log("[debugAuth] auth user:", u ? { uid: u.uid, email: u.email } : null);
    if (u) {
      const snap = await getDoc(doc(db, "roles", u.uid));
      console.log("[debugAuth] role:", snap.exists() ? snap.data() : null);
    }
  });
  console.log("[debugAuth] subscribed");
}

// اجعل التوغّل متاحًا من الكونسول
if (typeof window !== "undefined") {
  window.debugAuthToggle = toggleAuthLogger;
}
