import { Menu, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { useToast } from '../components/Toasts';
import { QuickCapture } from '../features/capture/QuickCapture';
import { ensureInboxPage } from '../features/capture/inbox';
import { createDemo } from '../features/demo/demo';
import { prefetchRichTextEditor } from '../features/blocks/RichText';
import { PageView } from '../features/page/PageView';
import { CommandPalette } from '../features/palette/CommandPalette';
import { Sidebar } from '../features/sidebar/Sidebar';
import { TrashView } from '../features/trash/TrashView';
import { useI18n, type UiLocale } from '../i18n';
import { useHistoryActions } from './actions';
import { lastPage, navigate, useRoute } from './router';
import { useServices } from './services';
import { useWorkspaceIndex } from './workspaceData';

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function App({ onLocaleChange }: { onLocaleChange: (locale: UiLocale) => void }) {
  const route = useRoute();
  const { store, workspace, saveTracker } = useServices();
  const index = useWorkspaceIndex();
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const { undo, redo } = useHistoryActions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  const activePageId = route.name === 'page' ? route.pageId : null;

  useEffect(() => prefetchRichTextEditor(), []);

  // Deep links from another workspace id are not valid here; fall back to home.
  useEffect(() => {
    if (route.name !== 'home' && route.workspaceId !== workspace.id)
      navigate({ name: 'home' }, { replace: true });
  }, [route, workspace.id]);

  // Home: reopen the last page on this device when it still exists.
  useEffect(() => {
    if (route.name !== 'home' || index.loading) return;
    const last = lastPage.get(workspace.id);
    if (last && index.pages.get(last)?.trashed === 0 && index.pathTo(last).length > 0) {
      navigate({ name: 'page', workspaceId: workspace.id, pageId: last }, { replace: true });
    }
  }, [route.name, index, workspace.id]);

  useEffect(() => {
    if (activePageId) lastPage.set(workspace.id, activePageId);
  }, [activePageId, workspace.id]);

  // Save drafts before the page is hidden; warn on close while something is unsaved.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saveTracker.flushAll();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void saveTracker.flushAll();
      if (saveTracker.hasUnsaved()) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [saveTracker]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setCaptureOpen(true);
      } else if (mod && e.key.toLowerCase() === 'z' && !isEditable(e.target)) {
        // Inside editors the editor's own undo applies (uncommitted typing).
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
      } else if (mod && e.key.toLowerCase() === 'y' && !isEditable(e.target)) {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const openInbox = useCallback(async () => {
    try {
      const pageId = await ensureInboxPage(store, workspace, {
        notebook: t('capture.inboxNotebook'),
        page: t('capture.inboxPage'),
      });
      navigate({ name: 'page', workspaceId: workspace.id, pageId });
      setDrawerOpen(false);
    } catch (error) {
      toast.show({ message: errorText(error), tone: 'error' });
    }
  }, [store, workspace, t, toast, errorText]);

  const loadDemo = async () => {
    try {
      const pageId = await createDemo(store, workspace);
      toast.show({ message: t('demo.added') });
      setDrawerOpen(false);
      navigate({ name: 'page', workspaceId: workspace.id, pageId });
    } catch (error) {
      toast.show({ message: errorText(error), tone: 'error' });
    }
  };

  const pageTitle = activePageId
    ? index.pages.get(activePageId)?.title || t('tree.untitled')
    : route.name === 'trash'
      ? t('trash.title')
      : t('app.name');

  return (
    <div className={`shell${drawerOpen ? ' drawer-open' : ''}`}>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <header className="mobile-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label={drawerOpen ? t('nav.closeMenu') : t('nav.openMenu')}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <span className="mobile-title">{pageTitle}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('nav.search')}
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      <aside className="sidebar-wrap">
        <Sidebar
          activePageId={activePageId}
          trashActive={route.name === 'trash'}
          onSearch={() => setPaletteOpen(true)}
          onCapture={() => setCaptureOpen(true)}
          onOpenInbox={() => void openInbox()}
          onLoadDemo={() => setDemoOpen(true)}
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="content">
        {route.name === 'page' && route.workspaceId === workspace.id ? (
          <PageView key={route.pageId} pageId={route.pageId} />
        ) : route.name === 'trash' ? (
          <TrashView />
        ) : (
          <main className="page page-message" id="main">
            <h1>{t('page.welcome.title')}</h1>
            <p>{t('page.welcome.body')}</p>
          </main>
        )}
      </div>

      <div className="mobile-dock">
        <button type="button" className="btn btn-primary" onClick={() => setCaptureOpen(true)}>
          <Plus size={18} aria-hidden="true" />
          <span>{t('capture.open')}</span>
        </button>
      </div>

      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={{
          capture: () => setCaptureOpen(true),
          inbox: () => void openInbox(),
          demo: () => setDemoOpen(true),
          toggleLanguage: () => onLocaleChange(locale === 'tr-TR' ? 'en-US' : 'tr-TR'),
          languageLabel: locale === 'tr-TR' ? 'Switch to English' : 'Türkçeye geç',
        }}
      />
      <ConfirmDialog
        open={demoOpen}
        title={t('nav.loadDemo')}
        message={t('demo.confirm')}
        confirmLabel={t('nav.loadDemo')}
        onClose={() => setDemoOpen(false)}
        onConfirm={() => void loadDemo()}
      />
    </div>
  );
}
