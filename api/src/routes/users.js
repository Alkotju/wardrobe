const express = require('express');
const bcrypt = require('bcrypt');
const { body, param } = require('express-validator');

const User = require('../models/User');
const ClothingItem = require('../models/ClothingItem');
const Outfit = require('../models/Outfit');
const Collection = require('../models/Collection');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { runValidations } = require('../middleware/validators');
const { nextSequentialId } = require('../utils/sequentialId');
const { deleteFileSafe, deleteUserUploadDir } = require('../services/imageProcessor');

const router = express.Router();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const MAX_USERS = parseInt(process.env.MAX_USERS, 10) || 20;

// ET: GET / — admin-päring, mis tagastab kõik kasutajad koos igaühe rõivaesemete arvuga.
// RU: GET / — запрос администратора, возвращающий всех пользователей вместе с количеством вещей у каждого.
router.get('/', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const users = await User.find().lean();
    const counts = await ClothingItem.aggregate([
      { $group: { _id: '$owner', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
      users: users.map((u) => ({
        id: String(u._id),
        userId: u.userId,
        username: u.username,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        itemCount: countMap.get(String(u._id)) || 0,
      })),
    });
  } catch (err) { next(err); }
});

// ET: POST / — admin loob uue kasutaja; kontrollib kasutajalimiiti ning nime/e-posti unikaalsust.
// RU: POST / — администратор создаёт нового пользователя; проверяет лимит пользователей и уникальность имени/email.
router.post('/',
  requireAuth,
  requireAdmin,
  runValidations([
    body('username').isString().trim().isLength({ min: 3, max: 64 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 256 }),
    body('role').optional().isIn(['admin', 'user']),
  ]),
  async (req, res, next) => {
    try {
      const total = await User.countDocuments();
      if (total >= MAX_USERS) {
        return res.status(409).json({ error: `User limit reached (${MAX_USERS})` });
      }
      const existing = await User.findOne({
        $or: [
          { username: req.body.username.toLowerCase() },
          { email: req.body.email },
        ],
      });
      if (existing) return res.status(409).json({ error: 'username or email already taken' });

      const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
      const userId = await nextSequentialId('user');
      const user = await User.create({
        userId,
        username: req.body.username,
        email: req.body.email,
        passwordHash,
        role: req.body.role || 'user',
      });

      res.status(201).json({
        user: {
          id: String(user._id),
          userId: user.userId,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) { next(err); }
  }
);

// ET: DELETE /:id — admin kustutab kasutaja koos kõigi tema andmete ja failidega; viimast admini kustutada ei saa.
// RU: DELETE /:id — администратор удаляет пользователя со всеми его данными и файлами; последнего админа удалить нельзя.
router.delete('/:id',
  requireAuth,
  requireAdmin,
  runValidations([param('id').isMongoId()]),
  async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }
      const target = await User.findById(req.params.id);
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (target.role === 'admin') {
        const adminCount = await User.countDocuments({ role: 'admin' });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin' });
        }
      }

      const items = await ClothingItem.find({ owner: target._id });
      for (const it of items) {
        await deleteFileSafe(it.imageUrl);
        await deleteFileSafe(it.originalImageUrl);
      }
      await ClothingItem.deleteMany({ owner: target._id });
      await Outfit.deleteMany({ owner: target._id });
      await Collection.deleteMany({ owner: target._id });
      await deleteUserUploadDir(target._id);

      await target.deleteOne();
      res.json({ message: 'deleted' });
    } catch (err) { next(err); }
  }
);

// ET: GET /:id/items — admin-päring, mis tagastab konkreetse kasutaja kõik rõivaesemed.
// RU: GET /:id/items — запрос администратора, возвращающий все вещи конкретного пользователя.
router.get('/:id/items',
  requireAuth,
  requireAdmin,
  runValidations([param('id').isMongoId()]),
  async (req, res, next) => {
    try {
      const items = await ClothingItem.find({ owner: req.params.id }).sort({ createdAt: -1 });
      res.json({ items });
    } catch (err) { next(err); }
  }
);

module.exports = router;
