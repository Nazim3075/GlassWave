// GlassWave Standalone Player v4.6
// Fixes: Direct Fast Monochrome Search (no slow CORS proxy hang), YT Music Home Feed & Playlists mapped to Monochrome Lossless Playback, Shuffle & Repeat (Off/All/One)

const STORAGE_KEYS = {
  RECENT: 'glasswave_recent_v1',
  FAVORITES: 'glasswave_favorites_v1',
  SOURCE_PREF: 'glasswave_source_pref_v1',
  LANG_PREF: 'glasswave_lang_pref_v1',
  SPEED_PREF: 'glasswave_speed_pref_v1',
  THEME_PREF: 'glasswave_theme_pref_v1',
  AUTO_RADIO_PREF: 'glasswave_autoradio_v1',
  SHUFFLE_PREF: 'glasswave_shuffle_v1',
  REPEAT_PREF: 'glasswave_repeat_v1'
};

const MONOCHROME_API = 'https://tracks.monochrome.st';
const REPEAT_MODES = ['off', 'all', 'one'];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.yt'
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com'
];

const YT_HOME_PLAYLISTS = [
  {
    id: 'yt-pl-bangla',
    title: 'Bangla Top Hits',
    subtitle: 'YT Music · Monochrome FLAC',
    query: 'Bangla hits',
    cover: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg'
  },
  {
    id: 'yt-pl-arijit',
    title: 'Arijit Singh Mix',
    subtitle: 'YT Music · Monochrome FLAC',
    query: 'Arijit Singh',
    cover: 'https://i.ytimg.com/vi/BddP6PYo2gs/hqdefault.jpg'
  },
  {
    id: 'yt-pl-rabindra',
    title: 'Rabindra Sangeet',
    subtitle: 'YT Music · Monochrome FLAC',
    query: 'Rabindra Sangeet',
    cover: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg'
  },
  {
    id: 'yt-pl-tahsan',
    title: 'Tahsan & Bangla Pop',
    subtitle: 'YT Music · Monochrome FLAC',
    query: 'Tahsan',
    cover: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg'
  },
  {
    id: 'yt-pl-chill',
    title: 'Lofi & Late Night',
    subtitle: 'YT Music · Monochrome FLAC',
    query: 'Chill R&B',
    cover: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg'
  }
];

function decodeHtml(str) {
  if (!str) return '';
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

function cleanLyricsText(raw) {
  if (!raw) return '';
  return decodeHtml(String(raw))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  } catch {}
}

function normalizeRepeatMode(raw) {
  if (raw === 'one') return 'one';
  if (raw === 'off' || raw === 'none') return 'off';
  return 'all';
}

