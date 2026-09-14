# PHYS0211 — Mécanique quantique

Laboratoires interactifs pour le cours PHYS0211-3, année 2026–2027.

**[Ouvrir les laboratoires](https://aenictusgithub.github.io/PHYS0211/)**

1. Fonctions d’ondes en $x$ et $p$
2. Diffusion paquets d’ondes
3. Puits infini
4. Oscillateur harmonique
5. Double puits
6. Rotateur rigide
7. Atome d’hydrogène
8. Spin-1/2
9. Stern–Gerlach

Exploration des états propres et de leur évolution, superpositions initiales,
perturbations, diffusion, effet tunnel et observables.

## Développement local

Avec Node.js 24 et pnpm 11.19.0 :

```sh
pnpm install --frozen-lockfile
pnpm dev --port 3000
```

Ouvrir ensuite <http://localhost:3000/>. Le développement local utilise Vinext.

## GitHub Pages

```sh
pnpm test
pnpm build:pages
```

La version statique se trouve dans `dist/pages/`. Elle réutilise les mêmes
composants et calculs que la version locale, sans serveur applicatif. Les
simulations s’exécutent dans le navigateur ; la diffusion utilise un Web Worker.

Le workflow GitHub Pages vérifie les calculs, les contrôles et les types, puis
publie automatiquement le site à chaque mise à jour de `main`. Seul le contenu
statique de `dist/pages/` est déployé. Le préfixe `/PHYS0211/` est configuré dans
`vite.pages.config.ts`.

La commande `pnpm build` et la configuration Sites existantes sont conservées
pour l’autre mode de construction ; elles ne sont pas utilisées par GitHub Pages.

## Auteur

John Martin — Université de Liège.

Les licences des polices incluses sont conservées dans `public/fonts/`.
