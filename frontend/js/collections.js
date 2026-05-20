(function () {
  'use strict';

  // EN: Short function for escaping HTML special characters (uses the wardrobe module's esc function).
  // ET: Lühifunktsioon HTML-i erimärkide varjestamiseks (kasutab wardrobe mooduli esc-funktsiooni).
  // RU: Короткая функция для экранирования спецсимволов HTML (использует функцию esc модуля wardrobe).
  const esc = (s) => App.wardrobe.esc(s);

  // EN: Renders the collections page, binds the buttons, loads the data, and returns a cleanup function.
  // ET: Joonistab kollektsioonide lehe, seob nupud, laadib andmed ja tagastab koristusfunktsiooni.
  // RU: Отрисовывает страницу коллекций, привязывает кнопки, загружает данные и возвращает функцию очистки.
  function render() {
    const view = document.getElementById('view');
    view.innerHTML = pageMarkup();

    const openNew = () => openCollectionForm(null);
    document.getElementById('btn-new-collection').addEventListener('click', openNew);
    const fab = document.getElementById('fab-add-collection');
    if (fab) fab.addEventListener('click', openNew);

    const offCol   = App.store.on('collections', repaintList);
    const offItems = App.store.on('items',       repaintList);

    Promise.all([
      App.wardrobe.loadItems(),
      loadCollections(),
    ]).then(repaintList);

    if (window.lucide) lucide.createIcons();

    return () => { offCol(); offItems(); };
  }

  // EN: Builds and returns the collections page HTML markup (header, list, add button).
  // ET: Koostab ja tagastab kollektsioonide lehe HTML-märgistuse (päis, loend, lisamisnupp).
  // RU: Формирует и возвращает HTML-разметку страницы коллекций (шапка, список, кнопка добавления).
  function pageMarkup() {
    return ''
      + '<header class="page-header">'
      +   '<h1 class="page-title">Collections</h1>'
      +   '<div class="page-actions">'
      +     '<button id="btn-new-collection" class="btn btn-primary">'
      +       '<i data-lucide="plus"></i>New collection</button>'
      +   '</div>'
      + '</header>'
      + '<div id="collection-list" class="collection-list"></div>'
      + '<button id="fab-add-collection" class="fab fab--mobile" aria-label="Add collection">'
      +   '<i data-lucide="plus"></i>Add collection</button>';
  }

  // EN: Loads the user's collections from the server and stores them in state.
  // ET: Laadib serverist kasutaja kollektsioonid ja salvestab need olekusse.
  // RU: Загружает коллекции пользователя с сервера и сохраняет их в состояние.
  async function loadCollections() {
    try {
      const { collections } = await App.api.listCollections();
      App.store.set('collections', collections || []);
    } catch (err) {
      App.api.toast('Failed to load collections: ' + err.message, 'error');
      App.store.set('collections', []);
    }
  }

  // EN: Repaints the collections list and binds the edit and delete buttons for each row.
  // ET: Joonistab kollektsioonide loendi uuesti ja seob iga rea muutmise ja kustutamise nupud.
  // RU: Перерисовывает список коллекций и привязывает кнопки изменения и удаления для каждой строки.
  function repaintList() {
    const root = document.getElementById('collection-list');
    if (!root) return;
    const cols = App.store.state.collections || [];
    const items = App.store.state.items || [];
    const byId  = new Map(items.map((i) => [i._id, i]));

    if (!cols.length) {
      root.innerHTML = ''
        + '<div class="empty-state">'
        +   '<i data-lucide="luggage"></i>'
        +   '<p>No collections yet. Create one for your next trip or move.</p>'
        + '</div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    root.innerHTML = cols.map((c) => rowMarkup(c, byId)).join('');

    root.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.edit;
        const c = cols.find((x) => x._id === id);
        if (c) openCollectionForm(c);
      });
    });
    root.querySelectorAll('[data-delete]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = b.dataset.delete;
        if (!confirm('Delete this collection? Items stay in your wardrobe.')) return;
        try {
          await App.api.deleteCollection(id);
          App.store.set('collections', App.store.state.collections.filter((x) => x._id !== id));
          App.api.toast('Collection deleted', 'success');
        } catch (err) {
          App.api.toast('Delete failed: ' + err.message, 'error');
        }
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  // EN: Builds the HTML of one collection row (name, type, item count, thumbnails, action buttons).
  // ET: Koostab ühe kollektsiooni rea HTML-i (nimi, tüüp, esemete arv, pisipildid, tegevusnupud).
  // RU: Формирует HTML одной строки коллекции (имя, тип, количество вещей, эскизы, кнопки действий).
  function rowMarkup(c, byId) {
    const MAX_THUMBS = 8;
    const ids = Array.isArray(c.items) ? c.items.map(String) : [];
    const visible = ids.slice(0, MAX_THUMBS);
    const more = ids.length - visible.length;

    const thumbs = visible.map((id) => {
      const it = byId.get(id);
      if (!it) {
        return '<div class="collection-thumb"><div class="placeholder"><i data-lucide="image-off"></i></div></div>';
      }
      if (it.imageUrl) {
        return '<div class="collection-thumb"><img src="' + esc(it.imageUrl) + '" alt="' + esc(it.name) + '" /></div>';
      }
      const parent = (it.category && it.category.parent) || '';
      return '<div class="collection-thumb"><div class="placeholder"><i data-lucide="'
        + esc(App.wardrobe.categoryIcon(parent)) + '"></i></div></div>';
    }).join('') + (more > 0 ? '<div class="collection-thumb">+' + more + '</div>' : '');

    return ''
      + '<article class="collection-row">'
      +   '<div>'
      +     '<h3>' + esc(c.name) + '</h3>'
      +     '<div class="card-meta">'
      +       '<span class="badge">' + esc(c.type || 'other') + '</span>'
      +       '<span class="muted">' + ids.length + ' item' + (ids.length === 1 ? '' : 's') + '</span>'
      +     '</div>'
      +     '<div class="collection-thumbs">' + thumbs + '</div>'
      +   '</div>'
      +   '<div class="collection-actions">'
      +     '<button class="btn btn-secondary btn-sm" data-edit="' + esc(c._id) + '">'
      +       '<i data-lucide="pencil"></i>Edit</button>'
      +     '<button class="btn btn-danger btn-sm" data-delete="' + esc(c._id) + '">'
      +       '<i data-lucide="trash-2"></i></button>'
      +   '</div>'
      + '</article>';
  }

  // EN: Opens the create-or-edit collection modal, preparing the form state.
  // ET: Avab kollektsiooni loomise või muutmise modaali, valmistades ette vormi oleku.
  // RU: Открывает модальное окно создания или изменения коллекции, подготавливая состояние формы.
  function openCollectionForm(existing) {
    const isEdit = !!existing;
    const state = existing
      ? { name: existing.name, type: existing.type || 'other',
          items: (existing.items || []).map(String), _id: existing._id }
      : { name: '', type: 'travel', items: [] };

    App.wardrobe.openModal({
      title: isEdit ? 'Edit collection' : 'New collection',
      bodyHtml: formBodyHtml(state),
      footerHtml: formFooterHtml(isEdit),
      onMount: (modal) => mountFormView(modal, state, isEdit),
    });
  }

  // EN: Builds the HTML of the collection form body (name, type, item selection button).
  // ET: Koostab kollektsiooni vormi keha HTML-i (nimi, tüüp, esemete valiku nupp).
  // RU: Формирует HTML тела формы коллекции (имя, тип, кнопка выбора вещей).
  function formBodyHtml(state) {
    return ''
      + '<form id="col-form">'
      + '  <label class="field"><span class="field-label">Name <span aria-hidden>*</span></span>'
      + '    <input type="text" name="name" required maxlength="200" value="' + esc(state.name) + '" />'
      + '  </label>'
      + '  <label class="field"><span class="field-label">Type</span>'
      + '    <select name="type">'
      + '      <option value="travel"' + (state.type === 'travel' ? ' selected' : '') + '>Travel</option>'
      + '      <option value="moving"' + (state.type === 'moving' ? ' selected' : '') + '>Moving</option>'
      + '      <option value="other"'  + (state.type === 'other'  ? ' selected' : '') + '>Other</option>'
      + '    </select>'
      + '  </label>'
      + '  <div class="field">'
      + '    <span class="field-label">Items</span>'
      + '    <div style="display:flex;gap:var(--sp-1);align-items:center">'
      + '      <span id="col-count" class="muted">' + state.items.length + ' selected</span>'
      + '      <button type="button" class="btn btn-secondary btn-sm" id="btn-pick-items">'
      + '        <i data-lucide="plus"></i>Choose items</button>'
      + '    </div>'
      + '  </div>'
      + '</form>';
  }

  // EN: Builds the HTML of the collection form footer (Cancel and Save/Create buttons).
  // ET: Koostab kollektsiooni vormi jaluse HTML-i (Tühista ja Salvesta/Loo nupud).
  // RU: Формирует HTML подвала формы коллекции (кнопки Отмена и Сохранить/Создать).
  function formFooterHtml(isEdit) {
    return '<button type="button" class="btn btn-ghost" data-close>Cancel</button>'
      + '<button type="button" class="btn btn-primary" id="btn-save-col">'
      +   (isEdit ? 'Save changes' : 'Create')
      + '</button>';
  }

  // EN: Binds the collection form view events — field changes, item selection, and saving.
  // ET: Seob kollektsiooni vormivaate sündmused — väljade muudatused, esemete valik ja salvestamine.
  // RU: Привязывает события вида формы коллекции — изменения полей, выбор вещей и сохранение.
  function mountFormView(modal, state, isEdit) {
    const form = modal.querySelector('#col-form');

    form.elements.name.addEventListener('input', () => { state.name = form.elements.name.value; });
    form.elements.type.addEventListener('change', () => { state.type = form.elements.type.value; });

    modal.querySelector('#btn-pick-items').addEventListener('click', () => {
      state.name = form.elements.name.value;
      state.type = form.elements.type.value;
      swapToPicker(modal, state, isEdit);
    });

    modal.querySelector('#btn-save-col').addEventListener('click', async () => {
      const name = form.elements.name.value.trim();
      const type = form.elements.type.value;
      if (!name) { App.api.toast('Name is required', 'error'); return; }

      try {
        let saved;
        if (isEdit) {
          const r = await App.api.updateCollection(state._id,
            { name, type, items: state.items });
          saved = r.collection;
          App.store.set('collections',
            App.store.state.collections.map((c) => c._id === saved._id ? saved : c));
        } else {
          const r = await App.api.createCollection({ name, type, items: state.items });
          saved = r.collection;
          App.store.set('collections', [saved].concat(App.store.state.collections));
        }
        App.api.toast(isEdit ? 'Collection updated' : 'Collection created', 'success');
        App.wardrobe.closeModal();
      } catch (err) {
        App.api.toast('Save failed: ' + err.message, 'error');
      }
    });

    if (window.lucide) lucide.createIcons();
  }

  // EN: Switches the modal content from the form to the multi-select item view, preserving entered data.
  // ET: Vahetab modaali sisu vormilt esemete mitmikvaliku vaatele, säilitades sisestatud andmed.
  // RU: Переключает содержимое модального окна с формы на вид множественного выбора вещей, сохраняя введённые данные.
  function swapToPicker(modal, state, isEdit) {
    const items = App.store.state.items || [];
    if (!items.length) {
      App.api.toast('Your wardrobe is empty', 'info');
      return;
    }
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');
    const title = modal.querySelector('.modal-title');
    title.textContent = 'Select items';

    const selected = new Set(state.items.map(String));
    body.innerHTML =
      '<div class="card-grid card-grid--compact">'
      + items.map((it) => pickCardMarkup(it, selected.has(it._id))).join('')
      + '</div>';
    footer.innerHTML =
      '<button type="button" class="btn btn-ghost" id="pick-cancel">Cancel</button>'
      + '<button type="button" class="btn btn-primary" id="pick-done">Use selection</button>';

    body.querySelectorAll('[data-pickable]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.pickable;
        if (selected.has(id)) { selected.delete(id); card.classList.remove('selected'); }
        else { selected.add(id); card.classList.add('selected'); }
      });
    });
    footer.querySelector('#pick-cancel').addEventListener('click', () => {
      swapToForm(modal, state, isEdit);
    });
    footer.querySelector('#pick-done').addEventListener('click', () => {
      state.items = Array.from(selected);
      swapToForm(modal, state, isEdit);
    });

    if (window.lucide) lucide.createIcons();
  }

  // EN: Switches the modal content from the item selection view back to the collection form.
  // ET: Vahetab modaali sisu esemete valiku vaatelt tagasi kollektsiooni vormile.
  // RU: Переключает содержимое модального окна с вида выбора вещей обратно на форму коллекции.
  function swapToForm(modal, state, isEdit) {
    const body = modal.querySelector('.modal-body');
    const footer = modal.querySelector('.modal-footer');
    const title = modal.querySelector('.modal-title');
    title.textContent = isEdit ? 'Edit collection' : 'New collection';
    body.innerHTML = formBodyHtml(state);
    footer.innerHTML = formFooterHtml(isEdit);
    footer.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', App.wardrobe.closeModal)
    );
    mountFormView(modal, state, isEdit);
  }

  // EN: Builds the HTML of one clothing item card for the selection view, marking it selected if needed.
  // ET: Koostab valikuvaate jaoks ühe rõivaeseme kaardi HTML-i, märkides selle vajadusel valituks.
  // RU: Формирует HTML карточки одной вещи для вида выбора, помечая её выбранной при необходимости.
  function pickCardMarkup(item, isSelected) {
    const parent = (item.category && item.category.parent) || '';
    const imgPart = item.imageUrl
      ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" />'
      : '<div class="placeholder"><i data-lucide="' + esc(App.wardrobe.categoryIcon(parent)) + '"></i></div>';
    return ''
      + '<article class="card selectable ' + (isSelected ? 'selected' : '') + '" data-pickable="' + esc(item._id) + '">'
      +   '<span class="select-tick"><i data-lucide="check"></i></span>'
      +   '<div class="card-image">' + imgPart + '</div>'
      +   '<div class="card-body"><h3 class="card-name">' + esc(item.name) + '</h3></div>'
      + '</article>';
  }

  window.App = window.App || {};
  window.App.collections = { render };
})();
