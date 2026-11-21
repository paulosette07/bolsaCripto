import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Bolsa Monitor',
    template: '%s · Bolsa Monitor'
  },
  description:
    'Acompanhe ações, FIIs e criptomoedas em tempo real, gerencie sua carteira e receba alertas de preço por e-mail.',
  applicationName: 'Bolsa Monitor'
};

export const viewport: Viewport = {
  themeColor: '#121214',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
