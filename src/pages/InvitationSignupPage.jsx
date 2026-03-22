import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../services/api";

const extractMessage = (error) => {
  const data = error?.response?.data;
  if (!data) {
    return "Nao foi possivel concluir a abertura da conta.";
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
  return "Nao foi possivel concluir a abertura da conta.";
};

export function InvitationSignupPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    phone: "",
    password: "",
    password_confirm: "",
  });

  useEffect(() => {
    let active = true;
    const loadInvitation = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const { data } = await api.get(`/auth/invitations/${token}/`);
        if (!active) {
          return;
        }
        setInvitation(data);
      } catch (error) {
        if (!active) {
          return;
        }
        setLoadError(extractMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadInvitation();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setLoadError("");
    setSuccess("");
    try {
      const { data } = await api.post(`/auth/invitations/${token}/accept/`, form);
      setSuccess(data.detail);
      window.setTimeout(() => navigate("/login"), 1200);
    } catch (error) {
      setLoadError(extractMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <aside className="login-aside">
          <div className="mono">Convite de acesso</div>
          <h1>Abra sua conta e conclua o seu cadastro.</h1>
          <p>
            Este fluxo foi criado para novos usuarios convidados por um admin do cliente dentro do Hedge Position.
          </p>
        </aside>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mono muted">Abertura de conta</div>
          <h2>Concluir cadastro</h2>
          {loading ? <p className="muted">Carregando convite...</p> : null}
          {!loading && invitation ? (
            <div className="invite-signup-summary">
              <div className="field">
                <label>Tenant</label>
                <input value={invitation.tenant_name || ""} disabled />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Email convidado</label>
                <input value={invitation.email || ""} disabled />
              </div>
            </div>
          ) : null}
          {!loading && invitation ? (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite_full_name">Nome completo</label>
                <input
                  id="invite_full_name"
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite_username">Usuario</label>
                <input
                  id="invite_username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite_phone">Telefone</label>
                <input
                  id="invite_phone"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite_password">Senha</label>
                <input
                  id="invite_password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="invite_password_confirm">Confirmar senha</label>
                <input
                  id="invite_password_confirm"
                  type="password"
                  value={form.password_confirm}
                  onChange={(event) => setForm((current) => ({ ...current, password_confirm: event.target.value }))}
                />
              </div>
            </>
          ) : null}
          {loadError ? <p style={{ color: "#b91c1c", marginTop: 16 }}>{loadError}</p> : null}
          {success ? <p style={{ color: "#166534", marginTop: 16 }}>{success}</p> : null}
          <div className="form-actions" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 20 }}>
            {!loading && invitation ? (
              <button type="submit" className="btn btn-primary">
                {submitting ? "Criando conta..." : "Abrir conta"}
              </button>
            ) : null}
            <Link className="btn btn-secondary" to="/login">
              Voltar ao login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
