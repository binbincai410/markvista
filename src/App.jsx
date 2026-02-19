import { useState, useRef, useCallback, useEffect } from 'react'
import { toPng } from 'html-to-image'
import { renderMarkdownToHtml } from './useMarkdownRenderer'
import { MarkdownContent } from './MarkdownContent'
import './App.css'

const STORAGE_KEY_PREFIX = 'markvista_file_'

function getFileIdFromUrl() {
  const hash = window.location.hash
  const match = hash.match(/file=([^&]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function setFileIdInUrl(fileId) {
  if (fileId) {
    const hash = window.location.hash.replace(/#file=[^&]*/, '')
    window.location.hash = hash ? `${hash}&file=${encodeURIComponent(fileId)}` : `file=${encodeURIComponent(fileId)}`
  } else {
    window.location.hash = window.location.hash.replace(/[&?]file=[^&]*/, '')
  }
}

function saveFileToStorage(fileId, fileName, content) {
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${fileId}`, JSON.stringify({ fileName, content }))
  } catch (e) {
    console.warn('保存文件到 sessionStorage 失败', e)
  }
}

function loadFileFromStorage(fileId) {
  try {
    const data = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${fileId}`)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.warn('从 sessionStorage 读取文件失败', e)
    return null
  }
}

export default function App() {
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [mermaidReady, setMermaidReady] = useState(true)
  const [headings, setHeadings] = useState([])
  const fileInputRef = useRef(null)
  const currentFileRef = useRef(null)
  const currentFileIdRef = useRef(null)
  const contentWrapRef = useRef(null)

  const html = content ? renderMarkdownToHtml(content) : ''

  // 页面加载时从 URL 恢复文件
  useEffect(() => {
    const fileId = getFileIdFromUrl()
    if (fileId) {
      const saved = loadFileFromStorage(fileId)
      if (saved) {
        setFileName(saved.fileName)
        setContent(saved.content)
        currentFileIdRef.current = fileId
      }
    }
  }, [])

  const loadFile = useCallback((file, fileId) => {
    if (!file) return
    currentFileRef.current = file
    setFileName(file.name)
    setMermaidReady(false)
    file.text().then((text) => {
      setContent(text)
      // 生成文件 ID 并保存到 sessionStorage 和 URL
      const id = fileId || `${file.name}_${Date.now()}`
      currentFileIdRef.current = id
      saveFileToStorage(id, file.name, text)
      setFileIdInUrl(id)
    }).catch(() => {
      setContent('')
    })
  }, [])

  const handleSelectFile = (e) => {
    const file = e.target.files?.[0]
    if (file && file.name.endsWith('.md')) {
      loadFile(file)
    }
    e.target.value = ''
  }

  const handleRefresh = () => {
    const file = currentFileRef.current
    if (!file) return
    setMermaidReady(false)
    file.text().then((text) => {
      setContent(text)
      // 更新存储的内容
      if (currentFileIdRef.current) {
        saveFileToStorage(currentFileIdRef.current, file.name, text)
      }
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
  const onHeadingsReady = useCallback((list) => setHeadings(list || []), [])
  const scrollToHeading = (id) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
            <MarkdownContent
              html={html}
              onMermaidReady={onMermaidReady}
              onHeadingsReady={onHeadingsReady}
            />
          ) : (
            <p className="placeholder">请点击「选择文件」打开 .md 文件</p>
          )}
        </div>
        {content && (
          <aside className="toc-sidebar">
            <div className="toc-title">章节导航</div>
            {headings.length === 0 ? (
              <p className="toc-empty">暂无标题</p>
            ) : (
              <nav className="toc-nav">
                {headings.map(({ level, text, id }) => (
                  <button
                    key={id}
                    type="button"
                    className={`toc-item toc-level-${level}`}
                    onClick={() => scrollToHeading(id)}
                  >
                    {text}
                  </button>
                ))}
              </nav>
            )}
          </aside>
        )}
      </main>
    </>
  )
}
