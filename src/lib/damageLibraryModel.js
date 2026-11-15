import {DAMAGE_CATALOG} from './damageSimulator.js'
import {createSoloRaid, validateSoloRaidDraft, validateSoloRaidResult} from './soloRaid.js'
import {sampleStatistics} from './damageExperiments.js'
import {validateComparison} from './damageComparison.js'

export const LIBRARY_KINDS = {single:'单队方案', raid:'五队方案', comparison:'比较方案', 'comparison-record':'比较记录'}
export const LIBRARY_FORMAT = 'nikke-damage-library'
export const LIBRARY_FILE_LIMIT = 256 * 1024 * 1024
const clone = value => JSON.parse(JSON.stringify(value))

export function libraryText(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(label + '格式无效')
  return value
}

function validateResultDetails(result) {
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
  const finite=value=>typeof value==='number'&&Number.isFinite(value)
  const scalar=value=>value==null||['string','boolean'].includes(typeof value)||finite(value)
  if (result.members.some(member=>!finite(member.share)||member.share<0)) throw Error('结果贡献比例无效')
  if (result.warnings!=null&&(!Array.isArray(result.warnings)||result.warnings.some(value=>typeof value!=='string'))) throw Error('结果说明格式无效')
  const desktop=result.desktop
  if(desktop==null)return
  if(!object(desktop))throw Error('结果详情格式无效')
  if(desktop.cumulative!=null&&(!object(desktop.cumulative)||Object.values(desktop.cumulative).some(values=>!Array.isArray(values)||values.some(value=>!finite(value)||value<0))))throw Error('伤害曲线格式无效')
  if(desktop.analysis!=null&&(!Array.isArray(desktop.analysis)||desktop.analysis.some(row=>!object(row)||typeof row.char_name!=='string'||['normal_atk','skill'].some(key=>!object(row[key])||!finite(row[key].damage)||!finite(row[key].hits)))))throw Error('伤害分析格式无效')
  if(desktop.burst!=null&&(!Array.isArray(desktop.burst)||desktop.burst.some(row=>!object(row)||!finite(row.t)||typeof row.event!=='string'||!scalar(row.caster))))throw Error('爆裂事件格式无效')
  if(desktop.events!=null) {
    if(!object(desktop.events))throw Error('详细日志格式无效')
    for(const key of ['ammo','reload','buffs','instant','gauge','control','hits']) {
      const group=desktop.events[key]
      if(group==null)continue
      if(!object(group)||!Array.isArray(group.rows)||!Number.isInteger(group.total)||group.total<group.rows.length||typeof group.truncated!=='boolean')throw Error('详细日志条目格式无效')
      if(group.rows.some(row=>!object(row)||!finite(row.t??row.t0)||Object.values(row).some(value=>!scalar(value))))throw Error('详细日志事件格式无效')
    }
  }
}

export function validateComparisonRecord(input) {
  if (!input || !['running','completed','cancelled','failed','interrupted'].includes(input.status)) throw Error('比较记录状态无效')
  const workspace = validateComparison(input.workspace)
  const queue = [{id:'baseline', label:'基准编队', draft:workspace.baseline}, ...workspace.candidates]
  if (!workspace.candidates.length || input.total !== queue.length || !Array.isArray(input.results) || input.results.length > queue.length) throw Error('比较记录队列无效')
  if (input.status === 'completed' && input.results.length !== queue.length) throw Error('完整比较记录缺少结果')
  const results = input.results.map((item, index) => {
    const expected = queue[index]
    if (item?.id !== expected.id || item.label !== expected.label || JSON.stringify(item.draft) !== JSON.stringify(expected.draft)) throw Error('比较结果与输入快照不一致')
    validateSoloRaidResult(item.result, expected.draft)
    validateResultDetails(item.result)
    if (item.result.expected !== expected.draft.battle.expected || item.result.seed !== expected.draft.battle.seed) throw Error('比较结果的模式或种子与输入不一致')
    return clone(item)
  })
  return {
    workspace, results, total:queue.length, activeId:null,
    status:input.status === 'running' ? 'interrupted' : input.status,
    error:libraryText(input.error ?? '', 4000, '比较错误说明'),
  }
}

