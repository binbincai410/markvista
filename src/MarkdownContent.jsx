import { useEffect, useRef, useCallback } from 'react'
import mermaid from 'mermaid'
import svgPanZoom from 'svg-pan-zoom'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'neutral',
})

export function MarkdownContent({ html, onMermaidReady }) {
  const containerRef = useRef(null)
  const panZoomInstancesRef = useRef([])

  const runMermaidAndPanZoom = useCallback(async () => {
    const container = containerRef.current
    if (!container) return

    panZoomInstancesRef.current.forEach((inst) => { try { inst.destroy(); } catch (_) {} })
    panZoomInstancesRef.current = []

    const mermaidContainers = container.querySelectorAll('.mermaid-container')
    if (mermaidContainers.length === 0) {
      onMermaidReady?.()
      return
    }

    for (const wrap of mermaidContainers) {
      const mermaidEl = wrap.querySelector('.mermaid')
      if (!mermaidEl) continue
      try {
        const { svg } = await mermaid.render(`mermaid-${Math.random().toString(36).slice(2)}`, mermaidEl.textContent)
        mermaidEl.outerHTML = svg
        const svgEl = wrap.querySelector('svg')
        if (svgEl) {
          const instance = svgPanZoom(svgEl, {
            minZoom: 0.5,
            maxZoom: 10,
            fit: true,
            center: true,
            zoomScaleSensitivity: 0.35,
          })
          panZoomInstancesRef.current.push(instance)
        }
      } catch (err) {
        mermaidEl.outerHTML = `<div class="mermaid-error">Mermaid 渲染失败：${escapeHtml(String(err.message || err))}</div>`
      }
    }

    onMermaidReady?.()
  }, [onMermaidReady])

  useEffect(() => {
    if (!html) return
    runMermaidAndPanZoom()
    return () => {
      panZoomInstancesRef.current.forEach((inst) => { try { inst.destroy(); } catch (_) {} })
      panZoomInstancesRef.current = []
    }
  }, [html, runMermaidAndPanZoom])

  if (!html) return null

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
