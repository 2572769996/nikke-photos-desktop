import { useState } from 'react'
import { recruitRecordStats, recruitStatsPng } from '../lib/recruitRecordStats.js'
import '../styles/recruit-record-stats.css'

export default function RecruitRecordStats({ record, poolName, featuredName = null }) {
  const stats = recruitRecordStats(record, featuredName)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  async function exportPng() {
    setExporting(true)
    setError('')
    try {
      const blob = await recruitStatsPng(poolName, stats)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'NIKKE-' + poolName + '-模拟记录.png'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (problem) {
      setError('导出失败：' + problem.message)
    } finally { setExporting(false) }
  }

  return <section className="recruit-record-stats" aria-label="本池抽取统计">
    <div className="recruit-stats-rates">{stats.rates.map(({ label, value, basis }) =>
      <div key={label}><span>{label}</span><strong>{value}</strong><small>{basis}</small></div>)}</div>
    <button type="button" onClick={exportPng} disabled={exporting}>{exporting ? '正在生成…' : '导出统计图片'}</button>
    {error && <p role="alert">{error}</p>}
  </section>
}
