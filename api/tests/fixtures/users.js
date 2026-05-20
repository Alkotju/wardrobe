// User fixtures + JWT helpers. Centralized so every integration test gets
// consistent shapes (same fields admin code expects on the JWT payload).
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../../src/models/User');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 4;

// Process-local counter so each createUser produces a distinct userId — the
// User schema has unique:true on userId, so a hard-coded "0000001" let only
// one user per process. Each test's beforeEach wipes the DB but cannot reset
// this counter; that's fine because the value just needs to be unique.
let _userIdCounter = 0;

async function createUser({ username, email, password = 'hunter2hunter2', role = 'user' } = {}) {
  username = username || 'aleks_' + Math.random().toString(36).slice(2, 8);
  email = email || `${username}@example.com`;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  _userIdCounter += 1;
  const user = await User.create({
    userId: String(_userIdCounter).padStart(7, '0'),
    username,
    email,
    passwordHash,
    role,
  });
  return { user, password };
}

function signTokenFor(user) {
  return jwt.sign(
    { sub: String(user._id), username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { createUser, signTokenFor, authHeader };
