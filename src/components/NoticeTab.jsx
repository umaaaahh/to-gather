import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ASSETS } from "../lib/assets";
import { EVENTS, MONTH_NAMES } from "../lib/events";
import "./NoticeTab.css";

// How much of the board shows, as a fraction of its height from the top.
// Closed = just the kangaroo's head peeking over the screen's bottom edge;
// open = the whole board, legs and all, standing on the bottom edge.
// Tuned to the 600x900 board art.
const PEEK = 0.15;
const OPEN = 1;
// Pointer travel (px) under which a press counts as a tap, not a drag.
const TAP_PX = 6;

// Mock data is all in the past, so show every event for now — Phase 2's
// real feed should only show upcoming ones.
const NOTES = [...EVENTS].sort((a, b) => a.date - b.date);

// The notice board as a pull-up tab pinned to the bottom of the screen.
// Tap or drag the kangaroo up to raise it; the notices are written on the
// whiteboard. Tap outside, tap the board again or drag it down to put it away.
export default function NoticeTab() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Live translateY (px) while dragging, null otherwise.
  const [dragY, setDragY] = useState(null);
  const boardRef = useRef(null);
  const drag = useRef(null);

  // translateY (px) that shows `fraction` of the board above the bottom edge.
  const restY = (isOpen) => {
    const h = boardRef.current?.offsetHeight ?? 0;
    return h * (1 - (isOpen ? OPEN : PEEK));
  };

  const onPointerDown = (e) => {
    // The notes scroll on their own; don't turn that into a board drag.
    if (e.target.closest(".notice-tab-notes, .notice-tab-close")) return;
    drag.current = { startY: e.clientY, baseY: restY(open), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > TAP_PX) d.moved = true;
    if (!d.moved) return;
    const min = restY(true);
    const max = restY(false);
    setDragY(Math.min(Math.max(d.baseY + dy, min), max));
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen((o) => !o);
    } else {
      // Settle whichever way it was heading.
      setOpen(e.clientY < d.startY);
    }
    setDragY(null);
  };

  const style =
    dragY === null ? undefined : { transform: `translateY(${dragY}px)`, transition: "none" };

  return (
    <>
      {open && (
        <button
          type="button"
          className="notice-tab-backdrop"
          aria-label="Close the notice board"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        ref={boardRef}
        className="notice-tab"
        data-open={open ? "" : undefined}
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? "Put the notice board away" : "What's on in the community"}
        onKeyDown={(e) => {
          // Keys on the buttons inside (close, See all) are theirs.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <img className="notice-tab-art" src={ASSETS.noticeBoard} alt="" draggable={false} />
        {open && (
          <button
            type="button"
            className="notice-tab-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        )}
        <ul className="notice-tab-notes" aria-hidden={!open}>
          {NOTES.map((n) => (
            <li key={n.id} className="notice-tab-note">
              <span className="notice-tab-date">
                {n.date.getDate()} {MONTH_NAMES[n.date.getMonth()].slice(0, 3)}
              </span>
              <span className="notice-tab-title">{n.title}</span>
              <span className="notice-tab-meta">
                {n.time} · {n.location}
              </span>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="notice-tab-all"
              tabIndex={open ? 0 : -1}
              onClick={() => navigate("/notices")}
            >
              See all ›
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}
