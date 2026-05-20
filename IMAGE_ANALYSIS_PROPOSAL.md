# Авто-анализ загруженных изображений (`/api/items/analyze`)

**Статус:** предложение, не реализовано.
**Текущий код:** [`api/src/routes/items.js`](api/src/routes/items.js) — эндпоинт смонтирован, но `analyzeImage()` в [`api/src/services/imageProcessor.js`](api/src/services/imageProcessor.js) всегда бросает `501 Not Implemented`.
**Цель:** при загрузке фото вещи автоматически предложить пользователю **цвет**, **категорию** и **материал**, чтобы заполнять модалку быстрее. Пользователь всегда может перезаписать предложение.

---

## Общий поток

```
img.png ─► @imgly removeBackground ─► processedBuffer (PNG с alpha)
                                         │
                                         ├─► colorAnalyzer.js   ─► { hex, label, confidence }
                                         │
                                         └─► clipAnalyzer.js
                                              ├─► CLIP vision encoder ─► image embedding (1×512)
                                              ├─► cos-sim против предкэшированных text embeddings меток
                                              └─► top-1 для category + top-1 для material

results ─► API ─► frontend prefill (только пустые поля)
```

Два трека идут параллельно через `Promise.all` — статистика по пикселям и CLIP сидят на разных CPU-путях.

---

## 1. Цвет — без ML

Новый файл: `api/src/services/colorAnalyzer.js`.

**Алгоритм:**
1. Декодируем PNG через `pngjs` (чистый JS, ~30 КБ, без нативных модулей).
2. Сэмплируем каждый 4-й пиксель (×16 быстрее, без потери точности для доминантного цвета).
3. Игнорируем пиксели с `alpha=0` — это и есть удалённый фон.
4. Квантуем RGB до 4 бит на канал → 4096-вёдер гистограмма.
5. Берём топ-3 ведра, объединяем близкие (Δ<32 в RGB), средневзвешиваем → итоговый `hex`.
6. Сопоставляем с фиксированной палитрой через минимум евклидова расстояния **в LAB-пространстве** (RGB не годится — плохо коррелирует с человеческим восприятием).

**Палитра (эстонская):**
```
Must Valge Hall Punane Sinine Roheline Kollane
Roosi Pruun Beež Lilla Oranž
```

**Выход:** `{ hex: '#3a5b9c', label: 'Sinine', confidence: 0.82 }`.
`confidence` = доля выбранного кластера в общем объёме непрозрачных пикселей.

**Зависимости:** `+pngjs`. Всё. Самостоятельная правка, можно реализовать без CLIP и уже получить половину пользы.

---

## 2. Категория и материал — CLIP zero-shot локально

Новый файл: `api/src/services/clipAnalyzer.js`.

