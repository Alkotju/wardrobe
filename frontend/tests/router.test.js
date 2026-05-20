/** @jest-environment jsdom */
const { loadModule, freshApp } = require('./setup');

// Build the minimum DOM the router peeks at: the two shells and a #view container.
function mountShell() {
  document.body.innerHTML =
    '<div id="auth-shell" hidden></div>' +
    '<div id="app-shell" hidden></div>' +
    '<div id="view"></div>' +
    '<div id="toast-root"></div>';
}

function setHash(path) {
  // jsdom's location supports hash assignment but no events fire from setting
  // it programmatically. We emit hashchange manually where needed.
  window.location.hash = path;
}

beforeEach(() => {
  freshApp();
  window.localStorage.clear();
  mountShell();
  loadModule('store');
  // Stub auth + feature modules so we can drive the router in isolation.
  window.App.auth = {
    init: jest.fn(),
    isAuthenticated: jest.fn().mockReturnValue(false),
    isAdmin: jest.fn().mockReturnValue(false),
    handleUnauthorized: jest.fn(),
  };
  window.App.wardrobe = { render: jest.fn() };
  window.App.outfits  = { render: jest.fn() };
  window.App.collections = { render: jest.fn() };
  window.App.admin    = { render: jest.fn() };
  // api.toast is called from inside the router on render failures.
  window.App.api = { toast: jest.fn() };
});

describe('router', () => {
  test('boot redirects unauthenticated user away from "/" to /login', async () => {
    setHash('#/');
    loadModule('router');
    // boot() runs immediately and calls dispatch; the unauthenticated default
    // path is #/login.
    await Promise.resolve();
    expect(window.location.hash).toBe('#/login');
  });

  test('boot redirects authenticated user from "/" to /wardrobe', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    setHash('#/');
    loadModule('router');
    await Promise.resolve();
    expect(window.location.hash).toBe('#/wardrobe');
  });

  test('requireAuth guard redirects to /login when not authenticated', async () => {
    setHash('#/wardrobe');
    loadModule('router');
    await Promise.resolve();
    expect(window.location.hash).toBe('#/login');
    expect(window.App.wardrobe.render).not.toHaveBeenCalled();
  });

  test('requireAdmin guard redirects non-admin to /wardrobe', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    window.App.auth.isAdmin.mockReturnValue(false);
    setHash('#/admin');
    loadModule('router');
    await Promise.resolve();
    expect(window.location.hash).toBe('#/wardrobe');
    expect(window.App.admin.render).not.toHaveBeenCalled();
  });

  test('admin reaches /admin', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    window.App.auth.isAdmin.mockReturnValue(true);
    setHash('#/admin');
    loadModule('router');
    await Promise.resolve();
    expect(window.App.admin.render).toHaveBeenCalledTimes(1);
  });

  test('unknown route redirects to /wardrobe', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    setHash('#/nope');
    loadModule('router');
    await Promise.resolve();
    expect(window.location.hash).toBe('#/wardrobe');
  });

  test('shows the auth shell on /login and the app shell elsewhere', async () => {
    setHash('#/login');
    loadModule('router');
    await Promise.resolve();
    expect(document.getElementById('auth-shell').hidden).toBe(false);
    expect(document.getElementById('app-shell').hidden).toBe(true);

    // Navigate to wardrobe (authenticated)
    window.App.auth.isAuthenticated.mockReturnValue(true);
    setHash('#/wardrobe');
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await Promise.resolve();
    expect(document.getElementById('app-shell').hidden).toBe(false);
    expect(document.getElementById('auth-shell').hidden).toBe(true);
  });

  test('strips querystring from the hash path', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    setHash('#/wardrobe?from=login');
    loadModule('router');
    await Promise.resolve();
    expect(window.App.wardrobe.render).toHaveBeenCalled();
  });

  test('cleanup from previous render is invoked on navigation', async () => {
    const cleanup = jest.fn();
    window.App.auth.isAuthenticated.mockReturnValue(true);
    window.App.wardrobe.render.mockResolvedValueOnce(cleanup);
    setHash('#/wardrobe');
    loadModule('router');
    await Promise.resolve(); await Promise.resolve();

    setHash('#/outfits');
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await Promise.resolve(); await Promise.resolve();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test('render error is swallowed and surfaced via toast', async () => {
    window.App.auth.isAuthenticated.mockReturnValue(true);
    window.App.wardrobe.render.mockRejectedValueOnce(new Error('boom'));
    setHash('#/wardrobe');
    loadModule('router');
    await Promise.resolve(); await Promise.resolve();
    expect(window.App.api.toast).toHaveBeenCalledWith(expect.stringContaining('boom'), 'error');
  });
});
