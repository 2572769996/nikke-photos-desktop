const count = new Intl.NumberFormat('zh-CN')
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

function rate(numerator, denominator) {
  if (!denominator) return '—'
  return numerator ? percent.format(numerator / denominator) : '0%'
}

export function recruitRecordStats(record, featuredName) {
  const counts = [
    { label: '累计招募', value: count.format(record.pulls) },
    { label: '抽得 SSR', value: count.format(record.ssr) },
    { label: '抽得当期 UP', value: featuredName ? count.format(record.featured) : '—' },
  ]
  const rates = [
    { label: '实际出金率', value: rate(record.ssr, record.pulls), basis: '抽得 SSR ÷ 累计招募' },
    { label: '当期 UP 率', value: featuredName ? rate(record.featured, record.ssr) : '—',
      basis: featuredName ? '抽得当期 UP ÷ 抽得 SSR' : '无当期 UP' },
  ]
  const note = featuredName === '自选 UP'
    ? '自选 UP 按每次招募时指定的角色累计。兑换另计。'
    : featuredName ? '当期 UP · ' + featuredName + '　｜　兑换另计' : '追加招募兑换另计。'
  return { counts, rates, note }
}

export async function recruitStatsPng(poolName, stats) {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 508 + stats.rates.length * 112
  const ctx = canvas.getContext('2d')
  function rect(x, y, w, h, color) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }
  function text(value, x, y, size, color, maxWidth, weight = 400) {
    ctx.fillStyle = color
    ctx.font = weight + ' ' + size + 'px "Microsoft YaHei UI","Microsoft YaHei",sans-serif'
    ctx.fillText(value, x, y, maxWidth)
  }
  const margin = 56
  const inner = canvas.width - margin * 2
  rect(0, 0, canvas.width, canvas.height, '#f5f4f0')
  rect(0, 0, canvas.width, 210, '#20242b')
  rect(margin, 48, 6, 35, '#ecc582')
  text('招募模拟记录', margin + 18, 75, 28, '#f1dfb6', inner, 600)
  text(poolName, margin, 163, 54, '#ffffff', inner, 700)
  const col = inner / stats.counts.length
  stats.counts.forEach(({ label, value }, index) => {
    const x = margin + index * col
    text(label, x, 279, 27, '#585c63', col - 14)
    text(value, x, 343, 52, '#20242b', col - 18, 700)
  })
  stats.rates.forEach(({ label, basis, value }, index) => {
    const top = 389 + index * 112
    rect(margin, top, inner, 2, '#d9d8d3')
    text(label, margin, top + 48, 31, '#222832', inner / 2, 600)
    text(basis, margin, top + 82, 22, '#626870', inner / 2)
    ctx.textAlign = 'right'
    text(value, canvas.width - margin, top + 72, 56, '#805719', inner / 2, 700)
    ctx.textAlign = 'left'
  })
  const bottom = canvas.height - 109
  rect(margin, bottom, inner, 2, '#d9d8d3')
  text(stats.note, margin, bottom + 65, 22, '#5c6269', inner - 205)
  ctx.textAlign = 'right'
  text('NIKKE Photos', canvas.width - margin, bottom + 65, 23, '#454b52', 190, 600)
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(Error('未能生成招募记录图片')), 'image/png'))
}
