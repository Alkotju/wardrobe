// POST /api/auth/login — happy path + bad creds + validation.
// Note: the rate limiter is set to 10 attempts / 15 min and is global to the
// router module. Tests deliberately stay below that threshold so unrelated
// suites don't flake. The limiter behaviour itself is tested in isolation in
// a dedicated case.

const request = require('supertest');
const jwt = require('jsonwebtoken');

const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser } = require('../fixtures/users');

let app;

beforeAll(async () => {
  await startMemoryMongo();
  app = buildApp();
});
afterAll(async () => { await stopMemoryMongo(); });
beforeEach(async () => { await clearAllCollections(); });

describe('POST /api/auth/login', () => {
  test('200 + valid JWT for correct credentials', async () => {
    const { user, password } = await createUser({ username: 'aleks' });
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: String(user._id),
      username: 'aleks',
      role: 'user',
    });
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.sub).toBe(String(user._id));
    expect(decoded.role).toBe('user');
  });

  test('updates lastLogin on success', async () => {
    const { user, password } = await createUser({ username: 'aleks' });
    expect(user.lastLogin).toBeNull();

    await request(app).post('/api/auth/login').send({ username: user.username, password });

    const reloaded = await require('../../src/models/User').findById(user._id);
    expect(reloaded.lastLogin).toBeInstanceOf(Date);
  });

  test('401 for unknown username', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nope', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('401 for wrong password (does NOT leak which side was wrong)', async () => {
    await createUser({ username: 'aleks', password: 'correct-horse' });
    const res = await request(app).post('/api/auth/login').send({ username: 'aleks', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('400 when username is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'aleks' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  test('204 stateless logout — does not require auth header', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });
});
