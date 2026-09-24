import { memo, useMemo } from 'react';
import katex from 'katex';

type MathProps = {
  children: string;
  display?: boolean;
  className?: string;
};

function unwrapMathDelimiters(source: string) {
  const value = source.trim();

  if (value.startsWith('$$') && value.endsWith('$$')) {
    return value.slice(2, -2).trim();
  }

  if (value.startsWith('$') && value.endsWith('$')) {
    return value.slice(1, -1).trim();
  }

  return value;
}

export const Math = memo(function Math({
  children,
  display = false,
  className = '',
}: MathProps) {
  const html = useMemo(() => {
    let mathml = katex.renderToString(unwrapMathDelimiters(children), {
      displayMode: display,
      // Emit only the native version, for both block and inline formulas.
      // Keeping an HTML copy made display equations appear twice and retained
      // the low-zoom positioning bug in inline subscripts and fractions.
      output: 'mathml',
      // Pad the covered symbol so the native overline visibly extends on both sides.
      // Arguments outside \overbar (such as (p)) remain uncovered.
      macros: { '\\overbar': '\\overline{\\mkern1mu#1\\mkern1mu}' },
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
    // The native math font renders U+203E as a short, non-extending glyph.
    // Scale U+23AF to an intermediate length between the short accent and full rule.
    if (children.includes('\\overbar')) {
      mathml = mathml.replace(/<mo stretchy="true">‾<\/mo>/g, '<mo stretchy="false" mathsize="70%">⎯</mo>');
    }
    // MathML-only output omits KaTeX's display wrapper. Retain it explicitly
    // so the existing card, theory and responsive typography still applies.
    return display ? `<span class="katex-display">${mathml}</span>` : mathml;
  }, [children, display]);

  return (
    <span
      className={`math-formula${display ? ' math-display' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
