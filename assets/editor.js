/*
  Course editor for the Grasshopper Workshop site (editor.html).
  It loads course.js, lets you change the course details and lessons, and
  downloads an updated course.js to upload to the repository. Changes stay
  in this browser as a draft until you download them.
*/
(() => {
  'use strict';

  const DRAFT_KEY = 'grasshopper_course:editor-draft';
  const root = document.getElementById('editor');
  const source = window.COURSE;

  /* ==================================================================
     Helpers
  ================================================================== */

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const J = (v) => JSON.stringify(v);
  const thumb = (vid) => 'https://i.ytimg.com/vi/' + encodeURIComponent(vid) + '/mqdefault.jpg';

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
    const s = String(value == null ? '' : value).trim();
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

  // "1-11 Grasshopper Diagrid Structure" becomes "Grasshopper Diagrid Structure"
  const cleanTitle = (t) => String(t || '').replace(/^\s*\d+\s*[-.]\s*\d+\s*[:.-]?\s+/, '').trim();
  // "Grasshopper Diagrid Structure" becomes "Diagrid Structure" for the course map
  const shortLabel = (t) => String(t || '').replace(/^Grasshopper\s+(Workshop\s+)?/i, '').trim() || String(t || '');

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
        '<form method="dialog" class="dialog-body"><h2>' + esc(opts.title) + '</h2><p>' + esc(opts.body) + '</p>' +
        '<div class="dialog-actions"><button class="btn btn-quiet" value="cancel">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" value="ok">' + esc(opts.confirm) + '</button></div></form>';
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }

  if (!source || !Array.isArray(source.modules)) {
    root.innerHTML = '<h1>course.js could not load</h1><p>Check that course.js sits next to editor.html and has no mistakes in it.</p>';
    return;
  }

  /* ==================================================================
     Data: normalise, serialise
  ================================================================== */

  const TEXT_KEYS = ['id', 'title', 'tagline', 'description', 'language', 'languageNative', 'languageCode',
    'level', 'software', 'siteUrl', 'repoUrl', 'playlistUrl'];
  const LIST_KEYS = ['outcomes', 'instructor', 'modules'];

  function normalize(c) {
    const d = c && typeof c === 'object' ? c : {};
    const out = {};
    TEXT_KEYS.forEach((k) => { out[k] = d[k] == null ? '' : String(d[k]); });
    Object.keys(d).forEach((k) => {
      if (!(k in out) && LIST_KEYS.indexOf(k) < 0) out[k] = d[k];
    });
    out.outcomes = Array.isArray(d.outcomes) ? d.outcomes.map(String) : [];
    const ins = d.instructor && typeof d.instructor === 'object' ? d.instructor : {};
    out.instructor = {
      name: String(ins.name || ''),
      credential: String(ins.credential || ''),
      links: (Array.isArray(ins.links) ? ins.links : []).filter((x) => x && x.url)
        .map((x) => ({ label: String(x.label || ''), url: String(x.url) }))
    };
    out.modules = (Array.isArray(d.modules) ? d.modules : []).map((m, i) => ({
      id: String((m && m.id) || 'module-' + (i + 1)),
      title: String((m && m.title) || ''),
      summary: String((m && m.summary) || ''),
      lessons: (m && Array.isArray(m.lessons) ? m.lessons : []).map((l) => ({
        id: String(l.id || ''),
        title: String(l.title || ''),
        short: String(l.short || ''),
        youtube: String(l.youtube || ''),
        duration: l.duration == null ? '' : String(l.duration),
        summary: String(l.summary || ''),
        resources: (Array.isArray(l.resources) ? l.resources : []).filter((r) => r && r.url)
          .map((r) => ({ label: String(r.label || ''), url: String(r.url) }))
      }))
    }));
    return out;
  }

  const inline = (o) => '{ ' + Object.keys(o).map((k) => J(k) + ': ' + J(o[k])).join(', ') + ' }';

  function header(d) {
    return [
      '/*',
      '  Course content for the ' + (d.title || 'course') + ' site.',
      '',
      '  Edit this file to change the course text or add lessons, or open',
      '  editor.html on the site to make changes and download a new copy.',
      '',
      '  Lesson numbers (1.1, 1.2 and so on) come from the order below, so',
      '  keep the lessons in the order you want them watched. Learner progress',
      '  is saved against each lesson\'s YouTube video, so renaming or',
      '  reordering lessons keeps everyone\'s progress.',
      '',
      '  "youtube" takes a video ID or a full YouTube link.',
      '  "duration" is optional, written as minutes:seconds (for example "14:32").',
      '  "short" is the label shown on the course map on the home page.',
      '*/',
      ''
    ].join('\n');
  }

  function serialize(d) {
    const parts = [];
    Object.keys(d).forEach((k) => {
      if (LIST_KEYS.indexOf(k) < 0) parts.push('  ' + J(k) + ': ' + J(d[k]));
    });
    parts.push('  "outcomes": ' + (d.outcomes.length
      ? '[\n' + d.outcomes.map((o) => '    ' + J(o)).join(',\n') + '\n  ]'
      : '[]'));
    parts.push('  "instructor": {\n' +
      '    "name": ' + J(d.instructor.name) + ',\n' +
      '    "credential": ' + J(d.instructor.credential) + ',\n' +
      '    "links": ' + (d.instructor.links.length
        ? '[\n' + d.instructor.links.map((x) => '      ' + inline(x)).join(',\n') + '\n    ]'
        : '[]') + '\n' +
      '  }');
    parts.push('  "modules": ' + (d.modules.length
      ? '[\n' + d.modules.map((m) =>
          '    {\n' +
          '      "id": ' + J(m.id) + ',\n' +
          '      "title": ' + J(m.title) + ',\n' +
          '      "summary": ' + J(m.summary) + ',\n' +
          '      "lessons": ' + (m.lessons.length
            ? '[\n' + m.lessons.map((l) => '        ' + inline(l)).join(',\n') + '\n      ]'
            : '[]') + '\n' +
          '    }').join(',\n') + '\n  ]'
      : '[]'));
    return header(d) + 'window.COURSE = {\n' + parts.join(',\n') + '\n};\n';
  }

  // Exposed so the published file can be generated in exactly the same format.
  window.__serializeCourse = (c) => serialize(normalize(c));

  const publishedText = serialize(normalize(clone(source)));
  let data = normalize(clone(source));

  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw);
      if (draft && draft.data) {
        const d = normalize(draft.data);
        if (serialize(d) !== publishedText) {
          data = d;
          setTimeout(() => toast('Your unsaved changes from last time are loaded'), 300);
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      }
    }
  } catch (e) { /* ignore a broken draft */ }

  const isChanged = () => serialize(data) !== publishedText;
  const allLessons = () => data.modules.reduce((acc, m) => acc.concat(m.lessons), []);

  let draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        if (isChanged()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: data }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch (e) { /* storage blocked */ }
      updateStatus();
    }, 250);
  }

  let busyText = '';
  function updateStatus() {
    const el = $('#ed-status');
    if (!el) return;
    const changed = isChanged();
    el.classList.toggle('is-changed', changed && !busyText);
    el.textContent = busyText || (changed
      ? 'You have changes that are not on the site yet. They stay in this browser until you download course.js.'
      : 'No changes yet. This matches the course.js on the site.');
  }

  function getPath(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
  }

  function setPath(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], data);
    target[last] = value;
  }

  const linksToText = (list) => (list || []).map((x) => (x.label ? x.label + ' | ' : '') + x.url).join('\n');
  const textToLinks = (text) => String(text).split('\n').map((s) => s.trim()).filter(Boolean).map((line) => {
    const i = line.lastIndexOf('|');
    return i < 0 ? { label: '', url: line } : { label: line.slice(0, i).trim(), url: line.slice(i + 1).trim() };
  }).filter((x) => x.url);
  const textToLines = (text) => String(text).split('\n').map((s) => s.trim()).filter(Boolean);

  /* ==================================================================
     Rendering
  ================================================================== */

  function field(label, path, opts) {
    opts = opts || {};
    const raw = getPath(path);
    const value = opts.kind === 'lines' ? (raw || []).join('\n') : opts.kind === 'links' ? linksToText(raw) : (raw == null ? '' : raw);
    const id = 'f-' + path.replace(/\./g, '-');
    const attrs = 'id="' + id + '" data-path="' + path + '"' + (opts.kind ? ' data-kind="' + opts.kind + '"' : '') +
      (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '');
    const control = opts.area
      ? '<textarea ' + attrs + ' rows="' + (opts.rows || 3) + '">' + esc(value) + '</textarea>'
      : '<input type="text" ' + attrs + ' value="' + esc(value) + '"' + (opts.lang ? ' lang="' + opts.lang + '"' : '') + '>';
    return '<label class="ed-field' + (opts.cls ? ' ' + opts.cls : '') + '" for="' + id + '">' +
      '<span>' + esc(label) + (opts.hint ? ' <small>' + esc(opts.hint) + '</small>' : '') + '</span>' + control + '</label>';
  }

  function lessonHTML(l, mi, li) {
    const m = data.modules[mi];
    const vid = youtubeId(l.youtube);
    const base = 'modules.' + mi + '.lessons.' + li;
    const others = data.modules.map((x, i) => (i === mi ? '' : '<option value="' + i + '">Module ' + (i + 1) + (x.title ? ': ' + esc(x.title) : '') + '</option>')).join('');
    return '<li class="ed-lesson">' +
      '<span class="ed-num">' + (mi + 1) + '.' + (li + 1) + '</span>' +
      '<img class="ed-thumb" alt="" data-thumb' + (vid ? ' src="' + thumb(vid) + '"' : '') + '>' +
      '<div class="ed-fields">' +
      field('Title', base + '.title') +
      field('Map label', base + '.short', { hint: 'short name' }) +
      field('Length', base + '.duration', { ph: 'mm:ss' }) +
      field('YouTube link or video ID', base + '.youtube', { cls: 'span-2', kind: 'youtube' }) +
      '<span class="ed-note' + (vid ? '' : ' is-error') + '" data-yt-note style="align-self:end;padding-bottom:0.6rem">' +
      (vid ? 'Video ' + esc(vid) : 'Paste a YouTube link') + '</span>' +
      '<details class="ed-more"' + (l.summary || l.resources.length ? ' open' : '') + '><summary>Summary and resources</summary>' +
      field('Summary', base + '.summary', { area: true, rows: 3 }) +
      field('Resources', base + '.resources', { area: true, kind: 'links', rows: 2, hint: 'one per line, as Label | https://link' }) +
      '</details>' +
      '<div class="ed-lesson-foot"><div class="ed-actions">' +
      '<button class="btn btn-quiet" type="button" data-act="lesson-up" data-m="' + mi + '" data-l="' + li + '"' + (li === 0 ? ' disabled' : '') + '>Move up</button>' +
      '<button class="btn btn-quiet" type="button" data-act="lesson-down" data-m="' + mi + '" data-l="' + li + '"' + (li === m.lessons.length - 1 ? ' disabled' : '') + '>Move down</button>' +
      (data.modules.length > 1
        ? '<select data-act="lesson-move" data-m="' + mi + '" data-l="' + li + '" aria-label="Move this lesson to another module"><option value="">Move to module</option>' + others + '</select>'
        : '') +
      '</div><button class="btn btn-quiet" type="button" data-act="lesson-delete" data-m="' + mi + '" data-l="' + li + '">Delete lesson</button></div>' +
      '</div></li>';
  }

  function moduleHTML(m, mi) {
    return '<div class="ed-module">' +
      '<div class="ed-module-head"><span class="ed-module-num">Module ' + (mi + 1) + '</span>' +
      '<input type="text" data-path="modules.' + mi + '.title" value="' + esc(m.title) + '" placeholder="Module title" aria-label="Module ' + (mi + 1) + ' title">' +
      '<div class="ed-actions">' +
      '<button class="btn btn-quiet" type="button" data-act="module-up" data-m="' + mi + '"' + (mi === 0 ? ' disabled' : '') + '>Move up</button>' +
      '<button class="btn btn-quiet" type="button" data-act="module-down" data-m="' + mi + '"' + (mi === data.modules.length - 1 ? ' disabled' : '') + '>Move down</button>' +
      '<button class="btn btn-quiet" type="button" data-act="module-delete" data-m="' + mi + '">Delete module</button>' +
      '</div></div>' +
      '<input type="text" class="ed-module-summary" data-path="modules.' + mi + '.summary" value="' + esc(m.summary) + '" placeholder="Module summary (optional)" aria-label="Module ' + (mi + 1) + ' summary">' +
      (m.lessons.length
        ? '<ol class="ed-lessons">' + m.lessons.map((l, li) => lessonHTML(l, mi, li)).join('') + '</ol>'
        : '<p class="ed-empty">No lessons in this module yet. Paste a YouTube link below to add one.</p>') +
      '<form class="ed-add" data-m="' + mi + '">' +
      '<input type="url" name="url" placeholder="Paste a YouTube link to add a lesson" aria-label="YouTube link for a new lesson in module ' + (mi + 1) + '">' +
      '<button class="btn btn-primary" type="submit">Add lesson</button></form>' +
      '</div>';
  }

  function render() {
    root.innerHTML =
      '<div class="gh-panel nubbed ed-intro"><h1>Course editor</h1>' +
      '<ol class="ed-steps">' +
      '<li>Change the course details and lessons below. Your changes stay in this browser as a draft.</li>' +
      '<li>Select <b>Download course.js</b>.</li>' +
      '<li>On GitHub, open the repository, choose <b>Add file</b> then <b>Upload files</b>, and upload the new course.js. It replaces the old one.</li>' +
      '</ol><p>The live site picks up the new file a few minutes after you commit it.</p></div>' +

      '<div class="ed-bar"><span class="ed-status" id="ed-status"></span>' +
      '<button class="btn btn-quiet" type="button" data-act="discard">Discard changes</button>' +
      '<button class="btn" type="button" data-act="copy">Copy code</button>' +
      '<button class="btn btn-primary" type="button" data-act="download">Download course.js</button></div>' +

      '<section class="ed-section" aria-labelledby="ed-course"><h2 id="ed-course">Course details</h2><div class="ed-grid">' +
      field('Course title', 'title') +
      field('Tagline', 'tagline', { hint: 'one line under the title' }) +
      field('Description', 'description', { area: true, rows: 3, cls: 'wide', hint: 'shown in the yellow panel' }) +
      field('What you’ll learn', 'outcomes', { area: true, rows: 6, kind: 'lines', cls: 'wide', hint: 'one point per line' }) +
      field('Language', 'language') +
      field('Language in its own script', 'languageNative', { lang: 'bn' }) +
      field('Level', 'level') +
      field('Software', 'software') +
      field('Instructor name', 'instructor.name') +
      field('Instructor credential', 'instructor.credential') +
      field('Instructor links', 'instructor.links', { area: true, rows: 3, kind: 'links', cls: 'wide', hint: 'one per line, as Label | https://link' }) +
      field('YouTube playlist link', 'playlistUrl') +
      field('GitHub repository link', 'repoUrl') +
      field('Site address', 'siteUrl', { hint: 'used in exported notes' }) +
      '</div></section>' +

      '<section class="ed-section" aria-labelledby="ed-lessons"><div class="ed-section-head"><h2 id="ed-lessons">Lessons</h2>' +
      '<button class="btn" type="button" data-act="lengths">Fill in missing lengths</button></div>' +
      '<p class="ed-hint">Lesson numbers follow the order here. Progress is tied to each YouTube video, so moving or renaming a lesson keeps learners’ progress.</p>' +
      data.modules.map(moduleHTML).join('') +
      '<button class="btn ed-add-module" type="button" data-act="module-add">Add module</button>' +
      '</section>';
    updateStatus();
  }

  /* ==================================================================
     YouTube lookups: titles via noembed, lengths via a hidden player
  ================================================================== */

  function jsonp(url) {
    return new Promise((resolve) => {
      const name = '__noembed' + Date.now() + Math.floor(Math.random() * 1000);
      const s = document.createElement('script');
      const timer = setTimeout(() => done(null), 8000);
      function done(v) {
        clearTimeout(timer);
        try { delete window[name]; } catch (e) { window[name] = undefined; }
        s.remove();
        resolve(v);
      }
      window[name] = (j) => done(j);
      s.src = url + '&callback=' + name;
      s.onerror = () => done(null);
      document.head.appendChild(s);
    });
  }

  async function lookupTitle(vid) {
    const url = 'https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + vid);
    let info = null;
    try {
      const res = await fetch(url);
      info = await res.json();
    } catch (e) {
      info = await jsonp(url);
    }
    return info && info.title ? String(info.title) : '';
  }

  let apiPromise = null;
  function youtubeApi() {
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
      s.onerror = () => reject(new Error('blocked'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 15000);
    });
    apiPromise.catch(() => { apiPromise = null; });
    return apiPromise;
  }

  function lookupLength(vid) {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
    return youtubeApi().then((YT) => new Promise((resolve) => {
      const box = $('#probe');
      const el = document.createElement('div');
      box.appendChild(el);
      let player = null;
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { player.stopVideo(); } catch (e) { /* ignore */ }
        try { player.destroy(); } catch (e) { /* ignore */ }
        box.innerHTML = '';
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 15000);
      const check = () => {
        try {
          const d = player.getDuration();
          if (d > 0) {
            const title = (player.getVideoData && player.getVideoData().title) || '';
            finish({ seconds: Math.round(d), title: title });
          }
        } catch (e) { /* not ready yet */ }
      };
      player = new YT.Player(el, {
        videoId: vid,
        width: 320,
        height: 180,
        playerVars: { autoplay: 1, mute: 1, controls: 0, playsinline: 1, origin: location.origin },
        events: {
          onReady: (e) => {
            check();
            if (!finished) { try { e.target.mute(); e.target.playVideo(); } catch (err) { /* ignore */ } }
          },
          onStateChange: () => check(),
          onError: () => finish(null)
        }
      });
    })).catch(() => null);
  }

  /* ==================================================================
     Actions
  ================================================================== */

  function newLessonId(mi) {
    const taken = new Set(allLessons().map((l) => l.id));
    let n = data.modules[mi].lessons.length + 1;
    let id = (mi + 1) + '-' + n;
    while (taken.has(id)) { n++; id = (mi + 1) + '-' + n; }
    return id;
  }

  function newModuleId() {
    const taken = new Set(data.modules.map((m) => m.id));
    let n = data.modules.length + 1;
    while (taken.has('module-' + n)) n++;
    return 'module-' + n;
  }

  async function addLesson(mi, url, input) {
    const vid = youtubeId(url);
    if (!vid) {
      toast('That does not look like a YouTube link');
      if (input) input.focus();
      return;
    }
    if (allLessons().some((l) => youtubeId(l.youtube) === vid)) {
      const ok = await confirmDialog({
        title: 'Add this video again?',
        body: 'This video is already a lesson. Progress is tied to each video, so both lessons would share it.',
        confirm: 'Add it anyway'
      });
      if (!ok) return;
    }
    const lesson = { id: newLessonId(mi), title: '', short: '', youtube: vid, duration: '', summary: '', resources: [] };
    data.modules[mi].lessons.push(lesson);
    render();
    saveDraft();
    toast('Lesson added. Looking up its title and length.');

    const [title, length] = await Promise.all([lookupTitle(vid), lookupLength(vid)]);
    const found = cleanTitle(title || (length && length.title) || '');
    if (found && !lesson.title) {
      lesson.title = found;
      lesson.short = shortLabel(found);
    }
    if (length && length.seconds && !lesson.duration) lesson.duration = clock(length.seconds);
    render();
    saveDraft();
    if (!found) toast('Could not look up the title. Type it in the new lesson.');
    else toast('Added ' + found);
  }

  async function fillLengths() {
    const targets = allLessons().filter((l) => !String(l.duration).trim() && youtubeId(l.youtube));
    if (!targets.length) { toast('Every lesson already has a length'); return; }
    if (!/^https?:$/.test(location.protocol)) { toast('Open the editor on the live site to look up lengths'); return; }
    const button = $('[data-act="lengths"]');
    if (button) button.disabled = true;
    let filled = 0;
    for (let i = 0; i < targets.length; i++) {
      busyText = 'Looking up lengths: ' + (i + 1) + ' of ' + targets.length;
      updateStatus();
      const info = await lookupLength(youtubeId(targets[i].youtube));
      if (info && info.seconds) {
        targets[i].duration = clock(info.seconds);
        filled++;
      }
    }
    busyText = '';
    render();
    saveDraft();
    toast(filled
      ? 'Filled in ' + filled + ' of ' + targets.length + ' lengths'
      : 'Could not look up the lengths. Type them in as minutes:seconds.');
  }

  function problems() {
    const list = [];
    if (!data.title.trim()) list.push({ path: 'title', message: 'The course needs a title' });
    data.modules.forEach((m, mi) => {
      m.lessons.forEach((l, li) => {
        const n = (mi + 1) + '.' + (li + 1);
        const base = 'modules.' + mi + '.lessons.' + li;
        if (!youtubeId(l.youtube)) list.push({ path: base + '.youtube', message: 'Lesson ' + n + ' needs a YouTube link' });
        if (!l.title.trim()) list.push({ path: base + '.title', message: 'Lesson ' + n + ' needs a title' });
        if (String(l.duration).trim() && !toSeconds(l.duration)) {
          list.push({ path: base + '.duration', message: 'Lesson ' + n + ' length should look like 14:32' });
        }
      });
    });
    return list;
  }

  function checkBeforeExport() {
    $$('.is-invalid', root).forEach((el) => el.classList.remove('is-invalid'));
    const list = problems();
    if (!list.length) return true;
    list.forEach((p) => {
      const el = $('[data-path="' + p.path + '"]', root);
      if (el) el.classList.add('is-invalid');
    });
    const first = $('[data-path="' + list[0].path + '"]', root);
    if (first) {
      const details = first.closest('details');
      if (details) details.open = true;
      first.focus();
    }
    toast(list[0].message + (list.length > 1 ? ' (and ' + (list.length - 1) + ' more to fix)' : ''), null, 6000);
    return false;
  }

  function downloadFile() {
    if (!checkBeforeExport()) return;
    const blob = new Blob([serialize(data)], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'course.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast('course.js downloaded. Upload it to the repository to publish.', null, 6000);
  }

  async function copyCode() {
    if (!checkBeforeExport()) return;
    try {
      await navigator.clipboard.writeText(serialize(data));
      toast('Code copied. Paste it over everything in course.js on GitHub.');
    } catch (e) {
      toast('Copying is blocked here. Use Download course.js instead.');
    }
  }

  function swap(list, i, j) {
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }

  /* ==================================================================
     Events
  ================================================================== */

  root.addEventListener('input', (e) => {
    const t = e.target;
    const path = t.dataset && t.dataset.path;
    if (!path) return;
    const kind = t.dataset.kind;
    t.classList.remove('is-invalid');
    if (kind === 'lines') setPath(path, textToLines(t.value));
    else if (kind === 'links') setPath(path, textToLinks(t.value));
    else setPath(path, t.value);
    if (kind === 'youtube') {
      const item = t.closest('.ed-lesson');
      const vid = youtubeId(t.value);
      const img = item && $('[data-thumb]', item);
      const note = item && $('[data-yt-note]', item);
      if (img) { if (vid) img.src = thumb(vid); else img.removeAttribute('src'); }
      if (note) {
        note.textContent = vid ? 'Video ' + vid : 'Paste a YouTube link';
        note.classList.toggle('is-error', !vid);
      }
    }
    saveDraft();
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.act === 'lesson-move' && t.value !== '') {
      const mi = Number(t.dataset.m);
      const li = Number(t.dataset.l);
      const to = Number(t.value);
      const lesson = data.modules[mi].lessons.splice(li, 1)[0];
      data.modules[to].lessons.push(lesson);
      render();
      saveDraft();
      toast('Moved to module ' + (to + 1));
    }
  });

  root.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.classList.contains('ed-add')) return;
    e.preventDefault();
    const input = form.elements.url;
    addLesson(Number(form.dataset.m), input.value, input);
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const mi = Number(b.dataset.m);
    const li = Number(b.dataset.l);

    if (act === 'download') downloadFile();
    else if (act === 'copy') copyCode();
    else if (act === 'lengths') fillLengths();
    else if (act === 'discard') {
      if (!isChanged()) { toast('There are no changes to discard'); return; }
      const ok = await confirmDialog({
        title: 'Discard your changes?',
        body: 'The editor goes back to the course.js that is on the site now.',
        confirm: 'Discard changes',
        danger: true
      });
      if (!ok) return;
      data = normalize(clone(source));
      try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
      render();
      toast('Changes discarded');
    } else if (act === 'lesson-up' && li > 0) {
      swap(data.modules[mi].lessons, li, li - 1);
      render();
      saveDraft();
    } else if (act === 'lesson-down' && li < data.modules[mi].lessons.length - 1) {
      swap(data.modules[mi].lessons, li, li + 1);
      render();
      saveDraft();
    } else if (act === 'lesson-delete') {
      const l = data.modules[mi].lessons[li];
      const ok = await confirmDialog({
        title: 'Delete lesson ' + (mi + 1) + '.' + (li + 1) + '?',
        body: (l.title || 'This lesson') + ' will be removed from the course. The video stays on YouTube.',
        confirm: 'Delete lesson',
        danger: true
      });
      if (!ok) return;
      const removed = data.modules[mi].lessons.splice(li, 1)[0];
      render();
      saveDraft();
      toast('Lesson deleted', {
        label: 'Undo',
        run: () => {
          const target = data.modules[mi] ? data.modules[mi].lessons : null;
          if (!target) return;
          target.splice(Math.min(li, target.length), 0, removed);
          render();
          saveDraft();
        }
      });
    } else if (act === 'module-up' && mi > 0) {
      swap(data.modules, mi, mi - 1);
      render();
      saveDraft();
    } else if (act === 'module-down' && mi < data.modules.length - 1) {
      swap(data.modules, mi, mi + 1);
      render();
      saveDraft();
    } else if (act === 'module-delete') {
      const m = data.modules[mi];
      if (m.lessons.length) {
        const ok = await confirmDialog({
          title: 'Delete module ' + (mi + 1) + '?',
          body: 'This removes the module and its ' + m.lessons.length + (m.lessons.length === 1 ? ' lesson' : ' lessons') + ' from the course.',
          confirm: 'Delete module',
          danger: true
        });
        if (!ok) return;
      }
      data.modules.splice(mi, 1);
      render();
      saveDraft();
      toast('Module deleted');
    } else if (act === 'module-add') {
      data.modules.push({ id: newModuleId(), title: '', summary: '', lessons: [] });
      render();
      saveDraft();
      const inputs = $$('.ed-module-head input', root);
      if (inputs.length) inputs[inputs.length - 1].focus();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (draftTimer) {
      clearTimeout(draftTimer);
      try {
        if (isChanged()) localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: data }));
      } catch (e) { /* ignore */ }
    }
  });

  render();
})();
