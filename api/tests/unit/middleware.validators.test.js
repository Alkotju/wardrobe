// runValidations is a thin adaptor over express-validator. The unit test
// exercises it inside a minimal Express app — that's still a "unit" by
// scope (no DB, no real routes) and is the only way to fairly drive the
// express-validator chain machinery.

const express = require('express');
const request = require('supertest');
const { body, query } = require('express-validator');

const { runValidations } = require('../../src/middleware/validators');

function buildSampleApp() {
  const app = express();
  app.use(express.json());
  app.post('/echo',
    runValidations([
      body('name').isString().trim().notEmpty(),
      body('age').optional().isInt({ min: 0 }),
    ]),
    (req, res) => res.json({ ok: true, body: req.body })
  );
  app.get('/search',
    runValidations([query('q').isString().isLength({ min: 2 })]),
    (req, res) => res.json({ ok: true, q: req.query.q })
  );
  return app;
}

describe('runValidations', () => {
  const app = buildSampleApp();

  test('passes valid bodies through to the handler', async () => {
    const res = await request(app).post('/echo').send({ name: 'shirt', age: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 400 with details array on failure', async () => {
    const res = await request(app).post('/echo').send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  test('short-circuits — handler is NOT invoked when validation fails', async () => {
    const res = await request(app).post('/echo').send({});
    expect(res.status).toBe(400);
    // The handler returns `{ ok: true, ... }`; the error body has no `ok`.
    expect(res.body.ok).toBeUndefined();
  });

  test('runs query validators as well as body validators', async () => {
    const res = await request(app).get('/search').query({ q: 'a' });
    expect(res.status).toBe(400);
  });

  test('collects multiple validation failures', async () => {
    const res = await request(app).post('/echo').send({ name: '', age: -1 });
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
  });
});
