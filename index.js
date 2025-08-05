const bcrypt = require("bcrypt");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const app = express();
const port = 3000;
const path = require("path");
const randomWords = require("random-words");

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const scoreSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  username: String,
  wpm: Number,
  accuracy: String,
  duration: Number,
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Score = mongoose.model("Score", scoreSchema);

app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "your_secret_key_here",
    resave: false,
    saveUninitialized: true,
  })
);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
// const word = randomWords.generate();
// console.log(word);

// const words = randomWords.generate(5);
// console.log(words); // e.g., ['banana', 'dog', 'pencil', 'run', 'sky']

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

app.get("/", (req, res) => {
  res.render("index", { randomWords, currentUser: req.session.user || null });
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.user = user;
    return res.redirect("/typing");
  }
  res.render("login", { error: "Invalid credentials" });
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render("register", { error: "Username already taken" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    req.session.user = user;
    res.redirect("/typing");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Server error during registration");
  }
});

app.post("/submit-score", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("User not logged in. Score not saved.");
  }

  const { wpm, accuracy, duration } = req.body;
  const user = req.session.user;
  const score = new Score({
    userId: user._id,
    username: user.username,
    wpm: parseInt(wpm),
    accuracy,
    duration: parseInt(duration),
  });
  await score.save();
  res.sendStatus(200);
});

app.get("/leaderboard", requireLogin, async (req, res) => {
  const topScoresPerUser = await Score.aggregate([
    {
      $sort: { wpm: -1 },
    },
    {
      $group: {
        _id: "$userId",
        username: { $first: "$username" },
        wpm: { $first: "$wpm" },
        accuracy: { $first: "$accuracy" },
        duration: { $first: "$duration" },
        createdAt: { $first: "$createdAt" },
      },
    },
    {
      $sort: { wpm: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  topScoresPerUser.forEach((score) => {
    if (typeof score.duration !== "number" || isNaN(score.duration)) {
      score.duration = 30; // default fallback duration
    }
  });

  res.render("leaderboard", {
    topScores: topScoresPerUser,
    currentUser: req.session.user.username,
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/test-save-score", async (req, res) => {
  try {
    const user = await User.findOne();
    if (!user) return res.send("❌ No users found in the database.");

    const score = new Score({
      userId: user._id,
      username: user.username,
      wpm: 80,
      accuracy: "98%",
      duration: 30,
    });

    await score.save();
    res.send("✅ Test score saved for user: " + user.username);
  } catch (err) {
    console.error("Error saving test score:", err);
    res.status(500).send("Server error");
  }
});

app.get("/typing", requireLogin, (req, res) => {
  res.render("index", { randomWords, currentUser: req.session.user || null });
});

app.listen(port, () => {
  console.log(`Hosted on port ${port}`);
});
