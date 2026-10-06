import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Dashboard Bancario — Gozo', template: '%s · Gozo' },
  description: 'Tesorería consolidada del Holding Gozo',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
