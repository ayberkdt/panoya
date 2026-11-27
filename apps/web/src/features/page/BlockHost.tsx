import { Component, type ReactNode } from 'react';
import type { Block } from '@panoya/domain';
import { useServices } from '../../app/services';
import { blockUiByType } from '../blocks/catalog';
import { UnknownBlockView } from '../blocks/SimpleBlocks';

interface Props {
  block: Block;
  autoFocus: boolean;
  onSlash: () => void;
  onNewBlock: () => void;
}

/** Resolves a stored block through the registry and renders its view (or a safe fallback). */
export function BlockHost({ block, autoFocus, onSlash, onNewBlock }: Props) {
  const { registry } = useServices();
  const resolved = registry.resolve(block);
  const ui = blockUiByType.get(block.type);
  if (resolved.status !== 'ok' || !ui) {
    return (
      <UnknownBlockView
        text={registry.plainText(block)}
        reason={resolved.status === 'invalid' ? 'invalid' : 'unknown'}
      />
    );
  }
  const View = ui.View;
  return (
    <BlockErrorBoundary
      fallback={<UnknownBlockView text={registry.plainText(block)} reason="invalid" />}
    >
      <View
        // Remount when the block identity changes so drafts never leak between blocks.
        key={block.id}
        block={block}
        payload={resolved.payload as never}
        autoFocus={autoFocus}
        onSlash={onSlash}
        onNewBlock={onNewBlock}
      />
    </BlockErrorBoundary>
  );
}

/** A crashing block must not take down the whole notebook (spec 05). */
class BlockErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
