const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const User = require('../models/User');
const { runValidations } = require('../middleware/validators');

const router = express.Router();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

// ET: POST /login — kontrollib kasutajanime ja parooli, tagastab edu korral JWT-märgi ja kasutaja andmed.
// RU: POST /login — проверяет имя пользователя и пароль, при успехе возвращает JWT-токен и данные пользователя.
router.post('/login',
  loginLimiter,
  runValidations([
    body('username').isString().trim().notEmpty(),
    body('password').isString().notEmpty(),
  ]),
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username: username.toLowerCase() });

      const hash = user ? user.passwordHash : DUMMY_HASH;
      const ok = await bcrypt.compare(password, hash);
      if (!user || !ok) return res.status(401).json({ error: 'Invalid credentials' });

      user.lastLogin = new Date();
      await user.save();

      const token = jwt.sign(
        { sub: String(user._id), username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRY || '24h' }
      );

      res.json({
        token,
        user: { id: String(user._id), username: user.username, role: user.role },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ET: POST /logout — väljalogimise lõpp-punkt; serveris seisu pole, vastab lihtsalt staatusega 204.
// RU: POST /logout — конечная точка выхода; серверного состояния нет, просто отвечает статусом 204.
router.post('/logout', (_req, res) => {
  res.status(204).end();
});

module.exports = router;
