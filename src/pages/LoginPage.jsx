import { useState } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";

const formatBrazilianPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (!digits) {
    return "";
  }
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const extractMessage = (error) => {
  const data = error?.response?.data;
  if (!data) {
    return "Nao foi possivel autenticar com as credenciais informadas.";
  }
  if (typeof data === "string") {
    return data;
  }
  if (data.detail) {
    return data.detail;
  }
  if (Array.isArray(data.non_field_errors)) {
    return data.non_field_errors.join(" ");
  }
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : value}`)
      .join(" | ");
  }
  return "Nao foi possivel autenticar com as credenciais informadas.";
};

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [forgotForm, setForgotForm] = useState({ email: "" });
  const [accessForm, setAccessForm] = useState({ full_name: "", email: "", company: "", phone: "", message: "" });
  const [forgotState, setForgotState] = useState({ loading: false, error: "", success: "" });
  const [accessState, setAccessState] = useState({ loading: false, error: "", success: "" });

  if (isAuthenticated) {
    return <Navigate to="/resumo" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(form);
    } catch (loginError) {
      setError(extractMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    setForgotState({ loading: true, error: "", success: "" });
    try {
      const { data } = await api.post("/auth/forgot-password/", forgotForm);
      setForgotState({ loading: false, error: "", success: data.detail });
    } catch (requestError) {
      setForgotState({ loading: false, error: extractMessage(requestError), success: "" });
    }
  };

  const handleAccessSubmit = async (event) => {
    event.preventDefault();
    setAccessState({ loading: true, error: "", success: "" });
    try {
      const { data } = await api.post("/auth/request-access/", accessForm);
      setAccessState({ loading: false, error: "", success: data.detail });
    } catch (requestError) {
      setAccessState({ loading: false, error: extractMessage(requestError), success: "" });
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <aside className="login-aside">
          <div className="mono">Hedge Position SaaS</div>
          <h1>Gestao integrada de risco, hedge e exposicao agricola.</h1>
          <p>
            Plataforma preparada para multi-tenant, operacoes fisicas, derivativos, estrategias, mercado,
            mark-to-market e trilha de auditoria.
          </p>
        </aside>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mono muted">Autenticacao JWT</div>
          <h2>Acesse sua conta</h2>
          <p className="muted">Use seu usuario ou email cadastrado no backend Django.</p>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              placeholder="Usuario ou email"
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
          <div className="form-actions login-form-actions" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary">
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </div>
          <div className="login-support-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setForgotOpen(true)}>
              Esqueceu a senha
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAccessOpen(true)}>
              Solicitar acesso
            </button>
          </div>
        </form>
      </div>

      {forgotOpen ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setForgotOpen(false)} />
          <form className="modal-card login-modal-card" onSubmit={handleForgotSubmit}>
            <div className="modal-header">
              <div>
                <strong>Esqueceu a senha</strong>
                <div className="muted">Se o e-mail informado estiver cadastrado, enviaremos um link para redefinicao.</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setForgotOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="form-grid">
              <div className="field field-full">
                <label htmlFor="forgot_email">Email</label>
                <input
                  id="forgot_email"
                  type="email"
                  value={forgotForm.email}
                  onChange={(event) => setForgotForm({ email: event.target.value })}
                />
              </div>
            </div>
            {forgotState.error ? <p style={{ color: "#b91c1c" }}>{forgotState.error}</p> : null}
            {forgotState.success ? <p style={{ color: "#166534" }}>{forgotState.success}</p> : null}
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setForgotOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                {forgotState.loading ? "Enviando..." : "Enviar link"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {accessOpen ? (
        <div className="modal-shell">
          <div className="modal-backdrop" onClick={() => setAccessOpen(false)} />
          <form className="modal-card login-modal-card" onSubmit={handleAccessSubmit}>
            <div className="modal-header">
              <div>
                <strong>Solicitar acesso</strong>
                <div className="muted">Sua solicitacao sera enviada para aprovacao de acesso.</div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setAccessOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="access_full_name">Nome completo</label>
                <input
                  id="access_full_name"
                  value={accessForm.full_name}
                  onChange={(event) => setAccessForm((current) => ({ ...current, full_name: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="access_email">Email</label>
                <input
                  id="access_email"
                  type="email"
                  value={accessForm.email}
                  onChange={(event) => setAccessForm((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="access_company">Empresa</label>
                <input
                  id="access_company"
                  value={accessForm.company}
                  onChange={(event) => setAccessForm((current) => ({ ...current, company: event.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="access_phone">Telefone</label>
                <input
                  id="access_phone"
                  value={accessForm.phone}
                  onChange={(event) => setAccessForm((current) => ({ ...current, phone: formatBrazilianPhone(event.target.value) }))}
                />
              </div>
              <div className="field field-full">
                <label htmlFor="access_message">Mensagem</label>
                <textarea
                  id="access_message"
                  rows="4"
                  value={accessForm.message}
                  onChange={(event) => setAccessForm((current) => ({ ...current, message: event.target.value }))}
                />
              </div>
            </div>
            {accessState.error ? <p style={{ color: "#b91c1c" }}>{accessState.error}</p> : null}
            {accessState.success ? <p style={{ color: "#166534" }}>{accessState.success}</p> : null}
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setAccessOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                {accessState.loading ? "Enviando..." : "Solicitar acesso"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
