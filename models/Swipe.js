const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  profileId: { type: Number, required: true },
  direction: { type: String, required: true, enum: ['like', 'pass', 'super'] },
  timestamp: { type: Date, default: Date.now }
});

swipeSchema.index({ email: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.model('Swipe', swipeSchema);
