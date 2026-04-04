const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now }
});

likeSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);
