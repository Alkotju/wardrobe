const multer = require('multer');

// EN: Central error handler that converts errors (Multer, validation, generic) into a suitable HTTP status and JSON response.
// ET: Keskne veakäsitleja, mis teisendab vead (Multer, valideerimine, üldised) sobivaks HTTP-staatuseks ja JSON-vastuseks.
// RU: Центральный обработчик ошибок, преобразующий ошибки (Multer, валидации, общие) в подходящий HTTP-статус и JSON-ответ.
function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }

  const status = err.status
    || (err.name === 'ValidationError' ? 400 : null)
    || (err.name === 'CastError' ? 400 : null)
    || 500;

  if (status >= 500) console.error(err);

  res.status(status).json({ error: err.message || 'Internal server error' });
}

module.exports = errorHandler;
