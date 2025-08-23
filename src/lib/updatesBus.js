// src/lib/updatesBus.js
// "حافلة أحداث" صغيرة لتحديث الشريط الجانبي من أي مكان في المشروع.
// تستخدم window.dispatchEvent / addEventListener حتى لا تحتاج استيراد في Sidebar.jsx.

// keys المسموحة (للتوحيد)
export const SB_KEYS = {
  KINDERGARTENS: "kindergartens", // الروضات والفروع
  PEOPLE: "people",               // مجموعة الأشخاص
  USERS: "users",                 // المستخدمون
};

// رفع عدّاد/تحديث عنصر معيّن في الشريط
// options: { count?: number, delta?: number }
// - count: تعيين العدد مباشرة
// - delta: زيادة/نقصان (مثلاً +1 أو -1)
export function emitSidebarUpdate(key, options = {}) {
  window.dispatchEvent(
    new CustomEvent("sb:update", { detail: { key, ...options } })
  );
}

// تشغيل اللمعان يدويًا لعنصر معيّن
export function emitSidebarGlow(key) {
  window.dispatchEvent(new CustomEvent("sb:glow", { detail: { key } }));
}
