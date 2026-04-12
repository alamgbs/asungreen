import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AsunGreen — Monitoreo Ambiental Asunción',
  description:
    'Plataforma GIS de análisis ambiental para Asunción y el Departamento Central, Paraguay. Temperatura del suelo, tráfico y NDVI en tiempo real.',
  keywords: ['GIS', 'Paraguay', 'Asunción', 'medio ambiente', 'NDVI', 'temperatura'],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden">
        {children}
      </body>
    </html>
  );
}
