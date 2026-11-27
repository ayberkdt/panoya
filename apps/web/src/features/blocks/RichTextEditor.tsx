import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import { checkUrl, richTextSchema, type RichTextNode } from '@panoya/blocks';

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      isAllowedUri: (url) => checkUrl(url, { allowMailto: true }).ok,
    },
  }),
];

export interface EditorProps {
  doc: RichTextNode;
  onChange: (doc: RichTextNode) => void;
  onBlur: () => void;
  onSlash?: () => void;
  onNewBlock?: () => void;
  label: string;
}

/** Mounted only while the block is being edited (spec 06: focused blocks only). */
export default function RichTextEditor({
  doc,
  onChange,
  onBlur,
  onSlash,
  onNewBlock,
  label,
}: EditorProps) {
  const callbacks = useRef({ onChange, onBlur, onSlash, onNewBlock });
  useEffect(() => {
    callbacks.current = { onChange, onBlur, onSlash, onNewBlock };
  });
  const editor = useEditor({
    extensions,
    content: doc,
    autofocus: 'end',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'rt-editor',
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
      },
      handleKeyDown: (view, event) => {
        if (event.isComposing) return false; // never trigger shortcuts during IME composition
        if (
          event.key === '/' &&
          view.state.doc.textContent.length === 0 &&
          callbacks.current.onSlash
        ) {
          event.preventDefault();
          callbacks.current.onSlash();
          return true;
        }
        if (
          event.key === 'Enter' &&
          (event.ctrlKey || event.metaKey) &&
          callbacks.current.onNewBlock
        ) {
          event.preventDefault();
          callbacks.current.onNewBlock();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON() as RichTextNode;
      // Only hand over documents that satisfy the stored schema; never save truncated content.
      if (richTextSchema.safeParse({ doc: json }).success) callbacks.current.onChange(json);
    },
    onBlur: () => callbacks.current.onBlur(),
  });
  return <EditorContent editor={editor} />;
}
