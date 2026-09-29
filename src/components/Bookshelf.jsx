import { useEffect, useRef, useState } from "react";
import "./Bookshelf.css";

// Book details (search, covers, links) come from Google Books. Adding and
// voting still live in memory only — the backend (database, one vote per
// person) gets wired in later.

// Optional but recommended: without a key Google Books allows only a small,
// shared anonymous quota. Create one in Google Cloud (enable the Books API,
// restrict the key to your site's HTTP referrers) and put it in .env as
// VITE_GOOGLE_BOOKS_KEY.
const GOOGLE_BOOKS_KEY = import.meta.env.VITE_GOOGLE_BOOKS_KEY || "";
const REASON_MAX = 140;

// Only the volume fields toBook reads, to keep responses small.
const VOLUME_FIELDS =
  "id,volumeInfo(title,authors,imageLinks/thumbnail,imageLinks/smallThumbnail,canonicalVolumeLink,infoLink)";

class BooksRateLimited extends Error {}

/** Search Google Books; resolves to toBook-shaped results. */
async function searchBooks(q, maxResults, signal) {
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("printType", "books");
  url.searchParams.set("fields", `items(${VOLUME_FIELDS})`);
  if (GOOGLE_BOOKS_KEY) url.searchParams.set("key", GOOGLE_BOOKS_KEY);
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new BooksRateLimited("Google Books rate limit");
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const data = await res.json();
  return (data.items || []).map(toBook);
}

// Sample books so the shelf has something to show. Their placeholder ids are
// swapped for real Google Books volumes (with covers and links) on load —
// see the lookup effect in Bookshelf.
const SAMPLE_BOOKS = [
  { id: "s1", title: "The Left Hand of Darkness", authors: "Ursula K. Le Guin", cover: "", link: "", reasons: ["Changed how I think about gender and cold weather."], votes: 14 },
  { id: "s2", title: "Braiding Sweetgrass", authors: "Robin Wall Kimmerer", cover: "", link: "", reasons: ["Read it slowly. Then go outside.", "Made me want to plant beans."], votes: 11 },
  { id: "s3", title: "Piranesi", authors: "Susanna Clarke", cover: "", link: "", reasons: [], votes: 9 },
  { id: "s4", title: "Tomorrow, and Tomorrow, and Tomorrow", authors: "Gabrielle Zevin", cover: "", link: "", reasons: ["For anyone who has ever made something with a friend."], votes: 6 },
  { id: "s5", title: "The Dispossessed", authors: "Ursula K. Le Guin", cover: "", link: "", reasons: [], votes: 3 },
];

// Same book, different edition: Google Books gives each edition its own id,
// so books also match on title (minus subtitle and leading article) + first
// author, ignoring case and punctuation.
const normalise = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const bookKey = (book) =>
  `${normalise(book.title.split(":")[0]).replace(/^(the|a|an) /, "")}|${normalise(book.authors.split(",")[0] || "")}`;
const findOnShelf = (books, book) =>
  books.find((b) => b.id === book.id) ||
  books.find((b) => bookKey(b) === bookKey(book));

const safeCover = (url) =>
  typeof url === "string" && url.startsWith("https://books.google") ? url : null;
const safeLink = (url) =>
  typeof url === "string" && /^https:\/\/(books|play)\.google\./.test(url) ? url : null;

// Books without a cover get a coloured crayon block with their initial
const COVER_COLOURS = ["#ef5a4c", "#2f6fd6", "#ffd23f", "#6fd38a", "#c9a4ff", "#ff9f3f"];

function Cover({ url, alt = "", title = "" }) {
  const src = safeCover(url);
  if (src) return <img className="shelf-cover" src={src} alt={alt} loading="lazy" />;
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colour = COVER_COLOURS[hash % COVER_COLOURS.length];
  const initial = title.replace(/^(the|a|an)\s+/i, "").trim().charAt(0).toUpperCase();
  return (
    <div className="shelf-cover blank" style={{ "--c": colour }} role="img" aria-label={alt || "No cover"}>
      {initial}
    </div>
  );
}

