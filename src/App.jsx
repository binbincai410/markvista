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

function getHeadingIdFromUrl() {
  const hash = window.location.hash
  const match = hash.match(/heading=([^&]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

function setFileIdInUrl(fileId) {
  const hash = window.location.hash
  if (fileId) {
    // 移除所有 file 参数，然后添加新的
    const parts = hash.split('&').filter(p => p && !p.startsWith('file=') && !p.startsWith('#file='))
    const headingPart = parts.find(p => p.startsWith('heading='))
    const otherParts = parts.filter(p => !p.startsWith('heading='))
    
    // 构建新的 hash：file 参数 + heading 参数（如果有）+ 其他参数
    const newParts = [`file=${encodeURIComponent(fileId)}`]
    if (headingPart) newParts.push(headingPart)
    if (otherParts.length > 0) newParts.push(...otherParts)
    
    window.location.hash = newParts.join('&')
  } else {
    // 移除所有 file 参数
    const parts = hash.split('&').filter(p => p && !p.startsWith('file=') && !p.startsWith('#file='))
    window.location.hash = parts.length > 0 ? parts.join('&') : ''
  }
}

function setHeadingIdInUrl(headingId) {
  const hash = window.location.hash
  if (headingId) {
    // 移除所有 heading 参数，保留 file 和其他参数，然后添加新的 heading
    const parts = hash.split('&').filter(p => p && !p.startsWith('heading=') && !p.startsWith('#heading='))
    const filePart = parts.find(p => p.startsWith('file=') || p.startsWith('#file='))
    const otherParts = parts.filter(p => !p.startsWith('file=') && !p.startsWith('#file='))
    
    // 构建新的 hash：file 参数（如果有）+ heading 参数 + 其他参数
    const newParts = []
    if (filePart) newParts.push(filePart.startsWith('#') ? filePart : `#${filePart}`)
    newParts.push(`heading=${encodeURIComponent(headingId)}`)
    if (otherParts.length > 0) newParts.push(...otherParts)
    
    window.location.hash = newParts.join('&')
  } else {
    // 移除所有 heading 参数
    const parts = hash.split('&').filter(p => p && !p.startsWith('heading=') && !p.startsWith('#heading='))
    window.location.hash = parts.length > 0 ? parts.join('&') : ''
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

  // 页面加载时从 URL 恢复文件和章节位置
  useEffect(() => {
    const fileId = getFileIdFromUrl()
    if (fileId) {
      const saved = loadFileFromStorage(fileId)
      if (saved) {
        setFileName(saved.fileName)
        setContent(saved.content)
        currentFileIdRef.current = fileId
        
        // 恢复章节位置
        const headingId = getHeadingIdFromUrl()
        if (headingId) {
          // 等待内容渲染完成后再跳转
          setTimeout(() => {
            const el = document.getElementById(headingId)
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }, 500)
        }
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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setHeadingIdInUrl(id)
    }
  }

  // 监听滚动，更新当前章节位置到 URL
  useEffect(() => {
    if (!content || headings.length === 0) return

    let scrollTimer = null
    const handleScroll = () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        // 找到当前视口中最接近顶部的标题
        const scrollTop = window.scrollY || document.documentElement.scrollTop
        let currentHeading = null
        let minDistance = Infinity

        headings.forEach(({ id }) => {
          const el = document.getElementById(id)
          if (el) {
            const rect = el.getBoundingClientRect()
            const distance = Math.abs(rect.top)
            // 如果标题在视口上方或接近顶部（100px 内），认为是当前章节
            if (rect.top <= 100 && distance < minDistance) {
              minDistance = distance
              currentHeading = id
            }
          }
        })

        if (currentHeading) {
          setHeadingIdInUrl(currentHeading)
        }
      }, 150) // 防抖，150ms
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimer)
    }
  }, [content, headings])

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
