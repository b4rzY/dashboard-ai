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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t='system';try{var s=localStorage.getItem('gozo-appearance');if(s==='light'||s==='dark'||s==='gold'||s==='system')t=s}catch(e){}document.documentElement.dataset.appearance=t;document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
