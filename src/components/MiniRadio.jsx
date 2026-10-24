import { useEffect, useRef, useState } from "react";
import MiniBoomboxArt from "./MiniBoomboxArt";
import "./MiniRadio.css";

// How far (px) a press has to move before it's a drag rather than a tap.
const DRAG_PX = 6;
// Where the visitor last dragged it, kept in this browser so it stays out of
// their way next visit too.
const POS_KEY = "to-gather-mini-radio";

function readPos() {
  try {
    const pos = JSON.parse(localStorage.getItem(POS_KEY));
    return Number.isFinite(pos?.x) && Number.isFinite(pos?.y) ? pos : null;
  } catch {
    return null; // storage blocked or corrupt: the default spot
  }
}

function savePos(pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    // Blocked storage: it stays put for this visit.
  }
}

// pos kept inside its layer (the whole screen), so it can't be lost off an
// edge — on a drag, or when the screen resizes or rotates.
function clampToLayer(el, { x, y }) {
  const layer = el.offsetParent;
  if (!layer) return { x, y };
  const maxX = Math.max(layer.clientWidth - el.offsetWidth, 0);
  const maxY = Math.max(layer.clientHeight - el.offsetHeight, 0);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

/**
 * A pocket-sized boombox that sits in the sky while the radio is on and its
 * popup is closed. It bobs along while the stream is actually playing and
 * reopens the full Boombox when tapped. It can be dragged anywhere on the
 * screen if it's in the way: placed with left/top (inline, overriding its
 * default spot in RadioLayer.css) rather than translate, which older iOS
 * Safari drops on animated things.
 *
 * @param {{label: string, name: string, color: string}} station  what's on
 * @param {boolean} playing  true while audio is actually coming out
 * @param {() => void} onOpen
 */
export default function MiniRadio({ station, playing, onOpen, className = "" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(readPos); // { x, y } px in its layer, or null = default spot
  // True from the moment a press turns into a drag until its click lands, so
  // that click neither opens the radio nor pops (data-sfx, lib/sounds.js).
  const [dragged, setDragged] = useState(false);
  const [dragging, setDragging] = useState(false); // held and moving, for the picked-up look
  const drag = useRef(null);

  // Back inside the screen if it shrinks or rotates.
  useEffect(() => {
    if (!pos) return undefined;
    const onResize = () => setPos((p) => p && clampToLayer(ref.current, p));
    onResize(); // and once now: a saved spot from a bigger screen
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e) {
    if (e.button > 0) return;
    const el = ref.current;
    setDragged(false);
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x0: el.offsetLeft,
      y0: el.offsetTop,
      moved: false,
    };
    el.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_PX) return;
    if (!d.moved) {
      d.moved = true;
      setDragged(true);
      setDragging(true);
    }
    setPos(clampToLayer(ref.current, { x: d.x0 + dx, y: d.y0 + dy }));
  }

  function onPointerUp(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    if (d.moved) savePos(clampToLayer(ref.current, { x: d.x0 + e.clientX - d.startX, y: d.y0 + e.clientY - d.startY }));
  }

  function onClick() {
    if (dragged) {
      setDragged(false); // that was the end of a drag, not a tap
      return;
    }
    onOpen();
  }

  return (
    <button
      ref={ref}
      type="button"
      className={["mini-radio", playing && "playing", className].filter(Boolean).join(" ")}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      data-dragging={dragging || undefined}
      data-sfx={dragged ? "none" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onClick={onClick}
      aria-label={`Radio: ${station.name}${playing ? "" : " (tuning in)"}. Open the radio`}
      title="Tap to open the radio, or drag it out of the way"
    >
      <MiniBoomboxArt className="mini-radio-art" accent={station.color} />

      <span className="mini-radio-label" style={{ "--c": station.color }}>
        {station.label}
      </span>

      <span className="mini-radio-note" aria-hidden="true">
        ♪
      </span>
    </button>
  );
}
