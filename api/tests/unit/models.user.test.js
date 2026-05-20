const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const User = require('../../src/models/User');

beforeAll(async () => { await startMemoryMongo(); });
afterAll(async () => { await stopMemoryMongo(); });
beforeEach(async () => { await clearAllCollections(); });

describe('User model', () => {
  test('requires username, email, passwordHash', async () => {
    await expect(User.create({})).rejects.toThrow(/validation/i);
  });

  test('normalises username and email to lowercase and trims whitespace', async () => {
    const u = await User.create({
      userId: '0000001',
      username: 'Aleks ',
      email: '  ALEKS@Example.COM ',
      passwordHash: 'x',
    });
    expect(u.email).toBe('aleks@example.com');
    // username is stored lowercased so login is case-insensitive.
    expect(u.username).toBe('aleks');
  });

  test('defaults role to "user"', async () => {
    const u = await User.create({
      userId: '0000001',
      username: 'a',
      email: 'a@a.com',
      passwordHash: 'x',
    });
    expect(u.role).toBe('user');
  });

  test('rejects unknown roles', async () => {
    await expect(User.create({
      userId: '0000001',
      username: 'a',
      email: 'a@a.com',
      passwordHash: 'x',
      role: 'superuser',
    })).rejects.toThrow(/validation/i);
  });

  test('unique constraint on username (insert-time)', async () => {
    await User.create({ userId: '0000001', username: 'aleks', email: 'a@a.com', passwordHash: 'x' });
    await User.init(); // ensure indexes exist before the duplicate insert
    await expect(User.create({
      userId: '0000002', username: 'aleks', email: 'b@b.com', passwordHash: 'x',
    })).rejects.toThrow(/duplicate/i);
  });

  test('toJSON strips passwordHash', async () => {
    const u = await User.create({
      userId: '0000001',
      username: 'aleks',
      email: 'a@a.com',
      passwordHash: 'super-secret-hash',
    });
    const json = u.toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.username).toBe('aleks');
  });
});
