// Admin-only user management. Key edge cases: self-delete protection,
// last-admin protection, MAX_USERS cap, duplicate username/email.

const request = require('supertest');

const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser, signTokenFor, authHeader } = require('../fixtures/users');
const User = require('../../src/models/User');
const ClothingItem = require('../../src/models/ClothingItem');

let app;
let admin; let adminToken;
let user;  let userToken;

beforeAll(async () => {
  await startMemoryMongo();
  app = buildApp();
});
afterAll(async () => { await stopMemoryMongo(); });

beforeEach(async () => {
  await clearAllCollections();
  ({ user: admin } = await createUser({ username: 'admin', role: 'admin' }));
  adminToken = signTokenFor(admin);
  ({ user } = await createUser({ username: 'aleks' }));
  userToken = signTokenFor(user);
});

describe('GET /api/users (admin)', () => {
  test('403 for non-admin', async () => {
    const res = await request(app).get('/api/users').set(authHeader(userToken));
    expect(res.status).toBe(403);
  });

  test('lists users with itemCount', async () => {
    await ClothingItem.create({ itemId: '1', owner: user._id, name: 'a' });
    await ClothingItem.create({ itemId: '2', owner: user._id, name: 'b' });

    const res = await request(app).get('/api/users').set(authHeader(adminToken));
    expect(res.status).toBe(200);
    const aleks = res.body.users.find((u) => u.username === 'aleks');
    expect(aleks.itemCount).toBe(2);
    const adminRow = res.body.users.find((u) => u.username === 'admin');
    expect(adminRow.itemCount).toBe(0);
  });

  test('does NOT leak passwordHash', async () => {
    const res = await request(app).get('/api/users').set(authHeader(adminToken));
    expect(res.status).toBe(200);
    for (const row of res.body.users) {
      expect(row).not.toHaveProperty('passwordHash');
    }
  });
});

describe('POST /api/users (admin)', () => {
  test('creates a new user', async () => {
    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'newbie', email: 'new@example.com', password: 'longpassword' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'newbie', role: 'user' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  test('409 on duplicate username', async () => {
    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'aleks', email: 'fresh@example.com', password: 'longpassword' });
    expect(res.status).toBe(409);
  });

  test('409 on duplicate email', async () => {
    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'fresh', email: user.email, password: 'longpassword' });
    expect(res.status).toBe(409);
  });

  test('400 for short password', async () => {
    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'fresh', email: 'fresh@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  test('400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'fresh', email: 'not-an-email', password: 'longpassword' });
    expect(res.status).toBe(400);
  });

  test('409 when MAX_USERS is reached', async () => {
    // env.js sets MAX_USERS=20. beforeEach already created 2 users; fill the
    // remaining 18 via direct insert so the POST below trips the cap.
    // Direct insert bypasses bcrypt for speed; passwordHash content is not
    // exercised by this code path.
    const maxUsers = parseInt(process.env.MAX_USERS, 10);
    const toCreate = maxUsers - (await User.countDocuments());
    const docs = Array.from({ length: toCreate }, (_, i) => ({
      userId: `cap-${i}`,
      username: `cap${i}`,
      email: `cap${i}@example.com`,
      passwordHash: 'x',
      role: 'user',
    }));
    await User.insertMany(docs);

    const res = await request(app)
      .post('/api/users').set(authHeader(adminToken))
      .send({ username: 'over', email: 'over@example.com', password: 'longpassword' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/limit/i);
  });
});

describe('DELETE /api/users/:id (admin)', () => {
  test('400 when admin tries to delete themself', async () => {
    const res = await request(app)
      .delete(`/api/users/${admin._id}`).set(authHeader(adminToken));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  test('400 when deleting the last admin', async () => {
    // Promote `user` to admin via direct write to set up the scenario, then
    // attempt to delete original admin from a different admin's session.
    const other = await User.create({ userId: '0000099', username: 'admin2',
      email: 'admin2@example.com', passwordHash: 'x', role: 'admin' });
    const otherToken = signTokenFor(other);

    // Delete `admin` — should succeed (still one admin left = `other`).
    const ok = await request(app).delete(`/api/users/${admin._id}`).set(authHeader(otherToken));
    expect(ok.status).toBe(200);

    // Now `other` is the last admin → cannot be deleted by themself OR another admin.
    // Make a NEW admin to bypass self-delete and isolate the "last admin" rule.
    const tmp = await User.create({ userId: '0000100', username: 'tmpadmin',
      email: 'tmp@example.com', passwordHash: 'x', role: 'admin' });
    const tmpToken = signTokenFor(tmp);
    // Delete tmp first so `other` is genuinely the last admin.
    await User.deleteOne({ _id: tmp._id });

    const res = await request(app).delete(`/api/users/${other._id}`).set(authHeader(tmpToken));
    // The tmp token still works for auth (JWT is self-contained), but the
    // ownership/check is on the DB state which now has only `other` as admin.
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last admin/i);
  });

  test('404 when target id does not exist', async () => {
    const res = await request(app)
      .delete('/api/users/000000000000000000000000')
      .set(authHeader(adminToken));
    expect(res.status).toBe(404);
  });

  test('400 when id is not a Mongo ID', async () => {
    const res = await request(app)
      .delete('/api/users/not-an-id').set(authHeader(adminToken));
    expect(res.status).toBe(400);
  });

  test('200 — normal admin deletes a regular user', async () => {
    const res = await request(app)
      .delete(`/api/users/${user._id}`).set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(await User.findById(user._id)).toBeNull();
  });
});

describe('GET /api/users/:id/items (admin)', () => {
  test('returns target user\'s items', async () => {
    await ClothingItem.create({ itemId: '1', owner: user._id, name: 'X' });
    const res = await request(app)
      .get(`/api/users/${user._id}/items`).set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  test('403 for non-admin', async () => {
    const res = await request(app)
      .get(`/api/users/${user._id}/items`).set(authHeader(userToken));
    expect(res.status).toBe(403);
  });
});
