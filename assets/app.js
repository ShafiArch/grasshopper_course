/*
  Grasshopper Workshop course site.
  Plain JavaScript with no build step. Course content comes from course.js.
  Each learner's progress is stored in their own browser with localStorage.
*/
(() => {
  'use strict';

  const COURSE = window.COURSE;
  const app = document.getElementById('app');

  if (!COURSE || !Array.isArray(COURSE.modules)) {
    app.innerHTML =
      '<div class="wrap empty-state"><h1>The course could not load</h1>' +
      '<p>course.js is missing or has a mistake in it. Check that it sits next to index.html.</p></div>';
    return;
  }

  /* ==================================================================
     Settings
  ================================================================== */

  const COURSE_ID = COURSE.id || 'grasshopper_course';
  const STORE_KEY = COURSE_ID + ':progress:v1';
  const THEME_KEY = 'grasshopper_course:theme';
  const COMPLETE_AT = 0.9;      // share of a video watched that completes a lesson
  const AUTOPLAY_SECONDS = 5;   // countdown before the next lesson starts

  /* ==================================================================
     Helpers
  ================================================================== */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round1 = (n) => Math.round(n * 10) / 10;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const thumb = (vid, size) => 'https://i.ytimg.com/vi/' + encodeURIComponent(vid) + '/' + (size || 'mq') + 'default.jpg';
  const watchUrl = (vid) => 'https://www.youtube.com/watch?v=' + encodeURIComponent(vid);
  const lessonHref = (l) => '#/lesson/' + encodeURIComponent(l.id);

  function youtubeId(value) {
    const s = String(value || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1, 12);
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    } catch (e) { /* not a URL */ }
    return '';
  }

  function toSeconds(value) {
    if (typeof value === 'number') return value > 0 ? Math.round(value) : 0;
    const s = String(value || '').trim();
    if (!s) return 0;
    const parts = s.split(':').map(Number);
    if (parts.some((p) => !isFinite(p) || p < 0)) return 0;
    return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
  }

  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
  }

  function humanTime(sec) {
    sec = Math.round(sec || 0);
    if (sec <= 0) return '0 min';
    if (sec < 60) return 'under 1 min';
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    if (!h) return m + ' min';
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function relativeDay(key) {
    const today = dayKey();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (key === today) return 'Today';
    if (key === dayKey(y)) return 'Yesterday';
    return formatDate(key + 'T12:00:00');
  }

  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.3 4.3L19 7.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    left: '<path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    right: '<path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.4 5.4L7 7M17 17l1.6 1.6M5.4 18.6L7 17M17 7l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    download: '<path d="M12 4v10.5m0 0L7.8 10.3M12 14.5l4.2-4.2M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    upload: '<path d="M12 15V4.5m0 0L7.8 8.7M12 4.5l4.2 4.2M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    trash: '<path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12.2h8.4L17 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    external: '<path d="M14 5h5v5M19 5l-8.5 8.5M17.5 13.5V19h-12V7h5.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    replay: '<path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3M4.6 4.6v3.8h3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const icon = (name) => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';

  /* ==================================================================
     Course model: modules and lessons with automatic numbering
  ================================================================== */

  const modules = [];
  const lessons = [];

  COURSE.modules.forEach((m, mi) => {
    const mod = {
      id: String(m.id || 'module-' + (mi + 1)),
      number: mi + 1,
      title: m.title || 'Module ' + (mi + 1),
      summary: m.summary || '',
      lessons: []
    };
    (m.lessons || []).forEach((raw) => {
      const vid = youtubeId(raw.youtube);
      if (!vid) return;
      const number = mod.number + '.' + (mod.lessons.length + 1);
      const lesson = {
        id: String(raw.id || number.replace('.', '-')),
        vid: vid,
        number: number,
        module: mod,
        index: lessons.length,
        title: raw.title || 'Lesson ' + number,
        short: raw.short || raw.title || 'Lesson ' + number,
        summary: raw.summary || '',
        duration: toSeconds(raw.duration),
        resources: (Array.isArray(raw.resources) ? raw.resources : [])
          .filter((r) => r && safeUrl(r.url))
          .map((r) => ({ label: r.label || r.url, url: safeUrl(r.url) }))
      };
      mod.lessons.push(lesson);
      lessons.push(lesson);
    });
    modules.push(mod);
  });

  const byId = new Map();
  lessons.forEach((l) => {
    let id = l.id;
    let n = 2;
    while (byId.has(id)) id = l.id + '-' + n++;
    l.id = id;
    byId.set(id, l);
  });
  const byVid = new Map(lessons.map((l) => [l.vid, l]));

  if (!lessons.length) {
    app.innerHTML = '<div class="wrap empty-state"><h1>No lessons yet</h1><p>Add lessons to course.js to fill this page.</p></div>';
    return;
  }

  /* ==================================================================
     Progress store (localStorage)
  ================================================================== */

  const storage = (() => {
    try {
      const k = '__probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) {
      return null;
    }
  })();

  const blankState = () => ({ version: 1, lessons: {}, lastLesson: null, activity: {}, settings: { autoplay: true, rate: 1 } });
  const blankRecord = () => ({ completed: false, completedAt: null, position: 0, duration: 0, watched: [], seconds: 0, lastOpened: null, notes: [] });
  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);

  function cleanRecord(r) {
    const b = blankRecord();
    if (!r || typeof r !== 'object') return b;
    b.completed = r.completed === true;
    b.completedAt = typeof r.completedAt === 'string' ? r.completedAt : null;
    b.position = num(r.position);
    b.duration = num(r.duration);
    b.watched = Array.isArray(r.watched)
      ? r.watched.filter((iv) => Array.isArray(iv) && num(iv[1]) > num(iv[0])).map((iv) => [num(iv[0]), num(iv[1])])
      : [];
    b.seconds = num(r.seconds);
    b.lastOpened = typeof r.lastOpened === 'string' ? r.lastOpened : null;
    b.notes = Array.isArray(r.notes)
      ? r.notes.filter((n) => n && typeof n.text === 'string' && n.text.trim()).map((n) => ({
          id: String(n.id || uid()),
          t: typeof n.t === 'number' && n.t >= 0 ? n.t : null,
          text: n.text,
          at: typeof n.at === 'string' ? n.at : new Date().toISOString()
        }))
      : [];
    return b;
  }

  function cleanState(s) {
    const b = blankState();
    if (!s || typeof s !== 'object') return b;
    if (s.lessons && typeof s.lessons === 'object') {
      Object.keys(s.lessons).forEach((k) => { b.lessons[k] = cleanRecord(s.lessons[k]); });
    }
    b.lastLesson = typeof s.lastLesson === 'string' ? s.lastLesson : null;
    if (s.activity && typeof s.activity === 'object') {
      Object.keys(s.activity).forEach((k) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) {
          const a = s.activity[k] || {};
          b.activity[k] = { s: num(a.s), c: num(a.c) };
        }
      });
    }
    if (s.settings && typeof s.settings === 'object') {
      if (typeof s.settings.autoplay === 'boolean') b.settings.autoplay = s.settings.autoplay;
      const rate = num(s.settings.rate);
      if (rate >= 0.25 && rate <= 2) b.settings.rate = rate;
    }
    return b;
  }

  function readState() {
    if (!storage) return blankState();
    try {
      return cleanState(JSON.parse(storage.getItem(STORE_KEY) || 'null'));
    } catch (e) {
      return blankState();
    }
  }

  let state = readState();
  let saveTimer = null;

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!storage) return;
    try { storage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }

  function saveSoon() {
    if (!saveTimer) saveTimer = setTimeout(saveNow, 4000);
  }

  /* ==================================================================
     Progress queries
  ================================================================== */

  const rec = (l) => state.lessons[l.vid] || null;
  const recordFor = (l) => state.lessons[l.vid] || (state.lessons[l.vid] = blankRecord());
  const isDone = (l) => !!(rec(l) && rec(l).completed);
  const durationOf = (l) => l.duration || (rec(l) && rec(l).duration) || 0;
  const watchedSeconds = (r) => (r ? r.watched.reduce((sum, iv) => sum + Math.max(0, iv[1] - iv[0]), 0) : 0);
  const doneCount = () => lessons.filter(isDone).length;
  const totalSeconds = () => lessons.reduce((sum, l) => sum + ((rec(l) && rec(l).seconds) || 0), 0);

  function watchedFraction(l) {
    const r = rec(l);
    const d = durationOf(l);
    if (!r || !d) return 0;
    return clamp(watchedSeconds(r) / d, 0, 1);
  }

  function statusOf(l) {
    const r = rec(l);
    if (!r) return 'new';
    if (r.completed) return 'done';
    if (r.position > 5 || watchedSeconds(r) > 5) return 'started';
    return 'new';
  }

  function resumePoint(l) {
    const r = rec(l);
    if (!r || r.position < 15) return 0;
    const d = durationOf(l);
    if (d && r.position > d - Math.min(20, d * 0.05)) return 0;
    return Math.floor(r.position);
  }

  function nextUp() {
    const last = state.lastLesson ? byVid.get(state.lastLesson) : null;
    if (last && !isDone(last)) return last;
    const start = last ? last.index + 1 : 0;
    for (let i = start; i < lessons.length; i++) if (!isDone(lessons[i])) return lessons[i];
    for (let i = 0; i < start; i++) if (!isDone(lessons[i])) return lessons[i];
    return null;
  }

  function mergeInterval(list, s, e) {
    s = Math.max(0, Math.floor(s * 10) / 10);
    e = Math.ceil(e * 10) / 10;
    if (!(e > s)) return list;
    const all = list.concat([[s, e]]).sort((a, b) => a[0] - b[0]);
    const out = [];
    all.forEach((iv) => {
      const last = out[out.length - 1];
      if (last && iv[0] <= last[1] + 1) last[1] = Math.max(last[1], iv[1]);
      else out.push([iv[0], iv[1]]);
    });
    return out;
  }

  function logActivity(seconds, completions) {
    const k = dayKey();
    const a = state.activity[k] || (state.activity[k] = { s: 0, c: 0 });
    a.s = round1(a.s + (seconds || 0));
    a.c += completions || 0;
  }

  const isActiveDay = (a) => !!a && (a.s >= 60 || a.c > 0);

  function streaks() {
    const d = new Date();
    if (!isActiveDay(state.activity[dayKey(d)])) d.setDate(d.getDate() - 1);
    let current = 0;
    while (isActiveDay(state.activity[dayKey(d)])) {
      current++;
      d.setDate(d.getDate() - 1);
    }
    const days = Object.keys(state.activity).filter((k) => isActiveDay(state.activity[k])).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    days.forEach((k) => {
      const dt = new Date(k + 'T12:00:00');
      run = prev && Math.round((dt - prev) / 86400000) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = dt;
    });
    const last = days.length ? days[days.length - 1] : null;
    return { current: current, best: Math.max(best, current), last: last, activeDays: days.length };
  }

  function statusText(l) {
    const r = rec(l);
    const st = statusOf(l);
    if (st === 'done') return r.completedAt ? 'Completed ' + formatDate(r.completedAt) : 'Completed';
    if (st === 'started') {
      const f = watchedFraction(l);
      return f > 0 ? Math.round(f * 100) + '% watched' : 'Stopped at ' + clock(r.position);
    }
    return 'Not started';
  }

  function swatch(l) {
    const st = statusOf(l);
    const f = st === 'done' ? 1 : watchedFraction(l);
    return '<span class="swatch swatch--' + st + '" style="--p:' + f.toFixed(3) + '" aria-hidden="true">' +
      (st === 'done' ? icon('check') : '') + '</span>';
  }

  function setComplete(l, done, opts) {
    opts = opts || {};
    const r = recordFor(l);
    if (r.completed === done) return;
    r.completed = done;
    r.completedAt = done ? new Date().toISOString() : null;
    if (done) logActivity(0, 1);
    saveNow();
    refresh();
    if (done && lessons.every(isDone)) {
      toast('Course complete. You finished all ' + plural(lessons.length, 'lesson') + '.', null, 6000);
    } else if (!opts.silent) {
      toast(done ? (opts.auto ? 'Lesson ' + l.number + ' complete' : 'Lesson ' + l.number + ' marked complete') : 'Lesson ' + l.number + ' marked not complete');
    }
  }

  /* ==================================================================
     Toasts and dialogs
  ================================================================== */

  function toast(message, action, ms) {
    const region = $('#toasts');
    if (!region) return;
    while (region.children.length > 2) region.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>' + esc(message) + '</span>';
    let timer = null;
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    };
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.run(); dismiss(); });
      el.appendChild(b);
    }
    region.appendChild(el);
    timer = setTimeout(dismiss, ms || (action ? 7000 : 3500));
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const d = $('#dialog');
      if (!d || typeof d.showModal !== 'function') {
        resolve(window.confirm(opts.title + '\n\n' + opts.body));
        return;
      }
      d.innerHTML =
        '<form method="dialog" class="dialog-body">' +
        '<h2>' + esc(opts.title) + '</h2><p>' + esc(opts.body) + '</p>' +
        '<div class="dialog-actions">' +
        '<button class="btn btn-quiet" value="cancel">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" value="ok">' + esc(opts.confirm) + '</button>' +
        '</div></form>';
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
      const cancel = $('button[value="cancel"]', d);
      if (cancel) cancel.focus();
    });
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* ==================================================================
     YouTube player with watch tracking
  ================================================================== */

  const Player = (() => {
    let apiPromise = null;
    let yt = null;
    let ready = false;
    let lesson = null;
    let host = null;
    let timer = null;
    let lastPos = null;
    let lastWall = 0;
    let countdown = null;
    let pendingSeek = null;

    function api() {
      if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
      if (apiPromise) return apiPromise;
      apiPromise = new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (typeof previous === 'function') { try { previous(); } catch (e) { /* ignore */ } }
          resolve(window.YT);
        };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        s.onerror = () => reject(new Error('blocked'));
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('timeout')), 15000);
      });
      apiPromise.catch(() => { apiPromise = null; });
      return apiPromise;
    }

    const overlay = () => (host ? $('.player-overlay', host) : null);
    const time = () => { try { return (yt && ready && yt.getCurrentTime()) || 0; } catch (e) { return 0; } };
    const rate = () => { try { return (yt && yt.getPlaybackRate()) || 1; } catch (e) { return 1; } };
    const playing = () => timer !== null;

    function mount(frame, l, opts) {
      opts = opts || {};
      destroy();
      host = frame;
      lesson = l;
      const start = resumePoint(l);
      frame.innerHTML =
        '<div class="player-poster"><img src="' + thumb(l.vid, 'hq') + '" alt=""></div>' +
        '<div class="player-target"></div>' +
        '<div class="player-overlay" hidden></div>';
      const target = $('.player-target', frame);
      api().then((YT) => {
        if (host !== frame || lesson !== l || !frame.isConnected) return;
        const vars = { rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 };
        if (start) vars.start = start;
        if (opts.autoplay) vars.autoplay = 1;
        if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
        yt = new YT.Player(target, {
          videoId: l.vid,
          width: '100%',
          height: '100%',
          playerVars: vars,
          events: {
            onReady: onReady,
            onStateChange: onStateChange,
            onError: onError,
            onPlaybackRateChange: onRateChange
          }
        });
      }).catch(() => {
        if (host === frame && lesson === l) showFallback(l, 'load');
      });
      if (start) resumeToast(l, start);
    }

    function load(l, opts) {
      opts = opts || {};
      tick();
      stop();
      saveNow();
      hideOverlay();
      if (!yt || !ready || !host || !host.isConnected) {
        mount(host || $('#player-frame'), l, opts);
        return;
      }
      lesson = l;
      const start = resumePoint(l);
      try {
        if (opts.autoplay) yt.loadVideoById({ videoId: l.vid, startSeconds: start });
        else yt.cueVideoById({ videoId: l.vid, startSeconds: start });
      } catch (e) {
        mount(host, l, opts);
        return;
      }
      if (start) resumeToast(l, start);
    }

    function destroy() {
      const wasPlaying = playing();
      tick();
      stop();
      cancelCountdown();
      if (wasPlaying || saveTimer) saveNow();
      if (yt) { try { yt.destroy(); } catch (e) { /* ignore */ } }
      yt = null;
      ready = false;
      lesson = null;
      host = null;
      pendingSeek = null;
    }

    function onReady() {
      ready = true;
      const poster = host && $('.player-poster', host);
      if (poster) poster.remove();
      applyRate();
      captureDuration();
      if (pendingSeek !== null) { seek(pendingSeek); pendingSeek = null; }
      updateLiveTime();
    }

    function onStateChange(e) {
      const S = (window.YT && window.YT.PlayerState) || { PLAYING: 1, ENDED: 0 };
      if (e.data === S.PLAYING) {
        hideOverlay();
        applyRate();
        captureDuration();
        start();
      } else {
        tick();
        stop();
        if (e.data === S.ENDED) ended();
        saveNow();
      }
      updateLiveTime();
    }

    function onError(e) {
      tick();
      stop();
      showFallback(lesson, e && e.data);
    }

    function onRateChange(e) {
      const r = Number(e && e.data);
      if (r >= 0.25 && r <= 2) { state.settings.rate = r; saveSoon(); }
    }

    function applyRate() {
      const want = state.settings.rate || 1;
      try { if (yt && yt.getPlaybackRate() !== want) yt.setPlaybackRate(want); } catch (e) { /* ignore */ }
    }

    function captureDuration() {
      if (!yt || !ready || !lesson) return;
      let d = 0;
      let id = '';
      try {
        d = yt.getDuration() || 0;
        id = (yt.getVideoData && yt.getVideoData().video_id) || '';
      } catch (e) { return; }
      if (d <= 1 || (id && id !== lesson.vid)) return;
      const r = recordFor(lesson);
      const rd = Math.round(d);
      if (r.duration !== rd) {
        r.duration = rd;
        saveSoon();
        onLessonTick(lesson, true);
      }
    }

    function start() {
      lastPos = time();
      lastWall = performance.now();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
      lastPos = null;
    }

    function tick() {
      if (!yt || !ready || !lesson || lastPos === null) return;
      const pos = time();
      const now = performance.now();
      const dt = Math.min((now - lastWall) / 1000, 5);
      const r = recordFor(lesson);
      const moved = pos - lastPos;
      if (moved > 0 && moved <= dt * rate() + 1.5) r.watched = mergeInterval(r.watched, lastPos, pos);
      if (dt > 0) {
        r.seconds = round1(r.seconds + dt);
        logActivity(dt, 0);
      }
      r.position = round1(pos);
      lastPos = pos;
      lastWall = now;
      captureDuration();
      const d = durationOf(lesson);
      if (!r.completed && d > 0 && watchedSeconds(r) / d >= COMPLETE_AT) {
        setComplete(lesson, true, { auto: true });
      }
      onLessonTick(lesson, false);
      updateLiveTime();
      saveSoon();
    }

    function ended() {
      const l = lesson;
      if (!l) return;
      const r = recordFor(l);
      r.position = 0;
      if (!r.completed) setComplete(l, true, { auto: true });
      showUpNext(l);
    }

    function seek(t) {
      if (!yt || !ready) { pendingSeek = t; return; }
      try {
        yt.seekTo(Math.max(0, t), true);
        yt.playVideo();
      } catch (e) { /* ignore */ }
    }

    function toggle() {
      if (!yt || !ready) return;
      try {
        if (yt.getPlayerState() === 1) yt.pauseVideo();
        else yt.playVideo();
      } catch (e) { /* ignore */ }
    }

    function resumeToast(l, at) {
      toast('Resuming lesson ' + l.number + ' at ' + clock(at), {
        label: 'Start over',
        run: () => {
          if (lesson !== l) return;
          recordFor(l).position = 0;
          seek(0);
        }
      });
    }

    function hideOverlay() {
      cancelCountdown();
      const ov = overlay();
      if (ov) { ov.hidden = true; ov.innerHTML = ''; }
    }

    function showFallback(l, code) {
      const ov = overlay();
      if (!ov || !l) return;
      const msg = code === 101 || code === 150
        ? 'This video can only be played on YouTube.'
        : code === 100
          ? 'This video is private or has been removed.'
          : 'The video player could not load here.';
      ov.innerHTML =
        '<div class="overlay-box"><p class="overlay-title">' + esc(msg) + '</p>' +
        '<p>Watch the lesson on YouTube, then mark it complete here.</p>' +
        '<div class="overlay-actions">' +
        '<a class="btn btn-primary" href="' + watchUrl(l.vid) + '" target="_blank" rel="noopener">' + icon('external') + ' Watch on YouTube</a>' +
        (code === 'load' ? '<button class="btn" type="button" data-action="retry-player">Try again</button>' : '') +
        '</div></div>';
      ov.hidden = false;
    }

    function showUpNext(l) {
      const ov = overlay();
      if (!ov) return;
      const next = lessons[l.index + 1];
      if (!next) {
        ov.innerHTML =
          '<div class="overlay-box"><p class="overlay-title">' +
          (lessons.every(isDone) ? 'You finished the course' : 'That was the last lesson') + '</p>' +
          '<div class="overlay-actions">' +
          '<a class="btn btn-primary" href="#/progress">See my progress</a>' +
          '<button class="btn" type="button" data-action="replay">' + icon('replay') + ' Watch again</button>' +
          '</div></div>';
      } else {
        ov.innerHTML =
          '<div class="overlay-box"><p class="overlay-kicker">Up next</p>' +
          '<p class="overlay-title">' + next.number + ' ' + esc(next.title) + '</p>' +
          '<div class="overlay-actions">' +
          '<button class="btn btn-primary" type="button" data-action="play-next">' + icon('play') + ' Play next lesson</button>' +
          '<button class="btn" type="button" data-action="replay">' + icon('replay') + ' Watch again</button>' +
          '</div>' +
          (state.settings.autoplay
            ? '<p class="overlay-count">Starting in <span data-count>' + AUTOPLAY_SECONDS + '</span> seconds. ' +
              '<button class="link-btn" type="button" data-action="cancel-autoplay">Cancel</button></p>'
            : '') +
          '</div>';
        if (state.settings.autoplay) startCountdown(next);
      }
      ov.hidden = false;
    }

    function startCountdown(next) {
      clearInterval(countdown);
      let n = AUTOPLAY_SECONDS;
      countdown = setInterval(() => {
        n -= 1;
        const el = host && $('[data-count]', host);
        if (el) el.textContent = String(n);
        if (n <= 0) {
          cancelCountdown();
          go(next, { autoplay: true });
        }
      }, 1000);
    }

    function cancelCountdown() {
      clearInterval(countdown);
      countdown = null;
      const c = host && $('.overlay-count', host);
      if (c) c.remove();
    }

    function replay() {
      hideOverlay();
      seek(0);
    }

    function retry() {
      if (host && lesson) mount(host, lesson, { autoplay: true });
    }

    function flush() {
      if (playing()) tick();
      if (saveTimer) saveNow();
    }

    return {
      mount: mount,
      load: load,
      destroy: destroy,
      seek: seek,
      toggle: toggle,
      replay: replay,
      retry: retry,
      flush: flush,
      cancelCountdown: cancelCountdown,
      time: time,
      isReady: () => !!(yt && ready),
      isPlaying: playing,
      current: () => lesson
    };
  })();

  /* ==================================================================
     Routing
  ================================================================== */

  let view = null;
  let currentLesson = null;
  let navIntent = null;
  let firstRender = true;
  let mapDrawn = false;
  let mapObserver = null;
  let sideOpen = null;

  function go(l, intent) {
    navIntent = intent || null;
    const h = lessonHref(l);
    if (location.hash === h) route();
    else location.hash = h;
  }

  function setView(name) {
    if (view === 'lesson' && name !== 'lesson') {
      Player.destroy();
      currentLesson = null;
    }
    if (name !== 'home' && mapObserver) {
      mapObserver.disconnect();
      mapObserver = null;
    }
    view = name;
    $$('.nav a').forEach((a) => {
      const match = (a.dataset.nav === 'home' && name === 'home') || (a.dataset.nav === 'progress' && name === 'progress');
      if (match) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const intent = navIntent || {};
    navIntent = null;
    const before = view + ':' + (currentLesson ? currentLesson.id : '');

    if (parts[0] === 'lesson') {
      const l = byId.get(decodeURIComponent(parts[1] || ''));
      if (l) {
        renderLesson(l, intent);
      } else {
        history.replaceState(null, '', '#/');
        renderHome();
      }
    } else if (parts[0] === 'progress') {
      renderProgress();
    } else {
      renderHome();
    }

    const after = view + ':' + (currentLesson ? currentLesson.id : '');
    if (!firstRender && before !== after) {
      window.scrollTo(0, 0);
      const h1 = $('h1', app);
      if (h1) h1.focus({ preventScroll: true });
    }
    firstRender = false;
  }

  function refresh() {
    if (view === 'lesson' && currentLesson) {
      renderLessonHead(currentLesson);
      renderLessonSide(currentLesson);
    } else if (view === 'home') {
      renderHome();
    } else if (view === 'progress') {
      renderProgress();
    }
  }

  /* ==================================================================
     Home view
  ================================================================== */

  function sliderHTML(large) {
    const done = doneCount();
    const total = lessons.length;
    const pct = Math.round((done / total) * 100);
    return '<div class="slider nub-out' + (large ? ' is-large' : '') + '" role="progressbar" aria-label="Course progress" ' +
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-valuetext="' + done + ' of ' + total + ' lessons complete">' +
      '<span class="slider-name">Progress</span>' +
      '<span class="slider-track"><span class="slider-fill" style="width:' + pct + '%"></span>' +
      '<span class="slider-grip" style="left:' + pct + '%"></span></span>' +
      '<span class="slider-value">' + done + ' of ' + total + '</span></div>';
  }

  function ctaHTML() {
    const next = nextUp();
    if (!next) {
      return '<a class="gh-button nub-out" href="' + lessonHref(lessons[0]) + '" data-autoplay>' +
        '<span class="gh-button-label">Review the course</span>' +
        '<span class="gh-button-sub">You completed every lesson</span></a>';
    }
    const started = lessons.some((l) => statusOf(l) !== 'new');
    const at = resumePoint(next);
    return '<a class="gh-button nub-out" href="' + lessonHref(next) + '" data-autoplay>' +
      '<span class="gh-button-label">' + (started ? 'Continue lesson ' : 'Start lesson ') + next.number + '</span>' +
      '<span class="gh-button-sub">' + esc(next.title) + (at ? ', from ' + clock(at) : '') + '</span></a>';
  }

  function factsHTML() {
    const total = lessons.length;
    const lengths = lessons.map(durationOf);
    const full = lengths.every(Boolean) ? lengths.reduce((a, b) => a + b, 0) : 0;
    const rows = [['Lessons', String(total)]];
    if (full) rows.push(['Length', esc(humanTime(full))]);
    if (COURSE.language) {
      rows.push(['Language', esc(COURSE.language) + (COURSE.languageNative
        ? ' <span lang="' + esc(COURSE.languageCode || '') + '">(' + esc(COURSE.languageNative) + ')</span>'
        : '')]);
    }
    if (COURSE.level) rows.push(['Level', esc(COURSE.level)]);
    if (COURSE.software) rows.push(['Software', esc(COURSE.software)]);
    return '<dl class="facts">' + rows.map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>';
  }

  function mapHTML() {
    const next = nextUp();
    return '<div class="map-scroll" id="map-scroll"><div class="map" id="map">' +
      '<svg class="map-wires" aria-hidden="true" focusable="false"></svg>' +
      '<ol class="map-nodes" aria-label="Course map">' +
      lessons.map((l) => {
        const st = statusOf(l);
        const f = st === 'done' ? 1 : watchedFraction(l);
        const isNext = next === l;
        const state = ', ' + (st === 'done' ? 'completed' : st === 'started' ? 'in progress' : 'not started') +
          (isNext ? ', up next' : '');
        return '<li>' +
          '<a class="node is-' + st + (isNext ? ' is-next' : '') + ' nubbed" href="' + lessonHref(l) + '" data-autoplay ' +
          'style="--p:' + f.toFixed(3) + '" title="' + esc(l.number + ' ' + l.title) + '">' +
          (isNext ? '<span class="node-ring" aria-hidden="true"></span>' : '') +
          '<span class="node-text"><span class="node-num">' + l.number + '</span> ' +
          '<span class="node-title">' + esc(l.short) + '</span><span class="visually-hidden">' + esc(state) + '</span></span>' +
          (st === 'done' ? '<span class="node-state">' + icon('check') + '</span>' : '') +
          (st === 'started' ? '<span class="node-bar" aria-hidden="true"><span></span></span>' : '') +
          '</a></li>';
      }).join('') +
      '</ol></div></div>';
  }

  function layoutMap(opts) {
    opts = opts || {};
    const scroller = $('#map-scroll');
    const map = $('#map');
    if (!map || !scroller) return;
    const W = scroller.clientWidth;
    if (!W) return;
    scroller.dataset.w = String(W);
    const items = $$('.map-nodes > li', map);
    const svg = $('.map-wires', map);
    const n = items.length;

    // Narrow screens get one swipeable row; wider screens wrap into rows.
    const rail = W < 640;
    const NODE_H = 62;
    const GAP_Y = 56;
    const PAD = rail ? 20 : 30;
    let nodeW = rail ? 172 : 196;
    let cols = rail ? n : clamp(Math.floor((W - 2 * PAD + 52) / (nodeW + 52)), 1, n);
    if (cols === 1) nodeW = Math.min(W - 2 * PAD - 8, 340);
    const gapX = cols > 1 ? (rail ? 40 : Math.min(150, (W - 2 * PAD - cols * nodeW) / (cols - 1))) : 0;
    const usedW = cols * nodeW + (cols - 1) * gapX;
    const mapW = rail ? Math.round(usedW + 2 * PAD) : W;
    const x0 = rail ? PAD : Math.round((W - usedW) / 2);
    scroller.classList.toggle('is-rail', rail);
    map.style.width = rail ? mapW + 'px' : '';
    const stagger = cols >= 3 ? [0, 20, 2, 16, -2, 22, 6] : [0];
    const sMax = Math.max.apply(null, stagger);
    const sMin = Math.min.apply(null, stagger);
    const rowPitch = NODE_H + (sMax - sMin) + GAP_Y;
    const top0 = 12 - sMin;

    const pos = items.map((li, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = Math.round(x0 + col * (nodeW + gapX));
      const y = Math.round(top0 + row * rowPitch + stagger[col % stagger.length]);
      li.style.left = x + 'px';
      li.style.top = y + 'px';
      li.style.width = nodeW + 'px';
      li.style.height = NODE_H + 'px';
      return { x: x, y: y, w: nodeW, h: NODE_H, row: row };
    });

    const rows = Math.ceil(n / cols);
    const H = top0 + (rows - 1) * rowPitch + sMax + NODE_H + 14;
    map.style.height = H + 'px';
    svg.setAttribute('width', mapW);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + mapW + ' ' + H);

    const NUB = 6.5;
    const paths = [];
    for (let i = 0; i < n - 1; i++) {
      const a = pos[i];
      const b = pos[i + 1];
      const x1 = a.x + a.w + NUB;
      const y1 = a.y + a.h / 2;
      const x2 = b.x - NUB;
      const y2 = b.y + b.h / 2;
      let d;
      if (b.row === a.row) {
        const k = Math.max(18, (x2 - x1) * 0.5);
        d = 'M' + x1 + ' ' + y1 + ' C' + (x1 + k) + ' ' + y1 + ' ' + (x2 - k) + ' ' + y2 + ' ' + x2 + ' ' + y2;
      } else {
        const rowBottom = top0 + a.row * rowPitch + sMax + NODE_H;
        const nextTop = top0 + b.row * rowPitch + sMin;
        const yGap = Math.round((rowBottom + nextTop) / 2);
        const reach = 30;
        d = 'M' + x1 + ' ' + y1 +
          ' C' + (x1 + reach) + ' ' + y1 + ' ' + (x1 + reach) + ' ' + yGap + ' ' + (x1 - 6) + ' ' + yGap +
          ' L' + (x2 + 6) + ' ' + yGap +
          ' C' + (x2 - reach) + ' ' + yGap + ' ' + (x2 - reach) + ' ' + y2 + ' ' + x2 + ' ' + y2;
      }
      paths.push('<path d="' + d + '"' + (isDone(lessons[i]) ? ' class="is-done"' : '') + '/>');
    }
    svg.innerHTML = paths.join('');

    if (rail && opts.focusNext) {
      const next = nextUp();
      if (next) scroller.scrollLeft = Math.max(0, pos[next.index].x - (W - nodeW) / 2);
    }

    if (opts.animate && !reducedMotion()) {
      $$('path', svg).forEach((p, i) => {
        const len = Math.ceil(p.getTotalLength());
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        p.style.animation = 'wire-draw 380ms ease-out ' + (150 + i * 75) + 'ms forwards';
      });
    }
  }

  function watchMap() {
    const scroller = $('#map-scroll');
    if (!scroller || typeof ResizeObserver !== 'function') return;
    if (mapObserver) mapObserver.disconnect();
    mapObserver = new ResizeObserver(() => {
      const sc = $('#map-scroll');
      if (sc && String(sc.clientWidth) !== sc.dataset.w) layoutMap({});
    });
    mapObserver.observe(scroller);
  }

  function lessonRowHTML(l) {
    const st = statusOf(l);
    const f = st === 'done' ? 1 : watchedFraction(l);
    const d = durationOf(l);
    return '<li><a class="lesson-link is-' + st + '" href="' + lessonHref(l) + '" data-autoplay>' +
      '<span class="thumb"><img src="' + thumb(l.vid, 'mq') + '" alt="" loading="lazy" decoding="async" width="320" height="180">' +
      (st === 'started' && f > 0 ? '<span class="thumb-bar" style="width:' + (f * 100).toFixed(1) + '%"></span>' : '') + '</span>' +
      '<span class="lesson-num">' + l.number + '</span>' +
      '<span class="lesson-main"><span class="lesson-title" data-num="' + l.number + '">' + esc(l.title) + '</span>' +
      '<span class="lesson-status">' + esc(statusText(l)) + '</span></span>' +
      '<span class="lesson-dur">' + (d ? clock(d) : '') + '</span>' +
      swatch(l) + '</a></li>';
  }

  function curriculumHTML() {
    const filled = modules.filter((m) => m.lessons.length);
    return '<h2 class="section-title" id="content-title">Course content</h2>' +
      '<p class="section-note">' + plural(filled.length, 'module') + ', ' + plural(lessons.length, 'lesson') +
      '. Your progress saves as you watch.</p>' +
      filled.map((m) => {
        const d = m.lessons.filter(isDone).length;
        return '<div class="module">' +
          '<div class="module-head"><h3><span class="module-num">Module ' + m.number + '</span> ' + esc(m.title) + '</h3>' +
          '<span class="module-count">' + d + ' of ' + m.lessons.length + ' complete</span>' +
          '<span class="bar" aria-hidden="true"><span style="width:' + ((d / m.lessons.length) * 100).toFixed(1) + '%"></span></span></div>' +
          (m.summary ? '<p class="module-summary">' + esc(m.summary) + '</p>' : '') +
          '<ol class="lesson-list">' + m.lessons.map(lessonRowHTML).join('') + '</ol></div>';
      }).join('');
  }

  function linkListHTML(links) {
    const list = (Array.isArray(links) ? links : []).filter((x) => x && safeUrl(x.url));
    if (!list.length) return '';
    return '<ul class="link-list">' + list.map((x) =>
      '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.label || x.url) + icon('external') + '</a></li>'
    ).join('') + '</ul>';
  }

  function aboutHTML() {
    const ins = COURSE.instructor || {};
    const outcomes = Array.isArray(COURSE.outcomes) ? COURSE.outcomes.filter(Boolean) : [];
    return (outcomes.length
      ? '<section aria-labelledby="learn-title"><h2 id="learn-title">What you\u2019ll learn</h2>' +
        '<ul class="outcomes">' + outcomes.map((o) => '<li>' + esc(o) + '</li>').join('') + '</ul></section>'
      : '') +
      '<section aria-labelledby="track-title"><h2 id="track-title">How your progress is saved</h2>' +
      '<p>This browser keeps track as you go: finished lessons, where you stopped in each video, and your notes. ' +
      'A lesson completes once you\u2019ve watched ' + Math.round(COMPLETE_AT * 100) + '% of it, or you can mark it yourself.</p>' +
      '<p>Moving to another device? Export your progress from <a href="#/progress">My progress</a> and import it there.</p></section>' +
      (ins.name
        ? '<section aria-labelledby="ins-title"><h2 id="ins-title">Instructor</h2>' +
          '<p class="instructor-name">' + esc(ins.name) + '</p>' +
          (ins.credential ? '<p class="instructor-cred">' + esc(ins.credential) + '</p>' : '') +
          linkListHTML(ins.links) + '</section>'
        : '');
  }

  function renderHome() {
    setView('home');
    document.title = COURSE.title + (COURSE.language ? ': free video course in ' + COURSE.language : '');
    app.innerHTML =
      '<section class="canvas" aria-labelledby="course-title"><div class="wrap">' +
      '<h1 class="scribble" id="course-title" tabindex="-1">' + esc(COURSE.title) + '</h1>' +
      (COURSE.tagline ? '<p class="canvas-tagline">' + esc(COURSE.tagline) + '</p>' : '') +
      '<div class="canvas-mid">' +
      '<div class="gh-panel hero-panel nubbed">' +
      (COURSE.description ? '<p class="panel-lede">' + esc(COURSE.description) + '</p>' : '') +
      factsHTML() + '</div>' +
      '<div class="canvas-controls">' + sliderHTML(false) + ctaHTML() + '</div>' +
      '</div>' +
      mapHTML() +
      '</div></section>' +
      '<div class="wrap home-body">' +
      '<section class="curriculum" aria-labelledby="content-title">' + curriculumHTML() + '</section>' +
      '<aside class="about">' + aboutHTML() + '</aside>' +
      '</div>';
    layoutMap({ animate: !mapDrawn, focusNext: true });
    mapDrawn = true;
    watchMap();
  }

  /* ==================================================================
     Lesson view
  ================================================================== */

  function renderLesson(l, intent) {
    const fresh = view !== 'lesson' || !$('.lesson-view', app);
    if (fresh) {
      setView('lesson');
      app.innerHTML =
        '<div class="lesson-view">' +
        '<nav class="lv-back" aria-label="Breadcrumb"><a href="#/">' + icon('left') + ' Course overview</a></nav>' +
        '<div class="lv-player"><div class="player-frame" id="player-frame"></div></div>' +
        '<div class="lv-head" id="lv-head"></div>' +
        '<aside class="lv-side" id="lv-side" aria-label="Course content"></aside>' +
        '<section class="lv-notes" id="lv-notes" aria-labelledby="notes-title"></section>' +
        '<section class="lv-info" id="lv-info"></section>' +
        '</div>';
    }
    const switching = currentLesson !== l;
    currentLesson = l;
    const r = recordFor(l);
    r.lastOpened = new Date().toISOString();
    state.lastLesson = l.vid;
    saveSoon();

    if (fresh) Player.mount($('#player-frame'), l, intent);
    else if (switching || Player.current() !== l) Player.load(l, intent);

    renderLessonHead(l);
    renderLessonSide(l);
    renderLessonNotes(l);
    renderLessonInfo(l);
    document.title = l.number + ' ' + l.title + ' | ' + COURSE.title;
  }

  function watchLabel(l) {
    const st = statusOf(l);
    if (st === 'done') return 'Completed';
    const f = watchedFraction(l);
    if (f > 0) return '<b>' + Math.round(f * 100) + '%</b> watched';
    const r = rec(l);
    if (r && r.position > 5) return 'Stopped at <b>' + clock(r.position) + '</b>';
    return 'Not started';
  }

  function renderLessonHead(l) {
    const el = $('#lv-head');
    if (!el) return;
    const done = isDone(l);
    const d = durationOf(l);
    const f = done ? 1 : watchedFraction(l);
    const prev = lessons[l.index - 1];
    const next = lessons[l.index + 1];
    el.innerHTML =
      '<h1 tabindex="-1"><span class="h-num">' + l.number + '</span> ' + esc(l.title) + '</h1>' +
      '<div class="lesson-meta">' +
      '<span>Lesson <b>' + (l.index + 1) + '</b> of ' + lessons.length + '</span>' +
      '<span>Module ' + l.module.number + ': ' + esc(l.module.title) + '</span>' +
      (d ? '<span>Length <b>' + clock(d) + '</b></span>' : '') +
      '<span data-watch-label>' + watchLabel(l) + '</span>' +
      '</div>' +
      '<div class="watch-bar" aria-hidden="true"><span data-watch-bar style="width:' + (f * 100).toFixed(1) + '%"></span></div>' +
      '<div class="lesson-actions">' +
      (prev
        ? '<a class="btn" href="' + lessonHref(prev) + '" data-autoplay aria-label="Previous lesson, ' + esc(prev.number + ' ' + prev.title) + '">' + icon('left') + ' Previous</a>'
        : '<span class="btn" aria-disabled="true">' + icon('left') + ' Previous</span>') +
      '<button class="btn" type="button" data-action="toggle-complete" aria-pressed="' + done + '">' +
      (done ? icon('check') + ' Completed' : 'Mark as complete') + '</button>' +
      (next
        ? '<a class="btn btn-primary" href="' + lessonHref(next) + '" data-autoplay aria-label="Next lesson, ' + esc(next.number + ' ' + next.title) + '">Next lesson ' + icon('right') + '</a>'
        : '<a class="btn btn-primary" href="#/progress">See my progress</a>') +
      '<label class="switch"><input type="checkbox" data-setting="autoplay"' + (state.settings.autoplay ? ' checked' : '') + '> Autoplay next lesson</label>' +
      '</div>';
  }

  function renderLessonSide(l) {
    const el = $('#lv-side');
    if (!el) return;
    if (sideOpen === null) sideOpen = !window.matchMedia('(max-width: 1023px)').matches;
    const done = doneCount();
    el.innerHTML =
      '<details class="side-details"' + (sideOpen ? ' open' : '') + '>' +
      '<summary class="side-summary"><span class="side-title"><span class="side-chevron" aria-hidden="true">' + icon('right') + '</span>Course content</span>' +
      '<span class="side-count">' + done + ' of ' + lessons.length + ' complete</span></summary>' +
      '<span class="bar" aria-hidden="true"><span style="width:' + ((done / lessons.length) * 100).toFixed(1) + '%"></span></span>' +
      modules.filter((m) => m.lessons.length).map((m) =>
        '<div class="side-module"><h2 class="side-module-title">Module ' + m.number + ': ' + esc(m.title) + '</h2>' +
        '<ol class="side-list">' + m.lessons.map((x) => {
          const cur = x === l;
          const d = durationOf(x);
          return '<li><a class="side-row' + (cur ? ' is-current' : '') + '" href="' + lessonHref(x) + '" data-autoplay data-vid="' + x.vid + '"' +
            (cur ? ' aria-current="true"' : '') + '>' + swatch(x) +
            '<span class="side-num">' + x.number + '</span><span class="side-name">' + esc(x.title) + '</span>' +
            '<span class="side-dur">' + (d ? clock(d) : '') + '</span></a></li>';
        }).join('') + '</ol></div>'
      ).join('') +
      '</details>';
    const details = $('.side-details', el);
    details.addEventListener('toggle', () => { sideOpen = details.open; });
    $('summary', details).addEventListener('click', (ev) => {
      if (window.matchMedia('(min-width: 1024px)').matches) ev.preventDefault();
    });
    if (window.matchMedia('(min-width: 1024px)').matches) {
      details.open = true;
      const row = $('.side-row.is-current', el);
      if (row && el.scrollHeight > el.clientHeight) {
        el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2);
      }
    }
  }

  function sortedNotes(notes) {
    return notes.slice().sort((a, b) => {
      if (a.t === null && b.t === null) return a.at < b.at ? -1 : 1;
      if (a.t === null) return 1;
      if (b.t === null) return -1;
      return a.t - b.t;
    });
  }

  function noteHTML(n) {
    return '<li class="note">' +
      (n.t !== null
        ? '<button class="note-time" type="button" data-action="seek" data-t="' + n.t + '" aria-label="Play from ' + clock(n.t) + '">' + clock(n.t) + '</button>'
        : '<span></span>') +
      '<div><p class="note-text">' + esc(n.text) + '</p><span class="note-when">' + esc(formatDate(n.at)) + '</span></div>' +
      '<button class="icon-btn note-del" type="button" data-action="delete-note" data-id="' + esc(n.id) + '" aria-label="Delete note">' + icon('trash') + '</button>' +
      '</li>';
  }

  function renderLessonNotes(l, keepFocus) {
    const el = $('#lv-notes');
    if (!el) return;
    const r = rec(l);
    const notes = r ? sortedNotes(r.notes) : [];
    const draft = $('#note-text', el) ? $('#note-text', el).value : '';
    el.innerHTML =
      '<div class="notes-head"><h2 id="notes-title">Notes</h2>' +
      '<span class="muted">' + (notes.length ? plural(notes.length, 'note') + ' for this lesson' : 'Saved in this browser') + '</span></div>' +
      '<div class="gh-panel notes-panel nubbed">' +
      (notes.length
        ? '<ol class="note-list">' + notes.map(noteHTML).join('') + '</ol>'
        : '<p class="notes-empty">Write down steps, component names or questions as you watch. Each note links back to its moment in the video.</p>') +
      '<form class="note-form" data-form="note" autocomplete="off">' +
      '<label class="visually-hidden" for="note-text">New note</label>' +
      '<textarea id="note-text" name="text" rows="3" placeholder="Add a note"></textarea>' +
      '<div class="note-form-row">' +
      '<label class="check"><input type="checkbox" name="stamp" checked> Link to <span class="live-time" data-live-time>' + clock(Player.time()) + '</span></label>' +
      '<button class="btn btn-small" type="submit">Add note</button>' +
      '</div></form></div>';
    if (draft && !keepFocus) $('#note-text', el).value = draft;
    if (keepFocus) $('#note-text', el).focus({ preventScroll: true });
  }

  function renderLessonInfo(l) {
    const el = $('#lv-info');
    if (!el) return;
    el.innerHTML =
      (l.summary ? '<h2>About this lesson</h2><p>' + esc(l.summary) + '</p>' : '') +
      (l.resources.length ? '<h2>Resources</h2>' + linkListHTML(l.resources) : '') +
      '<p class="yt-link"><a href="' + watchUrl(l.vid) + '" target="_blank" rel="noopener">' + icon('external') + ' Watch this lesson on YouTube</a></p>' +
      '<p class="shortcuts">Keyboard: <kbd>K</kbd> play or pause, <kbd>N</kbd> next lesson, <kbd>P</kbd> previous lesson, <kbd>M</kbd> mark complete.</p>';
  }

  function updateLiveTime() {
    const t = clock(Player.time());
    $$('[data-live-time]').forEach((el) => { el.textContent = t; });
  }

  function onLessonTick(l, durationChanged) {
    if (view !== 'lesson' || currentLesson !== l) return;
    if (durationChanged) {
      renderLessonHead(l);
      renderLessonSide(l);
      return;
    }
    const f = isDone(l) ? 1 : watchedFraction(l);
    const bar = $('[data-watch-bar]');
    if (bar) bar.style.width = (f * 100).toFixed(1) + '%';
    const label = $('[data-watch-label]');
    if (label) label.innerHTML = watchLabel(l);
    const sw = $('.side-row[data-vid="' + l.vid + '"] .swatch');
    if (sw) sw.outerHTML = swatch(l);
  }

  /* ==================================================================
     Progress view
  ================================================================== */

  function heatmapHTML() {
    const WEEKS = 18;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const todayKey = dayKey(today);
    const months = [];
    let cells = '';
    let lastMonth = -1;
    let active = 0;
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        if (d === 0 && day.getMonth() !== lastMonth) {
          months.push({ w: w, label: day.toLocaleDateString('en-GB', { month: 'short' }) });
          lastMonth = day.getMonth();
        }
        const place = 'grid-column:' + (w + 2) + ';grid-row:' + (d + 2);
        if (day > today) {
          cells += '<span class="hm is-future" style="' + place + '"></span>';
          continue;
        }
        const key = dayKey(day);
        const a = state.activity[key];
        const mins = a ? a.s / 60 : 0;
        const lvl = !a ? 0 : mins >= 60 ? 4 : mins >= 30 ? 3 : mins >= 10 ? 2 : (mins >= 1 || a.c > 0) ? 1 : 0;
        if (lvl) active++;
        const tip = formatDate(day) + ': ' + (a && a.s >= 1 ? humanTime(a.s) + ' watched' : 'no activity') +
          (a && a.c ? ', ' + plural(a.c, 'lesson') + ' completed' : '');
        cells += '<span class="hm l' + lvl + (key === todayKey ? ' is-today' : '') + '" style="' + place + '" title="' + esc(tip) + '"></span>';
      }
    }
    const labels = months.filter((m, i) => !(i === 0 && months[1] && months[1].w - m.w < 3))
      .map((m) => '<span class="hm-month" style="grid-column:' + (m.w + 2) + ' / span 3">' + esc(m.label) + '</span>').join('');
    const days = ['Mon', '', 'Wed', '', 'Fri', '', ''].map((t, i) =>
      t ? '<span class="hm-day" style="grid-row:' + (i + 2) + '">' + t + '</span>' : '').join('');
    return '<div class="heatmap-wrap" tabindex="0" role="region" aria-label="Activity calendar"><div class="heatmap" role="img" style="--weeks:' + WEEKS + '" ' +
      'aria-label="' + esc('Studied on ' + plural(active, 'day') + ' in the last ' + WEEKS + ' weeks') + '">' +
      labels + days + cells + '</div>' +
      '<div class="hm-legend" aria-hidden="true"><span>Less</span><span class="hm l0"></span><span class="hm l1"></span>' +
      '<span class="hm l2"></span><span class="hm l3"></span><span class="hm l4"></span><span>More</span></div></div>';
  }

  function tableHTML() {
    return '<div class="table-wrap"><table class="ptable"><thead><tr>' +
      '<th scope="col">Lesson</th><th scope="col">Status</th><th scope="col">Watched</th>' +
      '<th scope="col">Time spent</th><th scope="col">Notes</th></tr></thead><tbody>' +
      lessons.map((l) => {
        const r = rec(l);
        const st = statusOf(l);
        const f = watchedFraction(l);
        const watched = durationOf(l)
          ? Math.round(f * 100) + '%'
          : r && r.position > 5 ? 'to ' + clock(r.position) : '0%';
        return '<tr class="is-' + st + '">' +
          '<th scope="row"><a href="' + lessonHref(l) + '" data-autoplay><span class="t-num">' + l.number + '</span> ' + esc(l.title) + '</a></th>' +
          '<td data-label="Status">' + swatch(l) + esc(st === 'done' ? statusText(l) : st === 'started' ? 'In progress' : 'Not started') + '</td>' +
          '<td data-label="Watched" class="num">' + esc(watched) + '</td>' +
          '<td data-label="Time spent" class="num">' + esc(humanTime(r ? r.seconds : 0)) + '</td>' +
          '<td data-label="Notes" class="num">' + (r ? r.notes.length : 0) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderProgress() {
    setView('progress');
    document.title = 'My progress | ' + COURSE.title;
    const done = doneCount();
    const total = lessons.length;
    const spent = totalSeconds();
    const s = streaks();
    const next = nextUp();
    const started = lessons.some((l) => statusOf(l) !== 'new');
    let lede;
    if (!started && !done) {
      lede = 'You haven\u2019t started yet. Lesson ' + lessons[0].number + ', ' + esc(lessons[0].title) + ', is the place to begin.';
    } else if (done === total) {
      lede = 'You completed all ' + total + ' lessons and spent ' + esc(humanTime(spent)) + ' watching. Well done.';
    } else {
      lede = 'You\u2019ve completed ' + done + ' of ' + total + ' lessons and spent ' + esc(humanTime(spent)) + ' watching.' +
        (next ? ' Next up is lesson ' + next.number + ', ' + esc(next.title) + '.' : '');
    }
    const noteCount = lessons.reduce((sum, l) => sum + ((rec(l) && rec(l).notes.length) || 0), 0);

    app.innerHTML =
      '<div class="wrap progress-view">' +
      '<h1 tabindex="-1">My progress</h1>' +
      '<p class="lede">' + lede + '</p>' +
      '<div class="progress-row">' + sliderHTML(true) +
      (next ? '<a class="btn btn-primary" href="' + lessonHref(next) + '" data-autoplay>' + icon('play') + ' ' + (started ? 'Continue' : 'Start') + ' lesson ' + next.number + '</a>' : '') +
      '</div>' +
      (storage ? '' : '<p class="notice">This browser is blocking storage, so progress will be lost when you close the page. Allow site data for this site to keep it.</p>') +
      '<section class="pv-section" aria-labelledby="activity-title"><h2 id="activity-title">Activity</h2>' +
      '<dl class="figures">' +
      '<div><dt>Time watched</dt><dd>' + esc(humanTime(spent)) + '</dd></div>' +
      '<div><dt>Current streak</dt><dd>' + plural(s.current, 'day') + '</dd></div>' +
      '<div><dt>Best streak</dt><dd>' + plural(s.best, 'day') + '</dd></div>' +
      '<div><dt>Last studied</dt><dd>' + (s.last ? esc(relativeDay(s.last)) : 'Not yet') + '</dd></div>' +
      '<div><dt>Notes</dt><dd>' + noteCount + '</dd></div>' +
      '</dl>' + heatmapHTML() + '</section>' +
      '<section class="pv-section" aria-labelledby="lessons-title"><h2 id="lessons-title">Lessons</h2>' + tableHTML() + '</section>' +
      '<section class="pv-section" aria-labelledby="data-title"><h2 id="data-title">Your data</h2>' +
      '<p>Progress and notes are saved in this browser on this device, and nowhere else. ' +
      'Export a backup to keep a copy or to move it to another browser, then import it there.</p>' +
      '<div class="tools">' +
      '<button class="btn" type="button" data-action="export-progress">' + icon('download') + ' Export progress</button>' +
      '<button class="btn" type="button" data-action="import-progress">' + icon('upload') + ' Import progress</button>' +
      '<button class="btn" type="button" data-action="export-notes"' + (noteCount ? '' : ' disabled') + '>' + icon('download') + ' Export notes</button>' +
      '<button class="btn btn-quiet" type="button" data-action="reset-progress">' + icon('replay') + ' Reset progress</button>' +
      '</div>' +
      '<input type="file" id="import-file" accept=".json,application/json" hidden>' +
      '</section></div>';
  }

  /* ==================================================================
     Export, import and reset
  ================================================================== */

  function exportProgress() {
    Player.flush();
    const data = {
      course: COURSE_ID,
      title: COURSE.title,
      exportedAt: new Date().toISOString(),
      progress: state
    };
    download(slug(COURSE.title) + '-progress-' + dayKey() + '.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Progress exported');
  }

  function exportNotes() {
    const lines = ['# ' + COURSE.title + ': my notes', '', 'Exported ' + formatDate(new Date()), ''];
    let count = 0;
    lessons.forEach((l) => {
      const r = rec(l);
      if (!r || !r.notes.length) return;
      lines.push('## ' + l.number + ' ' + l.title, '');
      if (COURSE.siteUrl) lines.push(COURSE.siteUrl.replace(/\/?$/, '/') + lessonHref(l), '');
      sortedNotes(r.notes).forEach((n) => {
        const text = n.text.trim().replace(/\n/g, '\n  ');
        lines.push('- ' + (n.t !== null ? '**' + clock(n.t) + '** ' : '') + text);
        count++;
      });
      lines.push('');
    });
    if (!count) { toast('There are no notes to export yet'); return; }
    download(slug(COURSE.title) + '-notes-' + dayKey() + '.md', lines.join('\n'), 'text/markdown');
    toast('Notes exported');
  }

  async function importProgress(file) {
    let data = null;
    try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
    if (!data || typeof data !== 'object' || !data.progress || typeof data.progress !== 'object') {
      toast('That file is not a progress backup from this site');
      return;
    }
    if (data.course && data.course !== COURSE_ID) {
      toast('That backup belongs to a different course');
      return;
    }
    const ok = await confirmDialog({
      title: 'Import progress?',
      body: 'This replaces the progress and notes in this browser with the ones in the backup file.',
      confirm: 'Import progress'
    });
    if (!ok) return;
    state = cleanState(data.progress);
    saveNow();
    renderProgress();
    toast('Progress imported');
  }

  async function resetProgress() {
    const ok = await confirmDialog({
      title: 'Reset all progress?',
      body: 'This clears finished lessons, watch history and notes saved in this browser. Export your progress first if you want to keep a copy.',
      confirm: 'Reset progress',
      danger: true
    });
    if (!ok) return;
    const settings = state.settings;
    state = blankState();
    state.settings = settings;
    saveNow();
    renderProgress();
    toast('Progress reset');
  }

  /* ==================================================================
     Events
  ================================================================== */

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-autoplay]');
    if (link && !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      navIntent = link.getAttribute('href') === location.hash ? null : { autoplay: true };
    }

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const l = currentLesson;

    if (action === 'toggle-complete' && l) {
      setComplete(l, !isDone(l));
      const b = $('[data-action="toggle-complete"]');
      if (b) b.focus({ preventScroll: true });
    } else if (action === 'seek') {
      Player.seek(Number(el.dataset.t) || 0);
    } else if (action === 'delete-note' && l) {
      const r = recordFor(l);
      const i = r.notes.findIndex((n) => n.id === el.dataset.id);
      if (i < 0) return;
      const removed = r.notes.splice(i, 1)[0];
      saveNow();
      renderLessonNotes(l);
      toast('Note deleted', {
        label: 'Undo',
        run: () => {
          const rr = recordFor(l);
          rr.notes.splice(Math.min(i, rr.notes.length), 0, removed);
          saveNow();
          if (currentLesson === l) renderLessonNotes(l);
        }
      });
    } else if (action === 'play-next' && l) {
      const next = lessons[l.index + 1];
      Player.cancelCountdown();
      if (next) go(next, { autoplay: true });
    } else if (action === 'replay') {
      Player.replay();
    } else if (action === 'cancel-autoplay') {
      Player.cancelCountdown();
    } else if (action === 'retry-player') {
      Player.retry();
    } else if (action === 'export-progress') {
      exportProgress();
    } else if (action === 'import-progress') {
      const input = $('#import-file');
      if (input) { input.value = ''; input.click(); }
    } else if (action === 'export-notes') {
      exportNotes();
    } else if (action === 'reset-progress') {
      resetProgress();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-setting="autoplay"]')) {
      state.settings.autoplay = t.checked;
      saveNow();
      if (!t.checked) Player.cancelCountdown();
    } else if (t.id === 'import-file' && t.files && t.files[0]) {
      importProgress(t.files[0]);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.matches('[data-form="note"]')) return;
    e.preventDefault();
    const l = currentLesson;
    if (!l) return;
    const text = form.elements.text.value.trim();
    if (!text) { form.elements.text.focus(); return; }
    const at = form.elements.stamp.checked && Player.isReady() ? Player.time() : 0;
    recordFor(l).notes.push({ id: uid(), t: at >= 1 ? round1(at) : null, text: text, at: new Date().toISOString() });
    saveNow();
    renderLessonNotes(l, true);
    toast('Note added');
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.id === 'note-text' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const form = t.closest('form');
      if (form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      return;
    }
    if (view !== 'lesson' || !currentLesson || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    const key = e.key.toLowerCase();
    const l = currentLesson;
    if (key === 'n' && lessons[l.index + 1]) go(lessons[l.index + 1], { autoplay: true });
    else if (key === 'p' && lessons[l.index - 1]) go(lessons[l.index - 1], { autoplay: true });
    else if (key === 'm') setComplete(l, !isDone(l));
    else if (key === 'k') Player.toggle();
    else return;
    e.preventDefault();
  });

  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.id === 'note-text') updateLiveTime();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Player.flush();
  });
  window.addEventListener('pagehide', () => Player.flush());

  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY || Player.isPlaying()) return;
    state = readState();
    if (view === 'lesson' && currentLesson) {
      renderLessonHead(currentLesson);
      renderLessonSide(currentLesson);
      renderLessonNotes(currentLesson);
    } else {
      refresh();
    }
  });

  window.addEventListener('hashchange', route);

  /* ==================================================================
     Theme, header and footer
  ================================================================== */

  const themeButton = $('#theme-toggle');
  const themeMeta = $('meta[name="theme-color"]');

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  function syncTheme() {
    const dark = currentTheme() === 'dark';
    if (themeButton) {
      themeButton.innerHTML = icon(dark ? 'sun' : 'moon');
      themeButton.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      themeButton.title = dark ? 'Light theme' : 'Dark theme';
    }
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#222426' : '#F1F1EF');
  }

  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
      syncTheme();
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);

  function renderChrome() {
    const brand = $('#brand-name');
    if (brand) brand.textContent = COURSE.title;
    const footer = $('#site-footer');
    if (!footer) return;
    const ins = COURSE.instructor || {};
    const links = [
      COURSE.playlistUrl && { label: 'YouTube playlist', url: COURSE.playlistUrl },
      COURSE.repoUrl && { label: 'GitHub repository', url: COURSE.repoUrl }
    ].filter(Boolean);
    footer.innerHTML =
      '<div class="wrap footer-inner">' +
      '<p>' + esc(COURSE.title) + (ins.name ? ' by ' + esc(ins.name) + (ins.credential ? ', ' + esc(ins.credential) : '') : '') + '</p>' +
      (links.length
        ? '<ul class="footer-links">' + links.map((x) =>
            '<li><a href="' + esc(safeUrl(x.url)) + '" target="_blank" rel="noopener">' + esc(x.label) + '</a></li>').join('') + '</ul>'
        : '') +
      '</div>';
  }

  /* ==================================================================
     Start
  ================================================================== */

  syncTheme();
  renderChrome();
  route();
})();
