// src/firebase.js
// ———————————————————————————————————————————
// Firebase bootstrap (HMR-safe) + unified helpers
// ———————————————————————————————————————————

import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, deleteUser, signOut,
} from "firebase/auth";
import {
  getFirestore, setDoc, addDoc, doc, collection, serverTimestamp,
  writeBatch, arrayUnion, arrayRemove, getDoc, deleteDoc,
} from "firebase/firestore";
import { getStorage, ref, deleteObject } from "firebase/storage";

/* ========= الإعدادات ========= */
const firebaseConfig = {
  apiKey: "AIzaSyCWz2J8E5mjOxHdDpyTGO6kUclTpzps_wQ",
  authDomain: "kindergarten-dashboard.firebaseapp.com",
  projectId: "kindergarten-dashboard",
  storageBucket: "kindergarten-dashboard.appspot.com",
  messagingSenderId: "511843327796",
  appId: "1:511843327796:web:5ec0dfccb8e4dfe6e74f61",
};

/* ========= التهيئة الأساسية (آمنة مع HMR) ========= */
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const storage = getStorage(app);

/* ========= Firestore helper ========= */
export async function saveToFirestore(collectionPath, data, { id, merge = false } = {}) {
  const now = serverTimestamp();
  const payload = { ...data, updatedAt: now, ...(id ? {} : { createdAt: now }) };
  if (id) {
    await setDoc(doc(db, collectionPath, id), payload, { merge });
    return { id };
  } else {
    const added = await addDoc(collection(db, collectionPath), payload);
    return { id: added.id };
  }
}

/* =========================================================================
   Secondary app utilities (إنشاء مستخدمين بلا لمس جلسة الأدمن)
   ========================================================================= */
let _secondaryAuth = null;

/** إرجاع Auth الثانوي جاهزًا (أو تهيئته مرة واحدة باسم ثابت) */
function ensureSecondaryAuth() {
  if (_secondaryAuth) return _secondaryAuth;
  const secondaryApp =
    getApps().find(a => a.name === "SECONDARY")
    || initializeApp(firebaseConfig, "SECONDARY");
  _secondaryAuth = getAuth(secondaryApp);
  return _secondaryAuth;
}

/** إنشاء مستخدم على المثيل الثانوي */
export async function createUserOnSecondary(emailOrObj, pwdMaybe) {
  const { email, password } =
    typeof emailOrObj === "object" && emailOrObj !== null
      ? { email: String(emailOrObj.email ?? "").trim(), password: String(emailOrObj.password ?? "") }
      : { email: String(emailOrObj ?? "").trim(), password: String(pwdMaybe ?? "") };

  if (!email || !password) throw new Error("createUserOnSecondary: email/password missing");

  const sa = ensureSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(sa, email, password);

  // تنظيف الجلسة على المثيل الثانوي فقط
  try { await signOut(sa); } catch {}
  return { user: cred.user, uid: cred.user.uid, email: cred.user.email };
}

/** حذف مستخدم على المثيل الثانوي (إن كان مسجّلًا هناك) */
export async function deleteSecondaryUser() {
  try {
    const sa = ensureSecondaryAuth();
    if (sa.currentUser) await deleteUser(sa.currentUser);
    try { await signOut(sa); } catch {}
  } catch (e) {
    // تجاهل بصمت – لا نكسر الواجهة إن لم يوجد مستخدم مسجّل على الثانوي
    console.warn("deleteSecondaryUser:", e?.message || e);
  }
}

/** تسجيل خروج آمن للمثيل الثانوي */
export async function signOutSecondary() {
  try {
    const sa = ensureSecondaryAuth();
    await signOut(sa);
  } catch {}
}

/* ========= publicId + فهرس logins ========= */
function randomLetters4(){ const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ"; let s=""; for(let i=0;i<4;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
function randomDigits4(){ return String(Math.floor(Math.random()*10000)).padStart(4,"0"); }

/**
 * assignPublicIdAndIndex:
 * - يكتب publicId + role على وثيقة المستخدم
 * - ينشئ/يحدّث logins/{publicId} عند الحاجة
 */
export async function assignPublicIdAndIndex({
  uid, role, col, email = null, phone = null, displayName = "", index = true,
}) {
  if (!uid || !col || !role) throw new Error("assignPublicIdAndIndex: uid/col/role مطلوبة.");

  const userRef = doc(db, col, uid);
  const snap = await getDoc(userRef);
  let publicId = snap.exists() ? (snap.data().publicId || "") : "";

  if (!publicId) {
    // حاول إيجاد كود فريد
    for (let i = 0; i < 30; i++) {
      const cand = `${randomLetters4()}${randomDigits4()}`;
      const idxSnap = await getDoc(doc(db, "logins", cand));
      if (!idxSnap.exists()) { publicId = cand; break; }
    }
    if (!publicId) throw new Error("تعذّر توليد publicId فريد.");
  }

  await setDoc(userRef, { publicId, role, updatedAt: serverTimestamp() }, { merge: true });

  if (index) {
    await setDoc(
      doc(db, "logins", publicId),
      {
        uid, role, col,
        email: email || null,
        phone: phone || null,
        displayName: displayName || "",
        createdAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  return publicId;
}

export async function removePublicIdIndex(publicId){
  if (!publicId) return;
  try { await deleteDoc(doc(db, "logins", publicId)); } catch {}
}

/* ========= أدوات التخزين ========= */
export async function deleteStoragePaths(paths = []) {
  await Promise.all((paths || []).map(p => deleteObject(ref(storage, p)).catch(() => {})));
}

/* ========= روابط Student ↔ Guardians ========= */
export async function linkStudentToGuardians({ studentId, guardianIds = [] }) {
  if (!studentId || !Array.isArray(guardianIds) || guardianIds.length === 0) return;
  const batch = writeBatch(db);
  for (const gid of guardianIds.filter(Boolean)) {
    batch.set(doc(db, "guardians", gid), { studentIds: arrayUnion(studentId), updatedAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

export async function unlinkStudentFromGuardians({ studentId, guardianIds = [] }) {
  if (!studentId || !Array.isArray(guardianIds) || guardianIds.length === 0) return;
  const batch = writeBatch(db);
  for (const gid of guardianIds.filter(Boolean)) {
    batch.set(doc(db, "guardians", gid), { studentIds: arrayRemove(studentId), updatedAt: serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}

export async function replaceStudentGuardianRefs({ studentId, prevGuardianIds = [], nextGuardianIds = [] }) {
  if (!studentId) return;
  const prev = new Set((prevGuardianIds || []).filter(Boolean));
  const next = new Set((nextGuardianIds || []).filter(Boolean));
  const toAdd = [...next].filter(x => !prev.has(x));
  const toDel = [...prev].filter(x => !next.has(x));
  if (toAdd.length === 0 && toDel.length === 0) return;

  const batch = writeBatch(db);
  for (const gid of toAdd) batch.set(doc(db, "guardians", gid), { studentIds: arrayUnion(studentId), updatedAt: serverTimestamp() }, { merge: true });
  for (const gid of toDel) batch.set(doc(db, "guardians", gid), { studentIds: arrayRemove(studentId), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}