async function fetchJsonDirect(url, ms = 5500) {
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

// Fast direct search against Monochrome API (matches working index.html API directly without slow proxies)
async function searchMonochromeDirect(query, quality = 'LOSSLESS') {
  const q = String(query || '').trim();
  if (!q) return [];
  const data = await fetchJsonDirect(`${MONOCHROME_API}/search?q=${encodeURIComponent(q)}`, 6500);
  const list = data?.tracks || data?.results || data?.data || (Array.isArray(data) ? data : []);
  return list.map((item, idx) => {
    const trackId = String(item.trackId || item.id || '');
    const artistStr = Array.isArray(item.artistNames) && item.artistNames.length > 0
      ? item.artistNames.join(', ')
      : (item.artist || item.artists?.[0]?.name || 'Unknown Artist');
    const durSec = item.duration
      ? (Number(item.duration) > 10000 ? Math.round(Number(item.duration) / 1000) : Number(item.duration))
      : 0;
    const streamUrl = trackId
      ? `${MONOCHROME_API}/track/${encodeURIComponent(trackId)}?quality=${encodeURIComponent(quality)}`
      : (item.streamUrl || item.url || item.audioUrl || '');
    return {
      id: trackId || `mono-${idx}`,
      title: decodeHtml(item.title || item.name || 'Untitled'),
      artist: decodeHtml(artistStr),
      album: decodeHtml(item.album?.title || item.album || ''),
      year: String(item.year || '').slice(0, 4),
      language: decodeHtml(item.language || ''),
      quality: 'FLAC · LOSSLESS',
      isPreview: false,
      duration: durSec,
      cover: item.artwork || item.cover || '',
      audioUrl: streamUrl,
      source: 'Monochrome',
      providerId: 'monochrome'
    };
  }).filter((t) => t.title && t.audioUrl);
}

// Fetch YouTube Music songs/playlists metadata, then resolve playback stream from monochrome.st
async function fetchYTMusicCatalog(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  for (const base of PIPED_INSTANCES) {
    try {
      const json = await fetchJsonDirect(
        `${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`,
        4000
      );
      const items = Array.isArray(json?.items) ? json.items : [];
      if (items.length > 0) {
        return items.slice(0, 18).map((it, idx) => {
          const videoId = (it.url || '').replace('/watch?v=', '').split('&')[0] || it.id || `yt-${idx}`;
          const cleanTitle = decodeHtml(it.title || 'Untitled');
          const cleanArtist = decodeHtml((it.uploaderName || it.artist || 'YouTube Music').replace(/ - Topic$/i, ''));
          return {
            id: `yt-${videoId}`,
            ytVideoId: videoId,
            title: cleanTitle,
            artist: cleanArtist,
            album: decodeHtml(it.album || 'YouTube Music'),
            year: String(it.uploadedDate || '').slice(0, 4),
            language: '',
            quality: 'FLAC · Monochrome',
            isPreview: false,
            duration: Number(it.duration) || 0,
            cover: it.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
            audioUrl: '',
            resolveAudio: async () => resolveMonochromeStreamForTrack(cleanTitle, cleanArtist),
            source: 'YT Music → Monochrome',
            providerId: 'yt_monochrome'
          };
        });
      }
    } catch {}
  }

  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const list = await fetchJsonDirect(
        `${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
        4000
      );
      if (Array.isArray(list) && list.length > 0) {
        return list.slice(0, 18).map((it, idx) => {
          const videoId = it.videoId || `inv-${idx}`;
          const cleanTitle = decodeHtml(it.title || 'Untitled');
          const cleanArtist = decodeHtml((it.author || 'YouTube Music').replace(/ - Topic$/i, ''));
          const thumb = Array.isArray(it.videoThumbnails) && it.videoThumbnails.length > 0
            ? (it.videoThumbnails.find((x) => x.quality === 'high')?.url || it.videoThumbnails[0].url)
            : (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
          return {
            id: `yt-${videoId}`,
            ytVideoId: videoId,
            title: cleanTitle,
            artist: cleanArtist,
            album: 'YouTube Music',
            year: '',
            language: '',
            quality: 'FLAC · Monochrome',
            isPreview: false,
            duration: Number(it.lengthSeconds) || 0,
            cover: thumb.startsWith('http') ? thumb : `${base}${thumb}`,
            audioUrl: '',
            resolveAudio: async () => resolveMonochromeStreamForTrack(cleanTitle, cleanArtist),
            source: 'YT Music → Monochrome',
            providerId: 'yt_monochrome'
          };
        });
      }
    } catch {}
  }

  return [];
}

// Match a YouTube Music track to monochrome.st and return the Lossless FLAC stream URL
async function resolveMonochromeStreamForTrack(title, artist) {
  const cleanTitle = String(title || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '')
    .replace(/official\s*(music\s*)?video|lyric(s)?\s*video|audio|full\s*song|hd|4k/gi, '')
    .trim();
  const primaryArtist = String(artist || '').split(',')[0].trim();

  const queries = [
    `${cleanTitle} ${primaryArtist}`.trim(),
    cleanTitle
  ].filter(Boolean);

  for (const q of queries) {
    try {
      const matches = await searchMonochromeDirect(q);
      if (matches.length > 0) {
        const exact = matches.find(
          (m) => m.title.toLowerCase() === cleanTitle.toLowerCase()
        ) || matches[0];
        if (exact?.audioUrl) return exact.audioUrl;
      }
    } catch {}
  }
  return '';
}

function parseSaavnLikeList(list, prefix, sourceLabel, providerId) {
  return (Array.isArray(list) ? list : []).map((item, idx) => {
    const downloads = Array.isArray(item.downloadUrl) ? item.downloadUrl : [];
    const bestObj =
      downloads.find((d) => d.quality === '320kbps') ||
      downloads.find((d) => d.quality === '160kbps') ||
      downloads[downloads.length - 1] ||
      null;
    const bestAudio = bestObj?.url || bestObj?.link || '';
    const quality = bestObj?.quality ? String(bestObj.quality).toUpperCase() : 'FULL';
    const images = Array.isArray(item.image) ? item.image : [];
    const cover =
      images.find((im) => im.quality === '500x500')?.url ||
      images.find((im) => im.quality === '500x500')?.link ||
      images[images.length - 1]?.url ||
      images[images.length - 1]?.link ||
      '';
    const primaryArtist =
      item.artists?.primary?.map((a) => a.name).filter(Boolean).join(', ') ||
      item.primaryArtists ||
      'Unknown Artist';
    return {
      id: String(item.id || `${prefix}-${idx}`),
      title: decodeHtml(item.name || item.title || 'Untitled'),
      artist: decodeHtml(primaryArtist),
      album: decodeHtml(item.album?.name || ''),
      year: String(item.year || item.releaseDate || '').slice(0, 4),
      language: decodeHtml(item.language || ''),
      quality,
      isPreview: false,
      duration: Number(item.duration) || 0,
      cover,
      audioUrl: bestAudio,
      source: sourceLabel,
      providerId
    };
  }).filter((t) => t.title && t.audioUrl);
}

const PROVIDERS = [
  {
    id: 'monochrome',
    label: 'Monochrome Lossless (Default)',
    badge: 'Lossless · tracks.monochrome.st',
    isPreview: false,
    search: async (q) => searchMonochromeDirect(q)
  },
  {
    id: 'yt_monochrome',
    label: 'YT Music Discovery → Monochrome Play',
    badge: 'YT Music · Monochrome FLAC',
    isPreview: false,
    search: async (q) => fetchYTMusicCatalog(q)
  },
  {
    id: 'saavn_dev',
    label: 'Saavn Full Track',
    badge: 'Full · saavn.dev',
    isPreview: false,
    searchUrl: (q) => `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=25`,
    lyricsUrl: (id) => `https://saavn.dev/api/songs/${encodeURIComponent(id)}/lyrics`,
    parse: (json) => parseSaavnLikeList(json?.data?.results || [], 'saavn', 'Saavn', 'saavn_dev')
  },
  {
    id: 'jiosaavn_sumit',
    label: 'JioSaavn Full Mirror',
    badge: 'Full · jiosaavn-api',
    isPreview: false,
    searchUrl: (q) => `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(q)}&limit=25`,
    lyricsUrl: (id) => `https://jiosaavn-api-privatecvc2.vercel.app/lyrics?id=${encodeURIComponent(id)}`,
    parse: (json) => parseSaavnLikeList(json?.data?.results || json?.results || [], 'js', 'JioSaavn', 'jiosaavn_sumit')
  },
  {
    id: 'deezer',
    label: 'Deezer (30s Preview)',
    badge: 'Deezer · Preview',
    isPreview: true,
    searchUrl: (q) => `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=25`,
    parse: (json) => {
      const list = Array.isArray(json?.data) ? json.data : [];
      return list.map((item, idx) => ({
        id: String(item.id || `dz-${idx}`),
        title: item.title || item.title_short || 'Untitled',
        artist: item.artist?.name || 'Deezer Artist',
        album: item.album?.title || '',
        year: '',
        language: '',
        quality: 'MP3 · 30s',
        isPreview: true,
        duration: Number(item.duration) || 30,
        cover: item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '',
        audioUrl: item.preview || '',
        source: 'Deezer',
        providerId: 'deezer'
      })).filter((t) => t.title && t.audioUrl);
    }
  }
];

const FULL_PROVIDERS = PROVIDERS.filter((p) => !p.isPreview);

const RADIO_SEEDS = [
  'Bangla hits',
  'Arijit Singh',
  'Tahsan',
  'Rabindra Sangeet',
  'Atif Aslam',
  'Shreya Ghoshal'
];

const state = {
  tab: 'search',
  query: '',
  results: [],
  homeYtTracks: [],
  homeLoading: false,
  activeHomePlaylist: YT_HOME_PLAYLISTS[0].id,
  recent: loadJson(STORAGE_KEYS.RECENT, []),
  favorites: loadJson(STORAGE_KEYS.FAVORITES, []),
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  playerExpanded: false,
  lyricsText: '',
  lyricsLoading: false,
  lyricsTrackKey: '',
  autoRadio: localStorage.getItem(STORAGE_KEYS.AUTO_RADIO_PREF) !== 'false',
  shuffle: localStorage.getItem(STORAGE_KEYS.SHUFFLE_PREF) === 'true',
  repeatMode: normalizeRepeatMode(localStorage.getItem(STORAGE_KEYS.REPEAT_PREF)),
  sourcePref: localStorage.getItem(STORAGE_KEYS.SOURCE_PREF) || 'auto',
  lang: localStorage.getItem(STORAGE_KEYS.LANG_PREF) || 'bn',
  speed: parseFloat(localStorage.getItem(STORAGE_KEYS.SPEED_PREF) || '1'),
  theme: localStorage.getItem(STORAGE_KEYS.THEME_PREF) || 'violet',
  activeSourceLabel: 'Lossless · tracks.monochrome.st',
  statusMessage: '',
  isLoading: false,
  settingsOpen: false,
  recoveringStream: false
};

const audio = new Audio();
audio.preload = 'auto';

function getOrderedProviders(allowPreviewInAuto = false) {
  const pool = allowPreviewInAuto || state.sourcePref === 'deezer' ? PROVIDERS : FULL_PROVIDERS;
  if (state.sourcePref === 'auto') return pool;
  const chosen = PROVIDERS.find((p) => p.id === state.sourcePref);
  if (!chosen) return pool;
  return [chosen, ...pool.filter((p) => p.id !== state.sourcePref)];
}

async function executeProviderSearch(provider, queryVariant, allowPreviewFallback) {
  if (typeof provider.search === 'function') {
    const rawTracks = await provider.search(queryVariant);
    return (rawTracks || []).filter(
      (t) => allowPreviewFallback || state.sourcePref === 'deezer' || !t.isPreview
    );
  }
  const json = await fetchJsonDirect(provider.searchUrl(queryVariant), 5500);
  return provider.parse(json).filter(
    (t) => allowPreviewFallback || state.sourcePref === 'deezer' || !t.isPreview
  );
}

async function fetchTracksFromProviders(rawQuery, { allowPreviewFallback = false } = {}) {
  const q = rawQuery.trim().replace(/\s+/g, ' ');
  const orderedProviders = getOrderedProviders(allowPreviewFallback);

  for (const provider of orderedProviders) {
    try {
      const tracks = await executeProviderSearch(provider, q, allowPreviewFallback);
      if (Array.isArray(tracks) && tracks.length > 0) {
        return { tracks, provider, fallbackUsed: state.sourcePref !== 'auto' && provider.id !== state.sourcePref };
      }
    } catch (err) {
      console.warn(`Provider ${provider.id} failed:`, err.message);
    }
  }
  return null;
}

async function loadHomeYTMusicFeed(playlistObj = YT_HOME_PLAYLISTS[0]) {
  state.activeHomePlaylist = playlistObj.id;
  state.homeLoading = true;
  render();

  // 1. Try fetching curated songs from YouTube Music metadata (Piped/Invidious) mapped to Monochrome
  let tracks = await fetchYTMusicCatalog(playlistObj.query);

  // 2. If YouTube Music metadata instances are rate-limited in user's region, fallback immediately to Monochrome direct tracks so Home never stays empty
  if (!tracks || tracks.length === 0) {
    try {
      const monoTracks = await searchMonochromeDirect(playlistObj.query);
      tracks = monoTracks.map((t) => ({
        ...t,
        source: 'YT Mix · Monochrome'
      }));
    } catch {}
  }

  state.homeYtTracks = tracks || [];
  state.homeLoading = false;
  render();
}

async function loadLyricsForTrack(track) {
  if (!track) {
    state.lyricsText = '';
    state.lyricsLoading = false;
    return;
  }
  const key = `${track.source}:${track.id}:${track.title}`;
  if (state.lyricsTrackKey === key && (state.lyricsText || state.lyricsLoading)) return;

  state.lyricsTrackKey = key;
  state.lyricsLoading = true;
  state.lyricsText = '';
  renderPlayerBar();

  try {
    const artistParam = track.artist && track.artist !== 'Unknown Artist'
      ? `&artist_name=${encodeURIComponent(track.artist.split(',')[0].trim())}`
      : '';
    const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(track.title)}${artistParam}`;
    const lrc = await fetchJsonDirect(lrclibUrl, 4500);
    const cleaned = cleanLyricsText(lrc?.plainLyrics || lrc?.syncedLyrics || '');
    if (cleaned) {
      state.lyricsText = cleaned;
      state.lyricsLoading = false;
      renderPlayerBar();
      return;
    }
  } catch {}

  try {
    const sRes = await fetchJsonDirect(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${track.title} ${track.artist || ''}`)}`,
      4500
    );
    if (Array.isArray(sRes) && sRes.length > 0) {
      const best = sRes.find((x) => x.plainLyrics || x.syncedLyrics) || sRes[0];
      const cleaned = cleanLyricsText(best?.plainLyrics || best?.syncedLyrics || '');
      if (cleaned) {
        state.lyricsText = cleaned;
        state.lyricsLoading = false;
        renderPlayerBar();
        return;
      }
    }
  } catch {}

  state.lyricsText = '';
  state.lyricsLoading = false;
  renderPlayerBar();
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
  state.statusMessage = state.lang === 'bn' ? 'গান খোঁজা হচ্ছে...' : 'Searching tracks...';
  render();

  const found = await fetchTracksFromProviders(q, { allowPreviewFallback: state.sourcePref === 'deezer' });
  if (found) {
    state.results = found.tracks;
    state.activeSourceLabel = found.provider.badge;
    if (state.lang === 'bn') {
      state.statusMessage = found.fallbackUsed
        ? `${found.provider.label} থেকে ${found.tracks.length}টি গান পাওয়া গেছে`
        : `${found.tracks.length}টি গান পাওয়া গেছে · ${found.provider.label}`;
    } else {
      state.statusMessage = `${found.tracks.length} tracks found · ${found.provider.label}`;
    }
    state.isLoading = false;
    render();
    return;
  }

  state.results = [];
  state.isLoading = false;
  state.statusMessage =
    state.lang === 'bn'
      ? 'কোনো গান পাওয়া যায়নি। অন্য নাম দিয়ে আবার সার্চ করুন।'
      : 'No tracks found. Please try another search term.';
  render();
}

async function appendRadioTracks(seedTrack) {
  const existingKeys = new Set(state.queue.map((t) => `${t.id}:${t.title}`));
  const artistName = seedTrack?.artist && seedTrack.artist !== 'Unknown Artist'
    ? seedTrack.artist.split(',')[0].trim()
    : '';
  const seeds = artistName ? [artistName, ...RADIO_SEEDS] : [...RADIO_SEEDS];

  for (const seed of seeds) {
    try {
      const tracks = await searchMonochromeDirect(seed);
      const fresh = tracks.filter((t) => {
        const key = `${t.id}:${t.title}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      if (fresh.length > 0) {
        state.queue = [...state.queue, ...fresh.slice(0, 12)];
        return true;
      }
    } catch {}
  }
  return false;
}

