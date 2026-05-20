const NodeCache = require('node-cache');

const FORECAST_TTL_SECONDS = 30 * 60;
const cache = new NodeCache({ stdTTL: FORECAST_TTL_SECONDS, checkperiod: 120 });
const USER_AGENT = process.env.YR_USER_AGENT || 'WardrobeApp/1.0 contact@example.com';

// EN: Requests a weather forecast for the coordinates from yr.no, cached, and returns a 3-day summary.
// ET: Pärib yr.no-st koordinaatide ilmaennustuse, vahemällu salvestatud kujul, ja tagastab 3 päeva kokkuvõtte.
// RU: Запрашивает у yr.no прогноз погоды по координатам, с кэшированием, и возвращает сводку на 3 дня.
async function fetchForecast(lat, lon) {
  const key = `forecast:${lat}:${lon}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`yr.no returned HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const days = summarizeDays(data, 3);
  cache.set(key, days);
  return days;
}

// EN: Groups the yr.no time series into days, computing each day's min/max temperature, precipitation, and weather symbol.
// ET: Koondab yr.no ajaseeria päevadeks, arvutades iga päeva min/max temperatuuri, sademed ja ilmasümboli.
// RU: Группирует временной ряд yr.no по дням, вычисляя для каждого мин/макс температуру, осадки и символ погоды.
function summarizeDays(data, dayCount) {
  const series = (data && data.properties && data.properties.timeseries) || [];
  const buckets = new Map();

  for (const point of series) {
    const date = point.time.slice(0, 10);
    if (!buckets.has(date)) {
      buckets.set(date, { date, temps: [], precipitation: 0, symbolCode: null });
    }
    const bucket = buckets.get(date);

    const inst = point.data.instant && point.data.instant.details;
    if (inst && typeof inst.air_temperature === 'number') {
      bucket.temps.push(inst.air_temperature);
    }

    const next = point.data.next_1_hours || point.data.next_6_hours;
    if (next) {
      if (next.details && typeof next.details.precipitation_amount === 'number') {
        bucket.precipitation += next.details.precipitation_amount;
      }
      if (next.summary && next.summary.symbol_code && !bucket.symbolCode) {
        bucket.symbolCode = next.summary.symbol_code;
      }
    }
  }

  return Array.from(buckets.values()).slice(0, dayCount).map((b) => ({
    date: b.date,
    symbolCode: b.symbolCode,
    tempMin: b.temps.length ? Math.min(...b.temps) : null,
    tempMax: b.temps.length ? Math.max(...b.temps) : null,
    precipitationAmount: Number(b.precipitation.toFixed(2)),
  }));
}

// EN: Requests an hourly weather forecast from yr.no and returns the cached hours with extended fields.
// ET: Pärib yr.no-st tunnipõhise ilmaennustuse ja tagastab vahemällu salvestatuna laiendatud väljadega tunnid.
// RU: Запрашивает у yr.no почасовой прогноз погоды и возвращает кэшированные часы с расширенными полями.
async function fetchHourly(lat, lon, hours = 24) {
  const key = `hourly:${lat}:${lon}:${hours}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`yr.no returned HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  const series = (data && data.properties && data.properties.timeseries) || [];

  const out = series.slice(0, hours).map((item) => {
    const inst = (item.data.instant && item.data.instant.details) || {};
    const next1 = item.data.next_1_hours || {};
    return {
      time: item.time,
      air_temperature: inst.air_temperature ?? null,
      relative_humidity: inst.relative_humidity ?? null,
      wind_speed: inst.wind_speed ?? null,
      air_pressure_at_sea_level: inst.air_pressure_at_sea_level ?? null,
      precipitation_amount: (next1.details && next1.details.precipitation_amount) ?? 0,
      symbol_code: (next1.summary && next1.summary.symbol_code) ?? null,
    };
  });

  cache.set(key, out);
  return out;
}

// EN: Geocodes a place name via Nominatim, returning matching locations with their coordinates.
// ET: Geokodeerib kohanime Nominatimi kaudu, tagastades sobivad asukohad koos koordinaatidega.
// RU: Геокодирует название места через Nominatim, возвращая подходящие локации с координатами.
async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`Nominatim returned HTTP ${res.status}`);
    err.status = 502;
    throw err;
  }
  const data = await res.json();
  return data.map((r) => ({ displayName: r.display_name, lat: r.lat, lon: r.lon }));
}

module.exports = { fetchForecast, fetchHourly, geocode };
