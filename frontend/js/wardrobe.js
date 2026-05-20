(function () {
  'use strict';

  const CATEGORY_TREE = {
    'Kleidid ja pükskostüümid':       { icon: 'person-standing',
      children: ['Kleidid', 'Kostüümid'] },
    'Pluusid, särgid ja kampsunid':   { icon: 'shirt',
      children: ['Särgid ja pluusid', 'Kapuutsiga jakid', 'T-särgid',
                 'Kampsunid ja lühikampsunid', 'Alussärgid ja topid',
                 'Vestid ja jakid'] },
    'Püksid ja seelikud':             { icon: 'shirt',
      children: ['Teksad', 'Seelikud', 'Püksid',
                 'Lühikesed püksid ja suvepüksid', 'Lõhikud'] },
    'Üleriided':                       { icon: 'shirt',
      children: ['Talve', 'Mantlid', 'Jakid', 'Suve', 'Kapuutsid', 'Nahktagid'] },
    'Jalatsid':                        { icon: 'footprints',
      children: ['Saapad', 'Poolsaapad', 'Kingad', 'Jooksukingad',
                 'Sussid ja sandaalid'] },
    'Spordirõivad':                    { icon: 'dumbbell',
      children: ['Ülaosa', 'Alaosa'] },
    'Aksessuaarid':                    { icon: 'glasses',
      children: ['Kotid', 'Ehted', 'Vööd', 'Mütsid', 'Kindad', 'Päikeseprillid'] },
  };

  // EN: Returns the icon name for a main category; the default value "shirt" for an unknown category.
  // ET: Tagastab põhikategooriale vastava ikooni nime; tundmatu kategooria korral vaikeväärtuse "shirt".
  // RU: Возвращает имя иконки для основной категории; для неизвестной категории — значение по умолчанию "shirt".
  function categoryIcon(parent) {
    return (CATEGORY_TREE[parent] && CATEGORY_TREE[parent].icon) || 'shirt';
  }

  // EN: Escapes HTML special characters so user input can be safely inserted via innerHTML (XSS protection).
  // ET: Varjestab HTML-i erimärgid, et kasutaja sisendit saaks ohutult innerHTML-i kaudu lisada (XSS-kaitse).
  // RU: Экранирует спецсимволы HTML, чтобы ввод пользователя можно было безопасно вставлять через innerHTML (защита от XSS).
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // EN: Returns the color only if it is a valid hex value (#RGB/#RRGGBB/#RRGGBBAA); otherwise an empty string.
  // ET: Tagastab värvi ainult siis, kui see on kehtiv hex-väärtus (#RGB/#RRGGBB/#RRGGBBAA); muidu tühja stringi.
  // RU: Возвращает цвет только если это допустимое hex-значение (#RGB/#RRGGBB/#RRGGBBAA); иначе пустую строку.
  function safeHex(s) {
    return /^#[0-9a-f]{3,8}$/i.test(String(s || '')) ? String(s) : '';
  }

  // EN: Loads clothing items from the server (for an admin, the selected user's items) and stores them in state.
  // ET: Laadib serverist rõivaesemed (admini puhul valitud kasutaja omad) ja salvestab need olekusse.
  // RU: Загружает вещи с сервера (для админа — вещи выбранного пользователя) и сохраняет их в состояние.
  async function loadItems() {
    const params = {};
    if (App.auth.isAdmin() && App.store.state.adminViewUserId) {
      params.userId = App.store.state.adminViewUserId;
    }
    try {
      const { items } = await App.api.listItems(params);
      App.store.set('items', items || []);
    } catch (err) {
      App.api.toast('Failed to load wardrobe: ' + err.message, 'error');
      App.store.set('items', []);
    }
  }

  // EN: Returns the client-side filtered clothing items based on the current filters (search, color, category, material).
  // ET: Tagastab kliendipoolselt filtreeritud rõivaesemed praeguste filtrite (otsing, värv, kategooria, materjal) põhjal.
  // RU: Возвращает отфильтрованные на стороне клиента вещи по текущим фильтрам (поиск, цвет, категория, материал).
  function visibleItems() {
    const items = App.store.state.items || [];
    const f = App.store.state.filters;
    const q = (f.search || '').toLowerCase().trim();

    return items.filter((it) => {
      if (q && !(it.name || '').toLowerCase().includes(q)) return false;
      if (f.color) {
        const label = (it.color && it.color.label || '').toLowerCase();
        const hex   = (it.color && it.color.hex   || '').toLowerCase();
        if (label !== f.color.toLowerCase() && hex !== f.color.toLowerCase()) return false;
      }
      if (f.category) {
        const parent = it.category && it.category.parent;
        const child  = it.category && it.category.child;
        if (parent !== f.category && child !== f.category) return false;
      }
      if (f.material) {
        if ((it.material || '').toLowerCase() !== f.material.toLowerCase()) return false;
      }
      return true;
    });
  }

  // EN: Renders the wardrobe page, binds events, loads the data, and returns a cleanup function.
  // ET: Joonistab garderoobi lehe, seob sündmused, laadib andmed ja tagastab koristusfunktsiooni.
  // RU: Отрисовывает страницу гардероба, привязывает события, загружает данные и возвращает функцию очистки.
  function render() {
    const view = document.getElementById('view');
    view.innerHTML = pageMarkup();

    wireFilterBar(view);
    wireFabAndCards(view);

    const offItems   = App.store.on('items',   () => repaintGrid());
    const offFilters = App.store.on('filters', () => { repaintGrid(); repaintActiveChips(); });

    loadItems().then(() => repaintGrid());

    if (window.lucide) lucide.createIcons();

    return () => { offItems(); offFilters(); };
  }

  // EN: Builds and returns the wardrobe page HTML markup (header, filter bar, grid, add button).
  // ET: Koostab ja tagastab garderoobi lehe HTML-märgistuse (päis, filtririba, ruudustik, lisamisnupp).
  // RU: Формирует и возвращает HTML-разметку страницы гардероба (шапка, панель фильтров, сетка, кнопка добавления).
  function pageMarkup() {
    const readOnly = !!App.store.state.adminViewUserId;
    return ''
      + '<header class="page-header">'
      +   '<h1 class="page-title">Wardrobe</h1>'
      +   (readOnly
            ? '<button id="exit-admin-view" class="btn btn-ghost btn-sm">'
              + '<i data-lucide="arrow-left"></i> Back to admin</button>'
            : '<div class="page-actions">'
              + '<button id="btn-add-item" class="btn btn-primary">'
              +   '<i data-lucide="plus"></i>Add item</button>'
              + '</div>')
      + '</header>'

      + '<section class="filter-bar" aria-label="Search and filters">'
      +   '<div class="search-input">'
      +     '<i data-lucide="search"></i>'
      +     '<input type="search" id="f-search" placeholder="Search by name…" autocomplete="off" />'
      +   '</div>'
      +   '<div class="filter-chips" id="f-chips">'
      +     '<button class="chip" data-filter-add="category"><i data-lucide="tag"></i>Category</button>'
      +     '<button class="chip" data-filter-add="color"><i data-lucide="palette"></i>Color</button>'
      +     '<button class="chip" data-filter-add="material"><i data-lucide="layers"></i>Material</button>'
      +   '</div>'
      + '</section>'

      + '<div id="active-chips" class="filter-chips" style="margin-bottom:var(--sp-2)"></div>'

      + '<div id="grid" class="card-grid" aria-live="polite"></div>'

      + (readOnly
          ? ''
          : '<button id="fab-add" class="fab fab--mobile" aria-label="Add item">'
            + '<i data-lucide="plus"></i>Add item</button>');
  }

  // EN: Binds the filter bar events — the search field, filter buttons, and the exit-admin-view button.
  // ET: Seob filtririba sündmused — otsinguväli, filtrinupud ja admini vaatest väljumise nupp.
  // RU: Привязывает события панели фильтров — поле поиска, кнопки фильтров и кнопку выхода из режима админа.
  function wireFilterBar(view) {
    const input = view.querySelector('#f-search');
    input.value = App.store.state.filters.search || '';
    input.addEventListener('input', (e) => {
      App.store.patchFilters({ search: e.target.value });
    });

    view.querySelectorAll('[data-filter-add]').forEach((btn) => {
      btn.addEventListener('click', () => openFilterPicker(btn.dataset.filterAdd));
    });

    const exitBtn = view.querySelector('#exit-admin-view');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        App.store.set('adminViewUserId', null);
        location.hash = '#/admin';
      });
    }
  }

  // EN: Binds the "Add item" buttons (both the floating FAB and the header button) to the add-item modal.
  // ET: Seob "Lisa ese" nupud (nii hõljuva FAB-i kui ka päisenupu) eseme lisamise modaaliga.
  // RU: Привязывает кнопки «Добавить вещь» (плавающую FAB и кнопку в шапке) к модальному окну добавления вещи.
  function wireFabAndCards(view) {
    const openNew = () => openItemModal(null);
    const fab = view.querySelector('#fab-add');
    if (fab) fab.addEventListener('click', openNew);
    const headerBtn = view.querySelector('#btn-add-item');
    if (headerBtn) headerBtn.addEventListener('click', openNew);
  }

  // EN: Repaints the card grid of visible items and binds each card's clicks (open, edit, delete).
  // ET: Joonistab nähtavate esemete kaardiruudustiku uuesti ja seob iga kaardi klikid (avamine, muutmine, kustutamine).
  // RU: Перерисовывает сетку карточек видимых вещей и привязывает клики по каждой карточке (открытие, изменение, удаление).
  function repaintGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const items = visibleItems();
    if (!items.length) {
      grid.innerHTML = ''
        + '<div class="empty-state" style="grid-column:1/-1">'
        +   '<i data-lucide="shirt"></i>'
        +   '<p>No items yet. Tap + to add your first.</p>'
        + '</div>';
      if (window.lucide) lucide.createIcons();
      return;
    }
    grid.innerHTML = items.map(cardMarkup).join('');
    const findItem = (id) => (App.store.state.items || []).find((i) => i._id === id);
    grid.querySelectorAll('[data-card]').forEach((node) => {
      node.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const item = findItem(node.dataset.card);
        if (item) openItemLightbox(item);
      });
      node.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-action]')) return;
        e.preventDefault();
        const item = findItem(node.dataset.card);
        if (item) openItemLightbox(item);
      });
    });
    grid.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = findItem(btn.dataset.id);
        if (item) openItemModal(item);
      });
    });
    grid.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this item?')) return;
        try {
          await App.api.deleteItem(id);
          App.store.set('items', App.store.state.items.filter((i) => i._id !== id));
          App.api.toast('Item deleted', 'success');
        } catch (err) {
          App.api.toast('Delete failed: ' + err.message, 'error');
        }
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  // EN: Builds the HTML of one clothing item card (image, ID label, weather badges, color, category, material).
  // ET: Koostab ühe rõivaeseme kaardi HTML-i (pilt, ID-silt, ilmamärgised, värv, kategooria, materjal).
  // RU: Формирует HTML одной карточки вещи (изображение, метка ID, погодные значки, цвет, категория, материал).
  function cardMarkup(item) {
    const hex      = (item.color && item.color.hex) || '';
    const label    = (item.color && item.color.label) || '';
    const parent   = (item.category && item.category.parent) || '';
    const child    = (item.category && item.category.child)  || '';
    const material = item.material || '';
    const showId   = App.auth.isAdmin();
    const readOnly = !!App.store.state.adminViewUserId;

    const imgPart = item.imageUrl
      ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" />'
      : '<div class="placeholder"><i data-lucide="' + esc(categoryIcon(parent)) + '"></i></div>';

    const idChip = showId && item.itemId
      ? '<span class="card-id-chip" title="Item ID">#' + esc(infoIdShort(item.itemId)) + '</span>'
      : '';

    const flagBits = [];
    if (item.waterproof) flagBits.push('<span class="flag-pip" title="Waterproof"><i data-lucide="cloud-rain"></i></span>');
    if (item.windproof)  flagBits.push('<span class="flag-pip" title="Windproof"><i data-lucide="wind"></i></span>');
    const flagsHtml = flagBits.length ? '<div class="card-flag-pips">' + flagBits.join('') + '</div>' : '';

    const safeHexValue = safeHex(hex);
    const colorRow = (safeHexValue || label) ? infoRow(
      safeHexValue
        ? '<span class="color-swatch" style="background:' + safeHexValue + '"></span>'
        : '<i data-lucide="palette" aria-hidden="true"></i>',
      label || '—'
    ) : '';

    const catText = (parent && child) ? (parent + ' · ' + child) : (parent || child);
    const catRow  = catText
      ? infoRow('<i data-lucide="tag" aria-hidden="true"></i>', catText)
      : '';

    const matRow = material
      ? infoRow('<i data-lucide="layers" aria-hidden="true"></i>', material)
      : '';

    const id = esc(item._id);
    const name = esc(item.name);
    const actions = readOnly ? '' : cardActionsHtml(id);

    return ''
      + '<article class="card" data-card="' + id + '" tabindex="0">'
      +   '<div class="card-image">' + imgPart + idChip + flagsHtml + '</div>'
      +   '<div class="card-body">'
      +     '<h3 class="card-name" title="' + name + '">' + name + '</h3>'
      +     '<div class="card-info">' + colorRow + catRow + matRow + '</div>'
      +   '</div>'
      +   actions
      + '</article>';
  }

  // EN: Builds the row of action buttons (Edit and Delete) at the bottom of the card.
  // ET: Koostab kaardi alaossa tegevusnuppude rea (Muuda ja Kustuta).
  // RU: Формирует строку кнопок действий в нижней части карточки (Изменить и Удалить).
  function cardActionsHtml(escapedId) {
    return '<div class="card-actions">'
      + '<button class="btn btn-secondary btn-sm" data-action="edit" data-id="' + escapedId + '">'
      +   '<i data-lucide="pencil"></i>Edit</button>'
      + '<button class="btn btn-danger btn-sm" data-action="delete" data-id="' + escapedId + '">'
      +   '<i data-lucide="trash-2"></i></button>'
      + '</div>';
  }

  // EN: Builds one info row with an icon and escaped text in the card body.
  // ET: Koostab ühe info-rea ikooni ja varjestatud tekstiga kaardi kehasse.
  // RU: Формирует одну строку информации с иконкой и экранированным текстом в теле карточки.
  function infoRow(iconHtml, text) {
    return '<div class="card-info-row">'
      + iconHtml
      + '<span class="info-text" title="' + esc(text) + '">' + esc(text) + '</span>'
      + '</div>';
  }

  // EN: Removes the leading zeros from an item ID so the short label stays readable.
  // ET: Eemaldab eseme ID eest tühistavad nullid, et lühike silt jääks loetavaks.
  // RU: Убирает ведущие нули из ID вещи, чтобы короткая метка оставалась читаемой.
  function infoIdShort(id) {
    const s = String(id);
    return s.replace(/^0+(?=\d)/, '');
  }

  // EN: Opens a mini modal for choosing a filter (color, material, or category) from the available values.
  // ET: Avab mini-modaali filtri valimiseks (värv, materjal või kategooria) saadaolevate väärtuste seast.
  // RU: Открывает мини-модальное окно для выбора фильтра (цвет, материал или категория) из доступных значений.
  function openFilterPicker(kind) {
    let options = [];
    const items = App.store.state.items || [];
    if (kind === 'color') {
      const seen = new Map();
      items.forEach((it) => {
        const k = (it.color && (it.color.label || it.color.hex)) || '';
        if (k && !seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
      });
      options = Array.from(seen.values());
    } else if (kind === 'material') {
      const seen = new Set();
      items.forEach((it) => { if (it.material) seen.add(it.material); });
      options = Array.from(seen);
    } else if (kind === 'category') {
      Object.values(CATEGORY_TREE).forEach((node) => {
        node.children.forEach((c) => options.push(c));
      });
    }
    if (!options.length) {
      App.api.toast('Nothing to filter by yet for ' + kind, 'info');
      return;
    }

    openModal({
      title: 'Filter by ' + kind,
      bodyHtml:
        '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">'
        + options.map((v) =>
          '<li><button type="button" class="btn btn-secondary btn-block" data-pick="'
          + esc(v) + '">' + esc(v) + '</button></li>'
        ).join('')
        + '</ul>',
      onMount: (modal) => {
        modal.querySelectorAll('[data-pick]').forEach((b) => {
          b.addEventListener('click', () => {
            const patch = {};
            patch[kind] = b.dataset.pick;
            App.store.patchFilters(patch);
            closeModal();
          });
        });
      },
    });
  }

  // EN: Repaints the active filter chips along with their remove buttons.
  // ET: Joonistab uuesti aktiivsete filtrite sildid koos nende eemaldamise nuppudega.
  // RU: Перерисовывает метки активных фильтров вместе с кнопками их удаления.
  function repaintActiveChips() {
    const root = document.getElementById('active-chips');
    if (!root) return;
    const f = App.store.state.filters;
    const kinds = ['category', 'color', 'material'];
    root.innerHTML = kinds
      .filter((k) => f[k])
      .map((k) =>
        '<span class="chip-active">'
        + esc(k) + ': ' + esc(f[k])
        + '<button data-clear="' + esc(k) + '" aria-label="Clear ' + esc(k) + ' filter">'
        +   '<i data-lucide="x"></i>'
        + '</button>'
        + '</span>'
      ).join('');
    root.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const patch = {};
        patch[btn.dataset.clear] = null;
        App.store.patchFilters(patch);
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  // EN: Opens the large photo view (lightbox) of an item along with its metadata; read-only for the user.
  // ET: Avab eseme suure foto vaate (lightbox) koos eseme metaandmetega; kasutaja jaoks ainult lugemiseks.
  // RU: Открывает крупный просмотр фото вещи (lightbox) вместе с метаданными вещи; для пользователя только для чтения.
  function openItemLightbox(item) {
    const parent = (item.category && item.category.parent) || '';
    const child  = (item.category && item.category.child)  || '';
    const catText = (parent && child) ? (parent + ' · ' + child) : (parent || child);
    const colorLabel = (item.color && item.color.label) || '';
    const colorHex   = (item.color && item.color.hex)   || '';
    const material   = item.material || '';

    const imgPart = item.imageUrl
      ? '<img class="lightbox-img" src="' + esc(item.imageUrl) + '" alt="' + esc(item.name) + '" />'
      : '<div class="lightbox-placeholder"><i data-lucide="'
        + esc(categoryIcon(parent)) + '"></i></div>';

    const safeColorHex = safeHex(colorHex);
    const metaRows = []
      .concat(colorLabel || safeColorHex
        ? ['<div class="lightbox-meta-row">'
            + (safeColorHex
                ? '<span class="color-swatch" style="background:' + safeColorHex + '"></span>'
                : '<i data-lucide="palette" aria-hidden="true"></i>')
            + '<span>' + esc(colorLabel || '—') + '</span>'
          + '</div>']
        : [])
      .concat(catText
        ? ['<div class="lightbox-meta-row">'
            + '<i data-lucide="tag" aria-hidden="true"></i>'
            + '<span>' + esc(catText) + '</span>'
          + '</div>']
        : [])
      .concat(material
        ? ['<div class="lightbox-meta-row">'
            + '<i data-lucide="layers" aria-hidden="true"></i>'
            + '<span>' + esc(material) + '</span>'
          + '</div>']
        : [])
      .concat((item.waterproof || item.windproof)
        ? ['<div class="lightbox-meta-row">'
            + '<i data-lucide="cloud-sun" aria-hidden="true"></i>'
            + '<span>'
            +   [item.waterproof ? 'waterproof' : null, item.windproof ? 'windproof' : null]
                  .filter(Boolean).join(' · ')
            + '</span>'
          + '</div>']
        : [])
      .concat(item.comment
        ? ['<div class="lightbox-meta-row lightbox-meta-comment">'
            + '<i data-lucide="message-square" aria-hidden="true"></i>'
            + '<span>' + esc(item.comment) + '</span>'
          + '</div>']
        : []);

    const readOnly = !!App.store.state.adminViewUserId;

    openModal({
      title: item.name,
      modifier: 'modal--lightbox',
      bodyHtml:
        '<div class="lightbox">'
        + '<div class="lightbox-photo">' + imgPart + '</div>'
        + (metaRows.length
            ? '<div class="lightbox-meta">' + metaRows.join('') + '</div>'
            : '')
        + '</div>',
      footerHtml: readOnly
        ? '<button type="button" class="btn btn-ghost" data-close>Close</button>'
        : '<button type="button" class="btn btn-ghost" data-close>Close</button>'
          + '<button type="button" class="btn btn-primary" id="lightbox-edit">'
          + '<i data-lucide="pencil"></i>Edit</button>',
      onMount: (root) => {
        const editBtn = root.querySelector('#lightbox-edit');
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            closeModal();
            openItemModal(item);
          });
        }
      },
    });
  }

  let modalState = null;

  // EN: Opens the add-or-edit item modal, preparing the form state from an existing item or empty fields.
  // ET: Avab eseme lisamise või muutmise modaali, valmistades ette vormi oleku olemasoleva eseme või tühjade väljadega.
  // RU: Открывает модальное окно добавления или изменения вещи, подготавливая состояние формы из существующей вещи или пустых полей.
  function openItemModal(item) {
    modalState = item
      ? {
          editingId: item._id,
          imageUrl: item.imageUrl || null,
          file: null,
          color: (item.color && item.color.hex) || '#cccccc',
          colorLabel: (item.color && item.color.label) || '',
          parent: (item.category && item.category.parent) || '',
          child:  (item.category && item.category.child)  || '',
          name: item.name || '',
          material: item.material || '',
          waterproof: !!item.waterproof,
          windproof:  !!item.windproof,
          comment: item.comment || '',
          itemId: item.itemId || null,
        }
      : {
          editingId: null, imageUrl: null, file: null,
          color: '#cccccc', colorLabel: '', parent: '', child: '',
          name: '', material: '',
          waterproof: false, windproof: false,
          comment: '',
          itemId: null,
        };

    openModal({
      title: modalState.editingId ? 'Edit item' : 'Add item',
      bodyHtml: itemFormMarkup(modalState),
      footerHtml:
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>'
        + '<button type="submit" form="item-form" class="btn btn-primary">'
        +   (modalState.editingId ? 'Save changes' : 'Add to wardrobe')
        + '</button>',
      onMount: wireItemForm,
    });
  }

  // EN: Builds the HTML of the item form (image area, name, category, color, material, weather badges, comment).
  // ET: Koostab eseme vormi HTML-i (pildiala, nimi, kategooria, värv, materjal, ilmamärgised, kommentaar).
  // RU: Формирует HTML формы вещи (зона изображения, имя, категория, цвет, материал, погодные значки, комментарий).
  function itemFormMarkup(s) {
    const showId = App.auth.isAdmin();

    return ''
      + '<form id="item-form" novalidate>'

      + '  <div class="field"><span class="field-label">Photo</span>'
      + '    <label class="upload-zone" id="upload-zone">'
      + '      <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp" />'
      + '      <div id="upload-content"></div>'
      + '    </label>'
      + '  </div>'

      + '  <label class="field"><span class="field-label">Name <span aria-hidden>*</span></span>'
      + '    <input type="text" name="name" required maxlength="200" value="' + esc(s.name) + '" />'
      + '  </label>'

      + '  <div class="field"><span class="field-label">Category</span>'
      + '    <div class="cat-select">'
      + '      <select id="cat-parent">'
      +          '<option value="">— Parent —</option>'
      +          Object.keys(CATEGORY_TREE).map((p) =>
                   '<option value="' + esc(p) + '"' + (p === s.parent ? ' selected' : '') + '>' + esc(p) + '</option>'
                 ).join('')
      + '      </select>'
      + '      <select id="cat-child">'
      +          '<option value="">— Sub-category —</option>'
      +          (s.parent && CATEGORY_TREE[s.parent]
                    ? CATEGORY_TREE[s.parent].children.map((c) =>
                        '<option value="' + esc(c) + '"' + (c === s.child ? ' selected' : '') + '>' + esc(c) + '</option>'
                      ).join('')
                    : '')
      + '      </select>'
      + '    </div>'
      + '  </div>'

      + '  <div class="field"><span class="field-label">Color</span>'
      + '    <div class="color-row">'
      + '      <input type="color" id="color-hex" value="' + esc(s.color || '#cccccc') + '" />'
      + '      <input type="text"  id="color-label" placeholder="e.g. forest green" maxlength="64" value="' + esc(s.colorLabel) + '" />'
      + '    </div>'
      + '  </div>'

      + '  <label class="field"><span class="field-label">Material</span>'
      + '    <input type="text" name="material" maxlength="120" placeholder="e.g. cotton, linen blend" value="' + esc(s.material) + '" />'
      + '  </label>'

      + '  <div class="field"><span class="field-label">Weather</span>'
      + '    <div class="weather-flags">'
      + '      <label class="flag-chip"><input type="checkbox" id="flag-waterproof"'
      +          (s.waterproof ? ' checked' : '') + ' />'
      + '        <i data-lucide="cloud-rain" aria-hidden="true"></i> Waterproof</label>'
      + '      <label class="flag-chip"><input type="checkbox" id="flag-windproof"'
      +          (s.windproof ? ' checked' : '') + ' />'
      + '        <i data-lucide="wind" aria-hidden="true"></i> Windproof</label>'
      + '    </div>'
      + '  </div>'

      + '  <label class="field"><span class="field-label">Comment'
      + '    <span class="muted-hint" id="comment-counter">'
      +        (s.comment ? s.comment.length : 0) + '/500</span></span>'
      + '    <textarea id="comment" name="comment" maxlength="500" rows="3"'
      + '              placeholder="Notes, care instructions, memories…">'
      +        esc(s.comment) + '</textarea>'
      + '  </label>'

      + (showId
          ? '  <label class="field"><span class="field-label">Item ID</span>'
            + '    <input type="text" readonly value="' + esc(s.itemId || '(assigned on save)') + '" />'
            + '  </label>'
          : '')

      + '</form>';
  }

  // EN: Binds the item form events — image upload, drag-and-drop, category/color selection, and form submission.
  // ET: Seob eseme vormi sündmused — pildi üleslaadimine, lohistamine, kategooria/värvi valik ja vormi esitamine.
  // RU: Привязывает события формы вещи — загрузку изображения, перетаскивание, выбор категории/цвета и отправку формы.
  function wireItemForm(modal) {
    const form  = modal.querySelector('#item-form');
    const zone  = modal.querySelector('#upload-zone');
    const file  = modal.querySelector('#file-input');
    const cParent = modal.querySelector('#cat-parent');
    const cChild  = modal.querySelector('#cat-child');
    const colorHex   = modal.querySelector('#color-hex');
    const colorLabel = modal.querySelector('#color-label');

    paintUploadContent();

    ['dragenter', 'dragover'].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault(); zone.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault(); zone.classList.remove('dragover');
      })
    );
    zone.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFileChosen(f);
    });
    file.addEventListener('change', () => {
      if (file.files && file.files[0]) handleFileChosen(file.files[0]);
    });

    cParent.addEventListener('change', () => {
      modalState.parent = cParent.value;
      modalState.child  = '';
      const opts = ['<option value="">— Sub-category —</option>'];
      const node = CATEGORY_TREE[cParent.value];
      if (node) node.children.forEach((c) =>
        opts.push('<option value="' + esc(c) + '">' + esc(c) + '</option>')
      );
      cChild.innerHTML = opts.join('');
    });
    cChild.addEventListener('change', () => { modalState.child = cChild.value; });

    colorHex.addEventListener('input',   () => { modalState.color = colorHex.value; });
    colorLabel.addEventListener('input', () => { modalState.colorLabel = colorLabel.value; });

    const fWater = modal.querySelector('#flag-waterproof');
    const fWind  = modal.querySelector('#flag-windproof');
    if (fWater) fWater.addEventListener('change', () => { modalState.waterproof = fWater.checked; });
    if (fWind)  fWind .addEventListener('change', () => { modalState.windproof  = fWind.checked;  });

    const commentArea = modal.querySelector('#comment');
    const commentCounter = modal.querySelector('#comment-counter');
    if (commentArea) {
      commentArea.addEventListener('input', () => {
        modalState.comment = commentArea.value;
        if (commentCounter) commentCounter.textContent = commentArea.value.length + '/500';
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitItemForm(form);
    });

    // EN: Renders the image upload area content — the preview image, a placeholder, or an upload hint.
    // ET: Joonistab pildi üleslaadimisala sisu — eelvaatepildi, kohatäite või üleslaadimisvihje.
    // RU: Отрисовывает содержимое зоны загрузки изображения — предпросмотр, заполнитель или подсказку загрузки.
    function paintUploadContent() {
      const c = modal.querySelector('#upload-content');
      if (modalState.imageUrl) {
        c.innerHTML = '<img class="upload-preview" src="' + esc(modalState.imageUrl) + '" alt="preview" />';
      } else if (modalState.parent) {
        c.innerHTML =
          '<div class="upload-preview-placeholder" aria-hidden="true">'
          + '<i data-lucide="' + esc(categoryIcon(modalState.parent)) + '"></i></div>'
          + '<div class="upload-hint"><i data-lucide="upload"></i>'
          + '<span>Drop image or click to browse</span></div>';
      } else {
        c.innerHTML =
          '<div class="upload-hint">'
          + '<i data-lucide="image-plus"></i>'
          + '<strong>Upload a photo</strong>'
          + '<span>Drag &amp; drop or click to browse</span>'
          + '</div>';
      }
      if (window.lucide) lucide.createIcons();
    }

    // EN: Handles the chosen image file — shows an instant preview and uploads the file to the server for background removal and color analysis.
    // ET: Töötleb valitud pildifaili — kuvab kohese eelvaate ja laadib faili serverisse tausta eemaldamiseks ja värvianalüüsiks.
    // RU: Обрабатывает выбранный файл изображения — показывает мгновенный предпросмотр и отправляет файл на сервер для удаления фона и анализа цвета.
    async function handleFileChosen(f) {
      const reader = new FileReader();
      reader.onload = () => {
        modalState.imageUrl = reader.result;
        paintUploadContent();
      };
      reader.readAsDataURL(f);
      modalState.file = f;
      modalState.fileKey = f.name + ':' + f.size + ':' + f.lastModified;
      modalState.stagedImageUrl = null;
      modalState.stagedOriginalImageUrl = null;
      modalState.stagedFor = null;

      const busy = document.createElement('div');
      busy.className = 'upload-busy';
      busy.textContent = 'Processing image…';
      zone.appendChild(busy);
      try {
        const fd = new FormData();
        fd.append('image', f);
        const out = await fetch('/api/items/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + App.store.state.user.token },
          body: fd,
        }).then(async (r) => {
          if (!r.ok) throw new Error('upload failed');
          return r.json();
        });
        if (out && out.imageUrl) {
          modalState.imageUrl = out.imageUrl;
          modalState.stagedImageUrl = out.imageUrl;
          modalState.stagedOriginalImageUrl = out.originalImageUrl || null;
          modalState.stagedFor = modalState.fileKey;
          paintUploadContent();
        }
        if (out && out.analysis && out.analysis.color
            && out.analysis.color.confidence >= 0.4) {
          if (!modalState.colorLabel) {
            modalState.colorLabel = out.analysis.color.label;
            modalState.color      = out.analysis.color.hex;
            const labelInput = modal.querySelector('#color-label');
            const hexInput   = modal.querySelector('#color-hex');
            if (labelInput) labelInput.value = modalState.colorLabel;
            if (hexInput)   hexInput.value   = modalState.color;
          }
        }
      } catch (err) {
        // EN: Silent error — the file will still be sent with the form on save.
        // ET: Vaikne viga — fail saadetakse ikkagi koos vormiga salvestamisel.
        // RU: Тихая ошибка — файл всё равно будет отправлен вместе с формой при сохранении.
      } finally {
        busy.remove();
      }
    }
  }

  // EN: Submits the item form — builds FormData and sends the create or update request to the server.
  // ET: Esitab eseme vormi — koostab FormData ja saadab serverisse loomis- või uuendamispäringu.
  // RU: Отправляет форму вещи — формирует FormData и посылает на сервер запрос создания или обновления.
  async function submitItemForm(form) {
    const name = form.elements.name.value.trim();
    if (!name) {
      App.api.toast('Name is required', 'error');
      return;
    }

    const fd = new FormData();
    fd.append('name', name);
    fd.append('material', form.elements.material.value.trim());
    fd.append('color', JSON.stringify({
      hex:   modalState.color || '',
      label: modalState.colorLabel || '',
    }));
    fd.append('category', JSON.stringify({
      parent: modalState.parent || '',
      child:  modalState.child  || '',
    }));
    fd.append('waterproof', modalState.waterproof ? 'true' : 'false');
    fd.append('windproof',  modalState.windproof  ? 'true' : 'false');
    fd.append('comment', modalState.comment || '');
    const stagedReusable = modalState.stagedImageUrl
      && modalState.stagedFor
      && modalState.stagedFor === modalState.fileKey;
    if (stagedReusable) {
      fd.append('stagedImageUrl', modalState.stagedImageUrl);
      if (modalState.stagedOriginalImageUrl) {
        fd.append('stagedOriginalImageUrl', modalState.stagedOriginalImageUrl);
      }
    } else if (modalState.file) {
      fd.append('image', modalState.file);
    }

    try {
      let saved;
      if (modalState.editingId) {
        const r = await App.api.updateItem(modalState.editingId, fd);
        saved = r.item;
        const items = App.store.state.items.slice();
        const idx = items.findIndex((i) => i._id === saved._id);
        if (idx >= 0) items[idx] = saved; else items.unshift(saved);
        App.store.set('items', items);
        App.api.toast('Item updated', 'success');
      } else {
        const r = await App.api.createItem(fd);
        saved = r.item;
        App.store.set('items', [saved].concat(App.store.state.items));
        App.api.toast('Item added', 'success');
      }
      closeModal();
    } catch (err) {
      App.api.toast('Save failed: ' + err.message, 'error');
    }
  }

  // EN: Opens the shared modal window with the given title, body, and footer content and binds the close handlers.
  // ET: Avab jagatud modaalakna antud pealkirja, keha ja jaluse sisuga ning seob sulgemise käsitlejad.
  // RU: Открывает общее модальное окно с заданным заголовком, телом и подвалом и привязывает обработчики закрытия.
  function openModal({ title, bodyHtml, footerHtml, onMount, modifier }) {
    const root = document.getElementById('modal-root');
    const cls = 'modal' + (modifier ? ' ' + modifier : '');
    root.innerHTML =
      '<div class="' + cls + '" role="document">'
      + '  <header class="modal-header">'
      + '    <h2 class="modal-title">' + esc(title) + '</h2>'
      + '    <button class="modal-close" data-close aria-label="Close">'
      + '      <i data-lucide="x"></i></button>'
      + '  </header>'
      + '  <div class="modal-body">' + (bodyHtml || '') + '</div>'
      + (footerHtml ? '  <footer class="modal-footer">' + footerHtml + '</footer>' : '')
      + '</div>';
    root.hidden = false;

    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', closeModal)
    );
    root.addEventListener('mousedown', backdropClick);

    document.addEventListener('keydown', escKey);

    if (window.lucide) lucide.createIcons();
    if (typeof onMount === 'function') onMount(root);
  }

  // EN: Closes the shared modal window, clears its content, and removes the event handlers.
  // ET: Sulgeb jagatud modaalakna, tühjendab selle sisu ja eemaldab sündmuste käsitlejad.
  // RU: Закрывает общее модальное окно, очищает его содержимое и снимает обработчики событий.
  function closeModal() {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    root.removeEventListener('mousedown', backdropClick);
    document.removeEventListener('keydown', escKey);
  }

  // EN: Closes the modal if the click hit the backdrop (outside the modal content).
  // ET: Sulgeb modaali, kui klikk tabas tausta (modaali sisu kõrvalt).
  // RU: Закрывает модальное окно, если клик пришёлся по фону (вне содержимого модального окна).
  function backdropClick(e) {
    if (e.target.id === 'modal-root') closeModal();
  }
  // EN: Closes the modal when the Escape key is pressed.
  // ET: Sulgeb modaali, kui vajutati Escape-klahvi.
  // RU: Закрывает модальное окно при нажатии клавиши Escape.
  function escKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  window.App = window.App || {};
  window.App.wardrobe = {
    render,
    CATEGORY_TREE,
    categoryIcon,
    esc,
    openModal,
    closeModal,
    loadItems,
  };
})();
