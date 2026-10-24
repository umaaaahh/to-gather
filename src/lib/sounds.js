import { useEffect } from "react";
import { musicOn, musicVolume, soundOn, soundVolume } from "./a11y";
import { ASSETS } from "./assets";

// Every sound the site plays, wired through here so the Settings menu's
// switches cover them all: Sound effects for the cues, Background music for
// the street's music loop. Mostly plain <audio> elements: the r2.dev
// bucket sends no Access-Control-Allow-Origin header, so fetching a file to
// decode it would fail, but an <audio> element plays it fine. Bundled cues
// (the click pop) use Web Audio instead, which starts instantly — see
// "Instant playback" below.
//
// Three ways in:
//   - Button presses, wired once at the document level so new buttons get a
//     sound for free. A button plays the soft pop, or the cue named by its
//     data-sfx attribute (data-sfx="none" for silence). A named cue with no
//     file yet falls back to the pop, so tagging a button never goes quiet.
//   - playSound(name) for moments that aren't a press (a drawing landing).
//   - startLoop(name) for sounds that last as long as something happens
//     (the crayon on the paper), and the street ambience below.
//
// PLACEHOLDERS: every cue set to null below is a spot that's wired up but has
// no file yet. Drop the file in the bucket, put its url() in ASSETS and point
// the cue at it — nothing else needs to change. Keep files short, quiet and
// trimmed tight at the start, since they play on a tap.
export const SFX = {
  // ---- UI -----------------------------------------------------------------
  click: ASSETS.clickPop, // the default pop on every button press
  popupOpen: ASSETS.popupOpenSound, // Radio, The Shelf, About, Stats and the drawing canvas opening (usePopupSound)
  close: null, // a popup's × — a soft paper fold / whoosh down
  welcome: null, // Acknowledgement of Country's Continue — gentle warm chime
  oops: null, // the "couldn't save" toast — a soft, low bonk (not an alarm)

  // ---- The street ---------------------------------------------------------
  sunDraw: null, // the sun's Draw — bright twinkle as the zones appear
  sunBack: null, // the sun's Back — the same twinkle, falling
  noticeBoard: ASSETS.noticeBoardSound, // What's on popping up (EventsPopout plays it)
  radioOpen: null, // the window boombox, opening the radio — the click pop, by choice
  bookOpen: null, // The Shelf — a book pulled off the shelf, pages riffled
  signCreak: null, // About — a metal street sign creaking on its post
  neonBuzz: null, // Stats — neon tube flickering on with a buzz
  openCanvas: null, // a tree / flower bed / free zone — paper unrolled flat

  // ---- Kangaroo tour ------------------------------------------------------
  hop: ASSETS.kangarooHopSound, // each hop of the kangaroo, in or off
  bubble: ASSETS.bubbleSound, // each speech bubble as it pops or slides in
  cheer: ASSETS.cheerSound, // the kangaroo cheering a just-landed drawing, as it hops in

  // ---- Drawing canvas -----------------------------------------------------
  crayon: null, // LOOP while the brush is down — waxy crayon on paper
  eraser: null, // LOOP while the eraser is down — rubber on paper
  undo: null, // Undo — a quick reverse swish
  crumple: null, // Clear — paper scrunched up
  submit: null, // Done — paper lifted / whoosh up

  // ---- A drawing arriving on the street (DrawingArrival) ------------------
  reveal: ASSETS.revealSound, // "Your drawing is on the street!"
  whoosh: null, // the drawing flying to its spot
  landed: ASSETS.harpSound, // it lands and glows

  // ---- Popups -------------------------------------------------------------
  radioButton: ASSETS.radioButtonSound, // the boombox's station keys
  radioPower: ASSETS.radioPowerSound, // the boombox's power button
  tuning: ASSETS.radioStaticSound, // LOOP while a station is tuning in
  vote: null, // The Shelf's vote button — a light tick
  bookAdded: ASSETS.harpSound, // a book recommendation saved to the shelf
  pageTurn: null, // What's on's month arrows — a page turning

  // ---- Ambience -----------------------------------------------------------
  street: ASSETS.streetAmbience, // LOOP under the street — cute lofi
};

