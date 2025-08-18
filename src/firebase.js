// src/firebase.js
// ———————————————————————————————————————————
// تهيئة Firebase + دوال مساعدة موحَّدة ومتوافقة مع كودك الحالي
// ———————————————————————————————————————————

import { initializeApp, getApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  setDoc,
  addDoc,
  doc,
  collection,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// إعدادات مشروعك
const firebaseConfig = {
  apiKey: "AIzaSyCWz2J8E5mjOxHdDpyTGO6kUclTpzps_wQ",
  authDomain: "kindergarten-dashboard.firebaseapp.com",
  projectId: "kindergarten-dashboard",
  storageBucket: "kindergarten-dashboard.appspot.com",
  messagingSenderId: "511843327796",
  appId: "1:511843327796:web:5ec0dfccb8e4dfe6e74f61",
};

// تهيئة التطبيق الرئيسي
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ———————————————————————————————————————————
// Helper للحفظ في Firestore (كما هو في كودك مع تحسين طفيف)
// ———————————————————————————————————————————
export async function saveToFirestore(
  collectionPath,
  data,
  { id, merge = false } = {}
) {
  const now = serverTimestamp();
  const payload = {
    ...data,
    updatedAt: now,
    ...(id ? {} : { createdAt: now }),
  };

  if (id) {
    await setDoc(doc(db, collectionPath, id), payload, { merge });
    return { id };
  } else {
    const ref = await addDoc(collection(db, collectionPath), payload);
    return { id: ref.id };
  }
}

// ———————————————————————————————————————————
// إدارة مستخدمين عبر تطبيق ثانوي Secondary App
// متوافق مع استدعاءاتك القديمة والجديدة
// ———————————————————————————————————————————
function getOrInitSecondaryApp() {
  try {
    return getApp("Secondary");
  } catch {
    return initializeApp(firebaseConfig, "Secondary");
  }
}

/**
 * createUserOnSecondary
 * يقبل:
 *  - createUserOnSecondary(email, password)
 *  - أو createUserOnSecondary({ email, password })
 * يُرجع دائمًا كائنًا يحوي:
 *  { user, uid } للتوافق مع استخدامك في الصفحات.
 */
export async function createUserOnSecondary(emailOrObj, pwdMaybe) {
  const { email, password } =
    typeof emailOrObj === "object" && emailOrObj !== null
      ? {
          email: String(emailOrObj.email ?? "").trim(),
          password: String(emailOrObj.password ?? ""),
        }
      : {
          email: String(emailOrObj ?? "").trim(),
          password: String(pwdMaybe ?? ""),
        };

  if (!email || !password) {
    throw new Error("createUserOnSecondary: email/password missing");
  }

  const secondaryApp = getOrInitSecondaryApp();
  const secondaryAuth = getAuth(secondaryApp);

  const cred = await createUserWithEmailAndPassword(
    secondaryAuth,
    email,
    password
  );

  // لا نُبقي جلسة مفتوحة على المثيل الثانوي
  try {
    await signOut(secondaryAuth);
  } catch {}
  try {
    await deleteApp(secondaryApp);
  } catch {}

  // نعيد شكلًا متوافقًا مع الاستعمالات الحالية
  return { user: cred.user, uid: cred.user.uid, email: cred.user.email };
}

/**
 * deleteSecondaryUser(user?)
 * - إذا مرّرت user سنحذفه مباشرة.
 * - إن لم تمرّر شيئًا: سنحاول استخدام currentUser من المثيل الثانوي إن وُجد.
 * آمنة إن لم يوجد تطبيق ثانوي.
 */
export async function deleteSecondaryUser(userMaybe) {
  try {
    if (userMaybe) {
      await deleteUser(userMaybe);
      return;
    }
    const secondaryApp = getOrInitSecondaryApp();
    const secondaryAuth = getAuth(secondaryApp);
    if (secondaryAuth.currentUser) {
      await deleteUser(secondaryAuth.currentUser);
    }
    try {
      await signOut(secondaryAuth);
    } catch {}
    try {
      await deleteApp(secondaryApp);
    } catch {}
  } catch (e) {
    // فقط نسجل ولا نُسقط التطبيق
    console.error("Delete secondary user failed:", e);
  }
}

/**
 * signOutSecondary(secondaryAuth?, secondaryApp?)
 * يمكن استدعاؤها بدون باراميترات (كما في صفحاتك).
 * ستحاول تسجيل خروج المثيل الثانوي ثم إغلاقه إن وُجد.
 * وآمنة لو لم يكن هناك مثيل ثانوي أساسًا.
 */
export async function signOutSecondary(secondaryAuthArg, secondaryAppArg) {
  try {
    let secondaryApp = secondaryAppArg;
    let secondaryAuth = secondaryAuthArg;

    if (!secondaryApp || !secondaryAuth) {
      try {
        secondaryApp = getOrInitSecondaryApp();
        secondaryAuth = getAuth(secondaryApp);
      } catch {
        // لا يوجد مثيل ثانوي — لا شيء نفعله
        return;
      }
    }

    try {
      await signOut(secondaryAuth);
    } catch {}
    try {
      await deleteApp(secondaryApp);
    } catch {}
  } catch {
    // تجاهُل صامت — الهدف أن تكون آمنة دومًا
  }
}

// ———————————————————————————————————————————
// 🔗 هيلبرز الربط المتبادل Student ↔ Guardians
// تحفظ فقط مصفوفة studentIds داخل وثيقة وليّ الأمر لسهولة الإضافة/الإزالة.
// استخدمها بعد إنشاء/تعديل الطالب.
// ———————————————————————————————————————————

/**
 * يربط الطالب بعدة أولياء أمور (يضيف studentId إلى studentIds في كل Guardian).
 * آمنة لو كانت المصفوفة فارغة.
 */
export async function linkStudentToGuardians({ studentId, guardianIds = [] }) {
  if (!studentId || !Array.isArray(guardianIds) || guardianIds.length === 0) return;

  const batch = writeBatch(db);
  for (const gid of guardianIds) {
    if (!gid) continue;
    const gRef = doc(db, "guardians", gid);
    // setDoc مع merge يسمح بالإنشاء إن لم توجد الوثيقة
    batch.set(
      gRef,
      {
        studentIds: arrayUnion(studentId),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * يفكّ الربط عن عدة أولياء (يزيل studentId من studentIds).
 * آمنة لو لم تكن القيمة موجودة أصلاً.
 */
export async function unlinkStudentFromGuardians({ studentId, guardianIds = [] }) {
  if (!studentId || !Array.isArray(guardianIds) || guardianIds.length === 0) return;

  const batch = writeBatch(db);
  for (const gid of guardianIds) {
    if (!gid) continue;
    const gRef = doc(db, "guardians", gid);
    batch.set(
      gRef,
      {
        studentIds: arrayRemove(studentId),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/**
 * يستبدل مجموعة الروابط بالكامل:
 * - يضيف studentId إلى newIds غير الموجودة سابقًا
 * - يزيله من oldIds التي لم تعد مطلوبة
 * مرّر لنا القائمتين (عادة من واجهة التحرير).
 */
export async function replaceStudentGuardianRefs({
  studentId,
  prevGuardianIds = [],
  nextGuardianIds = [],
}) {
  if (!studentId) return;

  const prev = new Set((prevGuardianIds || []).filter(Boolean));
  const next = new Set((nextGuardianIds || []).filter(Boolean));

  const toAdd = [...next].filter((x) => !prev.has(x));
  const toDel = [...prev].filter((x) => !next.has(x));

  if (toAdd.length === 0 && toDel.length === 0) return;

  const batch = writeBatch(db);

  for (const gid of toAdd) {
    const gRef = doc(db, "guardians", gid);
    batch.set(
      gRef,
      { studentIds: arrayUnion(studentId), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  for (const gid of toDel) {
    const gRef = doc(db, "guardians", gid);
    batch.set(
      gRef,
      { studentIds: arrayRemove(studentId), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  await batch.commit();
}
