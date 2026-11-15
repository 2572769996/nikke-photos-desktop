import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { exportProfilesBackup, prepareProfilesBackup, restoreProfilesBackup } from '../lib/profileStore.js'
import { exportCustomBackup, prepareCustomBackup, restoreCustomBackup, getCustomNikkes, getDeletedCustomNikkes } from '../lib/customNikkeStore.js'
import { exportDamageLibrary, importDamageLibrary } from '../lib/damageLibraryStore.js'
import { validateLibraryBackup } from '../lib/damageLibraryModel.js'
import { validateDocument } from '../../electron/resource-income-model.mjs'
import '../styles/backup.css'

const BACKUP_LIMIT = 256 * 1024 * 1024

const categories = [
  {
    id: 'profiles', title: '全部档案与录入模板',
    description: '包含每个档案的角色养成、装备、同步器、研究所、备注和录入模板。',
    restoreDescription: '为备份中的每个档案新建副本，同名档案可并存。请先恢复自定义角色库，再恢复包含自定义角色的档案。',
    exportData: exportProfilesBackup,
    preview: file => {
      const profiles = prepareProfilesBackup(file)
      const skipped = profiles.reduce((count, profile) => count + profile.unknown.length, 0)
      return `${profiles.length} 个档案，${profiles.reduce((count, profile) => count + Object.keys(profile.characters).length, 0)} 条角色记录。${skipped ? `将跳过 ${skipped} 条未知角色记录。` : ''}\n${profiles.map(profile => profile.name).join('、')}`
    },
    restore: restoreProfilesBackup,
  },
  {
    id: 'custom', title: '自定义角色与图片',
    description: '包含角色身份、资料、头像、立绘及已删除角色的恢复资料。',
    restoreDescription: '按原身份恢复角色，同一身份的资料和图片将被覆盖，其他角色继续保留。同名但身份不同的角色会提示冲突。',
    exportData: exportCustomBackup,
    preview: async file => {
      const items = await prepareCustomBackup(file)
      const existing = new Set([...getCustomNikkes(), ...getDeletedCustomNikkes()].map(item => item.id))
      return `${items.length} 名角色，其中 ${items.filter(item => existing.has(item.id)).length} 名将覆盖同身份资料。`
    },
    restore: restoreCustomBackup,
  },
  {
    id: 'damage', title: '模拟方案与记录',
    description: '包含已保存的单队、五队、比较方案、比较记录、备注与分组。',
    restoreDescription: '追加导入方案与记录，同名分组自动归入已有分组。重复导入会生成额外副本。',
    exportData: async () => JSON.parse(await exportDamageLibrary()),
    preview: file => { const checked = validateLibraryBackup(file); return `${checked.items.length} 个条目，${checked.folders.length} 个分组。` },
    restore: importDamageLibrary,
  },
  {
    id: 'income', title: '订制模组记录', desktop: true,
    description: '包含每日订制模组、自订秘钥的收入记录，兼容原有JSON导出文件。',
    restoreDescription: '用备份完整替换收入记录。恢复前的文件会保留为本机 .bak。',
    exportData: () => window.nikkeDesktop.resourceIncome.read(),
    preview: file => `${validateDocument(file).records.length} 天收入记录。`,
    restore: file => window.nikkeDesktop.resourceIncome.restore(file),
  },
  {
    id: 'story', title: '剧情阅读进度', desktop: true,
    description: '包含书签、已读、各小节阅读位置和阅读设置。剧情正文可在工具页重新下载。',
    restoreDescription: '用备份替换全部阅读进度、书签与设置，已下载的剧情正文继续保留。',
    exportData: () => window.nikkeDesktop.storyReader.backup(),
    preview: async file => {
      const checked = await window.nikkeDesktop.storyReader.preview(file)
      return `${checked.bookmarks} 个书签，${checked.read} 个已读小节，${checked.positions} 个阅读位置。`
    },
    restore: file => window.nikkeDesktop.storyReader.restore(file),
  },
]

export default function BackupPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(null)
  const fileInput = useRef(null)
  const categoryRef = useRef(null)

  async function perform(action) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  function exportCategory(category) {
    return perform(async () => {
      const file = await category.exportData()
      const blob = new Blob([JSON.stringify({ ...file, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
      if (blob.size > BACKUP_LIMIT) throw Error('备份超过256 MB文件上限，请退出客户端后备份完整数据目录。')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `NIKKE-${category.title}-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`${category.title}备份已生成，请保留下载的JSON文件。`)
    })
  }

  async function inspectFile(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    const category = categoryRef.current
    await perform(async () => {
      if (file.size > BACKUP_LIMIT) throw Error('备份文件不得超过256 MB')
      const data = JSON.parse(await file.text())
      const summary = await category.preview(data)
      setPending({ category, data, summary, name: file.name })
    })
  }

  return <main className="page backup-page">
    <Link className="back" to="/my">返回更多</Link>
    <div className="page-head"><div><h1>备份与恢复</h1><p className="desc">按数据类别导出本地JSON文件。恢复前可查看内容数量和覆盖范围。</p></div></div>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={inspectFile} />
    {error && <p className="dlg-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="backup-grid">{categories.map(category => <section className="backup-card" key={category.id} data-backup={category.id}>
      <h2>{category.title}</h2><p>{category.description}</p>
      <p className="desc">{category.restoreDescription}</p>
      <div className="backup-actions">
        <button className="btn" disabled={busy || (category.desktop && !window.nikkeDesktop)} onClick={() => exportCategory(category)}>导出备份</button>
        <button className="btn" disabled={busy || (category.desktop && !window.nikkeDesktop)} onClick={() => { categoryRef.current = category; fileInput.current.click() }}>选择备份恢复</button>
      </div>
      {category.desktop && !window.nikkeDesktop && <p>请在桌面客户端使用此项。</p>}
    </section>)}</div>
    {pending && <div className="dlg-mask"><div className="dlg" role="dialog" aria-modal="true" aria-label="确认恢复备份" onKeyDown={event => { if (event.key === 'Escape' && !busy) setPending(null) }}>
      <div className="dlg-head"><h2>恢复{pending.category.title}</h2></div>
      <div className="dlg-body"><p>{pending.name}</p><p className="backup-summary">{pending.summary}</p><p>{pending.category.restoreDescription}</p>
        {error && <p className="dlg-error" role="alert">{error}</p>}
      </div>
      <div className="dlg-foot"><button className="btn" autoFocus disabled={busy} onClick={() => setPending(null)}>取消</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => perform(async () => {
          await pending.category.restore(pending.data)
          setNotice(`${pending.category.title}已恢复。`)
          setPending(null)
        })}>{busy ? '正在恢复…' : '确认恢复'}</button></div>
    </div></div>}
  </main>
}
