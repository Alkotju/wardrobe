const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { nextSequentialId } = require('../../src/utils/sequentialId');
const Counter = require('../../src/models/Counter');

beforeAll(async () => { await startMemoryMongo(); });
afterAll(async () => { await stopMemoryMongo(); });
beforeEach(async () => { await clearAllCollections(); });

describe('nextSequentialId', () => {
  test('starts at 0000001 for a fresh counter', async () => {
    const id = await nextSequentialId('user');
    expect(id).toBe('0000001');
  });

  test('monotonically increments on subsequent calls', async () => {
    const a = await nextSequentialId('user');
    const b = await nextSequentialId('user');
    const c = await nextSequentialId('user');
    expect([a, b, c]).toEqual(['0000001', '0000002', '0000003']);
  });

  test('different counter names are independent', async () => {
    const u1 = await nextSequentialId('user');
    const i1 = await nextSequentialId('item');
    const u2 = await nextSequentialId('user');
    expect(u1).toBe('0000001');
    expect(i1).toBe('0000001');
    expect(u2).toBe('0000002');
  });

  test('honours the width argument', async () => {
    const id = await nextSequentialId('user', 4);
    expect(id).toBe('0001');
  });

  test('persists the seq in the Counter document', async () => {
    await nextSequentialId('item');
    await nextSequentialId('item');
    const doc = await Counter.findById('item');
    expect(doc.seq).toBe(2);
  });

  test('concurrent calls produce no duplicates', async () => {
    const ids = await Promise.all(Array.from({ length: 25 }, () => nextSequentialId('item')));
    const unique = new Set(ids);
    expect(unique.size).toBe(25);
  });
});
