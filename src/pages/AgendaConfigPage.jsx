import { useEffect, useState } from "react";
import { api } from "../services/api";

export function AgendaConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nome: "", client_id: "", client_secret: "", calendar_id: "primary" });

  const oauthParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("oauth") : null;

  useEffect(() => {
    if (oauthParam === "success") {
      setNotice("Agenda conectada com sucesso!");
      window.history.replaceState({}, "", "/agenda-config");
    } else if (oauthParam === "error") {
      setError("Nao foi possivel conectar a agenda. Verifique as credenciais e tente novamente.");
      window.history.replaceState({}, "", "/agenda-config");
    }
  }, [oauthParam]);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/agenda-configs/");
      setConfigs(Array.isArray(data) ? data : (data.results || []));
    } catch {
      setError("Erro ao carregar configuracoes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const resetForm = () => {
    setForm({ nome: "", client_id: "", client_secret: "", calendar_id: "primary" });
    setEditingId(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (config) => {
    setForm({
      nome: config.nome,
      client_id: config.client_id,
      client_secret: "",
      calendar_id: config.calendar_id,
    });
    setEditingId(config.id);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { ...form };
      if (editingId && !payload.client_secret) {
        delete payload.client_secret;
      }
      if (editingId) {
        await api.patch(`/agenda-configs/${editingId}/`, payload);
      } else {
        await api.post("/agenda-configs/", payload);
      }
      resetForm();
      await loadConfigs();
      setNotice(editingId ? "Configuracao atualizada." : "Configuracao criada.");
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.nome?.[0] || "Erro ao salvar.";
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Deseja excluir esta configuracao?")) return;
    setError("");
    try {
      await api.delete(`/agenda-configs/${id}/`);
      await loadConfigs();
      setNotice("Configuracao excluida.");
    } catch {
      setError("Erro ao excluir.");
    }
  };

  const handleConnect = async (config) => {
    setError("");
    try {
      const { data } = await api.get(`/agenda/oauth/init/?config_id=${config.id}`);
      window.open(data.auth_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      const detail = err?.response?.data?.detail || "Erro ao iniciar conexao OAuth.";
      setError(detail);
    }
  };

  const handleDisconnect = async (config) => {
    if (!window.confirm(`Desconectar a agenda "${config.nome}"?`)) return;
    setError("");
    try {
      await api.post(`/agenda/oauth/disconnect/${config.id}/`);
      await loadConfigs();
      setNotice("Agenda desconectada.");
    } catch {
      setError("Erro ao desconectar.");
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Configuracoes de Agenda</h1>
        <button onClick={openCreate} style={styles.btnPrimary}>+ Nova Agenda</button>
      </div>

      {notice && (
        <div style={styles.notice}>
          {notice}
          <button onClick={() => setNotice("")} style={styles.dismissBtn}>×</button>
        </div>
      )}
      {error && (
        <div style={styles.errorBox}>
          {error}
          <button onClick={() => setError("")} style={styles.dismissBtn}>×</button>
        </div>
      )}

      {showForm && (
        <div style={styles.formCard}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>{editingId ? "Editar Agenda" : "Nova Agenda"}</h2>
          <form onSubmit={handleSave}>
            <div style={styles.field}>
              <label style={styles.label}>Nome</label>
              <input
                style={styles.input}
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="ex: Agenda Comercial"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Client ID</label>
              <input
                style={styles.input}
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                placeholder="Cole o Client ID do Google Cloud Console"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Client Secret{editingId ? " (deixe em branco para manter)" : ""}</label>
              <input
                style={styles.input}
                type="password"
                value={form.client_secret}
                onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))}
                placeholder="Cole o Client Secret"
                required={!editingId}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Calendar ID</label>
              <input
                style={styles.input}
                value={form.calendar_id}
                onChange={(e) => setForm((f) => ({ ...f, calendar_id: e.target.value }))}
                placeholder='primary ou ID especifico da agenda'
              />
              <small style={{ color: "#888" }}>
                Use <strong>primary</strong> para a agenda principal ou o ID de uma agenda especifica (encontrado nas configuracoes do Google Calendar).
              </small>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="submit" style={styles.btnPrimary} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" onClick={resetForm} style={styles.btnSecondary}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#888" }}>Carregando...</p>
      ) : configs.length === 0 ? (
        <div style={styles.emptyState}>
          <p>Nenhuma agenda configurada ainda.</p>
          <p style={{ fontSize: 14, color: "#888" }}>
            Clique em <strong>+ Nova Agenda</strong> e informe as credenciais OAuth obtidas no Google Cloud Console.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {configs.map((config) => (
            <div key={config.id} style={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{config.nome}</div>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>
                    Calendar ID: <code>{config.calendar_id}</code>
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    Client ID: <code style={{ wordBreak: "break-all" }}>{config.client_id}</code>
                  </div>
                </div>
                <span style={config.conectada ? styles.badgeOk : styles.badgePending}>
                  {config.conectada ? "Conectada" : "Aguardando conexao"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {config.conectada ? (
                  <button onClick={() => handleDisconnect(config)} style={styles.btnDanger}>Desconectar</button>
                ) : (
                  <button onClick={() => handleConnect(config)} style={styles.btnGoogle}>
                    Conectar com Google
                  </button>
                )}
                <button onClick={() => openEdit(config)} style={styles.btnSecondary}>Editar</button>
                <button onClick={() => handleDelete(config.id)} style={styles.btnDangerOutline}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 40, padding: 16, background: "#f8f9fa", borderRadius: 8, fontSize: 13, color: "#555" }}>
        <strong>Como configurar:</strong>
        <ol style={{ margin: "8px 0 0 0", paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Acesse o <strong>Google Cloud Console</strong> e crie (ou selecione) um projeto</li>
          <li>Ative a <strong>Google Calendar API</strong></li>
          <li>Em <em>Credenciais</em>, crie uma credencial <strong>OAuth 2.0</strong> do tipo <em>Aplicativo da Web</em></li>
          <li>Adicione o URI de redirecionamento autorizado fornecido pelo administrador do sistema</li>
          <li>Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> e cole no formulario acima</li>
          <li>Salve e clique em <strong>Conectar com Google</strong> para autorizar o acesso</li>
        </ol>
      </div>
    </div>
  );
}

const styles = {
  btnPrimary: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  },
  btnSecondary: {
    background: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  btnDanger: {
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  btnDangerOutline: {
    background: "transparent",
    color: "#dc2626",
    border: "1px solid #dc2626",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 14,
  },
  btnGoogle: {
    background: "#fff",
    color: "#3c4043",
    border: "1px solid #dadce0",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  formCard: {
    background: "#f8faff",
    border: "1px solid #bfdbfe",
    borderRadius: 8,
    padding: 20,
    marginBottom: 24,
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 16,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    border: "1px solid #d1d5db",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 14,
    outline: "none",
  },
  notice: {
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
    borderRadius: 6,
    padding: "10px 14px",
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorBox: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: 6,
    padding: "10px 14px",
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dismissBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: "0 4px",
  },
  badgeOk: {
    background: "#dcfce7",
    color: "#166534",
    borderRadius: 12,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  badgePending: {
    background: "#fef9c3",
    color: "#854d0e",
    borderRadius: 12,
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  emptyState: {
    textAlign: "center",
    padding: 40,
    color: "#64748b",
    border: "2px dashed #e2e8f0",
    borderRadius: 8,
  },
};