async function attachAudioSource(track, resumeAtSec = 0) {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();

  let streamUrl = track.audioUrl || '';
  if (!streamUrl && typeof track.resolveAudio === 'function') {
    state.statusMessage = state.lang === 'bn'
      ? `Monochrome থেকে "${track.title}" লোড হচ্ছে...`
      : `Resolving "${track.title}" on Monochrome...`;
    render();
    try {
      const resolved = await track.resolveAudio();
      if (resolved) {
        streamUrl = resolved;
        track.audioUrl = resolved;
      }
    } catch (err) {
      console.warn('Monochrome stream resolver failed:', err.message);
    }
    state.statusMessage = '';
  }

  if (!streamUrl) {
    state.isPlaying = false;
    state.statusMessage = state.lang === 'bn'
      ? `"${track.title}" গানটি Monochrome-এ পাওয়া যায়নি, পরের গানে যাওয়া হচ্ছে...`
      : `"${track.title}" not available on Monochrome, skipping...`;
    render();
    setTimeout(() => playNext(null, true), 600);
    return;
  }

  audio.src = streamUrl;
  audio.playbackRate = state.speed;

  const startPlayback = () => {
    if (resumeAtSec > 0 && isFinite(audio.duration) && resumeAtSec < audio.duration - 2) {
      try {
        audio.currentTime = resumeAtSec;
      } catch {}
    }
    audio.play().then(() => {
      state.isPlaying = true;
      state.recoveringStream = false;
      renderPlayerBar();
    }).catch(() => {
      state.isPlaying = false;
      renderPlayerBar();
    });
  };

  if (resumeAtSec > 0) {
    audio.addEventListener('loadedmetadata', startPlayback, { once: true });
  } else {
    startPlayback();
  }
}

