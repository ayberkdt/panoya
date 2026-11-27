import { MoreHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import {
  buildMailto,
  findPlaceholders,
  looksLikeEmail,
  mailAllText,
  MAILTO_SAFE_LENGTH,
  type MailDraftPayload,
} from '@panoya/blocks';
import { CopyButton, useCopy } from '../../components/Copy';
import { MenuButton } from '../../components/Menu';
import { useI18n } from '../../i18n';
import { AutoTextarea } from './AutoTextarea';
import type { BlockViewProps } from './types';
import { useBlockDraft } from './useBlockDraft';

const parseRecipients = (raw: string) =>
  raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);

export function MailDraftBlock({ block, payload, autoFocus }: BlockViewProps<MailDraftPayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  const copy = useCopy();
  const value = draft.value;
  const [raw, setRaw] = useState({
    to: value.to.join(', '),
    cc: value.cc.join(', '),
    bcc: value.bcc.join(', '),
  });
  const [showCc, setShowCc] = useState(value.cc.length > 0 || value.bcc.length > 0);
  const ids = {
    to: useId(),
    cc: useId(),
    bcc: useId(),
    subject: useId(),
    body: useId(),
    warn: useId(),
  };

  const setRecipients = (field: 'to' | 'cc' | 'bcc', text: string) => {
    setRaw((r) => ({ ...r, [field]: text }));
    draft.set({ ...value, [field]: parseRecipients(text) });
  };
  const allRecipients = [...value.to, ...value.cc, ...value.bcc];
  const badRecipient = allRecipients.find((r) => !looksLikeEmail(r));
  const placeholders = findPlaceholders(`${value.subject}\n${value.body.text}`);
  const mailto = buildMailto(value);
  const labels = {
    to: t('mail.to'),
    cc: t('mail.cc'),
    bcc: t('mail.bcc'),
    subject: t('mail.subject'),
  };

  return (
    <div className="mail-draft">
      <input
        className="input input-quiet mail-title"
        aria-label={t('mail.title')}
        placeholder={t('mail.title')}
        value={value.title}
        onChange={(e) => draft.set({ ...value, title: e.target.value })}
      />
      <div className="form-grid">
        <label htmlFor={ids.to}>{t('mail.to')}</label>
        <div className="field-row">
          <input
            id={ids.to}
            className="input"
            inputMode="email"
            autoComplete="off"
            value={raw.to}
            aria-describedby={ids.warn}
            onChange={(e) => setRecipients('to', e.target.value)}
          />
          {!showCc && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setShowCc(true)}
            >
              {t('mail.showCcBcc')}
            </button>
          )}
        </div>
        {showCc && (
          <>
            <label htmlFor={ids.cc}>{t('mail.cc')}</label>
            <input
              id={ids.cc}
              className="input"
              inputMode="email"
              value={raw.cc}
              onChange={(e) => setRecipients('cc', e.target.value)}
            />
            <label htmlFor={ids.bcc}>{t('mail.bcc')}</label>
            <input
              id={ids.bcc}
              className="input"
              inputMode="email"
              value={raw.bcc}
              onChange={(e) => setRecipients('bcc', e.target.value)}
            />
          </>
        )}
        <label htmlFor={ids.subject}>{t('mail.subject')}</label>
        <div className="field-row">
          <input
            id={ids.subject}
            className="input"
            value={value.subject}
            autoFocus={autoFocus}
            onChange={(e) => draft.set({ ...value, subject: e.target.value })}
          />
          <CopyButton
            getText={() => draft.value.subject}
            label={t('mail.copySubject')}
            variant="icon"
            disabled={value.subject === ''}
          />
        </div>
        <label htmlFor={ids.body}>{t('mail.body')}</label>
        <AutoTextarea
          id={ids.body}
          className="input mail-body"
          rows={6}
          value={value.body.text}
          onChange={(text) => draft.set({ ...value, body: { format: 'plain', text } })}
          onBlur={() => void draft.flush()}
        />
      </div>
      <div id={ids.warn} className="hints">
        {badRecipient && (
          <p className="hint-warn">{t('mail.recipientWarning', { value: badRecipient })}</p>
        )}
        {placeholders.length > 0 && (
          <p className="hint-warn">{t('mail.placeholders', { list: placeholders.join(', ') })}</p>
        )}
      </div>
      <div className="block-actions-row">
        <CopyButton
          getText={() => draft.value.body.text}
          label={t('mail.copyBody')}
          variant="primary"
          disabled={value.body.text === ''}
        />
        <MenuButton
          label={t('mail.more')}
          items={[
            {
              id: 'all',
              label: t('mail.copyAll'),
              onSelect: () =>
                void copy({ plain: mailAllText(draft.value, labels), format: 'plain' }),
            },
            {
              id: 'to',
              label: t('mail.copyTo'),
              disabled: allRecipients.length === 0,
              onSelect: () => void copy({ plain: draft.value.to.join(', '), format: 'plain' }),
            },
            {
              id: 'mailto',
              label: t('mail.openClient'),
              disabledReason: t('mail.tooLongForMailto'),
              disabled: mailto.length > MAILTO_SAFE_LENGTH,
              // Explicit user action only; opens the local mail client, nothing is sent.
              onSelect: () => window.location.assign(mailto),
            },
          ]}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </MenuButton>
      </div>
    </div>
  );
}
