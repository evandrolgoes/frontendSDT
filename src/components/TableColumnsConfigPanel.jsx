import { useEffect, useMemo, useState } from "react";

import { resourceDefinitions } from "../modules/resourceDefinitions";
import {
  getTableColumnPreference,
  resetTableColumnPreference,
  saveTableColumnPreference,
} from "../services/tableColumnConfig";
import { usePreparedResourceTable } from "./ResourceTable";

const TABLE_COLUMN_CONFIG_GROUPS = [
  {
    id: "operacoes",
    label: "Operacoes",
    items: [
      "physicalSales",
      "derivativeOperations",
      "physicalPayments",
      "cashPayments",
      "otherCashOutflows",
      "otherEntries",
      "strategies",
      "strategyTriggers",
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    items: [
      "groups",
      "subgroups",
      "counterparties",
      "physicalQuotes",
      "budgetCosts",
      "actualCosts",
      "cropBoards",
      "hedgePolicies",
      "anotacoes",
      "crops",
      "seasons",
      "currencies",
      "units",
      "priceUnits",
      "exchanges",
      "derivativeOperationNames",
    ],
  },
];

const DEFAULT_DEFINITION_KEY = TABLE_COLUMN_CONFIG_GROUPS[0].items[0];
const EMPTY_ROWS = [];

const normalizeDraftColumns = (columns, preference) => {
  const availableColumns = Array.isArray(columns) ? columns : [];
  const columnsByKey = new Map(availableColumns.map((column) => [String(column.key), column]));
  const preferredKeys = Array.isArray(preference?.orderedKeys) ? preference.orderedKeys.map((key) => String(key)) : [];
  const hiddenKeys = new Set(Array.isArray(preference?.hiddenKeys) ? preference.hiddenKeys.map((key) => String(key)) : []);
  const orderedKeys = [
    ...preferredKeys.filter((key) => columnsByKey.has(key)),
    ...availableColumns.map((column) => String(column.key)).filter((key) => !preferredKeys.includes(key)),
  ];

  const draftColumns = orderedKeys
    .map((key) => columnsByKey.get(key))
    .filter(Boolean)
    .map((column) => ({
      key: String(column.key),
      label: column.label || column.key,
      visible: !hiddenKeys.has(String(column.key)),
    }));

  if (draftColumns.length && !draftColumns.some((column) => column.visible)) {
    draftColumns[0] = { ...draftColumns[0], visible: true };
  }

  return draftColumns;
};

export function TableColumnsConfigPanel() {
  const [selectedDefinitionKey, setSelectedDefinitionKey] = useState(DEFAULT_DEFINITION_KEY);
  const [draftColumns, setDraftColumns] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const selectedDefinition = resourceDefinitions[selectedDefinitionKey] || resourceDefinitions[DEFAULT_DEFINITION_KEY];
  const { effectiveTableColumns: availableColumns } = usePreparedResourceTable(selectedDefinition, EMPTY_ROWS, {
    applyColumnConfig: false,
  });

  const selectedResourceLabel = selectedDefinition?.title || selectedDefinitionKey;
  const visibleCount = useMemo(() => draftColumns.filter((column) => column.visible).length, [draftColumns]);

  useEffect(() => {
    if (!selectedDefinition?.resource) {
      setDraftColumns([]);
      return;
    }

    setDraftColumns(normalizeDraftColumns(availableColumns, getTableColumnPreference(selectedDefinition.resource)));
    setStatusMessage("");
  }, [availableColumns, selectedDefinition?.resource]);

  const moveColumn = (columnKey, direction) => {
    setDraftColumns((currentColumns) => {
      const currentIndex = currentColumns.findIndex((column) => column.key === columnKey);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentColumns.length) {
        return currentColumns;
      }

      const nextColumns = [...currentColumns];
      const [column] = nextColumns.splice(currentIndex, 1);
      nextColumns.splice(nextIndex, 0, column);
      return nextColumns;
    });
    setStatusMessage("");
  };

  const toggleColumn = (columnKey) => {
    setDraftColumns((currentColumns) => {
      const currentColumn = currentColumns.find((column) => column.key === columnKey);
      if (!currentColumn) {
        return currentColumns;
      }

      if (currentColumn.visible && currentColumns.filter((column) => column.visible).length <= 1) {
        setStatusMessage("Mantenha pelo menos uma coluna visivel.");
        return currentColumns;
      }

      setStatusMessage("");
      return currentColumns.map((column) =>
        column.key === columnKey ? { ...column, visible: !column.visible } : column,
      );
    });
  };

  const showAllColumns = () => {
    setDraftColumns((currentColumns) => currentColumns.map((column) => ({ ...column, visible: true })));
    setStatusMessage("");
  };

  const saveColumns = () => {
    if (!selectedDefinition?.resource) {
      return;
    }

    if (!visibleCount) {
      setStatusMessage("Mantenha pelo menos uma coluna visivel.");
      return;
    }

    saveTableColumnPreference(selectedDefinition.resource, {
      orderedKeys: draftColumns.map((column) => column.key),
      hiddenKeys: draftColumns.filter((column) => !column.visible).map((column) => column.key),
    });
    setStatusMessage("Colunas salvas para esta tabela.");
  };

  const resetColumns = () => {
    if (!selectedDefinition?.resource) {
      return;
    }

    resetTableColumnPreference(selectedDefinition.resource);
    setDraftColumns(normalizeDraftColumns(availableColumns, {}));
    setStatusMessage("Padrao restaurado para esta tabela.");
  };

  return (
    <section className="panel table-columns-config-panel">
      <div className="config-item-header">
        <div>
          <strong>Colunas Tabelas</strong>
          <p>Escolha quais campos aparecem e a ordem das colunas nas tabelas de operacoes e cadastros.</p>
        </div>
      </div>

      <div className="table-columns-config-layout">
        <aside className="table-columns-config-resource-list" aria-label="Tabelas configuraveis">
          {TABLE_COLUMN_CONFIG_GROUPS.map((group) => (
            <div className="table-columns-config-group" key={group.id}>
              <span>{group.label}</span>
              {group.items
                .filter((definitionKey) => resourceDefinitions[definitionKey])
                .map((definitionKey) => {
                  const definition = resourceDefinitions[definitionKey];
                  const isActive = definitionKey === selectedDefinitionKey;
                  return (
                    <button
                      key={definitionKey}
                      type="button"
                      className={`table-columns-config-resource${isActive ? " is-active" : ""}`}
                      onClick={() => setSelectedDefinitionKey(definitionKey)}
                    >
                      {definition.title}
                    </button>
                  );
                })}
            </div>
          ))}
        </aside>

        <div className="table-columns-config-editor">
          <div className="table-columns-config-editor-head">
            <div>
              <strong>{selectedResourceLabel}</strong>
              <p>
                {visibleCount} de {draftColumns.length} coluna(s) visivel(is).
              </p>
            </div>
            <div className="table-columns-config-actions">
              <button type="button" className="btn btn-secondary" onClick={showAllColumns}>
                Mostrar todas
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetColumns}>
                Restaurar padrao
              </button>
              <button type="button" className="btn btn-primary" onClick={saveColumns} disabled={!draftColumns.length}>
                Salvar alteracoes
              </button>
            </div>
          </div>

          {statusMessage ? <div className="table-columns-config-status">{statusMessage}</div> : null}

          <div className="table-columns-config-column-list">
            {draftColumns.length ? (
              draftColumns.map((column, index) => (
                <div className={`table-columns-config-column${column.visible ? "" : " is-hidden"}`} key={column.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={column.visible}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>
                      <strong>{column.label}</strong>
                      <small>{column.key}</small>
                    </span>
                  </label>
                  <div className="table-columns-config-column-actions">
                    <button
                      type="button"
                      onClick={() => moveColumn(column.key, -1)}
                      disabled={index === 0}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      onClick={() => moveColumn(column.key, 1)}
                      disabled={index === draftColumns.length - 1}
                    >
                      Descer
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="table-columns-config-empty">Nenhuma coluna configuravel para esta tabela.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
