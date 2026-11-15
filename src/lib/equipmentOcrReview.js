import {AFFIX_TIER_VALUES} from '../data/affixTiers.js'
import {equipmentIssue} from './equipmentRules.js'

export const toEditableRows=rows=>rows.map(row=>{
 const tiers=AFFIX_TIER_VALUES[row.functionType]
 const tier=Number.isFinite(row.value)&&tiers?tiers.findIndex(v=>Math.abs(v-row.value)<1e-6):-1
 return {position:row.position,status:row.status||'unknown',empty:!!row.empty,
  functionType:row.empty?'':row.functionType||'',level:row.empty||tier<0?null:tier+1,
  confidence:row.confidence||null,snapped:!!row.snapped,snapReason:row.snapReason||'none',
  needsConfirm:!!row.needsConfirm||(!row.empty&&(tier<0||!tiers)),flags:Array.isArray(row.flags)?row.flags:[]}
})
export const toEquipmentLine=row=>{
 if(row.empty)return null
 const tiers=AFFIX_TIER_VALUES[row.functionType]
 return {functionType:row.functionType,level:row.level,value:tiers?.[row.level-1]??null}
}
export function ocrRowsIssue(rows){
 for(const row of rows){
  if(row.empty)continue
  const tiers=AFFIX_TIER_VALUES[row.functionType]
  if(!tiers)return `第${row.position}条词条名称未识别，请手动选择词条，或明确设为未获得效果`
  if(!Number.isInteger(row.level)||!Number.isFinite(tiers[row.level-1]))return `第${row.position}条数值未识别，请先选择有效档位和数值`
 }
 return equipmentIssue(rows.map(toEquipmentLine))
}
