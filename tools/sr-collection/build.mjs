import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assembleHtml } from './vendor/scripts/assemble.mjs'
import { listenForUiClicks } from '../ui-click.js'

const root = import.meta.dirname, vendor = path.join(root, 'vendor')
const out = path.resolve(root, '../../public/tools/sr-collection')
const manifest = JSON.parse(await fs.readFile(path.join(root, 'upstream-manifest.json'), 'utf8'))
// A fixed, auditable upstream snapshot. Adapt only the assembled desktop document.
for (const file of manifest.files) {
  const bytes = await fs.readFile(path.join(vendor, file.path))
  const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  if (hash !== file.sha) throw Error(`Upstream source changed: ${file.path}`)
}
let html = await assembleHtml(vendor, 'zh-CN')
html = html.replace('<p>确认所用工具和结果后，库存与状态会自动更新。</p>', '<p class="record-instructions">请先按上方建议的工具类型，在游戏内使用10个工具强化一次；再在下方确认实际使用的工具，并按游戏结果选择“普通结果”或“大成功”。记录后，库存、等级和经验会自动更新，并重新计算建议。</p>')
const scopeNote='<p class="sr-scope-note input-hint">仅适用于 SR 收藏品（0–15级）。下方 R / SR / SSR 是保养工具品质，并非收藏品品质。</p>'
html = html.replace('<div class="inventory-grid">', scopeNote+'<div class="inventory-grid">')
html = html.replace(/<div class="theme-switcher"[\s\S]*?<\/div>/, '')
html = html.replace(/<footer class="page-footer">[\s\S]*?<\/footer>/,
  '<footer class="page-footer"><span>数据基线：2026-07-29</span></footer>')
html = html.replace('<label for="current-level">当前等级</label>', '<label for="current-level">SR 收藏品当前等级</label>')
html = html.replace('<span>主要限制工具</span>', '')
html = html.replace('</head>', '<style>.panel-header .record-instructions{color:var(--red);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}.bottleneck{grid-template-columns:minmax(0,1fr) auto}.bottleneck strong{overflow-wrap:anywhere}@media(max-width:600px){.bottleneck{grid-template-columns:minmax(0,1fr)}}</style></head>')
const themeInit = `const t = new URLSearchParams(location.search).get('theme'); if(t==='light'||t==='dark'){document.documentElement.dataset.themeMode=t;document.documentElement.dataset.theme=t}`
html = html.replace('</script>', `</script><script>${themeInit}</script>`)
const bridge = await fs.readFile(path.join(root, 'desktop-bridge.js'), 'utf8')
const desktopCopy = await fs.readFile(path.join(root, 'desktop-copy.js'), 'utf8')
html = html.replace('</body>', `<script>${desktopCopy}</script><script>${bridge}
;(${listenForUiClicks.toString()})(document, cue => send({ type:'nikke-tools:ui-sound', cue }))
</script></body>`)
if (!html.includes('window.__SR_CALCULATOR__') || !html.includes('nikke-tools:ready')) throw Error('Incomplete desktop build')
await fs.mkdir(out, {recursive:true})
await fs.writeFile(path.join(out, 'index.html'), html)
await fs.copyFile(path.join(vendor, 'LICENSE'), path.join(out, 'LICENSE.txt'))
await fs.copyFile(path.join(root, 'UPSTREAM.md'), path.join(out, 'SOURCE-NOTICE.txt'))
console.log(`SR collection planner 1.4.0: ${Buffer.byteLength(html)} bytes; upstream ${manifest.commit}`)
