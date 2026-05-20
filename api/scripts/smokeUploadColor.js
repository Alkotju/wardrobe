const sharp = require('sharp');
const http = require('http');

// ET: Suitsutest — logib sisse, laadib üles sinise PNG-i ja kontrollib, et vastus sisaldab värvianalüüsi.
// RU: Дымовой тест — выполняет вход, загружает синий PNG и проверяет, что ответ содержит анализ цвета.
(async () => {
  const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('SEED_ADMIN_PASSWORD not set in env');
    process.exit(1);
  }

  const login = await jsonReq('POST', '/api/auth/login', null,
    { username: adminUsername, password: adminPassword });
  if (login.status !== 200) {
    console.error('Login failed:', login);
    process.exit(1);
  }
  const token = login.body.token;
  console.log('[ok] logged in');

  const png = await sharp({
    create: { width: 512, height: 512, channels: 4,
      background: { r: 40, g: 70, b: 200, alpha: 1 } }
  }).png().toBuffer();

  const t0a = Date.now();
  const analyze = await multipartReq('/api/items/analyze', token, png);
  const dtA = Date.now() - t0a;
  console.log('[ok] /api/items/analyze', analyze.status, 'in', dtA, 'ms');
  console.log('     response:', JSON.stringify(analyze.body));
  if (!analyze.body.color || analyze.body.color.label !== 'Sinine') {
    console.log('[!!] /analyze did not return Sinine');
    process.exit(2);
  }
  console.log('[ok] /analyze correctly returned Sinine');

  const t0u = Date.now();
  const upload = await multipartReq('/api/items/upload', token, png);
  const dtU = Date.now() - t0u;
  console.log('[ok] /api/items/upload', upload.status, 'in', dtU, 'ms');
  console.log('     analysis field present:', 'analysis' in upload.body);
})().catch((err) => { console.error('FAIL:', err); process.exit(1); });

// ET: Saadab JSON-päringu API-le ja tagastab lubaduse vastuse staatuse ja parsitud kehaga.
// RU: Отправляет JSON-запрос к API и возвращает промис со статусом ответа и разобранным телом.
function jsonReq(method, path, token, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request(
      { hostname: '127.0.0.1', port: 3000, path, method, headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ET: Saadab multipart/form-data päringu pildifailiga ja tagastab lubaduse vastuse staatuse ja kehaga.
// RU: Отправляет запрос multipart/form-data с файлом изображения и возвращает промис со статусом и телом ответа.
function multipartReq(path, token, fileBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----formboundary' + Date.now();
    const head = Buffer.from(
      '--' + boundary + '\r\n'
      + 'Content-Disposition: form-data; name="image"; filename="smoke.png"\r\n'
      + 'Content-Type: image/png\r\n\r\n'
    );
    const tail = Buffer.from('\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([head, fileBuffer, tail]);
    const req = http.request(
      {
        hostname: '127.0.0.1', port: 3000, path, method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
