# PHYS0211 — Mécanique quantique

Laboratoires interactifs pour le cours PHYS0211-3, année 2026–2027.

**[Ouvrir les laboratoires](https://aenictusgithub.github.io/PHYS0211/)**

1. Incertitude et transformée de Fourier
2. Diffusion paquets d’ondes
3. Puits infini
4. Oscillateur harmonique
5. Double puits
6. Rotateur rigide
7. Atome d’hydrogène
8. Spin-1/2
9. Stern–Gerlach

Exploration des états propres et de leur évolution, superpositions initiales,
perturbations, diffusion, effet tunnel et observables. Les formules sont rendues
avec KaTeX et les polices LaTeX sont embarquées dans le site.

Le laboratoire de Fourier affiche une paire gaussienne analytique normalisée
en position et en impulsion, avec réglages de largeur, translations et phase
quadratique. La largeur varie de 0.2 à 5 ; les centres se déplacent directement
sur les graphes (souris, toucher ou clavier), sans changer les dispersions.
Les axes restent fixes pendant le déplacement et s’étendent si les largeurs
extrêmes le nécessitent. Les écarts-types et le produit Δx Δp montrent la
borne de Heisenberg et l’effet d’une phase non uniforme (unités ℏ=1).

L’oscillateur affiche les moyennes de position et d’impulsion au cours du temps,
y compris avec la perturbation anharmonique. Le rotateur propose un champ
orientant optionnel, de potentiel `V(θ) = −λ B cos(θ)`, avec `B = ℏ²/(2I)` et
`0 ≤ λ ≤ 10`, pour les états propres et l’évolution des superpositions.
Son réglage « Résolution » ajuste le maillage 3D de 24 à 192 subdivisions
polaires (64 par défaut), sans modifier l’état, les probabilités ou le zoom.

Stern–Gerlach reprend le chapitre VII du cours : faisceau collimaté, gradient
magnétique, déviation et écran de détection. Le laboratoire compare la
prédiction classique isotrope aux `2j+1` canaux quantiques, avec un faisceau
non polarisé ou un spin 1/2 préparé et un axe de mesure orientable. Les centres
des faisceaux suivent le modèle paraxial à force constante ; les impacts sont
échantillonnés suivant la règle de Born. La structure hyperfine est négligée.

Le mode « En cascade » enchaîne trois analyseurs idéaux de spin 1/2, avec axes
réglables et sélection des sorties +, − ou des deux sorties pour A et B.
L’analyseur B peut être retiré. Les préréglages z–x–z, z–z–z, sans B et les
deux sorties de B permettent de comparer filtrage, mesure non sélective et
absence de mesure. Le schéma anime les canaux et les impacts, avec comptages
progressifs et probabilités rapportées au faisceau initial ou aux atomes
arrivant en C. Le routage entre appareils est idéal, sans rotation du spin ni
recombinaison cohérente ; le temps du schéma est en unités arbitraires.

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