**Чем считаем:** [`@xenova/transformers`](https://huggingface.co/docs/transformers.js) — node-сборка Transformers.js, модель `Xenova/clip-vit-base-patch32`. Тот же `onnxruntime-node`, что у `@imgly` — никаких новых нативных зависимостей.

**Почему CLIP zero-shot:**
- Не нужно тренировать модель или собирать датасет одежды.
- Модель локальная (~150 МБ), скачивается один раз при первом запуске в `~/.cache/huggingface/`.
- Метки меняются в конфиге без перетренировки.
- Точность top-1 на узких клас. одежды: 60–75% (фон уже удалён — это бонус для модели).

**Метки берём из единственного источника правды** — `CATEGORY_TREE` в [frontend/js/wardrobe.js](frontend/js/wardrobe.js):

```js
// child-label на эстонском (он же выводится в UI), parent-label для группировки,
// английский CLIP-prompt (CLIP лучше работает с английскими "a photo of a X")
const CATEGORY_LABELS = [
  ['Kleidid',     'Kleidid ja pükskostüümid',      'a photo of a dress'],
  ['Kostüümid',   'Kleidid ja pükskostüümid',      'a photo of a suit'],
  ['T-särgid',    'Pluusid, särgid ja kampsunid',  'a photo of a t-shirt'],
  ['Särgid ja pluusid', 'Pluusid, särgid ja kampsunid', 'a photo of a button-up shirt'],
  ['Kampsunid ja lühikampsunid', 'Pluusid, särgid ja kampsunid', 'a photo of a sweater'],
  ['Teksad',      'Püksid ja seelikud',            'a photo of jeans'],
  ['Seelikud',    'Püksid ja seelikud',            'a photo of a skirt'],
  ['Püksid',      'Püksid ja seelikud',            'a photo of pants'],
  ['Mantlid',     'Üleriided',                     'a photo of a coat'],
  ['Jakid',       'Üleriided',                     'a photo of a jacket'],
  ['Kingad',      'Jalatsid',                      'a photo of shoes'],
  ['Saapad',      'Jalatsid',                      'a photo of boots'],
  ['Jooksukingad','Jalatsid',                      'a photo of sneakers'],
  // … остальные ~15 листовых меток из CATEGORY_TREE
];

const MATERIAL_LABELS = [
  ['Puuvill',   'a cotton garment'],
  ['Linane',    'a linen garment'],
  ['Teksariie', 'a denim garment'],
  ['Vill',      'a wool sweater'],
  ['Nahk',      'a leather garment'],
  ['Polüester', 'synthetic polyester fabric'],
  ['Siid',      'a silk garment'],
  ['Kašmiir',   'a cashmere garment'],
];
```

**Caching:**
- Text embeddings для всех меток считаем **один раз при boot** и держим в памяти.
- На каждый `/analyze` — только vision-инференс (~200 мс на CPU).

**Lazy init:** не блокируем `server.listen()`. Первый запрос пользователя ждёт 5–10 с (загрузка модели), дальше — 200–500 мс.
Можно прогревать в фоне после старта:
```js
// server.js, сразу после app.listen
setImmediate(() => require('./src/services/clipAnalyzer').warmup().catch(console.error));
```

**Выход:**
```js
{
  category: { parent: 'Püksid ja seelikud', child: 'Teksad', confidence: 0.71 },
  material: { label: 'Teksariie', confidence: 0.64 },
}
```

---

## 3. Сборщик — `imageProcessor.js → analyzeImage`

```js
async function analyzeImage(processedBuffer) {
  const [color, clip] = await Promise.all([
    detectColor(processedBuffer),                  // colorAnalyzer.js
    detectCategoryAndMaterial(processedBuffer),    // clipAnalyzer.js
  ]);
  return {
    color,                              // { hex, label, confidence }
    suggestedCategory: clip.category,   // { parent, child, confidence }
    suggestedMaterial: clip.material,   // { label, confidence }
  };
}
```

---

## 4. Подключение на бэке — два варианта

### A. Оставить отдельный эндпоинт (как сейчас)
[`items.js:155-165`](api/src/routes/items.js#L155-L165) уже подготовлен — стираем `501`-стаб и возвращаем `analyzeImage(processedBuffer)`.

**Минус:** фронт делает три round-trip (upload preview → analyze → final create). Bg-removal проигрывается дважды, если звать `analyzeImage(req.file.buffer)` — но анализировать стоит **уже-обработанный** буфер (фон удалён, CLIP меньше шумит).

### B. Встроить анализ прямо в `/items/upload` *(рекомендую)*
[`items.js:141-152`](api/src/routes/items.js#L141-L152) уже делает preview-upload и возвращает URL без-фона. Добавляем анализ туда же:

```js
const out = await removeBackground(req.file.buffer, req.file.mimetype, req.user.id, tempId);
const analysis = await analyzeImage(out.processedBuffer); // (нужно вернуть processedBuffer из removeBackground)
res.json({ imageUrl: out.imageUrl, originalImageUrl: out.originalUrl, analysis });
```

Фронт получает превью + автозаполнение **за один запрос**. `/analyze` остаётся для будущего сценария «проанализировать уже загруженную картинку».

---

## 5. Фронтовая интеграция

[`wardrobe.js:506-543`](frontend/js/wardrobe.js#L506-L543) — `handleFileChosen`. После успеха preview-upload:

```js
if (out.analysis) {
  // ВАЖНО: prefill ТОЛЬКО пустые поля. Если пользователь уже что-то вписал — не трогаем.
  if (!modalState.colorLabel && out.analysis.color) {
    modalState.color = out.analysis.color.hex;
    modalState.colorLabel = out.analysis.color.label;
  }
  if (!modalState.parent && out.analysis.suggestedCategory) {
    modalState.parent = out.analysis.suggestedCategory.parent;
    modalState.child  = out.analysis.suggestedCategory.child;
  }
  if (!modalState.material && out.analysis.suggestedMaterial) {
    modalState.material = out.analysis.suggestedMaterial.label;
  }
  refillFormFields();
}
```

**UX-нюансы:**
- Не перезаписывать пользовательский ввод.
- Подсветить авто-заполненные поля бейджем «AI» (Lucide `sparkles`), чтобы человек видел и проверил.
- При `confidence < 0.4` — не предлагать (выводить «не уверен», поле оставлять пустым).

---

## 6. Зависимости и инфраструктура

**Добавить в `api/package.json`:**
```json
"@xenova/transformers": "^2.17.2",
"pngjs": "^7.0.0"
```

**Образ:** +~200 МБ (CLIP-модель). Рекомендую новый volume, чтобы пересборка образа не запускала повторную загрузку:
```yaml
api:
  volumes:
    - uploads:/app/uploads
    - model_cache:/home/node/.cache/huggingface
```

**RAM:** `@imgly` ~500 МБ + CLIP ~150 МБ = контейнеру нужно ≥1 ГБ.

**Время первого запуска:** +30–60 с (один раз, скачивается модель).

---

## 7. Тестирование

- **Unit** для `colorAnalyzer` — детерминированно, фикстуры-PNG известного цвета.
- **Integration** для `/api/items/upload` с мини-картинкой:
  - Утверждать **shape** ответа (`analysis.color.hex`, `analysis.suggestedCategory.child`), не конкретные значения CLIP — они зависят от модели.
  - Утверждать диапазоны (`confidence` ∈ [0,1], `hex` соответствует `/^#[0-9a-f]{6}$/`).
- Mock `@xenova/transformers` в тестах routes/items (по аналогии с `jest.mock` на `imageProcessor` в [`tests/integration/routes.items.test.js`](api/tests/integration/routes.items.test.js)), чтобы не грузить 150 МБ в CI.

---

## Что НЕ делать

- **Внешние API** (Clarifai, HuggingFace Inference, OpenAI Vision) — ломают принцип «полностью self-hosted».
- **Тренировать свою CNN на DeepFashion** — для дипломной избыточно, CLIP zero-shot покрывает 80% юзкейса бесплатно.
- **Синхронный анализ внутри `POST /api/items`** — UX просядет, человек будет ждать 1–2 с зря. Анализ должен идти на стадии preview (асинхронно к финальному сохранению).

---

## Фазы реализации

1. **MVP-1 — только цвет.** ~50 строк (`colorAnalyzer.js` + клей). Без новых нативных зависимостей. Уже даёт ощутимый UX-выигрыш.
2. **MVP-2 — добавить CLIP.** `clipAnalyzer.js`, лейблы из `CATEGORY_TREE`, lazy-warmup, integration в `/items/upload`.
3. **Polish.** UI-бейджи «AI», порог `confidence`, A/B-сравнение результатов на тестовой подборке фото, подстройка промптов.
