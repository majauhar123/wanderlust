require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const User = require("./models/user.js");

const path = require("path");
const methodOverride = require("method-override");

// ⭐ MULTER
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

// ⭐ AUTH + FLASH
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");

// ================= ENV =================
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wanderlust";
const SECRET = process.env.SESSION_SECRET || "fallbacksecret";

// 🔍 DEBUG
console.log("ENV CHECK 🔍");
console.log("MONGO_URL:", MONGO_URL);

// ================= DB =================
async function main() {
  try {
    if (!MONGO_URL.startsWith("mongodb")) {
      throw new Error("Invalid MONGO_URL ❌");
    }

    await mongoose.connect(MONGO_URL);
    console.log("connected to DB ✅");

  } catch (err) {
    console.log("DB ERROR ❌", err.message);
    process.exit(1);
  }
}
main();

// ================= VIEW =================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

// ================= SESSION =================
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(flash());

// ================= PASSPORT =================
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// ================= GLOBAL =================
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// ================= MIDDLEWARE =================
function isLoggedIn(req, res, next) {
  if (!req.isAuthenticated()) {
    req.flash("error", "You must be logged in!");
    return res.redirect("/login");
  }
  next();
}

async function isOwner(req, res, next) {
  let listing = await Listing.findById(req.params.id);
  if (!listing.owner.equals(req.user._id)) {
    return res.send("You are not the owner ❌");
  }
  next();
}

async function isReviewAuthor(req, res, next) {
  let review = await Review.findById(req.params.reviewId);
  if (!review.author.equals(req.user._id)) {
    return res.send("Not your review ❌");
  }
  next();
}

// ================= ROUTES =================

// ROOT
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// INDEX + SEARCH
app.get("/listings", async (req, res) => {
  let { search, category } = req.query;

  let query = {};

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { location: { $regex: search, $options: "i" } },
      { country: { $regex: search, $options: "i" } },
    ];
  }

  if (category) {
    query.category = category;
  }

  const allListings = await Listing.find(query);
  res.render("listings/index.ejs", { allListings });
});

// NEW
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new.ejs");
});

// SHOW
app.get("/listings/:id", async (req, res) => {
  let listing = await Listing.findById(req.params.id)
    .populate("reviews")
    .populate("owner");

  res.render("listings/show.ejs", { listing });
});

// CREATE
app.post("/listings", isLoggedIn, upload.single("listing[image]"), async (req, res) => {
  const newListing = new Listing(req.body.listing);

  newListing.owner = req.user._id;
  newListing.image = req.file ? req.file.path : "";

  await newListing.save();

  req.flash("success", "New listing created 🎉");
  res.redirect("/listings");
});

// EDIT
app.get("/listings/:id/edit", isLoggedIn, isOwner, async (req, res) => {
  let listing = await Listing.findById(req.params.id);
  res.render("listings/edit.ejs", { listing });
});

// UPDATE
app.put("/listings/:id", isLoggedIn, isOwner, async (req, res) => {
  await Listing.findByIdAndUpdate(req.params.id, req.body.listing);
  req.flash("success", "Listing updated ✏️");
  res.redirect(`/listings/${req.params.id}`);
});

// DELETE
app.delete("/listings/:id", isLoggedIn, isOwner, async (req, res) => {
  await Listing.findByIdAndDelete(req.params.id);
  req.flash("success", "Listing deleted 🗑️");
  res.redirect("/listings");
});

// ================= REVIEWS =================
app.post("/listings/:id/reviews", isLoggedIn, async (req, res) => {
  let listing = await Listing.findById(req.params.id);

  let review = new Review(req.body.review);
  review.author = req.user._id;

  await review.save();

  listing.reviews.push(review);
  await listing.save();

  req.flash("success", "Review added ⭐");
  res.redirect(`/listings/${req.params.id}`);
});

app.delete("/listings/:id/reviews/:reviewId", isLoggedIn, isReviewAuthor, async (req, res) => {
  let { id, reviewId } = req.params;

  await Listing.findByIdAndUpdate(id, {
    $pull: { reviews: reviewId },
  });

  await Review.findByIdAndDelete(reviewId);

  req.flash("success", "Review deleted ❌");
  res.redirect(`/listings/${id}`);
});

// ================= AUTH =================

// Signup
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

app.post("/signup", async (req, res, next) => {
  try {
    let { username, email, password } = req.body;

    const newUser = new User({ email, username });
    const registeredUser = await User.register(newUser, password);

    req.login(registeredUser, (err) => {
      if (err) return next(err);
      return res.redirect("/listings");
    });

  } catch (e) {
    console.log(e);

    if (e.name === "UserExistsError") {
      return res.send("Username already exists ❌");
    }

    return res.send("Something went wrong");
  }
});

// Login
app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post("/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
  }),
  (req, res) => {
    req.flash("success", "Welcome back 🎉");
    res.redirect("/listings");
  }
);

// Logout
app.get("/logout", (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    req.flash("success", "Logged out successfully 👋");
    res.redirect("/listings");
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`server is listening on port ${PORT}`);
});