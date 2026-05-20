const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const { runValidations } = require('../middleware/validators');
const { fetchForecast, fetchHourly, geocode } = require('../services/weatherService');

const router = express.Router();

const geocodeLimiter = rateLimit({
  windowMs: 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global',
  message: { error: 'Geocode rate limit exceeded, retry in a moment' },
});

// ET: GET / — tagastab koordinaatide järgi kuni 3 päeva ilmaennustuse (min/max temp, sademed, sümbol).
// RU: GET / — возвращает по координатам прогноз погоды до 3 дней (мин/макс температура, осадки, символ).
router.get('/',
  requireAuth,
  runValidations([
    query('lat').isFloat({ min: -90, max: 90 }),
    query('lon').isFloat({ min: -180, max: 180 }),
  ]),
  async (req, res, next) => {
    try {
      const lat = Number(req.query.lat).toFixed(4);
      const lon = Number(req.query.lon).toFixed(4);
      const days = await fetchForecast(lat, lon);
      res.json({ days });
    } catch (err) { next(err); }
  }
);

// ET: GET /hourly — tagastab tunnipõhise ilmaennustuse (vaikimisi 24 h) laiendatud väljadega.
// RU: GET /hourly — возвращает почасовой прогноз погоды (по умолчанию 24 ч) с расширенными полями.
router.get('/hourly',
  requireAuth,
  runValidations([
    query('lat').isFloat({ min: -90, max: 90 }),
    query('lon').isFloat({ min: -180, max: 180 }),
    query('hours').optional().isInt({ min: 1, max: 72 }).toInt(),
  ]),
  async (req, res, next) => {
    try {
      const lat = Number(req.query.lat).toFixed(4);
      const lon = Number(req.query.lon).toFixed(4);
      const hours = req.query.hours || 24;
      const data = await fetchHourly(lat, lon, hours);
      res.json({ hours: data });
    } catch (err) { next(err); }
  }
);

// ET: GET /geocode — otsib kohanime järgi koordinaadid (geokodeerimine), kiiruspiiranguga 1 päring sekundis.
// RU: GET /geocode — ищет координаты по названию места (геокодирование) с ограничением 1 запрос в секунду.
router.get('/geocode',
  requireAuth,
  runValidations([
    query('q').isString().trim().isLength({ min: 2, max: 200 }),
  ]),
  geocodeLimiter,
  async (req, res, next) => {
    try {
      const results = await geocode(req.query.q);
      res.json(results);
    } catch (err) { next(err); }
  }
);

module.exports = router;
