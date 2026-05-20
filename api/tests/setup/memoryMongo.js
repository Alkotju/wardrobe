// Spins up a single in-memory MongoDB instance per test file. Each test
// individually wipes collections to avoid bleed between cases.

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo;

async function startMemoryMongo() {
  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  return uri;
}

async function stopMemoryMongo() {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  mongo = null;
}

async function clearAllCollections() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  );
}

module.exports = { startMemoryMongo, stopMemoryMongo, clearAllCollections };
