import type { OptionColor } from '@panoya/domain';

/**
 * Coloured choice label. Colour is never the only cue: the label text is always shown
 * (WCAG 1.4.1); every colour pair is ≥ 5.8:1 in both themes (measured).
 */
export function OptionBadge({
  label,
  color,
  empty,
}: {
  label: string;
  color: OptionColor;
  empty?: boolean;
}) {
  return <span className={`opt-badge opt-${color}${empty ? ' opt-empty' : ''}`}>{label}</span>;
}
