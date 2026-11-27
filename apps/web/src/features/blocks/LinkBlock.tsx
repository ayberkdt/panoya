import { ExternalLink, Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import { checkUrl, linkDisplayTitle, type LinkPayload, type UrlProblem } from '@panoya/blocks';
import { CopyButton } from '../../components/Copy';
import { useI18n, type MessageKey } from '../../i18n';
import type { BlockViewProps } from './types';
import { useBlockDraft } from './useBlockDraft';

const problemKey: Record<UrlProblem, MessageKey> = {
  empty: 'link.problem.empty',
  malformed: 'link.problem.malformed',
  scheme: 'link.problem.scheme',
  credentials: 'link.problem.credentials',
  tooLong: 'link.problem.tooLong',
};

export function LinkBlock({ block, payload, autoFocus }: BlockViewProps<LinkPayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  const value = draft.value;
  const [editing, setEditing] = useState(Boolean(autoFocus) || value.url === '');
  const [urlInput, setUrlInput] = useState(value.url);
  const [tagsInput, setTagsInput] = useState(value.tags.join(', '));
  const ids = {
    title: useId(),
    url: useId(),
    desc: useId(),
    cat: useId(),
    tags: useId(),
    err: useId(),
  };

  const check = checkUrl(value.url);
  const inputCheck = urlInput.trim() === '' ? null : checkUrl(urlInput);
  const title = linkDisplayTitle(value);

  if (!editing && check.ok) {
    return (
      <div className="link-block">
        <div className="link-main">
          <a
            className="link-title"
            href={check.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${title} — ${t('link.open', { host: check.host })}`}
          >
            <span>{title}</span>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <div className="link-meta">
            <span className="link-host">{check.host}</span>
            {value.category && <span>· {value.category}</span>}
            {value.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
          {value.description && <p className="link-desc">{value.description}</p>}
        </div>
        <div className="block-actions">
          <CopyButton getText={() => draft.value.url} label={t('link.copyUrl')} variant="icon" />
          <button
            type="button"
            className="icon-btn"
            aria-label={t('link.edit')}
            title={t('link.edit')}
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const onUrl = (raw: string) => {
    setUrlInput(raw);
    if (raw.trim() === '') {
      draft.set({ ...value, url: '' });
      return;
    }
    const c = checkUrl(raw);
    // Unsafe or malformed URLs are never stored; the field shows why.
    if (c.ok) draft.set({ ...value, url: c.href });
  };

  return (
    <div className="link-edit form-grid">
      <label htmlFor={ids.url}>{t('link.url')}</label>
      <input
        id={ids.url}
        className="input"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={urlInput}
        autoFocus={autoFocus}
        placeholder="https://"
        aria-invalid={inputCheck !== null && !inputCheck.ok}
        aria-describedby={ids.err}
        onChange={(e) => onUrl(e.target.value)}
      />
      <p id={ids.err} className="field-error" role="alert">
        {inputCheck && !inputCheck.ok ? t(problemKey[inputCheck.problem]) : ''}
      </p>
      <label htmlFor={ids.title}>{t('link.title')}</label>
      <input
        id={ids.title}
        className="input"
        value={value.title}
        placeholder={check.ok ? check.host : ''}
        onChange={(e) => draft.set({ ...value, title: e.target.value })}
      />
      <label htmlFor={ids.cat}>{t('link.category')}</label>
      <input
        id={ids.cat}
        className="input"
        value={value.category}
        onChange={(e) => draft.set({ ...value, category: e.target.value })}
      />
      <label htmlFor={ids.desc}>{t('link.description')}</label>
      <textarea
        id={ids.desc}
        className="input"
        rows={2}
        value={value.description}
        onChange={(e) => draft.set({ ...value, description: e.target.value })}
      />
      <label htmlFor={ids.tags}>{t('link.tags')}</label>
      <input
        id={ids.tags}
        className="input"
        value={tagsInput}
        onChange={(e) => {
          setTagsInput(e.target.value);
          const tags = [
            ...new Set(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            ),
          ].slice(0, 30);
          draft.set({ ...value, tags });
        }}
      />
      <div className="form-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!check.ok}
          onClick={() => {
            void draft.flush();
            setEditing(false);
          }}
        >
          {t('link.done')}
        </button>
      </div>
    </div>
  );
}
