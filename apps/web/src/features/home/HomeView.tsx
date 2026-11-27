import { ArrowRight, FileText, Plus, Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { navigate } from '../../app/router';
import { useServices } from '../../app/services';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { useI18n } from '../../i18n';

interface Props {
  onCapture: () => void;
  onSearch: () => void;
  onLoadDemo: () => void;
}

/**
 * Home: one primary action (quick note), search, and the recently edited pages — the three
 * things people come back for (Pareto). Demo content is offered only while the workspace is empty.
 */
export function HomeView({ onCapture, onSearch, onLoadDemo }: Props) {
  const { t, locale } = useI18n();
  const { workspace } = useServices();
  const index = useWorkspaceIndex();
  const recent = [...index.pages.values()]
    .filter((p) => p.trashed === 0 && index.pathTo(p.id).length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const today = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  // Captured once per visit: "5 minutes ago" does not need to tick.
  const [now] = useState(() => Date.now());
  const hour = new Date(now).getHours();
  const greeting =
    hour >= 5 && hour < 12
      ? t('home.greeting.morning')
      : hour < 18 && hour >= 12
        ? t('home.greeting.day')
        : hour >= 18 && hour < 23
          ? t('home.greeting.evening')
          : t('home.greeting.night');
  const live = <T extends { trashed: 0 | 1 }>(m: Map<string, T>) =>
    [...m.values()].filter((x) => x.trashed === 0).length;
  const pageCount = live(index.pages);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const ago = (iso: string) => {
    const minutes = Math.round((Date.parse(iso) - now) / 60_000);
    if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
    return relative.format(Math.round(hours / 24), 'day');
  };

  return (
    <main className="page home" id="main" aria-labelledby="home-title">
      <p className="eyebrow">{today}</p>
      <h1 id="home-title" className="home-title">
        {greeting}
      </h1>
      <p className="muted home-sub">
        {pageCount === 0
          ? t('home.subtitleEmpty')
          : t('home.stats', {
              pages: pageCount,
              notebooks: live(index.notebooks),
              folders: live(index.folders),
            })}
      </p>

      <div className="home-actions">
        <button type="button" className="btn btn-primary" onClick={onCapture}>
          <Plus size={18} aria-hidden="true" />
          <span>{t('capture.open')}</span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSearch}>
          <Search size={18} aria-hidden="true" />
          <span>{t('nav.search')}</span>
          <kbd className="kbd">{t('palette.hint')}</kbd>
        </button>
      </div>

      <section className="home-section" aria-labelledby="home-recent">
        <h2 id="home-recent" className="eyebrow">
          {t('home.recent')}
        </h2>
        {recent.length === 0 ? (
          <div className="home-empty">
            <p className="muted">{t('home.empty')}</p>
            <button type="button" className="btn btn-ghost" onClick={onLoadDemo}>
              <Sparkles size={16} aria-hidden="true" />
              <span>{t('nav.loadDemo')}</span>
            </button>
          </div>
        ) : (
          <ul className="recent-list">
            {recent.map((page) => {
              const path = index
                .pathTo(page.id)
                .slice(0, -1)
                .map((i) => i.name)
                .join(' / ');
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    className="recent-card"
                    onClick={() =>
                      navigate({ name: 'page', workspaceId: workspace.id, pageId: page.id })
                    }
                  >
                    <span className="recent-icon" aria-hidden="true">
                      <FileText size={18} />
                    </span>
                    <span className="recent-text">
                      <span className="recent-title">{page.title || t('tree.untitled')}</span>
                      <span className="recent-meta">
                        <span className="recent-path">{path}</span>
                        <span className="recent-time">{ago(page.updatedAt)}</span>
                      </span>
                    </span>
                    <ArrowRight size={16} aria-hidden="true" className="recent-go" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
