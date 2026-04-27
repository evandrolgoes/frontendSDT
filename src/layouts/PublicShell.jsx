import { Link } from "react-router-dom";

export function PublicShell({ children }) {
  return (
    <div className="public-shell">
      <header className="public-shell-topbar">
        <Link to="/mercado/blog" className="public-shell-brand">Hedge Position</Link>
        <Link to="/login" className="btn btn-primary public-shell-login">Entrar</Link>
      </header>
      <main className="public-shell-main">
        <div className="route-content">{children}</div>
      </main>
    </div>
  );
}
