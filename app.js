(() => {
'use strict';
const $ = id => document.getElementById(id);
const root = document.documentElement, body = document.body;
const sky = $('sky'), ctx = sky.getContext('2d');
const verse = $('verse'), arabic = $('arabic'), english = $('english'), sign = $('sign');
const still = root.dataset.motion === 'off';
const FLY = 1300; // ms a dot spends travelling
const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------- Quran text ---------- */
// Loaded as a script so the page also works when opened straight from disk.
let quran;
function loadQuran() {
  return quran ||= new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'quran.js';
    s.onload = () => ok(window.QURAN);
    s.onerror = () => { quran = null; s.remove(); no(new Error('quran.js did not load')); };
    document.head.append(s);
  });
}

// A shuffled deck of every ayah: nothing repeats until all have been seen.
let deck = [];
function draw(Q) {
  if (!deck.length) {
    Q.forEach((s, i) => s.a.forEach((_, j) => deck.push([i, j])));
    shuffle(deck);
  }
  return deck.pop();
}

/* ---------- sky ---------- */
let W, H, dpr, ink = '#fff', stars = [], spin = 0;
let flight = null; // dots travelling into the shape of the ayah
function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  sky.width = W * dpr; sky.height = H * dpr;
  flight = null;
  const reach = Math.hypot(W, H) * .62;
  const n = Math.round(clamp(W * H / 4200, 120, 420));
  stars = Array.from({ length: n }, () => ({
    r: Math.sqrt(Math.random()) * reach, t: rand(0, Math.PI * 2),
    s: Math.random() ** 4 * 1.5 + .5, a: rand(.15, .8), p: rand(0, 6.3), f: rand(.3, 1.3)
  }));
}

const ease = p => p < .5 ? 4 * p * p * p : 1 - (2 - 2 * p) ** 3 / 2;
let last = 0;
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, .05); last = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ctx.strokeStyle = ink;
  ctx.lineCap = 'round';

  // The whole sky wheels slowly; each press sets it spinning, then it settles.
  spin *= Math.exp(-dt * 1.5);
  const speed = still ? 0 : .006 + spin, cx = W / 2, cy = H * .44;
  const dim = body.dataset.state === 'verse' ? .55 : 1;
  const trail = Math.min(spin * .16, .3);
  for (const s of stars) {
    s.t += speed * dt;
    ctx.globalAlpha = s.a * dim * (still ? 1 : .65 + .35 * Math.sin(now / 1000 * s.f + s.p));
    ctx.beginPath();
    if (trail > .004) {
      ctx.lineWidth = s.s;
      ctx.arc(cx, cy, s.r, s.t - trail, s.t);
      ctx.stroke();
    } else {
      ctx.arc(cx + Math.cos(s.t) * s.r, cy + Math.sin(s.t) * s.r, s.s * .75, 0, 7);
      ctx.fill();
    }
  }

  if (flight) {
    const t = now - flight.start;
    let alive = false;
    for (const d of flight.dots) {
      const raw = (t - d.delay) / FLY;
      if (raw > 1.8) continue;
      alive = true;
      const p = ease(clamp(raw, 0, 1)), q = 1 - p;
      let a = d.lit ? 1 : clamp(t / 500, 0, 1) * (.35 + .65 * p);
      if (raw > 1.15) a *= clamp(1 - (raw - 1.15) / .6, 0, 1);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(q * q * d.x0 + 2 * q * p * d.cx + p * p * d.x1,
                   q * q * d.y0 + 2 * q * p * d.cy + p * p * d.y1, d.s, d.s);
    }
    if (!alive) flight = null;
  }
  ctx.globalAlpha = 1;
  if (!still) requestAnimationFrame(frame);
}

