const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  dob: String,
  gender: String,
  stage: String,
  city: String,
  lat: Number,
  lng: Number,
  interests: [String],
  energy: String,
  bio: String,
  relocated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
