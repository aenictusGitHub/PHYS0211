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
    const mathml = katex.renderToString(unwrapMathDelimiters(children), {
      displayMode: display,
      // Emit only the native version, for both block and inline formulas.
      // Keeping an HTML copy made display equations appear twice and retained
      // the low-zoom positioning bug in inline subscripts and fractions.
      output: 'mathml',
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    }).replaceAll('<mo>^</mo>', '<mo class="math-hat" stretchy="false">^</mo>');
    // KaTeX leaves ordinary hats stretchy in MathML. Limit only these accents;
    // explicit \widehat output already carries stretchy="true" and is untouched.
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
