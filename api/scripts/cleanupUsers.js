require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const ClothingItem = require('../src/models/ClothingItem');
const Outfit = require('../src/models/Outfit');
const Collection = require('../src/models/Collection');
const { nextSequentialId } = require('../src/utils/sequentialId');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const DRY_RUN = process.env.CLEANUP_DRY_RUN === '1';
const DELETE_UPLOADS = process.env.CLEANUP_DELETE_UPLOADS === '1';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

const KEEP = {
  admin: { username: 'admin', email: 'admin@example.com',  role: 'admin', passwordEnv: 'SEED_ADMIN_PASSWORD' },
  aleks: { username: 'aleks', email: 'aleks@example.com',  role: 'user',  passwordEnv: 'SEED_ALEKS_PASSWORD' },
  test:  { username: 'test',  email: 'test@example.com',   role: 'user',  passwordEnv: 'SEED_TEST_PASSWORD'  },
};

const CATEGORY_SEED = [
  { parent: 'Kleidid ja pükskostüümid',     child: 'Kleidid' },
  { parent: 'Pluusid, särgid ja kampsunid', child: 'T-särgid' },
  { parent: 'Püksid ja seelikud',           child: 'Teksad' },
  { parent: 'Üleriided',                    child: 'Jakid' },
  { parent: 'Jalatsid',                     child: 'Kingad' },
  { parent: 'Spordirõivad',                 child: 'Ülaosa' },
  { parent: 'Aksessuaarid',                 child: 'Mütsid' },
];

// EN: Logging helper that prepends a mode marker ([DRY] or [RUN]) to the message.
// ET: Logimisabiline, mis lisab teate ette režiimimärgise ([DRY] või [RUN]).
// RU: Помощник логирования, добавляющий перед сообщением метку режима ([DRY] или [RUN]).
const log = (...a) => console.log(DRY_RUN ? '[DRY]' : '[RUN]', ...a);

// EN: Removes the user's upload directory from disk if CLEANUP_DELETE_UPLOADS is enabled.
// ET: Eemaldab kasutaja üleslaadimiskausta kettalt, kui CLEANUP_DELETE_UPLOADS on sisse lülitatud.
// RU: Удаляет папку загрузок пользователя с диска, если включён CLEANUP_DELETE_UPLOADS.
async function rmUploads(userId) {
  if (!DELETE_UPLOADS) return;
  const dir = path.join(UPLOAD_DIR, String(userId));
  try {
    await fs.rm(dir, { recursive: true, force: true });
    log(`  └─ removed uploads dir ${dir}`);
  } catch (err) {
    log(`  └─ uploads dir not removed (${err.code || err.message})`);
  }
}

// EN: Deletes a user together with all of their items, outfits, collections, and uploads.
// ET: Kustutab kasutaja koos kõigi tema esemete, komplektide, kollektsioonide ja üleslaadimistega.
// RU: Удаляет пользователя вместе со всеми его вещами, образами, коллекциями и загрузками.
async function purgeUser(user) {
  log(`Purging user "${user.username}" (_id=${user._id})`);
  if (DRY_RUN) {
    const [items, outfits, cols] = await Promise.all([
      ClothingItem.countDocuments({ owner: user._id }),
      Outfit.countDocuments({ owner: user._id }),
      Collection.countDocuments({ owner: user._id }),
    ]);
    log(`  would delete: ${items} items, ${outfits} outfits, ${cols} collections`);
    return;
  }
  const [items, outfits, cols] = await Promise.all([
    ClothingItem.deleteMany({ owner: user._id }),
    Outfit.deleteMany({ owner: user._id }),
    Collection.deleteMany({ owner: user._id }),
  ]);
  log(`  deleted ${items.deletedCount} items, ${outfits.deletedCount} outfits, ${cols.deletedCount} collections`);
  await rmUploads(user.userId || user._id);
  await User.deleteOne({ _id: user._id });
}

// EN: Ensures a user exists with the correct role — creates them if needed or fixes the role.
// ET: Tagab kasutaja olemasolu õige rolliga — loob ta vajadusel või parandab rolli.
// RU: Гарантирует существование пользователя с нужной ролью — создаёт его при необходимости или исправляет роль.
async function ensureUser(spec) {
  let user = await User.findOne({ username: spec.username });
  if (user) {
    if (user.role !== spec.role) {
      log(`Updating role of "${spec.username}": ${user.role} → ${spec.role}`);
      if (!DRY_RUN) { user.role = spec.role; await user.save(); }
    } else {
      log(`User "${spec.username}" present (role=${user.role})`);
    }
    return user;
  }

  const password = process.env[spec.passwordEnv];
  if (!password) {
    throw new Error(
      `Missing env var ${spec.passwordEnv} — required to create user "${spec.username}".`
    );
  }
  log(`Creating user "${spec.username}" (role=${spec.role})`);
  if (DRY_RUN) return null;

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = await nextSequentialId('user');
  return User.create({
    userId,
    username: spec.username,
    email: spec.email,
    passwordHash,
    role: spec.role,
  });
}

