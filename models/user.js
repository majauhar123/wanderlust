const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// ✅ FIXED IMPORT (IMPORTANT)
const passportLocalMongoose = require("passport-local-mongoose").default || require("passport-local-mongoose");

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
  },

  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
  ],
});

// ✅ FIXED PLUGIN
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);