import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const md = new MarkdownIt({
  html: false, // 禁用原始 HTML，防止 XSS 攻击
  linkify: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch (_) { }
    }
    return ''
  },
})

// 自定义 mermaid 代码块：输出带 class="mermaid" 的 div，供 mermaid.run() 渲染
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info ? token.info.trim() : ''
  const langName = info ? info.split(/\s+/)[0] : ''

  if (langName.toLowerCase() === 'mermaid') {
    const code = token.content
    const escaped = escapeHtml(code)
    return `<div class="mermaid-container"><div class="mermaid">${escaped}</div></div>`
  }

  const code = token.content
  const lang = langName || ''
  const highlighted = lang && hljs.getLanguage(lang)
    ? hljs.highlight(code, { language: lang }).value
    : escapeHtml(code)
  return `<pre class="hljs"><code class="language-${lang}">${highlighted}</code></pre>`
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderMarkdownToHtml(markdown) {
  if (!markdown) return ''
  return md.render(markdown)
}
