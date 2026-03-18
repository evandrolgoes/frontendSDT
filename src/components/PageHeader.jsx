export function PageHeader({ title, description, tag }) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {tag ? <div className="mono muted">{tag}</div> : null}
        <h2 className="page-header-title">{title}</h2>
      </div>
      <p className="page-header-description muted">{description}</p>
    </div>
  );
}
