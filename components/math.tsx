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

export function Math({ children, display = false, className = '' }: MathProps) {
  const html = katex.renderToString(unwrapMathDelimiters(children), {
    displayMode: display,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  });

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
