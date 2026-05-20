const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const sharp = require('sharp');

const { removeBackground: imglyRemoveBackground } = require('@imgly/background-removal-node');

const { detectColor } = require('./colorAnalyzer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');

const MAX_DIMENSION = parseInt(process.env.IMAGE_MAX_DIMENSION, 10) || 1024;

// EN: Ensures the user's upload directory exists (creates it if needed) and returns its path.
// ET: Tagab kasutaja üleslaadimiskausta olemasolu (loob vajadusel) ja tagastab selle tee.
// RU: Гарантирует существование папки загрузок пользователя (создаёт при необходимости) и возвращает её путь.
async function ensureUserDir(userId) {
  const dir = path.join(UPLOAD_DIR, String(userId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// EN: Normalizes any supported image format into PNG bytes, fixes EXIF rotation, and shrinks oversized images.
// ET: Normaliseerib iga toetatud pildivormingu PNG-baitideks, parandab EXIF-pööramise ja vähendab liiga suuri pilte.
// RU: Нормализует любой поддерживаемый формат изображения в PNG-байты, исправляет EXIF-поворот и уменьшает слишком большие изображения.
async function toPngBuffer(buffer, mimetype) {
  let pipeline = sharp(buffer).rotate();
  const meta = await sharp(buffer).metadata();
  if ((meta.width || 0) > MAX_DIMENSION || (meta.height || 0) > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
  } else if (mimetype === 'image/png') {
    return buffer;
  }
  return pipeline.png({ compressionLevel: 6 }).toBuffer();
}

// EN: Removes the image background with an ONNX model, saves both the original and the processed PNG, and returns their paths/URLs.
// ET: Eemaldab pildilt ONNX-mudeliga tausta, salvestab nii originaali kui ka töödeldud PNG-i ja tagastab nende teed/URL-id.
// RU: Удаляет фон с изображения с помощью ONNX-модели, сохраняет и оригинал, и обработанный PNG, возвращая их пути/URL.
async function removeBackground(buffer, mimetype, userId, itemId) {
  const dir = await ensureUserDir(userId);
  const ts = Date.now();

  const pngBuffer = await toPngBuffer(buffer, mimetype);

  const originalName = `original_${ts}_${crypto.randomUUID()}.png`;
  const processedName = `${itemId}.png`;

  const originalAbs = path.join(dir, originalName);
  const processedAbs = path.join(dir, processedName);

  const pngBlob = new Blob([pngBuffer], { type: 'image/png' });
  const blob = await imglyRemoveBackground(pngBlob);
  const processedBuffer = Buffer.from(await blob.arrayBuffer());

  await fs.writeFile(originalAbs, pngBuffer);
  await fs.writeFile(processedAbs, processedBuffer);

  const originalUrl = `/uploads/${String(userId)}/${originalName}`;
  const imageUrl = `/uploads/${String(userId)}/${processedName}`;

  return {
    originalPath: originalAbs,
    processedPath: processedAbs,
    originalUrl,
    imageUrl,
    processedBuffer,
  };
}

// EN: Deletes a file safely — refuses to act outside UPLOAD_DIR and ignores a missing-file error.
// ET: Kustutab faili turvaliselt — keeldub midagi tegemast väljaspool UPLOAD_DIR ja eirab puuduva faili viga.
// RU: Безопасно удаляет файл — отказывается работать вне UPLOAD_DIR и игнорирует ошибку отсутствующего файла.
async function deleteFileSafe(urlOrPath) {
  if (!urlOrPath) return;
  let abs = urlOrPath;
  if (urlOrPath.startsWith('/uploads/')) {
    abs = path.join(UPLOAD_DIR, urlOrPath.replace(/^\/uploads\//, ''));
  }
  const resolved = path.resolve(abs);
  const root = path.resolve(UPLOAD_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    console.warn('Refused to delete file outside UPLOAD_DIR', resolved);
    return;
  }
  try {
    await fs.unlink(resolved);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to delete file', resolved, err.message);
    }
  }
}

// EN: Commits a previously prepared (preview) image to its permanent location, skipping the slow background removal.
// ET: Kinnitab varem ettevalmistatud (eelvaate) pildi püsivasse kohta, jättes vahele aeglase tausta eemaldamise.
// RU: Закрепляет ранее подготовленное (для предпросмотра) изображение на постоянное место, пропуская медленное удаление фона.
async function commitStagedImage({ stagedUrl, userId, newBasename }) {
  if (!stagedUrl) return null;

  const userPrefix = `/uploads/${String(userId)}/`;
  if (!stagedUrl.startsWith(userPrefix)) {
    const err = new Error('stagedImageUrl outside caller namespace');
    err.status = 400;
    throw err;
  }
  const relPath = stagedUrl.replace(/^\/uploads\//, '');
  const fromAbs = path.resolve(path.join(UPLOAD_DIR, relPath));
  const root = path.resolve(UPLOAD_DIR);
  if (!fromAbs.startsWith(root + path.sep)) {
    const err = new Error('stagedImageUrl resolves outside UPLOAD_DIR');
    err.status = 400;
    throw err;
  }
  try { await fs.access(fromAbs); }
  catch {
    const err = new Error('stagedImageUrl not found on disk');
    err.status = 400;
    throw err;
  }

  if (!newBasename) return stagedUrl;
  const toAbs = path.join(path.dirname(fromAbs), newBasename);
  await fs.rename(fromAbs, toAbs);
  return `${userPrefix}${newBasename}`;
}

// EN: Analyzes a processed image buffer and returns the detected color info (Phase 1 — color only).
// ET: Analüüsib töödeldud pildi puhvrit ja tagastab tuvastatud värviinfo (Faas 1 — ainult värv).
// RU: Анализирует буфер обработанного изображения и возвращает определённую информацию о цвете (Фаза 1 — только цвет).
async function analyzeImage(processedBuffer) {
  const color = await detectColor(processedBuffer);
  return { color };
}

// EN: Recursively removes a user's upload directory; used in the user-delete cascade. Best effort — a missing dir is fine (ENOENT swallowed); any other failure is logged.
// ET: Kustutab rekursiivselt kasutaja üleslaadimiskausta; kasutatakse kasutaja kustutamise kaskaadis.
// RU: Рекурсивно удаляет папку загрузок пользователя; используется в каскаде удаления пользователя.
async function deleteUserUploadDir(userId) {
  const dir = path.join(UPLOAD_DIR, String(userId));
  const resolved = path.resolve(dir);
  const root = path.resolve(UPLOAD_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    console.warn('Refused to delete user dir outside UPLOAD_DIR', resolved);
    return;
  }
  try {
    await fs.rm(resolved, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('Failed to remove user dir', resolved, err.message);
    }
  }
}

// EN: Cleans up old orphaned upload files that no clothing item references anymore.
// ET: Koristab vanad orvuks jäänud üleslaadimisfailid, millele ükski rõivaese enam ei viita.
// RU: Удаляет старые осиротевшие файлы загрузок, на которые больше не ссылается ни одна вещь.
async function cleanupOrphanUploads({ maxAgeMs = 60 * 60 * 1000 } = {}) {
  const ClothingItem = require('../models/ClothingItem');

  let userDirs;
  try {
    userDirs = await fs.readdir(UPLOAD_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { scanned: 0, deleted: 0 };
    throw err;
  }

  const cutoff = Date.now() - maxAgeMs;
  let scanned = 0;
  let deleted = 0;

  for (const dirent of userDirs) {
    if (!dirent.isDirectory()) continue;
    const userId = dirent.name;
    const userDir = path.join(UPLOAD_DIR, userId);

    let files;
    try { files = await fs.readdir(userDir); }
    catch { continue; }

    let refs = [];
    try {
      refs = await ClothingItem
        .find({ owner: userId }, 'imageUrl originalImageUrl')
        .lean();
    } catch {
      // EN: CastError — the folder name is not an ObjectId; treat a folder with no references as if there were none.
      // ET: CastError — kausta nimi pole ObjectId; käsitle viideteta kausta puhul nagu viiteid poleks.
      // RU: CastError — имя папки не ObjectId; считаем, что ссылок нет, и папку можно очистить.
    }
    const referenced = new Set();
    refs.forEach((r) => {
      if (r.imageUrl) referenced.add(r.imageUrl);
      if (r.originalImageUrl) referenced.add(r.originalImageUrl);
    });

    for (const file of files) {
      scanned++;
      const abs = path.join(userDir, file);
      let stat;
      try { stat = await fs.stat(abs); } catch { continue; }
      if (!stat.isFile()) continue;
      if (stat.mtimeMs > cutoff) continue;

      const url = `/uploads/${userId}/${file}`;
      if (referenced.has(url)) continue;

      try {
        await fs.unlink(abs);
        deleted++;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn('cleanup unlink failed', abs, err.message);
        }
      }
    }
  }

  return { scanned, deleted };
}

module.exports = {
  removeBackground,
  deleteFileSafe,
  analyzeImage,
  commitStagedImage,
  deleteUserUploadDir,
  cleanupOrphanUploads,
};
