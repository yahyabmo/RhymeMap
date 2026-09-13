/* RhymeMapper viewer.
 *
 * Rhyme colour is generated from the group label rather than picked from a list
 * of CSS classes. There is no upper bound on groups -- Rap God has 56 under the
 * exact engine and 257 under chain detection -- so an enumerated palette cannot
 * work, and the previous .rhyme-a ... .rhyme-z scheme silently reused colours.
 */

'use strict';

const verses = typeof rhymeData !== 'undefined' ? rhymeData.slice() : [];

const el = (id) => document.getElementById(id);
const ui = {
  aurora: el('aurora'), grain: el('grain'), waves: el('waves'), progress: el('progress'),
  rotatingWord: el('rotatingWord'), rotatingWordStatic: el('rotatingWordStatic'),
  heroLede: el('heroLede'), heroLedeStatic: el('heroLedeStatic'),
  staticCta: el('staticCta'), explore: el('exploreBtn'),
  form: el('linkForm'), input: el('linkInput'), analyse: el('analyseBtn'),
  status: el('status'), pasteToggle: el('pasteToggle'), pastePanel: el('pastePanel'),
  lyricsInput: el('lyricsInput'), analysePaste: el('analysePasteBtn'), demo: el('demoBtn'),
  analysis: el('analysis'), lyrics: el('lyrics'), chains: el('chains'), stats: el('stats'),
  groupCount: el('groupCount'), tooltip: el('tooltip'),
  trackSelect: el('trackSelect'), engineSelect: el('engineSelect'), dimToggle: el('dimToggle'),
  trackTitle: el('trackTitle'), trackArtist: el('trackArtist'),
  trackArt: el('trackArt'), trackBadges: el('trackBadges'),
  player: el('player'), playerFrame: el('playerFrame'), audio: el('audio'),
  heroTitle: el('heroTitle'),
};

let current = null;
let isolated = null;
let auroraHandle = null;
let wavesHandle = null;
let stopStatusAnimation = null;

/* ------------------------------------------------------------- palette -- */

function hashLabel(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) % 100003;
  return hash;
}

/* Golden-angle stepping keeps adjacent groups far apart on the wheel. */
function hueFor(label) { return (hashLabel(label) * 137.508) % 360; }

function colourFor(label) {
  return `hsl(${hueFor(label).toFixed(1)}, ${70 + (hashLabel(label) % 9)}%, ${62 + (hashLabel(label + '~') % 13)}%)`;
}

/* ---------------------------------------------------------------- status -- */

function setStatus(text, kind = '') {
  if (stopStatusAnimation) { stopStatusAnimation(); stopStatusAnimation = null; }
  ui.status.className = `status ${kind}`;
  if (kind === 'working') {
    stopStatusAnimation = Effects.scrambleLoop(ui.status, text);
  } else {
    ui.status.textContent = text;
  }
}

/* ------------------------------------------------------------- rendering -- */

function renderStats(verse) {
  const m = verse.metrics || {};
  const cells = [
    ['Density', m.density ?? 0, '%', 1],
    ['Multisyllabic', m.multi ?? 0, '%', 1],
    ['Diversity', m.diversity ?? 0, '%', 1],
    ['Groups', m.signatures ?? 0, '', 0],
    ['Syllables', m.syllables ?? 0, '', 0],
  ];

  if (ui.stats.childElementCount !== cells.length) {
    ui.stats.innerHTML = cells.map(([name]) =>
      `<div class="stat"><span class="stat-value">0</span><span class="stat-name">${name}</span></div>`).join('');
  }
  ui.stats.querySelectorAll('.stat').forEach((node, i) => {
    if (!node.classList.contains('has-glare')) { Effects.glare(node); Effects.tilt(node); }
    const [name, value, suffix, decimals] = cells[i];
    node.querySelector('.stat-name').textContent = name;
    Effects.countUp(node.querySelector('.stat-value'), value, { suffix, decimals });
  });
}

function renderTrack(verse) {
  ui.trackTitle.textContent = verse.track || 'Untitled';
  ui.trackArtist.textContent = verse.artist || '';

  const source = verse.source || {};
  if (source.thumbnail) {
    ui.trackArt.src = source.thumbnail;
    ui.trackArt.alt = `${verse.track} cover`;
    ui.trackArt.hidden = false;
  } else {
    ui.trackArt.hidden = true;
    ui.trackArt.removeAttribute('src');
  }

  const badges = [];
  if (verse.engine) badges.push({ text: verse.engine });
  if (source.captions) badges.push({ text: `${source.captions} captions` });
  if (source.language) badges.push({ text: source.language });
  if (verse.timed) badges.push({ text: 'timed', live: true });
  ui.trackBadges.innerHTML = badges
    .map((b) => `<span class="badge${b.live ? ' live' : ''}">${b.text}</span>`).join('');
}

