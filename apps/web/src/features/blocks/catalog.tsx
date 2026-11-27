import {
  CheckSquare,
  ClipboardCopy,
  Code2,
  Heading2,
  Link2,
  Mail,
  Minus,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { BlockCategory } from '@panoya/blocks';
import type { MessageKey } from '../../i18n';
import { LinkBlock } from './LinkBlock';
import { MailDraftBlock } from './MailDraftBlock';
import { QuickCopyBlock } from './QuickCopyBlock';
import { RichTextBlock } from './RichText';
import { ChecklistBlock, CodeBlock, DividerBlock, HeadingBlock } from './SimpleBlocks';
import type { BlockViewProps } from './types';

export interface BlockUi {
  type: string;
  label: MessageKey;
  synonyms: MessageKey;
  category: BlockCategory;
  icon: LucideIcon;
  // Each view validates its own payload type through the registry before rendering.
  View: ComponentType<BlockViewProps<never>>;
}

/**
 * UI adapters for registered block types. Adding a block = registry definition + one entry here;
 * no switch statements elsewhere (spec 05). Only implemented types appear in menus.
 */
export const blockUis: BlockUi[] = [
  {
    type: 'richText',
    label: 'blockType.richText',
    synonyms: 'blockSynonyms.richText',
    category: 'text',
    icon: Type,
    View: RichTextBlock as never,
  },
  {
    type: 'heading',
    label: 'blockType.heading',
    synonyms: 'blockSynonyms.heading',
    category: 'text',
    icon: Heading2,
    View: HeadingBlock as never,
  },
  {
    type: 'code',
    label: 'blockType.code',
    synonyms: 'blockSynonyms.code',
    category: 'text',
    icon: Code2,
    View: CodeBlock as never,
  },
  {
    type: 'divider',
    label: 'blockType.divider',
    synonyms: 'blockSynonyms.divider',
    category: 'text',
    icon: Minus,
    View: DividerBlock as never,
  },
  {
    type: 'link',
    label: 'blockType.link',
    synonyms: 'blockSynonyms.link',
    category: 'productivity',
    icon: Link2,
    View: LinkBlock as never,
  },
  {
    type: 'quickCopy',
    label: 'blockType.quickCopy',
    synonyms: 'blockSynonyms.quickCopy',
    category: 'productivity',
    icon: ClipboardCopy,
    View: QuickCopyBlock as never,
  },
  {
    type: 'mailDraft',
    label: 'blockType.mailDraft',
    synonyms: 'blockSynonyms.mailDraft',
    category: 'productivity',
    icon: Mail,
    View: MailDraftBlock as never,
  },
  {
    type: 'checklist',
    label: 'blockType.checklist',
    synonyms: 'blockSynonyms.checklist',
    category: 'productivity',
    icon: CheckSquare,
    View: ChecklistBlock as never,
  },
];

export const blockUiByType = new Map(blockUis.map((b) => [b.type, b]));
