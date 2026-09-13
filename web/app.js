/* RhymeMapper viewer.
 *
 * Colours are derived from the group label rather than taken from a fixed list
 * of CSS classes. The old page defined .rhyme-a through .rhyme-z, which could
 * not represent a verse with more than 26 groups -- and Rap God has 56.
 */

'use strict';

const verses = typeof rhymeData !== 'undefined' ? rhymeData.slice() : [];

const els = {
  track: document.getElementById('trackSelect'),
  engine: document.getElementById('engineSelect'),
  lyrics: document.getElementById('lyrics'),
  groups: document.getElementById('groupList'),
  stats: document.getElementById('stats'),
  tooltip: document.getElementById('tooltip'),
  pastePanel: document.getElementById('pastePanel'),
  pasteToggle: document.getElementById('pasteToggle'),
  pasteStatus: document.getElementById('pasteStatus'),
  lyricsInput: document.getElementById('lyricsInput'),
  analyseBtn: document.getElementById('analyseBtn'),
  dimToggle: document.getElementById('dimToggle'),
  player: document.getElementById('player'),
  audio: document.getElementById('audio'),
};

let current = null;
let isolated = null;

/* ---------- colour ---------- */

/* Hash the label to a hue so the palette is stable across renders and
 * unbounded in size. The golden-angle step keeps adjacent groups far apart. */
function hueFor(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) % 360;
  }
  return (hash * 137.508) % 360;
}

function colourFor(label) {
  const hue = hueFor(label);
  const light = 62 + (hueFor(label + '~') % 14);
  return `hsl(${hue.toFixed(1)}, 72%, ${light}%)`;
}

/* ---------- rendering ---------- */

function renderStats(verse) {
  const m = verse.metrics || {};
  const cells = [
    ['Density', `${m.density ?? 0}%`],
    ['Multi', `${m.multi ?? 0}%`],
    ['Diversity', `${m.diversity ?? 0}%`],
    ['Groups', m.signatures ?? 0],
    ['Syllables', m.syllables ?? 0],
    ['Engine', verse.engine || '-'],
  ];
  els.stats.innerHTML = cells
    .map(([name, value]) => `<div class="stat"><span class="value">${value}</span><span class="name">${name}</span></div>`)
    .join('');
  els.stats.hidden = false;
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
        const el = document.createElement('span');
        el.textContent = syl.text;
        el.className = 'syllable ' + (syl.label ? 'rhyme' : 'plain');
        if (syl.label) {
          el.style.backgroundColor = colourFor(syl.label);
          el.dataset.label = syl.label;
        }
        if (syl.start !== null && syl.start !== undefined) {
          el.dataset.start = syl.start;
          el.dataset.end = syl.end;
        }
        el.dataset.nucleus = syl.nucleus || '';
        el.dataset.coda = syl.coda || '';
        el.dataset.onset = syl.onset || '';
        el.dataset.word = word.full_text || '';
        wordEl.appendChild(el);
      });

      lineEl.appendChild(wordEl);
    });

    fragment.appendChild(lineEl);
  });

  els.lyrics.innerHTML = '';
  if (!verse.lines.length) {
    els.lyrics.innerHTML = '<p class="placeholder">Nothing to show.</p>';
    return;
  }
  els.lyrics.appendChild(fragment);
}

function renderGroups(verse) {
  els.groups.innerHTML = '';
  const groups = verse.groups || [];
  if (!groups.length) {
    els.groups.innerHTML = '<li class="hint">No group passed the occurrence threshold.</li>';
    return;
  }

  groups.forEach((group) => {
    const item = document.createElement('li');
    item.className = 'group-item';
    item.dataset.label = group.label;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = colourFor(group.label);

    const name = document.createElement('span');
    name.textContent = group.label;

    const meta = document.createElement('span');
    meta.className = 'group-meta';
    meta.textContent = group.length > 1
      ? `${group.length}-syl x${group.occurrences}`
      : `${group.syllables} syl`;

    item.append(swatch, name, meta);
    item.title = group.similarity !== null && group.similarity !== undefined
      ? `similarity ${group.similarity}, strength ${group.strength}`
      : `strength ${group.strength}`;

    const activate = () => toggleIsolate(group.label);
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });

    els.groups.appendChild(item);
  });
}

