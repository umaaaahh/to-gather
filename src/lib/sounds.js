import { soundOn } from "./a11y";
import { ASSETS } from "./assets";

// Every sound the site plays, wired through here so the accessibility menu's
// Sound switch covers them all. Plain <audio> elements rather than Web Audio:
// the r2.dev bucket sends no Access-Control-Allow-Origin header, so fetching
// the file to decode it would fail, but an <audio> element plays it fine.
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
  close: null, // a popup's × — a soft paper fold / whoosh down
  welcome: null, // Acknowledgement of Country's Continue — gentle warm chime
  oops: null, // the "couldn't save" toast — a soft, low bonk (not an alarm)

  // ---- The street ---------------------------------------------------------
  sunDraw: null, // the sun's Draw — bright twinkle as the zones appear
  sunBack: null, // the sun's Back — the same twinkle, falling
  noticeBoard: null, // What's on — paper flutter, pin pushed into cork
  radioOpen: ASSETS.radioOpenSound, // the window boombox, opening the radio
  bookOpen: null, // The Shelf — a book pulled off the shelf, pages riffled
  signCreak: null, // About — a metal street sign creaking on its post
  neonBuzz: null, // Stats — neon tube flickering on with a buzz
  openCanvas: null, // a tree / flower bed / free zone — paper unrolled flat

  // ---- Kangaroo tour ------------------------------------------------------
  hop: ASSETS.kangarooHopSound, // each hop of the kangaroo, in or off
  bubble: null, // each new speech bubble — a little blip
  cheer: null, // the kangaroo cheering a just-landed drawing

  // ---- Drawing canvas -----------------------------------------------------
  crayon: null, // LOOP while the brush is down — waxy crayon on paper
  eraser: null, // LOOP while the eraser is down — rubber on paper
  undo: null, // Undo — a quick reverse swish
  crumple: null, // Clear — paper scrunched up
  submit: null, // Done — paper lifted / whoosh up

  // ---- A drawing arriving on the street (DrawingArrival) ------------------
  reveal: ASSETS.revealSound, // "Your drawing is on the street!"
  whoosh: null, // the drawing flying to its spot
  landed: null, // it lands and glows — a warm chime

  // ---- Popups -------------------------------------------------------------
  radioButton: ASSETS.radioButtonSound, // the boombox's station keys
  radioPower: ASSETS.radioPowerSound, // the boombox's power button
  tuning: null, // LOOP while a station is tuning in — dial static
  vote: null, // The Shelf's vote button — a light tick
  bookAdded: null, // a book saved to the shelf — a soft thud as it's shelved
  pageTurn: null, // What's on's month arrows — a page turning

  // ---- Ambience -----------------------------------------------------------
  street: null, // LOOP under the street — birds, leaves, a distant tram bell
};

const VOLUME = 0.5;
const AMBIENCE_VOLUME = 0.25;
// Cues that sit louder or quieter than VOLUME (0–1).
const CUE_VOLUME = { click: 0.8, hop: 0.35 };
// Cues cut off after this many ms, for files that run longer than the moment
// they go with. These also skip preloading the whole file, so a long one
// isn't downloaded up front. None need it right now.
const CUE_MAX_MS = {};

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

/** Play a one-shot cue. Placeholders (no file yet) do nothing. */
export function playSound(name) {
  if (!hasSound(name) || !soundOn()) return;
  const pool = poolFor(name);
  const el = pool.els[pool.next];
  pool.next = (pool.next + 1) % pool.els.length;
  el.currentTime = 0;
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
 * Loop a cue until the returned function is called. Safe to call for a
 * placeholder — it returns a no-op stop.
 */
export function startLoop(name, volume = VOLUME) {
  if (!hasSound(name) || !soundOn()) return () => {};
  const el = makeEl(SFX[name], volume);
  el.loop = true;
  tryPlay(el);
  return () => {
    el.pause();
    el.src = ""; // let it go, rather than keep it buffering
  };
}

// ---- Street ambience --------------------------------------------------------
// One quiet loop under the street. It's on while the street wants it, and
// steps aside while the radio plays (the two would just be noise), while the
// tab is hidden, and whenever the Sound switch is off.

const ambience = { wanted: false, ducked: false, el: null };

function syncAmbience() {
  if (!hasSound("street")) return;
  const on = ambience.wanted && !ambience.ducked && soundOn() && !document.hidden;
  if (on) {
    if (!ambience.el) {
      ambience.el = makeEl(SFX.street, AMBIENCE_VOLUME);
      ambience.el.loop = true;
    }
    if (ambience.el.paused) tryPlay(ambience.el);
  } else {
    ambience.el?.pause();
  }
}

/** The street is on screen (true) or gone (false). */
export function setAmbience(on) {
  ambience.wanted = on;
  syncAmbience();
}

/** Something else is making noise (the radio) — step the ambience aside. */
export function duckAmbience(ducked) {
  ambience.ducked = ducked;
  syncAmbience();
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
  poolFor("click"); // warm the pop up front so the first tap isn't late
  // Capture phase, so a handler that stops propagation still pops.
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", syncAmbience);
  // The accessibility menu's Sound switch flips data-sound on <html>.
  new MutationObserver(syncAmbience).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-sound"],
  });
}
