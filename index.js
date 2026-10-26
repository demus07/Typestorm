const path = require("path");
const crypto = require("crypto");

// Load .env if present (Node >= 20.12). Real deployments set env vars directly.
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {}

const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { version } = require("./package.json");

const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

// MONGODB_URI is what the Vercel MongoDB Atlas integration provides.
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUri) {
  console.warn("MONGO_URI is not set - accounts, results and leaderboards will not work.");
}
// Connects once and is awaited by every request. A failed attempt is forgotten
// so the next request retries: a serverless instance can outlive a bad start.
let connecting = null;
let migrated = false;
function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  connecting ??= mongoose
    .connect(mongoUri || "mongodb://127.0.0.1:27017/typestorm", {
      dbName: process.env.MONGO_DB || undefined,
      serverSelectionTimeoutMS: 6000,
    })
    .then(() => {
      console.log("MongoDB connected");
      if (!migrated) {
        migrated = true;
        migrateLegacyData().catch((err) => console.error("Migration failed:", err));
      }
    })
    .catch((err) => {
      connecting = null;
      console.error("MongoDB connection error:", err.message);
      throw err;
    });
  return connecting;
}
connectDb().catch(() => {});

// ---------- models ----------

const CI = { locale: "en", strength: 2 }; // case-insensitive collation

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    testsStarted: { type: Number, default: 0 },
    testsCompleted: { type: Number, default: 0 },
    timeTyping: { type: Number, default: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { minimize: false }
);
userSchema.index({ username: 1 }, { unique: true, collation: CI });

const scoreSchema = new mongoose.Schema({
  uid: { type: mongoose.Schema.Types.ObjectId, index: true },
  username: String,
  wpm: Number,
  rawWpm: Number,
  acc: Number,
  consistency: Number,
  mode: String,
  mode2: String,
  quoteLength: String,
  language: { type: String, default: "english" },
  punctuation: { type: Boolean, default: false },
  numbers: { type: Boolean, default: false },
  difficulty: { type: String, default: "normal" },
  blindMode: { type: Boolean, default: false },
  testDuration: Number,
  charStats: [Number],
  chartData: { wpm: [Number], raw: [Number], err: [Number] },
  isPb: { type: Boolean, default: false },
  bailedOut: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
scoreSchema.index({ mode: 1, mode2: 1, language: 1, punctuation: 1, numbers: 1, wpm: -1 });

const sessionSchema = new mongoose.Schema({
  _id: String,
  data: mongoose.Schema.Types.Mixed,
  expires: { type: Date, index: { expireAfterSeconds: 0 } },
});

const User = mongoose.model("User", userSchema);
const Score = mongoose.model("Score", scoreSchema);
const SessionModel = mongoose.model("Session", sessionSchema);

// Converts results saved by the original version of the app (accuracy as a
// "98%" string, no mode) into the current shape, and backfills user stats.
async function migrateLegacyData() {
  const legacy = await Score.collection.updateMany({ mode: { $exists: false } }, [
    {
      $set: {
        uid: { $ifNull: ["$uid", "$userId"] },
        mode: "time",
        mode2: { $toString: { $ifNull: ["$duration", 30] } },
        testDuration: { $ifNull: ["$duration", 30] },
        acc: {
          $convert: {
            input: {
              $replaceAll: { input: { $toString: { $ifNull: ["$accuracy", "0"] } }, find: "%", replacement: "" },
            },
            to: "double",
            onError: 0,
            onNull: 0,
          },
        },
        rawWpm: "$wpm",
        language: "english",
        punctuation: false,
        numbers: false,
        difficulty: "normal",
        bailedOut: false,
        isPb: false,
        charStats: [0, 0, 0, 0],
      },
    },
    // Legacy wpm was never validated: keep implausible results out of PBs and leaderboards.
    { $set: { bailedOut: { $or: [{ $gt: ["$wpm", 350] }, { $lt: ["$acc", 75] }] } } },
    { $unset: ["userId", "accuracy", "duration"] },
  ]);
  if (legacy.modifiedCount) console.log(`Migrated ${legacy.modifiedCount} legacy results`);

  const users = await User.collection.find({ testsCompleted: { $exists: false } }).toArray();
  for (const u of users) {
    const [agg] = await Score.aggregate([
      { $match: { uid: u._id } },
      { $group: { _id: null, count: { $sum: 1 }, time: { $sum: "$testDuration" } } },
    ]);
    await User.collection.updateOne(
      { _id: u._id },
      {
        $set: {
          testsCompleted: agg?.count ?? 0,
          testsStarted: agg?.count ?? 0,
          timeTyping: agg?.time ?? 0,
          createdAt: u.createdAt ?? u._id.getTimestamp(),
        },
      }
    );
  }
}

// ---------- sessions ----------

class MongoSessionStore extends session.Store {
  get(sid, cb) {
    SessionModel.findById(sid)
      .lean()
      .then((doc) => cb(null, doc && doc.expires > new Date() ? doc.data : null), cb);
  }
  set(sid, sess, cb) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 864e5);
    SessionModel.updateOne({ _id: sid }, { data: sess, expires }, { upsert: true }).then(() => cb?.(), cb);
  }
  touch(sid, sess, cb) {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + 864e5);
    SessionModel.updateOne({ _id: sid }, { expires }).then(() => cb?.(), cb);
  }
  destroy(sid, cb) {
    SessionModel.deleteOne({ _id: sid }).then(() => cb?.(), cb);
  }
}

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set - using a random secret, sessions will reset on restart.");
}

