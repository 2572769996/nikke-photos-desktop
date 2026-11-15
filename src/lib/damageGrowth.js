import {buildDamageRequest, entryFor, DAMAGE_EQUIPMENT_PARTS} from './damageSimulator.js'

export const GROWTH_PROJECTS = [
  {id:'skill1', label:'技能一', skill:0, min:1, max:10, target:10},
  {id:'skill2', label:'技能二', skill:1, min:1, max:10, target:10},
  {id:'burst', label:'爆裂技能', skill:2, min:1, max:10, target:10},
  {id:'cube', label:'魔方等级', field:'cubeLevel', min:1, max:15, target:15},
  {id:'collection', label:'收藏品', field:'collection', target:'SR15'},
  {id:'affinity', label:'好感度', field:'affinity', min:1, max:40, target:30},
  {id:'equipment', label:'装备强化', min:0, max:5, target:5},
]

export const defaultGrowthOptions = () => ({
  mode:'target',
  codes:null,
  projects:GROWTH_PROJECTS.map(project => project.id),
  targets:Object.fromEntries(GROWTH_PROJECTS.map(project => [project.id, project.target])),
})
const clone = value => JSON.parse(JSON.stringify(value))
const collectionRank = value => {
  if (value === '없음') return -1
  const match = /^(R|SR)([0-9]|1[0-5])$/.exec(value)
  if (!match) throw Error('收藏品目标无效')
  return Number(match[2]) + (match[1] === 'SR' ? 16 : 0)
}
export const growthValueLabel = value => value === '없음' ? '未装备' : String(value)

function currentValue(member, project, part) {
  if (project.skill != null) return Number(member.growth.skills[project.skill])
  if (project.id === 'equipment') {
    if (part != null) {
      const equipment = member.equipment?.[part]
      return equipment && ['overload','corporate'].includes(equipment.type) ? Number(equipment.level) : null
    }
    return !member.equipment && member.growth.gear === 'overload' ? Number(member.growth.gearLevel) : null
  }
  return project.id === 'collection' ? member.growth.collection : Number(member.growth[project.field])
}

function setValue(member, project, part, value) {
  if (project.skill != null) member.growth.skills[project.skill] = value
  else if (project.id === 'equipment') {
    if (part == null) member.growth.gearLevel = value
    else member.equipment[part].level = value
  } else member.growth[project.field] = value
}

function nextValue(project, current, options) {
  if (project.id === 'collection') {
    if (options.mode === 'target') return options.targets.collection
    if (current === '없음') return current
    const match = /^(R|SR)([0-9]|1[0-5])$/.exec(current)
    return match[1] + Math.min(15, Number(match[2]) + 1)
  }
  return options.mode === 'next' ? Math.min(project.max, current + 1) : Number(options.targets[project.id])
}

function projectLabel(project, part) {
  if (project.id !== 'equipment') return project.label
  return part == null ? '四件改造装备强化' : DAMAGE_EQUIPMENT_PARTS[part][1] + '装备强化'
}

function validateOptions(baseline, input) {
  if (!input || !['target','next'].includes(input.mode)) throw Error('请选择有效的养成比较方式')
  if (!Array.isArray(input.projects) || !input.projects.length || new Set(input.projects).size !== input.projects.length) throw Error('请至少勾选一项养成项目')
  const projects = input.projects.map(id => {
    const project = GROWTH_PROJECTS.find(item => item.id === id)
    if (!project) throw Error('养成项目无效')
    if (input.mode === 'target') {
      const target = input.targets?.[id]
      if (id === 'collection') collectionRank(target)
      else if (target === '' || target == null || typeof target === 'boolean' || !Number.isInteger(Number(target)) || target < project.min || target > project.max) {
        throw Error(project.label + '目标须为 ' + project.min + '～' + project.max + ' 的整数')
      }
    }
    return project
  })
  const codes = input.codes === null ? baseline.members.map(member => member.code) : input.codes
  if (!Array.isArray(codes) || !codes.length || new Set(codes).size !== codes.length || codes.some(code => !baseline.members.some(member => member.code === code))) {
    throw Error('请至少勾选一名基准编队成员')
  }
  return {projects, codes}
}

export function createTeamGrowthCandidates(baseline, options) {
  buildDamageRequest(baseline)
  const {projects, codes} = validateOptions(baseline, options)
  const rows = []
  for (const [slot, member] of baseline.members.entries()) {
    if (!codes.includes(member.code)) continue
    for (const project of projects) {
      const parts = project.id === 'equipment' && member.equipment ? [0,1,2,3] : [null]
      for (const part of parts) {
        const from = currentValue(member, project, part)
        if (from === null) continue
        const to = nextValue(project, from, options)
        const increases = project.id === 'collection' ? collectionRank(to) > collectionRank(from) : to > from
        if (!increases) continue
        const draft = clone(baseline)
        setValue(draft.members[slot], project, part, to)
        draft.members[slot].source = '全队养成比较'
        const change = projectLabel(project, part) + ' ' + growthValueLabel(from) + ' → ' + growthValueLabel(to)
        const label = entryFor(member.code).name + ' · ' + change
        draft.name = label.slice(0,50)
        const growth = {version:1, code:member.code, slot, project:project.id, part, from, to}
        rows.push({id:crypto.randomUUID(), label, draft, growth})
      }
    }
  }
  return rows
}

// Metadata describes an exact, single upgrade. Imported records and edited
// candidates must never show a growth label for a different simulation input.
export function validateGrowthCandidate(growth, baseline, draft) {
  if (!growth || growth.version !== 1 || !Number.isInteger(growth.slot)) throw Error('养成候选信息无效')
  const member = baseline.members[growth.slot]
  const project = GROWTH_PROJECTS.find(item => item.id === growth.project)
  if (!member || member.code !== growth.code || !project) throw Error('养成候选角色或项目与基准不一致')
  if (growth.part !== null && (!Number.isInteger(growth.part) || growth.part < 0 || growth.part > 3 || project.id !== 'equipment')) throw Error('养成候选装备部位无效')
  const from = currentValue(member, project, growth.part)
  const to = currentValue(draft.members[growth.slot], project, growth.part)
  if (from === null || growth.from !== from || growth.to !== to) throw Error('养成候选的前后数值与快照不一致')
  if (project.id === 'collection' ? collectionRank(to) <= collectionRank(from) : to <= from) throw Error('养成候选须高于基准养成')
  const expected = clone(baseline)
  setValue(expected.members[growth.slot], project, growth.part, to)
  if (JSON.stringify(buildDamageRequest(expected)) !== JSON.stringify(buildDamageRequest(draft))) throw Error('养成候选须仅修改所标明的单项养成')
  return growth
}

export function describeGrowth(growth) {
  if (!growth) return null
  const project = GROWTH_PROJECTS.find(item => item.id === growth.project)
  return {
    code:growth.code,
    character:entryFor(growth.code)?.name || growth.code,
    project:projectLabel(project, growth.part),
    change:growthValueLabel(growth.from) + ' → ' + growthValueLabel(growth.to),
  }
}
