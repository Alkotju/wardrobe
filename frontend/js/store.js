(function () {
  'use strict';

  const STORAGE_KEY = 'wardrobe.user';

  // ET: Loeb localStorage'ist salvestatud kasutaja; vigaste andmete korral kustutab need ja tagastab null.
  // RU: Читает сохранённого пользователя из localStorage; при повреждённых данных удаляет их и возвращает null.
  function readPersistedUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  const state = {
    user: readPersistedUser(),
    items: [],
    outfits: [],
    collections: [],
    filters: { color: null, category: null, material: null, search: '' },
    weather: null,
    weatherLocation: null,
    adminViewUserId: null,
  };

  const bus = new EventTarget();

  // ET: Uuendab oleku ühte osa, salvestab kasutaja vajadusel localStorage'i ja teavitab tellijaid sündmusega.
  // RU: Обновляет один срез состояния, при необходимости сохраняет пользователя в localStorage и уведомляет подписчиков событием.
  function set(key, value) {
    state[key] = value;
    if (key === 'user') persistUser(value);
    bus.dispatchEvent(new CustomEvent(key, { detail: value }));
    bus.dispatchEvent(new CustomEvent('*', { detail: { key, value } }));
  }

  // ET: Liidab uued väärtused olemasolevatele filtritele ja teavitab "filters" sündmuse tellijaid.
  // RU: Объединяет новые значения с существующими фильтрами и уведомляет подписчиков события "filters".
  function patchFilters(patch) {
    state.filters = Object.assign({}, state.filters, patch);
    bus.dispatchEvent(new CustomEvent('filters', { detail: state.filters }));
  }

  // ET: Tellib oleku osa muudatused; tagastab funktsiooni tellimuse tühistamiseks.
  // RU: Подписывается на изменения среза состояния; возвращает функцию для отмены подписки.
  function on(key, handler) {
    const wrapper = (e) => handler(e.detail);
    bus.addEventListener(key, wrapper);
    return () => bus.removeEventListener(key, wrapper);
  }

  // ET: Salvestab kasutaja localStorage'i või eemaldab sealt, kui kasutaja on null.
  // RU: Сохраняет пользователя в localStorage или удаляет оттуда, если пользователь равен null.
  function persistUser(user) {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); }
    catch {}
  }

  window.App = window.App || {};
  window.App.store = { state, set, on, patchFilters };
})();
