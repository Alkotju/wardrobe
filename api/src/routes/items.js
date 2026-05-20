const express = require('express');
const { body, query, param } = require('express-validator');

const ClothingItem = require('../models/ClothingItem');
const Outfit = require('../models/Outfit');
const Collection = require('../models/Collection');
const upload = require('../middleware/upload');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { runValidations } = require('../middleware/validators');
const { nextSequentialId } = require('../utils/sequentialId');
const { removeBackground, deleteFileSafe, analyzeImage, commitStagedImage } = require('../services/imageProcessor');

const router = express.Router();

// EN: Converts a multipart-form boolean string ("true"/"false"/"on") into a real JS boolean value.
// ET: Teisendab multipart-vormi tõeväärtuse stringi ("true"/"false"/"on") päris JS-i boolean-väärtuseks.
// RU: Преобразует строковое булево значение из multipart-формы ("true"/"false"/"on") в настоящий boolean JS.
function coerceBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'off' || s === 'no' || s === '') return false;
  }
  return undefined;
}

// EN: Escapes regular-expression special characters so user input can be safely used in a RegExp search.
// ET: Varjestab regulaaravaldise erimärgid, et kasutaja sisendit saaks ohutult RegExp-otsingus kasutada.
// RU: Экранирует спецсимволы регулярного выражения, чтобы ввод пользователя можно было безопасно использовать в RegExp-поиске.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// EN: Parses a form field that may be a JSON string or already an object; returns the fallback value on error.
// ET: Parsib vormivälja, mis võib olla JSON-string või juba objekt; vea korral tagastab varuväärtuse.
// RU: Разбирает поле формы, которое может быть JSON-строкой или уже объектом; при ошибке возвращает запасное значение.
function parseJsonField(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// EN: Builds a MongoDB filter from the query parameters (color, category, material, search) to find clothing items.
// ET: Koostab päringuparameetritest (värv, kategooria, materjal, otsing) MongoDB filtri rõivaesemete leidmiseks.
// RU: Строит из параметров запроса (цвет, категория, материал, поиск) фильтр MongoDB для выборки вещей.
function buildFilter(req) {
  const filter = {};
  filter.owner = (req.user.role === 'admin' && req.query.userId)
    ? req.query.userId
    : req.user.id;

  const andClauses = [];
  if (req.query.color) {
    andClauses.push({
      $or: [
        { 'color.label': new RegExp(escapeRegex(req.query.color), 'i') },
        { 'color.hex': String(req.query.color).toLowerCase() },
      ],
    });
  }
  if (req.query.category) {
    andClauses.push({
      $or: [
        { 'category.parent': new RegExp(escapeRegex(req.query.category), 'i') },
        { 'category.child': new RegExp(escapeRegex(req.query.category), 'i') },
      ],
    });
  }
  if (andClauses.length === 1) {
    Object.assign(filter, andClauses[0]);
  } else if (andClauses.length > 1) {
    filter.$and = andClauses;
  }
  if (req.query.material) filter.material = new RegExp(escapeRegex(req.query.material), 'i');
  if (req.query.search) filter.name = new RegExp(escapeRegex(req.query.search), 'i');
  return filter;
}

// EN: GET / — returns the user's clothing items, applying optional filters (color, category, material, search).
// ET: GET / — tagastab kasutaja rõivaesemed, rakendades valikulisi filtreid (värv, kategooria, materjal, otsing).
// RU: GET / — возвращает вещи пользователя с применением необязательных фильтров (цвет, категория, материал, поиск).
router.get('/',
  requireAuth,
  runValidations([
    query('color').optional().isString(),
    query('category').optional().isString(),
    query('material').optional().isString(),
    query('search').optional().isString(),
    query('userId').optional().isMongoId(),
  ]),
  async (req, res, next) => {
    try {
      const items = await ClothingItem.find(buildFilter(req)).sort({ createdAt: -1 });
      res.json({ items });
    } catch (err) { next(err); }
  }
);

// EN: POST / — creates a new clothing item; removes the image background if needed or uses a previously prepared image.
// ET: POST / — loob uue rõivaeseme; vajadusel eemaldab pildilt tausta või kasutab varem ettevalmistatud pilti.
// RU: POST / — создаёт новую вещь; при необходимости удаляет фон с фото или использует ранее подготовленное изображение.
router.post('/',
  requireAuth,
  upload.single('image'),
  runValidations([
    body('name').isString().trim().notEmpty().isLength({ max: 200 }),
    body('material').optional().isString().isLength({ max: 200 }),
    body('waterproof').optional().isString(),
    body('windproof').optional().isString(),
    body('comment').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
    body('stagedImageUrl').optional().isString(),
    body('stagedOriginalImageUrl').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const itemId = await nextSequentialId('item');
      const category = parseJsonField(req.body.category, { parent: '', child: '' });
      const color = parseJsonField(req.body.color, { label: '', hex: '' });

      let imageUrl = null;
      let originalImageUrl = null;
      if (req.file) {
        const out = await removeBackground(req.file.buffer, req.file.mimetype, req.user.id, itemId);
        imageUrl = out.imageUrl;
        originalImageUrl = out.originalUrl;
      } else if (req.body.stagedImageUrl) {
        imageUrl = await commitStagedImage({
          stagedUrl: req.body.stagedImageUrl,
          userId: req.user.id,
          newBasename: `${itemId}.png`,
        });
        originalImageUrl = await commitStagedImage({
          stagedUrl: req.body.stagedOriginalImageUrl,
          userId: req.user.id,
        });
      }

      const item = await ClothingItem.create({
        itemId,
        owner: req.user.id,
        name: req.body.name,
        category,
        color,
        material: req.body.material || '',
        waterproof: coerceBool(req.body.waterproof) === true,
        windproof:  coerceBool(req.body.windproof)  === true,
        comment: req.body.comment || '',
        imageUrl,
        originalImageUrl,
      });

      res.status(201).json({ item });
    } catch (err) { next(err); }
  }
);

// EN: PUT /:id — updates an existing clothing item; with a new image, deletes the old one and processes the new one.
// ET: PUT /:id — uuendab olemasolevat rõivaeset; uue pildi korral kustutab vana ja töötleb uue.
// RU: PUT /:id — обновляет существующую вещь; при новом фото удаляет старое и обрабатывает новое.
router.put('/:id',
  requireAuth,
  runValidations([param('id').isMongoId()]),
  requireOwnership(ClothingItem),
  upload.single('image'),
  runValidations([
    body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
    body('material').optional().isString().isLength({ max: 200 }),
    body('waterproof').optional().isString(),
    body('windproof').optional().isString(),
    body('comment').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
    body('stagedImageUrl').optional().isString(),
    body('stagedOriginalImageUrl').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const item = req.resource;

      if (req.body.name != null) item.name = req.body.name;
      if (req.body.material != null) item.material = req.body.material;
      if (req.body.category != null) item.category = parseJsonField(req.body.category, item.category);
      if (req.body.color != null) item.color = parseJsonField(req.body.color, item.color);
      if (req.body.comment != null) item.comment = req.body.comment;
      const wp = coerceBool(req.body.waterproof);
      if (wp !== undefined) item.waterproof = wp;
      const wd = coerceBool(req.body.windproof);
      if (wd !== undefined) item.windproof = wd;

      if (req.file) {
        await deleteFileSafe(item.imageUrl);
        await deleteFileSafe(item.originalImageUrl);
        const out = await removeBackground(req.file.buffer, req.file.mimetype, String(item.owner), item.itemId);
        item.imageUrl = out.imageUrl;
        item.originalImageUrl = out.originalUrl;
      } else if (req.body.stagedImageUrl) {
        await deleteFileSafe(item.imageUrl);
        await deleteFileSafe(item.originalImageUrl);
        item.imageUrl = await commitStagedImage({
          stagedUrl: req.body.stagedImageUrl,
          userId: String(item.owner),
          newBasename: `${item.itemId}.png`,
        });
        item.originalImageUrl = await commitStagedImage({
          stagedUrl: req.body.stagedOriginalImageUrl,
          userId: String(item.owner),
        });
      }

      await item.save();
      res.json({ item });
    } catch (err) { next(err); }
  }
);

// EN: DELETE /:id — deletes a clothing item, its image files, and references to it from outfits and collections.
// ET: DELETE /:id — kustutab rõivaeseme, selle pildifailid ja eemaldab viited komplektidest ja kollektsioonidest.
// RU: DELETE /:id — удаляет вещь, её файлы изображений и ссылки на неё из образов и коллекций.
router.delete('/:id',
  requireAuth,
  runValidations([param('id').isMongoId()]),
  requireOwnership(ClothingItem),
  async (req, res, next) => {
    try {
      const item = req.resource;
      await deleteFileSafe(item.imageUrl);
      await deleteFileSafe(item.originalImageUrl);
      await item.deleteOne();
      await Outfit.updateMany(
        { 'items.itemId': item._id },
        { $pull: { items: { itemId: item._id } } }
      );
      await Collection.updateMany(
        { items: item._id },
        { $pull: { items: item._id } }
      );
      res.json({ message: 'deleted' });
    } catch (err) { next(err); }
  }
);

// EN: POST /upload — removes the image background for a preview and analyzes the color, without saving a clothing item.
// ET: POST /upload — eemaldab pildilt tausta eelvaateks ja analüüsib värvi, ilma rõivaeset salvestamata.
// RU: POST /upload — удаляет фон с изображения для предпросмотра и анализирует цвет, не сохраняя вещь.
router.post('/upload',
  requireAuth,
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'image file is required' });
      const tempId = `preview_${Date.now()}`;
      const out = await removeBackground(req.file.buffer, req.file.mimetype, req.user.id, tempId);

      let analysis = null;
      try {
        analysis = await analyzeImage(out.processedBuffer);
      } catch (err) {
        console.warn('analyzeImage failed during preview upload:', err.message);
      }

      res.json({
        imageUrl: out.imageUrl,
        originalImageUrl: out.originalUrl,
        analysis,
      });
    } catch (err) { next(err); }
  }
);

// EN: POST /analyze — analyzes the color of an uploaded image without removing the background or saving anything.
// ET: POST /analyze — analüüsib üleslaaditud pildi värvi ilma tausta eemaldamata või midagi salvestamata.
// RU: POST /analyze — анализирует цвет загруженного изображения без удаления фона и без сохранения.
router.post('/analyze',
  requireAuth,
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'image file is required' });
      const analysis = await analyzeImage(req.file.buffer);
      res.json(analysis);
    } catch (err) { next(err); }
  }
);

module.exports = router;
