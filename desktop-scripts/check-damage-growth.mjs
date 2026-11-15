import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {DAMAGE_CATALOG, defaultBattle, presetMember} from '../src/lib/damageSimulator.js'
import {defaultGrowthOptions} from '../src/lib/damageGrowth.js'
import {createComparison, generateComparisonCandidates, validateComparison, runComparison, rankComparisonResults, serializeComparison, parseComparisonFile} from '../src/lib/damageComparison.js'
import {validateLibraryPayload} from '../src/lib/damageLibraryModel.js'

const clone = value => JSON.parse(JSON.stringify(value))
const names = ['리타','크라운','라피 : 레드 후드','앨리스','헬름']
const draft = {
  name:'全队收益验收',battle:{...defaultBattle(),duration:5},
  members:names.map(name => {
    const member = presetMember(DAMAGE_CATALOG.characters.find(character => character.engineName === name).code)
    Object.assign(member.growth,{skills:[7,8,9],cubeLevel:10,collection:'SR5',affinity:10,gearLevel:2})
    return member
  }),
}
const initial = clone(draft)
const workspace = createComparison(draft)
const options = defaultGrowthOptions()
const generated = generateComparisonCandidates(workspace,{kind:'teamGrowth',value:options})
assert.equal(generated.length,35)
assert.equal(new Set(generated.map(item => item.growth.code)).size,5)
for (const candidate of generated) {
  assert.equal(candidate.growth.version,1)
  assert.match(candidate.label,/→/)
  validateComparison({...workspace,candidates:[candidate]})
  candidate.draft.members.forEach((member,index) => {
    if (index !== candidate.growth.slot) assert.deepEqual(member,draft.members[index])
  })
  assert.deepEqual(candidate.draft.battle,draft.battle)
}
assert.deepEqual(draft,initial)
workspace.candidates = generated
assert.equal(generateComparisonCandidates(workspace,{kind:'teamGrowth',value:options}).length,0)
assert.deepEqual(parseComparisonFile(serializeComparison(workspace)),workspace)
const badMetadata = clone(workspace)
badMetadata.candidates[0].growth.to = 9
assert.throws(() => validateComparison(badMetadata),/前后数值/)
const multipleChanges = clone(workspace)
multipleChanges.candidates[0].draft.members[1].growth.cubeLevel++
assert.throws(() => validateComparison(multipleChanges),/单项养成/)
const invalid = defaultGrowthOptions()
invalid.targets.skill1 = ''
assert.throws(() => generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:invalid}),/技能一目标/)
assert.throws(() => generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:{...options,codes:[]}}),/至少勾选一名/)
assert.throws(() => generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:{...options,projects:[]}}),/至少勾选一项/)

const next = generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:{...options,mode:'next'}})
assert.equal(next.length,35)
assert.ok(next.filter(item=>item.growth.project!=='collection').every(item=>item.growth.to-item.growth.from===1))
assert.ok(next.filter(item=>item.growth.project==='collection').every(item=>item.growth.to==='SR6'))
const selected = generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:{...options,codes:[draft.members[2].code],projects:['skill1','cube']}})
assert.equal(selected.length,2)
assert.ok(selected.every(item=>item.growth.slot===2))
const noDowngrade = generateComparisonCandidates(createComparison(draft),{kind:'teamGrowth',value:{...options,projects:['skill1','collection'],targets:{...options.targets,skill1:6,collection:'R15'}}})
assert.equal(noDowngrade.length,0)
const maxed = clone(draft)
for (const member of maxed.members) Object.assign(member.growth,{skills:[10,10,10],cubeLevel:15,collection:'SR15',affinity:40,gearLevel:5})
assert.equal(generateComparisonCandidates(createComparison(maxed),{kind:'teamGrowth',value:options}).length,0)
assert.equal(generateComparisonCandidates(createComparison(maxed),{kind:'teamGrowth',value:{...options,mode:'next'}}).length,0)

