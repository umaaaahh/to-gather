import { useEffect, useId, useRef, useState } from "react";
import { motionReduced, resetSettings, setSetting, useA11ySettings } from "../lib/a11y";
import "./AccessMenu.css";

const TEXT_SIZES = [
  { value: "md", label: "A", name: "100%" },
  { value: "lg", label: "A+", name: "115%" },
  { value: "xl", label: "A++", name: "130%" },
];

// The settings menu (accessibility, then sound): a slim pixel cog tab
// pinned to the top centre of every
// screen (first in tab order, above the street, popups, Acknowledgement and
// tour), dropping down a pixel panel of settings that apply as they change
// (lib/a11y.js). Opens on tap/click/Enter/Space; closes on Esc, a tap
// outside or the tab again. Focus moves into the panel on open and back to
// the tab on Esc or the tab.
export default function AccessMenu() {
  const settings = useA11ySettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tabRef = useRef(null);
  const panelRef = useRef(null);
  const id = useId();

  const close = (returnFocus) => {
    setOpen(false);
    if (returnFocus) tabRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // The first control: the selected text size.
    panelRef.current?.querySelector('[role="radio"][aria-checked="true"]')?.focus();

    // Capture phase on window, ahead of the popups' own Esc handlers, so Esc
    // closes just the menu.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close(true);
    };
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) close(false);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const panelId = `${id}-panel`;
  const titleId = `${id}-title`;

  return (
    <div className="access-menu" ref={rootRef}>
      <button
        ref={tabRef}
        type="button"
        className="access-tab"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Settings"
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span className="px-cog" aria-hidden="true" />
        <span className="access-tab-word" aria-hidden="true">
          Settings
        </span>
        <span className="px-caret" aria-hidden="true" />
      </button>

      <div
        ref={panelRef}
        id={panelId}
        className="access-panel"
        role="group"
        aria-labelledby={titleId}
        hidden={!open}
      >
        <h2 id={titleId} className="access-title">
          Settings
        </h2>
        <h3 className="access-subtitle">Accessibility</h3>

        <TextSizeRow value={settings.text} onChange={(v) => setSetting("text", v)} />
        <SwitchRow
          label="Reduce motion"
          checked={motionReduced(settings)}
          onChange={(on) => setSetting("motion", on ? "reduced" : "full")}
        />
        <SwitchRow
          label="High contrast"
          checked={settings.contrast}
          onChange={(on) => setSetting("contrast", on)}
        />
        <SwitchRow
          label="Easier-to-read font"
          checked={settings.font}
          onChange={(on) => setSetting("font", on)}
        />

        {/* The radio isn't here: it has its own power and volume. */}
        <h3 className="access-subtitle">Sound</h3>
        <SwitchRow
          label="Sound effects"
          checked={settings.sound}
          onChange={(on) => setSetting("sound", on)}
        />
        <SwitchRow
          label="Background music"
          checked={settings.music}
          onChange={(on) => setSetting("music", on)}
        />
        <SliderRow
          label="Music volume"
          value={settings.musicVolume}
          disabled={!settings.music}
          onChange={(v) => setSetting("musicVolume", v)}
        />

        <button type="button" className="px-btn px-btn--cream access-reset" onClick={resetSettings}>
          Reset
        </button>
      </div>
    </div>
  );
}

// One row: a visible label, then the control it names.
function SwitchRow({ label, checked, onChange }) {
  const id = useId();
  return (
    <div className="access-row">
      <span id={id} className="access-label">
        {label}
      </span>
      <PxSwitch labelledBy={id} checked={checked} onChange={onChange} />
    </div>
  );
}

// .px-switch: a pixel track with a square knob. Off is cream with the knob
// on the left; on is blue with the knob on the right. The state also shows
// as ON/OFF in the track, so it never rests on colour alone.
function PxSwitch({ labelledBy, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className="px-switch"
      onClick={() => onChange(!checked)}
    >
      <span className="px-switch-track" aria-hidden="true">
        <span className="px-switch-text">{checked ? "On" : "Off"}</span>
        <span className="px-switch-knob" />
      </span>
    </button>
  );
}

// .px-slider: a 0–100 range (the music volume) drawn like the switches — a
// pixel track that fills blue up to a square knob.
function SliderRow({ label, value, disabled, onChange }) {
  const id = useId();
  return (
    <div className="access-row">
      <span id={id} className="access-label">
        {label}
      </span>
      <input
        type="range"
        className="px-slider"
        min="0"
        max="100"
        step="5"
        value={value}
        disabled={disabled}
        aria-labelledby={id}
        aria-valuetext={`${value}%`}
        style={{ "--fill": `${value}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// .px-segment: the text size, three joined pixel buttons as a radio group.
// The selected one is pressed down and blue. Arrow keys move the selection
// (roving tabindex: only the selected one is a tab stop).
function TextSizeRow({ value, onChange }) {
  const id = useId();
  const refs = useRef([]);

  const onKeyDown = (e, i) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + TEXT_SIZES.length) % TEXT_SIZES.length;
    onChange(TEXT_SIZES[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div className="access-row">
      <span id={id} className="access-label">
        Text size
      </span>
      <div className="px-segment" role="radiogroup" aria-labelledby={id}>
        {TEXT_SIZES.map((size, i) => (
          <button
            key={size.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={value === size.value}
            aria-label={size.name}
            tabIndex={value === size.value ? 0 : -1}
            className="px-segment-option"
            onClick={() => onChange(size.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {size.label}
          </button>
        ))}
      </div>
    </div>
  );
}
