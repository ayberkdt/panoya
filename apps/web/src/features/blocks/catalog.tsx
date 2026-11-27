import {
  CheckSquare,
  ClipboardCopy,
  Code2,
  Heading2,
  Link2,
  Mail,
  Minus,
  Table,
  Type,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { BlockCategory } from '@panoya/blocks';
import type { OptionColor } from '@panoya/domain';
import type { MessageKey } from '../../i18n';
import { LinkBlock } from './LinkBlock';
import { MailDraftBlock } from './MailDraftBlock';
import { QuickCopyBlock } from './QuickCopyBlock';
import { RichTextBlock } from './RichText';
import { ChecklistBlock, CodeBlock, DividerBlock, HeadingBlock } from './SimpleBlocks';
import { TableBlock } from '../table/TableBlock';
import type { BlockViewProps } from './types';

export interface BlockUi {
  type: string;
  label: MessageKey;
  synonyms: MessageKey;
  category: BlockCategory;
  icon: LucideIcon;
  /** Colour of the type's icon tile (measured option-badge tokens, never the accent). */
  tint: OptionColor;
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
    tint: 'gray',
    View: RichTextBlock as never,
  },
  {
    type: 'heading',
    label: 'blockType.heading',
    synonyms: 'blockSynonyms.heading',
    category: 'text',
    icon: Heading2,
    tint: 'gray',
    View: HeadingBlock as never,
  },
  {
    type: 'code',
    label: 'blockType.code',
    synonyms: 'blockSynonyms.code',
    category: 'text',
    icon: Code2,
    tint: 'brown',
    View: CodeBlock as never,
  },
  {
    type: 'divider',
    label: 'blockType.divider',
    synonyms: 'blockSynonyms.divider',
    category: 'text',
    icon: Minus,
    tint: 'gray',
    View: DividerBlock as never,
  },
  {
    type: 'link',
    label: 'blockType.link',
    synonyms: 'blockSynonyms.link',
    category: 'productivity',
    icon: Link2,
    tint: 'blue',
    View: LinkBlock as never,
  },
  {
    type: 'quickCopy',
    label: 'blockType.quickCopy',
    synonyms: 'blockSynonyms.quickCopy',
    category: 'productivity',
    icon: ClipboardCopy,
    tint: 'yellow',
    View: QuickCopyBlock as never,
  },
  {
    type: 'mailDraft',
    label: 'blockType.mailDraft',
    synonyms: 'blockSynonyms.mailDraft',
    category: 'productivity',
    icon: Mail,
    tint: 'pink',
    View: MailDraftBlock as never,
  },
  {
    type: 'checklist',
    label: 'blockType.checklist',
    synonyms: 'blockSynonyms.checklist',
    category: 'productivity',
    icon: CheckSquare,
    tint: 'purple',
    View: ChecklistBlock as never,
  },
  {
    type: 'table',
    label: 'blockType.table',
    synonyms: 'blockSynonyms.table',
    category: 'data',
    icon: Table,
    tint: 'orange',
    View: TableBlock as never,
  },
];

/** Picker entries that create a ready-made block instead of a new type (no view of their own). */
export type PickerItem = Pick<
  BlockUi,
  'type' | 'label' | 'synonyms' | 'category' | 'icon' | 'tint'
>;

export const pickerShortcuts: PickerItem[] = [
  {
    type: 'wallet',
    label: 'blockType.wallet',
    synonyms: 'blockSynonyms.wallet',
    category: 'data',
    icon: Wallet,
    tint: 'green',
  },
];

export const pickerItems: PickerItem[] = [...blockUis, ...pickerShortcuts];

/** Icon tile colour for a block type (search results, recent pages). */
export const tintOf = (type: string): OptionColor =>
  pickerItems.find((b) => b.type === type)?.tint ?? 'gray';

export const blockUiByType = new Map(blockUis.map((b) => [b.type, b]));
