const express = require('express');
const { body, param } = require('express-validator');

const Collection = require('../models/Collection');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { runValidations } = require('../middleware/validators');
const { assertItemsOwned } = require('../utils/itemOwnership');

const router = express.Router();

// EN: GET / — returns all collections of the logged-in user, sorted by last modification date.
// ET: GET / — tagastab sisselogitud kasutaja kõik kollektsioonid, järjestatuna viimase muutmise järgi.
// RU: GET / — возвращает все коллекции текущего пользователя, отсортированные по дате последнего изменения.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const collections = await Collection.find({ owner: req.user.id }).sort({ updatedAt: -1 });
    res.json({ collections });
  } catch (err) { next(err); }
});

// EN: POST / — creates a new collection; checks that the added items belong to the user.
// ET: POST / — loob uue kollektsiooni; kontrollib, et lisatavad esemed kuuluvad kasutajale.
// RU: POST / — создаёт новую коллекцию; проверяет, что добавляемые вещи принадлежат пользователю.
router.post('/',
  requireAuth,
  runValidations([
    body('name').isString().trim().notEmpty().isLength({ max: 200 }),
    body('type').optional().isIn(['travel', 'moving', 'other']),
    body('items').optional().isArray(),
    body('items.*').optional().isMongoId(),
  ]),
  async (req, res, next) => {
    try {
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      await assertItemsOwned(items, req.user);
      const collection = await Collection.create({
        owner: req.user.id,
        name: req.body.name,
        type: req.body.type || 'other',
        items,
      });
      res.status(201).json({ collection });
    } catch (err) { next(err); }
  }
);

// EN: PUT /:id — updates an existing collection (name, type, items) after an ownership check.
// ET: PUT /:id — uuendab olemasolevat kollektsiooni (nimi, tüüp, esemed) pärast omandiõiguse kontrolli.
// RU: PUT /:id — обновляет существующую коллекцию (имя, тип, вещи) после проверки права владения.
router.put('/:id',
  requireAuth,
  runValidations([
    param('id').isMongoId(),
    body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
    body('type').optional().isIn(['travel', 'moving', 'other']),
    body('items').optional().isArray(),
    body('items.*').optional().isMongoId(),
  ]),
  requireOwnership(Collection),
  async (req, res, next) => {
    try {
      const collection = req.resource;
      if (req.body.name != null) collection.name = req.body.name;
      if (req.body.type != null) collection.type = req.body.type;
      if (Array.isArray(req.body.items)) {
        await assertItemsOwned(req.body.items, req.user);
        collection.items = req.body.items;
      }
      await collection.save();
      res.json({ collection });
    } catch (err) { next(err); }
  }
);

// EN: DELETE /:id — deletes a collection; the clothing items inside it remain in the wardrobe.
// ET: DELETE /:id — kustutab kollektsiooni; selle sees olevad rõivaesemed jäävad garderoobi alles.
// RU: DELETE /:id — удаляет коллекцию; входящие в неё вещи остаются в гардеробе.
router.delete('/:id',
  requireAuth,
  runValidations([param('id').isMongoId()]),
  requireOwnership(Collection),
  async (req, res, next) => {
    try {
      await req.resource.deleteOne();
      res.json({ message: 'deleted' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
