import { useEffect, useState } from "react";
import { deleteBook, deleteNote, subscribeAdminShelf } from "../../lib/shelfStore";
import LoadingLogo from "../../components/LoadingLogo";

// Admin > Shelf: every book on the Shelf, newest first, with its notes.
// Delete a single note, or a whole book (which takes its notes and votes too).

const formatDate = (ts) =>
  ts?.toDate
    ? ts.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "just now"; // serverTimestamp not back yet

export default function ShelfAdmin() {
  const [books, setBooks] = useState(null);
  const [busyId, setBusyId] = useState(null); // book or note being deleted
  const [error, setError] = useState(null);

  useEffect(
    () =>
      subscribeAdminShelf(setBooks, (err) => {
        console.warn("Admin shelf listener failed:", err);
        setError("The shelf couldn't load. Refresh to try again.");
      }),
    [],
  );

  async function run(id, fn, failMsg) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.warn(err);
      setError(failMsg);
    } finally {
      setBusyId(null);
    }
  }

  function handleDeleteBook(book) {
    const n = book.notes.length;
    const msg = `Delete "${book.title}" from the shelf${
      n ? ` along with its ${n} note${n === 1 ? "" : "s"}` : ""
    }? This can't be undone.`;
    if (!window.confirm(msg)) return;
    run(book.id, () => deleteBook(book.id), "Delete failed — check your connection and try again.");
  }

  function handleDeleteNote(note) {
    if (!window.confirm(`Delete this note?\n\n"${note.text}"`)) return;
    run(note.id, () => deleteNote(note.id), "Delete failed — check your connection and try again.");
  }

  if (books === null) {
    return error ? (
      <p role="alert" className="admin-error">
        {error}
      </p>
    ) : (
      <LoadingLogo className="admin-loading" label="Loading the shelf" />
    );
  }
  if (books.length === 0) return <p className="admin-status">No books on the shelf yet.</p>;

  const noteCount = books.reduce((sum, b) => sum + b.notes.length, 0);

  return (
    <>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <p className="admin-summary">
        {books.length} book{books.length === 1 ? "" : "s"} · {noteCount} note{noteCount === 1 ? "" : "s"}
      </p>
      <ul className="admin-books">
        {books.map((book) => (
          <li key={book.id} className="admin-book">
            <div className="admin-book-head">
              {book.cover?.startsWith("https://books.google") ? (
                <img className="admin-book-cover" src={book.cover} alt="" loading="lazy" />
              ) : (
                <div className="admin-book-cover admin-book-cover--blank" aria-hidden="true" />
              )}
              <div className="admin-book-meta">
                <div className="admin-book-title">
                  {book.link ? (
                    <a href={book.link} target="_blank" rel="noreferrer">
                      {book.title}
                    </a>
                  ) : (
                    book.title
                  )}
                </div>
                <div className="admin-book-sub">{book.authors || "Unknown author"}</div>
                <div className="admin-book-sub">
                  {book.votes} vote{book.votes === 1 ? "" : "s"} · added {formatDate(book.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="admin-delete-btn"
                disabled={busyId === book.id}
                onClick={() => handleDeleteBook(book)}
              >
                {busyId === book.id ? "Deleting…" : "Delete book"}
              </button>
            </div>

            {book.notes.length > 0 ? (
              <ul className="admin-notes">
                {book.notes.map((note) => (
                  <li key={note.id} className="admin-note">
                    <div className="admin-note-body">
                      <p className="admin-note-text">“{note.text}”</p>
                      <span className="admin-book-sub">{formatDate(note.createdAt)}</span>
                    </div>
                    <button
                      type="button"
                      className="admin-delete-btn admin-delete-btn--small"
                      disabled={busyId === note.id || busyId === book.id}
                      onClick={() => handleDeleteNote(note)}
                    >
                      {busyId === note.id ? "…" : "Delete"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-book-sub admin-notes-empty">No notes.</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
