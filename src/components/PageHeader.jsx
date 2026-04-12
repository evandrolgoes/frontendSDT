export function PageHeader({ title, description, tag, hint }) {
  return (
    <div className="page-header">
      <div className="page-header-main">
        {tag ? <div className="mono muted">{tag}</div> : null}
        <h2 className="page-header-title">
          {title}
          {hint ? <span className="page-header-hint">{hint}</span> : null}
        </h2>
      </div>
      {description ? <p className="page-header-description muted">{description}</p> : null}
    </div>
  );
}