function renderLyrics(verse) {
  const fragment = document.createDocumentFragment();

  verse.lines.forEach((line) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'line';

    line.forEach((word) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'word';

      word.syllables.forEach((syl) => {
        const node = document.createElement('span');
        node.textContent = syl.text;
        node.className = 'syllable ' + (syl.label ? 'rhyme' : 'plain');
        if (syl.label) {
          node.style.backgroundColor = colourFor(syl.label);
          node.dataset.label = syl.label;
        }
        if (syl.start !== null && syl.start !== undefined) {
          node.dataset.start = syl.start;
          node.dataset.end = syl.end;
        }
        node.dataset.nucleus = syl.nucleus || '';
        node.dataset.coda = syl.coda || '';
        node.dataset.onset = syl.onset || '';
        node.dataset.word = word.full_text || '';
        wordEl.appendChild(node);
      });
      lineEl.appendChild(wordEl);
    });
    fragment.appendChild(lineEl);
  });

  ui.lyrics.innerHTML = '';
  if (!verse.lines.length) {
    ui.lyrics.innerHTML = '<p class="placeholder">Nothing to show.</p>';
    return;
  }

  // Words first, colour second: the reader sees the text, then the pattern.
  if (!Effects.prefersReducedMotion()) {
    ui.lyrics.classList.add('colouring');
    setTimeout(() => ui.lyrics.classList.remove('colouring'), 260);
  }
  ui.lyrics.appendChild(fragment);
}

function renderChains(verse) {
  const groups = verse.groups || [];
  ui.groupCount.textContent = groups.length ? `${groups.length}` : '';
  ui.chains.innerHTML = '';

  if (!groups.length) {
    ui.chains.innerHTML = '<p class="hint">No group passed the occurrence threshold.</p>';
    return;
  }

  groups.forEach((group) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'chain';
    row.dataset.label = group.label;
    row.title = [
      group.rime ? `rime ${group.rime}` : '',
      group.similarity != null ? `similarity ${group.similarity}` : '',
      `strength ${group.strength}`,
    ].filter(Boolean).join(' · ');

    const size = group.length > 1
      ? `${group.length}<span class="unit">syl</span>×${group.occurrences}`
      : `${group.syllables}<span class="unit">syl</span>`;

    // Examples are what make a name legible: "-ames" means little until you
    // see flames / fame / shame beside it. A chain is named after one of its
    // own spans, so that span is dropped here rather than printed twice.
    const examples = (group.exemplars || [])
      .filter((word) => word !== group.label)
      .slice(0, 3)
      .join(' · ');

    row.innerHTML =
      `<span class="chain-swatch" style="background:${colourFor(group.label)}"></span>` +
      `<span class="chain-body">` +
        `<span class="chain-top">` +
          `<span class="chain-label">${escapeHtml(group.label)}</span>` +
          `<span class="chain-meta">${size}</span>` +
        `</span>` +
        (examples ? `<span class="chain-examples">${escapeHtml(examples)}</span>` : '') +
        positionMap(group) +
      `</span>`;

    row.addEventListener('click', () => toggleIsolate(group.label));
    ui.chains.appendChild(row);
  });
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Where a group falls across the verse, as a strip of ticks. Two groups with
 * the same count can be spread evenly or bunched into one passage, and that
 * difference is most of what a rhyme scheme *is* -- the count alone hides it. */
function positionMap(group) {
  const positions = group.positions || [];
  if (positions.length < 2) return '';
  const colour = colourFor(group.label);
  const ticks = positions
    .map((p) => `<i style="left:${(p * 100).toFixed(2)}%;background:${colour}"></i>`)
    .join('');
  return `<span class="chain-map" aria-hidden="true">${ticks}</span>`;
}

