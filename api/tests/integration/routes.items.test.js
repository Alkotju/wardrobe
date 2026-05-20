// Items CRUD — exercises auth, ownership, multipart, image processing wiring,
// and admin cross-user visibility.
//
// imageProcessor is mocked at the module level so we don't touch disk; tests
// that care about deletion side-effects assert on the mock's call args.

const request = require('supertest');

jest.mock('../../src/services/imageProcessor', () => ({
  removeBackground: jest.fn(async (_buf, _mime, userId, itemId) => ({
    originalPath: `/tmp/${userId}/orig_${itemId}.jpg`,
    processedPath: `/tmp/${userId}/${itemId}.png`,
    originalUrl: `/uploads/${userId}/orig_${itemId}.jpg`,
    imageUrl: `/uploads/${userId}/${itemId}.png`,
    processedBuffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  })),
  deleteFileSafe: jest.fn(async () => {}),
  // Mirror real commitStagedImage's contract: returns a URL (renamed when
  // newBasename is supplied) without touching disk.
  commitStagedImage: jest.fn(async ({ stagedUrl, userId, newBasename }) => {
    if (!stagedUrl) return null;
    if (!newBasename) return stagedUrl;
    return `/uploads/${userId}/${newBasename}`;
  }),
  // Phase-1 analyser returns { color: ... }. CLIP / category live in a later
  // phase. Tests assert the shape, not specific colour values.
  analyzeImage: jest.fn(async () => ({
    color: { hex: '#3a5b9c', label: 'Sinine', confidence: 0.82 },
  })),
}));

const imageProcessor = require('../../src/services/imageProcessor');
const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser, signTokenFor, authHeader } = require('../fixtures/users');
const ClothingItem = require('../../src/models/ClothingItem');

let app;
let aleks; let aleksToken;
let bob;    let bobToken;
let admin;  let adminToken;

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
  ({ user: admin } = await createUser({ username: 'admin', role: 'admin' }));
  adminToken = signTokenFor(admin);
});

