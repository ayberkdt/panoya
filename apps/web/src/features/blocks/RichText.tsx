import { Fragment, lazy, Suspense, useState, type ReactNode } from 'react';
import {
  checkUrl,
  type RichTextMark,
  type RichTextNode,
  type RichTextPayload,
} from '@panoya/blocks';
import { useI18n } from '../../i18n';
import type { BlockViewProps } from './types';
import { useBlockDraft } from './useBlockDraft';

/** Safe static renderer: JSON → React elements (no HTML strings, no unknown nodes). */
export function RichTextView({ doc }: { doc: RichTextNode }) {
  return <>{(doc.content ?? []).map((node, i) => renderNode(node, i))}</>;
}

function renderMarks(text: string, marks: RichTextMark[] | undefined, key: number): ReactNode {
  let out: ReactNode = text;
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'link') {
      const check =
        typeof mark.attrs?.href === 'string'
          ? checkUrl(mark.attrs.href, { allowMailto: true })
          : null;
      out = check?.ok ? (
        <a href={check.href} target="_blank" rel="noopener noreferrer">
          {out}
        </a>
      ) : (
        out
      );
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function renderInline(nodes: RichTextNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) =>
    n.type === 'text' ? (
      renderMarks(n.text ?? '', n.marks, i)
    ) : n.type === 'hardBreak' ? (
      <br key={i} />
    ) : null,
  );
}

function renderNode(node: RichTextNode, key: number): ReactNode {
  const children = () => (node.content ?? []).map((c, i) => renderNode(c, i));
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{node.content?.length ? renderInline(node.content) : <br />}</p>;
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 4);
      const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[level - 1] ?? 'h3';
      return <Tag key={key}>{renderInline(node.content)}</Tag>;
    }
    case 'bulletList':
      return <ul key={key}>{children()}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={typeof node.attrs?.start === 'number' ? node.attrs.start : undefined}>
          {children()}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{children()}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children()}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((c) => c.text ?? '').join('')}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    default:
      return null;
  }
}

function isEmptyDoc(doc: RichTextNode): boolean {
  const content = doc.content ?? [];
  return (
    content.length === 0 ||
    (content.length === 1 && content[0]?.type === 'paragraph' && !content[0].content?.length)
  );
}

// Tiptap/ProseMirror is loaded only when a text block is edited (spec 06: lazy editor).
const loadEditor = () => import('./RichTextEditor');
const RichTextEditor = lazy(loadEditor);

/** Warm the editor chunk while the app is idle so the first edit opens without a wait. */
export function prefetchRichTextEditor(): void {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (idle) idle(() => void loadEditor());
  else setTimeout(() => void loadEditor(), 1500);
}

export function RichTextBlock({
  block,
  payload,
  autoFocus,
  onSlash,
  onNewBlock,
}: BlockViewProps<RichTextPayload>) {
  const draft = useBlockDraft(block, payload);
  const [editing, setEditing] = useState(Boolean(autoFocus));
  const { t } = useI18n();
  const empty = isEmptyDoc(draft.value.doc);

  if (editing) {
    return (
      <Suspense
        fallback={
          <div className="rt-view">{empty ? null : <RichTextView doc={draft.value.doc} />}</div>
        }
      >
        <RichTextEditor
          doc={draft.value.doc}
          label={t('richText.edit')}
          onChange={(doc) => draft.set({ doc })}
          onBlur={() => {
            void draft.flush();
            setEditing(false);
          }}
          {...(onSlash ? { onSlash } : {})}
          {...(onNewBlock ? { onNewBlock } : {})}
        />
      </Suspense>
    );
  }
  return (
    <div
      className={`rt-view${empty ? ' rt-empty' : ''}`}
      role="textbox"
      aria-readonly="false"
      aria-label={t('richText.edit')}
      tabIndex={0}
      onClick={(e) => {
        // Links open in reading mode; any other click starts editing.
        if ((e.target as HTMLElement).closest('a')) return;
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {empty ? (
        <p className="placeholder">{t('richText.placeholder')}</p>
      ) : (
        <RichTextView doc={draft.value.doc} />
      )}
    </div>
  );
}