function show(verse) {
  current = verse;
  isolated = null;
  if (verse.engine) ui.engineSelect.value = verse.engine;

  ui.analysis.hidden = false;
  renderTrack(verse);
  renderStats(verse);
  renderLyrics(verse);
  renderChains(verse);
  applyIsolation();
  setupPlayback(verse);
  Effects.revealOnScroll();

  // Both background fields read the analysis: the denser the verse, the more
  // energy in the aurora and the more swell in the waves.
  const density = (verse.metrics?.density ?? 0) / 100;
  const strongest = (verse.groups || [])[0];
  if (auroraHandle) {
    auroraHandle.setEnergy(0.22 + density * 0.6);
    if (strongest) auroraHandle.setHue(hueFor(strongest.label) * 0.35);
  }
  if (wavesHandle) {
    wavesHandle.setLevel(0.14 + density * 0.5);
    if (strongest) wavesHandle.setHue(hueFor(strongest.label));
  }
}

/* ----------------------------------------------------------- interaction -- */

function syllablesWithLabel(label) {
  return ui.lyrics.querySelectorAll(`.syllable[data-label="${CSS.escape(label)}"]`);
}

function trace(label) {
  ui.lyrics.querySelectorAll('.syllable.traced').forEach((n) => n.classList.remove('traced'));
  if (!label) {
    if (!isolated) document.body.classList.remove('tracing');
    return;
  }
  syllablesWithLabel(label).forEach((n) => n.classList.add('traced'));
  document.body.classList.add('tracing');
}

function applyIsolation() {
  ui.chains.querySelectorAll('.chain').forEach((row) => {
    row.classList.toggle('active', row.dataset.label === isolated);
  });
  trace(isolated);
}

function toggleIsolate(label) {
  isolated = isolated === label ? null : label;
  applyIsolation();
}

function showTooltip(node, event) {
  const parts = [`<div class="tip-word">${node.dataset.word || node.textContent}</div>`];
  const phon = [];
  if (node.dataset.onset) phon.push(`onset ${node.dataset.onset}`);
  if (node.dataset.nucleus) phon.push(`nucleus ${node.dataset.nucleus}`);
  if (node.dataset.coda) phon.push(`coda ${node.dataset.coda}`);
  if (phon.length) parts.push(`<div class="tip-phon">${phon.join(' · ')}</div>`);

  if (node.dataset.label) {
    const group = (current?.groups || []).find((g) => g.label === node.dataset.label);
    let line = `group ${node.dataset.label}`;
    if (group) {
      line += group.length > 1
        ? ` — ${group.length} syllables ×${group.occurrences}`
        : ` — ${group.syllables} syllables`;
      if (group.similarity != null) line += `, similarity ${group.similarity}`;
    }
    parts.push(`<div class="tip-group">${line}</div>`);
  } else {
    parts.push('<div class="tip-none">no rhyme group</div>');
  }

  ui.tooltip.innerHTML = parts.join('');
  ui.tooltip.hidden = false;

  const pad = 14;
  const box = ui.tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - pad) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - pad) y = event.clientY - box.height - pad;
  ui.tooltip.style.left = `${Math.max(pad, x)}px`;
  ui.tooltip.style.top = `${Math.max(pad, y)}px`;
}

/* -------------------------------------------------------------- playback -- */

let timed = [];
let playing = null;
let ytPlayer = null;
let ytTicker = 0;

function clearPlaying() {
  if (playing) { playing.node.classList.remove('playing'); playing = null; }
}

function setupPlayback(verse) {
  timed = [];
  clearPlaying();
  clearInterval(ytTicker);
  ytPlayer = null;
  ui.playerFrame.hidden = true;
  ui.playerFrame.innerHTML = '';
  ui.audio.hidden = true;
  ui.player.hidden = true;

  if (!verse.timed) return;

  timed = Array.from(ui.lyrics.querySelectorAll('.syllable[data-start]'))
    .map((node) => ({ node, start: +node.dataset.start, end: +node.dataset.end }))
    .sort((a, b) => a.start - b.start);
  if (!timed.length) return;

  const source = verse.source || {};
  if (source.kind === 'youtube' && source.video_id) {
    // Embed YouTube's own player: playback stays on the platform licensed to
    // serve it, and nothing copyrighted is downloaded or hosted here.
    mountYouTube(source.video_id);
    ui.player.hidden = false;
  } else if (verse.audio) {
    ui.audio.src = verse.audio;
    ui.audio.hidden = false;
    ui.player.hidden = false;
  }
}

