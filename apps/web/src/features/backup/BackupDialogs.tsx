import { useRef, useState } from 'react';
import { exportBackup, inspectBackup, restoreBackup, type BackupPreview } from '@panoya/storage';
import { useServices } from '../../app/services';
import { switchWorkspace } from '../../app/workspaceSelection';
import { APP_VERSION } from '../../app/version';
import { BusyNote } from '../../components/BusyNote';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';

function downloadBytes(filename: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export: explicit action, private-data warning, nothing is uploaded (spec 17/20). */
export function ExportBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, errorText } = useI18n();
  const { store, registry, workspace, saveTracker } = useServices();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await saveTracker.flushAll();
      const { bytes, manifest } = await exportBackup(store.backend, registry, workspace.id, {
        appVersion: APP_VERSION,
      });
      const day = manifest.createdAt.slice(0, 10);
      downloadBytes(`panoya-yedek-${day}.zip`, bytes);
      const total = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
      toast.show({ message: t('backup.exported', { count: total }) });
      onClose();
    } catch (error) {
      toast.show({ message: errorText(error), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      title={t('backup.exportTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void run()}
          >
            {t('backup.download')}
          </button>
        </>
      }
    >
      <p>{t('backup.exportBody')}</p>
      <p className="hint-warn">{t('backup.privateWarning')}</p>
      <BusyNote active={busy} label={t('busy.exporting')} />
    </Dialog>
  );
}

/** Restore: validate and preview first; restoring always creates a new workspace (never overwrites). */
export function RestoreBackupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, errorText, formatDateTime } = useI18n();
  const { store, registry, saveTracker } = useServices();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ preview: BackupPreview; filename: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'inspect' | 'restore' | null>(null);
  // Inspection only reads the file, so it can be abandoned safely; restore cannot.
  const inspection = useRef(0);

  const close = () => {
    inspection.current++;
    setState(null);
    setError(null);
    setBusy(false);
    setPhase(null);
    onClose();
  };

  const choose = async (file: File) => {
    const run = ++inspection.current;
    setError(null);
    setState(null);
    setBusy(true);
    setPhase('inspect');
    try {
      const preview = await inspectBackup(new Uint8Array(await file.arrayBuffer()), registry);
      if (run === inspection.current) setState({ preview, filename: file.name });
    } catch (e) {
      if (run === inspection.current) setError(errorText(e));
    } finally {
      if (run === inspection.current) {
        setBusy(false);
        setPhase(null);
      }
    }
  };

  const cancelInspection = () => {
    inspection.current++;
    setBusy(false);
    setPhase(null);
  };

  const restore = async () => {
    if (!state) return;
    setBusy(true);
    setPhase('restore');
    try {
      await saveTracker.flushAll();
      const name = t('backup.restoredName', { name: state.preview.manifest.workspaceName });
      const result = await restoreBackup(store.backend, registry, state.preview, { name });
      toast.show({ message: t('backup.restored') });
      switchWorkspace(result.workspaceId);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
      setPhase(null);
    }
  };

  const c = state?.preview.counts;
  return (
    <Dialog
      open={open}
      title={t('backup.restoreTitle')}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!state || busy}
            onClick={() => void restore()}
          >
            {t('backup.restoreAction')}
          </button>
        </>
      }
    >
      <p>{t('backup.restoreBody')}</p>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label={t('backup.chooseFile')}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void choose(file);
        }}
      />
      <div className="field-row">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {t('backup.chooseFile')}
        </button>
        {state && <span className="muted small">{state.filename}</span>}
      </div>
      <BusyNote
        active={phase !== null}
        label={t(phase === 'restore' ? 'busy.restoring' : 'busy.inspecting')}
        {...(phase === 'inspect' ? { onCancel: cancelInspection } : {})}
      />
      {error && (
        <p className="hint-warn" role="alert">
          {error}
        </p>
      )}
      {state && c && (
        <div className="backup-preview" role="status">
          <p>
            <strong>{state.preview.manifest.workspaceName}</strong> ·{' '}
            {formatDateTime(state.preview.manifest.createdAt)}
          </p>
          <p className="muted small">
            {t('backup.counts', {
              folders: c.folder,
              notebooks: c.notebook,
              pages: c.page,
              blocks: c.block,
              tables: c.dataset,
            })}
          </p>
          <p className="muted small">{t('backup.verified')}</p>
          {state.preview.unknownBlockTypes.length > 0 && (
            <p className="hint-warn">
              {t('backup.unknownBlocks', { list: state.preview.unknownBlockTypes.join(', ') })}
            </p>
          )}
          {state.preview.danglingReferences > 0 && (
            <p className="hint-warn">
              {t('backup.dangling', { count: state.preview.danglingReferences })}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
