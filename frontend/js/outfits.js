(function () {
  'use strict';

  // EN: Short function for escaping HTML special characters (uses the wardrobe module's esc function).
  // ET: Lühifunktsioon HTML-i erimärkide varjestamiseks (kasutab wardrobe mooduli esc-funktsiooni).
  // RU: Короткая функция для экранирования спецсимволов HTML (использует функцию esc модуля wardrobe).
  const esc = (s) => App.wardrobe.esc(s);

  let bindings = [];
  let editingOutfit = null;
  let canvasState = [];

  // EN: Renders the outfits page, binds the toolbar, enables dragging, and loads the data; returns a cleanup function.
  // ET: Joonistab komplektide lehe, seob tööriistariba, käivitab lohistamise ja laadib andmed; tagastab koristusfunktsiooni.
  // RU: Отрисовывает страницу образов, привязывает панель инструментов, включает перетаскивание и загружает данные; возвращает функцию очистки.
  function render() {
    const view = document.getElementById('view');
    view.innerHTML = pageMarkup();

    wireToolbar();
    initInteract();

    const offItems   = App.store.on('items',   () => repaintCanvas());
    const offOutfits = App.store.on('outfits', () => repaintOutfitsGrid());

    Promise.all([
      ensureItemsLoaded(),
      loadOutfits(),
    ]).then(() => {
      repaintCanvas();
      repaintOutfitsGrid();
    });

    if (window.lucide) lucide.createIcons();

    return () => {
      offItems(); offOutfits();
      tearDownInteract();
      editingOutfit = null;
      canvasState = [];
    };
  }

  // EN: Builds and returns the outfits page HTML markup (header, moodboard editor, saved outfits grid).
  // ET: Koostab ja tagastab komplektide lehe HTML-märgistuse (päis, moodboard-redaktor, salvestatud komplektide ruudustik).
  // RU: Формирует и возвращает HTML-разметку страницы образов (шапка, редактор-муудборд, сетка сохранённых образов).
  function pageMarkup() {
    return ''
      + '<header class="page-header">'
      +   '<h1 class="page-title">Outfits</h1>'
      +   '<div class="page-actions">'
      +     '<button id="btn-new-outfit" class="btn btn-primary">'
      +       '<i data-lucide="plus"></i>New outfit</button>'
      +   '</div>'
      + '</header>'

      + '<div id="outfit-editor" class="outfit-editor">'
      +   '<div class="outfit-editor-mhead">'
      +     '<span>Compose outfit</span>'
      +     '<button type="button" class="outfit-editor-close" id="outfit-editor-close" aria-label="Close editor">'
      +       '<i data-lucide="x"></i>'
      +     '</button>'
      +   '</div>'

      +   '<div class="moodboard-toolbar">'
      +     '<input type="text" id="outfit-name" placeholder="Name this outfit…" maxlength="200" />'
      +     '<button class="btn btn-secondary" id="btn-add-items"><i data-lucide="plus"></i>Add items</button>'
      +     '<button class="btn btn-secondary" id="btn-clear"><i data-lucide="eraser"></i>Clear</button>'
      +     '<button class="btn btn-primary"   id="btn-save"><i data-lucide="save"></i>Save outfit</button>'
      +   '</div>'

      +   '<div id="moodboard" class="moodboard" aria-label="Outfit canvas">'
      +     '<div class="moodboard-empty" id="mb-empty">'
      +       'Empty canvas — tap “Add items” to compose an outfit'
      +     '</div>'
      +   '</div>'
      + '</div>'

      + '<h2 class="page-title" style="font-size:var(--fs-xl);margin:var(--sp-3) 0 var(--sp-2)">Saved outfits</h2>'
      + '<div id="outfit-grid" class="card-grid"></div>'

      + '<button id="fab-add-outfit" class="fab fab--mobile" aria-label="Add outfit">'
      +   '<i data-lucide="plus"></i>Add outfit'
      + '</button>';
  }

  // EN: Binds the editor toolbar buttons (add items, clear, save, new outfit, open/close editor).
  // ET: Seob redaktori tööriistariba nupud (lisa esemeid, tühjenda, salvesta, uus komplekt, ava/sulge redaktor).
  // RU: Привязывает кнопки панели инструментов редактора (добавить вещи, очистить, сохранить, новый образ, открыть/закрыть редактор).
  function wireToolbar() {
    document.getElementById('btn-add-items').addEventListener('click', openItemPicker);
    document.getElementById('btn-clear').addEventListener('click', clearCanvas);
    document.getElementById('btn-save').addEventListener('click', saveOutfit);

    const fab = document.getElementById('fab-add-outfit');
    if (fab) fab.addEventListener('click', openEditor);
    const closeBtn = document.getElementById('outfit-editor-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);

    const newBtn = document.getElementById('btn-new-outfit');
    if (newBtn) newBtn.addEventListener('click', startNewOutfit);
  }

  // EN: Starts creating a new outfit — clears the canvas (asking for confirmation if unsaved) and opens the editor.
  // ET: Alustab uue komplekti loomist — tühjendab lõuendi (küsides kinnitust, kui pooleli) ja avab redaktori.
  // RU: Начинает создание нового образа — очищает холст (запрашивая подтверждение, если есть несохранённое) и открывает редактор.
  function startNewOutfit() {
    if (canvasState.length) {
      clearCanvas();
    } else {
      editingOutfit = null;
      const nameInput = document.getElementById('outfit-name');
      if (nameInput) nameInput.value = '';
    }
    openEditor();
  }

  // EN: Opens the outfit editor and scrolls it into view.
  // ET: Avab komplekti redaktori ja kerib selle vaatesse.
  // RU: Открывает редактор образа и прокручивает его в зону видимости.
  function openEditor() {
    const editor = document.getElementById('outfit-editor');
    if (editor) {
      editor.classList.add('is-open');
      editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // EN: Closes the outfit editor (mainly in the mobile view).
  // ET: Sulgeb komplekti redaktori (peamiselt mobiilivaates).
  // RU: Закрывает редактор образа (в основном в мобильном виде).
  function closeEditor() {
    const editor = document.getElementById('outfit-editor');
    if (editor) editor.classList.remove('is-open');
  }

  // EN: Ensures the clothing items are loaded into state; loads them if the list is still empty.
  // ET: Tagab, et rõivaesemed on olekusse laaditud; laadib need, kui nimekiri on veel tühi.
  // RU: Гарантирует, что вещи загружены в состояние; загружает их, если список ещё пуст.
  async function ensureItemsLoaded() {
    if ((App.store.state.items || []).length) return;
    return App.wardrobe.loadItems();
  }
  // EN: Loads the user's outfits from the server and stores them in state.
  // ET: Laadib serverist kasutaja komplektid ja salvestab need olekusse.
  // RU: Загружает образы пользователя с сервера и сохраняет их в состояние.
  async function loadOutfits() {
    try {
      const { outfits } = await App.api.listOutfits();
      App.store.set('outfits', outfits || []);
    } catch (err) {
      App.api.toast('Failed to load outfits: ' + err.message, 'error');
      App.store.set('outfits', []);
    }
  }

  // EN: Repaints the moodboard canvas, placing the current state's items at their saved positions.
  // ET: Joonistab moodboard-lõuendi uuesti, asetades praeguse oleku esemed nende salvestatud asukohtadesse.
  // RU: Перерисовывает холст-муудборд, размещая вещи текущего состояния на их сохранённых позициях.
  function repaintCanvas() {
    const board = document.getElementById('moodboard');
    if (!board) return;

    const items = App.store.state.items || [];
    const byId = new Map(items.map((i) => [i._id, i]));

    Array.from(board.querySelectorAll('.mb-item')).forEach((n) => n.remove());

    canvasState.forEach((entry) => {
      const item = byId.get(entry.itemId);
      if (!item) return;
      board.appendChild(makeBoardItem(item, entry));
    });

    const empty = document.getElementById('mb-empty');
    if (empty) empty.style.display = canvasState.length ? 'none' : 'grid';
    if (window.lucide) lucide.createIcons();
  }

  // EN: Creates the DOM element of one item on the canvas with an image, remove button, and position.
  // ET: Loob lõuendile ühe eseme DOM-elemendi koos pildi, eemaldusnupu ja asukohaga.
  // RU: Создаёт DOM-элемент одной вещи на холсте с изображением, кнопкой удаления и позицией.
  function makeBoardItem(item, entry) {
    const node = document.createElement('div');
    node.className = 'mb-item';
    node.dataset.itemId = item._id;
    node.dataset.x = String(entry.x);
    node.dataset.y = String(entry.y);
    node.style.transform = `translate(${entry.x}px, ${entry.y}px)`;
    node.style.zIndex = String(entry.zIndex || 0);

    const parent = (item.category && item.category.parent) || '';
    node.innerHTML = item.imageUrl
      ? '<img src="' + esc(item.imageUrl) + '" alt="" />'
      : '<div class="mb-placeholder"><i data-lucide="' + esc(App.wardrobe.categoryIcon(parent)) + '"></i></div>';

    const rm = document.createElement('button');
    rm.className = 'mb-remove';
    rm.type = 'button';
    rm.setAttribute('aria-label', 'Remove from outfit');
    rm.innerHTML = '<i data-lucide="x"></i>';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      canvasState = canvasState.filter((c) => c.itemId !== item._id);
      repaintCanvas();
    });
    node.appendChild(rm);

    node.addEventListener('pointerdown', () => bringToFront(item._id));

    return node;
  }

  // EN: Brings the selected item to the front of the canvas by giving it the highest z-index.
  // ET: Tõstab valitud eseme lõuendil kõige ette, andes talle suurima z-indeksi.
  // RU: Поднимает выбранную вещь на холсте на передний план, присваивая ей наибольший z-индекс.
  function bringToFront(itemId) {
    const maxZ = canvasState.reduce((m, c) => Math.max(m, c.zIndex || 0), 0);
    canvasState = canvasState.map((c) =>
      c.itemId === itemId ? Object.assign({}, c, { zIndex: maxZ + 1 }) : c
    );
    const node = document.querySelector(`.mb-item[data-item-id="${cssEsc(itemId)}"]`);
    if (node) node.style.zIndex = String(maxZ + 1);
  }

  // EN: Escapes a string so it can be safely used in a CSS selector.
  // ET: Varjestab stringi, et seda saaks ohutult kasutada CSS-selektoris.
  // RU: Экранирует строку, чтобы её можно было безопасно использовать в CSS-селекторе.
  function cssEsc(s) {
    return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
  }

  // EN: Initializes interact.js dragging so items can be moved around the canvas.
  // ET: Initsialiseerib interact.js-i lohistamise, et esemeid saaks lõuendil ringi liigutada.
  // RU: Инициализирует перетаскивание через interact.js, чтобы вещи можно было двигать по холсту.
  function initInteract() {
    if (typeof interact !== 'function') {
      console.warn('interact.js not available; drag disabled');
      return;
    }
    const board = document.getElementById('moodboard');
    const rect  = board.getBoundingClientRect();

    const inst = interact('.mb-item').draggable({
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: board,
          endOnly: false,
        }),
      ],
      inertia: false,
      listeners: {
        move(event) {
          const t = event.target;
          const x = (parseFloat(t.dataset.x) || 0) + event.dx;
          const y = (parseFloat(t.dataset.y) || 0) + event.dy;
          t.style.transform = `translate(${x}px, ${y}px)`;
          t.dataset.x = String(x);
          t.dataset.y = String(y);
        },
        end(event) {
          const t = event.target;
          const id = t.dataset.itemId;
          const x = parseFloat(t.dataset.x) || 0;
          const y = parseFloat(t.dataset.y) || 0;
          canvasState = canvasState.map((c) =>
            c.itemId === id ? Object.assign({}, c, { x, y }) : c
          );
        },
      },
    });

    bindings.push(inst);
    void rect;
  }

  // EN: Removes the interact.js drag bindings to avoid memory leaks when switching pages.
  // ET: Eemaldab interact.js-i lohistamissidumised, et vältida lehe vahetamisel mälulekkeid.
  // RU: Снимает привязки перетаскивания interact.js, чтобы избежать утечек памяти при смене страницы.
  function tearDownInteract() {
    bindings.forEach((b) => { try { b.unset(); } catch {} });
    bindings = [];
  }

  // EN: Opens the multi-select modal for adding clothing items to the outfit canvas.
  // ET: Avab mitmikvaliku modaali rõivaesemete lisamiseks komplekti lõuendile.
  // RU: Открывает модальное окно множественного выбора для добавления вещей на холст образа.
  function openItemPicker() {
    const items = App.store.state.items || [];
    if (!items.length) {
      App.api.toast('Your wardrobe is empty', 'info');
      return;
    }
    const picked = new Set(canvasState.map((c) => c.itemId));

    App.wardrobe.openModal({
      title: 'Add items to outfit',
      bodyHtml: ''
        + '<div class="card-grid card-grid--compact" id="pick-grid">'
        +   items.map((it) => pickCardMarkup(it, picked.has(it._id))).join('')
        + '</div>',
      footerHtml:
        '<button type="button" class="btn btn-ghost" data-close>Cancel</button>'
        + '<button type="button" class="btn btn-primary" id="pick-done">Done</button>',
      onMount: (modal) => {
        const selected = new Set(picked);
        modal.querySelectorAll('[data-pickable]').forEach((card) => {
          card.addEventListener('click', () => {
            const id = card.dataset.pickable;
            if (selected.has(id)) { selected.delete(id); card.classList.remove('selected'); }
            else { selected.add(id); card.classList.add('selected'); }
          });
        });
        modal.querySelector('#pick-done').addEventListener('click', () => {
          mergePickedIntoCanvas(Array.from(selected));
          App.wardrobe.closeModal();
        });
      },
    });
  }

  // EN: Builds the HTML of one clothing item card for the selection modal, marking it selected if needed.
  // ET: Koostab valikumodaali jaoks ühe rõivaeseme kaardi HTML-i, märkides selle vajadusel valituks.
  // RU: Формирует HTML карточки одной вещи для модального окна выбора, помечая её выбранной при необходимости.
  function pickCardMarkup(item, isSelected) {
    const parent = (item.category && item.category.parent) || '';
    const imgPart = item.imageUrl
      ? '<img src="' + esc(item.imageUrl) + '" alt="" loading="lazy" />'
      : '<div class="placeholder"><i data-lucide="' + esc(App.wardrobe.categoryIcon(parent)) + '"></i></div>';
    return ''
      + '<article class="card selectable ' + (isSelected ? 'selected' : '') + '" data-pickable="' + esc(item._id) + '">'
      +   '<span class="select-tick"><i data-lucide="check"></i></span>'
      +   '<div class="card-image">' + imgPart + '</div>'
      +   '<div class="card-body">'
      +     '<h3 class="card-name">' + esc(item.name) + '</h3>'
      +   '</div>'
      + '</article>';
  }

  // EN: Merges the selected items into the canvas — keeps existing positions and places new ones with an offset.
  // ET: Liidab valitud esemed lõuendile — säilitab olemasolevate asukohad ja paigutab uued nihkega.
  // RU: Объединяет выбранные вещи с холстом — сохраняет позиции существующих и размещает новые со смещением.
  function mergePickedIntoCanvas(selectedIds) {
    const existing = new Map(canvasState.map((c) => [c.itemId, c]));
    const next = [];
    selectedIds.forEach((id, idx) => {
      if (existing.has(id)) {
        next.push(existing.get(id));
      } else {
        next.push({
          itemId: id,
          x: 20 + (idx % 5) * 30,
          y: 20 + Math.floor(idx / 5) * 30,
          zIndex: idx + 1,
        });
      }
    });
    canvasState = next;
    repaintCanvas();
  }

  // EN: Clears the canvas after the user confirms and resets the outfit name.
  // ET: Tühjendab lõuendi pärast kasutaja kinnitust ja lähtestab komplekti nime.
  // RU: Очищает холст после подтверждения пользователя и сбрасывает имя образа.
  function clearCanvas() {
    if (!canvasState.length) return;
    if (!confirm('Clear the canvas?')) return;
    canvasState = [];
    editingOutfit = null;
    document.getElementById('outfit-name').value = '';
    repaintCanvas();
  }

  // EN: Saves the current canvas as an outfit on the server — creates a new one or updates the existing one.
  // ET: Salvestab praeguse lõuendi komplektina serverisse — loob uue või uuendab olemasoleva.
  // RU: Сохраняет текущий холст как образ на сервере — создаёт новый или обновляет существующий.
  async function saveOutfit() {
    const name = document.getElementById('outfit-name').value.trim();
    if (!name) {
      App.api.toast('Give your outfit a name', 'error');
      return;
    }
    if (!canvasState.length) {
      App.api.toast('Add at least one item', 'error');
      return;
    }

    const payload = {
      name,
      items: canvasState.map((c) => ({
        itemId: c.itemId,
        position: { x: Math.round(c.x), y: Math.round(c.y) },
        zIndex: c.zIndex || 0,
      })),
    };

    try {
      let saved;
      if (editingOutfit && editingOutfit._id) {
        const r = await App.api.updateOutfit(editingOutfit._id, payload);
        saved = r.outfit;
        App.store.set('outfits',
          App.store.state.outfits.map((o) => (o._id === saved._id ? saved : o))
        );
      } else {
        const r = await App.api.createOutfit(payload);
        saved = r.outfit;
        App.store.set('outfits', [saved].concat(App.store.state.outfits));
      }
      editingOutfit = saved;
      App.api.toast('Outfit saved', 'success');
    } catch (err) {
      App.api.toast('Save failed: ' + err.message, 'error');
    }
  }

  // EN: Repaints the saved outfits grid and binds the load and delete buttons for each outfit.
  // ET: Joonistab salvestatud komplektide ruudustiku uuesti ja seob iga komplekti laadimise ja kustutamise nupud.
  // RU: Перерисовывает сетку сохранённых образов и привязывает кнопки загрузки и удаления для каждого образа.
  function repaintOutfitsGrid() {
    const grid = document.getElementById('outfit-grid');
    if (!grid) return;
    const outfits = App.store.state.outfits || [];
    const items = App.store.state.items || [];
    const byId = new Map(items.map((i) => [i._id, i]));

    if (!outfits.length) {
      grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1">'
        + '<i data-lucide="palette"></i>'
        + '<p>No saved outfits yet.</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    grid.innerHTML = outfits.map((o) => outfitCardMarkup(o, byId)).join('');
    grid.querySelectorAll('article[data-load-outfit]').forEach((b) => {
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-outfit]')) return;
        const id = b.dataset.loadOutfit;
        const outfit = outfits.find((o) => o._id === id);
        if (!outfit) return;
        loadIntoCanvas(outfit);
      });
    });
    grid.querySelectorAll('[data-delete-outfit]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = b.dataset.deleteOutfit;
        if (!confirm('Delete this outfit?')) return;
        try {
          await App.api.deleteOutfit(id);
          App.store.set('outfits', App.store.state.outfits.filter((o) => o._id !== id));
          if (editingOutfit && editingOutfit._id === id) editingOutfit = null;
          App.api.toast('Outfit deleted', 'success');
        } catch (err) {
          App.api.toast('Delete failed: ' + err.message, 'error');
        }
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  // EN: Builds the HTML of one saved outfit card with a miniature preview of the item thumbnails.
  // ET: Koostab ühe salvestatud komplekti kaardi HTML-i koos esemete pisipiltide miniatuurse eelvaatega.
  // RU: Формирует HTML карточки одного сохранённого образа с миниатюрным предпросмотром эскизов вещей.
  function outfitCardMarkup(o, byId) {
    const thumbs = (o.items || []).map((entry, i) => {
      const item = byId.get(String(entry.itemId));
      const x = entry.position ? entry.position.x : 0;
      const y = entry.position ? entry.position.y : 0;
      const sx = Math.max(0, Math.min(50, Math.round(x * 0.25)));
      const sy = Math.max(0, Math.min(50, Math.round(y * 0.25)));
      const style = 'left:' + sx + '%;top:' + sy + '%;z-index:' + (entry.zIndex || i) + ';';
      if (!item) return '';
      return item.imageUrl
        ? '<img style="' + style + '" src="' + esc(item.imageUrl) + '" alt="" />'
        : '';
    }).join('');

    return ''
      + '<article class="card" data-load-outfit="' + esc(o._id) + '" tabindex="0">'
      +   '<div class="outfit-card-thumb">' + thumbs + '</div>'
      +   '<div class="card-body">'
      +     '<h3 class="card-name">' + esc(o.name) + '</h3>'
      +     '<div class="card-meta">'
      +       '<span class="badge">' + (o.items || []).length + ' items</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="card-actions">'
      +     '<button class="btn btn-secondary btn-sm" data-load-outfit="' + esc(o._id) + '"><i data-lucide="edit-3"></i>Edit</button>'
      +     '<button class="btn btn-danger btn-sm"   data-delete-outfit="' + esc(o._id) + '"><i data-lucide="trash-2"></i></button>'
      +   '</div>'
      + '</article>';
  }

  // EN: Loads a saved outfit onto the editor canvas for editing and opens the editor.
  // ET: Laadib salvestatud komplekti redaktori lõuendile muutmiseks ja avab redaktori.
  // RU: Загружает сохранённый образ на холст редактора для изменения и открывает редактор.
  function loadIntoCanvas(outfit) {
    editingOutfit = outfit;
    document.getElementById('outfit-name').value = outfit.name || '';
    canvasState = (outfit.items || []).map((e) => ({
      itemId: String(e.itemId),
      x: (e.position && e.position.x) || 0,
      y: (e.position && e.position.y) || 0,
      zIndex: e.zIndex || 0,
    }));
    repaintCanvas();
    openEditor();
  }

  window.App = window.App || {};
  window.App.outfits = { render };
})();
