import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerDownRight,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useServices } from '../../app/services';
import { useBlockSaveState } from '../../app/saveTracker';
import { MenuButton, type MenuItem } from '../../components/Menu';
import { useI18n } from '../../i18n';

interface Props {
  blockId: string;
  index: number;
  count: number;
  label: string;
  onMove: (direction: -1 | 1) => void;
  onMoveToPage: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDropBlock: (draggedId: string, position: 'before' | 'after') => void;
  extraItems?: MenuItem[];
  children: ReactNode;
}

const DRAG_TYPE = 'application/x-panoya-block';

/**
 * Chrome around one block: drag handle (pointer) with keyboard alternatives in the menu,
 * per-block error boundary-like recovery banner for conflicts and failed saves.
 */
export function BlockFrame(props: Props) {
  const {
    blockId,
    index,
    count,
    label,
    onMove,
    onMoveToPage,
    onDuplicate,
    onDelete,
    onDropBlock,
    extraItems = [],
    children,
  } = props;
  const { t } = useI18n();
  const { saveTracker } = useServices();
  const save = useBlockSaveState(saveTracker, blockId);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const items: MenuItem[] = [
    ...extraItems,
    {
      id: 'up',
      label: t('block.moveUp'),
      icon: <ArrowUp size={16} />,
      disabled: index === 0,
      onSelect: () => onMove(-1),
    },
    {
      id: 'down',
      label: t('block.moveDown'),
      icon: <ArrowDown size={16} />,
      disabled: index === count - 1,
      onSelect: () => onMove(1),
    },
    {
      id: 'page',
      label: t('block.moveToPage'),
      icon: <CornerDownRight size={16} />,
      onSelect: onMoveToPage,
    },
    { id: 'dup', label: t('block.duplicate'), icon: <Copy size={16} />, onSelect: onDuplicate },
    {
      id: 'del',
      label: t('block.delete'),
      icon: <Trash2 size={16} />,
      destructive: true,
      onSelect: onDelete,
    },
  ];

  return (
    <section
      className={`block-frame${dropPosition ? ` drop-${dropPosition}` : ''}`}
      aria-label={label}
      data-block-id={blockId}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        setDropPosition(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
      }}
      onDragLeave={() => setDropPosition(null)}
      onDrop={(e) => {
        const dragged = e.dataTransfer.getData(DRAG_TYPE);
        const position = dropPosition;
        setDropPosition(null);
        if (dragged && dragged !== blockId && position) {
          e.preventDefault();
          onDropBlock(dragged, position);
        }
      }}
    >
      <div
        className="block-handle"
        draggable
        title={t('block.dragHandle')}
        aria-hidden="true"
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, blockId);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <GripVertical size={16} />
      </div>
      <div className="block-content">
        {children}
        {save?.state === 'conflict' && (
          <div className="block-banner" role="alert">
            <span>{t('block.conflict')}</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={save.handlers.keepMine}
            >
              {t('block.conflict.keepMine')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={save.handlers.takeTheirs}
            >
              {t('block.conflict.takeTheirs')}
            </button>
          </div>
        )}
        {save?.state === 'error' && (
          <div className="block-banner" role="alert">
            <span>{t('block.saveError')}</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={save.handlers.retry}>
              {t('block.retry')}
            </button>
          </div>
        )}
      </div>
      <div className="block-menu">
        <MenuButton label={`${t('block.menu')}: ${label}`} items={items}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </MenuButton>
      </div>
    </section>
  );
}
