(function () {
  'use strict';

  const REFRESH_MS = 30 * 60 * 1000;
  const STORAGE_KEY = 'wardrobe.weather.location';
  const SYMBOL_BASE = 'https://cdn.jsdelivr.net/gh/nrkno/weather-symbols@v1.0.0/symbols/';
  const FALLBACK = { lat: 59.4370, lon: 24.7536, displayName: 'Tallinn, Estonia' };

  let refreshTimer = null;
  let locationPickerOpen = false;

  // ET: Varjestab HTML-i erimärgid (kasutab wardrobe mooduli esc-funktsiooni, kui see on saadaval).
  // RU: Экранирует спецсимволы HTML (использует функцию esc модуля wardrobe, если она доступна).
  function esc(s) { return App.wardrobe ? App.wardrobe.esc(s) : String(s); }

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

  // ET: Peatab ilmavidina värskendustaimeri (kutsutakse väljalogimisel).
  // RU: Останавливает таймер обновления виджета погоды (вызывается при выходе из системы).
  function stop() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

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

  // ET: Määrab uue asukoha — salvestab selle olekusse ja localStorage'i ning laadib ilma.
  // RU: Устанавливает новую локацию — сохраняет её в состояние и localStorage и загружает погоду.
  function useLocation(loc) {
    App.store.set('weatherLocation', loc);
    writeLocation(loc);
    fetchAndRender(loc);
  }

  // ET: Loeb localStorage'ist varem salvestatud ilmaasukoha; puudumisel või vea korral tagastab null.
  // RU: Читает ранее сохранённую локацию погоды из localStorage; при отсутствии или ошибке возвращает null.
  function readLocation() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  // ET: Salvestab ilmaasukoha localStorage'i edaspidiseks kasutamiseks.
  // RU: Сохраняет локацию погоды в localStorage для последующего использования.
  function writeLocation(loc) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); }
    catch {}
  }

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

  // ET: Käivitab antud funktsiooni mõlema ilmavidina elemendi peal (külgriba ja mobiili oma).
  // RU: Выполняет заданную функцию для обоих элементов виджета погоды (боковая панель и мобильный).
  function eachWidget(fn) {
    ['weather-widget', 'weather-widget-mobile'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) fn(el);
    });
  }

  // ET: Kuvab ilmavidinas laadimisoleku teate.
  // RU: Показывает в виджете погоды сообщение о состоянии загрузки.
  function paintLoading() {
    eachWidget((el) => { el.innerHTML = '<div class="loading">Loading weather…</div>'; });
  }
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

  // ET: Tagastab ilmasümboli koodile vastava ikooni-pildi HTML-i; koodi puudumisel pilve-emoji.
  // RU: Возвращает HTML картинки иконки для кода символа погоды; при отсутствии кода — эмодзи облака.
  function iconImg(code, size) {
    if (!code) return '<span aria-hidden="true">☁️</span>';
    const url = SYMBOL_BASE + encodeURIComponent(code) + '.svg';
    return '<img class="weather-icon" src="' + esc(url) + '" alt="" width="'
      + size + '" height="' + size + '" />';
  }

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

  // ET: Vormindab temperatuuri ümardatud kraadideks; puuduva väärtuse korral tagastab kriipsu.
  // RU: Форматирует температуру в округлённые градусы; при отсутствии значения возвращает прочерк.
  function formatTemp(t) {
    if (t == null || Number.isNaN(t)) return '–';
    return Math.round(t) + '°';
  }

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
