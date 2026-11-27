import { Copy as CopyIcon, FolderInput, MoreHorizontal, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { pageToPlainText } from '@panoya/blocks';
import { sortByRank, type Block, type Placement } from '@panoya/domain';
import { useTrash } from '../../app/actions';
import { navigate } from '../../app/router';
import { useRunCommand, useServices, useStoreQuery } from '../../app/services';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { entityColor } from '../../app/colors';
import { CopyButton } from '../../components/Copy';
import { MenuButton } from '../../components/Menu';
import { SaveIndicator } from '../../components/SaveIndicator';
import { useI18n } from '../../i18n';
import { blockUiByType } from '../blocks/catalog';
import { MoveDialog, type MoveRequest } from '../sidebar/MoveDialog';
import { ImportDialog } from '../table/ImportDialog';
import { MANUAL_SOURCE, walletCurrency, walletTemplate } from '../table/templates';
import { AddBlockMenu } from './AddBlockMenu';
import { BlockFrame } from './BlockFrame';
import { BlockHost } from './BlockHost';
import { PageTitle } from './PageTitle';

export function PageView({ pageId }: { pageId: string }) {
  const { store, registry, workspace } = useServices();
  const index = useWorkspaceIndex();
  const run = useRunCommand();
  const trash = useTrash();
  const { t, locale } = useI18n();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [slashSource, setSlashSource] = useState<string | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  // Tables are created through the import dialog (empty or from CSV), not as an empty block.
  const [tablePlacement, setTablePlacement] = useState<Placement | null>(null);

  const { data: blocksData } = useStoreQuery(
    () => store.getBlocks(pageId),
    (change) => change.pageIds.has(pageId),
    [pageId],
  );
  const blocks = useMemo(() => sortByRank(blocksData ?? []), [blocksData]);
  const page = index.pages.get(pageId);
  const path = index.pathTo(pageId);

  const insert = useCallback(
    async (type: string, placement: Placement) => {
      const result = await run({
        type: 'createBlock',
        workspaceId: workspace.id,
        pageId,
        blockType: type,
        placement,
      });
      if (result?.mutation.primary) setFocusId(result.mutation.primary.id);
      return result;
    },
    [run, workspace.id, pageId],
  );

  const onPick = async (type: string) => {
    const source = slashSource ? blocks.find((b) => b.id === slashSource) : undefined;
    setSlashSource(null);
    if (type === 'table') {
      setTablePlacement(source ? { kind: 'after', id: source.id } : { kind: 'end' });
      return;
    }
    if (type === 'wallet') {
      // A wallet is a ready-made table: created at once, statistics included.
      const result = await run({
        type: 'createTableBlock',
        workspaceId: workspace.id,
        pageId,
        placement: source ? { kind: 'after', id: source.id } : { kind: 'end' },
        ...walletTemplate(t, walletCurrency(locale, workspace.baseCurrency)),
        source: MANUAL_SOURCE,
      });
      if (result?.mutation.primary) setFocusId(result.mutation.primary.id);
      return;
    }
    if (source) {
      // "/" in an empty text block: the chosen block takes its place.
      const created = await insert(type, { kind: 'after', id: source.id });
      if (created && registry.plainText(source).trim() === '') {
        await run({ type: 'trash', workspaceId: workspace.id, kind: 'block', id: source.id });
      }
      return;
    }
    await insert(type, { kind: 'end' });
  };

  const moveBy = async (block: Block, direction: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === block.id);
    const neighbour = blocks[i + direction];
    if (!neighbour) return;
    await run({
      type: 'move',
      workspaceId: workspace.id,
      kind: 'block',
      id: block.id,
      parentId: pageId,
      placement: { kind: direction < 0 ? 'before' : 'after', id: neighbour.id },
    });
  };

  if (!page || page.trashed === 1 || path.length === 0) {
    if (index.loading) return <div className="page-loading" aria-busy="true" />;
    return (
      <main className="page page-message" id="main">
        <h1>{t('page.notFound.title')}</h1>
        <p>{t('page.notFound.body')}</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate({ name: 'trash', workspaceId: workspace.id })}
        >
          {t('page.openTrash')}
        </button>
      </main>
    );
  }

  const title = page.title || t('tree.untitled');
  const blockLabel = (b: Block) => t(blockUiByType.get(b.type)?.label ?? 'block.unknown');

  return (
    <main className="page" id="main" aria-labelledby="page-title">
      <div className={`page-cover cover-${path[0] ? entityColor(path[0].id) : 'gray'}`}>
        <div className="page-toolbar">
          <nav className="breadcrumb" aria-label="breadcrumb">
            {path.slice(0, -1).map((item) => (
              <span key={item.id}>{item.name}</span>
            ))}
          </nav>
          <div className="page-actions">
            <SaveIndicator />
            <CopyButton
              getText={() => pageToPlainText(registry, page.title, blocks)}
              label={t('page.copyAll')}
              variant="icon"
              disabled={blocks.length === 0}
            />
            <MenuButton
              label={t('page.more')}
              items={[
                {
                  id: 'dup',
                  label: t('tree.duplicate'),
                  icon: <CopyIcon size={16} />,
                  onSelect: async () => {
                    const r = await run({
                      type: 'duplicatePage',
                      workspaceId: workspace.id,
                      id: pageId,
                      title: t('page.copySuffix', { title }),
                    });
                    if (r?.mutation.primary)
                      navigate({
                        name: 'page',
                        workspaceId: workspace.id,
                        pageId: r.mutation.primary.id,
                      });
                  },
                },
                {
                  id: 'move',
                  label: t('tree.move'),
                  icon: <FolderInput size={16} />,
                  onSelect: () => setMoveRequest({ kind: 'page', id: pageId, name: title }),
                },
                {
                  id: 'trash',
                  label: t('tree.trash'),
                  icon: <Trash2 size={16} />,
                  destructive: true,
                  onSelect: async () => {
                    if (await trash('page', pageId, title))
                      navigate({ name: 'home' }, { replace: true });
                  },
                },
              ]}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </MenuButton>
          </div>
        </div>

        <PageTitle
          color={path[0] ? entityColor(path[0].id) : undefined}
          key={page.id}
          page={page}
          autoFocus={blocks.length === 0 && page.title === ''}
          onEnter={() => {
            if (blocks.length === 0) void insert('richText', { kind: 'start' });
          }}
        />
      </div>

      {blocksData && blocks.length === 0 && <p className="muted page-empty">{t('page.empty')}</p>}

      <div className="blocks">
        {blocks.map((block, i) => (
          <BlockFrame
            key={block.id}
            blockId={block.id}
            index={i}
            count={blocks.length}
            label={blockLabel(block)}
            onMove={(d) => void moveBy(block, d)}
            onMoveToPage={() =>
              setMoveRequest({ kind: 'block', id: block.id, name: blockLabel(block) })
            }
            onDuplicate={() =>
              void run({ type: 'duplicateBlock', workspaceId: workspace.id, id: block.id })
            }
            onDelete={() => void trash('block', block.id, blockLabel(block))}
            onDropBlock={(dragged, position) =>
              void run({
                type: 'move',
                workspaceId: workspace.id,
                kind: 'block',
                id: dragged,
                parentId: pageId,
                placement: { kind: position, id: block.id },
              })
            }
          >
            <BlockHost
              block={block}
              autoFocus={block.id === focusId}
              onSlash={() => {
                setSlashSource(block.id);
                setPickerOpen(true);
              }}
              onNewBlock={() => void insert('richText', { kind: 'after', id: block.id })}
            />
          </BlockFrame>
        ))}
      </div>

      <AddBlockMenu
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setSlashSource(null);
        }}
        onPick={(type) => void onPick(type)}
      />
      <MoveDialog request={moveRequest} onClose={() => setMoveRequest(null)} />
      <ImportDialog
        open={tablePlacement !== null}
        pageId={pageId}
        placement={tablePlacement ?? { kind: 'end' }}
        onClose={() => setTablePlacement(null)}
        onCreated={(blockId) => {
          setTablePlacement(null);
          setFocusId(blockId);
        }}
      />
    </main>
  );
}
