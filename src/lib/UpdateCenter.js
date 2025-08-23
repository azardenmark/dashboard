// src/lib/UpdateCenter.js
// مركز تحديثات عام لتطبيقك (قابل للتوسّع)
// - يوفّر EventTarget داخلي (bus) + يمرّر أيضاً أحداث توافقية للسايدبار (sb:update / sb:glow)
// - يدير عدّادات لكل قناة (key) + يفعّل تأثير اللمعان
// - دوال استخدام مباشرة + Hooks اختيارية لواجهة React

import { useEffect, useState } from "react";

/* قنوات جاهزة الآن (وسّعها كما تريد) */
export const CHANNELS = Object.freeze({
  KINDERGARTENS: "kindergartens", // الروضات والفروع
  PEOPLE: "people",               // قسم الأشخاص
  USERS: "users",                 // المستخدمون
  // أضف المفاتيح التي تحتاجها مستقبلًا…
});

/* حالة داخلية بسيطة للعدادات */
const _state = {
  counts: new Map(), // key -> number
};

/* حافلة أحداث داخلية */
const _bus = new EventTarget();

/* أدوات مساعدة صغيرة */
const _safeWindowDispatch = (name, detail) => {
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
};
const _get = (key) => _state.counts.get(key) ?? 0;
const _set = (key, v) => _state.counts.set(key, Math.max(0, Number(v) || 0));

/* ============ واجهة الأحداث العامة ============ */

/** استمع لأي تحديث عدّاد */
export function onUpdate(handler) {
  const fn = (e) => handler(e.detail);
  _bus.addEventListener("updates:update", fn);
  return () => _bus.removeEventListener("updates:update", fn);
}

/** استمع لطلب لمعان */
export function onGlow(handler) {
  const fn = (e) => handler(e.detail);
  _bus.addEventListener("updates:glow", fn);
  return () => _bus.removeEventListener("updates:glow", fn);
}

/* ============ دوال الإرسال ============ */

/**
 * أرسل تحديثًا لقناة معينة.
 * options: { count?: number, delta?: number, meta?: any }
 * - count يعيّن القيمة صراحة
 * - delta يزيد/ينقص نسبيًا
 */
export function emitUpdate(key, options = {}) {
  const { count, delta, meta = null } = options;
  const prev = _get(key);
  let next = prev;

  if (typeof count === "number") {
    next = Math.max(0, count);
  } else if (typeof delta === "number") {
    next = Math.max(0, prev + delta);
  } else {
    // لو لم يُمرَّر count أو delta، اعتبرها +1
    next = prev + 1;
  }

  _set(key, next);

  const detail = { key, prev, next, delta: next - prev, meta };
  _bus.dispatchEvent(new CustomEvent("updates:update", { detail }));

  // توافق كامل مع Sidebar الحالي (لا تحتاج تعديله):
  _safeWindowDispatch("sb:update", { key, count: next });
}

/** فعّل لمعان/بريق لقناة معيّنة (بدون تغيير العدّاد) */
export function emitGlow(key, meta = null) {
  const detail = { key, meta };
  _bus.dispatchEvent(new CustomEvent("updates:glow", { detail }));

  // تمرير للسايدبار الحالي
  _safeWindowDispatch("sb:glow", { key });
}

/** أرسل مجموعة تحديثات دفعة واحدة */
export function emitBatch(updates = []) {
  // updates: Array<{ key, count?, delta?, meta? }>
  for (const u of updates) {
    if (!u || !u.key) continue;
    emitUpdate(u.key, { count: u.count, delta: u.delta, meta: u.meta });
  }
}

/** صفّر عدّاد قناة */
export function resetCount(key) {
  const prev = _get(key);
  _set(key, 0);
  const detail = { key, prev, next: 0, delta: -prev, meta: { reset: true } };
  _bus.dispatchEvent(new CustomEvent("updates:update", { detail }));
  _safeWindowDispatch("sb:update", { key, count: 0 });
}

/** احصل على قيمة العدّاد الحالية لقناة */
export function getCount(key) {
  return _get(key);
}

/* ============ Hooks اختيارية لواجهة React ============ */

/** هوك بسيط يُرجع عدّاد قناة واحدة ويتحدّث تلقائيًا */
export function useChannelCount(key) {
  const [count, setCount] = useState(() => getCount(key));
  useEffect(() => {
    return onUpdate(({ key: k, next }) => {
      if (k === key) setCount(next);
    });
  }, [key]);
  return count;
}

/** هوك متعدد القنوات: يُرجع كائن { key: count } ويتحدّث تلقائيًا */
export function useChannelsCount(keys = []) {
  const init = () => Object.fromEntries(keys.map((k) => [k, getCount(k)]));
  const [counts, setCounts] = useState(init);
  useEffect(() => {
    setCounts(init()); // مزامنة أولية عند تغيّر المفاتيح
    return onUpdate(({ key, next }) => {
      if (keys.includes(key)) {
        setCounts((prev) => (prev[key] === next ? prev : { ...prev, [key]: next }));
      }
    });
  }, [JSON.stringify(keys)]);
  return counts;
}

/** هوك لتفعيل لمعان على قناة من الكود (مع إيقاف تلقائي بعد مدة) */
export function useGlowTrigger(key, durationMs = 4000) {
  const [isGlowing, setIsGlowing] = useState(false);
  const trigger = () => {
    setIsGlowing(true);
    emitGlow(key);
    setTimeout(() => setIsGlowing(false), durationMs);
  };
  useEffect(() => {
    return onGlow(({ key: k }) => {
      if (k === key) {
        setIsGlowing(true);
        const t = setTimeout(() => setIsGlowing(false), durationMs);
        return () => clearTimeout(t);
      }
    });
  }, [key, durationMs]);
  return [isGlowing, trigger];
}

/* ============ أدوات للتوسعة المستقبلية ============ */

/** سجّل قناة جديدة (اختياري — مجرد تهيئة للعداد إن لم يكن موجودًا) */
export function registerChannel(key, initial = 0) {
  if (!_state.counts.has(key)) _set(key, initial);
  return key;
}

/** تفريغ كل الحالة (للاختبار/تسجيل الخروج مثلاً) */
export function resetAll() {
  for (const k of _state.counts.keys()) {
    _set(k, 0);
    _safeWindowDispatch("sb:update", { key: k, count: 0 });
  }
  _bus.dispatchEvent(new CustomEvent("updates:update", { detail: { key: "*", prev: null, next: null, delta: null, meta: { resetAll: true } } }));
}
