const request = require('supertest');
const mongoose = require('mongoose');

const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser, signTokenFor, authHeader } = require('../fixtures/users');
const Outfit = require('../../src/models/Outfit');
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

describe('GET /api/outfits', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/outfits');
    expect(res.status).toBe(401);
  });

  test('returns only the caller\'s outfits', async () => {
    await Outfit.create({ owner: aleks._id, name: 'Mine', items: [] });
    await Outfit.create({ owner: bob._id, name: 'Theirs', items: [] });

    const res = await request(app).get('/api/outfits').set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(res.body.outfits).toHaveLength(1);
    expect(res.body.outfits[0].name).toBe('Mine');
  });
});

describe('POST /api/outfits', () => {
  test('201 — create with valid item refs', async () => {
    const item = await ClothingItem.create({ itemId: 'oI1', owner: aleks._id, name: 'Tee' });
    const res = await request(app)
      .post('/api/outfits')
      .set(authHeader(aleksToken))
      .send({
        name: 'Friday casual',
        items: [{ itemId: String(item._id), position: { x: 10, y: 20 }, zIndex: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.outfit.items[0]).toMatchObject({
      itemId: String(item._id), position: { x: 10, y: 20 }, zIndex: 1,
    });
  });

  test('400 when referenced item is not owned by caller', async () => {
    const foreign = await ClothingItem.create({ itemId: 'oI9', owner: bob._id, name: 'Bob\'s' });
    const res = await request(app)
      .post('/api/outfits')
      .set(authHeader(aleksToken))
      .send({ name: 'Heist', items: [{ itemId: String(foreign._id) }] });
    expect(res.status).toBe(400);
  });

  test('items defaults to [] when omitted', async () => {
    const res = await request(app)
      .post('/api/outfits')
      .set(authHeader(aleksToken))
      .send({ name: 'Empty fit' });
    expect(res.status).toBe(201);
    expect(res.body.outfit.items).toEqual([]);
  });

  test('400 when name is missing', async () => {
    const res = await request(app).post('/api/outfits').set(authHeader(aleksToken)).send({});
    expect(res.status).toBe(400);
  });

  test('400 when items.*.itemId is not a Mongo ID', async () => {
    const res = await request(app)
      .post('/api/outfits').set(authHeader(aleksToken))
      .send({ name: 'X', items: [{ itemId: 'not-an-id' }] });
    expect(res.status).toBe(400);
  });

  test('400 when name exceeds 200 chars', async () => {
    const res = await request(app)
      .post('/api/outfits').set(authHeader(aleksToken))
      .send({ name: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/outfits/:id', () => {
  let outfit;
  beforeEach(async () => {
    outfit = await Outfit.create({ owner: aleks._id, name: 'Orig', items: [] });
  });

  test('owner updates name', async () => {
    const res = await request(app)
      .put(`/api/outfits/${outfit._id}`)
      .set(authHeader(aleksToken))
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.outfit.name).toBe('Renamed');
  });

  test('owner replaces items array', async () => {
    const item = await ClothingItem.create({ itemId: 'oI2', owner: aleks._id, name: 'Tee' });
    const res = await request(app)
      .put(`/api/outfits/${outfit._id}`)
      .set(authHeader(aleksToken))
      .send({ items: [{ itemId: String(item._id), position: { x: 1, y: 2 }, zIndex: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.outfit.items).toHaveLength(1);
  });

  test('403 when caller is not the owner', async () => {
    const res = await request(app)
      .put(`/api/outfits/${outfit._id}`)
      .set(authHeader(bobToken))
      .send({ name: 'hijack' });
    expect(res.status).toBe(403);
  });

  test('404 when outfit does not exist', async () => {
    const res = await request(app)
      .put('/api/outfits/000000000000000000000000')
      .set(authHeader(aleksToken))
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/outfits/:id', () => {
  test('owner deletes', async () => {
    const outfit = await Outfit.create({ owner: aleks._id, name: 'Trash me', items: [] });
    const res = await request(app).delete(`/api/outfits/${outfit._id}`).set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(await Outfit.findById(outfit._id)).toBeNull();
  });

  test('403 for non-owner', async () => {
    const outfit = await Outfit.create({ owner: aleks._id, name: 'X', items: [] });
    const res = await request(app).delete(`/api/outfits/${outfit._id}`).set(authHeader(bobToken));
    expect(res.status).toBe(403);
  });
});