// ---------- app ----------

const app = express();
if (isProd) app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: isProd ? "1h" : 0 }));
// Without a database, the API says so plainly and pages still render, signed out.
app.use((req, res, next) =>
  connectDb().then(
    () => next(),
    () => {
      if (req.path.startsWith("/api")) {
        return res.status(503).json({ message: "The database is unavailable. Please try again shortly." });
      }
      req.dbDown = true;
      next();
    }
  )
);
const sessions = session({
  name: "typestorm.sid",
  secret: sessionSecret,
  store: new MongoSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd },
});
app.use((req, res, next) => {
  if (!req.dbDown) return sessions(req, res, next);
  req.session = { destroy: (cb) => cb() };
  next();
});

const round2 = (n) => Math.round(n * 100) / 100;
const findUserByName = (username) => User.findOne({ username }).collation(CI);
const publicUser = (user) => ({ username: user.username });

// Also rejects sessions whose account was deleted from another device.
async function requireAuth(req, res, next) {
  if (!req.session.uid || !(await User.exists({ _id: req.session.uid }))) {
    return res.status(401).json({ message: "You need to be signed in" });
  }
  next();
}

const attempts = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ message: "Too many attempts, please try again later" });
    }
    recent.push(now);
    attempts.set(key, recent);
    next();
  };
}
setInterval(() => attempts.clear(), 15 * 60 * 1000).unref();
const authLimit = rateLimit(10, 60 * 1000);

function startSession(req, user, remember) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.uid = String(user._id);
      req.session.username = user.username;
      if (remember) req.session.cookie.maxAge = 30 * 864e5;
      else req.session.cookie.expires = false;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

async function verifyPassword(req) {
  const user = await User.findById(req.session.uid);
  if (!user) return null;
  const ok = await bcrypt.compare(String(req.body.password ?? ""), user.password);
  return ok ? user : null;
}

// ---------- auth ----------

app.post("/api/auth/register", authLimit, async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");
  if (!/^[a-zA-Z0-9_.-]{3,16}$/.test(username)) {
    return res.status(400).json({ message: "Username must be 3-16 characters: letters, numbers, _ . -" });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters long" });
  }
  if (await findUserByName(username)) {
    return res.status(409).json({ message: "Username is already taken" });
  }
  const user = await User.create({ username, password: await bcrypt.hash(password, 10) });
  await startSession(req, user, true);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/login", authLimit, async (req, res) => {
  const username = String(req.body.username ?? "").trim();
  const password = String(req.body.password ?? "");
  const user = username && (await findUserByName(username));
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Incorrect username or password" });
  }
  await startSession(req, user, req.body.remember !== false);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("typestorm.sid");
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.session.uid ? { username: req.session.username } : null });
});

// ---------- results ----------

const MODES = ["time", "words", "quote", "zen", "custom"];
const isCount = (n) => Number.isInteger(n) && n >= 0 && n < 1e6;
const numArray = (arr, max = 3600) =>
  Array.isArray(arr) ? arr.slice(0, max).map((n) => (Number.isFinite(+n) ? round2(+n) : 0)) : [];

