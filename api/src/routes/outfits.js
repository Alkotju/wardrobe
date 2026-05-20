const express = require('express');
const { body, param } = require('express-validator');

const Outfit = require('../models/Outfit');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { runValidations } = require('../middleware/validators');
const { assertItemsOwned } = require('../utils/itemOwnership');

const router = express.Router();

const itemEntryValidation = body('items.*.itemId').isMongoId();

// EN: GET / — returns all outfits of the logged-in user, sorted by last modification date.
// ET: GET / — tagastab sisselogitud kasutaja kõik komplektid, järjestatuna viimase muutmise järgi.
// RU: GET / — возвращает все образы текущего пользователя, отсортированные по дате последнего изменения.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const outfits = await Outfit.find({ owner: req.user.id }).sort({ updatedAt: -1 });
    res.json({ outfits });
  } catch (err) { next(err); }
});

// EN: POST / — creates a new outfit; checks that all items in the outfit belong to the user.
// ET: POST / — loob uue komplekti; kontrollib, et kõik komplekti esemed kuuluvad kasutajale.
// RU: POST / — создаёт новый образ; проверяет, что все вещи образа принадлежат пользователю.
router.post('/',
  requireAuth,
  runValidations([
    body('name').isString().trim().notEmpty().isLength({ max: 200 }),
    body('items').optional().isArray(),
    itemEntryValidation,
  ]),
  async (req, res, next) => {
    try {
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      await assertItemsOwned(items.map((i) => i.itemId), req.user);
      const outfit = await Outfit.create({
        owner: req.user.id,
        name: req.body.name,
        items,
      });
      res.status(201).json({ outfit });
    } catch (err) { next(err); }
  }
);

// EN: PUT /:id — updates an existing outfit (name, items, and their layout) after an ownership check.
// ET: PUT /:id — uuendab olemasolevat komplekti (nimi, esemed ja nende paigutus) pärast omandiõiguse kontrolli.
// RU: PUT /:id — обновляет существующий образ (имя, вещи и их расположение) после проверки права владения.
router.put('/:id',
  requireAuth,
  runValidations([
    param('id').isMongoId(),
    body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
    body('items').optional().isArray(),
    itemEntryValidation,
  ]),
  requireOwnership(Outfit),
  async (req, res, next) => {
    try {
      const outfit = req.resource;
      if (req.body.name != null) outfit.name = req.body.name;
      if (Array.isArray(req.body.items)) {
        await assertItemsOwned(req.body.items.map((i) => i.itemId), req.user);
        outfit.items = req.body.items;
      }
      await outfit.save();
      res.json({ outfit });
    } catch (err) { next(err); }
  }
);

// EN: DELETE /:id — deletes an outfit; the clothing items in it remain in the wardrobe.
// ET: DELETE /:id — kustutab komplekti; selle koosseisus olevad rõivaesemed jäävad garderoobi alles.
// RU: DELETE /:id — удаляет образ; входящие в него вещи остаются в гардеробе.
router.delete('/:id',
  requireAuth,
  runValidations([param('id').isMongoId()]),
  requireOwnership(Outfit),
  async (req, res, next) => {
    try {
      await req.resource.deleteOne();
      res.json({ message: 'deleted' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
