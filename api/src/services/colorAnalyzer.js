const sharp = require('sharp');

const PALETTE = [
  { label: 'Черный',     hex: '#1a1a1a' },
  { label: 'Белый',    hex: '#f2f2f2' },
  { label: 'Серый',     hex: '#808080' },
  { label: 'Красный',   hex: '#c0392b' },
  { label: 'Синий',   hex: '#2c5cb5' },
  { label: 'Зеленый', hex: '#27ae60' },
  { label: 'Желтый',  hex: '#f1c40f' },
  { label: 'Розовый',    hex: '#e89bb8' },
  { label: 'Коричнывый',    hex: '#8b5a2b' },
  { label: 'Бежевый',     hex: '#d8c4a8' },
  { label: 'Лиловый',    hex: '#8e44ad' },
  { label: 'Оранжевый',    hex: '#e67e22' },
];

// ET: Teisendab kuueteistkümnendvärvi (#rrggbb) RGB-komponentide massiiviks [r, g, b].
// RU: Преобразует шестнадцатеричный цвет (#rrggbb) в массив RGB-компонентов [r, g, b].
function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

// ET: Teisendab RGB-komponendid kuueteistkümnendvärvi stringiks (#rrggbb), kärpides väärtused vahemikku 0–255.
// RU: Преобразует RGB-компоненты в шестнадцатеричную строку цвета (#rrggbb), ограничивая значения диапазоном 0–255.
function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

// ET: Teisendab RGB-värvi CIE LAB-ruumi, kus kaugus vastab paremini inimese värvitajule.
// RU: Преобразует цвет RGB в пространство CIE LAB, где расстояние лучше соответствует восприятию цвета человеком.
function rgbToLab(r, g, b) {
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
  const Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
  const xr = X / 0.95047, yr = Y / 1.00000, zr = Z / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116));
  const fx = f(xr), fy = f(yr), fz = f(zr);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// ET: Arvutab eukleidilise kauguse kahe LAB-värvi vahel — mida väiksem, seda sarnasemad värvid.
// RU: Вычисляет евклидово расстояние между двумя цветами LAB — чем меньше, тем более схожи цвета.
function labDistance(a, b) {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

const PALETTE_LAB = PALETTE.map((p) => {
  const [r, g, b] = hexToRgb(p.hex);
  return Object.assign({}, p, { lab: rgbToLab(r, g, b) });
});

// ET: Leiab antud RGB-värvile lähima eestikeelse paletivärvi nime LAB-kauguse järgi.
// RU: Находит для заданного цвета RGB ближайшее название цвета из эстонской палитры по расстоянию LAB.
function nearestPaletteLabel(r, g, b) {
  const target = rgbToLab(r, g, b);
  let best = PALETTE_LAB[0];
  let bestDist = Infinity;
  for (const p of PALETTE_LAB) {
    const d = labDistance(target, p.lab);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best.label;
}

// ET: Puhas-JS tuum: analüüsib pikslimassiivi, hääletab iga piksli paletivärvi poolt ja tagastab võitnud värvi { hex, label, confidence }.
// RU: Чистое JS-ядро: анализирует массив пикселей, голосует за цвет палитры для каждого пикселя и возвращает победивший цвет { hex, label, confidence }.
function analyzePixels(data, info, step) {
  const { width, height } = info;
  const channels = info.channels || 4;
  const hasAlpha = channels >= 4;
  const s = step || 4;

  const ALPHA_MIN = 200;

  const bucketToLabel = new Map();

  const labelTally = new Map();
  let totalCount = 0;

  for (let y = 0; y < height; y += s) {
    for (let x = 0; x < width; x += s) {
      const i = (y * width + x) * channels;
      if (hasAlpha && data[i + 3] < ALPHA_MIN) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
      let label = bucketToLabel.get(key);
      if (label === undefined) {
        label = nearestPaletteLabel(r, g, b);
        bucketToLabel.set(key, label);
      }
      let entry = labelTally.get(label);
      if (!entry) {
        entry = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
        labelTally.set(label, entry);
      }
      entry.count++;
      entry.sumR += r;
      entry.sumG += g;
      entry.sumB += b;
      totalCount++;
    }
  }

  if (totalCount === 0) return null;

  let winnerLabel = null;
  let winnerEntry = null;
  for (const [label, entry] of labelTally) {
    if (!winnerEntry || entry.count > winnerEntry.count) {
      winnerLabel = label;
      winnerEntry = entry;
    }
  }

  const r = winnerEntry.sumR / winnerEntry.count;
  const g = winnerEntry.sumG / winnerEntry.count;
  const b = winnerEntry.sumB / winnerEntry.count;

  return {
    hex: rgbToHex(r, g, b),
    label: winnerLabel,
    confidence: Math.round((winnerEntry.count / totalCount) * 1000) / 1000,
  };
}

// ET: Tootmise sisendpunkt: dekodeerib taustata PNG-puhvri toorpiksliteks ja käivitab täisvärvianalüüsi.
// RU: Производственная точка входа: декодирует PNG-буфер без фона в сырые пиксели и запускает полный анализ цвета.
async function detectColor(processedBuffer) {
  const { data, info } = await sharp(processedBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return analyzePixels(data, info, 4);
}

module.exports = { detectColor, analyzePixels, PALETTE, rgbToLab, rgbToHex };