/* ---------- turning text into dots ---------- */
// Draw the visible Arabic words to a hidden canvas exactly where the page has them.
function sample(limit) {
  const box = arabic.getBoundingClientRect();
  const x0 = Math.max(0, Math.floor(box.left - 20)), y0 = Math.max(0, Math.floor(box.top));
  const w = Math.min(W, Math.ceil(box.right + 20)) - x0, h = Math.min(H, Math.ceil(box.bottom)) - y0;
  if (w <= 0 || h <= 0) return [];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const cs = getComputedStyle(arabic);
  g.font = `${cs.fontSize} ${cs.fontFamily}`;
  g.direction = 'rtl'; g.textAlign = 'right';
  const up = g.measureText('ب').fontBoundingBoxAscent;
  for (const el of arabic.children) {
    const r = el.getBoundingClientRect();
    if (r.top < H && r.bottom > 0) g.fillText(el.textContent.replace(' ', ' '), r.right - x0, r.top + up - y0);
  }
  const px = g.getImageData(0, 0, w, h).data, pts = [];
  for (let i = 3, k = 0; i < px.length; i += 4, k++)
    if (px[i] > 110) pts.push([x0 + k % w, y0 + (k / w | 0)]);
  return shuffle(pts).slice(0, limit);
}

// When a point of the text gets "written": line by line, right to left.
function writer(box, line, span) {
  const rows = Math.max(1, Math.round(box.height / line));
  return (x, y) => {
    const row = clamp(Math.floor((y - box.top) / line), 0, rows - 1);
    return (row + clamp((box.right - x) / box.width, 0, 1)) / rows * span;
  };
}

function fly(from, to, when) {
  flight = {
    start: performance.now(),
    dots: to.map(([x1, y1], i) => {
      const lit = from.length > 0;
      let x0, y0;
      if (lit) [x0, y0] = from[i % from.length];
      else {
        const a = rand(0, 6.283), r = rand(.15, .75) * Math.hypot(W, H);
        x0 = W / 2 + Math.cos(a) * r; y0 = H * .44 + Math.sin(a) * r;
      }
      // Swing out around the centre, the same way the sky turns.
      const mx = (x0 + x1) / 2 - W / 2, my = (y0 + y1) / 2 - H * .44, k = lit ? rand(.5, 1.5) : rand(.3, .9);
      return {
        x0, y0, x1, y1, lit,
        cx: W / 2 + mx - my * k + rand(-1, 1) * W * .16,
        cy: H * .44 + my + mx * k + rand(-1, 1) * H * .3,
        delay: when(x1, y1) + rand(0, 160), s: to.length > 3000 ? 1.3 : 1.6
      };
    })
  };
}

/* ---------- showing an ayah ---------- */
function fill(node, text) {
  node.replaceChildren();
  // Pause marks stand alone in the text; keep each one with the word before it.
  return text.replace(/ (?=\p{M})/gu, '\u0000').split(' ').map((w, i) => {
    const s = document.createElement('span');
    s.textContent = w.replaceAll('\u0000', ' ');
    if (i) node.append(' ');
    node.append(s);
    return s;
  });
}

