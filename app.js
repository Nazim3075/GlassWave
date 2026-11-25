// GlassWave Standalone Player v4.3 - Full Track Priority, Resilient Audio Recovery, Lyrics & Multi-Source Fallback
// Providers: Saavn, JioSaavn, YouTube / YT Music (Piped & Invidious), Deezer, Amazon Music / iTunes, Monochrome

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
    id: 'antra_jiosaavn_direct',
    label: 'Antra JioSaavn Direct',
    badge: 'Full · Antra JioSaavn',
    isPreview: false,
    searchUrl: (q) => `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=${encodeURIComponent(q)}&n=25`,
    parse: (json) => parseSaavnLikeList(json?.results || json?.data?.results || [], 'antra_js', 'Antra JioSaavn', 'antra_jiosaavn_direct')
  },
  {
    id: 'jiosaavn_rk',
    label: 'JioSaavn Mirror (jiosaavn-api)',
    badge: 'Full · JioSaavn Mirror',
    isPreview: false,
    searchUrl: (q) => `https://jiosaavn-api-ts83.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=25`,
    parse: (json) => parseSaavnLikeList(json?.data?.results || json?.results || [], 'js_rk', 'JioSaavn', 'jiosaavn_rk')
  },
  {
    id: 'piped_ytmusic',
    label: 'YouTube / YT Music (Piped)',
    badge: 'YT Music · Piped',
    isPreview: false,
    search: async (q) => {
      for (const base of PIPED_INSTANCES) {
        try {
          const json = await fetchWithTimeout(
            `${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`,
            6500
          );
          const items = Array.isArray(json?.items) ? json.items : [];
          const tracks = items
            .map((it, idx) => {
              const videoId = (it.url || '').replace('/watch?v=', '').split('&')[0] || it.id || `piped-${idx}`;
              const streamUrl = it.streamUrl || (videoId ? `${base}/streams/${encodeURIComponent(videoId)}` : '');
              return {
                id: String(videoId),
                title: decodeHtml(it.title || 'Untitled'),
                artist: decodeHtml(it.uploaderName || it.artist || 'YouTube Music'),
                album: decodeHtml(it.album || ''),
                year: String(it.uploadedDate || '').slice(0, 4),
                language: '',
                quality: 'OPUS · YT Music',
                isPreview: false,
                duration: Number(it.duration) || 0,
                cover: it.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
                audioUrl: streamUrl,
                resolveAudio: async () => {
                  if (!videoId) return '';
                  const st = await fetchWithTimeout(`${base}/streams/${encodeURIComponent(videoId)}`, 6500);
                  const audioStreams = Array.isArray(st?.audioStreams) ? st.audioStreams : [];
                  audioStreams.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                  return audioStreams[0]?.url || '';
                },
                source: 'YT Music (Piped)',
                providerId: 'piped_ytmusic'
              };
            })
            .filter((t) => t.title && (t.audioUrl || t.resolveAudio));
          if (tracks.length > 0) return tracks;
        } catch (err) {
          console.warn(`Piped instance ${base} failed:`, err.message);
        }
      }
      return [];
    }
  },
  {
    id: 'invidious_yt',
    label: 'YouTube (Invidious)',
    badge: 'YouTube · Invidious',
    isPreview: false,
    search: async (q) => {
      for (const base of INVIDIOUS_INSTANCES) {
        try {
          const json = await fetchWithTimeout(
            `${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
            6500
          );
          const list = Array.isArray(json) ? json : [];
          const tracks = list
            .map((it, idx) => {
              const videoId = it.videoId || `inv-${idx}`;
              const thumb = Array.isArray(it.videoThumbnails) && it.videoThumbnails.length > 0
                ? (it.videoThumbnails.find((x) => x.quality === 'high')?.url || it.videoThumbnails[0].url)
                : (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
              return {
                id: String(videoId),
                title: decodeHtml(it.title || 'Untitled'),
                artist: decodeHtml(it.author || 'YouTube'),
                album: '',
                year: '',
                language: '',
                quality: 'AUDIO · Invidious',
                isPreview: false,
                duration: Number(it.lengthSeconds) || 0,
                cover: thumb.startsWith('http') ? thumb : `${base}${thumb}`,
                audioUrl: `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=251&local=true`,
                resolveAudio: async () => {
                  const vJson = await fetchWithTimeout(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`, 6500);
                  const formats = Array.isArray(vJson?.adaptiveFormats) ? vJson.adaptiveFormats : [];
                  const audioOnly = formats.filter((f) => String(f.type || '').startsWith('audio/'));
                  audioOnly.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                  return audioOnly[0]?.url || `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;
                },
                source: 'YouTube (Invidious)',
                providerId: 'invidious_yt'
              };
            })
            .filter((t) => t.title && t.id);
          if (tracks.length > 0) return tracks;
        } catch (err) {
          console.warn(`Invidious instance ${base} failed:`, err.message);
        }
      }
      return [];
    }
  },
  {
    id: 'ytdlp_audio_api',
    label: 'yt-dlp / Cobalt Audio Stream',
    badge: 'Full · yt-dlp / Cobalt',
    isPreview: false,
    search: async (q) => {
      // Use Piped / Invidious search to find video IDs and resolve direct audio stream via Cobalt / Piped / Invidious
      const searchBases = [...PIPED_INSTANCES, ...INVIDIOUS_INSTANCES];
      for (const base of PIPED_INSTANCES) {
        try {
          const json = await fetchWithTimeout(
            `${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`,
            6500
          );
          const items = Array.isArray(json?.items) ? json.items : [];
          const tracks = items
            .map((it, idx) => {
              const videoId = (it.url || '').replace('/watch?v=', '').split('&')[0] || it.id || `ytdlp-${idx}`;
              return {
                id: String(videoId),
                title: decodeHtml(it.title || 'Untitled'),
                artist: decodeHtml(it.uploaderName || it.artist || 'YouTube'),
                album: decodeHtml(it.album || ''),
                year: String(it.uploadedDate || '').slice(0, 4),
                language: '',
                quality: 'YT-DLP AUDIO',
                isPreview: false,
                duration: Number(it.duration) || 0,
                cover: it.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
                audioUrl: '',
                resolveAudio: async () => {
                  if (!videoId) return '';
                  // Try Cobalt-style API first, then Piped streams
                  try {
                    const cRes = await fetch('https://api.cobalt.tools/', {
                      method: 'POST',
                      headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
                        downloadMode: 'audio',
                        audioFormat: 'mp3'
                      })
                    });
                    if (cRes.ok) {
                      const cJson = await cRes.json();
                      if (cJson?.url) return cJson.url;
                    }
                  } catch {}
                  for (const pBase of PIPED_INSTANCES) {
                    try {
                      const st = await fetchWithTimeout(`${pBase}/streams/${encodeURIComponent(videoId)}`, 6500);
                      const audioStreams = Array.isArray(st?.audioStreams) ? st.audioStreams : [];
                      audioStreams.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                      if (audioStreams[0]?.url) return audioStreams[0].url;
                    } catch {}
                  }
                  return '';
                },
                source: 'yt-dlp Audio',
                providerId: 'ytdlp_audio_api'
              };
            })
            .filter((t) => t.title && t.id);
          if (tracks.length > 0) return tracks;
        } catch {}
      }
      return [];
    }
  },
  {
    id: 'apple_music_catalog',
    label: 'Apple Music Catalog (apple-music-downloader)',
    badge: 'Apple Music · Catalog',
    isPreview: true,
    searchUrl: (q) => `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`,
    parse: (json) => {
      const list = json?.results || [];
      return list.map((item, idx) => ({
        id: String(item.trackId || `am-${idx}`),
        title: item.trackName || 'Untitled',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || '',
        year: String(item.releaseDate || '').slice(0, 4),
        language: item.primaryGenreName || '',
        quality: 'AAC · Apple Music',
        isPreview: true,
        duration: 30,
        cover: (item.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
        audioUrl: item.previewUrl || '',
        source: 'Apple Music',
        providerId: 'apple_music_catalog'
      })).filter((t) => t.title && t.audioUrl);
    }
  },
  {
    id: 'meetube_stream',
    label: 'MeeTube Stream (yashoncode/meetube)',
    badge: 'Full · MeeTube',
    isPreview: false,
    search: async (q) => {
      // Search via Piped / Invidious music & video endpoints and resolve direct stream URLs
      for (const base of PIPED_INSTANCES) {
        try {
          const json = await fetchWithTimeout(
            `${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`,
            6500
          );
          const items = Array.isArray(json?.items) ? json.items : [];
          const tracks = items
            .map((it, idx) => {
              const videoId = (it.url || '').replace('/watch?v=', '').split('&')[0] || it.id || `mt-${idx}`;
              const directStream = it.streamUrl || '';
              return {
                id: String(videoId),
                title: decodeHtml(it.title || 'Untitled'),
                artist: decodeHtml(it.uploaderName || it.artist || 'MeeTube / YouTube'),
                album: decodeHtml(it.album || ''),
                year: String(it.uploadedDate || '').slice(0, 4),
                language: '',
                quality: 'STREAM · MeeTube',
                isPreview: false,
                duration: Number(it.duration) || 0,
                cover: it.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
                audioUrl: directStream,
                resolveAudio: async () => {
                  if (directStream) return directStream;
                  if (!videoId) return '';
                  for (const pBase of PIPED_INSTANCES) {
                    try {
                      const st = await fetchWithTimeout(`${pBase}/streams/${encodeURIComponent(videoId)}`, 6500);
                      const audioStreams = Array.isArray(st?.audioStreams) ? st.audioStreams : [];
                      audioStreams.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                      if (audioStreams[0]?.url) return audioStreams[0].url;
                    } catch {}
                  }
                  for (const iBase of INVIDIOUS_INSTANCES) {
                    try {
                      const vJson = await fetchWithTimeout(`${iBase}/api/v1/videos/${encodeURIComponent(videoId)}`, 6500);
                      const formats = Array.isArray(vJson?.adaptiveFormats) ? vJson.adaptiveFormats : [];
                      const audioOnly = formats.filter((f) => String(f.type || '').startsWith('audio/'));
                      audioOnly.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
                      if (audioOnly[0]?.url) return audioOnly[0].url;
                    } catch {}
                  }
                  return '';
                },
                source: 'MeeTube',
                providerId: 'meetube_stream'
              };
            })
            .filter((t) => t.title && t.id);
          if (tracks.length > 0) return tracks;
        } catch {}
      }
      return [];
    }
  },
  {
    id: 'monochrome',
    label: 'Monochrome Lossless',
    badge: 'Lossless · monochrome.st',
    isPreview: false,
    searchUrl: (q) => `https://tracks.monochrome.st/api/search?q=${encodeURIComponent(q)}`,
    parse: (json) => {
      const list = json?.tracks || json?.results || json?.data || (Array.isArray(json) ? json : []);
      return list.map((item, idx) => ({
        id: String(item.id || `mono-${idx}`),
        title: item.title || item.name || 'Untitled',
        artist: item.artist || item.artists?.[0]?.name || 'Unknown Artist',
        album: item.album?.title || item.album || '',
        year: String(item.year || '').slice(0, 4),
        language: item.language || '',
        quality: item.quality || 'FLAC / LOSSLESS',
        isPreview: false,
        duration: Number(item.duration) || 0,
        cover: item.cover || item.artwork || '',
        audioUrl: item.streamUrl || item.url || item.audioUrl || '',
        source: 'Monochrome',
        providerId: 'monochrome'
      })).filter((t) => t.title && t.audioUrl);
    }
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
  },
  {
    id: 'amazon_itunes',
    label: 'Amazon / iTunes Catalog (30s)',
    badge: 'Amazon / iTunes · Preview',
    isPreview: true,
    searchUrl: (q) => `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`,
    parse: (json) => {
      const list = json?.results || [];
      return list.map((item, idx) => ({
        id: String(item.trackId || `amz-${idx}`),
        title: item.trackName || 'Untitled',
        artist: item.artistName || 'Unknown Artist',
        album: item.collectionName || '',
        year: String(item.releaseDate || '').slice(0, 4),
        language: item.primaryGenreName || '',
        quality: '256K AAC · 30s',
        isPreview: true,
        duration: 30,
        cover: (item.artworkUrl100 || '').replace('100x100bb', '500x500bb'),
        audioUrl: item.previewUrl || '',
        source: 'Amazon / iTunes',
        providerId: 'amazon_itunes'
      })).filter((t) => t.title && t.audioUrl);
    }
  }
];

const FULL_PROVIDERS = PROVIDERS.filter((p) => !p.isPreview);

const RADIO_SEEDS = [
  'Bangla hits song',
  'Arijit Singh hits',
  'Tahsan Bangla song',
  'Rabindra Sangeet',
  'Atif Aslam hits',
  'Lofi chill songs',
  'Shreya Ghoshal hits'
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

const state = {
  tab: 'search',
  query: '',
  results: [],
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
  repeatMode: localStorage.getItem(STORAGE_KEYS.REPEAT_PREF) || 'queue',
  sourcePref: localStorage.getItem(STORAGE_KEYS.SOURCE_PREF) || 'auto',
  lang: localStorage.getItem(STORAGE_KEYS.LANG_PREF) || 'bn',
  speed: parseFloat(localStorage.getItem(STORAGE_KEYS.SPEED_PREF) || '1'),
  theme: localStorage.getItem(STORAGE_KEYS.THEME_PREF) || 'violet',
  activeSourceLabel: 'Auto Full Track · Multi-Provider',
  statusMessage: '',
  isLoading: false,
  settingsOpen: false,
  recoveringStream: false
};

const audio = new Audio();
audio.preload = 'auto';

function getOrderedProviders(allowPreviewInAuto = false) {
  const previewIds = ['deezer', 'amazon_itunes', 'apple_music_catalog'];
  const pool = allowPreviewInAuto || previewIds.includes(state.sourcePref) ? PROVIDERS : FULL_PROVIDERS;
  if (state.sourcePref === 'auto') return pool;
  const chosen = PROVIDERS.find((p) => p.id === state.sourcePref);
  if (!chosen) return pool;
  return [chosen, ...pool.filter((p) => p.id !== state.sourcePref)];
}

const CORS_PROXIES = [
  '',
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?'
];

async function fetchJsonDirect(url, ms = 6500) {
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

async function fetchWithTimeout(url, ms = 7000) {
  let lastErr = null;
  for (const proxy of CORS_PROXIES) {
    const targetUrl = proxy ? `${proxy}${encodeURIComponent(url)}` : url;
    try {
      return await fetchJsonDirect(targetUrl, ms);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Network request failed');
}

function buildSearchQueries(rawQuery) {
  const q = rawQuery.trim().replace(/\s+/g, ' ');
  if (q === 'বাংলা গান' || q.toLowerCase() === 'bangla song' || q.toLowerCase() === 'bangla songs') {
    return ['Bangla hits', 'Arijit Singh Bangla', 'Tahsan Bangla song', 'Rabindra Sangeet'];
  }
  return [q];
}

async function executeProviderSearch(provider, queryVariant, allowPreviewFallback) {
  if (typeof provider.search === 'function') {
    const rawTracks = await provider.search(queryVariant);
    return (rawTracks || []).filter(
      (t) => allowPreviewFallback || ['deezer', 'amazon_itunes', 'apple_music_catalog'].includes(state.sourcePref) || !t.isPreview
    );
  }
  const json = await fetchWithTimeout(provider.searchUrl(queryVariant), 7500);
  return provider.parse(json).filter(
    (t) => allowPreviewFallback || ['deezer', 'amazon_itunes', 'apple_music_catalog'].includes(state.sourcePref) || !t.isPreview
  );
}

async function fetchTracksFromProviders(rawQuery, { allowPreviewFallback = false } = {}) {
  const candidateQueries = buildSearchQueries(rawQuery);
  const orderedProviders = getOrderedProviders(allowPreviewFallback);
  const strictSingleSource = state.sourcePref !== 'auto';

  for (const queryVariant of candidateQueries) {
    for (const provider of orderedProviders) {
      try {
        const tracks = await executeProviderSearch(provider, queryVariant, allowPreviewFallback);
        if (Array.isArray(tracks) && tracks.length > 0) {
          return { tracks, provider, fallbackUsed: false };
        }
      } catch (err) {
        console.warn(`Provider ${provider.id} failed:`, err.message);
      }
      if (strictSingleSource) break;
    }
  }

  if (strictSingleSource) {
    const fallbackPool = allowPreviewFallback ? PROVIDERS : FULL_PROVIDERS;
    for (const queryVariant of candidateQueries) {
      for (const provider of fallbackPool) {
        if (provider.id === state.sourcePref) continue;
        try {
          const tracks = await executeProviderSearch(provider, queryVariant, allowPreviewFallback);
          if (Array.isArray(tracks) && tracks.length > 0) {
            return { tracks, provider, fallbackUsed: true };
          }
        } catch (err) {
          console.warn(`Fallback provider ${provider.id} failed:`, err.message);
        }
      }
    }
  }

  return null;
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

  const provider = PROVIDERS.find((p) => p.id === track.providerId);
  if (provider && provider.lyricsUrl && track.id) {
    try {
      const lJson = await fetchWithTimeout(provider.lyricsUrl(track.id), 4500);
      const rawLyrics = lJson?.data?.lyrics || lJson?.lyrics || '';
      const cleaned = cleanLyricsText(rawLyrics);
      if (cleaned) {
        state.lyricsText = cleaned;
        state.lyricsLoading = false;
        renderPlayerBar();
        return;
      }
    } catch {}
  }

  try {
    const artistParam = track.artist && track.artist !== 'Unknown Artist'
      ? `&artist_name=${encodeURIComponent(track.artist.split(',')[0].trim())}`
      : '';
    const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(track.title)}${artistParam}`;
    const lrc = await fetchWithTimeout(lrclibUrl, 4500);
    const cleaned = cleanLyricsText(lrc?.plainLyrics || lrc?.syncedLyrics || '');
    if (cleaned) {
      state.lyricsText = cleaned;
      state.lyricsLoading = false;
      renderPlayerBar();
      return;
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
  state.statusMessage = state.lang === 'bn' ? 'সোর্সগুলো থেকে গান খোঁজা হচ্ছে...' : 'Searching music sources...';
  render();

  const found = await fetchTracksFromProviders(q, { allowPreviewFallback: ['deezer', 'amazon_itunes', 'apple_music_catalog'].includes(state.sourcePref) });
  if (found) {
    state.results = found.tracks;
    state.activeSourceLabel = found.provider.badge;
    if (state.lang === 'bn') {
      state.statusMessage = found.fallbackUsed
        ? `নির্বাচিত সোর্সে ফলাফল না থাকায় ${found.provider.label} থেকে ${found.tracks.length}টি গান দেখানো হচ্ছে`
        : `${found.tracks.length}টি গান পাওয়া গেছে · ${found.provider.label}`;
    } else {
      state.statusMessage = found.fallbackUsed
        ? `Fallback to ${found.provider.label}: ${found.tracks.length} tracks found`
        : `${found.tracks.length} tracks found · ${found.provider.label}`;
    }
    state.isLoading = false;
    render();
    return;
  }

  state.results = [];
  state.isLoading = false;
  state.statusMessage =
    state.lang === 'bn'
      ? 'বর্তমানে কোনো সোর্স থেকে গান পাওয়া যায়নি। ইন্টারনেট সংযোগ বা VPN/DNS চেক করে অন্য শব্দ দিয়ে সার্চ করুন।'
      : 'No tracks returned from sources right now. Check your connection or try another search term.';
  render();
}

async function appendRadioTracks(seedTrack) {
  const existingKeys = new Set(state.queue.map((t) => `${t.source}:${t.id}:${t.title}`));
  const artistName = seedTrack?.artist && seedTrack.artist !== 'Unknown Artist'
    ? seedTrack.artist.split(',')[0].trim()
    : '';
  const seeds = artistName
    ? [`${artistName} songs`, ...RADIO_SEEDS]
    : [...RADIO_SEEDS];

  for (const seed of seeds) {
    const found = await fetchTracksFromProviders(seed, { allowPreviewFallback: false });
    if (found && found.tracks.length > 0) {
      const fresh = found.tracks.filter((t) => {
        const key = `${t.source}:${t.id}:${t.title}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      if (fresh.length > 0) {
        state.queue = [...state.queue, ...fresh.slice(0, 12)];
        return true;
      }
    }
  }
  return false;
}

async function attachAudioSource(track, resumeAtSec = 0) {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();

  let streamUrl = track.audioUrl || '';
  if (typeof track.resolveAudio === 'function') {
    try {
      const resolved = await track.resolveAudio();
      if (resolved) {
        streamUrl = resolved;
        track.audioUrl = resolved;
      }
    } catch (err) {
      console.warn('Stream resolver failed, using fallback URL:', err.message);
    }
  }

  if (!streamUrl) {
    state.isPlaying = false;
    renderPlayerBar();
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

function playTrack(track, listContext = null, { keepQueue = false } = {}) {
  if (!track || (!track.audioUrl && typeof track.resolveAudio !== 'function')) return;

  if (!keepQueue) {
    if (Array.isArray(listContext) && listContext.length > 0) {
      state.queue = listContext.filter((t) => Boolean(t.audioUrl || typeof t.resolveAudio === 'function'));
      state.currentIndex = state.queue.findIndex((t) => t.id === track.id && t.source === track.source);
      if (state.currentIndex === -1) {
        state.queue.unshift(track);
        state.currentIndex = 0;
      }
    } else if (state.queue.length === 0) {
      state.queue = [track];
      state.currentIndex = 0;
    }
  }

  const activeTrack = state.queue[state.currentIndex] || track;
  state.recoveringStream = false;
  attachAudioSource(activeTrack, 0);
  loadLyricsForTrack(activeTrack);

  if (state.autoRadio && state.currentIndex >= state.queue.length - 2) {
    appendRadioTracks(activeTrack).then((added) => {
      if (added && state.tab === 'queue') render();
    });
  }

  const filteredRecent = state.recent.filter((item) => !(item.id === activeTrack.id && item.source === activeTrack.source));
  state.recent = [activeTrack, ...filteredRecent].slice(0, 40);
  saveJson(STORAGE_KEYS.RECENT, state.recent);

  state.isPlaying = true;
  render();
}

function togglePlayPause(e) {
  if (e) e.stopPropagation();
  if (!audio.src) {
    if (state.results.length > 0) playTrack(state.results[0], state.results);
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

async function playNext(e, fromEnded = false) {
  if (e) e.stopPropagation();
  if (state.queue.length === 0) return;

  if (fromEnded && state.repeatMode === 'one' && state.currentIndex >= 0) {
    playTrack(state.queue[state.currentIndex], state.queue, { keepQueue: true });
    return;
  }

  if (state.shuffle && state.queue.length > 1) {
    let randIdx = Math.floor(Math.random() * state.queue.length);
    if (randIdx === state.currentIndex) {
      randIdx = (state.currentIndex + 1) % state.queue.length;
    }
    state.currentIndex = randIdx;
    playTrack(state.queue[randIdx], state.queue, { keepQueue: true });
    return;
  }

  const nextIdx = state.currentIndex + 1;
  if (nextIdx < state.queue.length) {
    state.currentIndex = nextIdx;
    playTrack(state.queue[nextIdx], state.queue, { keepQueue: true });
    return;
  }

  if (state.autoRadio) {
    const currentTrack = state.queue[state.currentIndex];
    const added = await appendRadioTracks(currentTrack);
    if (added && nextIdx < state.queue.length) {
      state.currentIndex = nextIdx;
      playTrack(state.queue[nextIdx], state.queue, { keepQueue: true });
      return;
    }
  }

  state.currentIndex = 0;
  playTrack(state.queue[0], state.queue, { keepQueue: true });
}

function playPrev(e) {
  if (e) e.stopPropagation();
  if (state.queue.length === 0) return;
  const prevIdx = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  state.currentIndex = prevIdx;
  playTrack(state.queue[prevIdx], state.queue, { keepQueue: true });
}

function toggleFavorite(track, event) {
  if (event) event.stopPropagation();
  const exists = state.favorites.some((f) => f.id === track.id && f.source === track.source);
  state.favorites = exists
    ? state.favorites.filter((f) => !(f.id === track.id && f.source === track.source))
    : [track, ...state.favorites];
  saveJson(STORAGE_KEYS.FAVORITES, state.favorites);
  render();
}

function isFavorite(track) {
  return state.favorites.some((f) => f.id === track.id && f.source === track.source);
}

async function recoverDroppedStream() {
  const current = getCurrentTrack();
  if (!current || state.recoveringStream) return;
  state.recoveringStream = true;
  const savedTime = audio.currentTime > 1 ? audio.currentTime : 0;

  try {
    const found = await fetchTracksFromProviders(`${current.title} ${current.artist}`, { allowPreviewFallback: false });
    if (found && found.tracks.length > 0) {
      const match =
        found.tracks.find((t) => t.title.toLowerCase() === current.title.toLowerCase()) ||
        found.tracks[0];
      if (match && (match.audioUrl || typeof match.resolveAudio === 'function')) {
        current.audioUrl = match.audioUrl;
        current.resolveAudio = match.resolveAudio;
        current.source = match.source;
        current.quality = match.quality || current.quality;
        attachAudioSource(current, savedTime);
        return;
      }
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
  const nextIdx = (state.currentIndex + 1) % state.queue.length;
  return state.queue[nextIdx] || null;
}

function buildCodecSpec(track) {
  const q = String(track?.quality || '').toUpperCase();
  if (q.includes('FLAC') || q.includes('LOSSLESS')) {
    return { codec: 'FLAC', detail: 'Lossless · 48 kHz · Stereo' };
  }
  if (q.includes('OPUS') || track?.providerId === 'piped_ytmusic' || track?.providerId === 'jiosaavn_sumit') {
    return { codec: 'OPUS', detail: '135 kbps · 48 kHz · Stereo' };
  }
  if (q.includes('320')) {
    return { codec: 'AAC', detail: '320 kbps · 44.1 kHz · Stereo' };
  }
  if (q.includes('256')) {
    return { codec: 'AAC', detail: '256 kbps · 44.1 kHz · Stereo' };
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

  if (state.playerExpanded) {
    const infoPills = [
      track.quality ? `<span class="info-pill">🎧 ${escapeHtml(track.quality)}</span>` : '',
      track.source ? `<span class="info-pill">📡 ${escapeHtml(track.source)}</span>` : '',
      track.album ? `<span class="info-pill">💿 ${escapeHtml(track.album)}</span>` : '',
      track.year ? `<span class="info-pill">📅 ${escapeHtml(track.year)}</span>` : '',
      track.language ? `<span class="info-pill">🌐 ${escapeHtml(track.language)}</span>` : ''
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
          <button class="ctrl-btn mode-btn ${state.shuffle ? 'active' : ''}" id="gw-shuffle-btn" title="Shuffle">🔀 <span>${isBn ? (state.shuffle ? 'শাফল অন' : 'শাফল') : (state.shuffle ? 'Shuffle ON' : 'Shuffle')}</span></button>
          <button class="ctrl-btn big" id="gw-prev-btn">⏮</button>
          <button class="ctrl-btn big primary" id="gw-play-btn">${state.isPlaying ? '❚❚' : '▶'}</button>
          <button class="ctrl-btn big" id="gw-next-btn">⏭</button>
          <button class="ctrl-btn mode-btn ${state.repeatMode === 'one' ? 'active' : ''}" id="gw-repeat-btn" title="Repeat One">🔂 <span>${isBn ? (state.repeatMode === 'one' ? 'রিপিট ১' : 'রিপিট') : (state.repeatMode === 'one' ? 'Repeat 1' : 'Repeat')}</span></button>
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
          ${isBn ? 'এরপর বাজবে' : 'Up next'}: <strong>${escapeHtml(nextTrack ? `${nextTrack.title} — ${nextTrack.artist}` : (state.autoRadio ? 'অটো রেডিও লোড হচ্ছে...' : 'কিউ শেষ'))}</strong>
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
    document.getElementById('gw-shuffle-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.shuffle = !state.shuffle;
      localStorage.setItem(STORAGE_KEYS.SHUFFLE_PREF, String(state.shuffle));
      renderPlayerBar();
    });
    document.getElementById('gw-repeat-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.repeatMode = state.repeatMode === 'one' ? 'queue' : 'one';
      localStorage.setItem(STORAGE_KEYS.REPEAT_PREF, state.repeatMode);
      renderPlayerBar();
    });
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
          <button class="ctrl-btn primary" id="gw-play-btn">${state.isPlaying ? '❚❚' : '▶'}</button>
          <button class="ctrl-btn" id="gw-next-btn">⏭</button>
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
    document.getElementById('gw-play-btn')?.addEventListener('click', togglePlayPause);
    document.getElementById('gw-next-btn')?.addEventListener('click', (e) => playNext(e, false));
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
  if (state.tab === 'search') return state.results;
  if (state.tab === 'recent') return state.recent;
  if (state.tab === 'favorites') return state.favorites;
  if (state.tab === 'playlists') return state.recent.slice(0, 15);
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
        const active = current && current.id === track.id && current.source === track.source;
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
    searchPlaceholder: isBn ? 'বাংলা গান বা শিল্পীর নাম লিখুন...' : 'Search songs or artists...',
    searchResults: isBn ? 'সার্চ রেজাল্ট' : 'Search Results',
    emptySearchTitle: isBn ? 'গান খুঁজে বের করুন' : 'Search to find songs',
    emptySearchSub: state.activeSourceLabel,
    recent: isBn ? 'সাম্প্রতিক' : 'Recent',
    favorites: isBn ? 'প্রিয়' : 'Favorites',
    playlists: isBn ? 'প্লেলিস্ট' : 'Playlists',
    queue: isBn ? 'কিউ' : 'Queue',
    searchTab: isBn ? 'সার্চ' : 'Search'
  };

  const quickMoods = [
    { label: 'All', query: 'Bangla hits' },
    { label: 'Energize', query: 'Bollywood dance hits' },
    { label: 'Feel good', query: 'Arijit Singh hits' },
    { label: 'Relax', query: 'Rabindra Sangeet' },
    { label: 'Workout', query: 'Tahsan hits' }
  ];

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
        ${quickMoods.map((m) => {
          const isActive = state.query.toLowerCase() === m.query.toLowerCase();
          return `<button type="button" class="chip ${isActive ? 'active' : ''}" data-quick="${escapeAttr(m.query)}">${escapeHtml(m.label)}</button>`;
        }).join('')}
      </div>

      <div class="section-label">
        <span>${labels.searchResults}</span>
        ${state.results.length > 0 ? `<button type="button" class="chip" id="gw-play-all-btn">${isBn ? '▶ সব একসাথে প্লে' : '▶ Play All'}</button>` : ''}
      </div>
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
            <label>${isBn ? 'অটো রেডিও / একের পর এক গান' : 'Continuous Autoplay / Radio'}</label>
            <select id="gw-autoradio-select">
              <option value="true" ${state.autoRadio ? 'selected' : ''}>${isBn ? 'চালু (গান শেষ হলে অটো নতুন গান আসবে)' : 'On (Continuous next tracks)'}</option>
              <option value="false" ${!state.autoRadio ? 'selected' : ''}>${isBn ? 'বন্ধ (শুধু বর্তমান কিউ ঘুরবে)' : 'Off (Current queue only)'}</option>
            </select>
          </div>
          <div class="setting-row">
            <label>${isBn ? 'মিউজিক সোর্স (Fallback)' : 'Music Source'}</label>
            <select id="gw-source-select">
              <option value="auto" ${state.sourcePref === 'auto' ? 'selected' : ''}>${isBn ? 'অটো ফলব্যাক (শুধু পূর্ণাঙ্গ গান)' : 'Auto Fallback (Full Tracks Only)'}</option>
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

  document.getElementById('gw-search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('gw-search-input');
    if (input) runSearch(input.value);
  });

  document.getElementById('gw-play-all-btn')?.addEventListener('click', () => {
    if (state.results.length > 0) {
      playTrack(state.results[0], state.results);
    }
  });

  document.getElementById('gw-radio-pill')?.addEventListener('click', () => {
    state.autoRadio = !state.autoRadio;
    localStorage.setItem(STORAGE_KEYS.AUTO_RADIO_PREF, String(state.autoRadio));
    render();
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
  if (state.tab === 'search' && !state.query && state.results.length === 0) {
    state.query = 'Bangla hits';
    runSearch('Bangla hits');
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  }
});
