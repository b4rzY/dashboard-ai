'use client';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="panel empty">
      <h2>No pudimos cargar esta vista</h2>
      <p>
        Revisa los filtros o vuelve a intentarlo. Si persiste, verifica la conexión de la base de
        datos.
      </p>
      <button className="button button-primary" onClick={reset}>
        Reintentar
      </button>
    </section>
  );
}
