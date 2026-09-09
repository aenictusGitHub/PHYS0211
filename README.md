# PHYS0211 — Mécanique quantique

Laboratoires interactifs pour le cours PHYS0211-3, année 2026–2027.

**[Ouvrir les laboratoires](https://aenictusgithub.github.io/PHYS0211/)**

1. Diffusion paquets d’ondes
2. Puits infini
3. Oscillateur harmonique
4. Double puits
5. Rotateur rigide
6. Atome d’hydrogène
7. Spin-1/2

Exploration des états propres et de leur évolution, superpositions initiales,
perturbations, diffusion, effet tunnel et observables. Les formules sont rendues
avec KaTeX et les polices LaTeX sont embarquées dans le site.

L’oscillateur affiche les moyennes de position et d’impulsion au cours du temps,
y compris avec la perturbation anharmonique. Le rotateur propose un champ
orientant optionnel, de potentiel `V(θ) = −λ B cos(θ)`, avec `B = ℏ²/(2I)` et
`0 ≤ λ ≤ 10`, pour les états propres et l’évolution des superpositions.
Son réglage « Résolution » ajuste le maillage 3D de 24 à 96 subdivisions
polaires (64 par défaut), sans modifier l’état, les probabilités ou le zoom.

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
