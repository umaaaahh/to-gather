import { useCallback, useRef, useState } from "react";
import { ASSETS } from "../lib/assets";
import {
  EVENTS,
  genreColor,
  isUpcoming,
  sameDay,
  shortDate,
} from "../lib/events";
import EventsPopout from "./EventsPopout";
import "./NoticeTab.css";

// How much of the board shows, as a fraction of its height from the top.
// Closed = just the kangaroo's head peeking over the screen's bottom edge;
// open = the whole board, legs and all, standing on the bottom edge.
// Tuned to the 600x900 board art.
const CLOSED_SHOWING = 0.15;
const OPEN_SHOWING = 1;
// Pointer travel (px) under which a press counts as a tap, not a drag.
const TAP_PX = 6;

// The notice board as a pull-up tab pinned to the bottom of the screen.
// Tap or drag the kangaroo up to raise it; the whiteboard then shows the
// notes (see Whiteboard below). Tapping a note pops the full what's-on view
// out over the street. Tap outside, tap the board again or drag it down to
// put it away.
export default function NoticeTab() {
  const [open, setOpen] = useState(false);
  // Live translateY (px) while dragging, null otherwise.
  const [dragY, setDragY] = useState(null);
  // What the pop-out opens on ({ genre?, day?, showId? }), null when shut.
  const [popout, setPopout] = useState(null);
  const boardRef = useRef(null);
  const drag = useRef(null);

  // translateY (px) that shows `fraction` of the board above the bottom edge.
  const restingY = (isOpen) => {
    const h = boardRef.current?.offsetHeight ?? 0;
    return h * (1 - (isOpen ? OPEN_SHOWING : CLOSED_SHOWING));
  };

  const onPointerDown = (e) => {
    // The whiteboard scrolls and swipes on its own; don't turn that into a
    // board drag.
    if (e.target.closest(".notice-tab-board, .notice-tab-close")) return;
    drag.current = { pointerStartY: e.clientY, boardStartY: restingY(open), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.pointerStartY;
    if (Math.abs(dy) > TAP_PX) d.moved = true;
    if (!d.moved) return;
    const min = restingY(true);
    const max = restingY(false);
    setDragY(Math.min(Math.max(d.boardStartY + dy, min), max));
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      setOpen((o) => !o);
    } else {
      // Settle whichever way it was heading.
      setOpen(e.clientY < d.pointerStartY);
    }
    setDragY(null);
  };

  const closePopout = useCallback(() => setPopout(null), []);

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
          // Keys on the buttons inside (close, notes, dots) are theirs.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <img className="notice-tab-art" src={ASSETS.noticeBoard} alt="" draggable={false} />
        {open && (
          // Arched title over the kangaroo's ears: the text follows a
          // shallow curve drawn across the board's width.
          <svg
            className="notice-tab-banner"
            viewBox="0 0 600 150"
            role="img"
            aria-label="IRL Community events!"
          >
            <path id="notice-tab-arc" d="M 20 135 Q 300 5 580 135" fill="none" />
            <text textAnchor="middle">
              <textPath href="#notice-tab-arc" startOffset="50%">
                IRL Community events!
              </textPath>
            </text>
          </svg>
        )}
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
        {/* Mounted only while open, so the notes are fresh each time. */}
        {open && <Whiteboard onPick={setPopout} />}
      </div>

      {popout && <EventsPopout initial={popout} onClose={closePopout} />}
    </>
  );
}

// The day the board highlights: today, or if nothing's left on today, the
// next day with something on. Returns that day and its events still to come.
function pickDay(now) {
  const next = EVENTS.find((e) => isUpcoming(e, now));
  if (!next) return { day: null, events: [] };
  return {
    day: next.date,
    events: EVENTS.filter((e) => sameDay(e.date, next.date) && isUpcoming(e, now)),
  };
}

// The notes on the whiteboard: every event on the highlighted day, each in
// its genre's colour, and a link to the full calendar. onPick gets what the
// pop-out should open on.
function Whiteboard({ onPick }) {
  const [{ day, events, isToday }] = useState(() => {
    const now = new Date();
    const picked = pickDay(now);
    return { ...picked, isToday: !!picked.day && sameDay(picked.day, now) };
  });

  return (
    <div className="notice-tab-board">
      <h3 className="notice-tab-heading">
        {day ? (isToday ? "On today" : `Next up: ${shortDate(day)}`) : "What's on"}
      </h3>
      {events.length === 0 ? (
        <p className="notice-tab-empty">Nothing coming up yet.</p>
      ) : (
        <ul className="notice-tab-notes">
          {events.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="notice-tab-note"
                style={{ "--genre": genreColor(e.genre) }}
                onClick={() => onPick({ day, showId: e.showId })}
              >
                <span className="notice-tab-date">{e.startLabel}</span>
                <span className="notice-tab-title">{e.title}</span>
                <span className="notice-tab-meta">
                  {e.genre} · {e.location}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="notice-tab-all" onClick={() => onPick({})}>
        Full calendar ›
      </button>
    </div>
  );
}
