import {DAMAGE_CATALOG, entryFor} from './damageSimulator.js'

export async function exportDamageResultImage(run, {title, includeGrowth}) {
  await document.fonts.ready
  const members=run.draft.members
  const canvas=document.createElement('canvas')
  canvas.width=1200
  canvas.height=350+members.length*(includeGrowth?108:84)
  const context=canvas.getContext('2d')
  context.fillStyle='#f5f7fa'
  context.fillRect(0,0,canvas.width,canvas.height)
  context.textBaseline='top'
  const text=(value,x,y,size,color='#182230')=>{
    context.font=`${size}px "Microsoft YaHei UI","Microsoft YaHei",sans-serif`
    context.fillStyle=color
    context.fillText(value,x,y,1100)
  }
  text(title || run.draft.name,48,35,30)
  text(`总伤害 ${new Intl.NumberFormat('zh-CN').format(run.result.total_damage)}`,48,88,40)
  text(`${run.result.duration} 秒 · ${run.result.expected?'期望值':'随机模拟'} · DPS ${Math.round(run.result.total_damage/run.result.duration).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`,48,148,22,'#546174')
  const lineHeight=includeGrowth?108:84
  run.result.members.forEach((result,index)=>{
    const member=members[index]
    const top=210+index*lineHeight
    text(entryFor(member.code)?.name || result.name,48,top,23)
    text(`${result.damage.toLocaleString('zh-CN')} · ${(result.share*100).toFixed(2)}%`,620,top,23)
    context.fillStyle='#dfe5ec';context.fillRect(48,top+35,1104,9)
    context.fillStyle='#d4561b';context.fillRect(48,top+35,Math.max(0,1104*result.share),9)
    if(includeGrowth)text(`Lv.${member.growth.level} · 技能 ${member.growth.skills.join('/')} · 魔方 ${member.growth.cubeLevel}级 · ${member.source}`,48,top+56,18,'#546174')
  })
  const bottom=230+members.length*lineHeight
  text(`敌人防御 ${run.draft.battle.defense} · 核心 ${run.draft.battle.core}px · 距离 ${run.draft.battle.distance}m`,48,bottom,18,'#546174')
  text(`NIKKE Photos · Jgaram/nikke-calc ${DAMAGE_CATALOG.commit.slice(0,7)} · ${new Date().toLocaleString('zh-CN')}`,48,bottom+35,16,'#546174')
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!blob)throw Error('图片生成失败')
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url;link.download='NIKKE-伤害结果.png';link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
