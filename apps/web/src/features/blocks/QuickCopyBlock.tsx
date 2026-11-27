import { useId } from 'react';
import type { QuickCopyPayload } from '@panoya/blocks';
import { CopyButton } from '../../components/Copy';
import { useI18n } from '../../i18n';
import { AutoTextarea } from './AutoTextarea';
import type { BlockViewProps } from './types';
import { useBlockDraft } from './useBlockDraft';

export function QuickCopyBlock({ block, payload, autoFocus }: BlockViewProps<QuickCopyPayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  const textId = useId();
  const value = draft.value;
  return (
    <div className="copy-card">
      <input
        className="input input-quiet copy-card-title"
        aria-label={t('quickCopy.title')}
        placeholder={t('quickCopy.title')}
        value={value.title}
        onChange={(e) => draft.set({ ...value, title: e.target.value })}
      />
      <label htmlFor={textId} className="sr-only">
        {t('quickCopy.text')}
      </label>
      <AutoTextarea
        id={textId}
        className="input copy-card-text"
        value={value.text}
        autoFocus={autoFocus}
        placeholder={t('quickCopy.text')}
        onChange={(text) => draft.set({ ...value, text })}
        onBlur={() => void draft.flush()}
      />
      <div className="block-actions-row">
        <CopyButton
          getText={() => draft.value.text}
          label={t('quickCopy.copy')}
          variant="primary"
          disabled={value.text === ''}
        />
      </div>
    </div>
  );
}
