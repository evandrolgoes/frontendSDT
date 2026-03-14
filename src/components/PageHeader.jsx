export function PageHeader({ title, description, tag }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {tag ? <div className="mono muted">{tag}</div> : null}
      <h2 style={{ margin: "4px 0 8px" }}>{title}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {description}
      </p>
    </div>
  );
}
