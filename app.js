require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");

const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const User = require("./models/user.js");

const path = require("path");
const methodOverride = require("method-override");

// STATIC
app.use(express.static(path.join(__dirname, "public")));

// MULTER + CLOUDINARY
const multer = require("multer");
const { storage } = require("./cloudConfig");
const upload = multer({ storage });

// AUTH
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");

// AXIOS
const axios = require("axios");

// ENV
const MONGO_URL = process.env.MONGO_URL;
const SECRET = process.env.SESSION_SECRET || "fallbacksecret";

// DB CONNECT
mongoose.connect(MONGO_URL)
  .then(() => console.log("DB Connected ✅"))
  .catch(err => console.log("DB Error ❌", err));

// VIEW
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

// SESSION
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(flash());

// PASSPORT
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// GLOBAL VARIABLES
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

// ================= MIDDLEWARE =================

function isLoggedIn(req, res, next) {
  if (!req.isAuthenticated()) {
    req.flash("error", "Login required!");
    return res.redirect("/login");
  }
  next();
}

async function isOwner(req, res, next) {
  let listing = await Listing.findById(req.params.id);
  if (!listing.owner.equals(req.user._id)) {
    req.flash("error", "Not authorized");
    return res.redirect("/listings");
  }
  next();
}

// ================= ROUTES =================

// ✅ 🔥 FIXED HOMEPAGE
app.get("/", async (req, res) => {
  try {
    const listings = await Listing.find({});
    res.render("home", { listings }); // ❗ FIXED
  } catch (err) {
    console.log(err);
    res.send("Error loading homepage");
  }
});

// INDEX
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
  res.render("listings/index", { allListings });
});

// NEW
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new");
});

// SHOW
app.get("/listings/:id", async (req, res) => {
  let listing = await Listing.findById(req.params.id)
    .populate("reviews")
    .populate("owner");

  res.render("listings/show", { listing });
});

// CREATE
app.post("/listings", isLoggedIn, upload.single("listing[image]"), async (req, res) => {
  try {
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;

    if (req.file) {
      newListing.image = {
        url: req.file.path,
        filename: req.file.filename,
      };
    }

    // MAP
    const location = `${req.body.listing.location}, ${req.body.listing.country}`;

    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${location}`
    );

    if (response.data.length > 0) {
      newListing.geometry = {
        type: "Point",
        coordinates: [
          parseFloat(response.data[0].lon),
          parseFloat(response.data[0].lat),
        ],
      };
    }

    await newListing.save();

    req.flash("success", "Listing created 🎉");
    res.redirect("/listings");

  } catch (err) {
    console.log(err);
    req.flash("error", "Something went wrong ❌");
    res.redirect("/listings");
  }
});

// EDIT
app.get("/listings/:id/edit", isLoggedIn, isOwner, async (req, res) => {
  let listing = await Listing.findById(req.params.id);
  res.render("listings/edit", { listing });
});

// UPDATE
app.put("/listings/:id", isLoggedIn, isOwner, async (req, res) => {
  await Listing.findByIdAndUpdate(req.params.id, req.body.listing);
  res.redirect(`/listings/${req.params.id}`);
});

// DELETE
app.delete("/listings/:id", isLoggedIn, isOwner, async (req, res) => {
  await Listing.findByIdAndDelete(req.params.id);
  res.redirect("/listings");
});

// ❤️ WISHLIST
app.post("/wishlist/:id", isLoggedIn, async (req, res) => {
  const user = await User.findById(req.user._id);
  const id = req.params.id;

  if (!user.wishlist) user.wishlist = [];

  if (user.wishlist.includes(id)) {
    user.wishlist.pull(id);
  } else {
    user.wishlist.push(id);
  }

  await user.save();
  res.redirect(`/listings/${id}`);
});

// GET WISHLIST
app.get("/wishlist", isLoggedIn, async (req, res) => {
  const user = await User.findById(req.user._id).populate("wishlist");
  res.render("users/wishlist", { listings: user.wishlist });
});

// PROFILE
app.get("/profile", isLoggedIn, async (req, res) => {
  const user = await User.findById(req.user._id);
  const userListings = await Listing.find({ owner: req.user._id });

  res.render("users/profile", { user, userListings });
});

// REVIEWS
app.post("/listings/:id/reviews", isLoggedIn, async (req, res) => {
  let listing = await Listing.findById(req.params.id);

  let review = new Review(req.body.review);
  review.author = req.user._id;

  await review.save();

  listing.reviews.push(review);
  await listing.save();

  res.redirect(`/listings/${req.params.id}`);
});

// AUTH
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

app.post("/signup", async (req, res) => {
  let { username, email, password } = req.body;

  const newUser = new User({ email, username });
  const registeredUser = await User.register(newUser, password);

  req.login(registeredUser, () => {
    res.redirect("/");
  });
});

app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post("/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, res) => {
    req.flash("success", "Welcome back!");
    res.redirect("/");
  }
);

app.get("/logout", (req, res) => {
  req.logout(() => {
    req.flash("success", "Logged out");
    res.redirect("/");
  });
});

// SERVER
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});