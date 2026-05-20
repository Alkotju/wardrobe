const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['travel', 'moving', 'other'], default: 'other' },
  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ClothingItem' }],
}, { timestamps: true });

collectionSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model('Collection', collectionSchema);
