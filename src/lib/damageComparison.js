import { DAMAGE_CATALOG, DAMAGE_STATS, buildDamageRequest, entryFor } from './damageSimulator.js'
import {createTeamGrowthCandidates, validateGrowthCandidate, describeGrowth} from './damageGrowth.js'
import {cubeSearchCandidates, operationSearchCandidates, validateRandomExperiment} from './damageExperiments.js'
import { validateSoloRaidResult } from './soloRaid.js'

export const COMPARISON_KEY = 'nikke-photos/damage-comparison/v1'
const clone = value => JSON.parse(JSON.stringify(value))
const MAX_CANDIDATES = 240

export function validateComparison(input) {
  if (!input || typeof input.name !== 'string' || input.name.length > 60) throw Error('比较名称须在60字以内')
  buildDamageRequest(input.baseline)
  if (!Array.isArray(input.candidates) || input.candidates.length > MAX_CANDIDATES) throw Error('每个比较最多240个候选')
  if(input.experiment != null) validateRandomExperiment(input)
  const ids = new Set(['baseline'])
  for (const item of input.candidates) {
    if (!item || typeof item.id !== 'string' || item.id.length > 80 || ids.has(item.id)) throw Error('比较候选编号无效或重复')
    ids.add(item.id)
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100) throw Error('候选名称须为1～100字')
    buildDamageRequest(item.draft)
    if (item.growth != null) validateGrowthCandidate(item.growth, input.baseline, item.draft)
    if (!input.experiment && JSON.stringify(item.draft.battle) !== JSON.stringify(input.baseline.battle)) throw Error('候选必须使用与基准相同的战斗条件')
  }
  return clone(input)
}

export function comparisonFingerprint(draft) {
  return JSON.stringify({engine: DAMAGE_CATALOG.commit, detail:draft.battle.detail===true, request: buildDamageRequest(draft)})
}

export function createComparison(draft) {
  buildDamageRequest(draft)
  return {name: '编队方案比较', baseline: clone(draft), candidates: []}
}

export function generateComparisonCandidates(workspace, {kind, slot, value, members = []}) {
  const checked = validateComparison(workspace)
  if(checked.experiment) throw Error('随机统计不能混入比较候选，请从当前单队重新建立比较')
  if(kind==='cubeSearch') return uniqueCandidates(checked,cubeSearchCandidates(checked.baseline,value))
  if(kind==='operationSearch') return uniqueCandidates(checked,operationSearchCandidates(checked.baseline,value))
  if (kind === 'teamGrowth') return uniqueCandidates(checked, createTeamGrowthCandidates(checked.baseline, value))
  if (!Number.isInteger(slot) || !checked.baseline.members[slot]) throw Error('请选择有效的比较位置')
  const original = checked.baseline.members[slot]
  const rows = []
  const add = (label, change) => {
    const draft = clone(checked.baseline)
    change(draft)
    if(kind!=='replacement'&&kind!=='order')draft.members[slot].source='比较候选配置'
    draft.name = label.slice(0, 50)
    rows.push({id: crypto.randomUUID(), label, draft})
  }
  if (kind === 'replacement') {
    if (!members.length) throw Error('请先选择替换角色')
    for (const member of members) {
      if (checked.baseline.members.some((m, index) => index !== slot && m.code === member.code)) continue
      add(entryFor(member.code)?.name || '替换角色', draft => { draft.members[slot] = clone(member) })
    }
  } else if (kind === 'cube') {
    for (const cube of DAMAGE_CATALOG.cubes.filter(cube => cube.engineName && !cube.limited)) {
      add(`${cube.name} · ${value}级`, draft => {
        Object.assign(draft.members[slot].growth, {cubeId: cube.id, cubeLevel: Number(value)})
      })
    }
  } else if (kind === 'growth') {
    const options = [
      ['技能一升至10', member => { member.growth.skills[0] = 10 }],
      ['技能二升至10', member => { member.growth.skills[1] = 10 }],
      ['爆裂技能升至10', member => { member.growth.skills[2] = 10 }],
      ['魔方升至15', member => { member.growth.cubeLevel = 15 }],
      ['收藏品升至SR15', member => { member.growth.collection = 'SR15' }],
      ['好感度升至40', member => { member.growth.affinity = 40 }],
      ['四件装备强化5', member => { member.growth.gearLevel = 5; if(member.equipment)member.equipment=member.equipment.map(item=>['overload','corporate'].includes(item.type)?{...item,level:5}:item) }],
    ]
    for (const [label, change] of options) {
      const member = clone(original)
      change(member)
      if (JSON.stringify(member) !== JSON.stringify(original)) add(label, draft => { draft.members[slot] = member })
    }
  } else if (kind === 'affix') {
    if (!DAMAGE_STATS.some(([key]) => key === value?.stat)) throw Error('请选择有效的改造词条')
    if (!Array.isArray(value.values) || !value.values.length) throw Error('请选择比较的词条数值')
    for (const values of value.values) {
      add(`${DAMAGE_STATS.find(([key]) => key === value.stat)[1]} ${values || '无'}`, draft => {
        draft.members[slot].lines[value.stat] = values
      })
    }
  } else if (kind === 'order') {
    const permute = (prefix, remaining) => {
      if (!remaining.length) {
        add(prefix.map(member => entryFor(member.code).name).join(' / ').slice(0, 100), draft => { draft.members = clone(prefix) })
        return
      }
      remaining.forEach((member, index) => permute([...prefix, member], remaining.filter((_, other) => other !== index)))
    }
    permute([], checked.baseline.members)
  } else {
    throw Error('未知比较类型')
  }
  return uniqueCandidates(checked, rows)
}

