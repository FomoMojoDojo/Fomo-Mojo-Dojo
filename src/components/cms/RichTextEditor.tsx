import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';

interface Props {
  content: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content]);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded px-2 py-1 font-mono text-[10px] uppercase transition-colors cursor-pointer ${
      active ? 'bg-[#1f5d5d] text-[#95ecdd]' : 'text-[#9aa7cf] hover:text-[#eef4ff]'
    }`;

  return (
    <div className="overflow-hidden rounded-lg border border-white/20 bg-white/5">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/15 bg-[#0f1836] px-2 py-1.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive('bold'))}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive('italic'))}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive('bulletList'))}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive('orderedList'))}>1. List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive('heading', { level: 3 }))}>H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive('blockquote'))}>Quote</button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt('Enter URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className={btnClass(editor.isActive('link'))}
        >
          Link
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-3 min-h-[120px] font-serif text-[14px] text-[#eaf0ff] [&_.ProseMirror]:min-h-[100px] [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:text-[#95ecdd] [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[#ff8c4b]/60 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_h1]:text-[#eef4ff] [&_.ProseMirror_h2]:text-[#eef4ff] [&_.ProseMirror_h3]:text-[#eef4ff] [&_.ProseMirror_p]:text-[#d7def8] [&_.ProseMirror_strong]:text-[#eef4ff]"
      />
    </div>
  );
}
