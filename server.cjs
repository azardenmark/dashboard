// server.js
// Minimal Auth API: Guardians create + login (SQLite + JWT)

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");
const Database = require("better-sqlite3");

// ===== Config =====
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DB_PATH = path.join(__dirname, "data.sqlite");

// ===== DB =====
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  firstName TEXT NOT NULL,
  lastName  TEXT NOT NULL,
  email     TEXT UNIQUE,
  phone     TEXT UNIQUE,
  gender    TEXT,
  address   TEXT,
  childrenJson TEXT,
  passwordHash TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guardians_email ON guardians(email);
CREATE INDEX IF NOT EXISTS idx_guardians_phone ON guardians(phone);
`);

// ===== App =====
const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "2mb" }));

// utils
function nowISO() { return new Date().toISOString(); }
function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: "guardian", name: `${user.firstName} ${user.lastName}` },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}
function pickGuardian(row) {
  if (!row) return null;
  const { passwordHash, childrenJson, ...rest } = row;
  return { ...rest, children: childrenJson ? JSON.parse(childrenJson) : [] };
}
function findGuardianByIdentifier(identifier) {
  const byEmail = db.prepare("SELECT * FROM guardians WHERE email = ?").get(identifier);
  if (byEmail) return byEmail;
  const byPhone = db.prepare("SELECT * FROM guardians WHERE phone = ?").get(identifier);
  return byPhone || null;
}

// ===== Routes =====

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// Create guardian (Admin panel will call this)
app.post("/api/guardians", async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, gender, address, password, children = []
    } = req.body || {};

    if (!firstName || !lastName) return res.status(400).json({ error: "الاسم والكنية مطلوبان" });
    if (!email && !phone) return res.status(400).json({ error: "أدخل البريد أو رقم الهاتف" });
    if (!password || String(password).length < 6) return res.status(400).json({ error: "كلمة المرور قصيرة" });

    // unique checks
    if (email) {
      const exists = db.prepare("SELECT 1 FROM guardians WHERE email = ?").get(email);
      if (exists) return res.status(409).json({ error: "البريد مستخدم مسبقًا" });
    }
    if (phone) {
      const exists = db.prepare("SELECT 1 FROM guardians WHERE phone = ?").get(phone);
      if (exists) return res.status(409).json({ error: "رقم الهاتف مستخدم مسبقًا" });
    }

    const id = "g_" + nanoid(10);
    const passwordHash = await bcrypt.hash(String(password), 10);
    db.prepare(`
      INSERT INTO guardians
      (id, firstName, lastName, email, phone, gender, address, childrenJson, passwordHash, createdAt)
      VALUES (@id, @firstName, @lastName, @email, @phone, @gender, @address, @childrenJson, @passwordHash, @createdAt)
    `).run({
      id,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      gender: gender || null,
      address: address || null,
      childrenJson: JSON.stringify(children || []),
      passwordHash,
      createdAt: nowISO(),
    });

    const row = db.prepare("SELECT * FROM guardians WHERE id = ?").get(id);
    res.status(201).json({ guardian: pickGuardian(row) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ داخلي" });
  }
});

// Login (Flutter app will call this)
app.post("/api/login", async (req, res) => {
  try {
    const { role = "guardian", identifier, password } = req.body || {};
    if (role !== "guardian") return res.status(400).json({ error: "الدخول المفعّل حاليًا لولي الأمر فقط" });
    if (!identifier || !password) return res.status(400).json({ error: "مُعرّف المستخدم وكلمة المرور مطلوبان" });

    const row = findGuardianByIdentifier(String(identifier).trim());
    if (!row) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

    const ok = await bcrypt.compare(String(password), row.passwordHash);
    if (!ok) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

    const token = signToken(row);
    res.json({ token, user: pickGuardian(row) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ داخلي" });
  }
});

// Auth middleware sample
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "مطلوب توكن" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "توكن غير صالح" });
  }
}

// Get current user
app.get("/api/me", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM guardians WHERE id = ?").get(req.user.sub);
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ user: pickGuardian(row) });
});

app.listen(PORT, () => {
  console.log(`Auth API running on http://localhost:${PORT}`);
});
