import { useId } from 'react';

export function QuantumMark() {
  const id = useId().replaceAll(':', '');
  return <svg viewBox="-10 0 94 64" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-left`} x1="7" y1="12" x2="31" y2="51" gradientUnits="userSpaceOnUse"><stop stopColor="#d8ece9" /><stop offset="1" stopColor="#85c9bd" /></linearGradient>
      <linearGradient id={`${id}-right`} x1="36" y1="13" x2="55" y2="47" gradientUnits="userSpaceOnUse"><stop stopColor="#f2dec8" /><stop offset="1" stopColor="#df9d7d" /></linearGradient>
    </defs>
    <path d="M-3 4V60M69 4L81 32L69 60" stroke="#182a45" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M30 32C23 4 3 13 8 31C12 48 24 51 30 32Z" fill={`url(#${id}-left)`} />
    <path d="M34 32C41 4 61 13 56 31C52 48 40 51 34 32Z" fill={`url(#${id}-right)`} />
    <path d="M7 46C20 37 23 27 32 27S45 37 57 20" stroke="#167b78" strokeOpacity=".38" strokeWidth="1" />
    <path d="M6 50C21 41 22 31 32 31S45 42 58 24" stroke="#167b78" strokeOpacity=".22" strokeWidth="1" />
    <path d="M13 18C13 34 19 42 32 42S51 34 51 18M32 8V56" stroke="#182a45" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M27 56H37" stroke="#182a45" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="32" cy="8" r="3" fill="#167b78" />
    <circle cx="51" cy="18" r="2.5" fill="#bb4a30" />
  </svg>;
}
