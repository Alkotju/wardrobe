const request = require('supertest');
const mongoose = require('mongoose');

const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser, signTokenFor, authHeader } = require('../fixtures/users');
const Collection = require('../../src/models/Collection');
const ClothingItem = require('../../src/models/ClothingItem');

let app;
let aleks; let aleksToken;
let bob;   let bobToken;

beforeAll(async () => {
  await startMemoryMongo();
  app = buildApp();
});
afterAll(async () => { await stopMemoryMongo(); });

beforeEach(async () => {
  await clearAllCollections();
  ({ user: aleks } = await createUser({ username: 'aleks' }));
  aleksToken = signTokenFor(aleks);
  ({ user: bob } = await createUser({ username: 'bob' }));
  bobToken = signTokenFor(bob);
});

describe('Collections CRUD', () => {
  test('GET returns only caller\'s collections', async () => {
    await Collection.create({ owner: aleks._id, name: 'Trip to Spain', type: 'travel', items: [] });
    await Collection.create({ owner: bob._id, name: 'Bob trip', type: 'travel', items: [] });

    const res = await request(app).get('/api/collections').set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(res.body.collections).toHaveLength(1);
    expect(res.body.collections[0].name).toBe('Trip to Spain');
  });

  test('POST creates with valid type', async () => {
    const item = await ClothingItem.create({ itemId: 'cI1', owner: aleks._id, name: 'Shoes' });
    const res = await request(app)
      .post('/api/collections')
      .set(authHeader(aleksToken))
      .send({ name: 'Capsule', type: 'moving', items: [String(item._id)] });
    expect(res.status).toBe(201);
    expect(res.body.collection.type).toBe('moving');
    expect(res.body.collection.items).toHaveLength(1);
  });

  test('POST 400 when referenced item is not owned by caller', async () => {
    const foreign = await ClothingItem.create({ itemId: 'cI9', owner: bob._id, name: 'Bob' });
    const res = await request(app)
      .post('/api/collections')
      .set(authHeader(aleksToken))
      .send({ name: 'Heist', items: [String(foreign._id)] });
    expect(res.status).toBe(400);
  });

  test('POST defaults type to "other"', async () => {
    const res = await request(app)
      .post('/api/collections').set(authHeader(aleksToken))
      .send({ name: 'Plain' });
    expect(res.status).toBe(201);
    expect(res.body.collection.type).toBe('other');
  });

  test('POST 400 for unknown type', async () => {
    const res = await request(app)
      .post('/api/collections').set(authHeader(aleksToken))
      .send({ name: 'X', type: 'invalid' });
    expect(res.status).toBe(400);
  });

  test('POST 400 when items contains a non-ObjectId', async () => {
    const res = await request(app)
      .post('/api/collections').set(authHeader(aleksToken))
      .send({ name: 'X', items: ['nope'] });
    expect(res.status).toBe(400);
  });

  test('PUT — owner can update', async () => {
    const c = await Collection.create({ owner: aleks._id, name: 'Orig', items: [] });
    const res = await request(app)
      .put(`/api/collections/${c._id}`).set(authHeader(aleksToken))
      .send({ name: 'Renamed', type: 'travel' });
    expect(res.status).toBe(200);
    expect(res.body.collection.name).toBe('Renamed');
    expect(res.body.collection.type).toBe('travel');
  });

  test('PUT — 403 for non-owner', async () => {
    const c = await Collection.create({ owner: aleks._id, name: 'X', items: [] });
    const res = await request(app)
      .put(`/api/collections/${c._id}`).set(authHeader(bobToken)).send({ name: 'hijack' });
    expect(res.status).toBe(403);
  });

  test('DELETE — owner removes', async () => {
    const c = await Collection.create({ owner: aleks._id, name: 'X', items: [] });
    const res = await request(app).delete(`/api/collections/${c._id}`).set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(await Collection.findById(c._id)).toBeNull();
  });

  test('DELETE — 403 for non-owner', async () => {
    const c = await Collection.create({ owner: aleks._id, name: 'X', items: [] });
    const res = await request(app).delete(`/api/collections/${c._id}`).set(authHeader(bobToken));
    expect(res.status).toBe(403);
  });
});