let current = null, busy = false;
async function show(pick) {
  if (busy) return;
  busy = true;
  sign.setAttribute('aria-disabled', 'true');
  try {
    const [Q] = await Promise.all([
      loadQuran(),
      Promise.race([
        Promise.all([document.fonts.load('40px "Amiri Quran"', 'بِسْمِ'), document.fonts.load('24px Alegreya')]).catch(() => {}),
        wait(3500)
      ])
    ]);
    const [s, a] = pick || draw(Q);
    const surah = Q[s], [ar, en] = surah.a[a];
    const limit = W < 700 ? 3200 : 6500;
    let from = [];

    if (!still) spin = 2.4;
    sign.style.setProperty('--turn', (+sign.style.getPropertyValue('--turn') || 0) + 1);

    if (current) {
      // The old ayah becomes dots in place before they fly to the next one.
      if (!still) {
        from = sample(limit);
        fly(from, from, () => 0);
        for (const d of flight.dots) { d.cx = d.x0; d.cy = d.y0; }
      }
      verse.classList.add('out');
      await wait(still ? 0 : 300);
    }

    current = { s, a };
    body.dataset.state = 'verse';
    verse.hidden = false;
    verse.classList.remove('in', 'out');
    scrollTo(0, 0);

    const len = Math.log2(Math.max(ar.length, 30) / 30);
    arabic.style.setProperty('--ar', `min(${clamp(5.6 - len * .78, 1.8, 5.6)}rem, ${clamp(13 - len * 1.5, 7, 13)}vw)`);
    english.style.setProperty('--en', `${clamp(1.8 - Math.log2(Math.max(en.length, 80) / 80) * .13, 1.2, 1.8)}rem`);
    const arWords = fill(arabic, ar), enWords = fill(english, en);
    const ref = `${s + 1}:${a + 1}`;
    $('ref').textContent = `${surah.n} (${surah.m}), ${ref}`;
    $('context').href = `https://quran.com/${s + 1}/${a + 1}`;
    $('copy').textContent = 'Copy';
    $('label').textContent = 'Show me another';
    document.title = `${surah.n} ${ref}`;
    history.replaceState(null, '', '#' + ref);

    const box = arabic.getBoundingClientRect(), line = parseFloat(getComputedStyle(arabic).lineHeight);
    const span = still ? 0 : clamp(ar.length * 9, 400, 1900), when = writer(box, line, span);
    for (const el of arWords) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--d', (still ? 0 : when(r.left + r.width / 2, r.top + r.height / 2) + FLY - 120) + 'ms');
    }
    const enStart = still ? 0 : FLY + span * .55, step = still ? 0 : Math.min(45, 1500 / enWords.length);
    enWords.forEach((el, i) => el.style.setProperty('--d', enStart + i * step + 'ms'));
    $('source').style.setProperty('--d', (still ? 0 : enStart + enWords.length * step + 200) + 'ms');

    if (!still) fly(from, sample(limit), when);
    void verse.offsetWidth;
    verse.classList.add('in');
    await wait(still ? 50 : Math.max(FLY + span, enStart + 400));
  } catch (err) {
    console.error(err);
    $('label').textContent = 'Could not load. Press to try again';
  }
  sign.removeAttribute('aria-disabled');
  busy = false;
}

sign.addEventListener('click', () => show());

// A link like #13:28 opens that ayah.
async function openHash() {
  const m = /^#(\d{1,3}):(\d{1,3})$/.exec(location.hash);
  if (!m) return;
  try {
    const Q = await loadQuran(), s = m[1] - 1, a = m[2] - 1;
    if (Q[s]?.a[a] && !(current && current.s === s && current.a === a)) show([s, a]);
  } catch (e) { console.error(e); }
}
addEventListener('hashchange', openHash);

$('copy').addEventListener('click', async () => {
  const s = window.QURAN[current.s], [ar, en] = s.a[current.a];
  const text = `${ar}\n\n${en}\n\n${s.n} ${current.s + 1}:${current.a + 1}\n${location.href}`;
  try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied'; }
  catch { $('copy').textContent = 'Copy was blocked'; }
  setTimeout(() => { $('copy').textContent = 'Copy'; }, 1800);
});

/* ---------- animation switch, only shown when the device asks for less motion ---------- */
$('motion').textContent = still ? 'Turn on animation' : 'Turn off animation';
$('motion').addEventListener('click', () => {
  try { localStorage.setItem('motion', still ? 'on' : 'off'); } catch {}
  location.reload();
});

/* ---------- theme ---------- */
function applyTheme(t) {
  root.dataset.theme = t;
  ink = t === 'dark' ? '#fff' : '#000';
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#000000' : '#ffffff';
  $('theme').setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
  if (still) frame(performance.now());
}
$('theme').addEventListener('click', async e => {
  const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
  const r = e.currentTarget.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  try { localStorage.setItem('theme', t); } catch {}
  if (still || !document.startViewTransition) return applyTheme(t);
  const vt = document.startViewTransition(() => applyTheme(t));
  try { await vt.ready; } catch { return; }
  root.animate(
    { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${Math.hypot(x, H - y)}px at ${x}px ${y}px)`] },
    { duration: 900, easing: 'cubic-bezier(.65,0,.2,1)', pseudoElement: '::view-transition-new(root)' });
});

addEventListener('resize', () => { resize(); if (still) frame(performance.now()); });
resize();
applyTheme(root.dataset.theme);
if (!still) requestAnimationFrame(frame);
loadQuran().then(openHash).catch(() => {});
})();
