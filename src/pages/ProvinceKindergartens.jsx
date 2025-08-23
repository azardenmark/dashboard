// src/pages/ProvinceKindergartens.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection, doc, onSnapshot, query, updateDoc, where, deleteDoc
} from "firebase/firestore";
import { db } from "/src/firebase.js";
import "./FormStyles.css";

const css = `
.kgp{--card:#0b1422; --bd:#1f2c44; --ink:#e5e7eb; --ok:#16a34a; --bad:#ef4444;}
.kgp-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:10px}
.kgp-title{font-size:22px; font-weight:800; color:#eaf1ff}
.kg-card{background:var(--card); border:1px solid var(--bd); border-radius:16px; padding:14px}
.kg-table{width:100%; border-collapse:separate; border-spacing:0 10px}
.kg-th,.kg-td{padding:10px 12px}
.kg-tr{background:#0f1a2b; border:1px solid var(--bd)}
.kg-th{color:#9fb2d0; font-weight:600; text-align:right}
.kg-chip{display:inline-block; padding:3px 8px; border:1px solid var(--bd); background:#0f1a2b; color:#cfd9ed; border-radius:999px; font-size:12px}
.kg-btn{background:#101c31; border:1px solid var(--bd); color:var(--ink); padding:8px 12px; border-radius:10px; cursor:pointer}
.kg-btn.ok{background:var(--ok); border-color:transparent}
.kg-btn.bad{background:var(--bad); border-color:transparent}
.kg-empty{padding:20px; text-align:center; color:#9fb2d0}
.kg-switch{display:flex; align-items:center; gap:8px}
`;

// نفس الخيارات لاستخدام أسماء ودّية
const AGE_LABELS = { "3-4":"٣–٤", "4-5":"٤–٥", "5-6":"٥–٦", "6-7":"٦–٧" };
const STAGE_LABELS = { preschool:"تمهيدي", kg1:"روضة ١", kg2:"روضة ٢", kg3:"روضة ٣" };

export default function ProvinceKindergartensPage() {
  const { provId } = useParams();
  const nav = useNavigate();

  const [province, setProvince] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(()=>{
    const u1 = onSnapshot(doc(db,"provinces",provId), d=>{
      setProvince(d.exists()? {id:d.id, ...(d.data()||{})}: null);
    });
    const u2 = onSnapshot(query(collection(db,"kindergartens"), where("provinceId","==",provId)), snap=>{
      setItems(snap.docs.map(d=>({id:d.id, ...(d.data()||{})})));
    });
    return ()=>{u1(); u2();};
  },[provId]);

  const total = useMemo(()=> items.length, [items]);

  const toggleActive = async (k) => {
    await updateDoc(doc(db,"kindergartens",k.id), { active: !(k.active ?? true) });
  };
  const del = async (k) => {
    if(!confirm(`حذف روضة «${k.name}»؟`)) return;
    await deleteDoc(doc(db,"kindergartens",k.id));
  };

  return (
    <div className="ap-page kgp">
      <style>{css}</style>
      <div className="kgp-head">
        <div className="kgp-title">روضات محافظة: {province?.name || "—"}</div>
        <div>
          <button className="kg-btn" onClick={()=> nav("/kindergartens")}>عودة للمحافظات</button>
        </div>
      </div>

      <section className="kg-card">
        <div style={{color:"#9fb2d0", marginBottom:8}}>المجموع: {total} روضة</div>
        {total===0 ? (
          <div className="kg-empty">لا توجد روضات بعد في هذه المحافظة.</div>
        ) : (
          <table className="kg-table">
            <thead>
              <tr className="kg-tr">
                <th className="kg-th">الاسم</th>
                <th className="kg-th">الهاتف</th>
                <th className="kg-th">العنوان</th>
                <th className="kg-th">المراحل</th>
                <th className="kg-th">الفئات العمرية</th>
                <th className="kg-th">المعلّمون</th>
                <th className="kg-th">الطاقة</th>
                <th className="kg-th">نشط</th>
                <th className="kg-th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {items.map(k=>(
                <tr key={k.id} className="kg-tr">
                  <td className="kg-td" style={{fontWeight:700}}>{k.name}</td>
                  <td className="kg-td">{k.phone || "—"}</td>
                  <td className="kg-td" style={{color:"#b3c3df"}}>{k.address || "—"}</td>
                  <td className="kg-td">
                    {(k.stages||[]).map(s=><span key={s} className="kg-chip">{STAGE_LABELS[s]||s}</span>)}
                  </td>
                  <td className="kg-td">
                    {(k.ages||[]).map(a=><span key={a} className="kg-chip">{AGE_LABELS[a]||a}</span>)}
                  </td>
                  <td className="kg-td">{k.teachers||0}</td>
                  <td className="kg-td">{k.capacity||0}</td>
                  <td className="kg-td">
                    <label className="kg-switch">
                      <input type="checkbox" checked={k.active ?? true} onChange={()=>toggleActive(k)} />
                      {k.active ? "مفعل" : "موقّف"}
                    </label>
                  </td>
                  <td className="kg-td">
                    <div style={{display:"flex",gap:6}}>
                      <button className="kg-btn" onClick={()=> nav("/kindergartens", { state:{ editFromList:k, province } })}>تعديل</button>
                      <button className="kg-btn bad" onClick={()=> del(k)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
