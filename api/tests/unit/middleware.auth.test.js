// Unit tests for requireAuth / requireAdmin / requireOwnership.
// We exercise the middleware functions directly with synthetic req/res/next
// so the tests don't need an Express app or Mongo connection (except for
// requireOwnership, which is intentionally a Mongoose-aware integration).

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { requireAuth, requireAdmin, requireOwnership } = require('../../src/middleware/auth');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  test('401 when Authorization header is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing or invalid Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('401 when scheme is not Bearer', () => {
    const req = { headers: { authorization: 'Basic abc' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 when token is missing after Bearer', () => {
    const req = { headers: { authorization: 'Bearer ' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('401 when token is invalid/expired', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches req.user and calls next on valid JWT', () => {
    const token = jwt.sign(
      { sub: 'user-id-1', username: 'aleks', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 'user-id-1', username: 'aleks', role: 'user' });
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'x', username: 'x', role: 'user' }, 'wrong-secret', { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  test('403 if req.user is missing', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 if role !== admin', () => {
    const req = { user: { role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Admin privileges required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('passes when role === admin', () => {
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireOwnership', () => {
  // Build a fake Mongoose-like Model. We don't need a DB here; just verify
  // the middleware branches on the document's owner field.
  function fakeModel(doc) {
    return { findById: jest.fn().mockResolvedValue(doc) };
  }

  test('404 when document not found', async () => {
    const Model = fakeModel(null);
    const req = { params: { id: 'x' }, user: { id: 'u1', role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('403 when caller is not owner and not admin', async () => {
    const doc = { owner: new mongoose.Types.ObjectId() };
    const Model = fakeModel(doc);
    const req = { params: { id: 'x' }, user: { id: 'someone-else', role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('admin bypasses ownership check', async () => {
    const otherUserId = new mongoose.Types.ObjectId();
    const doc = { owner: otherUserId };
    const Model = fakeModel(doc);
    const req = { params: { id: 'x' }, user: { id: 'admin-1', role: 'admin' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.resource).toBe(doc);
  });

  test('owner passes and document is attached as req.resource', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const doc = { owner: ownerId, _id: 'd1' };
    const Model = fakeModel(doc);
    const req = { params: { id: 'd1' }, user: { id: String(ownerId), role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.resource).toBe(doc);
  });

  test('forwards thrown errors to next() (e.g. invalid ObjectId Cast)', async () => {
    const Model = { findById: jest.fn().mockRejectedValue(new Error('cast failed')) };
    const req = { params: { id: 'bad' }, user: { id: 'u', role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('handles document with null owner (e.g. orphaned) → 403 for non-admin', async () => {
    const doc = { owner: null };
    const Model = fakeModel(doc);
    const req = { params: { id: 'x' }, user: { id: 'u1', role: 'user' } };
    const res = mockRes();
    const next = jest.fn();

    await requireOwnership(Model)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
