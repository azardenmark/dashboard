import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import "./UsersContext.css";


const UsersCtx = createContext(null);

const STORAGE_KEY = "nursery.users.v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function UsersProvider({ children }) {
  const [users, setUsers] = useState([]);

  // استرجاع من LocalStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setUsers(JSON.parse(raw));
    } catch {}
  }, []);

  // حفظ عند أي تغيير
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch {}
  }, [users]);

  const api = useMemo(
    () => ({
      users,
      addUser: (u) => {
        const newUser = {
          ...u,
          id: uid(),
          active: true,
          createdAt: Date.now(),
        };
        setUsers((prev) => [newUser, ...prev]);
        return newUser;
      },
      updateUser: (id, patch) => {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, ...patch, updatedAt: Date.now() } : u
          )
        );
      },
      toggleActive: (id) => {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === id
              ? { ...u, active: !u.active, updatedAt: Date.now() }
              : u
          )
        );
      },
      removeUser: (id) => {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      },
      byRole: (role) => users.filter((u) => u.role === role),
    }),
    [users]
  );

  return <UsersCtx.Provider value={api}>{children}</UsersCtx.Provider>;
}

export function useUsers() {
  const ctx = useContext(UsersCtx);
  if (!ctx) throw new Error("useUsers must be used inside <UsersProvider>");
  return ctx;
}
