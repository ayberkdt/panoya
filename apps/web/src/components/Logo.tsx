/**
 * Panoya mark: a single note sheet shaped like a "P", top-right corner folded. The counter of the
 * letter is one text line on the note. Brand colours are fixed (they do not follow the theme);
 * the same geometry lives in public/favicon.svg and scripts/render-icons.mjs.
 */
export const LOGO = {
  tile: '#0b6a5a',
  paper: '#fbfaf6',
  fold: '#f5c04a',
  letter:
    'M12 6.5h7.25l4.25 4.25v5.75a2.5 2.5 0 0 1-2.5 2.5h-6.5v3.5a2.5 2.5 0 0 1-5 0V9A2.5 2.5 0 0 1 12 6.5Zm4.5 4.75a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 0 0-3Z',
  corner: 'M19.25 6.5l4.25 4.25h-3.25a1 1 0 0 1-1-1Z',
} as const;

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill={LOGO.tile} />
      <path fill={LOGO.paper} fillRule="evenodd" d={LOGO.letter} />
      <path fill={LOGO.fold} d={LOGO.corner} />
    </svg>
  );
}
