import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import LoadingLogo from "../../components/LoadingLogo";
import "./Admin.css";

// The admin shell: sign-in, then a tab per thing to moderate. Each tab is a
// child route (/admin/drawings, /admin/shelf) rendered through <Outlet>.
const SECTIONS = [
  { path: "drawings", label: "Drawings" },
  { path: "shelf", label: "Shelf" },
];

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

export default function Admin() {
  const navigate = useNavigate();
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [authError, setAuthError] = useState(null);

  // Shelf visitors get an anonymous sign-in (see shelfStore.js); that isn't
  // an admin, so it shows the login form like being signed out.
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);

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

      {user === undefined && <LoadingLogo className="admin-loading" label="Checking sign-in" />}

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

      {user && (
        <>
          <nav className="admin-tabs" aria-label="Admin sections">
            {SECTIONS.map((s) => (
              <NavLink key={s.path} to={s.path} className="admin-tab">
                {s.label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </>
      )}
    </div>
  );
}
