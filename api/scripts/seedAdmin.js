require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { nextSequentialId } = require('../src/utils/sequentialId');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

// EN: Startup script that creates the initial admin user if no such user exists yet in the database.
// ET: Käivitusskript, mis loob esmase admin-kasutaja, kui sellist veel andmebaasis pole.
// RU: Стартовый скрипт, создающий первоначального пользователя-администратора, если такого ещё нет в базе.
(async () => {
  try {
    await connectDB(process.env.MONGO_URI);

    const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD;

    const existing = await User.findOne({ username });
    if (existing) {
      console.log(`User already exists: ${existing.username} (role=${existing.role})`);
      await mongoose.disconnect();
      process.exit(0);
    }

    if (!password) {
      console.error('SEED_ADMIN_PASSWORD env var is required');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = await nextSequentialId('user');
    const user = await User.create({
      userId,
      username,
      email,
      passwordHash,
      role: 'admin',
    });

    console.log(`Created admin: ${user.username} (userId=${user.userId})`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