const mixed = clone(draft)
mixed.members[0].equipment = [{type:'overload',level:2},{type:'corporate',corporation:'미실리스',level:3},{type:'T9',level:1},{type:'none',level:0}]
mixed.members[0].lines = Object.fromEntries(Object.keys(mixed.members[0].lines).map(key=>[key,'']))
const equipment = generateComparisonCandidates(createComparison(mixed),{kind:'teamGrowth',value:{...options,codes:[mixed.members[0].code],projects:['equipment']}})
assert.deepEqual(equipment.map(item=>item.growth.part),[0,1])
assert.equal(equipment[0].draft.members[0].equipment[1].level,3)
assert.equal(equipment[1].draft.members[0].equipment[0].level,2)
for (const item of equipment) validateComparison({...createComparison(mixed),candidates:[item]})
mixed.members[0].growth.collection = 'R15'
assert.equal(generateComparisonCandidates(createComparison(mixed),{kind:'teamGrowth',value:{...options,mode:'next',codes:[mixed.members[0].code],projects:['collection']}}).length,0)
mixed.members[0].growth.collection = '없음'
assert.equal(generateComparisonCandidates(createComparison(mixed),{kind:'teamGrowth',value:{...options,mode:'next',codes:[mixed.members[0].code],projects:['collection']}}).length,0)

const crowded = createComparison(draft)
crowded.candidates = Array.from({length:240},(_,index)=>({id:'existing-'+index,label:'保留'+index,draft:clone(draft)}))
const crowdedBefore = JSON.stringify(crowded)
assert.throws(() => generateComparisonCandidates(crowded,{kind:'teamGrowth',value:options}),/240/)
assert.equal(JSON.stringify(crowded),crowdedBefore)

const rankInput = {workspace:{candidates:[]},results:[
  {id:'baseline',result:{total_damage:100}},
  {id:'negative',result:{total_damage:80}},
  {id:'tieA',result:{total_damage:120}},
  {id:'tieB',result:{total_damage:120}},
  {id:'zero',result:{total_damage:100}},
]}
const ranking = rankComparisonResults(rankInput)
assert.deepEqual(ranking.rows.map(row=>row.item.id),['tieA','tieB','zero','negative'])
assert.deepEqual(ranking.rows.map(row=>row.delta),[20,20,0,-20])
assert.equal(ranking.rows[0].percentage,0.2)
assert.equal(rankComparisonResults({...rankInput,results:[{id:'baseline',result:{total_damage:0}},{id:'gain',result:{total_damage:10}}]}).rows[0].percentage,null)

const realWorkspace = createComparison(draft)
realWorkspace.candidates = generateComparisonCandidates(realWorkspace,{kind:'teamGrowth',value:{...options,projects:['skill1'],targets:{...options.targets,skill1:8}}})
const root = path.resolve(import.meta.dirname,'..')
const require = createRequire(import.meta.url)
const service = require('../electron/damage-simulator.cjs').createDamageService({project:root})
const run = await runComparison(realWorkspace,{simulate:input=>service.simulate(input)})
assert.equal(run.status,'completed',run.error)
assert.equal(run.results.length,6)
for (const item of run.results) {
  const independent = await service.simulate(item.draft)
  assert.equal(item.result.total_damage,independent.total_damage)
}
const restored = validateLibraryPayload('comparison-record',run)
assert.deepEqual(rankComparisonResults(restored),rankComparisonResults(run))
let calls = 0
await runComparison(realWorkspace,{previous:restored,simulate:async input=>{calls++;return service.simulate(input)}})
assert.equal(calls,0)
const report = {passed:true,fiveMembers:true,targetsAndNextLevel:true,memberAndProjectSelection:true,unchangedBaseline:true,singleUpgradeValidated:true,invalidMetadataRejected:true,noDowngrades:true,maxedSkipped:true,perPartEquipment:true,unsupportedEnhancementSkipped:true,noImplicitCollectionPromotion:true,duplicateSkipped:true,limitAtomic:true,stableRanksAndNegativeGain:true,zeroBaselineHandled:true,schemeAndLibraryRoundTrip:true,realSixRunsMatchIndependent:true,restoredResultsReused:true}
const dir = path.join(root,'.cache/damage-simulator/growth-check')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
console.log(report)
