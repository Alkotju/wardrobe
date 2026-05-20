const mongoose = require('mongoose');

// ET: Loob ühenduse MongoDB andmebaasiga antud URI järgi ja tagastab ühenduse objekti.
// RU: Устанавливает соединение с базой данных MongoDB по заданному URI и возвращает объект соединения.
async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is required');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });
  return mongoose.connection;
}

module.exports = connectDB;