// EN: Clears all of a user's data (items, outfits, collections), keeping the account itself.
// ET: Tühjendab kasutaja kõik andmed (esemed, komplektid, kollektsioonid), jättes konto alles.
// RU: Очищает все данные пользователя (вещи, образы, коллекции), оставляя сам аккаунт.
async function emptyUserData(user, label) {
  if (!user) return;
  const [items, outfits, cols] = await Promise.all([
    ClothingItem.countDocuments({ owner: user._id }),
    Outfit.countDocuments({ owner: user._id }),
    Collection.countDocuments({ owner: user._id }),
  ]);
  if (items + outfits + cols === 0) {
    log(`"${label}" already empty`);
    return;
  }
  log(`Clearing "${label}" data: ${items} items, ${outfits} outfits, ${cols} collections`);
  if (DRY_RUN) return;
  await Promise.all([
    ClothingItem.deleteMany({ owner: user._id }),
    Outfit.deleteMany({ owner: user._id }),
    Collection.deleteMany({ owner: user._id }),
  ]);
  await rmUploads(user.userId || user._id);
}

// EN: Brings the "test" user's items into a canonical state — exactly one item per main category.
// ET: Viib "test"-kasutaja esemed kanoonilisse seisu — täpselt üks ese iga põhikategooria kohta.
// RU: Приводит вещи пользователя "test" к каноническому состоянию — ровно одна вещь на каждую основную категорию.
async function reconcileTestCategories(testUser) {
  if (!testUser) return;
  const items = await ClothingItem.find({ owner: testUser._id });
  const byParent = new Map();
  for (const it of items) {
    const p = (it.category && it.category.parent) || '';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(it);
  }

  const wantedParents = new Set(CATEGORY_SEED.map((c) => c.parent));

  // EN: 1) remove items whose main category is not in the canonical list.
  // ET: 1) eemalda esemed, mille põhikategooria ei kuulu kanoonilisse loendisse.
  // RU: 1) удалить вещи, основная категория которых не входит в канонический список.
  for (const [parent, list] of byParent.entries()) {
    if (!wantedParents.has(parent)) {
      log(`"test": removing ${list.length} item(s) with non-canonical parent "${parent}"`);
      if (!DRY_RUN) await ClothingItem.deleteMany({ _id: { $in: list.map((i) => i._id) } });
    }
  }

  // EN: 2) for each canonical main category: keep one item, create it if missing.
  // ET: 2) iga kanoonilise põhikategooria kohta: jäta alles üks ese, loo see, kui puudub.
  // RU: 2) для каждой канонической основной категории: оставить одну вещь, создать, если её нет.
  for (const seed of CATEGORY_SEED) {
    const list = byParent.get(seed.parent) || [];
    if (list.length > 1) {
      const [keep, ...extras] = list;
      log(`"test": parent "${seed.parent}" has ${list.length} items — keeping ${keep.itemId}, deleting ${extras.length}`);
      if (!DRY_RUN) await ClothingItem.deleteMany({ _id: { $in: extras.map((i) => i._id) } });
    } else if (list.length === 0) {
      log(`"test": creating seed item for parent "${seed.parent}" (child="${seed.child}")`);
      if (!DRY_RUN) {
        const itemId = await nextSequentialId('item');
        await ClothingItem.create({
          itemId,
          owner: testUser._id,
          name: `${seed.child} (seed)`,
          category: { parent: seed.parent, child: seed.child },
          color: { label: '', hex: '' },
          material: '',
          imageUrl: null,
          originalImageUrl: null,
        });
      }
    } else {
      log(`"test": parent "${seed.parent}" already has 1 item — ok`);
    }
  }
}

