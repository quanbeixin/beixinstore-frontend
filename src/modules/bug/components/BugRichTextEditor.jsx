import { Button, Space, Tooltip, message } from 'antd'
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './bug-rich-text-editor.css'

const MIN_IMAGE_WIDTH = 120
const DEFAULT_IMAGE_MAX_WIDTH = 560

function parseImageWidth(value) {
  const width = Number(value)
  return Number.isFinite(width) && width > 0 ? Math.round(width) : null
}

function ResizableImageNodeView(props) {
  const { node, updateAttributes, editor, selected } = props
  const [draftWidth, setDraftWidth] = useState(null)
  const fixedWidth = parseImageWidth(node?.attrs?.width)
  const effectiveWidth = draftWidth || fixedWidth

  const startResize = useCallback(
    (event) => {
      event.preventDefault()
      event.stopPropagation()

      const editorWidth = Number(editor?.view?.dom?.clientWidth || 0)
      const maxWidth = Math.max(MIN_IMAGE_WIDTH, editorWidth > 0 ? editorWidth - 36 : DEFAULT_IMAGE_MAX_WIDTH)
      const initialWidth = effectiveWidth || Number(event.currentTarget?.parentElement?.getBoundingClientRect?.().width || 0) || DEFAULT_IMAGE_MAX_WIDTH
      const startX = Number(event.clientX || 0)
      let currentWidth = initialWidth
      setDraftWidth(initialWidth)

      const handleMouseMove = (moveEvent) => {
        const deltaX = Number(moveEvent.clientX || 0) - startX
        const nextWidth = Math.max(MIN_IMAGE_WIDTH, Math.min(maxWidth, Math.round(initialWidth + deltaX)))
        currentWidth = nextWidth
        setDraftWidth(nextWidth)
      }

      const handleMouseUp = () => {
        const finalizedWidth = parseImageWidth(currentWidth) || parseImageWidth(initialWidth)
        if (finalizedWidth) {
          updateAttributes({ width: finalizedWidth })
        }
        setDraftWidth(null)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [editor?.view?.dom?.clientWidth, effectiveWidth, updateAttributes],
  )

  return (
    <NodeViewWrapper
      as="span"
      className={`bug-rich-text-editor__image-node${selected ? ' bug-rich-text-editor__image-node--selected' : ''}`}
      style={{
        width: effectiveWidth ? `${effectiveWidth}px` : undefined,
        maxWidth: '100%',
      }}
      contentEditable={false}
      draggable={false}
    >
      <img
        src={node?.attrs?.src || ''}
        alt={node?.attrs?.alt || ''}
        title={node?.attrs?.title || ''}
        data-upload-token={node?.attrs?.['data-upload-token'] || undefined}
        data-attachment-id={node?.attrs?.['data-attachment-id'] || undefined}
        width={effectiveWidth || undefined}
      />
      <button
        type="button"
        className="bug-rich-text-editor__image-resize-handle"
        onMouseDown={startResize}
        aria-label="拖拽调整图片宽度"
        title="拖拽调整图片大小"
      />
    </NodeViewWrapper>
  )
}

const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => parseImageWidth(element.getAttribute('width')),
        renderHTML: (attributes) => {
          const width = parseImageWidth(attributes?.width)
          if (!width) return {}
          return { width: String(width) }
        },
      },
      'data-upload-token': {
        default: null,
      },
      'data-attachment-id': {
        default: null,
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
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
          {uploadingImages ? '图片上传中...' : '支持基础排版、粘贴截图，图片可拖拽右下角调整大小'}
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

export default BugRichTextEditor
