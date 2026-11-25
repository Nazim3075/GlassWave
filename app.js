// GlassWave Standalone Player - Multi-Source Search & Fallback Engine

const STORAGE_KEYS = {
  RECENT: 'glasswave_recent_v1',
  FAVORITES: 'glasswave_favorites_v1',
  SOURCE_PREF: 'glasswave_source_pref_v1',
  LANG_PREF: 'glasswave_lang_pref_v1',
  SPEED_PREF: 'glasswave_speed_pref_v1',
  THEME_PREF: 'glasswave_theme_pref_v1'
};

// Multiple music search & stream providers with automatic fallback
const PROVIDERS = [
  {
    id: 'saavn_dev',
    label: 'Saavn Lossless/HQ',
    badge: 'HQ · saavn.dev',
    searchUrl: (q) => `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=25`,
    parse: (json) => {
      const list = json?.data?.results || [];
      return list.map((item, idx) => {
        const downloads = Array.isArray(item.downloadUrl) ? item.downloadUrl : [];
        const bestAudio =
          downloads.find((d) => d.quality === '320kbps')?.url ||
          downloads[downloads.length - 1]?.url ||
          '';
        const images = Array.isArray(item.image) ? item.image : [];
        const cover =
          images.find((im) => im.quality === '500x500')?.url ||
          images[images.length - 1]?.url ||
          '';
        const primaryArtist =
          item.artists?.primary?.map((a) => a.name).filter(Boolean).join(', ') ||
          item.primaryArtists ||
          'Unknown Artist';
        return {
          id: item.id || `saavn-${idx}`,
          title: decodeHtml(item.name || item.title || 'Untitled'),
          artist: decodeHtml(primaryArtist),
          album: decodeHtml(item.album?.name || ''),
          duration: Number(item.duration) || 0,
          cover,
          audioUrl: bestAudio,
          source: 'Saavn HQ'
        };
      }).filter((t) => t.title);
    }
  },
  {
    id: 'jiosaavn_sumit',
    label: 'JioSaavn Mirror',
    badge: 'HQ · jiosaavn-api',
    searchUrl: (q) => `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(q)}&limit=25`,
    parse: (json) => {
      const list = json?.data?.results || json?.results || [];
      return list.map((item, idx) => {
        const downloads = Array.isArray(item.downloadUrl) ? item.downloadUrl : [];
        const bestAudio =
          downloads.find((d) => d.quality === '320kbps')?.url ||
          downloads[downloads.length - 1]?.url ||
          '';
        const images = Array.isArray(item.image) ? item.image : [];
        const cover =
          images.find((im) => im.quality === '500x500')?.url ||
          images[images.length - 1]?.url ||
          '';
        const primaryArtist =
          item.artists?.primary?.map((a) => a.name).filter(Boolean).join(', ') ||
          item.primaryArtists ||
          'Unknown Artist';
        return {
          id: item.id || `js-${idx}`,
          title: decodeHtml(item.name || item.title || 'Untitled'),
          artist: decodeHtml(primaryArtist),
          album: decodeHtml(item.album?.name || ''),
          duration: Number(item.duration) || 0,
          cover,
          audioUrl: bestAudio,
          source: 'Saavn Mirror'
        };
      }).filter((t) => t.title);
    }
  },
  {
    id: 'monochrome',
    label: 'Monochrome Lossless',
    badge: 'Lossless · monochrome.st',
    searchUrl: (q) => `https://tracks.monochrome.st/api/search?q=${encodeURIComponent(q)}`,
    parse: (json) => {
      const list = json?.tracks || json?.results || json?.data || (Array.isArray(json) ? json : []);
      return list.map((item, idx) => ({
        id: item.id || `mono-${idx}`,
        title: item.title || item.name || 'Untitled',
        artist: item.artist || item.artists?.[0]?.name || 'Unknown Artist',
        album: item.album?.title || item.album || '',
        duration: Number(item.duration) || 0,
        cover: item.cover || item.artwork || '',
        audioUrl: item.streamUrl || item.url || item.audioUrl || '',
        source: 'Monochrome'
      })).filter((t) => t.title);
    }
  },
  {
    id: 'itunes',
    label: 'iTunes Catalog',
    badge: 'AAC · itunes.apple.com',
    searchUrl: (q) => `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`,
    parse: (json) => {
      const list = json?.results || [];
      return list.map((item, idx) => ({
        id: String(item.trackId || `it-${idx}`),
        title: item.trackName || 'Untitled',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || '',
        duration: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0,
        cover: (item.artworkUrl100 || '').replace('100x100bb', '500x500bb'),
        audioUrl: item.previewUrl || '',
        source: 'iTunes'
      })).filter((t) => t.title && t.audioUrl);
    }
  }
];

