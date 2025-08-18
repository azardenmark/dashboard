// src/components/ProtectedRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    console.log("[PR] mount");
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        console.log("[PR] auth state:", user?.uid, user?.email);
        if (!user) {
          setAllowed(false);
          setLoading(false);
          return;
        }
        // اقرأ الدور
        const roleRef = doc(db, "roles", user.uid);
        const snap = await getDoc(roleRef);
        console.log("[PR] role exists?", snap.exists(), "data:", snap.data());
        setAllowed(snap.exists() && snap.data()?.isAdmin === true);
      } catch (e) {
        console.error("[PR] role check failed", e);
        setAllowed(false);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) return <p style={{padding:16}}>جاري التحميل…</p>;
  return allowed ? children : <Navigate to="/login" replace />;
}
