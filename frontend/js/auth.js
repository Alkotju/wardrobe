(function () {
  'use strict';

  // ET: Lühifunktsioonid, mis leiavad ja tagastavad vajalikud DOM-elemendid nende ID järgi.
  // RU: Короткие функции, которые находят и возвращают нужные DOM-элементы по их ID.
  const $loginForm  = () => document.getElementById('login-form');
  const $loginError = () => document.getElementById('login-error');
  const $logoutBtn  = () => document.getElementById('logout-btn');
  const $userChip   = () => document.getElementById('user-chip');

  // ET: Kuvab või peidab sisselogimisvormi veateate sõltuvalt antud sõnumist.
  // RU: Показывает или скрывает сообщение об ошибке формы входа в зависимости от переданного текста.
  function showError(msg) {
    const el = $loginError();
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  // ET: Töötleb sisselogimisvormi esitamist — saadab andmed serverisse ja suunab õnnestumisel garderoobi.
  // RU: Обрабатывает отправку формы входа — отсылает данные на сервер и при успехе перенаправляет в гардероб.
  async function handleLoginSubmit(e) {
    e.preventDefault();
    showError('');

    const form = e.currentTarget;
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;

    if (!username || !password) {
      showError('Please enter both username and password.');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const { token, user } = await App.api.login(username, password);
      App.store.set('user', {
        id: user.id,
        username: user.username,
        role: user.role,
        token,
      });
      location.hash = '#/wardrobe';
    } catch (err) {
      showError(err.status === 429
        ? 'Too many attempts. Wait a few minutes.'
        : 'Invalid username or password.');
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ET: Puhastab kogu seansi (olek + localStorage) ja suunab kasutaja sisselogimislehele.
  // RU: Очищает всю сессию (состояние + localStorage) и перенаправляет пользователя на страницу входа.
  function handleUnauthorized() {
    if (!App.store.state.user) return;
    App.store.set('user', null);
    App.store.set('items', []);
    App.store.set('outfits', []);
    App.store.set('collections', []);
    App.store.set('adminViewUserId', null);
    location.hash = '#/login';
  }

  // ET: Logib kasutaja välja — teavitab serverit ja puhastab kohaliku seansi.
  // RU: Выполняет выход пользователя — уведомляет сервер и очищает локальную сессию.
  function logout() {
    App.api.logout().catch(() => {});
    handleUnauthorized();
  }

  // ET: Tagastab tõene, kui kasutaja on sisse logitud (olemas on kasutaja ja kehtiv märk).
  // RU: Возвращает true, если пользователь вошёл в систему (есть пользователь и действующий токен).
  function isAuthenticated() {
    return !!(App.store.state.user && App.store.state.user.token);
  }

  // ET: Tagastab tõene, kui sisseloginud kasutajal on admini roll.
  // RU: Возвращает true, если у вошедшего пользователя роль администратора.
  function isAdmin() {
    return !!(App.store.state.user && App.store.state.user.role === 'admin');
  }

  // ET: Joonistab päises kasutaja nimesildi koos admini märgisega, kui kasutaja on admin.
  // RU: Отрисовывает в шапке метку с именем пользователя и значком администратора, если пользователь — админ.
  function renderUserChip() {
    const el = $userChip();
    if (!el) return;
    const u = App.store.state.user;
    if (!u) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<strong></strong>' +
      (u.role === 'admin' ? '<span class="role-badge">admin</span>' : '');
    el.querySelector('strong').textContent = u.username;
  }

  // ET: Näitab või peidab ainult adminile mõeldud navigatsioonielemendid kasutaja rolli põhjal.
  // RU: Показывает или скрывает элементы навигации только для админа в зависимости от роли пользователя.
  function applyRoleVisibility() {
    const adminEls = document.querySelectorAll('[data-admin-only]');
    adminEls.forEach((el) => { el.hidden = !isAdmin(); });
  }

  // ET: Initsialiseerib autentimismooduli — seob vormi- ja nupukäsitlejad ning tellib oleku muudatused.
  // RU: Инициализирует модуль аутентификации — привязывает обработчики формы и кнопок и подписывается на изменения состояния.
  function init() {
    const form = $loginForm();
    if (form) form.addEventListener('submit', handleLoginSubmit);

    const btn = $logoutBtn();
    if (btn) btn.addEventListener('click', logout);

    App.store.on('user', () => {
      renderUserChip();
      applyRoleVisibility();
    });
    renderUserChip();
    applyRoleVisibility();
  }

  window.App = window.App || {};
  window.App.auth = {
    init,
    logout,
    isAuthenticated,
    isAdmin,
    handleUnauthorized,
  };
})();
