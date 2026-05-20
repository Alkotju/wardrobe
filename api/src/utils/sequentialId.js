const Counter = require('../models/Counter');

// EN: Returns the next sequential number of a named counter as a fixed-width, zero-padded string.
// ET: Tagastab nimega loenduri järgmise järjekorranumbri, nullidega täidetud fikseeritud laiusega stringina.
// RU: Возвращает следующий порядковый номер именованного счётчика в виде строки фиксированной ширины с ведущими нулями.
async function nextSequentialId(name, width = 7) {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return String(doc.seq).padStart(width, '0');
}

module.exports = { nextSequentialId };
