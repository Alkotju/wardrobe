require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const { cleanupOrphanUploads } = require('./src/services/imageProcessor');

const authRoutes = require('./src/routes/auth');
const itemsRoutes = require('./src/routes/items');
const outfitsRoutes = require('./src/routes/outfits');
const collectionsRoutes = require('./src/routes/collections');
const weatherRoutes = require('./src/routes/weather');
const usersRoutes = require('./src/routes/users');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is required');
  process.exit(1);
}

const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && !process.env.FRONTEND_ORIGIN) {
  console.error('FATAL: FRONTEND_ORIGIN env var is required in production');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || (IS_PROD ? false : true),
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined'));

app.use('/uploads', express.static(UPLOAD_DIR, {
  index: false,
  fallthrough: true,
  maxAge: '7d',
}));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/outfits', outfitsRoutes);
app.use('/api/collections', collectionsRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/users', usersRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

const ORPHAN_INTERVAL_MS = parseInt(process.env.ORPHAN_CLEANUP_INTERVAL_MS, 10)
  || 15 * 60 * 1000;
const ORPHAN_MAX_AGE_MS = parseInt(process.env.ORPHAN_MAX_AGE_MS, 10)
  || 60 * 60 * 1000;

// ET: Käivitab perioodilise taustaülesande, mis koristab orvuks jäänud üleslaadimisfailid.
// RU: Запускает периодическую фоновую задачу, которая очищает осиротевшие файлы загрузок.
function startOrphanReaper() {
  // ET: Üks koristustsükkel — käivitab orvuks jäänud failide eemaldaja ja logib võimaliku vea.
  // RU: Один цикл очистки — запускает удаление осиротевших файлов и логирует возможную ошибку.
  const tick = () => cleanupOrphanUploads({ maxAgeMs: ORPHAN_MAX_AGE_MS })
    .catch((err) => console.error('orphan cleanup failed:', err));
  tick();
  setInterval(tick, ORPHAN_INTERVAL_MS).unref();
}

connectDB(process.env.MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on :${PORT}`);
    });
    startOrphanReaper();
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
