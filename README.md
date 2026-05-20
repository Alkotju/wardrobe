# Wardrobe

<p align="center">
  <strong>Веб-приложение для управления личным гардеробом.</strong>
</p>

<p align="center">
  <a href="#русский">Русский</a> ·
  <a href="#eesti">Eesti</a>
</p>

---

## Русский

### О проекте

**Wardrobe** — это полностью самохостинговое веб-приложение, которое помогает каталогизировать одежду, составлять образы (outfits), собирать коллекции (например, чемодан в поездку) и держать под рукой текущую погоду. Проект разворачивается одной командой `docker compose up` и не требует внешних сервисов, кроме открытых API погоды и геокодинга.

Приложение задумано как личный «цифровой шкаф»: пользователь загружает фотографии вещей, фон автоматически удаляется, после чего вещи можно перетаскивать на мудборд, объединять в коллекции и оставлять личные заметки к каждой.

### Основные функции

- **Каталог одежды** — загрузка фото с автоматическим удалением фона (`@imgly/background-removal-node`), категоризация, теги, цвета, материал. Клик по карточке открывает фото в полноэкранном лайтбоксе; редактирование — отдельной кнопкой.
- **Авто-определение цвета** — после удаления фона анализируется доминирующий цвет вещи и сопоставляется с эстонской палитрой из 12 цветов (`Must`, `Valge`, `Hall`, `Punane`, `Sinine`, `Roheline`, `Kollane`, `Roosa`, `Pruun`, `Beež`, `Lilla`, `Oranž`). Алгоритм без ML: гистограмма + LAB-расстояние, ~10–30 мс на 1024×1024.
- **Флаги одежды** — у каждой вещи опциональные флаги `waterproof` и `windproof`; в форме это два чипа-чекбокса, на карточке/в лайтбоксе показываются миниатюрные иконки.
- **Свободный комментарий** — у каждой вещи поле для произвольной заметки до 500 символов (текстовая область со счётчиком `N/500` в форме, отображение в лайтбоксе).
- **Конструктор образов (Outfits)** — drag-and-drop мудборд на базе `interact.js` для составления комплектов одежды.
- **Коллекции** — группировка вещей для поездок, событий или сезонов.
- **Погодный виджет** — текущая погода и 3-дневный прогноз через [yr.no](https://www.yr.no/) с геокодингом через [Nominatim](https://nominatim.org/), кэш на 30 минут, ручная смена локации.
- **Аутентификация** — JWT-токены, bcrypt-хеширование паролей, rate-limiting.
- **Админ-панель** — управление пользователями, ограничение количества аккаунтов (`MAX_USERS`), кликабельный счётчик вещей в таблице (переход в гардероб выбранного пользователя).
- **Адаптивный интерфейс** — десктоп с сайдбаром, мобильная версия с нижней навигацией.
- **HTTPS из коробки** — Nginx с самоподписанным сертификатом для локального доступа.

### Технологический стек

**Backend:**
- Node.js ≥ 20, Express 4
- MongoDB 7 + Mongoose 8
- JWT (`jsonwebtoken`), bcrypt, Helmet, CORS, express-rate-limit, express-validator
- `@imgly/background-removal-node` (удаление фона, локальный ONNX-инференс — без внешних API)
- Multer (загрузка файлов), node-cache (кэширование внешних API)

**Frontend:**
- Vanilla JavaScript (без сборщиков), классические `<script defer>`
- Hash-роутинг (`#/wardrobe`, `#/outfits`, ...)
- CSS без фреймворков, шрифт Inter
- Иконки [Lucide](https://lucide.dev/), drag-and-drop через [interact.js](https://interactjs.io/)

**Инфраструктура:**
- Docker Compose (api + mongo + nginx)
- Nginx как reverse-proxy с TLS

**Внешние API:**
- [yr.no](https://api.met.no/) — прогноз погоды
- [Nominatim](https://nominatim.org/) — геокодинг

### Производительность и инфраструктура

- **Ресайз перед ONNX** — фото уменьшается до 1024 px (env `IMAGE_MAX_DIMENSION`) перед удалением фона: ~5× ускорение, без потерь для UI-карточек.
- **Sharp.raw для анализа цвета** — выходной буфер `removeBackground` декодируется нативным libvips, что в ~10× быстрее `pngjs`; никаких новых нативных зависимостей.
- **Nginx-кэш** — `gzip` для текста/JSON/SVG, `Cache-Control: public, max-age=2592000, immutable` для CSS/JS/шрифтов/картинок, `no-cache` для `index.html`.
- **MongoDB compound indexes** — `{ owner: 1, createdAt: -1 }` на `ClothingItem`, `{ owner: 1, updatedAt: -1 }` на `Outfit` и `Collection` (сортировка списков уходит на индекс, без in-memory sort).
- **Multi-stage Dockerfile** — `deps` ставит prod node_modules в отдельном слое, `runner` подтягивает только нужные файлы; кэш npm чистится; ушёл `dumb-init` (его заменил `init: true` в compose).
- **Healthcheck'и + правильный порядок старта** — `mongo healthy → api healthy → nginx`; контейнер api пингует `/api/health` каждые 30 с.
- **Лимиты RAM** — api 1 GB, mongo 1 GB (с `--wiredTigerCacheSizeGB 0.5`), nginx 128 MB.
- **Тесты** — Jest: unit-тесты для colorAnalyzer, imageProcessor, weatherService, middleware (auth, validators, errorHandler), модели User, sequentialId; integration-тесты для всех HTTP-маршрутов с in-memory MongoDB.

### Установка и запуск

#### Предварительные требования

- Docker и Docker Compose
- ~2 ГБ свободного места (для образов и моделей удаления фона)

#### Шаги

1. **Клонировать репозиторий и перейти в папку:**
   ```bash
   git clone <repo-url> wardrobe
   cd wardrobe
   ```

2. **Подготовить переменные окружения:**
   ```bash
   cp .env.example .env
   ```
   Откройте `.env` и заполните, как минимум:
   - `JWT_SECRET` — длинная случайная строка (сгенерировать: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — данные первого администратора
   - `YR_USER_AGENT` — `WardrobeApp/1.0 your@email.com` (требование yr.no)

3. **Сгенерировать самоподписанный сертификат для Nginx:**
   ```bash
   cd nginx && ./generate-self-signed.sh && cd ..
   ```

4. **Запустить контейнеры:**
   ```bash
   docker compose up -d --build
   ```

5. **Создать первого администратора:**
   ```bash
   docker compose exec api npm run seed
   ```

6. **Открыть в браузере:** [https://localhost](https://localhost) (примите предупреждение о самоподписанном сертификате).

#### Локальная разработка backend

```bash
cd api
npm install
npm run dev    # node --watch
```

### Запуск тестов

**Backend (Jest + Supertest + in-memory MongoDB):**

```bash
cd api
npm install
npm test                       # все тесты
npm test -- --coverage         # с отчётом покрытия
npm test -- tests/unit         # только unit-тесты
npm test -- tests/integration  # только integration-тесты
```

**Frontend (Jest + jsdom):**

```bash
cd frontend
npm install
npm test
```

Integration-тесты используют `mongodb-memory-server`, поэтому отдельная БД для прогона не нужна — окружение поднимается в памяти и удаляется по завершении.

### Переменные окружения

| Переменная | Обязательная | Описание |
|---|---|---|
| `JWT_SECRET` | да | Секрет для подписи JWT (≥ 64 байт) |
| `JWT_EXPIRES_IN` | нет | Время жизни токена, по умолчанию `7d` |
| `MONGO_URI` | да | Строка подключения к MongoDB |
| `PORT` | нет | Порт API, по умолчанию `4000` |
| `MAX_USERS` | нет | Лимит пользователей, по умолчанию `10` |
| `SEED_ADMIN_USERNAME` | да | Логин первого администратора |
| `SEED_ADMIN_EMAIL` | да | Email первого администратора |
| `SEED_ADMIN_PASSWORD` | да | Пароль первого администратора |
| `YR_USER_AGENT` | да | User-Agent для запросов к yr.no |
| `IMAGE_MAX_DIMENSION` | нет | Макс. сторона фото перед ONNX, по умолчанию `1024` |
| `RATE_LIMIT_WINDOW_MS` | нет | Окно rate-limit, по умолчанию `900000` (15 мин) |
| `RATE_LIMIT_MAX` | нет | Запросов в окне, по умолчанию `100` |

### Примеры использования

- **Добавить вещь:** раздел *Wardrobe* → кнопка «+» → загрузить фото → выбрать категорию, цвет, материал, флаги, добавить комментарий.
- **Собрать образ:** *Outfits* → «Создать» → перетащить вещи на холст → сохранить.
- **Собрать чемодан:** *Collections* → создать коллекцию «Отпуск в Италии» → добавить нужные вещи.
- **Проверить погоду:** виджет в сайдбаре (или верхней панели на мобильных) показывает текущую погоду и 3-дневный прогноз.

### Структура проекта

```
.
├── api/                       # Backend (Node.js / Express)
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js              # Точка входа, middleware, маршруты
│   ├── scripts/
│   │   ├── seedAdmin.js       # Создание первого администратора
│   │   └── cleanupUsers.js    # Сброс БД к канонической раскладке (admin + aleks + test)
│   └── src/
│       ├── config/db.js       # Подключение к MongoDB
│       ├── middleware/        # auth, errorHandler, upload, validators
│       ├── models/            # Mongoose: User, ClothingItem, Outfit, Collection, Counter
│       ├── routes/            # auth, items, outfits, collections, weather, users
│       ├── services/          # imageProcessor, colorAnalyzer (Фаза 1), weatherService
│       └── utils/sequentialId.js
│
├── frontend/                  # SPA (vanilla JS, без сборки)
│   ├── index.html             # Оболочка приложения
│   ├── js/
│   │   ├── api.js             # HTTP-клиент к backend
│   │   ├── store.js           # Глобальное состояние
│   │   ├── auth.js            # Логин / JWT
│   │   ├── router.js          # Hash-роутер, точка инициализации
│   │   ├── wardrobe.js        # Раздел гардероба
│   │   ├── outfits.js         # Конструктор образов
│   │   ├── collections.js     # Коллекции
│   │   ├── weather.js         # Погодный виджет
│   │   └── admin.js           # Админ-панель
│   └── styles/
│       ├── main.css
│       └── components.css
│
├── nginx/                     # Reverse-proxy
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── certs/                 # Самоподписанные TLS-сертификаты
│   └── generate-self-signed.sh
│
├── docker-compose.yml         # api + mongo + nginx
├── .env.example
├── .dockerignore
└── .gitignore
```

### Обзор API

Все маршруты доступны под префиксом `/api`. Защищённые маршруты требуют заголовок `Authorization: Bearer <jwt>`.

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| `POST` | `/auth/login` | public | Логин, возвращает JWT |
| `POST` | `/auth/logout` | user | Логаут |
| `GET` | `/items` | user | Список вещей с фильтрами `color/category/material/search` |
| `POST` | `/items` | user | Создать вещь (multipart с фото) |
| `PUT` | `/items/:id` | user | Обновить вещь |
| `DELETE` | `/items/:id` | user | Удалить вещь |
| `GET` | `/outfits` | user | Список образов |
| `POST / PUT / DELETE` | `/outfits[/:id]` | user | CRUD образов |
| `GET` | `/collections` | user | Список коллекций |
| `POST / PUT / DELETE` | `/collections[/:id]` | user | CRUD коллекций |
| `GET` | `/weather?lat=&lon=` | user | Текущая погода и 3-дневный прогноз |
| `GET` | `/weather/geocode?q=` | user | Геокодинг через Nominatim |
| `GET` | `/users` | admin | Список пользователей |
| `POST` | `/users` | admin | Создать пользователя |
| `DELETE` | `/users/:id` | admin | Удалить пользователя |
| `GET` | `/users/:id/items` | admin | Гардероб выбранного пользователя |
| `GET` | `/health` | public | Healthcheck для Docker |

### Планы развития

- ✅ ~~Авто-определение **цвета**~~ — реализовано (Фаза 1).
- Авто-определение **категории и материала** через CLIP zero-shot — Фаза 2, не реализовано: ~150 МБ к образу и ~200–500 мс к запросу; подробности в [IMAGE_ANALYSIS_PROPOSAL.md](IMAGE_ANALYSIS_PROPOSAL.md).
- Статистика носки вещей (как часто, в какую погоду) — после накопления событий открывает путь к персонализации подбора.
- Экспорт/импорт гардероба (JSON / ZIP с фото).
- Полноценная локализация интерфейса (RU / EN / ET).
- Push-уведомления PWA.
- Виртуальная примерка / preview образа.

### Автор, участники и лицензия

- **Автор и единственный разработчик:** Александра Кот — backend, frontend, инфраструктура, дизайн, тесты, документация.
- **Руководитель работы:** *<имя руководителя>*.
- **Контекст:** выпускная (дипломная) работа — *lõputöö*.
- **Лицензия:** MIT (если не указано иное в `LICENSE`).

---

## Eesti

### Projektist

**Wardrobe** on täielikult ise-majutatav veebirakendus riiete kataloogimiseks, kombinatsioonide (outfits) loomiseks, kollektsioonide (nt reisikohver) koostamiseks ja ilmaprognoosi käepärast hoidmiseks. Rakendus käivitub ühe käsuga `docker compose up` ning ei sõltu ühestki välisteenusest peale avalike ilmastiku- ja geokodeerimise API-de.

Rakendus on mõeldud kui isiklik "digitaalne kapp": laadid üles riideeseme foto, taust eemaldatakse automaatselt, seejärel saad esemeid lohistada mudilauale, koondada kollektsioonidesse ja jätta iga eseme juurde vabas vormis märkmeid.

### Põhifunktsioonid

- **Riietuse kataloog** — fotode üleslaadimine automaatse tausta eemaldamisega (`@imgly/background-removal-node`), kategooriad, sildid, värvid, materjal. Kaardile klõpsamine avab foto täisekraani-eelvaates; redigeerimine on eraldi nuppu taga.
- **Värvi automaatne tuvastus** — pärast tausta eemaldamist analüüsitakse domineerivat värvi ja sobitatakse seda 12-värvise eesti paletiga (`Must`, `Valge`, `Hall`, `Punane`, `Sinine`, `Roheline`, `Kollane`, `Roosa`, `Pruun`, `Beež`, `Lilla`, `Oranž`). ML-vaba algoritm: histogramm + LAB-kaugus, ~10–30 ms 1024×1024 fotol.
- **Eseme lipud** — igal esemel valikulised lipud `waterproof` ja `windproof`; vormis kaks toggle-tšippi, kaardil/eelvaates kuvatakse väikesed ikoonid.
- **Vabas vormis kommentaar** — igal esemel valikuline märkmete väli (textarea, maks 500 tähemärki) elava loenduriga vormis ja eraldi reaga eelvaates.
- **Kombinatsioonide konstruktor** — lohistatav mudilaud `interact.js` põhjal.
- **Kollektsioonid** — esemete grupeerimine reisideks, sündmusteks või hooaegadeks.
- **Ilma vidin** — hetkeolukord ja 3-päevane prognoos [yr.no](https://www.yr.no/) kaudu, geokodeerimine [Nominatim](https://nominatim.org/)-iga, 30-minutiline vahemälu, asukoha käsitsi vahetus.
- **Autentimine** — JWT-tokenid, bcrypt-räsimine, päringusageduse piiramine.
- **Administraatori paneel** — kasutajate haldus, maksimaalse kasutajate arvu piirang (`MAX_USERS`); esemete arv kasutajate tabelis on klõpsatav link valitud kasutaja garderoobi.
- **Kohanduv kasutajaliides** — töölaual külgriba, mobiilis alumine navigatsioon.
- **HTTPS karbist** — Nginx ise-allkirjastatud sertifikaadiga kohalikuks kasutamiseks.

### Tehnoloogiad

**Backend:** Node.js ≥ 20, Express 4, MongoDB 7 + Mongoose 8, JWT, bcrypt, Helmet, CORS, express-rate-limit, express-validator, Multer, node-cache, `@imgly/background-removal-node` (kohalik ONNX).

**Frontend:** puhas JavaScript (ilma kogujata), klassikalised `<script defer>`, hash-marsruutimine, raamistikuvaba CSS, Inter font, [Lucide](https://lucide.dev/) ikoonid, [interact.js](https://interactjs.io/) lohistamiseks.

**Infrastruktuur:** Docker Compose (api + mongo + nginx), Nginx pöördpuhver TLS-iga.

**Välised API-d:** [yr.no](https://api.met.no/) (ilm), [Nominatim](https://nominatim.org/) (geokodeerimine).

### Jõudlus ja infrastruktuur

- **Suuruse vähendamine enne ONNX-i** — fotod skaleeritakse enne tausta eemaldamist 1024 px-ni (env `IMAGE_MAX_DIMENSION`): ~5× kiirem, kaardikuvas vahet ei näe.
- **Sharp.raw värvianalüüsiks** — tausta eemaldatud puhvri dekodeerib libvips (~10× kiirem kui puhas JS `pngjs`); uusi natiivseid sõltuvusi pole.
- **Nginxi vahemälu** — `gzip` teksti/JSON/SVG jaoks, `Cache-Control: public, max-age=2592000, immutable` CSS-i/JS-i/fontide/piltide jaoks, `no-cache` `index.html` jaoks.
- **MongoDB liitindeksid** — `{ owner: 1, createdAt: -1 }` mudelil `ClothingItem`, `{ owner: 1, updatedAt: -1 }` mudelitel `Outfit` ja `Collection` (sorteerimine indeksi peal, mälusisene sort kõrvaldatud).
- **Mitmeetapiline Dockerfile** — `deps`-etapp paigaldab prod-sõltuvused eraldi kihti, `runner` kopeerib ainult vajaliku; npm-i vahemälu puhastatakse; `dumb-init` asendati `init: true`-ga compose-failis.
- **Tervisekontrollid + õige käivitusjärjestus** — `mongo healthy → api healthy → nginx`; api kontrollib `/api/health` iga 30 sekundi tagant.
- **RAM-i piirid** — api 1 GB, mongo 1 GB (`--wiredTigerCacheSizeGB 0.5`-ga), nginx 128 MB.
- **Testid** — Jest: ühiktestid colorAnalyzer'ile, imageProcessor'ile, weatherService'ile, vahetarkvarale (auth, validators, errorHandler), kasutajamudelile ning sequentialId'ile; integratsioonitestid kõikidele HTTP-marsruutidele in-memory MongoDB-ga.

### Paigaldamine

#### Eeldused

- Docker ja Docker Compose
- ~2 GB vaba kettaruumi (tõmmised + tausta eemaldamise mudel)

#### Sammud

1. **Klooni hoidla:**
   ```bash
   git clone <repo-url> wardrobe
   cd wardrobe
   ```

2. **Seadista keskkonnamuutujad:**
   ```bash
   cp .env.example .env
   ```
   Ava `.env` ja täida vähemalt:
   - `JWT_SECRET` — pikk juhuslik string (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
   - `YR_USER_AGENT` — `WardrobeApp/1.0 sinu@email.ee` (yr.no nõue)

3. **Genereeri Nginx-i jaoks ise-allkirjastatud sertifikaat:**
   ```bash
   cd nginx && ./generate-self-signed.sh && cd ..
   ```

4. **Käivita konteinerid:**
   ```bash
   docker compose up -d --build
   ```

5. **Loo esimene administraator:**
   ```bash
   docker compose exec api npm run seed
   ```

6. **Ava brauseris** [https://localhost](https://localhost) ja nõustu sertifikaadi hoiatusega.

#### Backend-i arendusrežiim

```bash
cd api
npm install
npm run dev    # node --watch
```

### Testide käivitamine

**Backend (Jest + Supertest + in-memory MongoDB):**

```bash
cd api
npm install
npm test                       # kõik testid
npm test -- --coverage         # koos kattuvuse aruandega
npm test -- tests/unit         # ainult ühiktestid
npm test -- tests/integration  # ainult integratsioonitestid
```

**Frontend (Jest + jsdom):**

```bash
cd frontend
npm install
npm test
```

Integratsioonitestid kasutavad `mongodb-memory-server`-it, seega välist andmebaasi käivitamiseks ei ole vaja — keskkond luuakse mällu ja eemaldatakse pärast lõpetamist.

### Keskkonnamuutujad

| Muutuja | Kohustuslik | Kirjeldus |
|---|---|---|
| `JWT_SECRET` | jah | JWT-allkirja saladus (≥ 64 baiti) |
| `JWT_EXPIRES_IN` | ei | Tokeni eluiga, vaikimisi `7d` |
| `MONGO_URI` | jah | MongoDB ühendusstring |
| `PORT` | ei | API port, vaikimisi `4000` |
| `MAX_USERS` | ei | Kasutajate piirarv, vaikimisi `10` |
| `SEED_ADMIN_USERNAME` | jah | Esimese administraatori kasutajanimi |
| `SEED_ADMIN_EMAIL` | jah | Esimese administraatori e-post |
| `SEED_ADMIN_PASSWORD` | jah | Esimese administraatori parool |
| `YR_USER_AGENT` | jah | User-Agent yr.no päringuteks |
| `IMAGE_MAX_DIMENSION` | ei | Foto suurim külg enne ONNX-i, vaikimisi `1024` |
| `RATE_LIMIT_WINDOW_MS` | ei | Rate-limit-i aken, vaikimisi `900000` (15 min) |
| `RATE_LIMIT_MAX` | ei | Päringute arv aknas, vaikimisi `100` |

### Kasutusnäited

- **Lisa riideese:** *Wardrobe* → "+" → laadi foto → vali kategooria, värv, materjal, lipud, lisa kommentaar.
- **Loo kombinatsioon:** *Outfits* → "Uus" → lohista esemed lõuendile → salvesta.
- **Pakida kohver:** *Collections* → loo kollektsioon "Reis Itaaliasse" → lisa esemed.
- **Vaata ilma:** külgriba vidin (mobiilil ülemine riba) näitab hetkeolukorda ja 3-päevast prognoosi.

### Projekti struktuur

```
.
├── api/                       # Backend (Node.js / Express)
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js              # Sisenemispunkt, middleware, marsruudid
│   ├── scripts/               # seedAdmin.js (esimene admin), cleanupUsers.js (kanooniline 3-kasutaja seadistus)
│   └── src/
│       ├── config/db.js       # MongoDB ühendus
│       ├── middleware/        # auth, errorHandler, upload, validators
│       ├── models/            # Mongoose skeemid
│       ├── routes/            # REST otspunktid
│       ├── services/          # imageProcessor, colorAnalyzer (Faas 1), weatherService
│       └── utils/
│
├── frontend/                  # Puhta JS-i SPA (ilma kogumiseta)
│   ├── index.html
│   ├── js/                    # api, store, auth, router, funktsioonimoodulid
│   └── styles/                # main.css, components.css
│
├── nginx/                     # TLS pöördpuhver
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── certs/
│   └── generate-self-signed.sh
│
├── docker-compose.yml
├── .env.example
├── .dockerignore
└── .gitignore
```

### API ülevaade

Kõik marsruudid asuvad eesliite `/api` all. Kaitstud marsruudid nõuavad päist `Authorization: Bearer <jwt>`.

| Meetod | Tee | Juurdepääs | Kirjeldus |
|---|---|---|---|
| `POST` | `/auth/login` | public | Sisselogimine, tagastab JWT |
| `POST` | `/auth/logout` | user | Väljalogimine |
| `GET` | `/items` | user | Esemete loend filtritega `color/category/material/search` |
| `POST` | `/items` | user | Lisa ese (multipart koos fotoga) |
| `PUT` | `/items/:id` | user | Uuenda ese |
| `DELETE` | `/items/:id` | user | Kustuta ese |
| `GET` | `/outfits` | user | Kombinatsioonide loend |
| `POST / PUT / DELETE` | `/outfits[/:id]` | user | Kombinatsioonide CRUD |
| `GET` | `/collections` | user | Kollektsioonide loend |
| `POST / PUT / DELETE` | `/collections[/:id]` | user | Kollektsioonide CRUD |
| `GET` | `/weather?lat=&lon=` | user | Hetkeilm ja 3-päevane prognoos |
| `GET` | `/weather/geocode?q=` | user | Geokodeerimine Nominatimi kaudu |
| `GET` | `/users` | admin | Kasutajate loend |
| `POST` | `/users` | admin | Lisa kasutaja |
| `DELETE` | `/users/:id` | admin | Kustuta kasutaja |
| `GET` | `/users/:id/items` | admin | Valitud kasutaja garderoob |
| `GET` | `/health` | public | Tervisekontroll Dockerile |

### Edasised plaanid

- ✅ ~~Automaatne **värvi** tuvastus~~ — valmis (Faas 1).
- Automaatne **kategooria ja materjali** tuvastus CLIP zero-shot abil — Faas 2, pole veel tehtud: lisab tõmmisele ~150 MB ja päringule ~200–500 ms; vt [IMAGE_ANALYSIS_PROPOSAL.md](IMAGE_ANALYSIS_PROPOSAL.md).
- Kandmise statistika (sagedus, korrelatsioon ilmaga) — piisava andmehulgaga avab tee personaliseerimiseks.
- Garderoobi eksport / import (JSON või ZIP koos fotodega).
- Liidese täielik lokaliseerimine (RU / EN / ET).
- PWA push-teavitused.
- Virtuaalne proovimine / kombinatsiooni eelvaade.

### Autor, kaastöölised ja litsents

- **Autor ja ainus arendaja:** Aleksandra Kot — backend, frontend, infrastruktuur, disain, testid, dokumentatsioon.
- **Juhendaja:** *<juhendaja nimi>*.
- **Kontekst:** lõputöö.
- **Litsents:** MIT (kui `LICENSE` failis pole teisiti märgitud).