function toBook(item) {
  const v = item.volumeInfo || {};
  const img = v.imageLinks || {};
  return {
    id: item.id,
    title: (v.title || "Untitled").slice(0, 200),
    authors: (v.authors || []).join(", ").slice(0, 200),
    cover: (img.thumbnail || img.smallThumbnail || "").replace(/^http:/, "https:"),
    link: (v.canonicalVolumeLink || v.infoLink || "").replace(/^http:/, "https:"),
  };
}

/**
 * Community bookshelf: search Google Books, recommend a book with a short
 * reason, and vote on everyone's picks. Rendered inside BookshelfLayer.
 */
function Bookshelf() {
  const [shelfBooks, setShelfBooks] = useState(SAMPLE_BOOKS);
  const [voted, setVoted] = useState(() => new Set(["s2"]));
  // Books whose notes are open; the shelf only shows cover/title/author.
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null); // null | "error" | "limited" | book[]
  const [picked, setPicked] = useState(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const reasonRef = useRef(null);

  // Swap each sample book for its real Google Books volume, once. Keeps the
  // sample's notes and votes; the id change carries over to this visitor's
  // votes so "already on the shelf" matches search results.
  useEffect(() => {
    const ctrl = new AbortController();
    SAMPLE_BOOKS.forEach(async (sample) => {
      try {
        const [found] = await searchBooks(
          `intitle:"${sample.title}" inauthor:"${sample.authors}"`,
          1,
          ctrl.signal,
        );
        if (!found) return;
        setShelfBooks((books) =>
          books.some((b) => b.id === found.id)
            ? books
            : books.map((b) => (b.id === sample.id ? { ...b, ...found, title: b.title } : b)),
        );
        setVoted((v) => {
          if (!v.has(sample.id)) return v;
          const next = new Set(v);
          next.delete(sample.id);
          next.add(found.id);
          return next;
        });
      } catch (err) {
        // The shelf still works with the placeholder; it just has no cover.
        if (err.name !== "AbortError") console.warn(err);
      }
    });
    return () => ctrl.abort();
  }, []);

  // Debounced Google Books search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setResults(await searchBooks(q, 6, ctrl.signal));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.warn(err);
        setResults(err instanceof BooksRateLimited ? "limited" : "error");
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (picked) reasonRef.current?.focus();
  }, [picked]);

  function pick(book) {
    setPicked(book);
    setReason("");
    setResults(null);
  }

  function resetForm() {
    setPicked(null);
    setReason("");
    setResults(null);
    setQuery("");
  }

  // BACKEND HOOK: save the book with 1 vote from this visitor — or, if it's
  // already on the shelf, stack this visitor's note (and vote, if they
  // haven't voted yet) onto the existing entry instead of adding a copy.
  function addBook(book) {
    const note = reason.trim().slice(0, REASON_MAX);
    const onShelf = findOnShelf(shelfBooks, book);

    if (onShelf) {
      const addVote = !voted.has(onShelf.id);
      setShelfBooks((books) =>
        books.map((b) =>
          b.id === onShelf.id
            ? {
                ...b,
                reasons: note ? [...b.reasons, note] : b.reasons,
                votes: b.votes + (addVote ? 1 : 0),
              }
            : b,
        ),
      );
      if (addVote) setVoted((v) => new Set(v).add(onShelf.id));
      setStatus(
        `"${onShelf.title}" was already on the shelf, so we added your ${
          note && addVote ? "note and vote" : note ? "note" : "vote"
        } to it!`,
      );
    } else {
      setShelfBooks((books) => [...books, { ...book, reasons: note ? [note] : [], votes: 1 }]);
      setVoted((v) => new Set(v).add(book.id));
      setStatus(`Added "${book.title}" to the shelf!`);
    }
    resetForm();
  }

  function toggleNotes(id) {
    setOpenNotes((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  // BACKEND HOOK: add or remove this visitor's vote
  function toggleVote(id) {
    const had = voted.has(id);
    setVoted((v) => {
      const next = new Set(v);
      if (had) next.delete(id);
      else next.add(id);
      return next;
    });
    setShelfBooks((books) =>
      books.map((b) => (b.id === id ? { ...b, votes: b.votes + (had ? -1 : 1) } : b)),
    );
  }

  const existing = picked && findOnShelf(shelfBooks, picked);
  const alreadyVoted = existing && voted.has(existing.id);
  // Too-short queries show nothing, whatever the last search returned.
  const shownResults = query.trim().length >= 2 ? results : null;
  const topFive = [...shelfBooks].sort((a, b) => b.votes - a.votes).slice(0, 5);
  // The full list is A–Z so it's easy to browse; the Top 5 does the ranking.
  const allBooks = [...shelfBooks].sort((a, b) =>
    a.title.replace(/^(the|a|an)\s+/i, "").localeCompare(b.title.replace(/^(the|a|an)\s+/i, "")),
  );

  return (
    <div className="bookshelf">
      <h1 className="shelf-heading">
        <span>The Shelf</span>
      </h1>
      <p className="shelf-sub">
        Books recommended by people who stopped by. Add one you loved, and vote for the ones
        you've enjoyed too.
      </p>

      <section className="shelf-panel" aria-labelledby="shelf-add-heading">
        <label id="shelf-add-heading" htmlFor="shelf-search">
          Recommend a book
        </label>
        <input
          id="shelf-search"
          className="shelf-input"
          type="search"
          placeholder="Search by title or author..."
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPicked(null);
          }}
        />

        <ul className="shelf-results" aria-live="polite">
          {shownResults === "limited" && (
            <li className="shelf-note">Lots of people are searching right now. Try again in a minute.</li>
          )}
          {shownResults === "error" && (
            <li className="shelf-note">Search isn't working right now. Try again in a moment.</li>
          )}
          {Array.isArray(shownResults) && !shownResults.length && (
            <li className="shelf-note">No books found. Try another spelling.</li>
          )}
          {Array.isArray(shownResults) &&
            shownResults.map((book) => (
              <li key={book.id} className="shelf-result">
                <Cover url={book.cover} title={book.title} />
                <div className="shelf-meta">
                  <div className="shelf-title">{book.title}</div>
                  <div className="shelf-author">{book.authors || "Unknown author"}</div>
                </div>
                <button className="shelf-crayon" type="button" onClick={() => pick(book)}>
                  Pick
                </button>
              </li>
            ))}
        </ul>

        {picked && (
          <div className="shelf-confirm">
            <div className="shelf-confirm-head">
              <Cover url={picked.cover} title={picked.title} />
              <div className="shelf-meta">
                <div className="shelf-title">{picked.title}</div>
                <div className="shelf-author">
                  {existing
                    ? `Already on the shelf with ${existing.votes} vote${existing.votes === 1 ? "" : "s"}${
                        alreadyVoted ? " (including yours)" : ""
                      }. Add your note to it!`
                    : picked.authors || "Unknown author"}
                </div>
              </div>
            </div>
            <input
              ref={reasonRef}
              className="shelf-input"
              type="text"
              maxLength={REASON_MAX}
              placeholder={
                alreadyVoted
                  ? "What did you love about it?"
                  : "Why should people read it? (optional)"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="shelf-confirm-actions">
              <button
                className="shelf-crayon"
                type="button"
                // Already voted: the note is the only thing left to add.
                disabled={alreadyVoted && !reason.trim()}
                onClick={() => addBook(picked)}
              >
                {!existing ? "Add to the shelf" : alreadyVoted ? "Add your note" : "Add your vote"}
              </button>
              <button className="shelf-link-btn" type="button" onClick={resetForm}>
                Cancel
              </button>
              <span className="shelf-counter">
                {reason.length}/{REASON_MAX}
              </span>
            </div>
          </div>
        )}

        <p className="shelf-status" role="status">
          {status}
        </p>
      </section>

      {!shelfBooks.length ? (
        <p className="shelf-empty">The shelf is empty. Be the first to recommend something!</p>
      ) : (
        <>
          <section aria-labelledby="shelf-top-heading">
            <h2 id="shelf-top-heading" className="shelf-subheading">
              Top 5
            </h2>
            <ol className="shelf-list">
              {topFive.map((book, i) => renderBook(book, "top", i + 1))}
            </ol>
          </section>

          <section aria-labelledby="shelf-all-heading" className="shelf-all">
            <h2 id="shelf-all-heading" className="shelf-subheading">
              All recommendations{" "}
              <span className="shelf-count">({shelfBooks.length})</span>
            </h2>
            <ul className="shelf-list">{allBooks.map((book) => renderBook(book, "all"))}</ul>
          </section>
        </>
      )}

      <p className="shelf-credit">Book details and covers from Google Books.</p>
    </div>
  );

  // One book row, used by both the Top 5 (with its rank) and the full list.
  // Notes open per list, so opening a book's notes in one doesn't open the
  // other copy too.
  function renderBook(book, list, rank) {
    const link = safeLink(book.link);
    const isVoted = voted.has(book.id);
    const votes = Math.max(0, Number(book.votes) || 0);
    const notesKey = `${list}:${book.id}`;
    const notesOpen = openNotes.has(notesKey);
    return (
      <li
        key={book.id}
        className={`shelf-book${rank ? " ranked" : ""}${rank === 1 ? " first" : ""}`}
      >
        {rank && (
          <span className="shelf-rank" aria-label={`Number ${rank}`}>
            {rank === 1 ? "★" : rank}
          </span>
        )}
        <Cover url={book.cover} alt={`Cover of ${book.title}`} title={book.title} />
        <div className="shelf-meta">
          <div className="shelf-title">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                {book.title}
              </a>
            ) : (
              book.title
            )}
          </div>
          <div className="shelf-author">{book.authors || "Unknown author"}</div>
        </div>
        <div className="shelf-actions">
          {book.reasons.length > 0 && (
            <button
              className={`shelf-crayon shelf-tally shelf-notes-btn${notesOpen ? " voted" : ""}`}
              type="button"
              aria-expanded={notesOpen}
              aria-controls={`shelf-notes-${list}-${book.id}`}
              aria-label={`${notesOpen ? "Hide" : "Show"} ${book.reasons.length} notes about ${book.title}`}
              onClick={() => toggleNotes(notesKey)}
            >
              <svg className="shelf-bubble" viewBox="0 0 24 22" aria-hidden="true">
                <path d="M4 2.5h16a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H4A2.5 2.5 0 0 1 1.5 14V5A2.5 2.5 0 0 1 4 2.5z" />
              </svg>
              <span className="num" aria-hidden="true">
                {book.reasons.length}
              </span>
            </button>
          )}
          <button
            className={`shelf-crayon shelf-tally shelf-vote${isVoted ? " voted" : ""}`}
            type="button"
            aria-pressed={isVoted}
            aria-label={`${isVoted ? "Remove your vote for" : "Vote for"} ${book.title}, ${votes} votes`}
            onClick={() => toggleVote(book.id)}
          >
            <span aria-hidden="true">{isVoted ? "♥" : "▲"}</span>
            <span className="num" aria-hidden="true">
              {votes}
            </span>
          </button>
        </div>
        {notesOpen && (
          <div id={`shelf-notes-${list}-${book.id}`} className="shelf-notes">
            {book.reasons.map((r, i) => (
              <p key={i} className="shelf-reason">
                “{r}”
              </p>
            ))}
          </div>
        )}
      </li>
    );
  }
}

/**
 * The bookshelf popup, app-wide like RadioLayer so it floats over the
 * blurred street the same way. Only hidden when closed, never unmounted, so
 * the (in-memory, for now) shelf and a half-typed search survive closing it.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 */
export default function BookshelfLayer({ open, onClose }) {
  return (
    <div className="bookshelf-layer">
      <div className="bookshelf-modal-backdrop" hidden={!open} onClick={onClose}>
        <div
          className="bookshelf-modal"
          role="dialog"
          aria-label="Community bookshelf"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="bookshelf-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
          <Bookshelf />
        </div>
      </div>
    </div>
  );
}
