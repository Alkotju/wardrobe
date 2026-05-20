// weatherService talks to yr.no + Nominatim via global fetch and caches with
// node-cache. We stub global.fetch and re-require the service to get a fresh
// cache for each test — otherwise cross-test bleed would mask bugs.

function mockFetchOnce(body, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok, status,
    json: async () => body,
  });
}

function loadService() {
  jest.resetModules();
  // eslint-disable-next-line global-require
  return require('../../src/services/weatherService');
}

const sampleForecastBody = {
  properties: {
    timeseries: [
      {
        time: '2026-05-18T09:00:00Z',
        data: {
          instant: { details: { air_temperature: 12, relative_humidity: 60, wind_speed: 3, air_pressure_at_sea_level: 1015 } },
          next_1_hours: { details: { precipitation_amount: 0.2 }, summary: { symbol_code: 'cloudy' } },
        },
      },
      {
        time: '2026-05-18T12:00:00Z',
        data: {
          instant: { details: { air_temperature: 18 } },
          next_1_hours: { details: { precipitation_amount: 0 }, summary: { symbol_code: 'partlycloudy' } },
        },
      },
      {
        time: '2026-05-19T09:00:00Z',
        data: {
          instant: { details: { air_temperature: 10 } },
          next_6_hours: { details: { precipitation_amount: 1.5 }, summary: { symbol_code: 'rain' } },
        },
      },
    ],
  },
};

describe('fetchForecast', () => {
  test('summarizes timeseries into per-day buckets', async () => {
    mockFetchOnce(sampleForecastBody);
    const { fetchForecast } = loadService();
    const days = await fetchForecast('59.4370', '24.7536');
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      date: '2026-05-18',
      symbolCode: 'cloudy',
      tempMin: 12,
      tempMax: 18,
      precipitationAmount: 0.2,
    });
    expect(days[1]).toMatchObject({
      date: '2026-05-19',
      symbolCode: 'rain',
      precipitationAmount: 1.5,
    });
  });

  test('caches the result — second call does NOT re-fetch', async () => {
    const { fetchForecast } = loadService();
    mockFetchOnce(sampleForecastBody);
    await fetchForecast('59.4370', '24.7536');
    await fetchForecast('59.4370', '24.7536');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('different coordinates hit different cache keys', async () => {
    const { fetchForecast } = loadService();
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => sampleForecastBody })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => sampleForecastBody });
    await fetchForecast('59.4370', '24.7536');
    await fetchForecast('60.0000', '25.0000');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('throws err.status=502 when yr.no is unhappy', async () => {
    const { fetchForecast } = loadService();
    mockFetchOnce({}, { ok: false, status: 503 });
    await expect(fetchForecast('59.4', '24.7')).rejects.toMatchObject({ status: 502 });
  });

  test('handles empty timeseries gracefully', async () => {
    const { fetchForecast } = loadService();
    mockFetchOnce({ properties: { timeseries: [] } });
    const days = await fetchForecast('59.4', '24.7');
    expect(days).toEqual([]);
  });
});

describe('fetchHourly', () => {
  test('returns first N hourly points with the expected fields', async () => {
    const { fetchHourly } = loadService();
    mockFetchOnce(sampleForecastBody);
    const hours = await fetchHourly('59.4370', '24.7536', 2);
    expect(hours).toHaveLength(2);
    expect(hours[0]).toMatchObject({
      time: '2026-05-18T09:00:00Z',
      air_temperature: 12,
      relative_humidity: 60,
      symbol_code: 'cloudy',
    });
  });

  test('default to 24 hours when not specified', async () => {
    const { fetchHourly } = loadService();
    const big = {
      properties: {
        timeseries: Array.from({ length: 50 }, (_, i) => ({
          time: `2026-05-18T${String(i % 24).padStart(2, '0')}:00:00Z`,
          data: { instant: { details: { air_temperature: i } } },
        })),
      },
    };
    mockFetchOnce(big);
    const hours = await fetchHourly('59.4', '24.7');
    expect(hours).toHaveLength(24);
  });

  test('502 on upstream HTTP failure', async () => {
    const { fetchHourly } = loadService();
    mockFetchOnce({}, { ok: false, status: 500 });
    await expect(fetchHourly('59.4', '24.7', 6)).rejects.toMatchObject({ status: 502 });
  });

  test('fills missing fields with null/0 defaults', async () => {
    const { fetchHourly } = loadService();
    mockFetchOnce({
      properties: {
        timeseries: [{ time: '2026-05-18T09:00:00Z', data: { instant: { details: {} } } }],
      },
    });
    const [first] = await fetchHourly('59.4', '24.7', 1);
    expect(first).toMatchObject({
      air_temperature: null,
      relative_humidity: null,
      wind_speed: null,
      air_pressure_at_sea_level: null,
      precipitation_amount: 0,
      symbol_code: null,
    });
  });
});

describe('geocode', () => {
  test('maps Nominatim results to {displayName, lat, lon}', async () => {
    const { geocode } = loadService();
    mockFetchOnce([
      { display_name: 'Tallinn, Estonia', lat: '59.4370', lon: '24.7536' },
      { display_name: 'Tartu, Estonia', lat: '58.3776', lon: '26.7290' },
    ]);
    const results = await geocode('Tallinn');
    expect(results).toEqual([
      { displayName: 'Tallinn, Estonia', lat: '59.4370', lon: '24.7536' },
      { displayName: 'Tartu, Estonia', lat: '58.3776', lon: '26.7290' },
    ]);
  });

  test('502 on upstream failure', async () => {
    const { geocode } = loadService();
    mockFetchOnce({}, { ok: false, status: 504 });
    await expect(geocode('whatever')).rejects.toMatchObject({ status: 502 });
  });

  test('passes User-Agent header (yr.no/Nominatim require it)', async () => {
    const { geocode } = loadService();
    mockFetchOnce([]);
    await geocode('Tallinn');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      })
    );
  });
});
