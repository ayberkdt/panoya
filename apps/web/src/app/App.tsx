import { BookOpen, Inbox, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { LogoMark } from '../components/Logo';
import { useToast } from '../components/Toasts';
import { QuickCapture } from '../features/capture/QuickCapture';
import { ensureInboxPage } from '../features/capture/inbox';
import { createDemo } from '../features/demo/demo';
import { prefetchRichTextEditor } from '../features/blocks/RichText';
import { HomeView } from '../features/home/HomeView';
import { PageView } from '../features/page/PageView';
import { CommandPalette } from '../features/palette/CommandPalette';
import { Sidebar } from '../features/sidebar/Sidebar';
import { TrashView } from '../features/trash/TrashView';
import { useI18n, type UiLocale } from '../i18n';
import { useHistoryActions } from './actions';
import { lastPage, navigate, useRoute } from './router';
import { useScrollLock } from './scrollLock';
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
  useScrollLock(drawerOpen);

  useEffect(() => prefetchRichTextEditor(), []);
  const { search } = useServices();
  useEffect(() => {
    search.start();
    return () => search.stop();
  }, [search]);

  // Deep links from another workspace id are not valid here; fall back to home.
  useEffect(() => {
    if (route.name !== 'home' && route.workspaceId !== workspace.id)
      navigate({ name: 'home' }, { replace: true });
  }, [route, workspace.id]);

  // App start: reopen the last page on this device when it still exists. Only once, so the
  // home screen stays reachable afterwards (logo, "Ana sayfa").
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || index.loading) return;
    restored.current = true;
    if (route.name !== 'home') return;
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
          className="icon-btn mobile-home"
          aria-label={t('nav.home')}
          onClick={() => navigate({ name: 'home' })}
        >
          <LogoMark size={28} />
        </button>
        <span className="mobile-title">{pageTitle}</span>
        <span className="mobile-bar-spacer" aria-hidden="true" />
      </header>

      <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      <aside className="sidebar-wrap">
        <Sidebar
          activePageId={activePageId}
          trashActive={route.name === 'trash'}
          homeActive={route.name === 'home'}
          onSearch={() => setPaletteOpen(true)}
          onCapture={() => setCaptureOpen(true)}
          onOpenInbox={() => void openInbox()}
          onLoadDemo={() => setDemoOpen(true)}
          onNavigate={() => setDrawerOpen(false)}
          onClose={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="content">
        {route.name === 'page' && route.workspaceId === workspace.id ? (
          <PageView key={route.pageId} pageId={route.pageId} />
        ) : route.name === 'trash' ? (
          <TrashView />
        ) : (
          <HomeView
            onCapture={() => setCaptureOpen(true)}
            onSearch={() => setPaletteOpen(true)}
            onLoadDemo={() => setDemoOpen(true)}
          />
        )}
      </div>

      <nav className="bottom-nav" aria-label={t('nav.mobile')}>
        <button
          type="button"
          className={`bottom-nav-item${drawerOpen ? ' is-active' : ''}`}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          <BookOpen size={20} aria-hidden="true" />
          <span>{t('nav.pages')}</span>
        </button>
        <button type="button" className="bottom-nav-item" onClick={() => setPaletteOpen(true)}>
          <Search size={20} aria-hidden="true" />
          <span>{t('nav.search')}</span>
        </button>
        <button type="button" className="bottom-nav-item" onClick={() => setCaptureOpen(true)}>
          <span className="bottom-nav-primary" aria-hidden="true">
            <Plus size={22} />
          </span>
          <span>{t('capture.open')}</span>
        </button>
        <button type="button" className="bottom-nav-item" onClick={() => void openInbox()}>
          <Inbox size={20} aria-hidden="true" />
          <span>{t('nav.inbox')}</span>
        </button>
      </nav>

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
