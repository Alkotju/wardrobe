// Builds the Express app exactly like server.js, but WITHOUT:
//   - calling process.exit on missing JWT_SECRET (tests/setup/env.js sets it)
//   - connecting to MongoDB (the test harness owns that)
//   - calling app.listen
//
// Keeping this in lock-step with server.js is the point: any new route the
// real server mounts should be mounted here too. The duplication is small
// and avoided refactoring server.js, per the "don't change prod for tests"
// rule. If routes grow, extract a buildApp() in server.js and reuse it here.

const path = require('path');
const express = require('express');
const cors = require('cors');

const errorHandler = require('../../src/middleware/errorHandler');
const authRoutes = require('../../src/routes/auth');
const itemsRoutes = require('../../src/routes/items');
const outfitsRoutes = require('../../src/routes/outfits');
const collectionsRoutes = require('../../src/routes/collections');
const weatherRoutes = require('../../src/routes/weather');
const usersRoutes = require('../../src/routes/users');

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
  app.use('/uploads', express.static(UPLOAD_DIR, { index: false, fallthrough: true }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/items', itemsRoutes);
  app.use('/api/outfits', outfitsRoutes);
  app.use('/api/collections', collectionsRoutes);
  app.use('/api/weather', weatherRoutes);
  app.use('/api/users', usersRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}

module.exports = { buildApp };
