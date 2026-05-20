const mongoose = require('mongoose');

const clothingItemSchema = new mongoose.Schema({
  itemId: { type: String, unique: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: {
    parent: { type: String, default: '' },
    child: { type: String, default: '' },
  },
  color: {
    label: { type: String, default: '' },
    hex: { type: String, default: '' },
  },
  material: { type: String, default: '' },
  waterproof: { type: Boolean, default: false },
  windproof: { type: Boolean, default: false },
  comment: { type: String, default: '', maxlength: 500 },
  imageUrl: { type: String, default: null },
  originalImageUrl: { type: String, default: null },
}, { timestamps: true });

clothingItemSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('ClothingItem', clothingItemSchema);
