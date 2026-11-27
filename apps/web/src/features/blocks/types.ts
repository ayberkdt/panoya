import type { Block } from '@panoya/domain';

export interface BlockViewProps<P> {
  block: Block;
  payload: P;
  /** Start in editing mode with focus (newly created blocks). */
  autoFocus?: boolean;
  /** "/" typed in an empty text block: open the block-type menu. */
  onSlash?: () => void;
  /** Ctrl/Cmd+Enter: insert a new text block after this one. */
  onNewBlock?: () => void;
}