const VOLUME = 0.5;
// The street music at the Settings menu's Music volume of 100%; its default
// 50% gives half this.
const AMBIENCE_VOLUME_MAX = 0.1;
// Cues that sit louder or quieter than VOLUME (0–1).
const CUE_VOLUME = { click: 0.8, hop: 0.045, tuning: 0.3, noticeBoard: 0.25, cheer: 0.12 };
// A cue's level right now: its mix above, scaled by the Settings menu's
// Sound effects volume (100% plays it as mixed; the default 50% at half).
const cueLevel = (name, base = CUE_VOLUME[name] ?? VOLUME) => base * soundVolume();
// Cues cut off after this many ms, for files that run longer than the moment
// they go with. These also skip preloading the whole file, so a long one
// isn't downloaded up front. None need it right now.
const CUE_MAX_MS = {};
// Cues whose file opens with silence: play from this far in (ms), so the
// sound lands on the tap. Measured from each file's first audible sample.
const CUE_START_MS = { popupOpen: 200, radioButton: 290, radioPower: 390 };

// Things that count as a press. Range inputs (the radio volume) and the
// drawing canvas are deliberately left out — they'd pop on every drag.
const CLICKABLE = 'button, a[href], [role="button"], summary';

// Cues for buttons that can't easily carry a data-sfx (shared classes used
// across many components). data-sfx on the button still wins.
const SFX_BY_CLASS = [[".ui-close", "close"]];

// A small round-robin pool per cue, so quick double taps each get their own
// sound instead of cutting the last one off. Built on first use.
const POOL_SIZE = 4;
const pools = new Map();

function poolFor(name) {
  let pool = pools.get(name);
  if (!pool) {
    const clipped = name in CUE_MAX_MS;
    pool = {
      next: 0,
      // A clipped cue only plays once at a time (a hop), so one element does.
      els: Array.from({ length: clipped ? 1 : POOL_SIZE }, () =>
        makeEl(SFX[name], CUE_VOLUME[name] ?? VOLUME, clipped ? "metadata" : "auto"),
      ),
    };
    pools.set(name, pool);
  }
  return pool;
}

function makeEl(src, volume, preload = "auto") {
  const el = new Audio(src);
  el.preload = preload;
  el.volume = volume;
  return el;
}

// Autoplay rules can still reject (e.g. before the page counts the click as a
// gesture); a missed sound isn't worth surfacing.
const tryPlay = (el) => el.play().catch(() => {});

/** True once the cue has a file (i.e. isn't still a placeholder). */
export const hasSound = (name) => Boolean(SFX[name]);

// ---- Instant playback (Web Audio) -------------------------------------------
// An <audio> element can take a noticeable moment to start, which a button
// press feels. Web Audio plays a decoded copy straight away — but decoding
// means fetching the file, which needs CORS, and the r2.dev bucket sends no
// Access-Control-Allow-Origin. So cues from DECODE_ORIGINS (the site itself:
// the bundled click pop, see assets.js) go through Web Audio, and the rest
// stay on <audio> elements. Once the bucket's CORS policy allows this site,
// add its origin here and every cue gets instant playback.
const DECODE_ORIGINS = [location.origin];
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null;
const buffers = new Map(); // name -> AudioBuffer, null while loading, false if it failed

function canDecode(name) {
  if (!AC || !SFX[name]) return false;
  try {
    return DECODE_ORIGINS.includes(new URL(SFX[name], location.href).origin);
  } catch {
    return false;
  }
}

function decodeCue(name) {
  if (!canDecode(name) || buffers.has(name)) return;
  ctx ??= new AC();
  buffers.set(name, null);
  fetch(SFX[name])
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => buffers.set(name, buf))
    .catch(() => buffers.set(name, false)); // falls back to an <audio> element
}

