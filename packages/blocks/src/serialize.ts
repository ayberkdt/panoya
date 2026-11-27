import { sortByRank, type Block } from '@panoya/domain';
import type { BlockRegistry } from './registry';

/**
 * Whole-page serialization for "copy page" and Markdown export. Uses block rank order (never the
 * DOM) and separates blocks with a blank line. Empty blocks are skipped.
 */
export function pageToPlainText(
  registry: BlockRegistry,
  title: string,
  blocks: readonly Block[],
): string {
  const parts = sortByRank(blocks.filter((b) => b.trashed === 0))
    .map((b) => registry.plainText(b))
    .filter((text) => text.trim() !== '');
  return [title.trim(), ...parts].filter((s) => s !== '').join('\n\n');
}

export function pageToMarkdown(
  registry: BlockRegistry,
  title: string,
  blocks: readonly Block[],
): string {
  const parts = sortByRank(blocks.filter((b) => b.trashed === 0))
    .map((b) => registry.markdown(b))
    .filter((text) => text.trim() !== '');
  const heading = title.trim() ? `# ${title.trim()}` : '';
  return [heading, ...parts].filter((s) => s !== '').join('\n\n');
}
