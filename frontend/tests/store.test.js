/** @jest-environment jsdom */
const { loadModule, freshApp } = require('./setup');

beforeEach(() => {
  freshApp();
  window.localStorage.clear();
});

describe('store.js', () => {
  test('initial state has expected shape', () => {
    loadModule('store');
    const s = window.App.store.state;
    expect(s.user).toBeNull();
    expect(s.items).toEqual([]);
    expect(s.outfits).toEqual([]);
    expect(s.collections).toEqual([]);
    expect(s.filters).toEqual({ color: null, category: null, material: null, search: '' });
  });

  test('hydrates user from localStorage on load', () => {
    window.localStorage.setItem('wardrobe.user', JSON.stringify({
      id: 'u1', username: 'aleks', role: 'user', token: 'tk',
    }));
    loadModule('store');
    expect(window.App.store.state.user).toMatchObject({ username: 'aleks', token: 'tk' });
  });

  test('drops corrupted JSON in localStorage and clears the key', () => {
    window.localStorage.setItem('wardrobe.user', 'not-json{{{');
    loadModule('store');
    expect(window.App.store.state.user).toBeNull();
    expect(window.localStorage.getItem('wardrobe.user')).toBeNull();
  });

  test('set("user", …) persists to localStorage', () => {
    loadModule('store');
    window.App.store.set('user', { id: 'u', username: 'a', role: 'user', token: 't' });
    expect(JSON.parse(window.localStorage.getItem('wardrobe.user'))).toMatchObject({ username: 'a' });
  });

  test('set("user", null) removes the localStorage entry', () => {
    window.localStorage.setItem('wardrobe.user', JSON.stringify({ token: 'old' }));
    loadModule('store');
    window.App.store.set('user', null);
    expect(window.localStorage.getItem('wardrobe.user')).toBeNull();
  });

  test('set() dispatches a slice-keyed event and a wildcard event', () => {
    loadModule('store');
    const sliceHandler = jest.fn();
    const wildHandler = jest.fn();
    window.App.store.on('items', sliceHandler);
    window.App.store.on('*', wildHandler);

    window.App.store.set('items', [{ id: 1 }]);
    expect(sliceHandler).toHaveBeenCalledWith([{ id: 1 }]);
    expect(wildHandler).toHaveBeenCalledWith({ key: 'items', value: [{ id: 1 }] });
  });

  test('on() returns an unsubscribe function', () => {
    loadModule('store');
    const handler = jest.fn();
    const off = window.App.store.on('items', handler);
    window.App.store.set('items', [1]);
    off();
    window.App.store.set('items', [2]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('patchFilters merges and emits "filters" event', () => {
    loadModule('store');
    const handler = jest.fn();
    window.App.store.on('filters', handler);
    window.App.store.patchFilters({ color: 'red' });
    expect(window.App.store.state.filters).toEqual({
      color: 'red', category: null, material: null, search: '',
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ color: 'red' }));
  });
});
