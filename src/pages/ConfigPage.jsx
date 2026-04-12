import { useMemo, useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { MissingFieldsIgnoredConfigPanel } from "../components/MissingFieldsIgnoredConfigPanel";
import { ResourceForm } from "../components/ResourceForm";
import { ResourceTable } from "../components/ResourceTable";
import { TableColumnsConfigPanel } from "../components/TableColumnsConfigPanel";
import { useResourceCrud } from "../hooks/useResourceCrud";
import { resourceDefinitions } from "../modules/resourceDefinitions";
import { resourceService } from "../services/resourceService";

const CONFIG_SECTIONS = [
  { id: "tenants", eyebrow: "Estrutura", kind: "resource" },
  { id: "crops", eyebrow: "Cadastro base", kind: "resource" },
  { id: "currencies", eyebrow: "Cadastro base", kind: "resource" },
  { id: "units", eyebrow: "Cadastro base", kind: "resource" },
  { id: "priceUnits", eyebrow: "Composicao", kind: "resource" },
  { id: "exchanges", eyebrow: "Mercado", kind: "resource" },
  { id: "derivativeOperationNames", eyebrow: "Derivativos", kind: "resource" },
  { id: "seasons", eyebrow: "Cadastro base", kind: "resource" },
  {
    id: "missing-fields",
    title: "Pendencias cadastrais",
    description: "Defina quais campos devem ser ignorados na leitura das pendencias cadastrais.",
    eyebrow: "Configuracao ativa",
    kind: "panel",
  },
  {
    id: "table-columns",
    title: "Colunas Tabelas",
    description: "Defina ordem e visibilidade das colunas das tabelas de operacoes e cadastros.",
    eyebrow: "Preferencia de tabela",
    kind: "panel",
  },
];

function ResourceConfigWorkspace({ section }) {
  const definition = resourceDefinitions[section.id];
  const { rows, loading, save, load, error, setError } = useResourceCrud(definition.resource, { page: 1 });
  const [search, setSearch] = useState("");
  const [current, setCurrent] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const openCreate = () => {
    setError("");
    setCurrent(null);
    setIsFormOpen(true);
  };

  const openEdit = async (item) => {
    setError("");
    try {
      const detailedItem = await resourceService.getOne(definition.resource, item.id);
      setCurrent(detailedItem || item);
      setIsFormOpen(true);
    } catch {
      setCurrent(item);
      setIsFormOpen(true);
    }
  };

  const handleSubmit = async (payload) => {
    const savedRecord = await save(payload, current);
    if (!savedRecord) {
      return;
    }

    setIsFormOpen(false);
    setCurrent(null);
    await load({ force: true, silent: true });
  };

  return (
    <>
      <section className="panel config-section-hero">
        <span className="config-section-eyebrow">{section.eyebrow}</span>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
      </section>

      <section className="panel config-resource-shell">
        <div className="config-resource-toolbar">
          <div>
            <strong>{section.title}</strong>
            <p>{rows.length} item(ns) cadastrado(s).</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Cadastrar novo item
          </button>
        </div>

        {error ? <div className="form-error">{error}</div> : null}

        <ResourceTable
          definition={definition}
          rows={rows}
          cardTitle={null}
          searchValue={search}
          searchPlaceholder={definition.searchPlaceholder || `Buscar ${section.title.toLowerCase()}...`}
          onSearchChange={setSearch}
          onCreate={openCreate}
          onEdit={openEdit}
          onClear={() => setSearch("")}
          showClearButton
          inheritDashboardGroupFilters={false}
          tableHeight="calc(100vh - 380px)"
          selectedId={current?.id ?? null}
        />

        {loading ? <div className="config-resource-status">Carregando registros...</div> : null}
      </section>

      {isFormOpen ? (
        <ResourceForm
          title={current?.id ? `Editar ${section.title}` : `Novo ${section.title}`}
          fields={definition.fields || []}
          initialValues={current || {}}
          onSubmit={handleSubmit}
          onClose={() => {
            setIsFormOpen(false);
            setCurrent(null);
            setError("");
          }}
          error={error}
          submitLabel={current?.id ? "Salvar alteracoes" : "Cadastrar"}
        />
      ) : null}
    </>
  );
}

export function ConfigPage() {
  const [activeSectionId, setActiveSectionId] = useState("tenants");

  const sections = useMemo(
    () =>
      CONFIG_SECTIONS.map((section) => {
        if (section.kind !== "resource") {
          return section;
        }

        const definition = resourceDefinitions[section.id];
        return {
          ...section,
          title: definition?.title || section.id,
          description: definition?.description || "Cadastro administrativo do sistema.",
        };
      }),
    [],
  );

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) || sections[0],
    [activeSectionId, sections],
  );

  return (
    <div className="page-stack config-page">
      <PageHeader
        tag="Ferramentas"
        title="Config"
        description="Centraliza os cadastros de sistema e as configuracoes operacionais em um menu lateral unico."
      />

      <div className="config-shell">
        <aside className="panel config-sidebar">
          

          <nav className="config-sidebar-nav" aria-label="Menu de configuracoes">
            {sections.map((section) => {
              const isActive = section.id === activeSection.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`config-sidebar-link${isActive ? " is-active" : ""}`}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span className="config-sidebar-link-label">{section.title}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="config-content">
          {activeSection.kind === "panel" ? (
            <>
              <section className="panel config-section-hero">
                <span className="config-section-eyebrow">{activeSection.eyebrow}</span>
                <h2>{activeSection.title}</h2>
                <p>{activeSection.description}</p>
              </section>
              {activeSection.id === "table-columns" ? <TableColumnsConfigPanel /> : <MissingFieldsIgnoredConfigPanel />}
            </>
          ) : (
            <ResourceConfigWorkspace key={activeSection.id} section={activeSection} />
          )}
        </div>
      </div>
    </div>
  );
}
