import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {PNG} from 'pngjs'
import {AFFIX_TIER_VALUES} from '../src/data/affixTiers.js'
import {createValueTemplateLoader} from '../src/lib/ocr/equipment/valueTemplateLoader.js'
import {matchEquipmentValueTemplate} from '../src/lib/ocr/equipment/valueTemplate.js'
import {adjudicateRow} from '../src/lib/ocr/equipment/adjudicate.js'
import {toEditableRows,ocrRowsIssue} from '../src/lib/equipmentOcrReview.js'
import {collectionPatch} from '../src/lib/collectionReview.js'

const root=path.resolve(import.meta.dirname,'../public/ocr')
const loader=createValueTemplateLoader({loadImage:async relative=>PNG.sync.read(fs.readFileSync(path.join(root,relative)))})
let seed=42
const noisy={width:60,height:20,data:Uint8Array.from({length:1200},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%7<3?1:0})}
assert.equal(await matchEquipmentValueTemplate(noisy,'StatAtk',{...loader}),null)
const match=await matchEquipmentValueTemplate(noisy,'StatAtk',{...loader,includeCandidate:true})
assert.ok(Number.isFinite(match?.candidate?.value))
assert.ok(AFFIX_TIER_VALUES.StatAtk.includes(match.candidate.value))
assert.equal(match.method,'');assert.equal(match.value,null)
const candidate=await adjudicateRow({position:1,nameMatch:{ranked:[{functionType:'StatAtk',score:.9},{functionType:'StatDef',score:.5}]},matchValue:async()=>match})
assert.equal(candidate.name,'攻击力增加');assert.equal(candidate.value,match.candidate.value)
assert.equal(candidate.status,'unknown');assert.equal(candidate.confidence,'low');assert.equal(candidate.needsConfirm,true)
assert.ok(candidate.flags.includes('VALUE_LOW_CONFIDENCE'))
const accepted=await adjudicateRow({position:1,nameMatch:{ranked:[{functionType:'StatAtk',score:.9},{functionType:'StatDef',score:.5}]},matchValue:async()=>({level:4,value:6.88,score:0,margin:.2,method:'glyph-sequence'})})
assert.equal(accepted.status,'ok');assert.equal(accepted.value,6.88)
const empty=[2,3].map(position=>({position,status:'empty',empty:true}))
const editable=toEditableRows([candidate,...empty])
assert.equal(editable[0].needsConfirm,true);assert.ok(editable[0].level);assert.equal(ocrRowsIssue(editable),'')
const missing=toEditableRows([{position:1,functionType:'StatAtk',value:null,tier:4,needsConfirm:true},...empty])
assert.equal(missing[0].level,null);assert.match(ocrRowsIssue(missing),/数值未识别/)
assert.match(ocrRowsIssue(toEditableRows([{position:1,functionType:null,value:6.88},...empty])),/名称未识别/)
const blank={width:60,height:20,data:new Uint8Array(1200)}
assert.equal(await matchEquipmentValueTemplate(blank,'StatAtk',{...loader,includeCandidate:true}),null)

const old={equipments:[[{functionType:'StatDef',level:1,value:4.77},null,{functionType:'StatAtk',level:4,value:6.88}],[],[],[]]}
const draft={nameCode:'5001',name:'麦斯威尔',status:'complete',equipment:{head:{rows:[{position:1,status:'ok',functionType:'StatAtk',value:6.88},{position:2,status:'empty'},{position:3,status:'unreadable',functionType:'StatDef',value:null,needsConfirm:true}]}}}
const before=JSON.stringify(old)
assert.throws(()=>collectionPatch({'5001':old},{'5001':draft},['5001']),error=>error.message.includes('麦斯威尔')&&error.message.includes('保留档案原值')&&error.message.includes('第3条')&&!error.message.includes('5001'))
assert.equal(JSON.stringify(old),before)
// Complete candidates save on explicit archive confirmation without adoption.
const pending={...draft,equipment:{head:{rows:[{...candidate,status:'unreadable',suggested:true},...empty.map(r=>({...r,needsConfirm:true}))]}}}
const original={equipments:[[{functionType:'StatDef',level:1,value:4.77}],[],[],[]]}
const patched=collectionPatch({'5001':original},{'5001':pending},['5001'])
assert.equal(patched.writtenRows,1);assert.equal(patched.candidateRows,1);assert.equal(patched.emptyRows,0);assert.equal(patched.preservedRows,11)
assert.equal(patched.characters['5001'].equipments[0][0].functionType,'StatAtk')
assert.equal(patched.characters['5001'].equipments[0][0].value,candidate.value)
assert.equal(pending.equipment.head.rows[0].needsConfirm,true)
assert.equal(original.equipments[0][0].functionType,'StatDef')
const duplicate={equipments:[[{functionType:'StatDef',level:1,value:4.77},null,{functionType:'StatAtk',level:1,value:4.77}],[],[],[]]}
assert.throws(()=>collectionPatch({'5001':duplicate},{'5001':pending},['5001']),/重复/)
const noFirst={...pending,equipment:{head:{rows:[{...candidate,status:'unreadable',suggested:true,position:2}]}}}
assert.throws(()=>collectionPatch({}, {'5001':noFirst},['5001']),/第一条/)
const safe={equipments:[[{functionType:'StatDef',level:1,value:4.77}],[],[],[]]}
const partial=collectionPatch({'5001':safe},{'5001':{...draft,equipment:{head:{rows:[{position:1,status:'unreadable',functionType:'StatAtk',value:null,needsConfirm:true},{position:2,status:'ok',functionType:'StatCritical',value:AFFIX_TIER_VALUES.StatCritical[0]}]}}}},['5001'])
assert.equal(partial.characters['5001'].equipments[0][0].functionType,'StatDef')
assert.equal(partial.writtenRows,1)
// An unrelated legacy gear must not be padded/rewritten while another slot saves.
const legacy={equipments:[[{functionType:'StatAtk',level:1,value:4.77},{functionType:'StatAtk',level:1,value:4.77}],[],[],[]]}
const otherSlot=collectionPatch({'5001':legacy},{'5001':{status:'complete',equipment:{chest:{rows:[{position:1,status:'ok',functionType:'StatDef',value:4.77}]}}}},['5001'])
assert.deepEqual(otherSlot.characters['5001'].equipments[0],legacy.equipments[0])
console.log('OCR review passed: rejected numeric candidates stay complete and unconfirmed; blank input is explicit; hidden merged conflicts show names/sources; complete unreviewed candidates save; missing values preserve existing data; duplicate/first-row constraints remain.')
