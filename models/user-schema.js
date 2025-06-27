const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
  fullname: {
    type: String,
    required: [true, "Full name is required"],
    trim: true,
    minlength: [4, "Full name must be at least 4 characters long"],
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    default: null,
    sparse: true,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
  },
  profilePhoto: {
    type: String,
    default: null,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
  }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

module.exports = User;
