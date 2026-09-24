import { Math as Formula } from '@/components/math';

/** The solvers use a fixed reference length, not the adjustable potential width. */
export function ReducedUnits({ momentum = false, potentialLength }: { momentum?: boolean; potentialLength?: number }) {
  return <div className="reduced-units">
    <p className="scale-note">Axes, paramètres et amplitudes sont sans dimension. {potentialLength !== undefined ? <>La figure utilise <Formula>$u=x/a$</Formula> et des fonctions normalisées en <Formula>$du$</Formula></> : momentum ? <><Formula>{String.raw`$\Psi$`}</Formula> désigne le paquet réduit</> : <><Formula>{String.raw`$\Psi$`}</Formula> et <Formula>{String.raw`$\Phi_n$`}</Formula> désignent les fonctions réduites</>} ; <Formula>$s$</Formula> est uniquement un gain graphique.</p>
    <details className="theory-notes">
      <summary>Définition des unités réduites</summary>
      <p>On choisit une longueur de référence fixe <Formula>$L$</Formula>, indépendante des réglages du potentiel. L’indice « phys » désigne une grandeur physique.</p>
      {potentialLength !== undefined ? <>
        <p>Le paramètre <Formula>$a$</Formula> du curseur est sans dimension ; <Formula>{String.raw`$a_{\mathrm{phys}}$`}</Formula> est la longueur physique correspondante :</p>
        <Formula display>{String.raw`$a=\frac{a_{\mathrm{phys}}}{L},\qquad L=\frac{a_{\mathrm{phys}}}{a}$`}</Formula>
        <p>Avec le réglage actuel, <Formula>{String.raw`$L=\frac{a_{\mathrm{phys}}}{${potentialLength}}$`}</Formula>. Changer <Formula>$a$</Formula> fait varier la longueur physique du potentiel à <Formula>$L$</Formula> fixé. Aucune valeur en mètres n’est imposée.</p>
      </> : null}
      <Formula display>{String.raw`$E_{\mathrm{ref}}=\frac{\hbar^2}{mL^2},\qquad t_0=\frac{mL^2}{\hbar}$`}</Formula>
      <Formula display>{String.raw`$x=\frac{x_{\mathrm{phys}}}{L},\quad t=\frac{t_{\mathrm{phys}}}{t_0},\quad E=\frac{E_{\mathrm{phys}}}{E_{\mathrm{ref}}},\quad V=\frac{V_{\mathrm{phys}}}{E_{\mathrm{ref}}}$`}</Formula>
      <Formula display>{String.raw`$\Psi(x,t)=\sqrt L\,\psi_{\mathrm{phys}}(Lx,t_0t)$`}</Formula>
      {!momentum ? <Formula display>{String.raw`$\Phi_n(x)=\sqrt L\,\phi_{n,\mathrm{phys}}(Lx)$`}</Formula> : null}
      <Formula display>{momentum ? String.raw`$\int|\Psi(x,t)|^2\,dx=1$` : String.raw`$\int|\Psi(x,t)|^2\,dx=\int|\Phi_n(x)|^2\,dx=1$`}</Formula>
      {potentialLength !== undefined ? <>
        <p>Pour la figure, on utilise le demi-écartement comme unité spatiale : les minima sont en <Formula>{String.raw`$u=\pm1$`}</Formula>. Les unités d’énergie et de temps restent inchangées.</p>
        <Formula display>{String.raw`$u=\frac{x}{a}=\frac{x_{\mathrm{phys}}}{a_{\mathrm{phys}}},\qquad V(au)=V_b(u^2-1)^2$`}</Formula>
        <Formula display>{String.raw`$\widetilde\Phi_n(u)=\sqrt a\,\Phi_n(au),\qquad\widetilde\Psi(u,t)=\sqrt a\,\Psi(au,t)$`}</Formula>
        <Formula display>{String.raw`$\int|\widetilde\Phi_n(u)|^2\,du=\int|\widetilde\Psi(u,t)|^2\,du=1$`}</Formula>
        <p>Dans cette coordonnée, le terme cinétique réduit devient <Formula>{String.raw`$-\frac{1}{2a^2}\partial_u^2$`}</Formula>.</p>
      </> : null}
      <p>Les longueurs, dont <Formula>$a$</Formula> et les largeurs du paquet, sont mesurées en unités de <Formula>$L$</Formula>. Les énergies et périodes affichées sont en unités de <Formula>{String.raw`$E_{\mathrm{ref}}$`}</Formula> et <Formula>$t_0$</Formula>. Ainsi, le Hamiltonien réduit contient le terme cinétique <Formula>{String.raw`$-\tfrac12\partial_x^2$`}</Formula>.</p>
      {momentum ? <>
        <Formula display>{String.raw`$p=\frac{L p_{\mathrm{phys}}}{\hbar},\quad k_0=L k_{0,\mathrm{phys}},\quad g=\frac{t_0^2}{L}g_{\mathrm{phys}}$`}</Formula>
        <Formula display>{String.raw`$\overbar{\Psi}(p,t)=\sqrt{\frac{\hbar}{L}}\,\overbar{\psi}_{\mathrm{phys}}\!\left(\frac{\hbar p}{L},t_0t\right)$`}</Formula>
        <Formula display>{String.raw`$\overbar{\Psi}(p,t)=\frac{1}{\sqrt{2\pi}}\int\Psi(x,t)e^{-ipx}\,dx,\qquad\int|\overbar{\Psi}(p,t)|^2\,dp=1$`}</Formula>
        <p>Pour la pesanteur, les mêmes définitions s’appliquent à <Formula>$z$</Formula> et <Formula>$p_z$</Formula>. Le nombre d’onde et l’impulsion réduits coïncident.</p>
      </> : null}
    </details>
  </div>;
}
