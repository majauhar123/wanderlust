const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
  },

  description: String,

  image: {
    type: String,
    default:
      "https://images.unsplash.com/photo-1625505826533-5c80aca7d157",
    set: (v) =>
      v === ""
        ? "https://images.unsplash.com/photo-1625505826533-5c80aca7d157"
        : v,
  },

  price: Number,
  location: String,
  country: String,

  // ⭐ OWNER ADD (IMPORTANT)
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  
  category: {
  type: String,
  enum: ["Beach", "Mountain", "City", "Farm"],
  default: "Beach",
},

  // ⭐ REVIEWS FIX
  reviews: [
    {
      type: Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
});

module.exports = mongoose.model("Listing", listingSchema);