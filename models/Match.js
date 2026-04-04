const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  profileId: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
});

matchSchema.index({ email: 1, profileId: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
