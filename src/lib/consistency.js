// src/lib/consistency.js
import {
  doc, writeBatch, increment, getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

/** أدوات صغيرة */
const kgRef  = (kgId)      => doc(db, "kindergartens", kgId);
const brRef  = (brId)      => doc(db, "branches", brId);
const safeId = (v)         => (v && typeof v === "string" ? v : null);
const inc    = (n)         => increment(n);

/** زيادة/تنقيص عدادات الروضة والفرع (طلاب/معلمين/صفوف) */
function bump(batch, { kgId, branchId }, field, by) {
  const K = safeId(kgId); const B = safeId(branchId);
  if (K) batch.update(kgRef(K), { [field]: inc(by) });
  if (B) batch.update(brRef(B), { [field]: inc(by) });
}

/** ========= الطلاب =========
 * استدعها بعد كل عملية إنشاء/تعديل/حذف لطالب.
 * prev: نسخة الطالب قبل التعديل (أو null عند الإنشاء)
 * next: نسخة الطالب بعد التعديل (أو null عند الحذف)
 * ملاحظات:
 * - نتوقع وجود next.kgId/next.branchId (الربط واضح)
 */
export async function applyStudentWrite(prev, next) {
  const batch = writeBatch(db);

  // إنشاء
  if (!prev && next) {
    bump(batch, next, "studentCount", +1);
    await batch.commit();
    return;
  }
  // حذف
  if (prev && !next) {
    bump(batch, prev, "studentCount", -1);
    await batch.commit();
    return;
  }
  // تعديل/نقل
  if (prev && next) {
    // تغيّر الروابط؟
    const movedKg    = safeId(prev.kgId)    !== safeId(next.kgId);
    const movedBr    = safeId(prev.branchId)!== safeId(next.branchId);

    if (movedKg || movedBr) {
      // -1 من القديمة
      bump(batch, prev, "studentCount", -1);
      // +1 للجديدة
      bump(batch, next, "studentCount", +1);
    }
    await batch.commit();
  }
}

/** ========= المعلمون =========
 * نعدّ فقط "النشطين".
 * prev/next يجب أن يحويان: { kgId, branchId, active }
 */
export async function applyTeacherWrite(prev, next) {
  const batch = writeBatch(db);

  // إنشاء
  if (!prev && next) {
    if (next.active) bump(batch, next, "activeTeacherCount", +1);
    await batch.commit(); return;
  }
  // حذف
  if (prev && !next) {
    if (prev.active) bump(batch, prev, "activeTeacherCount", -1);
    await batch.commit(); return;
  }
  // تعديل/نقل/تغيير حالة
  if (prev && next) {
    const movedKg  = safeId(prev.kgId)    !== safeId(next.kgId);
    const movedBr  = safeId(prev.branchId)!== safeId(next.branchId);
    const stateCh  = !!prev.active !== !!next.active;

    if (movedKg || movedBr) {
      // لو نشط: انقل العدّاد
      if (prev.active) bump(batch, prev, "activeTeacherCount", -1);
      if (next.active) bump(batch, next, "activeTeacherCount", +1);
    } else if (stateCh) {
      // نفس الروابط لكن تغيّرت الحالة
      bump(batch, next, "activeTeacherCount", next.active ? +1 : -1);
    }
    await batch.commit();
  }
}

/** ========= الصفوف =========
 * عدّاد عدد الصفوف في الروضة/الفرع.
 * prev/next: { kgId, branchId }
 */
export async function applyClassWrite(prev, next) {
  const batch = writeBatch(db);

  if (!prev && next) { bump(batch, next, "classCount", +1); await batch.commit(); return; }
  if (prev && !next) { bump(batch, prev, "classCount", -1); await batch.commit(); return; }

  if (prev && next) {
    const movedKg = safeId(prev.kgId) !== safeId(next.kgId);
    const movedBr = safeId(prev.branchId) !== safeId(next.branchId);
    if (movedKg || movedBr) {
      bump(batch, prev, "classCount", -1);
      bump(batch, next, "classCount", +1);
    }
    await batch.commit();
  }
}

/** ========= دالة مساعدة لضمان الربط الصحيح عند الحفظ =========
 * تُستخدم قبل add/update لأي طالب/معلّم/صف.
 * تمرِّر لها الكائن المحدّث + كائن الروضة/الفرع المختار من الواجهة.
 */
export function linkToKg(target, kg, branch) {
  return {
    ...target,
    kgId: kg?.id || target.kgId || null,
    branchId: branch?.id || target.branchId || null,
  };
}

/** (اختياري) تعبئة backfill للبيانات القديمة لتعيين kgId للطلاب/المعلمين والصفوف */
export async function backfillKgIdForCollection(colName, fkField, parentCol = "branches") {
  // example: backfillKgIdForCollection("students", "branchId")
  // يقرأ كل مستند فيه branchId ويجلب parentId للفرع ليضعه في kgId
  const { getDocs, collection, query } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, colName));
  const batch = writeBatch(db);
  for (const d of snap.docs) {
    const x = d.data() || {};
    if (!x.kgId && x[fkField]) {
      const b = await getDoc(brRef(x[fkField]));
      const parentId = b.exists() ? b.data().parentId : null;
      if (parentId) batch.update(d.ref, { kgId: parentId });
    }
  }
  await batch.commit();
}