// EN: Verifies the final result — whether users and their data match the expected canonical layout.
// ET: Kontrollib lõpptulemust — kas kasutajad ja nende andmed vastavad oodatud kanoonilisele paigutusele.
// RU: Проверяет итоговый результат — соответствуют ли пользователи и их данные ожидаемой канонической раскладке.
async function verify() {
  console.log('\n── VERIFICATION ──');
  const users = await User.find({}).sort({ username: 1 });
  console.log(`Total users: ${users.length} (expected 3)`);
  for (const u of users) {
    const [items, outfits, cols] = await Promise.all([
      ClothingItem.countDocuments({ owner: u._id }),
      Outfit.countDocuments({ owner: u._id }),
      Collection.countDocuments({ owner: u._id }),
    ]);
    console.log(`  ${u.username.padEnd(6)} role=${u.role.padEnd(5)} items=${items} outfits=${outfits} collections=${cols}`);
  }

  const usernames = new Set(users.map((u) => u.username));
  const expected = ['admin', 'aleks', 'test'];
  const missing = expected.filter((n) => !usernames.has(n));
  const extra   = [...usernames].filter((n) => !expected.includes(n));

  const test = users.find((u) => u.username === 'test');
  let perCatOk = true;
  if (test) {
    const items = await ClothingItem.find({ owner: test._id });
    const counts = new Map(CATEGORY_SEED.map((c) => [c.parent, 0]));
    for (const it of items) {
      const p = (it.category && it.category.parent) || '';
      if (counts.has(p)) counts.set(p, counts.get(p) + 1);
    }
    console.log('\n  "test" per-category counts (expected 1 each):');
    for (const [p, n] of counts.entries()) {
      const mark = n === 1 ? 'OK ' : 'BAD';
      if (n !== 1) perCatOk = false;
      console.log(`    [${mark}] ${p}: ${n}`);
    }
  }

  const aleks = users.find((u) => u.username === 'aleks');
  let aleksOk = true;
  if (aleks) {
    const n = await ClothingItem.countDocuments({ owner: aleks._id });
    if (n !== 0) { aleksOk = false; console.log(`\n  [BAD] "aleks" has ${n} items, expected 0`); }
  }

  const ok = !missing.length && !extra.length && perCatOk && aleksOk;
  console.log(`\nResult: ${ok ? 'PASS' : 'FAIL'}`);
  if (missing.length) console.log(`  missing users: ${missing.join(', ')}`);
  if (extra.length)   console.log(`  extra users:   ${extra.join(', ')}`);
  return ok;
}

// EN: Main script runner — performs data migration, user cleanup, and the final check.
// ET: Skripti peakäivitaja — sooritab andmete migratsiooni, kasutajate puhastuse ja lõppkontrolli.
// RU: Главный запуск скрипта — выполняет миграцию данных, очистку пользователей и итоговую проверку.
(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}\n`);

    // EN: 0) one-time schema migration — backfill the missing updatedAt field on old Collection documents.
    // ET: 0) ühekordne skeemimigratsioon — täida vanadel Collection-dokumentidel puuduv updatedAt väli.
    // RU: 0) одноразовая миграция схемы — заполнить отсутствующее поле updatedAt у старых документов Collection.
    const legacy = await Collection.countDocuments({ updatedAt: { $exists: false } });
    if (legacy > 0) {
      log(`Backfilling Collection.updatedAt for ${legacy} legacy document(s)`);
      if (!DRY_RUN) {
        await Collection.updateMany(
          { updatedAt: { $exists: false } },
          [{ $set: { updatedAt: '$createdAt' } }]
        );
      }
    } else {
      log('No legacy Collection documents missing updatedAt');
    }

    // EN: 1) remove all users except the three canonical accounts.
    // ET: 1) eemalda kõik kasutajad peale kolme kanoonilise konto.
    // RU: 1) удалить всех пользователей, кроме трёх канонических аккаунтов.
    const keepUsernames = Object.values(KEEP).map((u) => u.username);
    const others = await User.find({ username: { $nin: keepUsernames } });
    log(`Found ${others.length} user(s) to purge`);
    for (const u of others) await purgeUser(u);

    // EN: 2) ensure the three canonical accounts exist with the correct roles.
    // ET: 2) taga kolme kanoonilise konto olemasolu õigete rollidega.
    // RU: 2) обеспечить наличие трёх канонических аккаунтов с правильными ролями.
    const admin = await ensureUser(KEEP.admin);
    const aleks = await ensureUser(KEEP.aleks);
    const test  = await ensureUser(KEEP.test);

    // EN: 3) admin — no data changes; the admin role itself already grants visibility.
    // ET: 3) admin — andmeid ei muudeta; admin-roll annab nähtavuse juba ise.
    // RU: 3) admin — данные не меняются; роль admin уже сама даёт видимость.
    log(`"admin" visibility is enforced by role gate — no data changes needed`);

    // EN: 4) aleks — zero items, outfits, and collections.
    // ET: 4) aleks — null eset, komplekti ja kollektsiooni.
    // RU: 4) aleks — ноль вещей, образов и коллекций.
    await emptyUserData(aleks, 'aleks');

    // EN: 5) test — exactly one item per main category.
    // ET: 5) test — täpselt üks ese iga põhikategooria kohta.
    // RU: 5) test — ровно одна вещь на каждую основную категорию.
    await reconcileTestCategories(test);

    // EN: 6) check the result.
    // ET: 6) tulemuse kontroll.
    // RU: 6) проверка результата.
    const ok = await verify();

    await mongoose.disconnect();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error(err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();