function playTrackAtIndex(targetIdx) {
  if (targetIdx < 0 || targetIdx >= state.queue.length) return;
  state.currentIndex = targetIdx;
  const activeTrack = state.queue[state.currentIndex];
  if (!activeTrack) return;

  state.recoveringStream = false;
  attachAudioSource(activeTrack, 0);
  loadLyricsForTrack(activeTrack);

  if (state.autoRadio && state.currentIndex >= state.queue.length - 2) {
    appendRadioTracks(activeTrack).then((added) => {
      if (added && state.tab === 'queue') render();
    });
  }

  const filteredRecent = state.recent.filter((item) => !(item.id === activeTrack.id && item.title === activeTrack.title));
  state.recent = [activeTrack, ...filteredRecent].slice(0, 40);
  saveJson(STORAGE_KEYS.RECENT, state.recent);

  state.isPlaying = true;
  render();
}

function playTrack(track, listContext = null, { keepQueue = false } = {}) {
  if (!track || (!track.audioUrl && typeof track.resolveAudio !== 'function')) return;

  if (!keepQueue) {
    if (Array.isArray(listContext) && listContext.length > 0) {
      state.queue = listContext.filter((t) => Boolean(t.audioUrl || typeof t.resolveAudio === 'function'));
      state.currentIndex = state.queue.findIndex((t) => t.id === track.id && t.title === track.title);
      if (state.currentIndex === -1) {
        state.queue.unshift(track);
        state.currentIndex = 0;
      }
    } else if (state.queue.length === 0) {
      state.queue = [track];
      state.currentIndex = 0;
    } else {
      const existingIdx = state.queue.findIndex((t) => t.id === track.id && t.title === track.title);
      if (existingIdx !== -1) {
        state.currentIndex = existingIdx;
      } else {
        state.queue.splice(Math.max(0, state.currentIndex + 1), 0, track);
        state.currentIndex = Math.max(0, state.currentIndex + 1);
      }
    }
  }

  playTrackAtIndex(state.currentIndex);
}

function togglePlayPause(e) {
  if (e) e.stopPropagation();
  if (!audio.src) {
    const fallbackList = state.results.length > 0 ? state.results : state.homeYtTracks;
    if (fallbackList.length > 0) playTrack(fallbackList[0], fallbackList);
    return;
  }
  if (audio.paused) {
    audio.play().then(() => {
      state.isPlaying = true;
      renderPlayerBar();
    }).catch(() => {});
  } else {
    audio.pause();
    state.isPlaying = false;
    renderPlayerBar();
  }
}

function pickRandomQueueIndex() {
  if (state.queue.length <= 1) return 0;
  let randIdx = Math.floor(Math.random() * state.queue.length);
  if (randIdx === state.currentIndex) {
    randIdx = (state.currentIndex + 1) % state.queue.length;
  }
  return randIdx;
}

async function playNext(e, fromEnded = false) {
  if (e) e.stopPropagation();
  if (state.queue.length === 0) return;

  if (fromEnded && state.repeatMode === 'one' && state.currentIndex >= 0) {
    playTrackAtIndex(state.currentIndex);
    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    playTrackAtIndex(pickRandomQueueIndex());
    return;
  }

  const nextIdx = state.currentIndex + 1;
  if (nextIdx < state.queue.length) {
    playTrackAtIndex(nextIdx);
    return;
  }

  if (state.autoRadio && (fromEnded || state.repeatMode !== 'off')) {
    const currentTrack = state.queue[state.currentIndex];
    const added = await appendRadioTracks(currentTrack);
    if (added && nextIdx < state.queue.length) {
      playTrackAtIndex(nextIdx);
      return;
    }
  }

  if (state.repeatMode === 'all' || !fromEnded) {
    playTrackAtIndex(0);
    return;
  }

  audio.pause();
  audio.currentTime = 0;
  state.isPlaying = false;
  renderPlayerBar();
}