function show(verse) {
  current = verse;
  if (verse.engine) els.engine.value = verse.engine;
  isolated = null;
  renderStats(verse);
  renderLyrics(verse);
  renderGroups(verse);
  applyIsolation();
  setupAudio(verse);
}

/* ---------- karaoke playback ----------
 *
 * Only shown when the verse carries both an audio file and word timings.
 * Everything else works identically without them. */

let timedSyllables = [];
let playing = null;

function setupAudio(verse) {
  timedSyllables = [];
  playing = null;
  clearPlaying();

  if (!verse.audio || !verse.timed) {
    els.player.hidden = true;
    els.audio.removeAttribute('src');
    return;
  }

  timedSyllables = Array.from(els.lyrics.querySelectorAll('.syllable[data-start]'))
    .map((el) => ({ el, start: parseFloat(el.dataset.start), end: parseFloat(el.dataset.end) }))
    .sort((a, b) => a.start - b.start);

  els.audio.src = verse.audio;
  els.player.hidden = false;
}

function clearPlaying() {
  if (playing) {
    playing.el.classList.remove('playing');
    playing = null;
  }
}

function highlightAt(time) {
  /* Binary search for the syllable covering `time`. timeupdate fires about four
   * times a second, and a linear scan over ~1500 syllables each time is wasteful
   * enough to be visible on a phone. */
  let low = 0;
  let high = timedSyllables.length - 1;
  let found = null;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = timedSyllables[mid];
    if (time < item.start) high = mid - 1;
    else if (time > item.end) low = mid + 1;
    else { found = item; break; }
  }

  if (found === playing) return;
  clearPlaying();
  if (found) {
    found.el.classList.add('playing');
    found.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  playing = found;
}

/* ---------- interaction ---------- */

function syllablesWithLabel(label) {
  return els.lyrics.querySelectorAll(`.syllable[data-label="${CSS.escape(label)}"]`);
}

function trace(label) {
  els.lyrics.querySelectorAll('.syllable.traced').forEach((el) => el.classList.remove('traced'));
  if (!label) {
    if (!isolated) document.body.classList.remove('tracing');
    return;
  }
  syllablesWithLabel(label).forEach((el) => el.classList.add('traced'));
  document.body.classList.add('tracing');
}

function applyIsolation() {
  els.groups.querySelectorAll('.group-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.label === isolated);
  });
  trace(isolated);
}

function toggleIsolate(label) {
  isolated = isolated === label ? null : label;
  applyIsolation();
}

/* ---------- tooltip ---------- */

function showTooltip(el, event) {
  const parts = [`<b>${el.dataset.word || el.textContent}</b>`];
  const phon = [];
  if (el.dataset.onset) phon.push(`onset ${el.dataset.onset}`);
  if (el.dataset.nucleus) phon.push(`nucleus ${el.dataset.nucleus}`);
  if (el.dataset.coda) phon.push(`coda ${el.dataset.coda}`);
  if (phon.length) parts.push(`<span class="mono">${phon.join(' &middot; ')}</span>`);

  if (el.dataset.label) {
    const group = (current.groups || []).find((g) => g.label === el.dataset.label);
    let line = `group <b>${el.dataset.label}</b>`;
    if (group) {
      line += group.length > 1
        ? ` &mdash; ${group.length} syllables x${group.occurrences}`
        : ` &mdash; ${group.syllables} syllables`;
      if (group.similarity !== null && group.similarity !== undefined) {
        line += `, similarity ${group.similarity}`;
      }
    }
    parts.push(line);
  } else {
    parts.push('<span style="color:#9a9ab0">no rhyme group</span>');
  }

  els.tooltip.innerHTML = parts.join('<br>');
  els.tooltip.hidden = false;

  const pad = 12;
  const box = els.tooltip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + box.width > window.innerWidth - pad) x = event.clientX - box.width - pad;
  if (y + box.height > window.innerHeight - pad) y = event.clientY - box.height - pad;
  els.tooltip.style.left = `${Math.max(pad, x)}px`;
  els.tooltip.style.top = `${Math.max(pad, y)}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

/* ---------- paste / analyse ---------- */

function servedOverHttp() {
  return location.protocol === 'http:' || location.protocol === 'https:';
}

async function analyse() {
  const lyrics = els.lyricsInput.value.trim();
  if (!lyrics) {
    setStatus('Paste some lyrics first.', true);
    return;
  }
  if (!servedOverHttp()) {
    setStatus('Analysing needs the local server: run `make serve`.', true);
    return;
  }

  els.analyseBtn.disabled = true;
  setStatus('Analysing...');
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lyrics, engine: els.engine.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    verses.unshift(payload);
    populateTracks();
    els.track.value = '0';
    show(payload);
    setStatus(`Done: ${payload.metrics.syllables} syllables, ${payload.metrics.signatures} groups.`);
  } catch (error) {
    setStatus(String(error.message || error), true);
  } finally {
    els.analyseBtn.disabled = false;
  }
}

async function reanalyseCurrent() {
  if (!current || !current.text) return;
  if (!servedOverHttp()) {
    setStatus('Switching engines needs the local server: run `make serve`.', true);
    els.pastePanel.hidden = false;
    els.engine.value = current.engine;
    return;
  }

  const index = verses.indexOf(current);
  setStatus(`Re-analysing with ${els.engine.value}...`);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lyrics: current.text,
        artist: current.artist,
        track: current.track,
        engine: els.engine.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    if (index >= 0) verses[index] = payload;
    show(payload);
    setStatus(`${payload.engine}: ${payload.metrics.density}% density, ${payload.metrics.signatures} groups.`);
  } catch (error) {
    setStatus(String(error.message || error), true);
    els.engine.value = current.engine;
  }
}

function setStatus(text, isError) {
  els.pasteStatus.textContent = text;
  els.pasteStatus.classList.toggle('error', Boolean(isError));
}

/* ---------- wiring ---------- */

function populateTracks() {
  els.track.innerHTML = '';
  verses.forEach((verse, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${verse.artist} - ${verse.track}`;
    els.track.appendChild(option);
  });
}