describe('GET /api/items', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(401);
  });

  test('returns only the caller\'s items', async () => {
    await ClothingItem.create({ itemId: '1', owner: aleks._id, name: 'Aleks shirt' });
    await ClothingItem.create({ itemId: '2', owner: bob._id, name: 'Bob jacket' });

    const res = await request(app).get('/api/items').set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Aleks shirt');
  });

  test('admin?userId=… can browse another user\'s items', async () => {
    await ClothingItem.create({ itemId: '1', owner: bob._id, name: 'Bob jacket' });
    const res = await request(app)
      .get(`/api/items?userId=${bob._id}`)
      .set(authHeader(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Bob jacket');
  });

  test('non-admin userId filter is IGNORED — they only see their own items', async () => {
    await ClothingItem.create({ itemId: '1', owner: bob._id, name: 'Bob jacket' });
    const res = await request(app)
      .get(`/api/items?userId=${bob._id}`)
      .set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  test('search filter is regex-escaped (no ReDoS on metachars)', async () => {
    await ClothingItem.create({ itemId: '1', owner: aleks._id, name: 'shirt.v2' });
    const res = await request(app)
      .get('/api/items?search=.*')
      .set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    // ".*" should be treated as a literal substring → no match.
    expect(res.body.items).toHaveLength(0);
  });

  test('combined color+category filters', async () => {
    await ClothingItem.create({ itemId: '1', owner: aleks._id, name: 'A',
      color: { label: 'Red', hex: '#ff0000' }, category: { parent: 'Tops', child: 'T-Shirt' } });
    await ClothingItem.create({ itemId: '2', owner: aleks._id, name: 'B',
      color: { label: 'Blue', hex: '#0000ff' }, category: { parent: 'Bottoms', child: 'Jeans' } });

    const res = await request(app)
      .get('/api/items?color=red&category=tops')
      .set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.name)).toContain('A');
  });

  test('400 when userId is not a Mongo ID', async () => {
    const res = await request(app)
      .get('/api/items?userId=not-an-id')
      .set(authHeader(adminToken));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/items', () => {
  test('201 — creates without image', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Linen pants')
      .field('material', 'linen')
      .field('category', JSON.stringify({ parent: 'Bottoms', child: 'Pants' }))
      .field('color', JSON.stringify({ label: 'Beige', hex: '#e5d4ad' }));

    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({
      name: 'Linen pants',
      material: 'linen',
      category: { parent: 'Bottoms', child: 'Pants' },
      color: { label: 'Beige', hex: '#e5d4ad' },
      imageUrl: null,
    });
    expect(res.body.item.itemId).toMatch(/^\d{7}$/);
    expect(imageProcessor.removeBackground).not.toHaveBeenCalled();
  });

  test('201 — uploads image and calls removeBackground', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Hoodie')
      .attach('image', Buffer.from('fake-png'), { filename: 'h.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(imageProcessor.removeBackground).toHaveBeenCalledTimes(1);
    expect(res.body.item.imageUrl).toMatch(/^\/uploads\/[a-f0-9]+\/\d{7}\.png$/);
    expect(res.body.item.originalImageUrl).toMatch(/^\/uploads\/[a-f0-9]+\//);
  });

  test('400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', '   ');
    expect(res.status).toBe(400);
  });

  test('400 when name exceeds 200 chars', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'x'.repeat(201));
    expect(res.status).toBe(400);
  });

  test('415 when image MIME is unsupported', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Bad mime')
      .attach('image', Buffer.from('whatever'), { filename: 'evil.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(415);
  });

  test('201 — reuses staged URLs without re-running bg-removal', async () => {
    // Simulate a prior POST /api/items/upload that returned these URLs.
    const stagedImage = `/uploads/${aleks._id}/preview_1700000000000.png`;
    const stagedOrig  = `/uploads/${aleks._id}/original_1700000000000_abc.png`;

    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Reused')
      .field('stagedImageUrl', stagedImage)
      .field('stagedOriginalImageUrl', stagedOrig);

    expect(res.status).toBe(201);
    expect(imageProcessor.removeBackground).not.toHaveBeenCalled();
    expect(imageProcessor.commitStagedImage).toHaveBeenCalledTimes(2);
    // Processed file is renamed to <itemId>.png; original keeps its name.
    expect(res.body.item.imageUrl).toBe(`/uploads/${aleks._id}/${res.body.item.itemId}.png`);
    expect(res.body.item.originalImageUrl).toBe(stagedOrig);
  });

  test('201 — fresh file beats staged URLs when both are sent', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Both')
      .field('stagedImageUrl', `/uploads/${aleks._id}/preview_x.png`)
      .attach('image', Buffer.from('fresh'), { filename: 'h.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(imageProcessor.removeBackground).toHaveBeenCalledTimes(1);
    expect(imageProcessor.commitStagedImage).not.toHaveBeenCalled();
  });

  test('falls back to defaults when category/color JSON is malformed', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Sneaky')
      .field('category', 'not-json')
      .field('color', '{broken');
    expect(res.status).toBe(201);
    expect(res.body.item.category).toEqual({ parent: '', child: '' });
    expect(res.body.item.color).toEqual({ label: '', hex: '' });
  });
});

