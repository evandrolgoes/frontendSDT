export function AgroLandingTitle({ children, className = "" }) {
  return <h2 className={`agro-landing-title ${className}`.trim()}>{children}</h2>;
}

export function AgroLandingSubtitle({ children, className = "" }) {
  return <p className={`agro-landing-subtitle ${className}`.trim()}>{children}</p>;
}

export function AgroLandingLabel({ children, className = "" }) {
  return <span className={`agro-landing-label ${className}`.trim()}>{children}</span>;
}