function playPrev(e) {
  if (e) e.stopPropagation();
  if (state.queue.length === 0) return;

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    playTrackAtIndex(pickRandomQueueIndex());
    return;
  }

  const prevIdx = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playTrackAtIndex(prevIdx);
}

function toggleShuffle(e) {
  if (e) e.stopPropagation();
  state.shuffle = !state.shuffle;
  localStorage.setItem(STORAGE_KEYS.SHUFFLE_PREF, String(state.shuffle));
  renderPlayerBar();
}

function cycleRepeatMode(e) {
  if (e) e.stopPropagation();
  const nextPos = (REPEAT_MODES.indexOf(state.repeatMode) + 1) % REPEAT_MODES.length;
  state.repeatMode = REPEAT_MODES[nextPos];
  localStorage.setItem(STORAGE_KEYS.REPEAT_PREF, state.repeatMode);
  renderPlayerBar();
}

function toggleFavorite(track, event) {
  if (event) event.stopPropagation();
  const exists = state.favorites.some((f) => f.id === track.id && f.title === track.title);
  state.favorites = exists
    ? state.favorites.filter((f) => !(f.id === track.id && f.title === track.title))
    : [track, ...state.favorites];
  saveJson(STORAGE_KEYS.FAVORITES, state.favorites);
  render();
}

function isFavorite(track) {
  return state.favorites.some((f) => f.id === track.id && f.title === track.title);
}

async function recoverDroppedStream() {
  const current = getCurrentTrack();
  if (!current || state.recoveringStream) return;
  state.recoveringStream = true;
  const savedTime = audio.currentTime > 1 ? audio.currentTime : 0;

  try {
    const resolvedUrl = await resolveMonochromeStreamForTrack(current.title, current.artist);
    if (resolvedUrl) {
      current.audioUrl = resolvedUrl;
      attachAudioSource(current, savedTime);
      return;
    }
  } catch {}

  state.recoveringStream = false;
  playNext(null, true);
}

audio.addEventListener('ended', () => playNext(null, true));

audio.addEventListener('error', () => {
  if (state.isPlaying) {
    recoverDroppedStream();
  }
});

audio.addEventListener('play', () => {
  state.isPlaying = true;
  renderPlayerBar();
});

audio.addEventListener('pause', () => {
  if (!audio.ended && !state.recoveringStream) {
    state.isPlaying = false;
    renderPlayerBar();
  }
});

audio.addEventListener('timeupdate', () => {
  const prog = document.getElementById('gw-progress');
  const cur = document.getElementById('gw-time-cur');
  const dur = document.getElementById('gw-time-dur');
  const totalSec = audio.duration && isFinite(audio.duration) ? audio.duration : (getCurrentTrack()?.duration || 0);
  if (prog && totalSec > 0) {
    prog.value = String(Math.floor((audio.currentTime / totalSec) * 100));
  }
  if (cur) cur.textContent = formatTime(audio.currentTime);
  if (dur) dur.textContent = formatTime(totalSec);
});

const THEMES = {
  violet: { accent: '#a855f7', accent2: '#ec4899', bg: '#050507', surface: 'rgba(24, 24, 28, 0.72)', surface2: 'rgba(38, 38, 44, 0.85)', glow1: 'rgba(168, 85, 247, 0.26)', glow2: 'rgba(236, 72, 153, 0.18)' },
  emerald: { accent: '#10b981', accent2: '#06b6d4', bg: '#040807', surface: 'rgba(14, 31, 28, 0.72)', surface2: 'rgba(21, 46, 41, 0.85)', glow1: 'rgba(16, 185, 129, 0.24)', glow2: 'rgba(6, 182, 212, 0.18)' },
  amber: { accent: '#f59e0b', accent2: '#f97316', bg: '#070604', surface: 'rgba(33, 25, 13, 0.72)', surface2: 'rgba(46, 35, 19, 0.85)', glow1: 'rgba(245, 158, 11, 0.25)', glow2: 'rgba(249, 115, 22, 0.18)' }
};

function applyTheme() {
  const t = THEMES[state.theme] || THEMES.violet;
  const root = document.documentElement;
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-2', t.accent2);
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--surface', t.surface);
  root.style.setProperty('--surface-2', t.surface2);
  root.style.setProperty('--ambient-color', t.glow1);
  root.style.setProperty('--ambient-color-2', t.glow2);
}

function getCurrentTrack() {
  if (state.currentIndex >= 0 && state.queue[state.currentIndex]) {
    return state.queue[state.currentIndex];
  }
  return null;
}

function getNextUpTrack() {
  if (state.queue.length === 0) return null;
  if (state.repeatMode === 'one') return state.queue[state.currentIndex] || null;
  if (state.shuffle && state.queue.length > 1) {
    return state.queue[(state.currentIndex + 1) % state.queue.length] || null;
  }
  const nextIdx = state.currentIndex + 1;
  if (nextIdx < state.queue.length) return state.queue[nextIdx] || null;
  if (state.repeatMode === 'all' || state.autoRadio) return state.queue[0] || null;
  return null;
}

function getRepeatLabel(isBn) {
  if (state.repeatMode === 'one') return isBn ? 'রিপিট ১' : 'Repeat 1';
  if (state.repeatMode === 'all') return isBn ? 'রিপিট সব' : 'Repeat All';
  return isBn ? 'রিপিট বন্ধ' : 'Repeat Off';
}

function buildCodecSpec(track) {
  const q = String(track?.quality || '').toUpperCase();
  if (q.includes('FLAC') || q.includes('LOSSLESS') || q.includes('MONOCHROME')) {
    return { codec: 'FLAC', detail: 'Lossless · tracks.monochrome.st' };
  }
  if (q.includes('320')) {
    return { codec: 'AAC', detail: '320 kbps · 44.1 kHz · Stereo' };
  }
  return { codec: 'AAC', detail: `${track?.quality || '131 kbps'} · 44.1 kHz · Stereo` };
}

