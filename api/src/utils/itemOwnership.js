const ClothingItem = require('../models/ClothingItem');

// EN: Checks that all given IDs reference clothing items owned by the user; otherwise throws an error (admin bypasses).
// ET: Kontrollib, et kõik antud ID-d viitavad kasutajale kuuluvatele rõivaesemetele; muidu viskab vea (admin pääseb mööda).
// RU: Проверяет, что все переданные ID ссылаются на вещи, принадлежащие пользователю; иначе выбрасывает ошибку (админ — в обход).
async function assertItemsOwned(itemIds, user) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return;
  if (user.role === 'admin') return;

  const distinct = [...new Set(itemIds.map(String))];
  const count = await ClothingItem.countDocuments({
    _id: { $in: distinct },
    owner: user.id,
  });
  if (count !== distinct.length) {
    const err = new Error('One or more items are not owned by the current user');
    err.status = 400;
    throw err;
  }
}

module.exports = { assertItemsOwned };
