import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildMonthGrid, EVENTS, MONTH_NAMES, sameDay } from "../lib/events";
import "./NoticeBoard.css";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function NoticeBoard() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [shownMonth, setShownMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const cells = useMemo(
    () => buildMonthGrid(shownMonth.getFullYear(), shownMonth.getMonth()),
    [shownMonth],
  );

  const eventsThisMonth = useMemo(
    () =>
      EVENTS.filter(
        (e) => e.date.getFullYear() === shownMonth.getFullYear() && e.date.getMonth() === shownMonth.getMonth(),
      ).sort((a, b) => a.date - b.date),
    [shownMonth],
  );

  const goMonth = (delta) =>
    setShownMonth((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="notice-page">
      <header className="notice-header">
        <button className="notice-back" onClick={() => navigate("/")} aria-label="Back to street">
          ‹
        </button>
        <h1 className="notice-title">Community Notice Board</h1>
        <span className="notice-header-spacer" aria-hidden="true" />
      </header>

      <div className="notice-board-frame">
        {/* ---- Calendar ---- */}
        <section className="nb-card nb-calendar">
          <span className="nb-tape nb-tape--calendar" aria-hidden="true" />
          <div className="nb-cal-head">
            <button className="nb-cal-nav" onClick={() => goMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <span className="nb-cal-month">
              {MONTH_NAMES[shownMonth.getMonth()]} {shownMonth.getFullYear()}
            </span>
            <button className="nb-cal-nav" onClick={() => goMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>

          <div className="nb-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>

          <div className="nb-cal-grid">
            {cells.map((date, i) => {
              if (!date) return <span key={`empty-${i}`} className="nb-cal-cell nb-cal-cell--empty" />;
              const isToday = sameDay(date, today);
              const hasEvent = EVENTS.some((e) => sameDay(e.date, date));
              return (
                <span
                  key={date.toISOString()}
                  className={`nb-cal-cell${isToday ? " nb-cal-cell--today" : ""}`}
                >
                  {date.getDate()}
                  {hasEvent && <span className="nb-cal-dot" aria-hidden="true" />}
                </span>
              );
            })}
          </div>
        </section>

        {/* ---- Events list, stacked under the calendar ---- */}
        <section className="nb-events">
          <h2 className="nb-events-heading">Upcoming Events</h2>

          {eventsThisMonth.length === 0 && (
            <p className="nb-events-empty">No events posted for this month yet.</p>
          )}

          <ul className="nb-events-list">
            {eventsThisMonth.map((event, i) => (
              <li
                className="nb-card nb-event"
                key={event.id}
                style={{ "--tilt": `${i % 2 === 0 ? -1 : 1}deg` }}
              >
                <span className="nb-tape nb-tape--event" aria-hidden="true" />
                <div className="nb-event-date">
                  <span className="nb-event-day">{event.date.getDate()}</span>
                  <span className="nb-event-month">
                    {MONTH_NAMES[event.date.getMonth()].slice(0, 3)}
                  </span>
                </div>
                <div className="nb-event-body">
                  <span className="nb-event-tag">{event.genre}</span>
                  <span className="nb-event-title">{event.title}</span>
                  <span className="nb-event-meta">
                    {event.timeLabel} · {event.location}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
