import {AFFIX_TIER_VALUES,FUNCTION_LABELS} from '../data/affixTiers.js'
import {equipmentIssue} from './equipmentRules.js'
import {characterNameForCode} from './roster.js'
export const COLLECTION_SLOTS=[['head','头部'],['chest','胸甲'],['hands','手部'],['legs','腿部']]
export function rowFunction(row){return row?.functionType||Object.keys(FUNCTION_LABELS).find(k=>FUNCTION_LABELS[k]===row?.name)||''}
export function rowHasValue(row){const tiers=AFFIX_TIER_VALUES[rowFunction(row)];return Number.isFinite(row?.value)&&!!tiers?.some(v=>Math.abs(v-row.value)<1e-6)}
export function rowCanSaveValue(row){return rowHasValue(row)&&!row.suggestedEmpty&&(row.status==='ok'||row.status==='unreadable'&&(row.suggested===true||row.needsConfirm===true))}
export function mergedEquipment(original,captured,slot,index){
 const rows=Array.from({length:3},(_,i)=>{
  const row=captured.equipment?.[slot]?.rows?.find(r=>r.position===i+1)
  if(row?.status==='empty'&&!row.needsConfirm)return {line:null,source:'本次确认空词条',changed:true}
  if(rowCanSaveValue(row)){
   const type=rowFunction(row),tier=AFFIX_TIER_VALUES[type].findIndex(v=>Math.abs(v-row.value)<1e-6)
   const candidate=!!(row.needsConfirm||row.suggested)
   return {line:{functionType:type,level:tier+1,value:AFFIX_TIER_VALUES[type][tier]},source:candidate?'本次未核对候选':'本次已确认',changed:true,candidate}
  }
  return {line:original?.equipments?.[index]?.[i]??null,source:'保留档案原值',changed:false}
 })
 const lines=rows.map(r=>r.line),changed=rows.some(r=>r.changed)
 const issue=changed&&JSON.stringify(lines)!==JSON.stringify(original?.equipments?.[index])?equipmentIssue(lines):''
 return {rows,lines,changed,issue}
}
// Complete numeric candidates may save directly; missing data preserves local values.
export function collectionPatch(characters,draft,codes){
 const result={characters:{...characters},nameCodes:[],writtenRows:0,emptyRows:0,preservedRows:0,candidateRows:0}
 for(const code of [...new Set(codes)]){
  const captured=draft[code];if(captured?.status!=='complete')continue
  const original=characters[code]||{},equipments=[];let changed=false
  COLLECTION_SLOTS.forEach(([slot,title],index)=>{
   const merged=mergedEquipment(original,captured,slot,index)
   if(merged.issue){
    const name=characterNameForCode(code),details=merged.rows.map((r,i)=>`第${i+1}条：${r.line?`${FUNCTION_LABELS[r.line.functionType]||'未知词条'} ${Number.isFinite(r.line.value)?r.line.value+'%':'数值未录入'}`:'空词条'}（${r.source}）`).join('；')
    throw Error(`${name} · ${title}：${merged.issue}。这是与档案原值合并后的检查：${details}`)
   }
   equipments[index]=merged.changed?merged.lines:original.equipments?.[index]??[];changed||=merged.changed
   for(const row of merged.rows){if(!row.changed)result.preservedRows++;else if(row.line){result.writtenRows++;if(row.candidate)result.candidateRows++}else result.emptyRows++}
  })
  if(changed){result.characters[code]={...original,equipments,updatedAt:new Date().toISOString()};result.nameCodes.push(code)}
 }
 return result
}
