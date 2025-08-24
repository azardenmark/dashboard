// src/pages/AddStudent.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./FormStyles.css";
import {
  db,
  storage,
  saveToFirestore,
  linkStudentToGuardians,
  assignPublicIdAndIndex,
} from "../firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  runTransaction,
  orderBy,
  serverTimestamp,
  updateDoc,
  setDoc,
  increment,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/* ——— محافظات (fallback) ——— */
const DEFAULT_PROVINCES = [
  { id: "DAM", name: "دمشق", code: "DAM" },
  { id: "RDI", name: "ريف دمشق", code: "RDI" },
  { id: "ALE", name: "حلب", code: "ALE" },
  { id: "HMS", name: "حمص", code: "HMS" },
  { id: "HMA", name: "حماة", code: "HMA" },
  { id: "LAZ", name: "اللاذقية", code: "LAZ" },
  { id: "TAR", name: "طرطوس", code: "TAR" },
  { id: "IDL", name: "إدلب", code: "IDL" },
  { id: "DEZ", name: "دير الزور", code: "DEZ" },
  { id: "RAQ", name: "الرقة", code: "RAQ" },
  { id: "HAS", name: "الحسكة", code: "HAS" },
  { id: "DRA", name: "درعا", code: "DRA" },
  { id: "SWA", name: "السويداء", code: "SWA" },
  { id: "QUN", name: "القنيطرة", code: "QUN" },
];

/* ——— Utils ——— */
function normalizeDigits(str = "") {
  const map = {
    "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
    "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
    "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4",
    "۵":"5","۶":"6","۷":"7","۸":"8","۹":"9"
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] ?? d);
}
function pretty(err) {
  const c = err?.code || "";
  if (c.includes("permission")) return "صلاحيات غير كافية للكتابة في قاعدة البيانات.";
  return err?.message || "حدث خطأ غير متوقع.";
}
const emptyParent = { name:"", phone:"", email:"", job:"", nationalId:"", notes:"" };


function calcAgeFromDob(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(+d)) return "";
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return String(y);
}

function dobFromAgeYears(years, currentDob) {
  const n = new Date();
  let month = n.getMonth();
  let day = n.getDate();
  if (currentDob) {
    const cd = new Date(currentDob);
    if (!isNaN(+cd)) { month = cd.getMonth(); day = cd.getDate(); }
  }
  const y = n.getFullYear() - (isFinite(Number(years)) ? Number(years) : 0);
  const dt = new Date(y, month, day);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}



/* ——— Helpers للرمز ——— */
const pad4 = (n) => String(n).padStart(4, "0");
const formatStudentCode = (provCode, kgCode, seq) => `${provCode}-${kgCode}-${pad4(seq)}`;

function deriveKgCode(kg) {
  const raw = (kg?.code || kg?.kgCode || "").toString().trim();
  if (raw) return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "KGX";
  return ((kg?.id || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)) || "KGX";
}

async function previewNextStudentCode(db, kgId, provCode, kgCode) {
  try {
    const kgRef = doc(db, "kindergartens", kgId);
    const snap = await getDoc(kgRef);
    const next = ((snap.exists() ? (snap.data()?.studentSeq || 0) : 0) + 1);
    return formatStudentCode(provCode, kgCode, next);
  } catch { return ""; }
}

async function allocateStudentCode(db, kgId, provCode, kgCode) {
  const kgRef = doc(db, "kindergartens", kgId);
  let seq = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(kgRef);
    if (!snap.exists()) throw new Error("الروضة غير موجودة.");
    const current = (snap.data()?.studentSeq || 0) + 1;
    tx.update(kgRef, { studentSeq: current, updatedAt: serverTimestamp() });
    seq = current;
  });
  return { code: formatStudentCode(provCode, kgCode, seq), seq };
}

// بديل إن فشل الترانزاكشن
async function fallbackNextCode(db, kgId, provCode, kgCode) {
  const qy = query(collection(db, "students"), where("kindergartenId", "==", kgId));
  const snap = await getDocs(qy);
  let maxSeq = 0;
  snap.forEach(d => {
    const s = Number(d.data()?.studentSeq || 0);
    if (s > maxSeq) maxSeq = s;
  });
  const next = maxSeq + 1;
  return { code: formatStudentCode(provCode, kgCode, next), seq: next };
}

