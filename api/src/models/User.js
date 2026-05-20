const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true, index: true },
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null },
});

userSchema.set('toJSON', {
  // ET: Teisendusfunktsioon, mis eemaldab JSON-vastusest parooli räsi, et seda kunagi kliendile ei saadetaks.
  // RU: Функция преобразования, удаляющая хеш пароля из JSON-ответа, чтобы он никогда не попадал клиенту.
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
