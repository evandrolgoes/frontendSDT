import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../services/api";

const extractMessage = (error) => {
  const data = error?.response?.data;
  if (!data) {
    return "Nao foi possivel redefinir a senha.";
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
  return Object.values(data).flat().join(" ") || "Nao foi possivel redefinir a senha.";
};

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const [form, setForm] = useState({ new_password: "", confirm_password: "" });
  const [state, setState] = useState({ loading: false, error: "", success: "" });

  const linkIsValid = useMemo(() => Boolean(uid && token), [token, uid]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.new_password !== form.confirm_password) {
      setState({ loading: false, error: "As senhas informadas nao coincidem.", success: "" });
      return;
    }

    setState({ loading: true, error: "", success: "" });
    try {
      const { data } = await api.post("/auth/reset-password-confirm/", {
        uid,
        token,
        new_password: form.new_password,
      });
      setState({ loading: false, error: "", success: data.detail });
      setForm({ new_password: "", confirm_password: "" });
    } catch (requestError) {
      setState({ loading: false, error: extractMessage(requestError), success: "" });
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <aside className="login-aside">
          <div className="mono">Hedge Position SaaS</div>
          <h1>Redefinicao de senha.</h1>
          <p>Defina uma nova senha para voltar a acessar a plataforma com seguranca.</p>
        </aside>
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="mono muted">Recuperacao de acesso</div>
          <h2>Criar nova senha</h2>
          <p className="muted">Use uma senha forte com pelo menos 8 caracteres.</p>
          {!linkIsValid ? (
            <p style={{ color: "#b91c1c" }}>Link de redefinicao invalido.</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="new_password">Nova senha</label>
                <input
                  id="new_password"
                  type="password"
                  value={form.new_password}
                  onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
                />
              </div>
              <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="confirm_password">Confirmar senha</label>
                <input
                  id="confirm_password"
                  type="password"
                  value={form.confirm_password}
                  onChange={(event) => setForm((current) => ({ ...current, confirm_password: event.target.value }))}
                />
              </div>
            </>
          )}
          {state.error ? <p style={{ color: "#b91c1c", marginTop: 16 }}>{state.error}</p> : null}
          {state.success ? <p style={{ color: "#166534", marginTop: 16 }}>{state.success}</p> : null}
          <div className="form-actions" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary" disabled={!linkIsValid}>
              {state.loading ? "Salvando..." : "Redefinir senha"}
            </button>
            <Link className="btn btn-secondary" to="/login">
              Voltar ao login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
