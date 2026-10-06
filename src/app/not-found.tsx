import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="not-found">
      <h1>No encontramos esta página</h1>
      <p>La empresa o cuenta puede no pertenecer a tu holding.</p>
      <Link className="button button-primary" href="/">
        Volver al dashboard
      </Link>
    </div>
  );
}
