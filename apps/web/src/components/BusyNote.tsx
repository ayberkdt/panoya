import { Loader2 } from 'lucide-react';
import { useBusyStage } from '../app/delayedBusy';
import { useI18n, type MessageKey } from '../i18n';

/**
 * Progress feedback that appears only when waiting is noticeable (≥ 400 ms), explains more at
 * 3 s and 8 s and offers a way out at 10 s when `onCancel` is given.
 */
export function BusyNote({
  active,
  label,
  onCancel,
}: {
  active: boolean;
  label: string;
  onCancel?: () => void;
}) {
  const stage = useBusyStage(active);
  const { t } = useI18n();
  if (stage === 'idle' || stage === 'quiet') return null;
  const extra: MessageKey | null =
    stage === 'slow'
      ? 'busy.slow'
      : stage === 'verySlow' || stage === 'offerCancel'
        ? 'busy.verySlow'
        : null;
  return (
    <div className="busy-note" role="status" aria-live="polite">
      <Loader2 size={16} aria-hidden="true" className="spin" />
      <span>
        {label}
        {extra && <span className="muted"> {t(extra)}</span>}
      </span>
      {stage === 'offerCancel' && onCancel && (
        <button type="button" className="btn btn-ghost btn-small" onClick={onCancel}>
          {t('busy.cancel')}
        </button>
      )}
    </div>
  );
}