/* ————————————————————————————————————————————————————————————————
   الصفحة
——————————————————————————————————————————————————————————————— */
export default function AddStudent() {
  // تبويب
  const [tab, setTab] = useState("profile"); // profile | health

  // أساسية
  const [code, setCode] = useState(""); // معاينة/قراءة فقط
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [dob, setDob]             = useState("");
  const [gender, setGender]       = useState("female");
  const [address, setAddress]     = useState("");
  const [ageYears, setAgeYears] = useState("");

  // أخطاء + مراجع
  const [errors, setErrors] = useState({ firstName:"", lastName:"" });
  const refFirst = useRef(null);
  const refLast  = useRef(null);

  // المحافظات
  const [provinces, setProvinces] = useState(DEFAULT_PROVINCES);
  const [provinceName, setProvinceName] = useState("");

  // الروضة/الفرع/الصف
  const [kgList, setKgList]           = useState([]);
  const [kgId, setKgId]               = useState("");
  const [branchList, setBranchList]   = useState([]);
  const [branchId, setBranchId]       = useState("");
  const [classList, setClassList]     = useState([]);
  const [classId, setClassId]         = useState("");

  // السائق (اختياري)
  const [driverList, setDriverList]   = useState([]);
  const [driverId, setDriverId]       = useState("");

  // صورة
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // أولياء الأمور (+ مسؤول رئيسي)
  const [guardians, setGuardians] = useState([]);
  const [gFilter, setGFilter] = useState("");
  const [selectedGuardianIds, setSelectedGuardianIds] = useState([]);
  const [primaryGuardianId, setPrimaryGuardianId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // نافذة تفاصيل الأب/الأم
  const [father, setFather] = useState({ ...emptyParent });
  const [mother, setMother] = useState({ ...emptyParent });
  const [parentModal, setParentModal] = useState(null);
  const [parentDraft, setParentDraft] = useState({ ...emptyParent });

  // صحة
  const [health, setHealth] = useState({
    heightCm:"", weightKg:"", bloodGroup:"",
    allergy:"", chronic:"", medications:"",
    hearingIssues:"", vision:"", otherIssues:"",
    dietNotes:""
  });

  // واجهة
  const [loading, setLoading] = useState(false);
  const [formError, setError] = useState("");
  const [success, setSuccess] = useState("");
useEffect(() => {
  setAgeYears(calcAgeFromDob(dob));
}, [dob]);

  /* ————— تحميل القوائم ————— */
  useEffect(() => {
    // Provinces
    (async () => {
      try {
        const ps = await getDocs(query(collection(db, "provinces"), orderBy("name")));
        const arr = [];
        ps.forEach(d => {
          const x = d.data() || {};
          arr.push({ id: x.code || d.id, name: x.name || d.id, code: x.code || d.id });
        });
        setProvinces(arr.length ? arr : DEFAULT_PROVINCES);
      } catch {
        setProvinces(DEFAULT_PROVINCES);
      }
    })();
    

    // Guardians
    (async () => {
      try {
        const snap = await getDocs(collection(db, "guardians"));
        const arr = [];
        snap.forEach(d => {
          const x = d.data() || {};
          arr.push({
            id: d.id,
            fullName: [x.firstName, x.lastName].filter(Boolean).join(" ").trim() || "—",
            email: x.email || "",
            phone: x.phone || "",
          });
        });
        arr.sort((a,b)=>a.fullName.localeCompare(b.fullName, "ar"));
        setGuardians(arr);
      } catch {}
    })();

    // Kindergartens
    (async () => {
      try {
        const snap = await getDocs(collection(db, "kindergartens"));
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setKgList(arr);
      } catch {}
    })();
  }, []);

  // تحميل الفروع عند اختيار الروضة
  useEffect(() => {
    setBranchList([]); setBranchId("");
    setClassList([]); setClassId("");
    setDriverList([]); setDriverId("");
    if (!kgId) return;
    (async () => {
      try {
        const qy = query(collection(db, "branches"), where("parentId","==",kgId));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setBranchList(arr);
      } catch {}
    })();
  }, [kgId]);

  // تحميل الصفوف عند اختيار الفرع (أو صفوف الروضة إذا لا فرع)
  useEffect(() => {
    setClassList([]); setClassId("");
    if (!kgId) return;
    (async () => {
      try {
        const parent = branchId || kgId;
        const qy = query(collection(db, "classes"), where("parentId","==", parent));
        const snap = await getDocs(qy);
        const arr = [];
        snap.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
        arr.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "ar"));
        setClassList(arr);
      } catch {}
    })();
  }, [kgId, branchId]);

  // السائقون: من الفرع أولاً، ثم من الروضة، ثم fallback حسب kgId
  useEffect(() => {
    setDriverList([]); setDriverId("");
    if (!kgId) return;

    (async () => {
      try {
        let driverIds = [];

        // 1) من الفرع
        if (branchId) {
          const bSnap = await getDoc(doc(db, "branches", branchId));
          if (bSnap.exists()) driverIds = bSnap.data()?.driverIds || [];
        }

        // 2) إن لم يوجد في الفرع → من الروضة
        if (!driverIds.length) {
          const kSnap = await getDoc(doc(db, "kindergartens", kgId));
          if (kSnap.exists()) driverIds = kSnap.data()?.driverIds || [];
        }

        // 3) fallback: query by kgId
        if (!driverIds.length) {
          const qd = query(collection(db, "drivers"), where("kgId","==",kgId));
          const ds = await getDocs(qd);
          const arr = [];
          ds.forEach(d => arr.push({ id:d.id, ...(d.data()||{}) }));
          if (arr.length) {
            arr.sort((a,b)=>([a.firstName,a.lastName].join(" ")).localeCompare([b.firstName,b.lastName].join(" "),"ar"));
            setDriverList(arr);
            return;
          }
        }

        // 4) جلب حسب المعرّفات
        if (!driverIds.length) { setDriverList([]); return; }
        const drivers = await Promise.all(
          driverIds.map(async (id) => {
            const s = await getDoc(doc(db, "drivers", id));
            if (!s.exists()) return null;
            return { id:s.id, ...(s.data()||{}) };
          })
        );
        const list = drivers
          .filter(Boolean)
          .sort((a,b)=> ([a.firstName,a.lastName].join(" ")).localeCompare([b.firstName,b.lastName].join(" "),"ar"));
        setDriverList(list);
      } catch {
        setDriverList([]);
      }
    })();
  }, [kgId, branchId]);

  // معاينة الصورة
  function onPickPhoto(file) {
    setPhotoFile(file || null);
    if (!file) return setPhotoPreview("");
    const r = new FileReader();
    r.onload = ()=>setPhotoPreview(r.result);
    r.readAsDataURL(file);
  }

  // المحافظة الحالية
  const currentProvince = useMemo(
    () => provinces.find(p => p.name === provinceName) || null,
    [provinceName, provinces]
  );

  // ترشيح الروضات حسب المحافظة
  const kgFiltered = useMemo(() => {
    if (!currentProvince) return kgList;
    const code = currentProvince.code;
    const name = currentProvince.name;
    return kgList.filter(k =>
      (k.provinceCode && k.provinceCode === code) ||
      (k.provinceName && k.provinceName === name) ||
      (k.province && k.province === name)
    );
  }, [kgList, currentProvince]);

  // معاينة الرمز عند اختيار المحافظة + الروضة
  useEffect(() => {
    (async () => {
      setCode("");
      if (!kgId || !currentProvince) return;
      const kg = kgList.find(x => x.id === kgId);
      if (!kg) return;
      const kgCode = deriveKgCode(kg);
      const provCode = currentProvince.code;
      const preview = await previewNextStudentCode(db, kgId, provCode, kgCode);
      setCode(preview || "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kgId, currentProvince?.code]);

  // حارسون مفلترون
  const filteredGuardians = useMemo(() => {
    const key = normalizeDigits(gFilter).toLowerCase().trim();
    if (!key) return guardians;
    return guardians.filter(g => {
      const hay = [g.fullName, g.email, g.phone].join(" ").toLowerCase();
      return hay.includes(key);
    });
  }, [gFilter, guardians]);

  // تحقق بسيط
  function validate() {
    const next = {
      firstName: firstName.trim() ? "" : "الاسم مطلوب",
      lastName : lastName.trim()  ? "" : "الكنية مطلوبة",
    };
    setErrors(next);
    if (next.firstName) { setTab("profile"); setTimeout(()=>refFirst.current?.focus(),0); return false; }
    if (next.lastName)  { setTab("profile"); setTimeout(()=>refLast.current?.focus(),0);  return false; }
    if (!currentProvince) { setError("اختر المحافظة."); setTab("profile"); return false; }
    if (!kgId)            { setError("اختر الروضة.");   setTab("profile"); return false; }
    return true;
  }

  // تفريغ
  function resetForm() {
    setTab("profile");
    setCode(""); setFirstName(""); setLastName(""); setDob("");
    setGender("female"); setAddress("");
    setErrors({ firstName:"", lastName:"" });

    setProvinceName(""); setKgId(""); setBranchId(""); setClassId("");
    setBranchList([]); setClassList([]);
    setDriverList([]); setDriverId("");

    setPhotoFile(null); setPhotoPreview("");
    setSelectedGuardianIds([]); setPrimaryGuardianId(""); setGFilter("");
    setFather({ ...emptyParent }); setMother({ ...emptyParent });

    setHealth({
      heightCm:"", weightKg:"", bloodGroup:"",
      allergy:"", chronic:"", medications:"",
      hearingIssues:"", vision:"", otherIssues:"",
      dietNotes:""
    });

    setError(""); setSuccess("");
  }

  // حفظ
  async function submit(e) {
    e.preventDefault();
    setError(""); setSuccess("");
    if (loading) return;
    if (!validate()) return;

    try {
      setLoading(true);

      const kg  = kgList.find(x=>x.id===kgId) || {};
      const br  = branchList.find(x=>x.id===branchId) || {};
      const cl  = classList.find(x=>x.id===classId) || {};
      const drv = driverList.find(x=>x.id===driverId) || null;

      const primary  = guardians.find(g=>g.id===primaryGuardianId) || null;
      const guardianIds = Array.from(new Set(selectedGuardianIds));

      const provCode = currentProvince?.code || "";
      const provName = currentProvince?.name || "";
      const kgCode   = deriveKgCode(kg);

      // احجز الرمز (مع fallback)
      let finalCode = "";
      let seq = 0;
      try {
        const r = await allocateStudentCode(db, kgId, provCode, kgCode);
        finalCode = r.code; seq = r.seq;
      } catch (ee) {
        const r = await fallbackNextCode(db, kgId, provCode, kgCode);
        finalCode = r.code; seq = r.seq;
      }

      // فهرس بحث بسيط
      const searchIndex = [
        finalCode,
        firstName, lastName,
        (primary?.phone || ""), (primary?.email || ""),
        (kg?.name || ""), (br?.name || ""), (cl?.name || "")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const base = {
        role: "student",

        // رمز الطالب (ويُستخدم أيضًا كـ publicId)
        code: finalCode,
        publicId: finalCode,

        studentSeq: seq,
        provinceName: provName,
        provinceCode: provCode,
        kindergartenCode: kgCode,

        firstName: firstName.trim(),
        lastName : lastName.trim(),
        dob      : dob || null,
        gender,
        address  : address.trim() || "",
        active   : true,

        // الربط
        primaryGuardianId: primaryGuardianId || null,
        guardianIds,

        // نسخ من الحساب الرئيسي (إن وجد)
        phone: primary?.phone || null,
        email: primary?.email || null,

        // المحافظة + الروضة ← الفرع ← الصف
        province: provName || kg?.province || "",
        kindergartenId: kgId || null,
        kindergartenName: kg?.name || "",
        branchId: branchId || null,
        branchName: br?.name || "",
        classId: classId || null,
        className: cl?.name || "",

        // السائق
        driverId: driverId || null,
        driverName: drv ? [drv.firstName, drv.lastName].filter(Boolean).join(" ").trim() : "",
        driverPhone: drv?.phone || "",

        // الأبوين
        parents: { father: { ...father }, mother: { ...mother } },

        // الصحة
        health: {
          heightCm: health.heightCm || null,
          weightKg: health.weightKg || null,
          bloodGroup: health.bloodGroup || "",
          allergy: health.allergy || "",
          chronic: health.chronic || "",
          medications: health.medications || "",
          hearingIssues: health.hearingIssues || "",
          vision: health.vision || "",
          otherIssues: health.otherIssues || "",
          dietNotes: health.dietNotes || "",
        },

        searchIndex,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1) إنشاء وثيقة الطالب
      const { id } = await saveToFirestore("students", base);
      // 2) publicId (نستخدم نفس الرمز ولا ننشئ كودًا إضافيًا)
      await assignPublicIdAndIndex({
        uid: id,
        role: "student",
        col : "students",
        email: base.email || null,
        phone: base.phone || null,
        displayName: `${base.firstName} ${base.lastName}`.trim(),
        index: false,
      });
      // 3) ربط الطالب مع أولياء الأمور
      await linkStudentToGuardians({ studentId: id, guardianIds });

      // 4) تحديثات مترابطة (عدادات + وصلات) — دفعة واحدة
      const batch = writeBatch(db);

      // روضة
      if (kgId) {
        batch.update(doc(db, "kindergartens", kgId), {
          studentCount: increment(1),
          lastStudentAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      // فرع
      if (branchId) {
        batch.set(doc(db, "branches", branchId), {}, { merge: true });
        batch.update(doc(db, "branches", branchId), {
          studentCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      }
      // صف
      if (classId) {
        const cRef = doc(db, "classes", classId);
        batch.set(cRef, {}, { merge: true });
        batch.update(cRef, {
          studentCount: increment(1),
          studentIds: arrayUnion(id),
          updatedAt: serverTimestamp(),
        });
        // وصلة مساعدة classStudents
        const csId = `${classId}_${id}`;
        batch.set(doc(db, "classStudents", csId), {
          classId,
          studentId: id,
          parentId: branchId || kgId,
          kindergartenId: kgId,
          branchId: branchId || null,
          enrolledAt: serverTimestamp(),
          active: true,
          code: finalCode,
          studentName: `${firstName} ${lastName}`.trim(),
          className: cl?.name || "",
          kindergartenName: kg?.name || "",
          branchName: br?.name || "",
        }, { merge: true });
      }

      // سائق
      if (driverId) {
        const dRef = doc(db, "drivers", driverId);
        batch.set(dRef, {}, { merge: true });
        batch.update(dRef, {
          studentCount: increment(1),
          studentIds: arrayUnion(id),
          updatedAt: serverTimestamp(),
        });
      }

      // أولياء الأمور (احتياط في حال linkStudentToGuardians لا يضيف studentIds)
      guardianIds.forEach(gid => {
        batch.set(doc(db, "guardians", gid), {
          studentIds: arrayUnion(id),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      await batch.commit();

      // 5) رفع الصورة (غير حاجب للواجهة)
      if (photoFile) {
        const _id = id;
        const _photo = photoFile;
        const path = `students/${_id}/avatar_${Date.now()}_${_photo.name}`;
        (async () => {
          try {
            const r = ref(storage, path);
            const snap = await uploadBytes(r, _photo);
            const url  = await getDownloadURL(snap.ref);
            await saveToFirestore("students", { photoURL: url, updatedAt: serverTimestamp() }, { id: _id, merge: true });
          } catch (e) {
            // تجاهل الفشل في الصورة
          }
        })();
      }

      setSuccess(`✅ تم إضافة الطالب بنجاح. الرمز: ${finalCode}`);
      resetForm();
    } catch (err) {
      setError(pretty(err));
    } finally {
      setLoading(false);
    }
  }

  // ————— واجهة —————
  return (
    <div className="ap-page">
      {/* رأس */}
      <div className="ap-hero">
        <h1 className="ap-hero__title">إضافة طالب</h1>
        <p className="ap-hero__sub">املأ التبويبين ثم اضغط «إضافة الطالب». سيتم حفظ كل البيانات ضمن <b>students</b> وتحديث العدادات فورًا.</p>
      </div>

      {/* تبويبات */}
      <div className="ap-card" style={{marginBottom:10}}>
        <div className="ap-card__head">
          <div className="ap-tabs">
            <button
              type="button"
              className={`ap-btn ${tab === "profile" ? "ap-btn--primary" : ""}`}
              onClick={() => setTab("profile")}
              style={{marginInlineEnd: 8}}
            >
              المعلومات الأساسية
            </button>
            <button
              type="button"
              className={`ap-btn ${tab === "health" ? "ap-btn--primary" : ""}`}
              onClick={() => setTab("health")}
            >
              معلومات الصحة
            </button>
          </div>
        </div>
      </div>

      {/* بطاقة المحتوى - نموذج واحد يجمع التبويبين */}
      <section className="ap-card">
        <form className="ap-card__body ap-form" onSubmit={submit}>
          {formError && <div className="ap-error" style={{marginBottom:8}}>⚠️ {formError}</div>}
          {success   && <div className="ap-success" style={{marginBottom:8}}>{success}</div>}

          {/* ——— التبويب الأساسي ——— */}
          {tab === "profile" && (
            <>
              {/* الاسم والكنية جنبًا إلى جنب */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label><span className="ap-required">*</span> الاسم</label>
                  <input
                    ref={refFirst}
                    className={`ap-input ${errors.firstName ? "ap-invalid":""}`}
                    dir="auto"
                    value={firstName}
                    onChange={(e)=>setFirstName(e.target.value)}
                    placeholder="الاسم"
                  />
                  {errors.firstName && <div className="ap-error">{errors.firstName}</div>}
                </div>
                <div className="ap-field">
                  <label><span className="ap-required">*</span> الكنية</label>
                  <input
                    ref={refLast}
                    className={`ap-input ${errors.lastName ? "ap-invalid":""}`}
                    dir="auto"
                    value={lastName}
                    onChange={(e)=>setLastName(e.target.value)}
                    placeholder="الكنية"
                  />
                  {errors.lastName && <div className="ap-error">{errors.lastName}</div>}
                </div>
              </div>

              {/* الميلاد + الجنس */}
              {/* الميلاد + العمر + الجنس */}
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
  <div className="ap-field">
    <label>تاريخ الميلاد</label>
    <input
      className="ap-input"
      type="date"
      value={dob}
      onChange={(e)=>setDob(e.target.value)}
    />
  </div>

  <div className="ap-field">
    <label>العمر (بالسنوات)</label>
    <input
      className="ap-input"
      type="number"
      min="0"
      dir="ltr"
      placeholder="مثال: 5"
      value={ageYears || ""}
      onChange={(e)=>{
        const v = e.target.value.replace(/[^\d]/g,"");
        setAgeYears(v);
        // تحديث dob تلقائيًا بناءً على العمر المدخل
        setDob(dobFromAgeYears(Number(v || 0), dob));
      }}
      title="تعديل العمر سيعدّل تاريخ الميلاد تلقائيًا (مع الحفاظ على اليوم/الشهر الحاليين إن وُجدا)"
    />
  </div>

  <div className="ap-field">
    <label>الجنس</label>
    <div className="ap-radio">
      <label><input type="radio" checked={gender==="female"} onChange={()=>setGender("female")} /> أنثى</label>
      <label><input type="radio" checked={gender==="male"} onChange={()=>setGender("male")} /> ذكر</label>
    </div>
  </div>
</div>


              {/* العنوان */}
              <div className="ap-field">
                <label>العنوان</label>
                <input className="ap-input" dir="auto" placeholder="المدينة، الشارع…" value={address}
                  onChange={(e)=>setAddress(e.target.value)}/>
              </div>

              {/* المحافظة + الروضة */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>المحافظة</label>
                  <select
                    className="ap-input"
                    value={provinceName}
                    onChange={(e)=>{ setProvinceName(e.target.value); setKgId(""); setBranchId(""); setClassId(""); setCode(""); }}
                  >
                    <option value="">— اختر —</option>
                    {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="ap-field">
                  <label>الروضة</label>
                  <select
                    className="ap-input"
                    value={kgId}
                    onChange={(e)=>setKgId(e.target.value)}
                    disabled={!currentProvince || kgFiltered.length === 0}
                  >
                    <option value="">
                      {!currentProvince
                        ? "اختر المحافظة أولًا"
                        : (kgFiltered.length ? "— اختر —" : "لا توجد روضات في هذه المحافظة")}
                    </option>
                    {currentProvince && kgFiltered.map(k => (
                      <option key={k.id} value={k.id}>{k.name || k.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* الفرع + الصف */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>الفرع</label>
                  <select className="ap-input" value={branchId} onChange={(e)=>setBranchId(e.target.value)} disabled={!kgId}>
                    <option value="">{kgId ? "— بدون فرع / اختر —" : "اختر الروضة أولًا"}</option>
                    {branchList.map(b=><option key={b.id} value={b.id}>{b.name || b.id}</option>)}
                  </select>
                </div>
                <div className="ap-field">
                  <label>الصف</label>
                  <select className="ap-input" value={classId} onChange={(e)=>setClassId(e.target.value)} disabled={!kgId}>
                    <option value="">{kgId ? (branchId ? "— اختر —" : "صفوف الروضة") : "اختر الروضة أولًا"}</option>
                    {classList.map(c=><option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                  </select>
                </div>
              </div>

              {/* السائق (اختياري) */}
              <div className="ap-field">
                <label>السائق (اختياري)</label>
                <select className="ap-input" value={driverId} onChange={(e)=>setDriverId(e.target.value)} disabled={!kgId}>
                  <option value="">بدون سائق</option>
                  {driverList.map(d=>{
                    const nm = [d.firstName,d.lastName].filter(Boolean).join(" ").trim() || "سائق";
                    return <option key={d.id} value={d.id}>{nm}{d.phone ? ` — ${d.phone}` : ""}</option>;
                  })}
                </select>
                <div className="ap-note">سائقو الفرع أولاً، وإن لم يوجد فستظهر قائمة سائقين الروضة.</div>
              </div>

              {/* الرمز — معاينة */}
              <div className="ap-field">
                <label>رمز الطالب (يتولَّد تلقائيًا)</label>
                <input
                  className="ap-input"
                  dir="ltr"
                  placeholder="سيتولّد بعد اختيار المحافظة والروضة"
                  value={code}
                  readOnly
                  title="غير قابل للتعديل — يُنشأ تلقائيًا عند الحفظ حسب المحافظة والروضة"
                />
                <div className="ap-note">الصيغة: رمز المحافظة - رمز الروضة - رقم متسلسل (مثال: DAM-ZHR-0001)</div>
              </div>

              {/* الصورة */}
              <div className="ap-field">
                <label>الصورة</label>
                <div style={{display:"flex", gap:12, alignItems:"center"}}>
                  <label className="ap-upload" style={{whiteSpace:"nowrap"}}>
                    اختيار صورة
                    <input type="file" accept="image/*" onChange={(e)=>onPickPhoto(e.target.files?.[0])}/>
                  </label>
                  {photoPreview ? (
                    <img src={photoPreview} alt="" style={{width:80, height:80, objectFit:"cover", borderRadius:8, border:"1px solid #2b3a4c"}} />
                  ) : (
                    <div style={{width:80, height:80, display:"grid", placeItems:"center", borderRadius:8, border:"1px dashed #2b3a4c", color:"#94a3b8"}}>👦</div>
                  )}
                </div>
              </div>

              {/* الأبوين + ربط الحسابات */}
              <div className="ap-field">
                <label>معلومات وليّي الأمر (داخل وثيقة الطالب)</label>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                  <div style={styles.parentCard}>
                    <div style={styles.parentHead}>
                      <b>الأب</b>
                      <button type="button" className="ap-btn ap-btn--soft" onClick={()=>{
                        setParentDraft({...father}); setParentModal("father");
                      }}>إضافة/تعديل</button>
                    </div>
                    <ParentSummary p={father} />
                  </div>
                  <div style={styles.parentCard}>
                    <div style={styles.parentHead}>
                      <b>الأم</b>
                      <button type="button" className="ap-btn ap-btn--soft" onClick={()=>{
                        setParentDraft({...mother}); setParentModal("mother");
                      }}>إضافة/تعديل</button>
                    </div>
                    <ParentSummary p={mother} />
                  </div>
                </div>
              </div>

              <div className="ap-field">
                <label>ربط بحساب/حسابات أولياء الأمور</label>
                <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
                  <button
                    type="button"
                    className="ap-btn ap-btn--soft"
                    onClick={()=>setPickerOpen(true)}
                  >
                    اختيار مسؤول الحساب
                  </button>

                  {selectedGuardianIds.length > 0 ? (
                    <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                      {selectedGuardianIds.map((gid) => {
                        const g = guardians.find(x=>x.id===gid);
                        if (!g) return null;
                        const isPrimary = gid === primaryGuardianId;
                        return (
                          <div
                            key={gid}
                            style={{
                              display:"inline-flex",
                              alignItems:"center",
                              gap:8,
                              background:"rgba(34,197,94,.12)",
                              border:"1px solid rgba(34,197,94,.4)",
                              color:"#a7f3d0",
                              padding:"6px 10px",
                              borderRadius:999
                            }}
                            title={isPrimary ? "الحساب الرئيسي" : "اضغط لجعله رئيسيًا"}
                          >
                            <span
                              onClick={()=>setPrimaryGuardianId(gid)}
                              style={{
                                width:8, height:8, background:"#22c55e", borderRadius:999,
                                boxShadow: isPrimary ? "0 0 0 3px rgba(34,197,94,.35)" : "none",
                                cursor:"pointer"
                              }}
                            />
                            <span>{g.fullName}</span>
                            {g.phone && <span style={{opacity:.7}}>— {g.phone}</span>}
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={()=>{
                                const rest = selectedGuardianIds.filter(x=>x!==gid);
                                setSelectedGuardianIds(rest);
                                if (gid === primaryGuardianId) setPrimaryGuardianId(rest[0] || "");
                              }}
                              title="إزالة"
                              style={{marginInlineStart:4}}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ap-note">لم يتم اختيار أي حساب بعد.</div>
                  )}
                </div>
                <div className="ap-note" style={{ marginTop: 8 }}>
                  تلميح: الحساب المُشار إليه كنقطة خضراء هو <b>وليّ الأمر المسؤول</b>.
                </div>
              </div>
            </>
          )}

          {/* ——— تبويب الصحة ——— */}
          {tab === "health" && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>الطول (سم)</label>
                  <input className="ap-input" dir="ltr" value={health.heightCm}
                    onChange={(e)=>setHealth(h=>({...h, heightCm: normalizeDigits(e.target.value)}))}
                    placeholder="Height"/>
                </div>
                <div className="ap-field">
                  <label>الوزن (كغ)</label>
                  <input className="ap-input" dir="ltr" value={health.weightKg}
                    onChange={(e)=>setHealth(h=>({...h, weightKg: normalizeDigits(e.target.value)}))}
                    placeholder="Weight"/>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>فصيلة الدم</label>
                  <input className="ap-input" value={health.bloodGroup}
                    onChange={(e)=>setHealth(h=>({...h, bloodGroup: e.target.value}))} placeholder="A+ / O- …"/>
                </div>
                <div className="ap-field">
                  <label>حساسية</label>
                  <input className="ap-input" value={health.allergy}
                    onChange={(e)=>setHealth(h=>({...h, allergy: e.target.value}))} placeholder="Allergy"/>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>أمراض مزمنة</label>
                  <input className="ap-input" value={health.chronic}
                    onChange={(e)=>setHealth(h=>({...h, chronic: e.target.value}))} placeholder="Chronic conditions"/>
                </div>
                <div className="ap-field">
                  <label>أدوية دائمة</label>
                  <input className="ap-input" value={health.medications}
                    onChange={(e)=>setHealth(h=>({...h, medications: e.target.value}))} placeholder="Medications"/>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="ap-field">
                  <label>مشاكل السمع</label>
                  <input className="ap-input" value={health.hearingIssues}
                    onChange={(e)=>setHealth(h=>({...h, hearingIssues: e.target.value}))} placeholder="ضعف سمع، سماعة، التهابات…"/>
                </div>
                <div className="ap-field">
                  <label>البصر</label>
                  <input className="ap-input" value={health.vision}
                    onChange={(e)=>setHealth(h=>({...h, vision: e.target.value}))} placeholder="نظارات/ملاحظات"/>
                </div>
              </div>

              <div className="ap-field">
                <label>مشاكل/أمراض أخرى</label>
                <textarea className="ap-input" rows={3} value={health.otherIssues}
                  onChange={(e)=>setHealth(h=>({...h, otherIssues: e.target.value}))}
                  placeholder="اكتب كل مشكلة في سطر منفصل…"/>
              </div>

              <div className="ap-field">
                <label>ملاحظات غذائية</label>
                <textarea className="ap-input" rows={3} value={health.dietNotes}
                  onChange={(e)=>setHealth(h=>({...h, dietNotes: e.target.value}))}
                  placeholder="حساسية طعام، قيود غذائية…"/>
              </div>
            </>
          )}

          {/* أزرار أسفل النموذج */}
          <div className="ap-actions" style={{ marginTop: 10 }}>
            <button type="button" className="ap-btn" onClick={resetForm}>تفريغ</button>

            <div style={{ marginInlineStart: "auto", display: "flex", gap: 8 }}>
              {tab === "health" && (
                <button type="button" className="ap-btn" onClick={() => setTab("profile")}>
                  السابق: المعلومات الأساسية
                </button>
              )}
              {tab === "profile" && (
                <button type="button" className="ap-btn" onClick={() => setTab("health")}>
                  التالي: معلومات الصحة
                </button>
              )}

              <button type="submit" className="ap-btn ap-btn--primary" disabled={loading}>
                {loading ? "جاري الحفظ…" : "إضافة الطالب"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* مودال الأب/الأم */}
      {parentModal && (
        <div style={styles.backdrop} onClick={()=>setParentModal(null)}>
          <div style={styles.modal} onClick={(e)=>e.stopPropagation()}>
            <div style={styles.modalHead}>
              <b>معلومات {parentModal === "father" ? "الأب" : "الأم"}</b>
              <button className="ap-btn" onClick={()=>setParentModal(null)}>✕</button>
            </div>
            <div className="ap-form" style={{paddingTop:8}}>
              <div className="ap-field">
                <label>الاسم الكامل</label>
                <input className="ap-input" dir="auto" value={parentDraft.name}
                  onChange={(e)=>setParentDraft(d=>({...d, name:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>رقم الهاتف</label>
                <input className="ap-input" dir="ltr" value={parentDraft.phone}
                  onChange={(e)=>setParentDraft(d=>({...d, phone: normalizeDigits(e.target.value)}))}/>
              </div>
              <div className="ap-field">
                <label>البريد الإلكتروني</label>
                <input className="ap-input" dir="ltr" value={parentDraft.email}
                  onChange={(e)=>setParentDraft(d=>({...d, email:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>المهنة</label>
                <input className="ap-input" value={parentDraft.job}
                  onChange={(e)=>setParentDraft(d=>({...d, job:e.target.value}))}/>
              </div>
              <div className="ap-field">
                <label>الرقم الوطني (اختياري)</label>
                <input className="ap-input" dir="ltr" value={parentDraft.nationalId}
                  onChange={(e)=>setParentDraft(d=>({...d, nationalId: normalizeDigits(e.target.value)}))}/>
              </div>
              <div className="ap-field ap-span-2">
                <label>ملاحظات</label>
                <textarea className="ap-input" rows={3} value={parentDraft.notes}
                  onChange={(e)=>setParentDraft(d=>({...d, notes:e.target.value}))}/>
              </div>

              <div className="ap-actions ap-span-2">
                <button className="ap-btn" onClick={()=>setParentModal(null)}>إلغاء</button>
                <button className="ap-btn ap-btn--primary" onClick={()=>{
                  if (parentModal === "father") setFather(parentDraft);
                  else setMother(parentDraft);
                  setParentModal(null);
                }}>
                  حفظ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال اختيار حسابات أولياء الأمور */}
      {pickerOpen && (
        <div style={styles.backdrop} onClick={()=>setPickerOpen(false)}>
          <div
            style={styles.pickerModal}
            onClick={(e)=>e.stopPropagation()}
            role="dialog"
            aria-label="اختيار حسابات أولياء الأمور"
          >
            <div style={styles.pickerHead}>
              <b>اختيار حسابات أولياء الأمور</b>
              <button className="ap-btn" onClick={()=>setPickerOpen(false)}>✕</button>
            </div>

            {/* فلتر */}
            <div className="ap-field" style={{marginTop:6}}>
              <input
                autoFocus
                className="ap-input"
                placeholder="بحث بالاسم / البريد / الهاتف…"
                value={gFilter}
                onChange={(e)=>setGFilter(e.target.value)}
              />
            </div>

            {/* القائمة */}
            <div style={styles.pickerList}>
              {filteredGuardians.map((g) => {
                const active  = selectedGuardianIds.includes(g.id);
                const primary = primaryGuardianId === g.id;
                return (
                  <div
                    key={g.id}
                    className="ap-line"
                    onClick={()=>{
                      setSelectedGuardianIds(prev=>{
                        const has  = prev.includes(g.id);
                        const next = has ? prev.filter(x=>x!==g.id) : [...prev, g.id];
                        if (!primaryGuardianId && next.length) setPrimaryGuardianId(next[0]);
                        if (primary && has) {
                          const rest = next.filter(x=>x!==g.id);
                          setPrimaryGuardianId(rest[0] || "");
                        }
                        return next;
                      });
                    }}
                    style={{
                      cursor:"pointer",
                      borderRadius:8,
                      padding:"10px 12px",
                      border:"1px solid #243244",
                      background: active ? "rgba(34,197,94,.12)" : "#0f172a",
                      display:"flex",
                      alignItems:"center",
                      justifyContent:"space-between"
                    }}
                  >
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div
                        aria-hidden
                        style={{
                          width:12, height:12, borderRadius:999,
                          border:"2px solid #22c55e",
                          background: active ? "#22c55e" : "transparent"
                        }}
                      />
                      <div>
                        <div style={{fontWeight:600}}>{g.fullName}</div>
                        <div style={{color:"#94a3b8", fontSize:12}}>{g.phone || "لا هاتف"}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ap-btn ap-btn--soft"
                      onClick={(e)=>{ e.stopPropagation(); setPrimaryGuardianId(g.id); }}
                      title="تعيين كحساب رئيسي"
                    >
                      {primary ? "رئيسي ✓" : "جعل رئيسي"}
                    </button>
                  </div>
                );
              })}
              {filteredGuardians.length === 0 && (
                <div className="ap-note">لا نتائج مطابقة للبحث الحالي.</div>
              )}
            </div>

            <div className="ap-actions">
              <button type="button" className="ap-btn" onClick={()=>setPickerOpen(false)}>إلغاء</button>
              <button
                type="button"
                className="ap-btn ap-btn--primary"
                onClick={()=>setPickerOpen(false)}
              >
                تأكيد الاختيار
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ————— مكوّن صغير لعرض ملخص الأب/الأم —————
function ParentSummary({ p }) {
  const none = !p?.name && !p?.phone && !p?.email && !p?.job && !p?.nationalId && !p?.notes;
  if (none) return <div className="ap-note">لا توجد بيانات بعد.</div>;
  return (
    <ul style={{margin:0, paddingInlineStart:16, color:"#cbd5e1"}}>
      {p.name && <li>الاسم: {p.name}</li>}
      {p.phone && <li>الهاتف: {p.phone}</li>}
      {p.email && <li>البريد: {p.email}</li>}
      {p.job && <li>المهنة: {p.job}</li>}
      {p.nationalId && <li>الرقم الوطني: {p.nationalId}</li>}
      {p.notes && <li>ملاحظات: {p.notes}</li>}
    </ul>
  );
}

// ————— أنماط بسيطة للمودالات والبطاقات —————
const styles = {
  backdrop: {
    position:"fixed", inset:0, background:"rgba(0,0,0,.55)",
    display:"grid", placeItems:"center", zIndex: 50
  },
  modal: {
    width:"min(720px, 92vw)", background:"#0b1220", border:"1px solid #243244",
    borderRadius:12, padding:16, boxShadow:"0 10px 40px rgba(0,0,0,.5)"
  },
  modalHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  parentCard: { border:"1px solid #243244", borderRadius:10, padding:12, background:"#0f172a" },
  parentHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },

  pickerModal: {
    width:"min(720px, 92vw)",
    background:"#0b1220",
    border:"1px solid #243244",
    borderRadius:12,
    padding:12,
    boxShadow:"0 14px 40px rgba(0,0,0,.45)"
  },
  pickerHead: {
    display:"flex", alignItems:"center", justifyContent:"space-between"
  },
  pickerList: {
    marginTop:10,
    display:"grid",
    gap:8,
    maxHeight:360,
    overflow:"auto",
    paddingRight:4
  },
};
