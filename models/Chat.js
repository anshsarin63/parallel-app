const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  from: { type: String, required: true, index: true },
  to: { type: String, required: true, index: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// Compound index for efficient chat history queries
chatSchema.index({ from: 1, to: 1 });

module.exports = mongoose.model('Chat', chatSchema);
