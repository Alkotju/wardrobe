const mongoose = require('mongoose');

const outfitSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  items: [{
    _id: false,
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClothingItem', required: true },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    zIndex: { type: Number, default: 0 },
  }],
}, { timestamps: true });

outfitSchema.index({ owner: 1, updatedAt: -1 });

module.exports = mongoose.model('Outfit', outfitSchema);
