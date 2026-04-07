const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// ⭐ IMPORTANT FIX
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
});

// ⭐ FORCE FIX
userSchema.plugin(passportLocalMongoose.default || passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);