function decodeHtml(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function formatTime(sec) {
  if (!sec || isNaN(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

const state = {
  tab: 'search',
  query: '',
  results: [],
  recent: loadJson(STORAGE_KEYS.RECENT, []),
  favorites: loadJson(STORAGE_KEYS.FAVORITES, []),
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  sourcePref: localStorage.getItem(STORAGE_KEYS.SOURCE_PREF) || 'auto',
  lang: localStorage.getItem(STORAGE_KEYS.LANG_PREF) || 'bn',
  speed: parseFloat(localStorage.getItem(STORAGE_KEYS.SPEED_PREF) || '1'),
  theme: localStorage.getItem(STORAGE_KEYS.THEME_PREF) || 'violet',
  activeSourceLabel: 'Auto Fallback',
  statusMessage: '',
  isLoading: false,
  settingsOpen: false
};

const audio = new Audio();
audio.preload = 'metadata';

// Build ordered provider list based on user preference
function getOrderedProviders() {
  if (state.sourcePref === 'auto') return PROVIDERS;
  const chosen = PROVIDERS.find((p) => p.id === state.sourcePref);
  if (!chosen) return PROVIDERS;
  return [chosen, ...PROVIDERS.filter((p) => p.id !== state.sourcePref)];
}

async function fetchWithTimeout(url, ms = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Expand Bangla generic searches into rich queries when needed
function buildSearchQueries(rawQuery) {
  const q = rawQuery.trim();
  const normalized = q.replace(/\s+/g, ' ');
  if (normalized === 'বাংলা গান' || normalized.toLowerCase() === 'bangla song' || normalized.toLowerCase() === 'bangla songs') {
    return [
      'Bangla hits',
      'Arijit Singh Bangla',
      'Tahsan Bangla song',
      'Bangla folk modern song'
    ];
  }
  return [normalized];
}

async function runSearch(rawQuery) {
  const q = rawQuery.trim();
  if (!q) {
    state.results = [];
    state.statusMessage = '';
    render();
    return;
  }

  state.query = q;
  state.isLoading = true;
  state.statusMessage = state.lang === 'bn' ? 'একাধিক সোর্স থেকে গান খোঁজা হচ্ছে...' : 'Searching across sources...';
  render();

  const candidateQueries = buildSearchQueries(q);
  const orderedProviders = getOrderedProviders();

  for (const queryVariant of candidateQueries) {
    for (const provider of orderedProviders) {
      try {
        const json = await fetchWithTimeout(provider.searchUrl(queryVariant), 5500);
        const tracks = provider.parse(json);
        if (Array.isArray(tracks) && tracks.length > 0) {
          state.results = tracks;
          state.activeSourceLabel = provider.badge;
          state.statusMessage =
            queryVariant !== q
              ? (state.lang === 'bn'
                  ? `"${q}" এর জন্য "${queryVariant}" থেকে ${tracks.length}টি গান পাওয়া গেছে (${provider.label})`
                  : `Found ${tracks.length} tracks via "${queryVariant}" (${provider.label})`)
              : (state.lang === 'bn'
                  ? `${tracks.length}টি গান পাওয়া গেছে · ${provider.label}`
                  : `${tracks.length} tracks found · ${provider.label}`);
          state.isLoading = false;
          render();
          return;
        }
      } catch (err) {
        console.warn(`Provider ${provider.id} failed for "${queryVariant}":`, err.message);
      }
    }
  }

  state.results = [];
  state.isLoading = false;
  state.statusMessage =
    state.lang === 'bn'
      ? 'কোনো সোর্স থেকে রেজাল্ট পাওয়া যায়নি। ইংরেজিতে শিল্পী বা গানের নাম লিখে চেষ্টা করুন অথবা VPN চেক করুন।'
      : 'No results found across providers. Try searching in English or check VPN/network.';
  render();
}

function playTrack(track, listContext = null) {
  if (!track) return;
  if (!track.audioUrl) {
    state.statusMessage =
      state.lang === 'bn'
        ? 'এই ট্র্যাকটির সরাসরি অডিও লিংক পাওয়া যায়নি, অন্য গান বেছে নিন।'
        : 'Direct audio stream unavailable for this track.';
    render();
    return;
  }

  if (Array.isArray(listContext) && listContext.length > 0) {
    state.queue = listContext.filter((t) => Boolean(t.audioUrl));
    state.currentIndex = state.queue.findIndex((t) => t.id === track.id && t.audioUrl === track.audioUrl);
    if (state.currentIndex === -1) {
      state.queue.unshift(track);
      state.currentIndex = 0;
    }
  } else if (state.queue.length === 0) {
    state.queue = [track];
    state.currentIndex = 0;
  }

  const activeTrack = state.queue[state.currentIndex] || track;
  audio.src = activeTrack.audioUrl;
  audio.playbackRate = state.speed;
  audio.play().then(() => {
    state.isPlaying = true;
    renderPlayerBar();
  }).catch((err) => {
    console.warn('Playback error:', err);
    state.isPlaying = false;
    state.statusMessage =
      state.lang === 'bn'
        ? 'অডিও প্লে করতে সমস্যা হচ্ছে। অন্য গান চেষ্টা করুন।'
        : 'Unable to play audio stream.';
    render();
  });

  // Update Recent
  const filteredRecent = state.recent.filter((item) => !(item.id === activeTrack.id && item.source === activeTrack.source));
  state.recent = [activeTrack, ...filteredRecent].slice(0, 30);
  saveJson(STORAGE_KEYS.RECENT, state.recent);

  state.isPlaying = true;
  render();
}

function togglePlayPause() {
  if (!audio.src) {
    if (state.results.length > 0) {
      playTrack(state.results[0], state.results);
    }
    return;
  }
  if (audio.paused) {
    audio.play().catch(() => {});
    state.isPlaying = true;
  } else {
    audio.pause();
    state.isPlaying = false;
  }
  renderPlayerBar();
}

function playNext() {
  if (state.queue.length === 0) return;
  const nextIdx = (state.currentIndex + 1) % state.queue.length;
  state.currentIndex = nextIdx;
  playTrack(state.queue[nextIdx], state.queue);
}

function toggleFavorite(track, event) {
  if (event) event.stopPropagation();
  const exists = state.favorites.some((f) => f.id === track.id && f.source === track.source);
  if (exists) {
    state.favorites = state.favorites.filter((f) => !(f.id === track.id && f.source === track.source));
  } else {
    state.favorites = [track, ...state.favorites];
  }
  saveJson(STORAGE_KEYS.FAVORITES, state.favorites);
  render();
}

function isFavorite(track) {
  return state.favorites.some((f) => f.id === track.id && f.source === track.source);
}

audio.addEventListener('ended', () => {
  playNext();
});

audio.addEventListener('timeupdate', () => {
  const prog = document.getElementById('gw-progress');
  const cur = document.getElementById('gw-time-cur');
  const dur = document.getElementById('gw-time-dur');
  if (prog && audio.duration) {
    prog.value = String(Math.floor((audio.currentTime / audio.duration) * 100));
  }
  if (cur) cur.textContent = formatTime(audio.currentTime);
  if (dur && audio.duration) dur.textContent = formatTime(audio.duration);
});

const THEMES = {
  violet: { accent: '#a855f7', accent2: '#ec4899', bg: '#0b0912', surface: '#151122', surface2: '#1e1830' },
  emerald: { accent: '#10b981', accent2: '#06b6d4', bg: '#07110f', surface: '#0e1f1c', surface2: '#152e29' },
  amber: { accent: '#f59e0b', accent2: '#f97316', bg: '#120e07', surface: '#21190d', surface2: '#2e2313' }
};

function applyTheme() {
  const t = THEMES[state.theme] || THEMES.violet;
  const root = document.documentElement;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-2', t.accent2);
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--surface', t.surface);
  root.style.setProperty('--surface-2', t.surface2);
}

function getCurrentTrack() {
  if (state.currentIndex >= 0 && state.queue[state.currentIndex]) {
    return state.queue[state.currentIndex];
  }
  return null;
}

function renderTrackList(tracks, emptyText) {
  if (!tracks || tracks.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">♪</div>
        <div class="empty-title">${emptyText}</div>
        <div class="empty-sub">${state.activeSourceLabel}</div>
      </div>
    `;
  }

  return `
    <div class="track-list">
      ${tracks.map((track, i) => {
        const current = getCurrentTrack();
        const active = current && current.id === track.id && current.source === track.source;
        const fav = isFavorite(track);
        return `
          <div class="track-card ${active ? 'active' : ''}" data-action="play-track" data-index="${i}">
            <img class="track-cover" src="${escapeAttr(track.cover || 'icon-192.png')}" alt="" loading="lazy" onerror="this.src='icon-192.png'">
            <div class="track-meta">
              <div class="track-title">${escapeHtml(track.title)}</div>
              <div class="track-sub">${escapeHtml(track.artist)}${track.source ? ` · ${escapeHtml(track.source)}` : ''}</div>
            </div>
            <div class="track-actions">
              <span class="track-dur">${track.duration ? formatTime(track.duration) : ''}</span>
              <button class="icon-btn small ${fav ? 'fav-active' : ''}" data-action="toggle-fav" data-index="${i}" title="Favorite">
                ${fav ? '♥' : '♡'}
              </button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderPlayerBar() {
  const bar = document.getElementById('gw-player-bar');
  if (!bar) return;
  const track = getCurrentTrack();
  if (!track) {
    bar.innerHTML = '';
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  bar.innerHTML = `
    <div class="player-top">
      <img class="player-thumb" src="${escapeAttr(track.cover || 'icon-192.png')}" alt="" onerror="this.src='icon-192.png'">
      <div class="player-info">
        <div class="player-title">${escapeHtml(track.title)}</div>
        <div class="player-artist">${escapeHtml(track.artist)}</div>
      </div>
      <div class="player-controls">
        <button class="ctrl-btn primary" id="gw-play-btn">${state.isPlaying ? '❚❚' : '▶'}</button>
        <button class="ctrl-btn" id="gw-next-btn">⏭</button>
      </div>
    </div>
    <div class="player-seek">
      <span id="gw-time-cur">${formatTime(audio.currentTime)}</span>
      <input id="gw-progress" type="range" min="0" max="100" value="${audio.duration ? Math.floor((audio.currentTime / audio.duration) * 100) : 0}">
      <span id="gw-time-dur">${formatTime(audio.duration)}</span>
    </div>
  `;

  document.getElementById('gw-play-btn')?.addEventListener('click', togglePlayPause);
  document.getElementById('gw-next-btn')?.addEventListener('click', playNext);
  document.getElementById('gw-progress')?.addEventListener('input', (e) => {
    if (audio.duration) {
      audio.currentTime = (Number(e.target.value) / 100) * audio.duration;
    }
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

function getDisplayedTracks() {
  if (state.tab === 'search') return state.results;
  if (state.tab === 'recent') return state.recent;
  if (state.tab === 'favorites') return state.favorites;
  if (state.tab === 'playlists') return state.recent.slice(0, 12);
  if (state.tab === 'queue') return state.queue;
  return [];
}

function render() {
  applyTheme();
  const app = document.getElementById('app');
  if (!app) return;

  const isBn = state.lang === 'bn';
  const displayed = getDisplayedTracks();

  const labels = {
    searchPlaceholder: isBn ? 'বাংলা গান বা শিল্পীর নাম লিখুন...' : 'Search songs or artists...',
    searchResults: isBn ? 'সার্চ রেজাল্ট' : 'SEARCH RESULTS',
    emptySearchTitle: isBn ? 'গান খুঁজে বের করুন' : 'Search to find songs',
    emptySearchSub: state.activeSourceLabel,
    recent: isBn ? 'সাম্প্রতিক' : 'Recent',
    favorites: isBn ? 'প্রিয়' : 'Favorites',
    playlists: isBn ? 'প্লেলিস্ট' : 'Playlists',
    queue: isBn ? 'কিউ' : 'Queue',
    searchTab: isBn ? 'সার্চ' : 'Search'
  };

  let bodyContent = '';
  if (state.tab === 'search') {
    bodyContent = `
      <form id="gw-search-form" class="search-box">
        <input
          id="gw-search-input"
          type="search"
          value="${escapeAttr(state.query)}"
          placeholder="${escapeAttr(labels.searchPlaceholder)}"
          autocomplete="off"
        >
        <button type="submit" class="search-submit">${isBn ? 'খুঁজুন' : 'Go'}</button>
      </form>

      <div class="quick-chips">
        <button type="button" class="chip" data-quick="Arijit Singh">Arijit Singh</button>
        <button type="button" class="chip" data-quick="Tahsan">Tahsan</button>
        <button type="button" class="chip" data-quick="Rabindra Sangeet">Rabindra Sangeet</button>
        <button type="button" class="chip" data-quick="বাংলা গান">বাংলা গান</button>
      </div>

      <div class="section-label">${labels.searchResults}</div>
      ${state.statusMessage ? `<div class="status-banner">${escapeHtml(state.statusMessage)}</div>` : ''}
      ${
        state.isLoading
          ? `<div class="loading-box"><div class="spinner"></div></div>`
          : state.results.length > 0
            ? renderTrackList(state.results, '')
            : !state.statusMessage
              ? `
                <div class="empty-state">
                  <div class="empty-icon">♪</div>
                  <div class="empty-title">${labels.emptySearchTitle}</div>
                  <div class="empty-sub">${escapeHtml(labels.emptySearchSub)}</div>
                </div>
              `
              : ''
      }
    `;
  } else {
    const emptyMap = {
      recent: isBn ? 'এখনও কোনো গান শোনা হয়নি' : 'No recent tracks yet',
      favorites: isBn ? 'প্রিয় তালিকায় কোনো গান নেই' : 'No favorite tracks yet',
      playlists: isBn ? 'সাম্প্রতিক গান থেকে প্লেলিস্ট তৈরি হবে' : 'Playlist items appear from recent tracks',
      queue: isBn ? 'কিউ খালি রয়েছে' : 'Queue is empty'
    };
    bodyContent = `
      <div class="section-label">${labels[state.tab] || ''}</div>
      ${renderTrackList(displayed, emptyMap[state.tab] || '')}
    `;
  }

  const settingsModal = state.settingsOpen
    ? `
      <div class="modal-backdrop" id="gw-modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3>${isBn ? 'অ্যাপ সেটিংস ও সোর্স' : 'App Settings & Sources'}</h3>
            <button class="icon-btn" id="gw-close-settings">✕</button>
          </div>
          <div class="setting-row">
            <label>${isBn ? 'মিউজিক সোর্স (Fallback)' : 'Music Source'}</label>
            <select id="gw-source-select">
              <option value="auto" ${state.sourcePref === 'auto' ? 'selected' : ''}>${isBn ? 'অটো ফলব্যাক (সর্বোত্তম সোর্স)' : 'Auto Fallback (Recommended)'}</option>
              ${PROVIDERS.map((p) => `<option value="${p.id}" ${state.sourcePref === p.id ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
          </div>
          <div class="setting-row">
            <label>${isBn ? 'ভাষা' : 'Language'}</label>
            <select id="gw-lang-select">
              <option value="bn" ${state.lang === 'bn' ? 'selected' : ''}>বাংলা</option>
              <option value="en" ${state.lang === 'en' ? 'selected' : ''}>English</option>
            </select>
          </div>
          <div class="setting-row">
            <label>${isBn ? 'থিম কালার' : 'Theme'}</label>
            <select id="gw-theme-select">
              <option value="violet" ${state.theme === 'violet' ? 'selected' : ''}>Violet Glass</option>
              <option value="emerald" ${state.theme === 'emerald' ? 'selected' : ''}>Emerald Night</option>
              <option value="amber" ${state.theme === 'amber' ? 'selected' : ''}>Amber Warm</option>
            </select>
          </div>
        </div>
      </div>
    `
    : '';

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-badge">♪</span>
        <span class="brand-name">GlassWave</span>
      </div>
      <div class="top-actions">
        <button class="pill-btn" id="gw-settings-btn" title="Settings">⚙</button>
        <button class="pill-btn" id="gw-lang-btn">${isBn ? 'বাং' : 'EN'}</button>
        <button class="pill-btn" id="gw-theme-btn">🎨</button>
        <button class="pill-btn" id="gw-power-btn" title="Stop Audio">⏻</button>
      </div>
    </header>

    <div class="speed-strip">
      <button class="speed-pill" id="gw-speed-btn">${state.speed}x</button>
    </div>

    <main class="content">
      ${bodyContent}
    </main>

    <div id="gw-player-bar" class="player-bar"></div>

    <nav class="bottom-nav">
      <button class="nav-item ${state.tab === 'search' ? 'active' : ''}" data-tab="search">
        <span>🔍</span>
        <span>${labels.searchTab}</span>
      </button>
      <button class="nav-item ${state.tab === 'recent' ? 'active' : ''}" data-tab="recent">
        <span>🕒</span>
        <span>${labels.recent}</span>
      </button>
      <button class="nav-item ${state.tab === 'favorites' ? 'active' : ''}" data-tab="favorites">
        <span>♥</span>
        <span>${labels.favorites}</span>
      </button>
      <button class="nav-item ${state.tab === 'playlists' ? 'active' : ''}" data-tab="playlists">
        <span>☰</span>
        <span>${labels.playlists}</span>
      </button>
      <button class="nav-item ${state.tab === 'queue' ? 'active' : ''}" data-tab="queue">
        <span>▤</span>
        <span>${labels.queue}</span>
      </button>
    </nav>

    ${settingsModal}
  `;

  renderPlayerBar();

  // Wire events
  document.getElementById('gw-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('gw-search-input');
    if (input) runSearch(input.value);
  });

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-quick') || '';
      state.query = q;
      runSearch(q);
    });
  });

  document.querySelectorAll('[data-action="play-track"]').forEach((card) => {
    card.addEventListener('click', () => {
      const idx = Number(card.getAttribute('data-index'));
      const track = displayed[idx];
      if (track) playTrack(track, displayed);
    });
  });

  document.querySelectorAll('[data-action="toggle-fav"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = Number(btn.getAttribute('data-index'));
      const track = displayed[idx];
      if (track) toggleFavorite(track, e);
    });
  });

  document.querySelectorAll('[data-tab]').forEach((navBtn) => {
    navBtn.addEventListener('click', () => {
      state.tab = navBtn.getAttribute('data-tab') || 'search';
      render();
    });
  });

  document.getElementById('gw-lang-btn')?.addEventListener('click', () => {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    localStorage.setItem(STORAGE_KEYS.LANG_PREF, state.lang);
    render();
  });

  document.getElementById('gw-theme-btn')?.addEventListener('click', () => {
    const order = ['violet', 'emerald', 'amber'];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    state.theme = next;
    localStorage.setItem(STORAGE_KEYS.THEME_PREF, next);
    render();
  });

  document.getElementById('gw-speed-btn')?.addEventListener('click', () => {
    const speeds = [1, 1.25, 1.5, 0.75];
    const next = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length];
    state.speed = next;
    audio.playbackRate = next;
    localStorage.setItem(STORAGE_KEYS.SPEED_PREF, String(next));
    render();
  });

  document.getElementById('gw-power-btn')?.addEventListener('click', () => {
    audio.pause();
    audio.currentTime = 0;
    state.isPlaying = false;
    renderPlayerBar();
  });

  document.getElementById('gw-settings-btn')?.addEventListener('click', () => {
    state.settingsOpen = true;
    render();
  });

  document.getElementById('gw-close-settings')?.addEventListener('click', () => {
    state.settingsOpen = false;
    render();
  });

  document.getElementById('gw-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'gw-modal-backdrop') {
      state.settingsOpen = false;
      render();
    }
  });

  document.getElementById('gw-source-select')?.addEventListener('change', (e) => {
    state.sourcePref = e.target.value;
    localStorage.setItem(STORAGE_KEYS.SOURCE_PREF, state.sourcePref);
    if (state.query) runSearch(state.query);
  });

  document.getElementById('gw-lang-select')?.addEventListener('change', (e) => {
    state.lang = e.target.value;
    localStorage.setItem(STORAGE_KEYS.LANG_PREF, state.lang);
    render();
  });

  document.getElementById('gw-theme-select')?.addEventListener('change', (e) => {
    state.theme = e.target.value;
    localStorage.setItem(STORAGE_KEYS.THEME_PREF, state.theme);
    render();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
});
