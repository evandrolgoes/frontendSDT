import { useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { ResourceForm } from "../components/ResourceForm";
import { useResourceCrud } from "../hooks/useResourceCrud";

export function ResourcePage({ definition }) {
  const { rows, loading, save, remove, filters, setFilters, pagination, load } = useResourceCrud(
    definition.resource,
    { page: 1 },
  );
  const [current, setCurrent] = useState(null);

  return (
    <div>
      <PageHeader title={definition.title} description={definition.description} tag={definition.resource} />
      <div className="content-grid">
        <DataTable
          title={loading ? `${definition.title} carregando...` : definition.title}
          columns={definition.columns}
          rows={rows}
          filters={definition.filters}
          filterValues={filters}
          onFilterChange={(name, value) => setFilters((currentFilters) => ({ ...currentFilters, [name]: value, page: 1 }))}
          pagination={pagination}
          onPageChange={(page) => load({ page })}
          onEdit={(item) => setCurrent(item)}
          onDelete={remove}
        />
        <ResourceForm
          title={current ? `Editar ${definition.title}` : `Novo ${definition.title}`}
          fields={definition.fields}
          initialValues={current || {}}
          onSubmit={async (payload) => {
            await save(payload, current);
            setCurrent(null);
          }}
        />
      </div>
    </div>
  );
}
