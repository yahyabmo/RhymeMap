/* Visual effects, ported to vanilla JS from the patterns in react-bits
 * (https://github.com/DavidHDev/react-bits): Aurora, Noise, SplitText, CountUp,
 * ClickSpark, Magnet, SpotlightCard, ScrambledText, StarBorder.
 *
 * Two rules hold throughout:
 *
 *   1. `prefers-reduced-motion` disables everything. Each effect degrades to a
 *      correct static state rather than simply stopping mid-flight.
 *   2. Nothing animates off-screen. Every rAF loop is driven by one shared
 *      ticker that pauses when the tab is hidden.
 */

'use strict';

const Effects = (() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => reduced.matches;

  /* ---------- shared ticker ---------- */

  const tasks = new Set();
  let running = false;

  function frame(now) {
    if (!tasks.size) { running = false; return; }
    tasks.forEach((task) => task(now));
    requestAnimationFrame(frame);
  }

  function addTask(task) {
    tasks.add(task);
    if (!running) { running = true; requestAnimationFrame(frame); }
    return () => tasks.delete(task);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && tasks.size && !running) {
      running = true;
      requestAnimationFrame(frame);
    }
  });

  /* ---------- Aurora ----------
   *
   * Drifting spectral blobs behind the page. Rather than reacting to audio
   * amplitude - which an embedded YouTube player will not hand over - it reacts
   * to the *analysis*: the hue follows the rhyme group currently being sung and
   * the energy follows how densely that moment rhymes. The background becomes a
   * reading of the verse over time, which is the whole thesis of the design.
   */

  function aurora(canvas) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return { destroy() {}, setEnergy() {}, setHue() {} };

    // Kept deliberately low. The design rule is that rhyme colour is the only
    // chroma competing for attention; an aurora bright enough to notice on its
    // own is already too bright.
    const blobs = [
      { hue: 22,  x: 0.16, y: 0.10, r: 0.52, dx: 0.000035, dy: 0.000022, a: 0.15 },
      { hue: 196, x: 0.86, y: 0.18, r: 0.44, dx: -0.00003, dy: 0.000031, a: 0.12 },
      { hue: 282, x: 0.62, y: 0.80, r: 0.58, dx: 0.000022, dy: -0.00002, a: 0.11 },
      { hue: 338, x: 0.08, y: 0.88, r: 0.40, dx: 0.000041, dy: -0.00003, a: 0.09 },
    ];

    let width = 0, height = 0, dpr = 1;
    let energy = 0.40;        // 0..1, how bright the field burns
    let targetEnergy = 0.40;
    let hueShift = 0, targetHue = 0;

    // The aurora is nothing but low-frequency gradient, so it renders at a
    // fraction of its display size and the browser's upscaling blurs it for
    // free. This replaced a full-viewport `filter: blur()` that was measured
    // costing 17fps on its own.
    const SCALE = 0.14;

    function resize() {
      dpr = SCALE;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function paint(now) {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      energy += (targetEnergy - energy) * 0.045;
      hueShift += (targetHue - hueShift) * 0.03;

      const scale = Math.max(width, height);
      for (const blob of blobs) {
        const drift = prefersReducedMotion() ? 0 : now;
        const x = (blob.x + Math.sin(drift * blob.dx) * 0.07) * width;
        const y = (blob.y + Math.cos(drift * blob.dy) * 0.07) * height;
        const radius = blob.r * scale * (0.82 + energy * 0.5);

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        const hue = (blob.hue + hueShift) % 360;
        const alpha = blob.a * (0.6 + energy * 0.55);
        gradient.addColorStop(0, `hsla(${hue}, 88%, 62%, ${alpha})`);
        gradient.addColorStop(0.45, `hsla(${hue}, 80%, 48%, ${alpha * 0.35})`);
        gradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let stop = () => {};
    if (prefersReducedMotion()) {
      paint(0);
    } else {
      stop = addTask(paint);
    }

    return {
      setEnergy(value) { targetEnergy = Math.max(0, Math.min(1, value)); },
      setHue(hue) { targetHue = hue; },
      destroy() { stop(); observer.disconnect(); },
    };
  }

  /* ---------- Noise ----------
   * A grain tile drawn once and repeated by CSS; cheaper than animating it and
   * quiet enough that it reads as film rather than as texture. */

  function noise(element, opacity = 0.035) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 40 + Math.random() * 215;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    element.style.backgroundImage = `url(${canvas.toDataURL()})`;
    element.style.opacity = String(opacity);
  }

  /* ---------- SplitText ----------
   * Per-character rise with a blur clear. Whitespace is preserved as real
   * spaces so the headline still wraps and still reads to a screen reader. */

  function splitText(element, { stagger = 26, duration = 760 } = {}) {
    const text = element.textContent;
    element.setAttribute('aria-label', text);
    element.textContent = '';

    const chars = [];
    for (const char of text) {
      const span = document.createElement('span');
      span.className = 'split-char';
      span.setAttribute('aria-hidden', 'true');
      if (char === ' ') {
        span.innerHTML = '&nbsp;';
      } else {
        span.textContent = char;
      }
      element.appendChild(span);
      chars.push(span);
    }

    if (prefersReducedMotion()) {
      chars.forEach((span) => span.classList.add('is-in'));
      return;
    }

    chars.forEach((span, i) => {
      span.style.transitionDuration = `${duration}ms`;
      span.style.transitionDelay = `${i * stagger}ms`;
    });
    requestAnimationFrame(() => chars.forEach((span) => span.classList.add('is-in')));
  }

  /* ---------- CountUp ---------- */

  function countUp(element, to, { duration = 900, decimals = 0, suffix = '' } = {}) {
    const target = Number(to) || 0;
    const render = (value) => {
      element.textContent = value.toFixed(decimals) + suffix;
    };

    if (prefersReducedMotion()) { render(target); return; }

    const from = Number(element.dataset.value || 0);
    const started = performance.now();
    element.dataset.value = String(target);

    const stop = addTask((now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      render(from + (target - from) * eased);
      if (t >= 1) stop();
    });
  }

  /* ---------- ClickSpark ---------- */

  function clickSpark(root, { color = '#ff8a3d', count = 9, distance = 38 } = {}) {
    root.addEventListener('pointerdown', (event) => {
      if (prefersReducedMotion()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const layer = document.createElement('div');
      layer.className = 'spark-layer';
      layer.style.left = `${event.clientX}px`;
      layer.style.top = `${event.clientY}px`;

      for (let i = 0; i < count; i++) {
        const spark = document.createElement('i');
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const reach = distance * (0.6 + Math.random() * 0.7);
        spark.style.setProperty('--dx', `${Math.cos(angle) * reach}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * reach}px`);
        spark.style.background = color;
        layer.appendChild(spark);
      }

      document.body.appendChild(layer);
      setTimeout(() => layer.remove(), 620);
    });
  }

  /* ---------- Magnet ---------- */

  function magnet(element, { strength = 0.32, radius = 88 } = {}) {
    if (prefersReducedMotion()) return;
    let raf = 0;

    function move(event) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const distance = Math.hypot(dx, dy);
        if (distance > radius + Math.max(box.width, box.height) / 2) {
          element.style.transform = '';
          return;
        }
        element.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
      });
    }

    window.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerleave', () => { element.style.transform = ''; });
  }

  /* ---------- SpotlightCard ---------- */

  function spotlight(element) {
    element.addEventListener('pointermove', (event) => {
      const box = element.getBoundingClientRect();
      element.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
      element.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
      element.style.setProperty('--spot-on', '1');
    });
    element.addEventListener('pointerleave', () => {
      element.style.setProperty('--spot-on', '0');
    });
  }

  /* ---------- ScrambledText ---------- */

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>[]{}#*+=-';

  function scramble(element, text, { duration = 760 } = {}) {
    if (prefersReducedMotion()) { element.textContent = text; return () => {}; }

    const started = performance.now();
    const stop = addTask((now) => {
      const t = Math.min(1, (now - started) / duration);
      const settled = Math.floor(text.length * t);
      let out = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) {
        out += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      element.textContent = out;
      if (t >= 1) { element.textContent = text; stop(); }
    });
    return stop;
  }

  /* A looping scramble for "working..." states. */
  function scrambleLoop(element, text) {
    if (prefersReducedMotion()) { element.textContent = text; return () => {}; }
    let stop = scramble(element, text);
    const timer = setInterval(() => { stop(); stop = scramble(element, text); }, 1500);
    return () => { clearInterval(timer); stop(); };
  }

  /* ---------- reveal on scroll ---------- */

  function revealOnScroll(selector = '[data-reveal]') {
    const targets = document.querySelectorAll(selector);
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }
    // threshold must stay at 0. A fractional threshold cannot fire for an
    // element taller than the viewport, and the lyrics panel routinely is:
    // 6693px of Rap God against an 844px phone screen means at most 12% of it
    // is ever on screen, so a 0.12 threshold left the whole verse invisible.
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => observer.observe(el));
  }


  /* ---------- Waves ----------
   *
   * A field of horizontal lines that ripple left to right. This is the one
   * effect that exists because the subject is music: it reads as a waveform,
   * and it is driven by playback position and the rhyme density around it, so
   * it swells where the verse is dense and settles where it thins.
   */

  function waves(canvas, { lines = 11, amplitude = 16 } = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { destroy() {}, setLevel() {}, setHue() {} };

    let width = 0, height = 0, dpr = 1;
    let level = 0.18, targetLevel = 0.18;
    let hue = 28, targetHue = 28;

    // Half resolution: these are soft 1px strokes behind content, and the
    // upscale is not perceptible.
    function resize() {
      dpr = 0.5;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function paint(now) {
      ctx.clearRect(0, 0, width, height);
      level += (targetLevel - level) * 0.08;
      hue += (targetHue - hue) * 0.04;

      const t = prefersReducedMotion() ? 0 : now / 1000;
      for (let i = 0; i < lines; i++) {
        const progress = i / (lines - 1);
        const y = height * (0.12 + progress * 0.76);
        const swell = amplitude * (0.35 + level * 1.5) * (1 - Math.abs(progress - 0.5) * 0.9);

        ctx.beginPath();
        for (let x = 0; x <= width; x += 14) {
          const phase = x / width * Math.PI * 3 + t * (0.5 + progress * 0.5) + i * 0.55;
          const offset = Math.sin(phase) * swell + Math.sin(phase * 2.3 + t * 0.7) * swell * 0.3;
          if (x === 0) ctx.moveTo(x, y + offset);
          else ctx.lineTo(x, y + offset);
        }
        // Fading here rather than with a CSS `mask-image`: masking the layer
        // cost 5fps, and the alpha is already being computed per line.
        const fade = Math.min(1, progress * 1.6);
        ctx.strokeStyle =
          `hsla(${(hue + progress * 44) % 360}, 78%, 62%, ${(0.05 + level * 0.18) * fade})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const stop = addTask(paint);

    return {
      setLevel(value) { targetLevel = Math.max(0, Math.min(1, value)); },
      setHue(value) { targetHue = value; },
      destroy() { stop(); observer.disconnect(); },
    };
  }

  /* ---------- RotatingText ----------
   * Cycles a word in place. Used in the hero to name several things the tool
   * finds, which says more than any single noun would. */

  function rotatingText(element, words, { interval = 2400 } = {}) {
    if (!words.length) return () => {};
    let index = 0;

    const render = (word) => {
      element.textContent = word;
      if (prefersReducedMotion()) return;
      element.classList.remove('is-rotating');
      void element.offsetWidth;       // restart the animation
      element.classList.add('is-rotating');
    };

    render(words[0]);
    if (prefersReducedMotion() || words.length === 1) return () => {};

    const timer = setInterval(() => {
      index = (index + 1) % words.length;
      render(words[index]);
    }, interval);
    return () => clearInterval(timer);
  }

  /* ---------- GlareHover ----------
   * A diagonal sheen that tracks the cursor across a tile. */

  function glare(element) {
    element.classList.add('has-glare');
    element.addEventListener('pointermove', (event) => {
      const box = element.getBoundingClientRect();
      element.style.setProperty('--glare-x', `${((event.clientX - box.left) / box.width) * 100}%`);
      element.style.setProperty('--glare-y', `${((event.clientY - box.top) / box.height) * 100}%`);
      element.style.setProperty('--glare-on', '1');
    });
    element.addEventListener('pointerleave', () => element.style.setProperty('--glare-on', '0'));
  }

  /* ---------- Tilt ----------
   * A few degrees of rotation towards the cursor. Kept small: a data panel that
   * pitches about is harder to read, not nicer. */

  function tilt(element, { max = 4 } = {}) {
    if (prefersReducedMotion()) return;
    let raf = 0;

    element.addEventListener('pointermove', (event) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        const px = (event.clientX - box.left) / box.width - 0.5;
        const py = (event.clientY - box.top) / box.height - 0.5;
        element.style.transform =
          `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
    });
    element.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      element.style.transform = '';
    });
  }

  /* Inertial ("smooth") scrolling is deliberately NOT implemented.
   *
   * The usual technique pins the content with `position: fixed` and translates
   * it towards the real scroll offset. Inside a fixed, transformed container
   * `position: sticky` stops resolving against the viewport -- and this page
   * relies on sticky for both the masthead and the sidebar, so the trade is a
   * slightly smoother wheel in exchange for two broken layout behaviours.
   *
   * The fluency worth having came from making each frame cheap instead; see the
   * resolution note in `aurora`. */

  /* ---------- scroll progress ---------- */

  function scrollProgress(bar) {
    const update = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* ---------- view transitions ----------
   * Cross-fades a DOM swap where the browser supports it. */

  function swap(update) {
    if (prefersReducedMotion() || !document.startViewTransition) { update(); return; }
    document.startViewTransition(update);
  }

  return {
    prefersReducedMotion, aurora, noise, splitText, countUp,
    clickSpark, magnet, spotlight, scramble, scrambleLoop, revealOnScroll,
    waves, rotatingText, glare, tilt, scrollProgress, swap,
  };
})();

window.Effects = Effects;
