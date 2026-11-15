// Presentation only: explain the upstream rendered results without changing
// probabilities, rounding, inputs, inventory, history or calculation APIs.
const copyById = id => document.getElementById(id)
const setCopy = (element, text) => {
  if (element && element.textContent !== text) element.textContent = text
}
function explainPlannerResults() {
  const label = document.querySelector('.recommend-box > small')
  const material = copyById('recommend-material')?.textContent || ''
  const validMaterials = /^(R|SR|SSR)( \/ (R|SR|SSR))*$/.test(material)
  setCopy(label, validMaterials
    ? `当前建议使用：${material.split(' / ').map(m => `${m} 级保养工具箱`).join(' / ')}`
    : '当前建议使用：')
  if (document.documentElement.dataset.status !== 'ready') return

  // Use the calculated report's state, not possibly edited form values.
  const start = copyById('print-current-state')?.textContent?.match(/^(\d+)级/)
  const target = copyById('print-target-level')?.textContent?.match(/^(\d+)级/)
  if (!start || !target) return
  const range = `从 ${start[1]} 级升至 ${target[1]} 级`
  const note = copyById('capacity-note')
  const whole = note?.textContent?.match(/^当前可用库存预计可达到目标(\d+)次；/)
  if (whole) setCopy(note, `当前可用库存预计可支持 ${whole[1]} 份 SR 收藏品${range}（按概率平均估算，不保证完成数量）；请根据每次强化后的实际结果重新计算。`)
  else if (note?.textContent?.startsWith('当前可用库存预计不足以达到目标1次')) {
    setCopy(note, `当前可用库存预计不足以支持 1 份 SR 收藏品${range}；下方显示当前策略的预计缺口。请根据每次强化后的实际结果重新计算。`)
  }
  const bottleneck = copyById('bottleneck-value')
  const coverage = bottleneck?.textContent?.match(/^(R|SR|SSR)｜预计可达到目标(.+)次$/)
  if (coverage) setCopy(bottleneck, `受 ${coverage[1]} 级保养工具箱的可用数量限制，按当前策略预计可支持约 ${coverage[2]} 份 SR 收藏品${range}（概率平均值）。`)
}
const plannerCopyObserver = new MutationObserver(explainPlannerResults)
plannerCopyObserver.observe(document.documentElement, {attributes:true, attributeFilter:['data-status']})
for (const id of ['capacity-note','recommend-material','bottleneck-value']) {
  const element = copyById(id)
  if (element) plannerCopyObserver.observe(element, {childList:true, subtree:true, characterData:true})
}
explainPlannerResults()
