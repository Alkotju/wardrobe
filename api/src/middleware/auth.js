const jwt = require('jsonwebtoken');

// ET: Kontrollib Bearer-JWT päist, valideerib märgi ja lisab req.user andmed; vigase märgi korral tagastab 401.
// RU: Проверяет заголовок Bearer-JWT, валидирует токен и добавляет данные req.user; при неверном токене возвращает 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ET: Lubab edasi ainult admin-rolliga kasutajaid; muidu tagastab 403.
// RU: Пропускает дальше только пользователей с ролью admin; иначе возвращает 403.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
}

// ET: Tehasefunktsioon, mis loob vahevara dokumendi laadimiseks ja omandiõiguse kontrolliks valitud mudeli põhjal.
// RU: Фабричная функция, создающая middleware для загрузки документа и проверки права владения по выбранной модели.
function requireOwnership(Model, idParam = 'id') {
  // ET: Vahevara, mis laadib dokumendi ID järgi ja lubab edasi vaid omaniku või admini.
  // RU: Middleware, который загружает документ по ID и пропускает только владельца или администратора.
  return async function ownershipCheck(req, res, next) {
    try {
      const doc = await Model.findById(req.params[idParam]);
      if (!doc) return res.status(404).json({ error: 'Not found' });
      const ownerId = doc.owner ? String(doc.owner) : null;
      if (ownerId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      req.resource = doc;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireAuth, requireAdmin, requireOwnership };
