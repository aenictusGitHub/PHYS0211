import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://atelier-quantique.jmartin741572.chatgpt.site'),
  title: 'Mécanique quantique — PHYS0211-3',
  description:
    'Huit laboratoires interactifs de mécanique quantique : diffusion, puits infini, oscillateur harmonique, double puits, rotateur rigide, atome d’hydrogène, spin-1/2 et Stern–Gerlach.',
  openGraph: {
    title: 'Mécanique quantique',
    description: 'Huit laboratoires : de la diffusion de paquets à l’expérience de Stern–Gerlach.',
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
    description: 'Huit laboratoires : de la diffusion de paquets à l’expérience de Stern–Gerlach.',
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
