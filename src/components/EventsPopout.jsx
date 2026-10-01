import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_NAMES,
  EVENTS,
  GENRES,
  genreColor,
  MONTH_NAMES,
  isUpcoming,
  sameDay,
  shortDate,
  startOfDay,
  upcomingShows,
} from "../lib/events";
import "./EventsPopout.css";

function buildMonthGrid(year, month) {
  const startOffset = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Most genre dots a calendar day shows.
const MAX_DOTS = 4;

const mapsLink = (address) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

// The full "what's on" view, popped out over the street from the notice
// board. Nothing here leaves the app except the event and map links, which
// open in a new tab.
//
// initial: { genre?, day?, showKey? } — what the board was showing when it
// was tapped: a genre filter, a day, or one show to open up and scroll to.
export default function EventsPopout({ initial, onClose }) {
  const now = useMemo(() => new Date(), []);
  const today = startOfDay(now);
  const [genre, setGenre] = useState(initial.genre ?? null);
  const [day, setDay] = useState(initial.day ?? null);
  const [openKey, setOpenKey] = useState(initial.showKey ?? null);
  const [cursor, setCursor] = useState(() => {
    const d = initial.day ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const closeRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bring the show the board was tapped on into view.
  useEffect(() => {
    if (!initial.showKey) return;
    listRef.current
      ?.querySelector(`[data-key="${CSS.escape(initial.showKey)}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [initial.showKey]);

  const filtered = useMemo(
    () => (genre ? EVENTS.filter((e) => e.genre === genre) : EVENTS),
    [genre],
  );
  // Day (ms) -> the genres on that day, for the calendar dots.
  const eventDays = useMemo(() => {
    const days = new Map();
    for (const e of filtered) {
      const t = e.date.getTime();
      if (!days.has(t)) days.set(t, new Set());
      days.get(t).add(e.genre);
    }
    return days;
  }, [filtered]);
  const cells = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const shows = useMemo(() => upcomingShows(now, genre), [now, genre]);
  // Every upcoming show, for the "other dates" in an opened day-view card.
  const showsByKey = useMemo(
    () => new Map(upcomingShows(now).map((s) => [s.key, s])),
    [now],
  );
  const daySessions = useMemo(
    () => (day ? filtered.filter((e) => sameDay(e.date, day)) : []),
    [filtered, day],
  );

  const goMonth = (delta) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const toggle = (key) => setOpenKey((k) => (k === key ? null : key));

  // With a day picked, list that day's sessions; otherwise every upcoming
  // show once, by its next session.
  const items = day
    ? daySessions.map((e) => ({ session: e, show: showsByKey.get(e.showKey) ?? { ...e, sessions: [] } }))
    : shows.map((s) => ({ session: s.sessions[0], show: s }));

  let heading;
  if (day) heading = shortDate(day);
  else if (genre) heading = `Upcoming ${genre}`;
  else heading = "Coming up";

  return (
    <div className="events-popout-backdrop" onClick={onClose}>
      <div
        className="events-popout"
        role="dialog"
        aria-modal="true"
        aria-label="What's on"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ep-header">
          <h2 className="ep-title">What's on</h2>
          <button
            ref={closeRef}
            type="button"
            className="ep-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="ep-body" ref={listRef}>
          <div className="ep-genres" role="group" aria-label="Filter by genre">
            <button
              type="button"
              className="ep-chip"
              aria-pressed={!genre}
              onClick={() => setGenre(null)}
            >
              All
            </button>
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className="ep-chip"
                aria-pressed={genre === g}
                style={{ "--genre": genreColor(g) }}
                onClick={() => setGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>

          <section className="ep-calendar" aria-label="Calendar">
            <div className="ep-cal-head">
              <button type="button" className="ep-cal-nav" onClick={() => goMonth(-1)} aria-label="Previous month">
                ‹
              </button>
              <span className="ep-cal-month">
                {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
              </span>
              <button type="button" className="ep-cal-nav" onClick={() => goMonth(1)} aria-label="Next month">
                ›
              </button>
            </div>
            <div className="ep-cal-grid">
              {DAY_NAMES.map((w) => (
                <span key={w} className="ep-cal-weekday">
                  {w.slice(0, 2)}
                </span>
              ))}
              {cells.map((date, i) => {
                if (!date) return <span key={`empty-${i}`} />;
                const dayGenres = eventDays.get(date.getTime());
                const has = !!dayGenres;
                return (
                  <button
                    key={date.getTime()}
                    type="button"
                    className="ep-cal-cell"
                    data-today={sameDay(date, today) ? "" : undefined}
                    data-past={date < today ? "" : undefined}
                    aria-pressed={!!day && sameDay(date, day)}
                    aria-label={`${shortDate(date)}${has ? ", has events" : ""}`}
                    onClick={() => setDay((d) => (d && sameDay(d, date) ? null : date))}
                  >
                    {date.getDate()}
                    {has && (
                      <span className="ep-cal-dots" aria-hidden="true">
                        {[...dayGenres].slice(0, MAX_DOTS).map((g) => (
                          <i key={g} style={{ background: genreColor(g) }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="ep-list-head">
            <h3 className="ep-list-title">{heading}</h3>
            {day && (
              <button type="button" className="ep-clear" onClick={() => setDay(null)}>
                All dates ×
              </button>
            )}
          </div>

          {items.length === 0 && (
            <p className="ep-empty">
              {day ? "Nothing on this day." : "Nothing coming up here yet."}
            </p>
          )}

          <ul className="ep-list">
            {items.map(({ session, show }) => {
              const expanded = openKey === session.showKey;
              const nextDates = show.sessions.filter((s) => s.id !== session.id && isUpcoming(s, now));
              return (
                <li
                  key={session.id}
                  className="ep-card"
                  data-key={session.showKey}
                  data-open={expanded ? "" : undefined}
                  style={{ "--genre": genreColor(session.genre) }}
                >
                  <button
                    type="button"
                    className="ep-card-head"
                    aria-expanded={expanded}
                    onClick={() => toggle(session.showKey)}
                  >
                    <span className="ep-card-date">
                      {day ? (
                        <span className="ep-card-time">{session.startLabel}</span>
                      ) : (
                        <>
                          <span className="ep-card-day">{session.date.getDate()}</span>
                          <span className="ep-card-month">
                            {MONTH_NAMES[session.date.getMonth()].slice(0, 3)}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="ep-card-main">
                      {!genre && <span className="ep-card-genre">{session.genre}</span>}
                      <span className="ep-card-title">{session.title}</span>
                      <span className="ep-card-meta">
                        {day ? session.timeLabel : `${DAY_NAMES[session.date.getDay()]} ${session.timeLabel}`}
                        {" · "}
                        {session.location}
                      </span>
                      {!day && show.sessions.length > 1 && (
                        <span className="ep-card-more">
                          +{show.sessions.length - 1} more date{show.sessions.length > 2 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </button>

                  {expanded && (
                    <div className="ep-card-detail">
                      {show.description && <p className="ep-card-desc">{show.description}</p>}
                      {session.address && (
                        <a
                          className="ep-card-address"
                          href={mapsLink(session.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {session.address}
                        </a>
                      )}
                      {nextDates.length > 0 && (
                        <div className="ep-card-dates">
                          <span className="ep-card-dates-label">
                            {day ? "Also on" : "Other dates"}
                          </span>
                          <ul>
                            {nextDates.slice(0, 8).map((s) => (
                              <li key={s.id}>
                                {shortDate(s.date)}, {s.startLabel}
                              </li>
                            ))}
                            {nextDates.length > 8 && <li>+{nextDates.length - 8} more</li>}
                          </ul>
                        </div>
                      )}
                      {session.link && (
                        <a
                          className="ep-card-link"
                          href={session.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {session.linkLabel} ↗
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
