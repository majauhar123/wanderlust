const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
  },

  description: String,

  // ⭐ MULTIPLE IMAGES (NEW)
  images: [
    {
      url: String,
      filename: String,
    },
  ],

  price: Number,
  location: String,
  country: String,

  // ⭐ OWNER
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  // ⭐ CATEGORY
  category: {
    type: String,
    enum: ["Beach", "Mountain", "City", "Farm"],
    default: "Beach",
  },

  // ⭐ MAP
  geometry: {
    type: {
      type: String,
      enum: ["Point"],
    },
    coordinates: {
      type: [Number],
    },
  },

  // ⭐ REVIEWS
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
});

module.exports = mongoose.model("Listing", listingSchema);