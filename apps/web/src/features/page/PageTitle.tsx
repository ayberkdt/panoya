import { useState } from 'react';
import type { Page } from '@panoya/domain';
import { useRunCommand, useServices } from '../../app/services';
import { useI18n } from '../../i18n';

/**
 * Page title: edited locally, committed as one undoable `rename` on blur/Enter (not per keystroke).
 */
export function PageTitle({
  page,
  autoFocus,
  onEnter,
}: {
  page: Page;
  autoFocus: boolean;
  onEnter: () => void;
}) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  // null = not editing: show the stored title (which also picks up undo/other-tab renames).
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? page.title;

  const commit = async () => {
    if (draft === null) return;
    const next = draft.trim();
    const result =
      next === page.title
        ? true
        : await run({
            type: 'rename',
            workspaceId: workspace.id,
            kind: 'page',
            id: page.id,
            name: next,
          });
    if (result) setDraft(null);
  };

  return (
    <h1 className="page-title-wrap">
      <input
        id="page-title"
        className="page-title"
        aria-label={t('page.titlePlaceholder')}
        placeholder={t('page.titlePlaceholder')}
        value={value}
        maxLength={200}
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void commit();
            onEnter();
          }
        }}
      />
    </h1>
  );
}
