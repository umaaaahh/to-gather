import { ASSETS } from "./assets";

// A soft pop on every button press, wired once at the document level so new
// buttons get it for free. Plain <audio> elements rather than Web Audio: the
// r2.dev bucket sends no Access-Control-Allow-Origin header, so fetching the
// file to decode it would fail, but an <audio> element plays it fine.
//
// A small round-robin pool so quick double taps each get their own pop
// instead of cutting the last one off.

const POOL_SIZE = 4;
const VOLUME = 0.5;

// Things that count as a press. Range inputs (the radio volume) and the
// drawing canvas are deliberately left out — they'd pop on every drag.
const CLICKABLE = 'button, a[href], [role="button"], summary';

let pool = [];
let next = 0;

function play() {
  const el = pool[next];
  next = (next + 1) % pool.length;
  el.currentTime = 0;
  // Autoplay rules can still reject (e.g. before the page counts the click
  // as a gesture); a missed pop isn't worth surfacing.
  el.play().catch(() => {});
}

function onClick(e) {
  const target = e.target.closest?.(CLICKABLE);
  if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
  play();
}

export function installClickSounds() {
  if (pool.length) return; // already installed (StrictMode / HMR)
  pool = Array.from({ length: POOL_SIZE }, () => {
    const el = new Audio(ASSETS.clickPop);
    el.preload = "auto";
    el.volume = VOLUME;
    return el;
  });
  // Capture phase, so a handler that stops propagation still pops.
  document.addEventListener("click", onClick, true);
}
