export default function Loading() {
  return (
    <div className="loading-page" role="status">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-filters" />
      <div className="skeleton skeleton-hero" />
      <div className="metrics">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-metric" />
        ))}
      </div>
      <p>Cargando información financiera…</p>
    </div>
  );
}
