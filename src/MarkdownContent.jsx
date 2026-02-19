import { useEffect, useRef, useCallback, useState } from 'react'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'default',
  themeVariables: {
    primaryColor: '#e8f4f8',
    primaryTextColor: '#000',
    primaryBorderColor: '#9370db',
    lineColor: '#000',
    secondaryColor: '#fffacd',
    tertiaryColor: '#fff',
  },
})

function slugFromText(text) {
  return text
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\-]/g, '')
    .toLowerCase() || 'heading'
}

/** 只改根 <svg> 的宽高，不碰内部元素，避免图坏、文字丢 */
function svgForFullscreen(svgString) {
  return svgString.replace(/<svg([^>]*)>/, (_, attrs) => {
    const cleaned = attrs
      .replace(/\s+width="[^"]*"/gi, '')
      .replace(/\s+height="[^"]*"/gi, '')
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`
  })
}

export function MarkdownContent({ html, onMermaidReady, onHeadingsReady }) {
  const containerRef = useRef(null)
  const fullscreenPanZoomRef = useRef(null)
  const [fullscreenSvg, setFullscreenSvg] = useState(null)
  const fullscreenWrapRef = useRef(null)

  // 正文内只渲染 Mermaid，不启用 pan-zoom；为每个图添加全屏按钮
  const runMermaid = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    const mermaidContainers = container.querySelectorAll('.mermaid-container')
    if (mermaidContainers.length === 0) {
      onMermaidReady?.()
      return
    }

    for (const wrap of mermaidContainers) {
      const mermaidEl = wrap.querySelector('.mermaid')
      if (!mermaidEl) continue
      try {
        const { svg } = await mermaid.render(
          `mermaid-${Math.random().toString(36).slice(2)}`,
          mermaidEl.textContent
        )
        mermaidEl.outerHTML = svg
        const svgEl = wrap.querySelector('svg')
        if (svgEl) {
          svgEl.style.maxWidth = '100%'
          svgEl.style.height = 'auto'
        }
        // 已存在全屏按钮则跳过（避免重复）
        if (!wrap.querySelector('.mermaid-fullscreen-btn')) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'mermaid-fullscreen-btn'
          btn.textContent = '全屏'
          btn.onclick = () => {
            const svgNode = wrap.querySelector('svg')
            if (svgNode) setFullscreenSvg(svgForFullscreen(svgNode.outerHTML))
          }
          wrap.appendChild(btn)
        }
      } catch (err) {
        mermaidEl.outerHTML = `<div class="mermaid-error">Mermaid 渲染失败：${escapeHtml(String(err.message || err))}</div>`
      }
    }

    onMermaidReady?.()
  }, [onMermaidReady])

  useEffect(() => {
    if (!html) return
    runMermaid()
  }, [html, runMermaid])

  // 全屏层：挂载 svg-pan-zoom，ESC/关闭按钮/点击背景关闭
  useEffect(() => {
    if (!fullscreenSvg || !fullscreenWrapRef.current) return
    
    // 等待 DOM 更新完成后再初始化 svg-pan-zoom
    const timer = setTimeout(() => {
      const wrap = fullscreenWrapRef.current
      if (!wrap) return
      const svgEl = wrap.querySelector('svg')
      if (!svgEl) return
      
      // 强制设置 SVG 尺寸，确保填满容器
      const wrapRect = wrap.getBoundingClientRect()
      if (wrapRect.width > 0 && wrapRect.height > 0) {
        // 确保 SVG 有 viewBox，如果没有则从原 SVG 提取
        if (!svgEl.hasAttribute('viewBox')) {
          const viewBoxMatch = fullscreenSvg.match(/viewBox="([^"]*)"/i)
          if (viewBoxMatch) {
            svgEl.setAttribute('viewBox', viewBoxMatch[1])
          }
        }
        
        // 强制设置 SVG 尺寸为容器大小
        svgEl.style.width = `${wrapRect.width}px`
        svgEl.style.height = `${wrapRect.height}px`
        
        const instance = svgPanZoom(svgEl, {
          minZoom: 0.5,
          maxZoom: 10,
          fit: true,
          center: true,
          zoomScaleSensitivity: 0.35,
        })
        fullscreenPanZoomRef.current = instance
        
        // 强制刷新，确保 fit 生效
        setTimeout(() => {
          instance.resize()
          instance.fit()
          instance.center()
        }, 150)
      }
    }, 150)
    
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreenSvg(null)
    }
    window.addEventListener('keydown', onKey)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      if (fullscreenPanZoomRef.current) {
        try { fullscreenPanZoomRef.current.destroy(); } catch (_) {}
        fullscreenPanZoomRef.current = null
      }
    }
  }, [fullscreenSvg])

  // 提取标题并设置 id，通知父组件用于 TOC
  useEffect(() => {
    const container = containerRef.current
    if (!container || !html) return
    const headings = []
    const nodes = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const used = new Set()
    nodes.forEach((el, i) => {
      const level = parseInt(el.tagName.slice(1), 10)
      const text = el.textContent || ''
      let id = slugFromText(text)
      if (used.has(id)) id = `${id}-${i}`
      used.add(id)
      el.id = id
      headings.push({ level, text, id })
    })
    onHeadingsReady?.(headings)
  }, [html, onHeadingsReady])

  if (!html) return null

  return (
    <>
      <div
        ref={containerRef}
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {fullscreenSvg && (
        <div
          className="mermaid-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setFullscreenSvg(null)}
        >
          <div className="mermaid-fullscreen-wrap">
            <div className="mermaid-fullscreen-inner" ref={fullscreenWrapRef} dangerouslySetInnerHTML={{ __html: fullscreenSvg }} />
            <button
              type="button"
              className="mermaid-fullscreen-close"
              onClick={() => setFullscreenSvg(null)}
              aria-label="关闭全屏"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
