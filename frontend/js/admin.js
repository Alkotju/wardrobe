(function () {
  'use strict';

  // EN: Short function for escaping HTML special characters (uses the wardrobe module's esc function).
  // ET: Lühifunktsioon HTML-i erimärkide varjestamiseks (kasutab wardrobe mooduli esc-funktsiooni).
  // RU: Короткая функция для экранирования спецсимволов HTML (использует функцию esc модуля wardrobe).
  const esc = (s) => App.wardrobe.esc(s);

  // EN: Renders the admin panel page, binds the buttons, and loads the users table.
  // ET: Joonistab admini paneeli lehe, seob nupud ja laadib kasutajate tabeli.
  // RU: Отрисовывает страницу панели администратора, привязывает кнопки и загружает таблицу пользователей.
  function render() {
    const view = document.getElementById('view');
    view.innerHTML = pageMarkup();

    document.getElementById('btn-add-user').addEventListener('click', openAddUserModal);
    const fab = document.getElementById('fab-add-user');
    if (fab) fab.addEventListener('click', openAddUserModal);

    loadUsers();

    if (window.lucide) lucide.createIcons();
  }

  // EN: Builds and returns the admin page HTML markup (header, users table, add button).
  // ET: Koostab ja tagastab admini lehe HTML-märgistuse (päis, kasutajate tabel, lisamisnupp).
  // RU: Формирует и возвращает HTML-разметку страницы администратора (шапка, таблица пользователей, кнопка добавления).
  function pageMarkup() {
    return ''
      + '<header class="page-header">'
      +   '<h1 class="page-title">Admin</h1>'
      +   '<div class="page-actions">'
      +     '<button id="btn-add-user" class="btn btn-primary">'
      +       '<i data-lucide="user-plus"></i>Add user</button>'
      +   '</div>'
      + '</header>'

      + '<div class="table-wrap">'
      +   '<table class="table" id="user-table">'
      +     '<thead><tr>'
      +       '<th>Username</th>'
      +       '<th>Email</th>'
      +       '<th>Role</th>'
      +       '<th>Items</th>'
      +       '<th>Last login</th>'
      +       '<th></th>'
      +     '</tr></thead>'
      +     '<tbody><tr><td colspan="6" class="muted">Loading…</td></tr></tbody>'
      +   '</table>'
      + '</div>'

      + '<button id="fab-add-user" class="fab fab--mobile" aria-label="Add user">'
      +   '<i data-lucide="user-plus"></i>Add user</button>';
  }

  // EN: Loads the user list from the server and renders the table with view and delete buttons.
  // ET: Laadib serverist kasutajate nimekirja ja joonistab tabeli koos vaatamise ja kustutamise nuppudega.
  // RU: Загружает список пользователей с сервера и отрисовывает таблицу с кнопками просмотра и удаления.
  async function loadUsers() {
    const tbody = document.querySelector('#user-table tbody');
    try {
      const { users } = await App.api.listUsers();
      if (!users || !users.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No users yet.</td></tr>';
        return;
      }
      const currentUserId = App.store.state.user && App.store.state.user.id;
      tbody.innerHTML = users.map((u) => rowMarkup(u, currentUserId)).join('');
      tbody.querySelectorAll('[data-view-user]').forEach((b) => {
        b.addEventListener('click', () => {
          App.store.set('adminViewUserId', b.dataset.viewUser);
          location.hash = '#/wardrobe';
        });
      });
      tbody.querySelectorAll('[data-delete-user]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.dataset.deleteUser;
          const username = b.dataset.username || '';
          confirmDeleteUser(id, username);
        });
      });
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">Failed to load: '
        + esc(err.message) + '</td></tr>';
    }
  }

  // EN: Builds the HTML of one users-table row (name, email, role, item count, last login, actions).
  // ET: Koostab kasutajate tabeli ühe rea HTML-i (nimi, e-post, roll, esemete arv, viimane sisselogimine, tegevused).
  // RU: Формирует HTML одной строки таблицы пользователей (имя, email, роль, количество вещей, последний вход, действия).
  function rowMarkup(u, currentUserId) {
    const lastLogin = u.lastLogin
      ? new Date(u.lastLogin).toLocaleString()
      : 'never';
    const isSelf = currentUserId && String(u.id) === String(currentUserId);
    return ''
      + '<tr>'
      +   '<td><strong>' + esc(u.username) + '</strong></td>'
      +   '<td class="muted">' + esc(u.email) + '</td>'
      +   '<td>' + (u.role === 'admin'
                    ? '<span class="badge badge-id">admin</span>'
                    : '<span class="badge">user</span>') + '</td>'
      +   '<td>'
      +     ((u.itemCount || 0) > 0
              ? '<button type="button" class="link-button" data-view-user="' + esc(u.id) + '">'
                + esc(String(u.itemCount)) + '</button>'
              : '<span class="muted">0</span>')
      +   '</td>'
      +   '<td class="muted">' + esc(lastLogin) + '</td>'
      +   '<td class="row-actions">'
      +     '<button class="btn btn-secondary btn-sm" data-view-user="' + esc(u.id) + '">'
      +       '<i data-lucide="eye"></i>View wardrobe</button>'
      +     (isSelf
            ? ''
            : ' <button class="btn btn-danger btn-sm" data-delete-user="' + esc(u.id)
              + '" data-username="' + esc(u.username) + '" aria-label="Delete ' + esc(u.username) + '">'
              + '<i data-lucide="trash-2"></i>Delete</button>')
      +   '</td>'
      + '</tr>';
  }

  // EN: Opens a confirmation modal for deleting a user and performs the deletion after confirmation.
  // ET: Avab kinnitusmodaali kasutaja kustutamiseks ja sooritab kustutamise pärast kinnitust.
  // RU: Открывает модальное окно подтверждения удаления пользователя и выполняет удаление после подтверждения.
  function confirmDeleteUser(id, username) {
    App.wardrobe.openModal({
      title: 'Delete user',
      bodyHtml:
        '<p>Delete user <strong>' + esc(username) + '</strong>?</p>'
        + '<p class="muted">This permanently removes the account and all of their '
        + 'items, outfits, collections, and uploaded images. This cannot be undone.</p>',
      footerHtml:
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>'
        + '<button type="button" class="btn btn-danger" id="btn-confirm-delete-user">Delete</button>',
      onMount: (modal) => {
        const btn = modal.querySelector('#btn-confirm-delete-user');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await App.api.deleteUser(id);
            App.api.toast('User deleted', 'success');
            App.wardrobe.closeModal();
            loadUsers();
          } catch (err) {
            App.api.toast('Delete failed: ' + err.message, 'error');
            btn.disabled = false;
          }
        });
      },
    });
  }

  // EN: Opens the add-new-user modal and, on form submission, sends the creation request to the server.
  // ET: Avab uue kasutaja lisamise modaali ja saadab vormi esitamisel loomispäringu serverisse.
  // RU: Открывает модальное окно добавления нового пользователя и при отправке формы посылает запрос создания на сервер.
  function openAddUserModal() {
    App.wardrobe.openModal({
      title: 'Add user',
      bodyHtml:
        '<form id="add-user-form">'
        + '  <label class="field"><span class="field-label">Username</span>'
        + '    <input type="text" name="username" required minlength="3" maxlength="64" autocomplete="off" />'
        + '  </label>'
        + '  <label class="field"><span class="field-label">Email</span>'
        + '    <input type="email" name="email" required autocomplete="off" />'
        + '  </label>'
        + '  <label class="field"><span class="field-label">Temporary password</span>'
        + '    <input type="text" name="password" required minlength="8" maxlength="256" autocomplete="new-password" />'
        + '  </label>'
        + '  <label class="field"><span class="field-label">Role</span>'
        + '    <select name="role">'
        + '      <option value="user" selected>user</option>'
        + '      <option value="admin">admin</option>'
        + '    </select>'
        + '  </label>'
        + '</form>',
      footerHtml:
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>'
        + '<button type="submit" form="add-user-form" class="btn btn-primary" id="btn-create-user">Create</button>',
      onMount: (modal) => {
        const form = modal.querySelector('#add-user-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = modal.querySelector('#btn-create-user');
          btn.disabled = true;
          try {
            await App.api.createUser({
              username: form.elements.username.value.trim(),
              email:    form.elements.email.value.trim(),
              password: form.elements.password.value,
              role:     form.elements.role.value,
            });
            App.api.toast('User created', 'success');
            App.wardrobe.closeModal();
            loadUsers();
          } catch (err) {
            let msg = 'Create failed: ' + err.message;
            const details = err.body && Array.isArray(err.body.details) ? err.body.details : null;
            if (details && details.length) {
              const fields = details.map((d) => d.path).filter(Boolean);
              if (fields.length) msg += ' — check: ' + fields.join(', ');
            }
            App.api.toast(msg, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      },
    });
  }

  window.App = window.App || {};
  window.App.admin = { render };
})();
