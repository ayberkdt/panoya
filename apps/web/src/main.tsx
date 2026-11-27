// Must stay the first import: configures Zod before any schema is built (CSP, see the module).
import '@panoya/domain/jitless';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createDefaultRegistry } from '@panoya/blocks';
import { DexieBackend, WorkspaceStore } from '@panoya/storage';
import { App } from './app/App';
import { SaveTracker } from './app/saveTracker';
import { SearchService } from './app/search';
import { selectedWorkspaceId } from './app/workspaceSelection';
import { ServicesProvider, type Services } from './app/services';
import { WorkspaceDataProvider } from './app/workspaceData';
import { CopyProvider } from './components/Copy';
import { ToastProvider } from './components/Toasts';
import { I18nProvider, createI18n, type UiLocale } from './i18n';
import './styles/tokens.css';
import './styles/prosemirror.css';
import './styles/app.css';

const LOCALE_KEY = 'panoya:locale';

function initialLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === 'tr-TR' || stored === 'en-US') return stored;
  } catch {
    // ignore
  }
  return 'tr-TR'; // spec: Turkish by default, English optional
}

type BootState =
  | { status: 'loading' }
  | { status: 'blocked' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; services: Services };

async function boot(onBlocked: () => void): Promise<Services> {
  const registry = createDefaultRegistry();
  const backend = new DexieBackend({ name: 'panoya-local' });
  backend.db.on('blocked', onBlocked);
  // Another tab upgraded the schema: this tab's connection closes; reload to pick up new code.
  backend.db.on('versionchange', () => {
    backend.db.close();
    window.location.reload();
  });
  await backend.open();
  const store = new WorkspaceStore(backend, registry);
  const locale = initialLocale();
  const selected = selectedWorkspaceId();
  const chosen = selected
    ? (await store.listWorkspaces()).find((w) => w.id === selected)
    : undefined;
  const workspace =
    chosen ??
    (await store.ensureWorkspace({
      name: createI18n(locale).t('nav.workspace'),
      locale,
      baseCurrency: 'EUR',
    }));
  return {
    store,
    registry,
    workspace,
    saveTracker: new SaveTracker(),
    search: new SearchService(store, registry, workspace.id),
  };
}

function Root() {
  const [locale, setLocale] = useState<UiLocale>(initialLocale);
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const { t } = createI18n(locale);

  const start = useCallback(() => {
    setState({ status: 'loading' });
    boot(() => setState({ status: 'blocked' })).then(
      (services) => setState({ status: 'ready', services }),
      (error: unknown) => setState({ status: 'error', error }),
    );
  }, []);

  // StrictMode runs effects twice in development; open the database only once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  useEffect(() => {
    document.documentElement.lang = locale.slice(0, 2);
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // ignore
    }
  }, [locale]);

  let body;
  if (state.status === 'ready') {
    body = (
      <ServicesProvider value={state.services}>
        <WorkspaceDataProvider>
          <App onLocaleChange={setLocale} />
        </WorkspaceDataProvider>
      </ServicesProvider>
    );
  } else if (state.status === 'loading') {
    body = (
      <div className="boot" aria-busy="true">
        <p>{t('app.loading')}</p>
      </div>
    );
  } else {
    body = (
      <div className="boot" role="alert">
        <h1>{t('app.storageError.title')}</h1>
        <p>{state.status === 'blocked' ? t('app.blocked') : t('app.storageError.body')}</p>
        <button type="button" className="btn btn-primary" onClick={start}>
          {t('app.storageError.retry')}
        </button>
      </div>
    );
  }

  return (
    <I18nProvider locale={locale}>
      <ToastProvider>
        <CopyProvider>{body}</CopyProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
