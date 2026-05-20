const { validationResult } = require('express-validator');

// ET: Tehasefunktsioon, mis pakib express-validatori reeglid üheks vahevaraks.
// RU: Фабричная функция, оборачивающая набор правил express-validator в одно middleware.
function runValidations(validations) {
  // ET: Vahevara, mis käivitab kõik valideerimisreeglid ja tagastab 400, kui leitakse vigu.
  // RU: Middleware, который выполняет все правила валидации и возвращает 400 при наличии ошибок.
  return async function validate(req, res, next) {
    for (const v of validations) {
      // eslint-disable-next-line no-await-in-loop
      await v.run(req);
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    next();
  };
}

module.exports = { runValidations };
