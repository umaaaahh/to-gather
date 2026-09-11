import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NoticeBoard.css";

// Mock data for the mockup — Phase 2 will read this from a Firestore
// "events" collection instead (same shape: title/date/time/location/tag).
const EVENTS = [
  {
    id: "kickoff",
    title: "Street Festival Kickoff",
    date: new Date(2026, 8, 12),
    time: "10:00 AM",
    location: "Main Street",
    tag: "Festival",
  },
  {
    id: "art-workshop",
    title: "Kids' Art Workshop",
    date: new Date(2026, 8, 15),
    time: "2:00 PM",
    location: "Community Hall",
    tag: "Workshop",
  },
  {
    id: "bbq",
    title: "Community BBQ",
    date: new Date(2026, 8, 20),
    time: "12:00 PM",
    location: "Park Reserve",
    tag: "Social",
  },
  {
    id: "live-music",
    title: "Live Music Night",
    date: new Date(2026, 8, 24),
    time: "6:30 PM",
    location: "Notice Board Stage",
    tag: "Festival",
  },
  {
    id: "cleanup",
    title: "Neighbourhood Clean-up",
    date: new Date(2026, 8, 28),
    time: "9:00 AM",
    location: "Meet at the Tree",
    tag: "Volunteer",
  },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function NoticeBoard() {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const cells = useMemo(
    () => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const eventsThisMonth = useMemo(
    () =>
      EVENTS.filter(
        (e) => e.date.getFullYear() === cursor.getFullYear() && e.date.getMonth() === cursor.getMonth(),
      ).sort((a, b) => a.date - b.date),
    [cursor],
  );

  const goMonth = (delta) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

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
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
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
                  <span className="nb-event-tag">{event.tag}</span>
                  <span className="nb-event-title">{event.title}</span>
                  <span className="nb-event-meta">
                    🕑 {event.time} · 📍 {event.location}
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
