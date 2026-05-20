const multer = require('multer');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES, 10) || 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  // EN: Filter function that allows uploading only JPEG/PNG/WebP images; returns error 415 for any other type.
  // ET: Filterfunktsioon, mis lubab üles laadida vaid JPEG/PNG/WebP pilte; muu tüübi korral tagastab vea 415.
  // RU: Функция-фильтр, разрешающая загрузку только изображений JPEG/PNG/WebP; при ином типе возвращает ошибку 415.
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const err = new Error('Only image/jpeg, image/png, or image/webp are allowed');
    err.status = 415;
    cb(err);
  },
});

module.exports = upload;