function mountYouTube(videoId) {
  ui.playerFrame.hidden = false;
  ui.playerFrame.innerHTML =
    `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&rel=0"
             title="Track playback" allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
             allowfullscreen loading="lazy"></iframe>`;

  const start = () => {
    const iframe = ui.playerFrame.querySelector('iframe');
    if (!iframe || !window.YT || !window.YT.Player) return;
    ytPlayer = new window.YT.Player(iframe, {
      events: {
        onReady: () => {
          clearInterval(ytTicker);
          ytTicker = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
              highlightAt(ytPlayer.getCurrentTime());
            }
          }, 120);
        },
      },
    });
  };

  if (window.YT && window.YT.Player) { start(); return; }
  if (!document.getElementById('yt-iframe-api')) {
    const script = document.createElement('script');
    script.id = 'yt-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  }
  // The API calls this global once it has loaded.
  const previous = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { if (previous) previous(); start(); };
}

function highlightAt(time) {
  // Binary search: this runs ~8x a second over up to 1500 syllables.
  let low = 0, high = timed.length - 1, found = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = timed[mid];
    if (time < item.start) high = mid - 1;
    else if (time > item.end) low = mid + 1;
    else { found = item; break; }
  }
  if (found === playing) return;
  clearPlaying();
  if (found) {
    found.node.classList.add('playing');
    found.node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    playing = found;
    const label = found.node.dataset.label;
    if (label) {
      const hue = hueFor(label);
      if (auroraHandle) auroraHandle.setHue(hue * 0.4);
      if (wavesHandle) { wavesHandle.setHue(hue); wavesHandle.setLevel(0.72); }
    } else if (wavesHandle) {
      wavesHandle.setLevel(0.22);
    }
  }
}

/* ---------------------------------------------------------------- server -- */

const overHttp = () => location.protocol === 'http:' || location.protocol === 'https:';

async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

/* The static build (GitHub Pages) ships pre-analysed songs but has no analysis
 * backend, so live analysis is unavailable there. It is flagged by a global the
 * build step writes into data.js, rather than guessed from the protocol -- the
 * page is served over https in both cases. */
const isStatic = () => typeof RHYMEMAP_STATIC !== 'undefined' && RHYMEMAP_STATIC;

function requireServer() {
  if (isStatic()) {
    // The note under the hero already explains this; repeating it in the status
    // line just says the same thing twice.
    return false;
  }
  if (overHttp()) return true;
  setStatus('Analysing needs the local server — run `make serve`.', 'error');
  return false;
}

function addVerse(payload) {
  verses.unshift(payload);
  populateTracks();
  ui.trackSelect.value = '0';
  show(payload);
  document.getElementById('analysis').scrollIntoView({ block: 'start' });
}

async function analyseLink(query) {
  if (!query.trim()) { setStatus('Paste a link first.', 'error'); return; }
  if (!requireServer()) return;

  ui.analyse.disabled = true;
  setStatus('Reading captions…', 'working');
  try {
    const payload = await post('/api/song', { url: query.trim(), engine: ui.engineSelect.value });
    addVerse(payload);
    setStatus(`${payload.artist} — ${payload.track}: ${payload.metrics.syllables} syllables, ${payload.metrics.signatures} rhyme groups.`);
  } catch (error) {
    setStatus(String(error.message || error), 'error');
  } finally {
    ui.analyse.disabled = false;
  }
}

async function analysePasted() {
  const lyrics = ui.lyricsInput.value.trim();
  if (!lyrics) { setStatus('Paste some lyrics first.', 'error'); return; }
  if (!requireServer()) return;

  ui.analysePaste.disabled = true;
  setStatus('Sounding it out…', 'working');
  try {
    const payload = await post('/api/analyze', { lyrics, engine: ui.engineSelect.value });
    addVerse(payload);
    setStatus(`${payload.metrics.syllables} syllables, ${payload.metrics.signatures} rhyme groups.`);
  } catch (error) {
    setStatus(String(error.message || error), 'error');
  } finally {
    ui.analysePaste.disabled = false;
  }
}

async function reanalyseCurrent() {
  if (!current?.text) return;
  if (!overHttp()) { ui.engineSelect.value = current.engine; return; }

  const index = verses.indexOf(current);
  setStatus(`Re-analysing with ${ui.engineSelect.value}…`, 'working');
  try {
    const payload = await post('/api/analyze', {
      lyrics: current.text, artist: current.artist,
      track: current.track, engine: ui.engineSelect.value,
    });
    // Re-analysis loses provenance, so carry it across.
    payload.source = current.source;
    if (index >= 0) verses[index] = payload;
    Effects.swap(() => show(payload));
    setStatus(`${payload.engine}: ${payload.metrics.density}% density, ${payload.metrics.signatures} groups.`);
  } catch (error) {
    setStatus(String(error.message || error), 'error');
    ui.engineSelect.value = current.engine;
  }
}

