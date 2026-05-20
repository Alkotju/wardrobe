(function () {
  'use strict';

  const REFRESH_MS = 30 * 60 * 1000;
  const STORAGE_KEY = 'wardrobe.weather.location';
  const SYMBOL_BASE = 'https://cdn.jsdelivr.net/gh/nrkno/weather-symbols@v1.0.0/symbols/';
  const FALLBACK = { lat: 59.4370, lon: 24.7536, displayName: 'Tallinn, Estonia' };

  let refreshTimer = null;
  let locationPickerOpen = false;

  // EN: Escapes HTML special characters (uses the wardrobe module's esc function if available).
  // ET: Varjestab HTML-i erimärgid (kasutab wardrobe mooduli esc-funktsiooni, kui see on saadaval).
  // RU: Экранирует спецсимволы HTML (использует функцию esc модуля wardrobe, если она доступна).
  function esc(s) { return App.wardrobe ? App.wardrobe.esc(s) : String(s); }

  // EN: Initializes the weather widget — loads the location, shows the weather, and sets a 30-minute refresh timer.
  // ET: Initsialiseerib ilmavidina — laadib asukoha, kuvab ilma ja seab 30-minutilise värskendustaimeri.
  // RU: Инициализирует виджет погоды — загружает локацию, показывает погоду и устанавливает 30-минутный таймер обновления.
  function init() {
    stop();
    wireMobileToggle();
    const cached = readLocation();
    if (cached) {
      App.store.set('weatherLocation', cached);
      fetchAndRender(cached);
    } else {
      tryGeolocation();
    }
    refreshTimer = setInterval(() => {
      const loc = App.store.state.weatherLocation;
      if (loc) fetchAndRender(loc);
    }, REFRESH_MS);
  }

  // EN: Stops the weather widget refresh timer (called on logout).
  // ET: Peatab ilmavidina värskendustaimeri (kutsutakse väljalogimisel).
  // RU: Останавливает таймер обновления виджета погоды (вызывается при выходе из системы).
  function stop() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // EN: Tries to determine the user's location via browser geolocation; falls back to Tallinn on failure.
  // ET: Üritab tuvastada kasutaja asukoha brauseri geolokatsiooni kaudu; ebaõnnestumisel kasutab Tallinna varuvarianti.
  // RU: Пытается определить местоположение пользователя через геолокацию браузера; при неудаче использует Таллин как запасной вариант.
  function tryGeolocation() {
    if (!navigator.geolocation) {
      useLocation(FALLBACK);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => useLocation({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        displayName: 'Current location',
      }),
      () => useLocation(FALLBACK),
      { maximumAge: 10 * 60 * 1000, timeout: 8000 }
    );
  }

  // EN: Sets a new location — saves it to state and localStorage and loads the weather.
  // ET: Määrab uue asukoha — salvestab selle olekusse ja localStorage'i ning laadib ilma.
  // RU: Устанавливает новую локацию — сохраняет её в состояние и localStorage и загружает погоду.
  function useLocation(loc) {
    App.store.set('weatherLocation', loc);
    writeLocation(loc);
    fetchAndRender(loc);
  }

  // EN: Reads a previously saved weather location from localStorage; returns null if missing or on error.
  // ET: Loeb localStorage'ist varem salvestatud ilmaasukoha; puudumisel või vea korral tagastab null.
  // RU: Читает ранее сохранённую локацию погоды из localStorage; при отсутствии или ошибке возвращает null.
  function readLocation() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  // EN: Saves the weather location to localStorage for later use.
  // ET: Salvestab ilmaasukoha localStorage'i edaspidiseks kasutamiseks.
  // RU: Сохраняет локацию погоды в localStorage для последующего использования.
  function writeLocation(loc) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); }
    catch {}
  }

  // EN: Requests the weather forecast for the given location from the server and renders the widget; shows an error message on failure.
  // ET: Pärib serverist antud asukoha ilmaennustuse ja joonistab vidina; vea korral kuvab veateate.
  // RU: Запрашивает у сервера прогноз погоды для заданной локации и отрисовывает виджет; при ошибке показывает сообщение об ошибке.
  async function fetchAndRender(loc) {
    paintLoading();
    try {
      const { days } = await App.api.getWeather(loc.lat, loc.lon);
      App.store.set('weather', { location: loc, days: days || [] });
      paint();
    } catch (err) {
      paintError(err.message);
    }
  }

  // EN: Runs the given function on both weather widget elements (the sidebar one and the mobile one).
  // ET: Käivitab antud funktsiooni mõlema ilmavidina elemendi peal (külgriba ja mobiili oma).
  // RU: Выполняет заданную функцию для обоих элементов виджета погоды (боковая панель и мобильный).
  function eachWidget(fn) {
    ['weather-widget', 'weather-widget-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) fn(el);
    });
  }

  // EN: Shows a loading state message in the weather widget.
  // ET: Kuvab ilmavidinas laadimisoleku teate.
  // RU: Показывает в виджете погоды сообщение о состоянии загрузки.
  function paintLoading() {
    eachWidget((el) => { el.innerHTML = '<div class="loading">Loading weather…</div>'; });
  }
  // EN: Shows an error message in the weather widget along with a change-location button.
  // ET: Kuvab ilmavidinas veateate koos asukoha muutmise nupuga.
  // RU: Показывает в виджете погоды сообщение об ошибке вместе с кнопкой смены локации.
  function paintError(msg) {
    eachWidget((el) => {
      el.innerHTML =
        '<div class="loading">Weather unavailable</div>'
        + '<button class="btn btn-ghost btn-sm" data-weather-change>'
        +   '<i data-lucide="map-pin"></i>Change location</button>';
      wireChangeLocation(el);
    });
    if (window.lucide) lucide.createIcons();
  }
  // EN: Renders the weather widget — the current weather, up to a 3-day forecast, and the change-location button.
  // ET: Joonistab ilmavidina — praeguse ilma, kuni 3 päeva ennustuse ja asukoha muutmise nupu.
  // RU: Отрисовывает виджет погоды — текущую погоду, прогноз до 3 дней и кнопку смены локации.
  function paint() {
    const w = App.store.state.weather;
    if (!w) return;
    const days = w.days || [];
    if (!days.length) { paintError('No forecast'); return; }

    const today = days[0];
    const rest  = days.slice(1, 3);
    const loc   = w.location || {};

    const html = ''
      + '<div class="weather-current">'
      +   iconImg(today.symbolCode, 36)
      +   '<div class="weather-temp">' + esc(formatTemp(today.tempMax)) + '</div>'
      +   '<div class="weather-loc" title="' + esc(loc.displayName || '') + '">'
      +     esc(loc.displayName || '')
      +   '</div>'
      + '</div>'
      + '<div class="weather-forecast">'
      +   [today].concat(rest).map(dayMarkup).join('')
      + '</div>'
      + '<div class="weather-actions">'
      +   '<span class="muted" style="font-size:11px">Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>'
      +   '<button class="btn btn-ghost btn-sm" data-weather-change>'
      +     '<i data-lucide="map-pin"></i>Change location</button>'
      + '</div>';

    eachWidget((el) => {
      el.innerHTML = html;
      wireIconFallbacks(el);
      wireChangeLocation(el);
    });
    if (window.lucide) lucide.createIcons();
  }

  // EN: Builds the HTML of one forecast day (day label, icon, min/max temperature, precipitation).
  // ET: Koostab ühe ennustuspäeva HTML-i (päeva silt, ikoon, min/max temperatuur, sademed).
  // RU: Формирует HTML одного дня прогноза (метка дня, иконка, мин/макс температура, осадки).
  function dayMarkup(d) {
    const label = formatDayLabel(d.date);
    return ''
      + '<div class="weather-day">'
      +   '<span>' + esc(label) + '</span>'
      +   iconImg(d.symbolCode, 24)
      +   '<span class="tmax">' + esc(formatTemp(d.tempMax)) + '</span>'
      +   '<span>' + esc(formatTemp(d.tempMin)) + '</span>'
      +   (d.precipitationAmount > 0
          ? '<span class="precip">' + d.precipitationAmount.toFixed(1) + 'mm</span>'
          : '')
      + '</div>';
  }

  // EN: Returns the HTML of the icon image for a weather symbol code; a cloud emoji if the code is missing.
  // ET: Tagastab ilmasümboli koodile vastava ikooni-pildi HTML-i; koodi puudumisel pilve-emoji.
  // RU: Возвращает HTML картинки иконки для кода символа погоды; при отсутствии кода — эмодзи облака.
  function iconImg(code, size) {
    if (!code) return '<span aria-hidden="true">☁️</span>';
    const url = SYMBOL_BASE + encodeURIComponent(code) + '.svg';
    return '<img class="weather-icon" src="' + esc(url) + '" alt="" width="'
      + size + '" height="' + size + '" />';
  }

  // EN: Sets up a fallback for weather icons — if image loading fails, replaces it with a cloud emoji.
  // ET: Seab ilmaikoonidele varuvariandi — kui pildi laadimine ebaõnnestub, asendab selle pilve-emojiga.
  // RU: Настраивает запасной вариант для иконок погоды — если изображение не загрузилось, заменяет его эмодзи облака.
  function wireIconFallbacks(root) {
    root.querySelectorAll('img.weather-icon').forEach((img) => {
      img.onerror = () => {
        const span = document.createElement('span');
        span.setAttribute('aria-hidden', 'true');
        span.textContent = '☁️';
        img.replaceWith(span);
      };
    });
  }

  // EN: Formats a temperature into rounded degrees; returns a dash for a missing value.
  // ET: Vormindab temperatuuri ümardatud kraadideks; puuduva väärtuse korral tagastab kriipsu.
  // RU: Форматирует температуру в округлённые градусы; при отсутствии значения возвращает прочерк.
  function formatTemp(t) {
    if (t == null || Number.isNaN(t)) return '–';
    return Math.round(t) + '°';
  }

  // EN: Formats a date into a day label — "Today" for today or a short weekday name for the rest.
  // ET: Vormindab kuupäeva päevasildiks — "Today" tänase või lühikese nädalapäeva nime muude kohta.
  // RU: Форматирует дату в метку дня — "Today" для сегодня или короткое название дня недели для остальных.
  function formatDayLabel(yyyy_mm_dd) {
    if (!yyyy_mm_dd) return '';
    const d = new Date(yyyy_mm_dd + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return yyyy_mm_dd;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    return d.toLocaleDateString([], { weekday: 'short' });
  }

  // EN: Binds the "Change location" button that opens/closes the built-in location search field.
  // ET: Seob "Muuda asukohta" nupu, mis avab/sulgeb sisseehitatud asukoha otsinguvälja.
  // RU: Привязывает кнопку «Сменить локацию», открывающую/закрывающую встроенное поле поиска локации.
  function wireChangeLocation(widget) {
    const btn = widget.querySelector('[data-weather-change]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (widget.querySelector('.weather-loc-input')) {
        const node = widget.querySelector('.weather-loc-input');
        const list = widget.querySelector('.weather-loc-results');
        if (node) node.remove();
        if (list) list.remove();
        locationPickerOpen = false;
        return;
      }
      locationPickerOpen = true;
      const wrap = document.createElement('div');
      wrap.className = 'weather-loc-input';
      wrap.innerHTML =
        '<input type="text" placeholder="City name" maxlength="80" />'
        + '<button class="btn btn-secondary btn-sm" type="button">Find</button>';
      widget.appendChild(wrap);
      const input = wrap.querySelector('input');
      const find  = wrap.querySelector('button');
      input.focus();

      // EN: Sends a place-name geocoding request and shows the found locations.
      // ET: Saadab kohanime geokodeerimispäringu ja kuvab leitud asukohad.
      // RU: Отправляет запрос геокодирования названия места и показывает найденные локации.
      const submit = async () => {
        const q = input.value.trim();
        if (q.length < 2) return;
        find.disabled = true;
        try {
          const results = await App.api.geocode(q);
          paintResults(widget, results || []);
        } catch (err) {
          App.api.toast('Location lookup failed: ' + err.message, 'error');
        } finally {
          find.disabled = false;
        }
      };
      find.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }

  // EN: Renders the geocoding results list, where selecting an entry sets a new location.
  // ET: Joonistab geokodeerimise tulemuste loendi, kus iga kirje valimine määrab uue asukoha.
  // RU: Отрисовывает список результатов геокодирования, где выбор записи устанавливает новую локацию.
  function paintResults(widget, results) {
    let list = widget.querySelector('.weather-loc-results');
    if (list) list.remove();
    if (!results.length) {
      App.api.toast('No matches', 'info');
      return;
    }
    list = document.createElement('ul');
    list.className = 'weather-loc-results';
    list.innerHTML = results.map((r, i) =>
      '<li><button type="button" data-i="' + i + '">' + esc(r.displayName) + '</button></li>'
    ).join('');
    widget.appendChild(list);

    list.querySelectorAll('button[data-i]').forEach((b) => {
      b.addEventListener('click', () => {
        const r = results[Number(b.dataset.i)];
        useLocation({
          lat: Number(r.lat),
          lon: Number(r.lon),
          displayName: r.displayName,
        });
      });
    });
  }

  // EN: Binds the mobile-view button that opens/closes the collapsible weather panel.
  // ET: Seob mobiilivaate nupu, mis avab/sulgeb kokkupandava ilmapaneeli.
  // RU: Привязывает кнопку мобильного вида, открывающую/закрывающую сворачиваемую панель погоды.
  function wireMobileToggle() {
    const btn = document.getElementById('mobile-weather-toggle');
    const panel = document.getElementById('weather-widget-mobile');
    if (!btn || !panel) return;
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      fresh.setAttribute('aria-expanded', String(open));
    });
  }

  window.App = window.App || {};
  window.App.weather = { init, stop };
})();