function renderPlayerBar() {
  const bar = document.getElementById('gw-player-bar');
  if (!bar) return;
  const track = getCurrentTrack();
  if (!track) {
    bar.innerHTML = '';
    bar.className = 'player-bar';
    return;
  }

  const totalSec = audio.duration && isFinite(audio.duration) ? audio.duration : (track.duration || 0);
  const pct = totalSec > 0 ? Math.floor((audio.currentTime / totalSec) * 100) : 0;
  const nextTrack = getNextUpTrack();
  const isBn = state.lang === 'bn';
  const fav = isFavorite(track);
  const codecInfo = buildCodecSpec(track);
  const repeatIcon = state.repeatMode === 'one' ? '🔂' : '🔁';
  const repeatActive = state.repeatMode !== 'off';

  if (state.playerExpanded) {
    const infoPills = [
      track.quality ? `<span class="info-pill">🎧 ${escapeHtml(track.quality)}</span>` : '',
      track.source ? `<span class="info-pill">📡 ${escapeHtml(track.source)}</span>` : '',
      track.album ? `<span class="info-pill">💿 ${escapeHtml(track.album)}</span>` : '',
      track.year ? `<span class="info-pill">📅 ${escapeHtml(track.year)}</span>` : ''
    ].filter(Boolean).join('');

    const lyricsHtml = state.lyricsLoading
      ? `<span class="lyrics-muted">${isBn ? 'লিরিক্স খোঁজা হচ্ছে...' : 'Loading lyrics...'}</span>`
      : state.lyricsText
        ? escapeHtml(state.lyricsText)
        : `<span class="lyrics-muted">${isBn ? 'এই গানের লিরিক্স পাওয়া যায়নি।' : 'Lyrics not available for this track.'}</span>`;

    bar.className = 'player-bar visible expanded';
    bar.innerHTML = `
      <div>
        <div class="drag-handle"></div>
        <div class="expanded-header">
          <button class="pill-btn" id="gw-collapse-btn">⌄ ${isBn ? 'নিচে নামান' : 'Minimize'}</button>
          <span class="chip">${escapeHtml(track.quality || track.source || '')}</span>
        </div>
      </div>

      <div class="expanded-art-wrap">
        <img class="expanded-art" src="${escapeAttr(track.cover || 'icon-512.png')}" alt="" onerror="this.src='icon-512.png'">
        <div class="expanded-title">${escapeHtml(track.title)}</div>
        <div class="expanded-artist">${escapeHtml(track.artist)}</div>
        <div class="info-pills">${infoPills}</div>
        <div class="lyrics-box">${lyricsHtml}</div>
      </div>

      <div>
        <div class="player-seek">
          <span id="gw-time-cur">${formatTime(audio.currentTime)}</span>
          <input id="gw-progress" type="range" min="0" max="100" value="${pct}">
          <span id="gw-time-dur">${formatTime(totalSec)}</span>
        </div>

        <div class="expanded-controls">
          <button type="button" class="ctrl-btn mode-btn ${state.shuffle ? 'active' : ''}" id="gw-shuffle-btn" title="Shuffle">🔀 <span>${isBn ? (state.shuffle ? 'শাফল অন' : 'শাফল') : (state.shuffle ? 'Shuffle ON' : 'Shuffle')}</span></button>
          <button type="button" class="ctrl-btn big" id="gw-prev-btn">⏮</button>
          <button type="button" class="ctrl-btn big primary" id="gw-play-btn">${state.isPlaying ? '❚❚' : '▶'}</button>
          <button type="button" class="ctrl-btn big" id="gw-next-btn">⏭</button>
          <button type="button" class="ctrl-btn mode-btn ${repeatActive ? 'active' : ''}" id="gw-repeat-btn" title="Repeat">${repeatIcon} <span>${escapeHtml(getRepeatLabel(isBn))}</span></button>
        </div>

        <div class="codec-badge-row">
          <div class="codec-badge">
            <span class="codec-tag">${escapeHtml(codecInfo.codec)}</span>
            <span>${escapeHtml(codecInfo.detail)}</span>
          </div>
        </div>

        <div class="secondary-glass-row">
          <button type="button" class="glass-circle-btn ${fav ? 'active' : ''}" id="gw-exp-fav-btn" title="Favorite">${fav ? '♥' : '♡'}</button>
          <button type="button" class="glass-circle-btn" id="gw-exp-queue-btn" title="Queue">▤</button>
          <button type="button" class="glass-circle-btn" id="gw-exp-speed-btn" title="Speed">${state.speed}x</button>
        </div>

        <div class="up-next-box">
          ${isBn ? 'এরপর বাজবে' : 'Up next'}: <strong>${escapeHtml(nextTrack ? `${nextTrack.title} — ${nextTrack.artist}` : (state.shuffle ? 'র‍্যান্ডম গান' : (state.autoRadio ? 'অটো রেডিও লোড হচ্ছে...' : 'কিউ শেষ')))}</strong>
        </div>
      </div>
    `;
    document.getElementById('gw-collapse-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.playerExpanded = false;
      renderPlayerBar();
    });
    document.getElementById('gw-prev-btn')?.addEventListener('click', playPrev);
    document.getElementById('gw-play-btn')?.addEventListener('click', togglePlayPause);
    document.getElementById('gw-next-btn')?.addEventListener('click', (e) => playNext(e, false));
    document.getElementById('gw-shuffle-btn')?.addEventListener('click', toggleShuffle);
    document.getElementById('gw-repeat-btn')?.addEventListener('click', cycleRepeatMode);
    document.getElementById('gw-exp-fav-btn')?.addEventListener('click', (e) => {
      toggleFavorite(track, e);
    });
    document.getElementById('gw-exp-queue-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.playerExpanded = false;
      state.tab = 'queue';
      render();
    });
    document.getElementById('gw-exp-speed-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const speeds = [1, 1.25, 1.5, 0.75];
      const next = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length];
      state.speed = next;
      audio.playbackRate = next;
      localStorage.setItem(STORAGE_KEYS.SPEED_PREF, String(next));
      renderPlayerBar();
    });
  } else {
    const miniMeta = [track.artist, track.quality, track.source].filter(Boolean).join(' · ');
    bar.className = 'player-bar visible';
    bar.innerHTML = `
      <div class="player-top">
        <img class="player-thumb" src="${escapeAttr(track.cover || 'icon-192.png')}" alt="" onerror="this.src='icon-192.png'">
        <div class="player-info">
          <div class="player-title">${escapeHtml(track.title)}</div>
          <div class="player-artist">${escapeHtml(miniMeta)}</div>
        </div>
        <div class="player-controls">
          <button type="button" class="ctrl-btn ${state.shuffle ? 'mode-btn active' : ''}" id="gw-mini-shuffle-btn" title="Shuffle">🔀</button>
          <button type="button" class="ctrl-btn primary" id="gw-play-btn">${state.isPlaying ? '❚❚' : '▶'}</button>
          <button type="button" class="ctrl-btn" id="gw-next-btn">⏭</button>
          <button type="button" class="ctrl-btn ${repeatActive ? 'mode-btn active' : ''}" id="gw-mini-repeat-btn" title="${escapeAttr(getRepeatLabel(isBn))}">${repeatIcon}</button>
        </div>
      </div>
      <div class="player-seek">
        <span id="gw-time-cur">${formatTime(audio.currentTime)}</span>
        <input id="gw-progress" type="range" min="0" max="100" value="${pct}">
        <span id="gw-time-dur">${formatTime(totalSec)}</span>
      </div>
    `;
    bar.onclick = () => {
      state.playerExpanded = true;
      loadLyricsForTrack(track);
      renderPlayerBar();
    };
    document.getElementById('gw-mini-shuffle-btn')?.addEventListener('click', toggleShuffle);
    document.getElementById('gw-play-btn')?.addEventListener('click', togglePlayPause);
    document.getElementById('gw-next-btn')?.addEventListener('click', (e) => playNext(e, false));
    document.getElementById('gw-mini-repeat-btn')?.addEventListener('click', cycleRepeatMode);
  }

  const prog = document.getElementById('gw-progress');
  if (prog) {
    prog.addEventListener('click', (e) => e.stopPropagation());
    prog.addEventListener('input', (e) => {
      const durNow = audio.duration && isFinite(audio.duration) ? audio.duration : (track.duration || 0);
      if (durNow > 0) {
        audio.currentTime = (Number(e.target.value) / 100) * durNow;
      }
    });
  }
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
  if (state.tab === 'search') {
    return state.query ? state.results : state.homeYtTracks;
  }
  if (state.tab === 'recent') return state.recent;
  if (state.tab === 'favorites') return state.favorites;
  if (state.tab === 'playlists') return state.homeYtTracks.length > 0 ? state.homeYtTracks : state.recent.slice(0, 15);
  if (state.tab === 'queue') return state.queue;
  return [];
}