/* ----------------------------------------------------------------- wiring -- */

function populateTracks() {
  ui.trackSelect.innerHTML = '';
  verses.forEach((verse, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${verse.artist} — ${verse.track}`;
    ui.trackSelect.appendChild(option);
  });
}

function init() {
  document.body.classList.add('dim');

  if (isStatic()) {
    // Swap the hero for one that describes what this build actually does.
    document.body.classList.add('is-static');
    ui.heroLede.hidden = true;
    ui.heroLedeStatic.hidden = false;
    ui.staticCta.hidden = false;
  }

  auroraHandle = Effects.aurora(ui.aurora);
  wavesHandle = Effects.waves(ui.waves);
  Effects.noise(ui.grain);
  Effects.splitText(ui.heroTitle);
  Effects.clickSpark(document.body);
  Effects.magnet(ui.analyse);
  Effects.scrollProgress(ui.progress);
  const rotating = ['multisyllabic chains', 'slant rhymes', 'internal rhyme', 'assonance'];
  Effects.rotatingText(isStatic() ? ui.rotatingWordStatic : ui.rotatingWord, rotating);
  document.querySelectorAll('.panel').forEach(Effects.spotlight);
  document.querySelectorAll('.stat').forEach((node) => { Effects.glare(node); Effects.tilt(node); });
  ui.lyrics.classList.add('fade-foot');
  Effects.revealOnScroll();

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    analyseLink(ui.input.value);
  });

  ui.pasteToggle.addEventListener('click', () => {
    ui.pastePanel.hidden = !ui.pastePanel.hidden;
    if (!ui.pastePanel.hidden) ui.lyricsInput.focus();
  });
  ui.analysePaste.addEventListener('click', analysePasted);
  ui.lyricsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) analysePasted();
  });

  ui.explore.addEventListener('click', () => {
    ui.analysis.scrollIntoView({ block: 'start' });
  });

  ui.demo.addEventListener('click', () => {
    if (verses.length) {
      ui.trackSelect.value = '0';
      show(verses[0]);
      ui.analysis.scrollIntoView({ block: 'start' });
      setStatus('');
    } else {
      setStatus('No pre-analysed verses bundled — run `make web` first.', 'error');
    }
  });

  ui.lyrics.addEventListener('mouseover', (event) => {
    const node = event.target.closest('.syllable');
    if (!node) return;
    showTooltip(node, event);
    if (!isolated && node.dataset.label) trace(node.dataset.label);
  });
  ui.lyrics.addEventListener('mousemove', (event) => {
    if (ui.tooltip.hidden) return;
    const node = event.target.closest('.syllable');
    if (node) showTooltip(node, event);
  });
  ui.lyrics.addEventListener('mouseleave', () => {
    ui.tooltip.hidden = true;
    if (!isolated) trace(null);
  });
  ui.lyrics.addEventListener('click', (event) => {
    const node = event.target.closest('.syllable[data-label]');
    if (node) toggleIsolate(node.dataset.label);
  });

  ui.trackSelect.addEventListener('change', (event) => {
    const verse = verses[+event.target.value];
    if (verse) show(verse);
  });
  ui.engineSelect.addEventListener('change', () => {
    if (current && current.engine !== ui.engineSelect.value) reanalyseCurrent();
  });

  ui.dimToggle.addEventListener('click', () => {
    const on = document.body.classList.toggle('dim');
    ui.dimToggle.setAttribute('aria-pressed', String(on));
  });

  ['timeupdate', 'seeked', 'loadedmetadata'].forEach((event) => {
    ui.audio.addEventListener(event, () => { if (timed.length) highlightAt(ui.audio.currentTime); });
  });
  ui.audio.addEventListener('ended', clearPlaying);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isolated) toggleIsolate(isolated);
  });

  window.addEventListener('scroll', () => {
    const box = ui.lyrics.getBoundingClientRect();
    ui.lyrics.style.setProperty('--foot-on', box.bottom < window.innerHeight + 40 ? '0' : '1');
  }, { passive: true });

  if (verses.length) {
    populateTracks();
    show(verses[0]);
  } else {
    ui.trackSelect.innerHTML = '<option>nothing bundled</option>';
  }
}

document.addEventListener('DOMContentLoaded', init);
