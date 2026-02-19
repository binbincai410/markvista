import { useState, useRef, useCallback } from 'react'
import { toPng } from 'html-to-image'
import { renderMarkdownToHtml } from './useMarkdownRenderer'
import { MarkdownContent } from './MarkdownContent'
import './App.css'

export default function App() {
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [mermaidReady, setMermaidReady] = useState(true)
  const fileInputRef = useRef(null)
  const currentFileRef = useRef(null)
  const contentWrapRef = useRef(null)

  const html = content ? renderMarkdownToHtml(content) : ''

  const loadFile = useCallback((file) => {
    if (!file) return
    currentFileRef.current = file
    setFileName(file.name)
    setMermaidReady(false)
    file.text().then((text) => {
      setContent(text)
    }).catch(() => {
      setContent('')
    })
  }, [])

  const handleSelectFile = (e) => {
    const file = e.target.files?.[0]
    if (file && file.name.endsWith('.md')) loadFile(file)
    e.target.value = ''
  }

  const handleRefresh = () => {
    const file = currentFileRef.current
    if (!file) return
    setMermaidReady(false)
    file.text().then((text) => {
      setContent(text)
    }).catch(() => {})
  }

  const handleExportPdf = () => {
    window.print()
  }

  const handleExportPng = () => {
    const node = contentWrapRef.current
    if (!node) return
    const baseName = fileName.replace(/\.md$/i, '') || 'markdown'
    const name = `${baseName}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`
    toPng(node, {
      pixelRatio: 2,
      useCORS: true,
      scrollY: -window.scrollY,
      scrollX: -window.scrollX,
      width: node.scrollWidth,
      height: node.scrollHeight,
    }).then((dataUrl) => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = name
      a.click()
    }).catch((err) => {
      console.error(err)
      alert('导出 PNG 失败')
    })
  }

  const onMermaidReady = useCallback(() => setMermaidReady(true), [])

  return (
    <>
      <header className="toolbar">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          选择文件
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          onChange={handleSelectFile}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={handleRefresh} disabled={!fileName}>
          刷新
        </button>
        <button type="button" onClick={handleExportPdf} disabled={!content}>
          导出 PDF
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={!content || !mermaidReady}
          title={!mermaidReady ? '等待 Mermaid 渲染完成' : ''}
        >
          导出 PNG
        </button>
      </header>

      <main className="content">
        <div
          ref={contentWrapRef}
          className="content-inner"
          style={{ overflow: 'visible' }}
        >
          {content ? (
            <MarkdownContent html={html} onMermaidReady={onMermaidReady} />
          ) : (
            <p className="placeholder">请点击「选择文件」打开 .md 文件</p>
          )}
        </div>
      </main>
    </>
  )
}