function renderTrackList(tracks, emptyText) {
  if (!tracks || tracks.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">♪</div>
        <div class="empty-title">${emptyText}</div>
        <div class="empty-sub">${escapeHtml(state.activeSourceLabel)}</div>
      </div>
    `;
  }

  return `
    <div class="track-list">
      ${tracks.map((track, i) => {
        const current = getCurrentTrack();
        const active = current && current.id === track.id && current.title === track.title;
        const fav = isFavorite(track);
        const badgeClass = track.isPreview ? 'q-badge preview' : 'q-badge';
        const infoLine = [track.artist, track.album, track.year].filter(Boolean).join(' · ');
        return `
          <div class="track-card ${active ? 'active' : ''}" data-action="play-track" data-index="${i}">
            <img class="track-cover" src="${escapeAttr(track.cover || 'icon-192.png')}" alt="" loading="lazy" onerror="this.src='icon-192.png'">
            <div class="track-meta">
              <div class="track-title">${escapeHtml(track.title)}</div>
              <div class="track-sub">
                <span>${escapeHtml(infoLine)}</span>
                ${track.quality ? `<span class="${badgeClass}">${escapeHtml(track.quality)}</span>` : ''}
                ${track.source ? `<span class="q-badge">${escapeHtml(track.source)}</span>` : ''}
              </div>
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

function render() {
  applyTheme();
  const app = document.getElementById('app');
  if (!app) return;

  const isBn = state.lang === 'bn';
  const displayed = getDisplayedTracks();

  const labels = {
    searchPlaceholder: isBn ? 'গান বা শিল্পীর নাম লিখুন...' : 'Search songs or artists...',
    searchResults: isBn ? 'সার্চ রেজাল্ট' : 'Search Results',
    ytPlaylistsHeading: isBn ? 'ইউটিউব মিউজিক প্লেলিস্ট' : 'YouTube Music Playlists',
    ytSongsHeading: isBn ? 'হোম গান (YT Music → Monochrome)' : 'Home Tracks (YT Music → Monochrome)',
    emptySearchTitle: isBn ? 'গান খুঁজে বের করুন' : 'Search to find songs',
    emptySearchSub: state.activeSourceLabel,
    recent: isBn ? 'সাম্প্রতিক' : 'Recent',
    favorites: isBn ? 'প্রিয়' : 'Favorites',
    playlists: isBn ? 'প্লেলিস্ট' : 'Playlists',
    queue: isBn ? 'কিউ' : 'Queue',
    searchTab: isBn ? 'হোম / সার্চ' : 'Home / Search'
  };

  const quickMoods = [
    { label: 'All', query: '' },
    { label: 'Energize', query: 'Bollywood dance' },
    { label: 'Feel good', query: 'Arijit Singh' },
    { label: 'Relax', query: 'Rabindra Sangeet' },
    { label: 'Workout', query: 'Tahsan' }
  ];

  const playlistCarouselHtml = `
    <div class="section-label">
      <span>${labels.ytPlaylistsHeading}</span>
    </div>
    <div class="yt-playlists-row">
      ${YT_HOME_PLAYLISTS.map((pl) => `
        <div class="yt-pl-card" data-yt-pl="${escapeAttr(pl.id)}" style="${state.activeHomePlaylist === pl.id && !state.query ? 'border-color:#fff;background:rgba(255,255,255,0.12);' : ''}">
          <img class="yt-pl-cover" src="${escapeAttr(pl.cover)}" alt="" onerror="this.src='icon-192.png'">
          <div class="yt-pl-title">${escapeHtml(pl.title)}</div>
          <div class="yt-pl-sub">${escapeHtml(pl.subtitle)}</div>
        </div>
      `).join('')}
    </div>
  `;

  let bodyContent = '';
  if (state.tab === 'search') {
    const showingHomeFeed = !state.query;
    const activeList = showingHomeFeed ? state.homeYtTracks : state.results;
    const activeLoading = showingHomeFeed ? state.homeLoading : state.isLoading;

    bodyContent = `
      <form id="gw-search-form" class="search-box">
        <input
          id="gw-search-input"
          type="search"
          value="${escapeAttr(state.query)}"
          placeholder="${escapeAttr(labels.searchPlaceholder)}"
          autocomplete="off"
        >
        ${state.query ? `<button type="button" class="pill-btn" id="gw-clear-search" title="Clear">✕</button>` : ''}
        <button type="submit" class="search-submit">${isBn ? 'খুঁজুন' : 'Go'}</button>
      </form>

      <div class="quick-chips">
        ${quickMoods.map((m) => {
          const isActive = (!m.query && !state.query) || (m.query && state.query.toLowerCase() === m.query.toLowerCase());
          return `<button type="button" class="chip ${isActive ? 'active' : ''}" data-quick="${escapeAttr(m.query)}">${escapeHtml(m.label)}</button>`;
        }).join('')}
      </div>

      ${showingHomeFeed ? playlistCarouselHtml : ''}

      <div class="section-label">
        <span>${showingHomeFeed ? labels.ytSongsHeading : labels.searchResults}</span>
        ${activeList.length > 0 ? `<button type="button" class="chip" id="gw-play-all-btn">${isBn ? '▶ সব প্লে' : '▶ Play All'}</button>` : ''}
      </div>
      ${state.statusMessage ? `<div class="status-banner">${escapeHtml(state.statusMessage)}</div>` : ''}
      ${
        activeLoading
          ? `<div class="loading-box"><div class="spinner"></div></div>`
          : activeList.length > 0
            ? renderTrackList(activeList, '')
            : `
              <div class="empty-state">
                <div class="empty-icon">♪</div>
                <div class="empty-title">${labels.emptySearchTitle}</div>
                <div class="empty-sub">${escapeHtml(labels.emptySearchSub)}</div>
              </div>
            `
      }
    `;
  } else if (state.tab === 'playlists') {
    bodyContent = `
      ${playlistCarouselHtml}
      <div class="section-label">
        <span>${labels.ytSongsHeading}</span>
        ${displayed.length > 0 ? `<button type="button" class="chip" id="gw-play-all-btn">${isBn ? '▶ সব প্লে' : '▶ Play All'}</button>` : ''}
      </div>
      ${state.homeLoading ? `<div class="loading-box"><div class="spinner"></div></div>` : renderTrackList(displayed, isBn ? 'প্লেলিস্ট লোড হচ্ছে...' : 'Loading playlist...')}
    `;
  } else {
    const emptyMap = {
      recent: isBn ? 'এখনও কোনো গান শোনা হয়নি' : 'No recent tracks yet',
      favorites: isBn ? 'প্রিয় তালিকায় কোনো গান নেই' : 'No favorite tracks yet',
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
            <label>${isBn ? 'অটো রেডিও / একের পর এক গান' : 'Continuous Autoplay / Radio'}</label>
            <select id="gw-autoradio-select">
              <option value="true" ${state.autoRadio ? 'selected' : ''}>${isBn ? 'চালু (গান শেষ হলে অটো নতুন গান আসবে)' : 'On (Continuous next tracks)'}</option>
              <option value="false" ${!state.autoRadio ? 'selected' : ''}>${isBn ? 'বন্ধ (শুধু বর্তমান কিউ ঘুরবে)' : 'Off (Current queue only)'}</option>
            </select>
          </div>
          <div class="setting-row">
            <label>${isBn ? 'মিউজিক সোর্স (Fallback)' : 'Music Source'}</label>
            <select id="gw-source-select">
              <option value="auto" ${state.sourcePref === 'auto' ? 'selected' : ''}>${isBn ? 'Monochrome Lossless (সর্বোচ্চ গতি)' : 'Monochrome Lossless (Fast Direct)'}</option>
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
      <button type="button" class="pill-btn ${state.autoRadio ? 'active-toggle' : ''}" id="gw-radio-pill">
        ${isBn ? (state.autoRadio ? '∞ অটো নেক্সট চালু' : '∞ অটো নেক্সট বন্ধ') : (state.autoRadio ? '∞ Auto Next ON' : '∞ Auto Next OFF')}
      </button>
    </div>

    <main class="content">
      ${bodyContent}
    </main>

    <div id="gw-player-bar" class="player-bar"></div>

    <nav class="bottom-nav">
      <button class="nav-item ${state.tab === 'search' ? 'active' : ''}" data-tab="search">
        <span>🏠</span>
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

  document.getElementById('gw-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('gw-search-input');
    if (input) runSearch(input.value);
  });

  document.getElementById('gw-clear-search')?.addEventListener('click', () => {
    state.query = '';
    state.results = [];
    state.statusMessage = '';
    render();
  });

  document.getElementById('gw-play-all-btn')?.addEventListener('click', () => {
    if (displayed.length > 0) {
      playTrack(displayed[0], displayed);
    }
  });

  document.querySelectorAll('[data-yt-pl]').forEach((card) => {
    card.addEventListener('click', () => {
      const plId = card.getAttribute('data-yt-pl');
      const foundPl = YT_HOME_PLAYLISTS.find((p) => p.id === plId);
      if (foundPl) {
        state.query = '';
        loadHomeYTMusicFeed(foundPl);
      }
    });
  });

  document.getElementById('gw-radio-pill')?.addEventListener('click', () => {
    state.autoRadio = !state.autoRadio;
    localStorage.setItem(STORAGE_KEYS.AUTO_RADIO_PREF, String(state.autoRadio));
    render();
  });

  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-quick') || '';
      if (!q) {
        state.query = '';
        state.results = [];
        state.statusMessage = '';
        if (state.homeYtTracks.length === 0) {
          loadHomeYTMusicFeed(YT_HOME_PLAYLISTS[0]);
        } else {
          render();
        }
        return;
      }
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

  document.getElementById('gw-autoradio-select')?.addEventListener('change', (e) => {
    state.autoRadio = e.target.value === 'true';
    localStorage.setItem(STORAGE_KEYS.AUTO_RADIO_PREF, String(state.autoRadio));
    render();
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
  loadHomeYTMusicFeed(YT_HOME_PLAYLISTS[0]);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
});
