(function () {
  'use strict';

  const routes = [
    {
      path: '/login',
      render: () => { showShell('auth'); },
      guard: () => true,
    },
    {
      path: '/wardrobe',
      render: () => App.wardrobe.render(),
      guard: requireAuth,
    },
    {
      path: '/outfits',
      render: () => App.outfits.render(),
      guard: requireAuth,
    },
    {
      path: '/collections',
      render: () => App.collections.render(),
      guard: requireAuth,
    },
    {
      path: '/admin',
      render: () => App.admin.render(),
      guard: requireAdmin,
    },
  ];

  // EN: Route guard — admits the route only for a logged-in user, otherwise redirects to login.
  // ET: Marsruudivalvur — lubab marsruudi ainult sisseloginud kasutajale, muidu suunab sisselogimisse.
  // RU: Страж маршрута — допускает маршрут только для вошедшего пользователя, иначе перенаправляет на вход.
  function requireAuth() {
    if (!App.auth.isAuthenticated()) return '/login';
    return true;
  }
  // EN: Route guard — admits the route only for an admin; others are redirected to the wardrobe or login.
  // ET: Marsruudivalvur — lubab marsruudi ainult adminile; teised suunatakse garderoobi või sisselogimisse.
  // RU: Страж маршрута — допускает маршрут только для админа; остальных перенаправляет в гардероб или на вход.
  function requireAdmin() {
    if (!App.auth.isAuthenticated()) return '/login';
    if (!App.auth.isAdmin()) return '/wardrobe';
    return true;
  }

  let cleanupPrev = null;

  // EN: Switches the visible app "shell" — either the auth view or the main app view.
  // ET: Lülitab nähtavale õige rakenduse "kesta" — kas autentimisvaate või põhirakenduse vaate.
  // RU: Переключает видимую «оболочку» приложения — либо вид аутентификации, либо основной вид приложения.
  function showShell(which) {
    document.body.dataset.shell = which;
    document.getElementById('auth-shell').hidden = which !== 'auth';
    document.getElementById('app-shell').hidden  = which !== 'app';
  }

  // EN: Marks the navigation link of the active route based on the current path.
  // ET: Märgib navigatsioonis aktiivse marsruudi lingi praeguse tee põhjal.
  // RU: Отмечает в навигации ссылку активного маршрута на основе текущего пути.
  function highlightActiveNav(path) {
    const links = document.querySelectorAll('.nav-link, .tab');
    links.forEach((a) => {
      if (a.dataset.route === path) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  // EN: Returns the current route path from the URL hash, stripping "#" and any query string.
  // ET: Tagastab praeguse marsruuditee URL-i räsiosast, eemaldades "#" ja võimaliku päringustringi.
  // RU: Возвращает текущий путь маршрута из hash-части URL, убирая "#" и возможную строку запроса.
  function currentPath() {
    const raw = (location.hash || '#/').slice(1);
    return raw.split('?')[0] || '/';
  }

  // EN: The router core — finds the route matching the current path, checks the guards, and renders the view.
  // ET: Marsruuteri süda — leiab praegusele teele vastava marsruudi, kontrollib valvurid ja renderdab vaate.
  // RU: Ядро маршрутизатора — находит маршрут для текущего пути, проверяет стражей и отрисовывает вид.
  async function dispatch() {
    let path = currentPath();
    if (path === '/' || path === '') {
      path = App.auth.isAuthenticated() ? '/wardrobe' : '/login';
      location.replace('#' + path);
      return;
    }

    const route = routes.find((r) => r.path === path);
    if (!route) {
      location.replace('#/wardrobe');
      return;
    }

    const guarded = route.guard();
    if (guarded !== true) {
      location.replace('#' + guarded);
      return;
    }

    if (typeof cleanupPrev === 'function') {
      try { cleanupPrev(); } catch {}
      cleanupPrev = null;
    }

    showShell(path === '/login' ? 'auth' : 'app');
    highlightActiveNav(path);

    try {
      const maybeCleanup = await route.render();
      if (typeof maybeCleanup === 'function') cleanupPrev = maybeCleanup;
    } catch (err) {
      console.error('Route render failed:', err);
      App.api.toast('Failed to load page: ' + err.message, 'error');
    }

    if (window.lucide && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
  }

  // EN: Starts the app — picks the initial shell, initializes authentication, and binds route-change events.
  // ET: Käivitab rakenduse — valib algkesta, initsialiseerib autentimise ja seob marsruudivahetuse sündmused.
  // RU: Запускает приложение — выбирает начальную оболочку, инициализирует аутентификацию и привязывает события смены маршрута.
  function boot() {
    showShell(App.auth.isAuthenticated() ? 'app' : 'auth');

    App.auth.init();

    App.store.on('user', () => {
      dispatch();
    });

    window.addEventListener('hashchange', dispatch);

    if (App.auth.isAuthenticated() && App.weather) {
      App.weather.init();
    }
    App.store.on('user', (user) => {
      if (user && App.weather) App.weather.init();
      else if (App.weather) App.weather.stop();
    });

    dispatch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.App = window.App || {};
  window.App.router = { dispatch };
})();
