import { useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { useServices } from '../../app/services';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';
import { captureToBlock, ensureInboxPage } from './inbox';

/** One field, one primary action. Saved locally before the confirmation is shown. */
export function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, errorText } = useI18n();
  const { store, workspace } = useServices();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const pageId = await ensureInboxPage(store, workspace, {
        notebook: t('capture.inboxNotebook'),
        page: t('capture.inboxPage'),
      });
      const block = captureToBlock(text);
      await store.execute({
        type: 'createBlock',
        workspaceId: workspace.id,
        pageId,
        blockType: block.type,
        payload: block.payload,
        placement: { kind: 'start' },
      });
      setText('');
      onClose();
      toast.show({
        message: t('capture.saved'),
        action: {
          label: t('nav.inbox'),
          run: () => navigate({ name: 'page', workspaceId: workspace.id, pageId }),
        },
      });
    } catch (error) {
      // The text stays in the field so nothing is lost.
      toast.show({ message: errorText(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={t('capture.title')}
      onClose={onClose}
      initialFocus={fieldRef}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('capture.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!text.trim() || busy}
            onClick={() => void save()}
          >
            {t('capture.save')}
          </button>
        </>
      }
    >
      <textarea
        ref={fieldRef}
        className="input capture-field"
        rows={5}
        aria-label={t('capture.placeholder')}
        placeholder={t('capture.placeholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
        }}
      />
    </Dialog>
  );
}
