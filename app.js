require("dotenv").config();

const express = require("express");
const app = express();
const mongoose = require("mongoose");

const Listing = require("./models/listing.js");
const Review = require("./models/review.js");
const User = require("./models/user.js");

const path = require("path");
const methodOverride = require("method-override");

// ⭐ STATIC (IMPORTANT FOR RENDER)
app.use(express.static(path.join(__dirname, "public")));

// ⭐ MULTER
const multer = require("multer");
const { storage } = require("./cloudConfig");
const upload = multer({ storage });

// ⭐ AUTH
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");

// ⭐ AXIOS
const axios = require("axios");

// ================= ENV =================
const MONGO_URL = process.env.MONGO_URL;
const SECRET = process.env.SESSION_SECRET || "fallbacksecret";

// ================= DB =================
async function main() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("connected to DB ✅");
  } catch (err) {
    console.log("DB ERROR ❌", err);
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
    req.flash("error", "Login required!");
    return res.redirect("/login");
  }
  next();
}

async function isOwner(req, res, next) {
  let listing = await Listing.findById(req.params.id);
  if (!listing.owner.equals(req.user._id)) {
    return res.send("Not owner ❌");
  }
  next();
}

// ================= ROUTES =================

// ROOT
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// INDEX + SEARCH + FILTER
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

// CREATE (MAP + IMAGE)
app.post("/listings", isLoggedIn, upload.single("listing[image]"), async (req, res) => {
  try {
    const newListing = new Listing(req.body.listing);

    newListing.owner = req.user._id;

    // ⭐ IMAGE
    if (req.file) {
      newListing.image = req.file.path;
    }

    // ⭐ MAP (GEOCODING)
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
    } else {
      newListing.geometry = {
        type: "Point",
        coordinates: [77.2090, 28.6139],
      };
    }

    await newListing.save();

    req.flash("success", "Listing created 🎉");
    res.redirect("/listings");

  } catch (err) {
    console.log(err);
    res.send("Error ❌");
  }
});

// EDIT
app.get("/listings/:id/edit", isLoggedIn, isOwner, async (req, res) => {
  let listing = await Listing.findById(req.params.id);
  res.render("listings/edit.ejs", { listing });
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

// ================= ❤️ WISHLIST =================
app.post("/listings/:id/wishlist", isLoggedIn, async (req, res) => {
  const user = await User.findById(req.user._id);
  const id = req.params.id;

  if (user.wishlist.includes(id)) {
    user.wishlist.pull(id);
  } else {
    user.wishlist.push(id);
  }

  await user.save();
  res.redirect(`/listings/${id}`);
});

// ================= REVIEWS =================
app.post("/listings/:id/reviews", isLoggedIn, async (req, res) => {
  let listing = await Listing.findById(req.params.id);

  let review = new Review(req.body.review);
  review.author = req.user._id;

  await review.save();

  listing.reviews.push(review);
  await listing.save();

  res.redirect(`/listings/${req.params.id}`);
});

// ================= AUTH =================
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

app.post("/signup", async (req, res) => {
  let { username, email, password } = req.body;

  const newUser = new User({ email, username });
  const registeredUser = await User.register(newUser, password);

  req.login(registeredUser, () => {
    res.redirect("/listings");
  });
});

app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post("/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
  }),
  (req, res) => {
    res.redirect("/listings");
  }
);

app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/listings");
  });
});

// ================= SERVER =================
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT} 🚀`);
});