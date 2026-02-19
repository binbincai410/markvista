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

function saveFileToStorage(fileId, fileName, content, usedFileSystemAccess = false) {
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${fileId}`, JSON.stringify({ 
      fileName, 
      content,
      usedFileSystemAccess // 标记是否使用了 File System Access API
    }))
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
  const currentFileHandleRef = useRef(null) // File System Access API 文件句柄
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
        
        // 如果之前使用了 File System Access API，显示一个提示，让用户可以选择重新加载
        if (saved.usedFileSystemAccess && 'showOpenFilePicker' in window) {
          // 延迟显示提示，先让页面显示缓存内容
          setTimeout(() => {
            // 检查是否已经显示过提示（避免重复提示）
            const promptKey = `reload_prompt_${fileId}`
            if (!sessionStorage.getItem(promptKey)) {
              const shouldReload = confirm(
                `检测到文件 "${saved.fileName}" 已更新。\n\n` +
                `点击"确定"重新加载最新内容，或"取消"继续查看缓存内容。\n\n` +
                `（下次刷新页面时将不再提示）`
              )
              sessionStorage.setItem(promptKey, 'shown')
              
              if (shouldReload) {
                // 用户选择重新加载，打开文件选择器
                handleSelectFileWithHandle()
              }
            }
          }, 1000) // 延迟 1 秒，让用户先看到内容
        }
        
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
      // 标记是否使用了 File System Access API
      const usedFileSystemAccess = !!currentFileHandleRef.current
      saveFileToStorage(id, file.name, text, usedFileSystemAccess)
      setFileIdInUrl(id)
    }).catch(() => {
      setContent('')
    })
  }, [])
  
  // 使用 File System Access API 选择文件
  const handleSelectFileWithHandle = async () => {
    if (!('showOpenFilePicker' in window)) {
      // 浏览器不支持，回退到传统方式
      fileInputRef.current?.click()
      return
    }
    
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md'] }
        }],
        excludeAcceptAllOption: false,
        multiple: false
      })
      
      currentFileHandleRef.current = handle
      const file = await handle.getFile()
      loadFile(file)
    } catch (err) {
      // 用户取消选择或其他错误
      if (err.name !== 'AbortError') {
        console.error('选择文件失败', err)
      }
    }
  }

  const handleSelectFile = (e) => {
    const file = e.target.files?.[0]
    if (file && file.name.endsWith('.md')) {
      console.log('传统文件选择器选择了文件:', file.name)
      // 传统文件选择器无法获取文件句柄，所以设为 null
      currentFileHandleRef.current = null
      loadFile(file)
    }
    e.target.value = ''
  }

  const handleRefresh = async () => {
    console.log('刷新按钮被点击', {
      hasHandle: !!currentFileHandleRef.current,
      hasFile: !!currentFileRef.current,
      fileName
    })
    
    // 优先使用 File System Access API 文件句柄重新读取
    if (currentFileHandleRef.current) {
      try {
        console.log('使用文件句柄重新读取文件')
        setMermaidReady(false)
        const file = await currentFileHandleRef.current.getFile()
        const text = await file.text()
        console.log('文件读取成功，长度:', text.length)
        // 直接更新内容，不清空（避免 DOM 元素被移除导致错误）
        setContent(text)
        // 更新存储的内容
        if (currentFileIdRef.current) {
          saveFileToStorage(currentFileIdRef.current, file.name, text, true)
        }
        currentFileRef.current = file
        return
      } catch (err) {
        console.warn('使用文件句柄读取失败，尝试其他方式', err)
        // 文件句柄可能已失效，清除它
        currentFileHandleRef.current = null
      }
    }
    
    // 回退到使用文件对象
    const file = currentFileRef.current
    if (!file) {
      console.log('没有文件对象，尝试打开文件选择器')
      // 如果没有文件对象（从 URL 恢复的情况），尝试自动打开文件选择器
      if (fileName && currentFileIdRef.current) {
        // 如果支持 File System Access API，尝试使用它
        if ('showOpenFilePicker' in window) {
          try {
            const [handle] = await window.showOpenFilePicker({
              types: [{
                description: 'Markdown files',
                accept: { 'text/markdown': ['.md'] }
              }],
              excludeAcceptAllOption: false,
              multiple: false
            })
            currentFileHandleRef.current = handle
            const newFile = await handle.getFile()
            // 检查文件名是否匹配
            if (newFile.name === fileName) {
              console.log('文件名匹配，重新读取文件')
              setMermaidReady(false)
              const text = await newFile.text()
              setContent(text)
              currentFileRef.current = newFile
              if (currentFileIdRef.current) {
                saveFileToStorage(currentFileIdRef.current, newFile.name, text, true)
              }
              return
            } else {
              // 文件名不匹配，加载新文件
              console.log('文件名不匹配，加载新文件')
              loadFile(newFile)
              return
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              console.error('打开文件选择器失败', err)
            }
            // 用户取消，回退到传统方式
          }
        }
        // 回退到传统文件选择器
        console.log('回退到传统文件选择器')
        fileInputRef.current?.click()
      } else {
        alert('请先选择文件')
      }
      return
    }
    
    // 使用文件对象重新读取
    console.log('使用文件对象重新读取')
    setMermaidReady(false)
    file.text().then((text) => {
      console.log('文件读取成功，长度:', text.length)
      // 直接更新内容，不清空（避免 DOM 元素被移除导致错误）
      setContent(text)
      // 更新存储的内容
      if (currentFileIdRef.current) {
        const usedFileSystemAccess = !!currentFileHandleRef.current
        saveFileToStorage(currentFileIdRef.current, file.name, text, usedFileSystemAccess)
      }
    }).catch((err) => {
      console.error('读取文件失败', err)
      alert('读取文件失败，请重新选择文件')
    })
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
        <button type="button" onClick={handleSelectFileWithHandle}>
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
