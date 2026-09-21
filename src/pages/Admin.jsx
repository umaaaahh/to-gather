import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { deleteDrawing, subscribeAdminDrawings } from "../lib/drawingsStore";
import "./Admin.css";

function LoginForm({ onError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      onError("Sign-in failed — check the email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-login" onSubmit={handleSubmit}>
      <h1>Admin sign-in</h1>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function DrawingsList() {
  const [drawings, setDrawings] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [deletingId, setDeletingId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => subscribeAdminDrawings(setDrawings), []);

  // Selections for drawings that no longer exist (deleted elsewhere, or by
  // this session's own bulk/single delete) are filtered out here rather than
  // synced back into `selected` via an effect — a derived view stays correct
  // without a second render pass.
  const liveSelected = useMemo(() => {
    if (!drawings) return selected;
    const liveIds = new Set(drawings.map((d) => d.id));
    return new Set([...selected].filter((id) => liveIds.has(id)));
  }, [selected, drawings]);

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === drawings.length ? new Set() : new Set(drawings.map((d) => d.id))));
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete this ${item.zone} drawing? This can't be undone.`)) return;
    setDeletingId(item.id);
    setError(null);
    try {
      await deleteDrawing(item.id, item.path);
    } catch {
      setError("Delete failed — check your connection and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteSelected() {
    const items = drawings.filter((d) => liveSelected.has(d.id));
    if (items.length === 0) return;
    if (!window.confirm(`Delete ${items.length} selected drawing${items.length === 1 ? "" : "s"}? This can't be undone.`)) {
      return;
    }
    setBulkBusy(true);
    setError(null);
    const results = await Promise.allSettled(items.map((item) => deleteDrawing(item.id, item.path)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      setError(`${failed} of ${items.length} deletes failed — check your connection and try again.`);
    }
    setBulkBusy(false);
  }

  if (drawings === null) return <p className="admin-status">Loading drawings…</p>;
  if (drawings.length === 0) return <p className="admin-status">No drawings yet.</p>;

  const allSelected = liveSelected.size === drawings.length;

  return (
    <>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className="admin-toolbar">
        <label className="admin-select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all ({drawings.length})
        </label>
        <button
          type="button"
          className="admin-bulk-delete-btn"
          disabled={liveSelected.size === 0 || bulkBusy}
          onClick={handleDeleteSelected}
        >
          {bulkBusy ? "Deleting…" : `Delete selected (${liveSelected.size})`}
        </button>
      </div>
      <ul className="admin-grid">
        {drawings.map((item) => (
          <li key={item.id} className={`admin-card${liveSelected.has(item.id) ? " admin-card--selected" : ""}`}>
            <label className="admin-card-select">
              <input
                type="checkbox"
                checked={liveSelected.has(item.id)}
                onChange={() => toggleOne(item.id)}
                aria-label={`Select ${item.zone} drawing`}
              />
            </label>
            <img src={item.url} alt={`${item.zone} drawing`} loading="lazy" />
            <div className="admin-card-meta">
              <span className="admin-card-zone">{item.zone}</span>
              <button
                type="button"
                className="admin-delete-btn"
                disabled={deletingId === item.id || bulkBusy}
                onClick={() => handleDelete(item)}
              >
                {deletingId === item.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [authError, setAuthError] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <button className="admin-back" onClick={() => navigate("/")} aria-label="Back to street">
          ‹
        </button>
        <h1 className="admin-title">Admin</h1>
        {user && (
          <button className="admin-signout" onClick={() => signOut(auth)}>
            Sign out
          </button>
        )}
      </header>

      {user === undefined && <p className="admin-status">Checking sign-in…</p>}

      {user === null && (
        <>
          {authError && (
            <p role="alert" className="admin-error">
              {authError}
            </p>
          )}
          <LoginForm onError={setAuthError} />
        </>
      )}

      {user && <DrawingsList />}
    </div>
  );
}
