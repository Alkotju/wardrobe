(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }

  // EN: Returns the current user's JWT token from the state store, or null if the user is not logged in.
  // ET: Tagastab praeguse kasutaja JWT-märgi olekuhoidlast või null, kui kasutaja pole sisse logitud.
  // RU: Возвращает JWT-токен текущего пользователя из хранилища состояния или null, если пользователь не вошёл.
  function getToken() {
    return window.App && App.store && App.store.state.user
      ? App.store.state.user.token
      : null;
  }

  // EN: Checks whether the path is already absolute (http(s) or /uploads) and needs no /api prefix.
  // ET: Kontrollib, kas tee on juba absoluutne (http(s) või /uploads) ja ei vaja /api eesliidet.
  // RU: Проверяет, является ли путь уже абсолютным (http(s) или /uploads) и не требует ли префикса /api.
  function isAbsolute(path) {
    return /^(?:https?:)?\/\//.test(path) || path.startsWith('/uploads');
  }

  // EN: Central fetch function — adds the authorization header, serializes the body, and throws an error on a non-2xx response.
  // ET: Keskne fetch-funktsioon — lisab autoriseerimispäise, serialiseerib keha ja viskab vea mitte-2xx vastuse korral.
  // RU: Центральная функция fetch — добавляет заголовок авторизации, сериализует тело и выбрасывает ошибку при ответе не 2xx.
  async function request(method, path, opts) {
    opts = opts || {};
    const url = isAbsolute(path) ? path : ('/api' + path);

    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});

    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      if (typeof body !== 'string') body = JSON.stringify(body);
    }

    const token = getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + token;
    }

    let res;
    try {
      res = await fetch(url, { method, headers, body });
    } catch (err) {
      throw new ApiError('Network error: ' + err.message, 0, null);
    }

    const ct = res.headers.get('content-type') || '';
    let parsed = null;
    if (ct.includes('application/json')) {
      try { parsed = await res.json(); } catch { parsed = null; }
    } else if (res.status !== 204) {
      try { parsed = await res.text(); } catch { parsed = null; }
    }

    if (!res.ok) {
      if (res.status === 401 && window.App && App.auth && typeof App.auth.handleUnauthorized === 'function') {
        App.auth.handleUnauthorized();
      }
      const msg = (parsed && parsed.error) || (typeof parsed === 'string' && parsed) || res.statusText;
      throw new ApiError(msg, res.status, parsed);
    }
    return parsed;
  }

  // EN: Collection of thin wrappers around the REST API endpoints (auth, items, outfits, collections, weather, users).
  // ET: Kogum õhukesi ümbriseid REST-API lõpp-punktide ümber (auth, esemed, komplektid, kollektsioonid, ilm, kasutajad).
  // RU: Набор тонких обёрток вокруг конечных точек REST API (auth, вещи, образы, коллекции, погода, пользователи).
  const api = {
    ApiError,

    login: (username, password) =>
      request('POST', '/auth/login', { body: { username, password } }),
    logout: () => request('POST', '/auth/logout'),

    listItems: (params) => {
      const qs = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v != null && v !== '') qs.append(k, v);
      });
      const suffix = qs.toString() ? '?' + qs.toString() : '';
      return request('GET', '/items' + suffix);
    },
    createItem: (formData) =>
      request('POST', '/items', { body: formData }),
    updateItem: (id, formData) =>
      request('PUT', '/items/' + encodeURIComponent(id), { body: formData }),
    deleteItem: (id) =>
      request('DELETE', '/items/' + encodeURIComponent(id)),

    listOutfits: () => request('GET', '/outfits'),
    createOutfit: (payload) => request('POST', '/outfits', { body: payload }),
    updateOutfit: (id, payload) =>
      request('PUT', '/outfits/' + encodeURIComponent(id), { body: payload }),
    deleteOutfit: (id) =>
      request('DELETE', '/outfits/' + encodeURIComponent(id)),

    listCollections: () => request('GET', '/collections'),
    createCollection: (payload) => request('POST', '/collections', { body: payload }),
    updateCollection: (id, payload) =>
      request('PUT', '/collections/' + encodeURIComponent(id), { body: payload }),
    deleteCollection: (id) =>
      request('DELETE', '/collections/' + encodeURIComponent(id)),

    getWeather: (lat, lon) =>
      request('GET', '/weather?lat=' + encodeURIComponent(lat) +
                       '&lon=' + encodeURIComponent(lon)),
    geocode: (q) =>
      request('GET', '/weather/geocode?q=' + encodeURIComponent(q)),

    listUsers: () => request('GET', '/users'),
    createUser: (payload) => request('POST', '/users', { body: payload }),
    deleteUser: (id) => request('DELETE', '/users/' + encodeURIComponent(id)),
    listUserItems: (userId) =>
      request('GET', '/users/' + encodeURIComponent(userId) + '/items'),
  };

  // EN: Shows a short-lived notification (toast) at the edge of the screen that disappears on its own after a few seconds.
  // ET: Kuvab ekraani servas lühiajalise teate (toast), mis kustub mõne sekundi pärast iseenesest.
  // RU: Показывает у края экрана кратковременное уведомление (toast), которое само исчезает через несколько секунд.
  function toast(message, kind) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = document.createElement('div');
    node.className = 'toast ' + (kind || '');
    node.textContent = message;
    root.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity 200ms ease';
      setTimeout(() => node.remove(), 220);
    }, 3200);
  }
  api.toast = toast;

  window.App = window.App || {};
  window.App.api = api;
})();
