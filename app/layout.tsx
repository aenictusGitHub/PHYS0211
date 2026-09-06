import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://atelier-quantique.jmartin741572.chatgpt.site'),
  title: 'Mécanique quantique — PHYS0211-3',
  description:
    'Six laboratoires interactifs de mécanique quantique : puits infini, oscillateur harmonique, diffusion, double puits, rotateur rigide et atome d’hydrogène.',
  openGraph: {
    title: 'Mécanique quantique',
    description: 'Six laboratoires : du puits infini aux orbitales de l’hydrogène.',
    type: 'website',
    locale: 'fr_BE',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Mécanique quantique — puits infini et oscillateur harmonique',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mécanique quantique',
    description: 'Six laboratoires : du puits infini aux orbitales de l’hydrogène.',
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