function uniqueCandidates(checked, rows) {
  const fingerprints = new Set([comparisonFingerprint(checked.baseline), ...checked.candidates.map(item => comparisonFingerprint(item.draft))])
  const unique = rows.filter(item => {
    const key = comparisonFingerprint(item.draft)
    if (fingerprints.has(key)) return false
    fingerprints.add(key)
    return true
  })
  if (checked.candidates.length + unique.length > MAX_CANDIDATES) throw Error('候选合计超过240个，请先删除部分候选')
  validateComparison({...checked, candidates: [...checked.candidates, ...unique]})
  return unique
}

export async function runComparison(input, {simulate, signal, onProgress = () => {}, previous = null}) {
  const workspace = validateComparison(input)
  if (!workspace.candidates.length) throw Error('请至少添加一个候选')
  const queue = [{id: 'baseline', label: '基准编队', draft: workspace.baseline}, ...workspace.candidates]
  const run = {workspace, status: 'running', results: [], activeId: null, error: '', total: queue.length}
  const cache = new Map()
  for (const item of previous?.results || []) {
    try {
      validateSoloRaidResult(item.result, item.draft)
      cache.set(comparisonFingerprint(item.draft), item.result)
    } catch { /* Invalid old results are recalculated. */ }
  }
  const notify = () => onProgress({...run, results: [...run.results]})
  for (const item of queue) {
    if (signal?.aborted) { run.status = 'cancelled'; break }
    run.activeId = item.id
    notify()
    try {
      const fingerprint = comparisonFingerprint(item.draft)
      const cached = cache.get(fingerprint)
      const result = cached ? clone(cached) : await simulate(clone(item.draft))
      if (signal?.aborted) { run.status = 'cancelled'; break }
      validateSoloRaidResult(result, item.draft)
      cache.set(fingerprint, result)
      run.results.push({...item, result, reused: Boolean(cached)})
      notify()
    } catch (error) {
      run.status = signal?.aborted ? 'cancelled' : 'failed'
      run.error = signal?.aborted ? '' : `${item.label}：${error.message}`
      break
    }
  }
  if (run.status === 'running') run.status = 'completed'
  run.activeId = null
  notify()
  return run
}

export function parseComparisonFile(text) {
  if (typeof text !== 'string' || text.length > 5e6) throw Error('比较方案不得超过5 MB')
  const file = JSON.parse(text)
  if (file.format !== 'nikke-damage-comparison' || file.version !== 1 || file.engine !== DAMAGE_CATALOG.commit) throw Error('比较文件格式或引擎版本不匹配')
  return validateComparison(file.workspace)
}

export function readComparison(storage) {
  try {
    const raw = storage.getItem(COMPARISON_KEY)
    if (!raw) return {workspace: null, error: ''}
    return {workspace: parseComparisonFile(raw), error: ''}
  } catch (error) {
    return {workspace: null, error: `比较方案读取失败，原始数据已保留：${error.message}`}
  }
}

export const serializeComparison = workspace => JSON.stringify({
  format: 'nikke-damage-comparison', version: 1, engine: DAMAGE_CATALOG.commit, workspace: validateComparison(workspace),
}, null, 2)

export function rankComparisonResults(run) {
  const baseline = run?.results.find(item => item.id === 'baseline') || null
  const candidates = new Map((run?.workspace.candidates || []).map(item => [item.id, item]))
  const sorted = (run?.results || []).filter(item => item.id !== 'baseline')
    .map((item, order) => ({item, order}))
    .sort((left, right) => right.item.result.total_damage - left.item.result.total_damage || left.order - right.order)
  return {baseline, rows:sorted.map(({item}, index) => {
    const delta = baseline ? item.result.total_damage - baseline.result.total_damage : null
    return {item, rank:index + 1, delta, percentage:baseline?.result.total_damage > 0 ? delta / baseline.result.total_damage : null, growth:describeGrowth(candidates.get(item.id)?.growth)}
  })}
}
