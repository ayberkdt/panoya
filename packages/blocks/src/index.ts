import { codeBlock, checklistBlock, dividerBlock, headingBlock } from './definitions/basic';
import { linkBlock, mailDraftBlock, quickCopyBlock } from './definitions/productivity';
import { richTextBlock } from './definitions/richText';
import { BlockRegistry } from './registry';

export * from './registry';
export * from './urls';
export * from './definitions/basic';
export * from './definitions/productivity';
export * from './definitions/richText';
export * from './serialize';

/** Registry with every block type implemented in this release. */
export function createDefaultRegistry(): BlockRegistry {
  return new BlockRegistry()
    .register(richTextBlock)
    .register(headingBlock)
    .register(dividerBlock)
    .register(linkBlock)
    .register(quickCopyBlock)
    .register(mailDraftBlock)
    .register(checklistBlock)
    .register(codeBlock);
}
