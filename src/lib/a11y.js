import { useSyncExternalStore } from "react";

// Accessibility settings (the menu in AccessMenu.jsx), saved per browser
// and applied as attributes on <html>, which the stylesheets respond to:
//   data-text="md|lg|xl"   text size (--text-scale in popup.css)
//   data-motion="reduced"  reduce motion (only when reduced)
//   data-sound="off"       no click pop (lib/sounds.js); the radio is separate
//   data-contrast="high"   high contrast (popup.css)
//   data-font="readable"   Atkinson Hyperlegible everywhere (popup.css)
//
// `motion` is null until the visitor flips the switch, and while it's null
// it follows the OS prefers-reduced-motion setting, live.
//
// The inline script in index.html applies the saved settings before React
// mounts, so the page never flashes the defaults. Keep the two in step.

const KEY = "to-gather-a11y";

export const DEFAULTS = { text: "md", motion: null, sound: true, contrast: false, font: false };

const osMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS }; // storage blocked or corrupt: defaults still work
  }
}

function save(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: the settings still apply for this visit.
  }
}

export const motionReduced = (s) => (s.motion === null ? Boolean(osMotion?.matches) : s.motion === "reduced");

function apply(s) {
  const root = document.documentElement;
  const set = (name, value) => (value ? root.setAttribute(`data-${name}`, value) : root.removeAttribute(`data-${name}`));
  set("text", s.text);
  set("motion", motionReduced(s) && "reduced");
  set("sound", !s.sound && "off");
  set("contrast", s.contrast && "high");
  set("font", s.font && "readable");
}

let settings = read();
apply(settings); // index.html did this already; this catches anything it missed
const listeners = new Set();

function update(next) {
  settings = next;
  save(settings);
  apply(settings);
  listeners.forEach((l) => l());
}

// Following the OS: re-apply when its setting changes.
osMotion?.addEventListener?.("change", () => {
  if (settings.motion === null) {
    settings = { ...settings }; // a new snapshot, so the menu's switch re-renders
    apply(settings);
    listeners.forEach((l) => l());
  }
});

export function setSetting(name, value) {
  update({ ...settings, [name]: value });
}

export function resetSettings() {
  update({ ...DEFAULTS });
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useA11ySettings() {
  return useSyncExternalStore(subscribe, () => settings);
}

// For JS-driven motion and sound, which can't see the stylesheets.
export const prefersReducedMotion = () => document.documentElement.dataset.motion === "reduced";
export const soundOn = () => document.documentElement.dataset.sound !== "off";
