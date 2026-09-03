import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://atelier-quantique.jmartin741572.chatgpt.site'),
  title: 'Atelier quantique — PHYS0211-3',
  description:
    'Deux laboratoires interactifs sur le puits infini et l’oscillateur harmonique quantique.',
  openGraph: {
    title: 'Atelier quantique',
    description: 'Puits infini · Oscillateur harmonique',
    type: 'website',
    locale: 'fr_BE',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Atelier quantique — puits infini et oscillateur harmonique',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atelier quantique',
    description: 'Puits infini · Oscillateur harmonique',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <link
          rel="preload"
          href="/fonts/lmroman10-regular.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/latinmodern-math.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
