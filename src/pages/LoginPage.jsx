import { useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(form);
    } catch {
      setError("Nao foi possivel autenticar com as credenciais informadas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <aside className="login-aside">
          <div className="mono">SDT Position SaaS</div>
          <h1>Gestao integrada de risco, hedge e exposicao agricola.</h1>
          <p>
            Plataforma preparada para multi-tenant, operacoes fisicas, derivativos, estrategias, mercado,
            mark-to-market e trilha de auditoria.
          </p>
        </aside>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mono muted">Autenticacao JWT</div>
          <h2>Acesse sua conta</h2>
          <p className="muted">Use o mesmo usuario configurado no backend Django.</p>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            />
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </div>
          {error ? (
            <p style={{ color: "#b91c1c", marginTop: 16 }}>{error}</p>
          ) : null}
          <div className="form-actions" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary">
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