app.post("/api/results", requireAuth, async (req, res) => {
  const r = req.body || {};
  const mode = MODES.includes(r.mode) ? r.mode : null;
  const mode2 = String(r.mode2 ?? "").slice(0, 32);
  const testDuration = round2(Number(r.testDuration));
  const charStats = Array.isArray(r.charStats) && r.charStats.length === 4 && r.charStats.every(isCount) ? r.charStats : null;
  const { wpmChars, rawChars } = r;
  const acc = round2(Number(r.acc));
  const consistency = round2(Number(r.consistency) || 0);

  if (!mode || !charStats || !isCount(wpmChars) || !isCount(rawChars) || wpmChars > rawChars) {
    return res.status(400).json({ message: "Invalid result" });
  }
  // The client derives these from the same character counts, so they must agree.
  if (rawChars !== charStats[0] + charStats[1] + charStats[2] || wpmChars > charStats[0]) {
    return res.status(400).json({ message: "Invalid result" });
  }
  if (!(testDuration >= 1 && testDuration <= 3 * 3600)) {
    return res.status(400).json({ message: "Invalid test duration" });
  }
  const chartLength = Array.isArray(r.chartData?.wpm) ? r.chartData.wpm.length : 0;
  if (Math.abs(chartLength - Math.ceil(testDuration)) > 2) {
    return res.status(400).json({ message: "Invalid result" });
  }
  if (mode === "time" && Math.abs(testDuration - Number(mode2)) > 1.5) {
    return res.status(400).json({ message: "Test duration does not match the mode" });
  }
  if (!(acc >= 75 && acc <= 100)) {
    return res.status(400).json({ message: "Accuracy below 75% - result not saved" });
  }

  // Never trust the client's wpm: recompute it from the character counts.
  const wpm = round2((wpmChars * 12) / testDuration);
  const rawWpm = round2((rawChars * 12) / testDuration);
  if (wpm > 350 || rawWpm > 400) {
    return res.status(400).json({ message: "Result looks suspicious - not saved" });
  }
  if (wpm <= 0) return res.status(400).json({ message: "Invalid result (0 wpm)" });

  const uid = new mongoose.Types.ObjectId(req.session.uid);
  const language = /^[a-z0-9_]{1,32}$/.test(r.language) ? r.language : "english";
  const punctuation = !!r.punctuation;
  const numbers = !!r.numbers;
  const bailedOut = false; // the client never bails out of a saved test

  let isPb = false;
  if ((mode === "time" || mode === "words") && !bailedOut) {
    const best = await Score.findOne({ uid, mode, mode2, language, punctuation, numbers })
      .sort({ wpm: -1 })
      .select("wpm")
      .lean();
    isPb = !best || wpm > best.wpm;
  }

  const chart = r.chartData || {};
  const score = await Score.create({
    uid,
    username: req.session.username,
    wpm,
    rawWpm,
    acc,
    consistency: Math.min(100, Math.max(0, consistency)),
    mode,
    mode2,
    quoteLength: mode === "quote" ? String(r.quoteLength ?? "").slice(0, 10) : undefined,
    language,
    punctuation,
    numbers,
    difficulty: ["normal", "expert", "master"].includes(r.difficulty) ? r.difficulty : "normal",
    blindMode: !!r.blindMode,
    testDuration,
    charStats,
    chartData: { wpm: numArray(chart.wpm), raw: numArray(chart.raw), err: numArray(chart.err) },
    isPb,
    bailedOut,
  });

  const incomplete = Math.min(1000, Math.max(0, parseInt(r.incompleteTests) || 0));
  const incompleteSeconds = Math.min(36000, Math.max(0, Number(r.incompleteSeconds) || 0));
  await User.updateOne(
    { _id: uid },
    { $inc: { testsCompleted: 1, testsStarted: 1 + incomplete, timeTyping: testDuration + incompleteSeconds } }
  );

  res.json({ isPb, result: { _id: score._id, wpm, rawWpm, acc } });
});

app.get("/api/results", requireAuth, async (req, res) => {
  const results = await Score.find({ uid: req.session.uid })
    .sort({ createdAt: -1 })
    .limit(5000)
    .select("-chartData -uid -username -__v")
    .lean();
  res.json({ results });
});

// ---------- users / profiles ----------

async function buildProfile(user) {
  const pbRows = await Score.aggregate([
    { $match: { uid: user._id, mode: { $in: ["time", "words"] }, bailedOut: { $ne: true } } },
    { $sort: { wpm: -1 } },
    {
      $group: {
        _id: { mode: "$mode", mode2: "$mode2", punctuation: "$punctuation", numbers: "$numbers", language: "$language" },
        wpm: { $first: "$wpm" },
        acc: { $first: "$acc" },
        rawWpm: { $first: "$rawWpm" },
        consistency: { $first: "$consistency" },
        punctuation: { $first: "$punctuation" },
        numbers: { $first: "$numbers" },
        language: { $first: "$language" },
        createdAt: { $first: "$createdAt" },
      },
    },
  ]);
  // pbs: best per mode2 regardless of settings (for display); pbList: best per full settings combination.
  const pbs = { time: {}, words: {} };
  const pbList = pbRows.map(({ _id, ...pb }) => ({ mode: _id.mode, mode2: _id.mode2, ...pb }));
  for (const pb of pbList) {
    const current = pbs[pb.mode][pb.mode2];
    if (!current || pb.wpm > current.wpm) pbs[pb.mode][pb.mode2] = pb;
  }
  return {
    username: user.username,
    joined: user.createdAt ?? user._id.getTimestamp(),
    testsStarted: user.testsStarted ?? 0,
    testsCompleted: user.testsCompleted ?? 0,
    timeTyping: user.timeTyping ?? 0,
    pbs,
    pbList,
  };
}

