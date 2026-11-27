import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useServices } from '../app/services';
import { useAggregateSaveState } from '../app/saveTracker';
import { useI18n, type MessageKey } from '../i18n';

const labels: Record<string, MessageKey> = {
  idle: 'save.idle',
  saved: 'save.saved',
  editing: 'save.editing',
  saving: 'save.saving',
  error: 'save.error',
  conflict: 'save.conflict',
};

/** Honest save status: never shows "saved" while a draft is pending or failed. */
export function SaveIndicator() {
  const { saveTracker } = useServices();
  const state = useAggregateSaveState(saveTracker);
  const { t } = useI18n();
  const bad = state === 'error' || state === 'conflict';
  const busy = state === 'saving' || state === 'editing';
  return (
    <span className={`save-indicator${bad ? ' is-bad' : ''}`} role="status" aria-live="polite">
      {bad ? (
        <AlertTriangle size={14} aria-hidden="true" />
      ) : busy ? (
        <Loader2 size={14} aria-hidden="true" className="spin" />
      ) : (
        <Check size={14} aria-hidden="true" />
      )}
      <span>{t(labels[state] ?? 'save.idle')}</span>
    </span>
  );
}