describe('PUT /api/items/:id', () => {
  let item;
  beforeEach(async () => {
    item = await ClothingItem.create({
      itemId: '0000001', owner: aleks._id, name: 'Original',
      imageUrl: '/uploads/aleks/0000001.png',
      originalImageUrl: '/uploads/aleks/orig_0000001.jpg',
    });
  });

  test('owner can update name + material', async () => {
    const res = await request(app)
      .put(`/api/items/${item._id}`)
      .set(authHeader(aleksToken))
      .field('name', 'Updated')
      .field('material', 'cotton');
    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('Updated');
    expect(res.body.item.material).toBe('cotton');
  });

  test('non-owner gets 403', async () => {
    const res = await request(app)
      .put(`/api/items/${item._id}`)
      .set(authHeader(bobToken))
      .field('name', 'hijack');
    expect(res.status).toBe(403);
  });

  test('admin can update other users\' items', async () => {
    const res = await request(app)
      .put(`/api/items/${item._id}`)
      .set(authHeader(adminToken))
      .field('name', 'Admin override');
    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('Admin override');
  });

  test('PUT with staged URLs reuses them and skips bg-removal', async () => {
    const stagedImage = `/uploads/${aleks._id}/preview_x.png`;
    await request(app)
      .put(`/api/items/${item._id}`)
      .set(authHeader(aleksToken))
      .field('stagedImageUrl', stagedImage);

    expect(imageProcessor.removeBackground).not.toHaveBeenCalled();
    expect(imageProcessor.commitStagedImage).toHaveBeenCalledWith(
      expect.objectContaining({
        stagedUrl: stagedImage,
        newBasename: `${item.itemId}.png`,
      })
    );
    // Previous on-disk image is cleaned up just like in the file-upload path.
    const deletedUrls = imageProcessor.deleteFileSafe.mock.calls.map((c) => c[0]);
    expect(deletedUrls).toContain('/uploads/aleks/0000001.png');
  });

  test('uploading a new image deletes the previous files', async () => {
    await request(app)
      .put(`/api/items/${item._id}`)
      .set(authHeader(aleksToken))
      .attach('image', Buffer.from('new'), { filename: 'n.jpg', contentType: 'image/jpeg' });

    // Both the original AND processed previous URLs should have been queued for deletion.
    const deletedUrls = imageProcessor.deleteFileSafe.mock.calls.map((c) => c[0]);
    expect(deletedUrls).toEqual(expect.arrayContaining([
      '/uploads/aleks/0000001.png',
      '/uploads/aleks/orig_0000001.jpg',
    ]));
  });

  test('404 for unknown item id', async () => {
    const res = await request(app)
      .put('/api/items/000000000000000000000000')
      .set(authHeader(aleksToken))
      .field('name', 'x');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/items/:id', () => {
  test('owner deletes — files cleaned up + 200', async () => {
    const item = await ClothingItem.create({
      itemId: '0000001', owner: aleks._id, name: 'X',
      imageUrl: '/uploads/aleks/x.png',
      originalImageUrl: '/uploads/aleks/orig_x.jpg',
    });
    const res = await request(app).delete(`/api/items/${item._id}`).set(authHeader(aleksToken));
    expect(res.status).toBe(200);
    expect(imageProcessor.deleteFileSafe).toHaveBeenCalledWith('/uploads/aleks/x.png');
    expect(imageProcessor.deleteFileSafe).toHaveBeenCalledWith('/uploads/aleks/orig_x.jpg');
    expect(await ClothingItem.findById(item._id)).toBeNull();
  });

  test('403 for non-owner', async () => {
    const item = await ClothingItem.create({ itemId: '0000001', owner: aleks._id, name: 'X' });
    const res = await request(app).delete(`/api/items/${item._id}`).set(authHeader(bobToken));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/items/upload', () => {
  test('200 + previewable URLs without persisting an item', async () => {
    const res = await request(app)
      .post('/api/items/upload')
      .set(authHeader(aleksToken))
      .attach('image', Buffer.from('x'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/uploads\//);
    expect(await ClothingItem.countDocuments()).toBe(0);
  });

  test('200 — response also carries Phase-1 colour analysis', async () => {
    const res = await request(app)
      .post('/api/items/upload')
      .set(authHeader(aleksToken))
      .attach('image', Buffer.from('x'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toEqual({
      color: { hex: '#3a5b9c', label: 'Sinine', confidence: 0.82 },
    });
    // Analyser is fed the processed buffer, not the raw upload.
    expect(imageProcessor.analyzeImage).toHaveBeenCalledTimes(1);
    expect(imageProcessor.analyzeImage.mock.calls[0][0]).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  test('200 — preview still succeeds when analyser fails', async () => {
    imageProcessor.analyzeImage.mockRejectedValueOnce(new Error('analyser blew up'));
    const res = await request(app)
      .post('/api/items/upload')
      .set(authHeader(aleksToken))
      .attach('image', Buffer.from('x'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^\/uploads\//);
    expect(res.body.analysis).toBeNull();
  });

  test('400 if no image is sent', async () => {
    const res = await request(app).post('/api/items/upload').set(authHeader(aleksToken));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/items — extra attributes', () => {
  test('accepts waterproof + windproof + comment', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Rain jacket')
      .field('waterproof', 'true')
      .field('windproof', 'true')
      .field('comment', 'Bought in Helsinki');
    expect(res.status).toBe(201);
    expect(res.body.item.waterproof).toBe(true);
    expect(res.body.item.windproof).toBe(true);
    expect(res.body.item.comment).toBe('Bought in Helsinki');
  });

  test('400 when comment exceeds 500 chars', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(authHeader(aleksToken))
      .field('name', 'Too talky')
      .field('comment', 'x'.repeat(501));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/items/analyze', () => {
  test('200 + colour analysis for an uploaded image', async () => {
    const res = await request(app)
      .post('/api/items/analyze')
      .set(authHeader(aleksToken))
      .attach('image', Buffer.from('x'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      color: { hex: '#3a5b9c', label: 'Sinine', confidence: 0.82 },
    });
  });

  test('400 if no image is sent', async () => {
    const res = await request(app).post('/api/items/analyze').set(authHeader(aleksToken));
    expect(res.status).toBe(400);
  });
});