// Browsers start a Web Audio context suspended until the first gesture.
// Waking it on pointerdown/keydown, before the click lands, means even the
// first pop is on time.
function wakeAudio() {
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

function playBuffer(name) {
  const buf = buffers.get(name);
  if (!buf) return false;
  wakeAudio();
  const source = ctx.createBufferSource();
  source.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = cueLevel(name);
  source.connect(gain).connect(ctx.destination);
  source.start(0, (CUE_START_MS[name] ?? 0) / 1000);
  const maxMs = CUE_MAX_MS[name];
  if (maxMs) source.stop(ctx.currentTime + maxMs / 1000);
  return true;
}

/** Play a one-shot cue. Placeholders (no file yet) do nothing. */
export function playSound(name) {
  if (!hasSound(name) || !soundOn()) return;
  if (playBuffer(name)) return;
  const pool = poolFor(name);
  const el = pool.els[pool.next];
  pool.next = (pool.next + 1) % pool.els.length;
  el.volume = cueLevel(name); // set per play: the pool outlives slider changes
  el.currentTime = (CUE_START_MS[name] ?? 0) / 1000;
  const maxMs = CUE_MAX_MS[name];
  if (maxMs) {
    // Timed from when it actually starts sounding, not from the play() call —
    // a long file can take longer than maxMs to start streaming.
    clearTimeout(el.clipTimer);
    el.onplaying = () => {
      clearTimeout(el.clipTimer);
      el.clipTimer = setTimeout(() => el.pause(), maxMs);
    };
  }
  tryPlay(el);
}

/** Start loading a cue before it's needed (e.g. as the tour opens). */
export function warmSound(name) {
  if (hasSound(name)) poolFor(name).els.forEach((el) => el.load());
}

/**
 * A popup's opening sound, each time `open` turns true — however it was
 * opened (a street button, the mini radio...).
 */
export function usePopupSound(open, name = "popupOpen") {
  useEffect(() => {
    if (open) playSound(name);
  }, [open, name]);
}

/**
 * Loop a cue until the returned function is called. Safe to call for a
 * placeholder — it returns a no-op stop.
 */
export function startLoop(name, volume = CUE_VOLUME[name] ?? VOLUME) {
  if (!hasSound(name) || !soundOn()) return () => {};
  const el = makeEl(SFX[name], cueLevel(name, volume));
  el.loop = true;
  tryPlay(el);
  return () => {
    el.pause();
    el.src = ""; // let it go, rather than keep it buffering
  };
}

// ---- Street ambience --------------------------------------------------------
// One quiet music loop under the street. It fades in while the street wants
// it, and steps aside for whatever else is going on (useDuckAmbience /
// duckAmbience): "dip" fades it down to AMBIENCE_DIP of its level (a popup
// or the drawing canvas open, the intro tour), "mute" fades it out entirely
// (the splash before Continue, the radio playing). It stops outright while
// the tab is hidden or the Background music switch is off.
//
// The fades step the <audio> element's volume. iOS Safari ignores that, so
// there it plays at the file's own level and just starts, and stops once the
// fade-out time is up (and doesn't dip).

const AMBIENCE_FADE_IN_MS = 1500;
const AMBIENCE_FADE_OUT_MS = 700;
const AMBIENCE_DIP = 0.25; // of its level, while something's open
// Following the Music volume slider: quick, so it tracks the drag.
const AMBIENCE_VOLUME_FADE_MS = 120;
// ducks: key -> "dip" | "mute". target: the volume it's at or fading
// towards (0 = fading out / stopped). starting: a play() is in flight.
const ambience = { wanted: false, ducks: new Map(), el: null, target: 0, timer: null, starting: false };

// The volume the ambience should be at right now.
function ambienceLevel() {
  if (!ambience.wanted) return 0;
  const modes = [...ambience.ducks.values()];
  if (modes.includes("mute")) return 0;
  const full = AMBIENCE_VOLUME_MAX * musicVolume();
  return modes.length ? full * AMBIENCE_DIP : full;
}

function fadeAmbience(to, ms, then) {
  const el = ambience.el;
  const from = el.volume;
  const start = performance.now();
  clearInterval(ambience.timer);
  ambience.timer = setInterval(() => {
    const t = Math.min((performance.now() - start) / ms, 1);
    el.volume = from + (to - from) * t;
    if (t === 1) {
      clearInterval(ambience.timer);
      then?.();
    }
  }, 30);
}

// fadeMs overrides the fade time (the volume slider); anything else passed
// in (it's also an event listener) is ignored.
function syncAmbience(fadeMs) {
  if (!hasSound("street")) return;
  const quick = typeof fadeMs === "number" ? fadeMs : null;
  if (!musicOn() || document.hidden) {
    // Off straight away, not faded: the visitor asked for quiet, or can't
    // hear it anyway (and a hidden tab throttles the fade's timer).
    clearInterval(ambience.timer);
    ambience.target = 0;
    if (ambience.el) {
      ambience.el.pause();
      ambience.el.volume = 0;
    }
    return;
  }
  const level = ambienceLevel();
  if (level > 0) {
    if (!ambience.el) {
      ambience.el = makeEl(SFX.street, 0);
      ambience.el.loop = true;
    }
    const el = ambience.el;
    if (el.paused) {
      ambience.target = level;
      // Fades in once it's actually playing — autoplay rules block it until
      // the first tap, so this is retried on every call until then.
      if (ambience.starting) return;
      ambience.starting = true;
      clearInterval(ambience.timer);
      el.volume = 0;
      el.play()
        .then(() => {
          if (ambience.target > 0) fadeAmbience(ambience.target, AMBIENCE_FADE_IN_MS);
          else el.pause(); // faded out again while it was starting
        })
        .catch(() => {})
        .finally(() => (ambience.starting = false));
    } else if (ambience.target !== level) {
      // Up from a dip or a fade-out, down into a dip, or the volume slider.
      const ms = quick ?? (level > ambience.target ? AMBIENCE_FADE_IN_MS : AMBIENCE_FADE_OUT_MS);
      ambience.target = level;
      fadeAmbience(level, ms);
    }
  } else if (ambience.el && ambience.target !== 0) {
    ambience.target = 0;
    fadeAmbience(0, quick ?? AMBIENCE_FADE_OUT_MS, () => ambience.el.pause());
  }
}

/** The street is on screen (true) or gone (false). */
export function setAmbience(on) {
  ambience.wanted = on;
  syncAmbience();
}

/**
 * Something else has the stage (key: whatever's asking, e.g. "radio") —
 * mode "dip" turns the ambience down, "mute" fades it out, and a falsy mode
 * lets go. It comes back once every key has let go.
 */
export function duckAmbience(key, mode) {
  if (mode) ambience.ducks.set(key, mode);
  else ambience.ducks.delete(key);
  syncAmbience();
}

/**
 * Turn the ambience down ("dip": a popup open, the canvas up) or off
 * ("mute") while `active`.
 */
export function useDuckAmbience(active, mode = "dip") {
  useEffect(() => {
    if (!active) return undefined;
    const key = Symbol("duck");
    duckAmbience(key, mode);
    return () => duckAmbience(key, false);
  }, [active, mode]);
}

// ---- Button presses ---------------------------------------------------------

function cueFor(target) {
  const named = target.dataset.sfx ?? SFX_BY_CLASS.find(([sel]) => target.matches(sel))?.[1];
  if (named === "none") return null;
  return named && hasSound(named) ? named : "click";
}

function onClick(e) {
  // A press counts as a gesture, so it's the moment an ambience loop that
  // autoplay blocked earlier can start.
  syncAmbience();
  const target = e.target.closest?.(CLICKABLE);
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  const cue = cueFor(target);
  if (cue) playSound(cue);
}

let installed = false;

export function installClickSounds() {
  if (installed) return; // already installed (StrictMode / HMR)
  installed = true;
  // Decode what Web Audio can up front, so the first tap isn't late; warm an
  // <audio> pool for the pop only if it can't go through Web Audio.
  Object.keys(SFX).forEach(decodeCue);
  if (!canDecode("click")) poolFor("click");
  // Capture phase, so a handler that stops propagation still pops.
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", wakeAudio, true);
  document.addEventListener("keydown", wakeAudio, true);
  document.addEventListener("visibilitychange", syncAmbience);
  // The Settings menu's Background music switch and Music volume slider set
  // data-music and data-music-volume on <html>.
  new MutationObserver((records) => {
    const slider = records.every((r) => r.attributeName === "data-music-volume");
    syncAmbience(slider ? AMBIENCE_VOLUME_FADE_MS : undefined);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-music", "data-music-volume"],
  });
}
