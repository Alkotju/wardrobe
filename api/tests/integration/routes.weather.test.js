// Weather routes are thin pass-throughs to weatherService. We mock the
// service to keep these tests deterministic (no real HTTP).

jest.mock('../../src/services/weatherService', () => ({
  fetchForecast: jest.fn(),
  fetchHourly: jest.fn(),
  geocode: jest.fn(),
}));

const request = require('supertest');
const weatherService = require('../../src/services/weatherService');

const { startMemoryMongo, stopMemoryMongo, clearAllCollections } = require('../setup/memoryMongo');
const { buildApp } = require('../helpers/appFactory');
const { createUser, signTokenFor, authHeader } = require('../fixtures/users');

let app;
let token;

beforeAll(async () => {
  await startMemoryMongo();
  app = buildApp();
});
afterAll(async () => { await stopMemoryMongo(); });

beforeEach(async () => {
  await clearAllCollections();
  const { user } = await createUser({ username: 'aleks' });
  token = signTokenFor(user);
  weatherService.fetchForecast.mockReset();
  weatherService.fetchHourly.mockReset();
  weatherService.geocode.mockReset();
});

describe('GET /api/weather', () => {
  test('401 without auth', async () => {
    const res = await request(app).get('/api/weather?lat=59.4&lon=24.7');
    expect(res.status).toBe(401);
  });

  test('200 + days payload', async () => {
    weatherService.fetchForecast.mockResolvedValueOnce([{ date: '2026-05-18', tempMin: 5, tempMax: 12 }]);
    const res = await request(app)
      .get('/api/weather?lat=59.4&lon=24.7').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([{ date: '2026-05-18', tempMin: 5, tempMax: 12 }]);
  });

  test('400 when lat/lon out of range', async () => {
    const res = await request(app)
      .get('/api/weather?lat=999&lon=24.7').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test('400 when lat/lon missing', async () => {
    const res = await request(app).get('/api/weather').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test('coords are rounded to 4 decimals before being forwarded', async () => {
    weatherService.fetchForecast.mockResolvedValueOnce([]);
    await request(app)
      .get('/api/weather?lat=59.43701234&lon=24.75361234').set(authHeader(token));
    expect(weatherService.fetchForecast).toHaveBeenCalledWith('59.4370', '24.7536');
  });

  test('502 propagated when upstream fails', async () => {
    const err = new Error('upstream'); err.status = 502;
    weatherService.fetchForecast.mockRejectedValueOnce(err);
    const res = await request(app)
      .get('/api/weather?lat=59.4&lon=24.7').set(authHeader(token));
    expect(res.status).toBe(502);
  });
});

describe('GET /api/weather/hourly', () => {
  test('default 24 hours when not specified', async () => {
    weatherService.fetchHourly.mockResolvedValueOnce([]);
    await request(app)
      .get('/api/weather/hourly?lat=59.4&lon=24.7').set(authHeader(token));
    expect(weatherService.fetchHourly).toHaveBeenCalledWith('59.4000', '24.7000', 24);
  });

  test('respects custom hours param', async () => {
    weatherService.fetchHourly.mockResolvedValueOnce([]);
    await request(app)
      .get('/api/weather/hourly?lat=59.4&lon=24.7&hours=6').set(authHeader(token));
    expect(weatherService.fetchHourly).toHaveBeenCalledWith('59.4000', '24.7000', 6);
  });

  test('400 when hours > 72', async () => {
    const res = await request(app)
      .get('/api/weather/hourly?lat=59.4&lon=24.7&hours=200').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test('400 when hours < 1', async () => {
    const res = await request(app)
      .get('/api/weather/hourly?lat=59.4&lon=24.7&hours=0').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/weather/geocode', () => {
  test('200 + array forwarded from service', async () => {
    weatherService.geocode.mockResolvedValueOnce([{ displayName: 'Tallinn', lat: '1', lon: '2' }]);
    const res = await request(app)
      .get('/api/weather/geocode?q=Tallinn').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ displayName: 'Tallinn', lat: '1', lon: '2' }]);
  });

  test('400 when q is too short', async () => {
    const res = await request(app)
      .get('/api/weather/geocode?q=a').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test('400 when q is missing', async () => {
    const res = await request(app).get('/api/weather/geocode').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});
