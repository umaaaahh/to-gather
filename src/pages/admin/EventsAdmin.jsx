import { useMemo, useState } from "react";
import { GENRE_ORDER, parseTime } from "../../lib/events";
import {
  CSV_BY_ID,
  deleteEvent,
  newEventId,
  revertEvent,
  saveEvent,
  useEvents,
} from "../../lib/eventsStore";

// Admin > Events: every event on the notice board (the CSV plus anything
// added here), with add, edit and delete. Changes go to Firestore and show
// on the board straight away; see eventsStore.js for how they sit over the CSV.

const EMPTY = {
  title: "", date: "", start_time: "", end_time: "", location: "", genre: "",
  description: "", link: "", link_label: "", address: "", image: "",
};

// The CSV's "7:30 PM" <-> a time input's "19:30".
function to24(label) {
  const t = parseTime(label);
  return t ? `${String(t[0]).padStart(2, "0")}:${String(t[1]).padStart(2, "0")}` : "";
}
function to12(value) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Sort key: date, then start time.
const sortKey = (r) => `${r.date} ${to24(r.start_time) || "00:00"}`;

export default function EventsAdmin() {
  const { rows, overrides } = useEvents();
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState(null); // { id: string | null, row }
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const today = todayIso();
  const listed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => showPast || r.date >= today)
      .filter((r) => !q || `${r.title} ${r.location} ${r.genre}`.toLowerCase().includes(q))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [rows, search, showPast, today]);

  // CSV events deleted here, so they can be put back.
  const hidden = useMemo(
    () =>
      [...overrides]
        .filter(([id, data]) => data.deleted && CSV_BY_ID.has(id))
        .map(([id]) => CSV_BY_ID.get(id))
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [overrides],
  );

  const genres = useMemo(
    () => [...new Set([...GENRE_ORDER, ...rows.map((r) => r.genre).filter(Boolean)])],
    [rows],
  );

  async function run(id, fn, failMsg) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      console.warn(err);
      setError(failMsg);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function handleSave(row) {
    const id = editing.id ?? newEventId(row);
    const ok = await run(id, () => saveEvent(id, row), "Saving failed — check your connection and try again.");
    if (ok) setEditing(null);
  }

  function handleDelete(row) {
    if (!window.confirm(`Delete "${row.title}" on ${formatDate(row.date)}?`)) return;
    run(row.id, () => deleteEvent(row.id), "Delete failed — check your connection and try again.");
  }

  function handleRevert(row) {
    if (!window.confirm(`Undo your changes to "${row.title}" and go back to the original listing?`)) return;
    run(row.id, () => revertEvent(row.id), "Undo failed — check your connection and try again.");
  }

  function handleRestore(row) {
    run(row.id, () => revertEvent(row.id), "Restore failed — check your connection and try again.");
  }

  if (editing) {
    return (
      <EventForm
        initial={editing.row}
        isNew={!editing.id}
        genres={genres}
        busy={busyId !== null}
        error={error}
        onSave={handleSave}
        onCancel={() => {
          setEditing(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className="admin-toolbar">
        <input
          type="search"
          className="admin-search"
          placeholder="Search title, venue or genre"
          aria-label="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="admin-select-all">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          Show past events
        </label>
        <button type="button" className="admin-primary-btn" onClick={() => setEditing({ id: null, row: EMPTY })}>
          + Add event
        </button>
      </div>

      <p className="admin-summary">
        {listed.length} event{listed.length === 1 ? "" : "s"}
        {search ? " found" : showPast ? "" : " coming up"}
      </p>

      <ul className="admin-events">
        {listed.map((row) => {
          const fromCsv = CSV_BY_ID.has(row.id);
          const edited = fromCsv && overrides.has(row.id);
          return (
            <li key={row.id} className="admin-event">
              <div className="admin-event-main">
                <div className="admin-book-title">
                  {row.title}
                  {!fromCsv && <span className="admin-badge">Added</span>}
                  {edited && <span className="admin-badge">Edited</span>}
                </div>
                <div className="admin-book-sub">
                  {formatDate(row.date)}
                  {row.start_time && `, ${row.end_time ? `${row.start_time} – ${row.end_time}` : row.start_time}`}
                </div>
                <div className="admin-book-sub">
                  {[row.location, row.genre].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="admin-event-actions">
                <button
                  type="button"
                  className="admin-edit-btn"
                  disabled={busyId === row.id}
                  onClick={() => setEditing({ id: row.id, row: { ...EMPTY, ...row } })}
                >
                  Edit
                </button>
                {edited && (
                  <button
                    type="button"
                    className="admin-edit-btn"
                    disabled={busyId === row.id}
                    onClick={() => handleRevert(row)}
                  >
                    Undo edit
                  </button>
                )}
                <button
                  type="button"
                  className="admin-delete-btn"
                  disabled={busyId === row.id}
                  onClick={() => handleDelete(row)}
                >
                  {busyId === row.id ? "Working…" : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {hidden.length > 0 && (
        <section className="admin-hidden">
          <h2 className="admin-subheading">Deleted from the listings ({hidden.length})</h2>
          <ul className="admin-events">
            {hidden.map((row) => (
              <li key={row.id} className="admin-event admin-event--hidden">
                <div className="admin-event-main">
                  <div className="admin-book-title">{row.title}</div>
                  <div className="admin-book-sub">
                    {formatDate(row.date)} · {row.location}
                  </div>
                </div>
                <div className="admin-event-actions">
                  <button
                    type="button"
                    className="admin-edit-btn"
                    disabled={busyId === row.id}
                    onClick={() => handleRestore(row)}
                  >
                    {busyId === row.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function EventForm({ initial, isNew, genres, busy, error, onSave, onCancel }) {
  const [row, setRow] = useState(() => ({
    ...initial,
    start_time: to24(initial.start_time),
    end_time: to24(initial.end_time),
  }));
  const set = (field) => (e) => setRow((r) => ({ ...r, [field]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...row, start_time: to12(row.start_time), end_time: to12(row.end_time) });
  }

  return (
    <form className="admin-event-form" onSubmit={handleSubmit}>
      <h2 className="admin-subheading">{isNew ? "Add an event" : "Edit event"}</h2>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}

      <label>
        Title
        <input value={row.title} onChange={set("title")} maxLength={200} required />
      </label>
      <div className="admin-form-row">
        <label>
          Date
          <input type="date" value={row.date} onChange={set("date")} required />
        </label>
        <label>
          Starts
          <input type="time" value={row.start_time} onChange={set("start_time")} />
        </label>
        <label>
          Ends
          <input type="time" value={row.end_time} onChange={set("end_time")} />
        </label>
      </div>
      <div className="admin-form-row">
        <label>
          Venue
          <input value={row.location} onChange={set("location")} maxLength={200} />
        </label>
        <label>
          Genre
          <select value={row.genre} onChange={set("genre")}>
            <option value="">Other</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Address
        <input value={row.address} onChange={set("address")} maxLength={300} />
      </label>
      <label>
        Description
        <textarea value={row.description} onChange={set("description")} rows={4} maxLength={2000} />
      </label>
      <div className="admin-form-row">
        <label>
          Link
          <input type="url" value={row.link} onChange={set("link")} placeholder="https://" maxLength={2000} />
        </label>
        <label>
          Link button text
          <input value={row.link_label} onChange={set("link_label")} placeholder="More info" maxLength={60} />
        </label>
      </div>
      <label>
        Image link
        <input type="url" value={row.image} onChange={set("image")} placeholder="https://" maxLength={2000} />
      </label>

      <div className="admin-form-actions">
        <button type="button" className="admin-edit-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="admin-primary-btn" disabled={busy}>
          {busy ? "Saving…" : isNew ? "Add event" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