export function validateLibraryPayload(kind, payload) {
  if (kind === 'single') {
    if (!payload || typeof payload.name !== 'string' || payload.name.length > 50) throw Error('编队名称须在50字以内')
    const raid = createSoloRaid()
    raid.battle = payload.battle
    raid.teams[0].members = payload.members
    const checked = validateSoloRaidDraft(raid)
    return {name:payload.name, battle:checked.battle, members:checked.teams[0].members}
  }
  if (kind === 'raid') return validateSoloRaidDraft(payload)
  if (kind === 'comparison') return validateComparison(payload)
  if (kind === 'comparison-record') return validateComparisonRecord(payload)
  throw Error('方案类型不受支持')
}

export function librarySummary(kind, payload) {
  if (kind === 'single') return {members:payload.members.length, duration:payload.battle.duration}
  if (kind === 'raid') return {teams:payload.teams.filter(team=>team.members.length).length, duration:payload.battle.duration}
  if (kind === 'comparison') return {candidates:payload.candidates.length, duration:payload.baseline.battle.duration}
  if(payload.workspace.experiment){const stats=sampleStatistics(payload.results.map(item=>item.result.total_damage));return {experiment:'random',status:payload.status,completed:payload.results.length,total:payload.total,mean:stats?.mean??null,min:stats?.min??null,max:stats?.max??null}}
  const baseline = payload.results[0]?.result.total_damage ?? null
  return {status:payload.status, completed:payload.results.length, total:payload.total, baseline,
    best:payload.results.length ? Math.max(...payload.results.map(item=>item.result.total_damage)) : null}
}

export function validateLibraryMetadata(item) {
  if (!item || !Object.hasOwn(LIBRARY_KINDS, item.kind) || item.version !== 1) throw Error('方案库条目版本或类型无效')
  for (const key of ['id','folderId','engine']) libraryText(item[key], 128, '方案标识', key !== 'folderId')
  libraryText(item.title, 100, '方案名称', true)
  libraryText(item.note, 2000, '方案备注')
  if (!Number.isInteger(item.revision) || item.revision < 1) throw Error('方案修订号无效')
  if (typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))) throw Error('方案时间无效')
  return item
}

export function validateLibraryBackup(file) {
  if (!file || file.format !== LIBRARY_FORMAT || file.version !== 1 || file.engine !== DAMAGE_CATALOG.commit) throw Error('备份格式或计算核心版本不匹配')
  if (!Array.isArray(file.folders) || !Array.isArray(file.items)) throw Error('备份缺少文件夹或条目')
  const folderIds = new Set(), itemIds = new Set(), folderNames = new Set()
  const folders = file.folders.map(folder => {
    libraryText(folder?.id, 128, '文件夹标识', true)
    const name = libraryText(folder.name, 60, '文件夹名称', true).trim()
    if (folderIds.has(folder.id) || folderNames.has(name)) throw Error('备份文件夹重复')
    folderIds.add(folder.id); folderNames.add(name)
    return {id:folder.id, name}
  })
  const items = file.items.map(item => {
    const metadata = validateLibraryMetadata(item)
    if (metadata.engine !== DAMAGE_CATALOG.commit) throw Error('备份包含其他核心版本的条目')
    if (itemIds.has(item.id)) throw Error('备份条目编号重复')
    if (item.folderId && !folderIds.has(item.folderId)) throw Error('备份条目的文件夹不存在')
    itemIds.add(item.id)
    const payload = validateLibraryPayload(item.kind, item.payload)
    return {...metadata, payload, summary:librarySummary(item.kind,payload)}
  })
  return {folders, items}
}
