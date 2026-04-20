import { Button, Space, Tooltip, message } from 'antd'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './bug-rich-text-editor.css'

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-upload-token': {
        default: null,
      },
      'data-attachment-id': {
        default: null,
      },
    }
  },
})

function getClipboardImageFiles(clipboardData) {
  if (!clipboardData) return []

  const itemFiles = Array.from(clipboardData.items || [])
    .map((item) => (item?.kind === 'file' ? item.getAsFile?.() : null))
    .filter(Boolean)

  const directFiles = Array.from(clipboardData.files || []).filter(Boolean)
  const dedup = new Map()
  ;[...directFiles, ...itemFiles].forEach((file) => {
    const mimeType = String(file?.type || '').toLowerCase()
    if (!mimeType.startsWith('image/')) return
    const key = `${file?.name || ''}|${file?.size || 0}|${mimeType}`
    if (!dedup.has(key)) dedup.set(key, file)
  })
  return Array.from(dedup.values())
}

function BugRichTextEditor({
  value = '',
  onChange,
  placeholder = '',
  disabled = false,
  onUploadImage,
}) {
  const [uploadingImages, setUploadingImages] = useState(false)

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      RichImage.configure({
        inline: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    [placeholder],
  )

  const handlePasteImages = useCallback(
    async (editor, clipboardData) => {
      if (!editor || !onUploadImage || disabled) return false
      const files = getClipboardImageFiles(clipboardData)
      if (files.length === 0) return false

      setUploadingImages(true)
      for (const file of files) {
        try {
          const result = await onUploadImage(file)
          const imageSrc = String(result?.src || '').trim()
          if (!imageSrc) continue

          editor
            .chain()
            .focus()
            .setImage({
              src: imageSrc,
              alt: result?.alt || file?.name || '图片',
              title: result?.title || file?.name || '',
              'data-upload-token': result?.token || null,
              'data-attachment-id': result?.attachmentId ? String(result.attachmentId) : null,
            })
            .run()
        } catch (error) {
          message.error(error?.message || `${file?.name || '图片'}上传失败`)
        }
      }
      setUploadingImages(false)
      return true
    },
    [disabled, onUploadImage],
  )

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions,
    content: value || '<p></p>',
    onUpdate({ editor: currentEditor }) {
      onChange?.(currentEditor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'bug-rich-text-editor__content',
      },
      handlePaste: (_view, event) => {
        if (!event?.clipboardData) return false
        void handlePasteImages(editor, event.clipboardData)
        return getClipboardImageFiles(event.clipboardData).length > 0
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const nextContent = String(value || '<p></p>')
    if (editor.getHTML() === nextContent) return
    editor.commands.setContent(nextContent, { emitUpdate: false })
  }, [editor, value])

  const applyLink = useCallback(() => {
    if (!editor) return
    const currentHref = editor.getAttributes('link').href || ''
    const nextHref = window.prompt('请输入链接地址', currentHref)
    if (nextHref === null) return
    const normalizedHref = String(nextHref || '').trim()
    if (!normalizedHref) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run()
  }, [editor])

  const toolbarItems = useMemo(
    () => [
      { key: 'bold', label: 'B', title: '加粗', active: editor?.isActive('bold'), action: () => editor?.chain().focus().toggleBold().run() },
      { key: 'italic', label: 'I', title: '斜体', active: editor?.isActive('italic'), action: () => editor?.chain().focus().toggleItalic().run() },
      { key: 'strike', label: 'S', title: '删除线', active: editor?.isActive('strike'), action: () => editor?.chain().focus().toggleStrike().run() },
      { key: 'h2', label: 'H2', title: '二级标题', active: editor?.isActive('heading', { level: 2 }), action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
      { key: 'bullet', label: 'UL', title: '无序列表', active: editor?.isActive('bulletList'), action: () => editor?.chain().focus().toggleBulletList().run() },
      { key: 'ordered', label: 'OL', title: '有序列表', active: editor?.isActive('orderedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
      { key: 'quote', label: '引', title: '引用', active: editor?.isActive('blockquote'), action: () => editor?.chain().focus().toggleBlockquote().run() },
      { key: 'code', label: '</>', title: '代码块', active: editor?.isActive('codeBlock'), action: () => editor?.chain().focus().toggleCodeBlock().run() },
      { key: 'link', label: '链接', title: '设置链接', active: editor?.isActive('link'), action: applyLink },
      { key: 'clear', label: '清除', title: '清除格式', active: false, action: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
    ],
    [applyLink, editor],
  )

  return (
    <div className={`bug-rich-text-editor${disabled ? ' bug-rich-text-editor--disabled' : ''}`}>
      <div className="bug-rich-text-editor__toolbar">
        <Space size={[6, 6]} wrap>
          {toolbarItems.map((item) => (
            <Tooltip key={item.key} title={item.title}>
              <Button
                size="small"
                type={item.active ? 'primary' : 'default'}
                onClick={item.action}
                disabled={disabled || !editor}
                className="bug-rich-text-editor__toolbar-btn"
              >
                {item.label}
              </Button>
            </Tooltip>
          ))}
        </Space>
        <div className="bug-rich-text-editor__hint">
          {uploadingImages ? '图片上传中...' : '支持基础排版，支持直接粘贴截图'}
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default BugRichTextEditor