function init() {
  document.body.classList.add('dim');

  els.lyrics.addEventListener('mouseover', (event) => {
    const el = event.target.closest('.syllable');
    if (!el) return;
    showTooltip(el, event);
    if (!isolated && el.dataset.label) trace(el.dataset.label);
  });
  els.lyrics.addEventListener('mousemove', (event) => {
    if (!els.tooltip.hidden) {
      const el = event.target.closest('.syllable');
      if (el) showTooltip(el, event);
    }
  });
  els.lyrics.addEventListener('mouseleave', () => {
    hideTooltip();
    if (!isolated) trace(null);
  });
  els.lyrics.addEventListener('click', (event) => {
    const el = event.target.closest('.syllable[data-label]');
    if (el) toggleIsolate(el.dataset.label);
  });

  els.track.addEventListener('change', (event) => {
    const verse = verses[Number(event.target.value)];
    if (verse) show(verse);
  });

  // Re-run the displayed verse through another engine, so the four engines can
  // be compared side by side on the same lyrics. Needs the local server.
  els.engine.addEventListener('change', () => {
    if (current && current.engine !== els.engine.value) reanalyseCurrent();
  });

  els.pasteToggle.addEventListener('click', () => {
    els.pastePanel.hidden = !els.pastePanel.hidden;
    if (!els.pastePanel.hidden) {
      els.lyricsInput.focus();
      if (!servedOverHttp()) {
        setStatus('Opened from a file, so analysing is unavailable. Run `make serve`.', true);
      }
    }
  });

  els.analyseBtn.addEventListener('click', analyse);
  els.lyricsInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) analyse();
  });

  /* `timeupdate` only fires while the media is actually advancing, so scrubbing
   * a paused track left the highlight where it was. `seeked` covers that. */
  ['timeupdate', 'seeked', 'loadedmetadata'].forEach((event) => {
    els.audio.addEventListener(event, () => {
      if (timedSyllables.length) highlightAt(els.audio.currentTime);
    });
  });
  els.audio.addEventListener('ended', clearPlaying);

  els.dimToggle.addEventListener('click', () => {
    const on = document.body.classList.toggle('dim');
    els.dimToggle.setAttribute('aria-pressed', String(on));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isolated) toggleIsolate(isolated);
  });

  if (!verses.length) {
    els.lyrics.innerHTML =
      '<p class="placeholder">No pre-exported verses found. Run <code>make web</code> to generate ' +
      '<code>web/data.js</code>, or <code>make serve</code> and paste your own lyrics.</p>';
    els.track.innerHTML = '<option>no data</option>';
    return;
  }

  populateTracks();
  show(verses[0]);
}

document.addEventListener('DOMContentLoaded', init);