app.get("/api/users/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.uid);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ profile: await buildProfile(user) });
});

app.get("/api/users/:name/profile", async (req, res) => {
  const user = await findUserByName(String(req.params.name));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ profile: await buildProfile(user) });
});

app.get("/api/config", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.uid).select("config").lean();
  res.json({ config: user?.config ?? null });
});

app.put("/api/config", requireAuth, async (req, res) => {
  const config = req.body?.config;
  if (!config || typeof config !== "object" || Array.isArray(config) || JSON.stringify(config).length > 20000) {
    return res.status(400).json({ message: "Invalid config" });
  }
  await User.updateOne({ _id: req.session.uid }, { config });
  res.json({ ok: true });
});

app.post("/api/account/reset", requireAuth, authLimit, async (req, res) => {
  const user = await verifyPassword(req);
  if (!user) return res.status(401).json({ message: "Incorrect password" });
  await Score.deleteMany({ uid: user._id });
  await User.updateOne({ _id: user._id }, { testsStarted: 0, testsCompleted: 0, timeTyping: 0 });
  res.json({ ok: true });
});

app.post("/api/account/delete", requireAuth, authLimit, async (req, res) => {
  const user = await verifyPassword(req);
  if (!user) return res.status(401).json({ message: "Incorrect password" });
  await Score.deleteMany({ uid: user._id });
  await User.deleteOne({ _id: user._id });
  req.session.destroy(() => {
    res.clearCookie("typestorm.sid");
    res.json({ ok: true });
  });
});

// ---------- leaderboards / public stats ----------

const LEADERBOARD_TIMES = ["15", "30", "60"];

app.get("/api/leaderboards", async (req, res) => {
  const mode2 = LEADERBOARD_TIMES.includes(req.query.mode2) ? req.query.mode2 : "15";
  const daily = req.query.period === "daily";
  const match = { mode: "time", mode2, language: "english", punctuation: false, numbers: false, bailedOut: { $ne: true } };
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (daily) match.createdAt = { $gte: dayStart };

  const rows = await Score.aggregate([
    { $match: match },
    { $sort: { wpm: -1, createdAt: 1 } },
    {
      $group: {
        _id: "$uid",
        username: { $first: "$username" },
        wpm: { $first: "$wpm" },
        acc: { $first: "$acc" },
        rawWpm: { $first: "$rawWpm" },
        consistency: { $first: "$consistency" },
        createdAt: { $first: "$createdAt" },
      },
    },
    { $sort: { wpm: -1, createdAt: 1 } },
    { $limit: 1000 },
  ]);

  const pageSize = 50;
  const page = Math.max(0, parseInt(req.query.page) || 0);
  const entries = rows.map(({ _id, ...row }, i) => ({ rank: i + 1, uid: String(_id), ...row }));
  const you = req.session.uid ? entries.find((e) => e.uid === req.session.uid) ?? null : null;
  const strip = ({ uid, ...e }) => e;
  res.json({
    entries: entries.slice(page * pageSize, (page + 1) * pageSize).map(strip),
    total: entries.length,
    page,
    pageSize,
    you: you && strip(you),
    nextReset: daily ? dayStart.getTime() + 864e5 : null,
  });
});

app.get("/api/stats", async (req, res) => {
  const [agg] = await User.aggregate([
    {
      $group: {
        _id: null,
        testsStarted: { $sum: "$testsStarted" },
        testsCompleted: { $sum: "$testsCompleted" },
        timeTyping: { $sum: "$timeTyping" },
        users: { $sum: 1 },
      },
    },
  ]);
  res.json({ stats: agg ?? { testsStarted: 0, testsCompleted: 0, timeTyping: 0, users: 0 } });
});

app.use("/api", (req, res) => res.status(404).json({ message: "Not found" }));

// ---------- pages (single page app shell) ----------

const renderShell = (req, res) =>
  res.render("index", {
    boot: { user: req.session.uid ? { username: req.session.username } : null, version },
  });

app.get(["/", "/settings", "/leaderboards", "/about", "/login", "/account", "/profile/:name"], renderShell);
app.get("/typing", (req, res) => res.redirect(301, "/"));
app.get("/leaderboard", (req, res) => res.redirect(301, "/leaderboards"));
app.get("/register", (req, res) => res.redirect(301, "/login"));
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.use((req, res) => {
  res.status(404);
  renderShell(req, res);
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/api")) return res.status(500).json({ message: "Internal server error" });
  res.status(500).send("Internal server error");
});

// On Vercel the app is exported and invoked as a function; locally it listens.
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Typestorm v${version} running on http://localhost:${port}`);
  });
}

module.exports = app;
