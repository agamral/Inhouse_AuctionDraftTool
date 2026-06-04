import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { useEffect, useState } from 'react'

const btnStyle = (active) => ({
  padding: '4px 8px', border: 'none', cursor: 'pointer', borderRadius: 3,
  background: active ? 'rgba(201,168,76,0.2)' : 'var(--bg)',
  color: active ? 'var(--gold2)' : 'var(--text2)',
  fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13,
  transition: 'background 0.1s, color 0.1s',
})

function Toolbar({ editor }) {
  const [imgUrl, setImgUrl]   = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [showImg, setShowImg]   = useState(false)
  const [showLink, setShowLink] = useState(false)

  if (!editor) return null

  function inserirImagem() {
    if (imgUrl.trim()) {
      editor.chain().focus().setImage({ src: imgUrl.trim() }).run()
      setImgUrl('')
      setShowImg(false)
    }
  }

  function inserirLink() {
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
      setLinkUrl('')
      setShowLink(false)
    }
  }

  const inputMini = {
    background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 4,
    padding: '4px 8px', color: 'var(--text)', fontFamily: "'Barlow', sans-serif",
    fontSize: 12, outline: 'none',
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center',
      padding: '6px 10px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
      borderRadius: '6px 6px 0 0',
    }}>
      {/* Texto */}
      <button style={btnStyle(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito (Ctrl+B)"><b>N</b></button>
      <button style={btnStyle(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico (Ctrl+I)"><i>I</i></button>

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

      {/* Headings */}
      <button style={btnStyle(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título H2">H2</button>
      <button style={btnStyle(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo H3">H3</button>

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

      {/* Listas */}
      <button style={btnStyle(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista com marcadores">• Lista</button>
      <button style={btnStyle(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">1. Lista</button>

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

      {/* Blockquote / hr */}
      <button style={btnStyle(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citação / destaque">"</button>
      <button style={btnStyle(false)} onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha divisória">—</button>

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

      {/* Imagem */}
      {!showImg ? (
        <button style={btnStyle(false)} onClick={() => { setShowImg(true); setShowLink(false) }} title="Inserir imagem">🖼 Imagem</button>
      ) : (
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input autoFocus value={imgUrl} onChange={e => setImgUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') inserirImagem(); if (e.key === 'Escape') setShowImg(false) }}
            placeholder="Cole a URL da imagem..." style={{ ...inputMini, width: 240 }} />
          <button style={{ ...btnStyle(false), color: 'var(--green)' }} onClick={inserirImagem}>OK</button>
          <button style={btnStyle(false)} onClick={() => setShowImg(false)}>✕</button>
        </span>
      )}

      {/* Link */}
      {!showLink ? (
        <button style={btnStyle(editor.isActive('link'))} onClick={() => { setShowLink(true); setShowImg(false) }} title="Inserir link">🔗 Link</button>
      ) : (
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') inserirLink(); if (e.key === 'Escape') setShowLink(false) }}
            placeholder="Cole a URL do link..." style={{ ...inputMini, width: 220 }} />
          <button style={{ ...btnStyle(false), color: 'var(--green)' }} onClick={inserirLink}>OK</button>
          <button style={btnStyle(false)} onClick={() => setShowLink(false)}>✕</button>
        </span>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
        <button style={btnStyle(false)} onClick={() => editor.chain().focus().undo().run()} title="Desfazer (Ctrl+Z)">↩</button>
        <button style={btnStyle(false)} onClick={() => editor.chain().focus().redo().run()} title="Refazer (Ctrl+Y)">↪</button>
      </div>
    </div>
  )
}

export default function RichTextEditor({ value, onChange, minHeight = 280 }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sincroniza conteúdo externo (ex: ao trocar de tópico)
  useEffect(() => {
    if (editor && value !== undefined) {
      const atual = editor.getHTML()
      if (atual !== value) {
        editor.commands.setContent(value || '', false)
      }
    }
  }, [value]) // eslint-disable-line

  return (
    <div style={{ border: '1px solid var(--border2)', borderRadius: 6, overflow: 'hidden' }}>
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ minHeight, padding: 0 }}
        className="rich-editor-content"
      />
    </div>
  )
}
