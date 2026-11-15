import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {DAMAGE_CATALOG,defaultBattle,presetMember} from '../src/lib/damageSimulator.js'
import {cubeSearchCandidates,operationSearchCandidates,createRandomExperiment,sampleStatistics} from '../src/lib/damageExperiments.js'
import {createComparison,generateComparisonCandidates,validateComparison,runComparison,serializeComparison,parseComparisonFile} from '../src/lib/damageComparison.js'
import {validateLibraryPayload} from '../src/lib/damageLibraryModel.js'
import {buildDamageTimeline} from '../src/lib/damageTimeline.js'
const clone=structuredClone
const draft={name:'三项功能验收',battle:{...defaultBattle(),duration:15,detail:true},members:['리타','크라운','라피 : 레드 후드','앨리스','헬름'].map(name=>presetMember(DAMAGE_CATALOG.characters.find(c=>c.engineName===name).code))}
const original=JSON.stringify(draft),supported=DAMAGE_CATALOG.cubes.filter(c=>c.engineName&&!c.limited)
const codes=draft.members.slice(0,2).map(m=>m.code),cubes=supported.slice(0,2).map(c=>({id:c.id,level:10,capacity:5}))
const combo=cubeSearchCandidates(draft,{codes,cubes})
assert.equal(combo.length,4)
assert.equal(new Set(combo.map(c=>JSON.stringify(c.draft.members.map(m=>m.growth.cubeId)))).size,4)
const capped=cubeSearchCandidates(draft,{codes,cubes:cubes.map(c=>({...c,capacity:1}))})
assert.equal(capped.length,2)
assert.ok(capped.every(c=>c.draft.members[0].growth.cubeId!==c.draft.members[1].growth.cubeId))
assert.throws(()=>cubeSearchCandidates(draft,{codes:[],cubes}),/成员/)
assert.throws(()=>cubeSearchCandidates(draft,{codes:draft.members.map(m=>m.code),cubes:supported.map(c=>({id:c.id,level:15,capacity:5}))}),/240/)
const keep=clone(draft);keep.members[4].growth.cubeId=cubes[0].id
assert.throws(()=>cubeSearchCandidates(keep,{codes:[codes[0]],cubes:[{...cubes[0],capacity:1}]}),/没有满足/)
const dimensions=[{code:draft.members[3].code,field:'tap',values:'true'},{code:draft.members[3].code,field:'tapRate',values:'3,4,4'},{code:draft.members[0].code,field:'burstDelay',values:'0,0.5'}]
const operations=operationSearchCandidates(draft,dimensions)
assert.equal(operations.length,4)
assert.equal(operations[0].draft.members[3].operations.tap,true)
assert.throws(()=>operationSearchCandidates(draft,[...dimensions,dimensions[0]]),/重复/)
assert.throws(()=>operationSearchCandidates(draft,[{code:codes[0],field:'tap',values:'true'}]),/不支持/)
assert.throws(()=>operationSearchCandidates(draft,[{code:codes[0],field:'waitCooldown',values:'0,0.1'}]),/0.5/)
assert.throws(()=>operationSearchCandidates(draft,[{code:codes[0],field:'cover',values:'maybe'}]),/true/)
assert.throws(()=>operationSearchCandidates(draft,[{code:codes[0],field:'burstDelay',values:Array.from({length:241},(_,i)=>i).join(',')}]),/240/)
assert.equal(operationSearchCandidates(draft,[{code:codes[0],field:'burstCycles',values:'all;1,3;2,4'}]).length,3)
assert.throws(()=>operationSearchCandidates({...draft,battle:{...draft.battle,operation:'upstream'}},dimensions),/独立操作参数/)
assert.equal(JSON.stringify(draft),original)
let workspace=createComparison(draft)
workspace.candidates=generateComparisonCandidates(workspace,{kind:'cubeSearch',value:{codes,cubes}})
assert.equal(generateComparisonCandidates(workspace,{kind:'cubeSearch',value:{codes,cubes}}).length,0)
assert.deepEqual(parseComparisonFile(serializeComparison(workspace)),workspace)
workspace.candidates=generateComparisonCandidates(createComparison(draft),{kind:'operationSearch',value:dimensions})
const random=createRandomExperiment(draft,4,100)
assert.equal(random.baseline.battle.expected,false)
assert.deepEqual(random.candidates.map(c=>c.draft.battle.seed),[101,102,103])
assert.equal(JSON.stringify(draft),original)
validateComparison(random)
assert.throws(()=>createRandomExperiment(draft,3,2147483646),/种子/)
const bad=clone(random);bad.candidates[0].draft.members[0].growth.skills[0]=9
assert.throws(()=>validateComparison(bad),/只允许/)
assert.throws(()=>generateComparisonCandidates(random,{kind:'cubeSearch',value:{codes,cubes}}),/混入/)
assert.deepEqual(parseComparisonFile(serializeComparison(random)),random)
const stats=sampleStatistics([1,2,3,4,5])
assert.equal(stats.mean,3);assert.equal(stats.median,3);assert.equal(stats.sd,Math.sqrt(2.5))
assert.equal(stats.p05,1.2);assert.equal(stats.p95,4.8)
assert.equal(sampleStatistics([1]).sd,null);assert.equal(sampleStatistics([]),null)
assert.equal(sampleStatistics([7,7,7]).sd,0)
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..')
const service=require('../electron/damage-simulator.cjs').createDamageService({project:root})
const run=await runComparison(random,{simulate:d=>service.simulate(d)})
assert.equal(run.status,'completed',run.error)
for(const item of run.results)assert.equal((await service.simulate(item.draft)).total_damage,item.result.total_damage)
assert.ok(new Set(run.results.map(i=>i.result.total_damage)).size>1)
const restored=validateLibraryPayload('comparison-record',run)
assert.deepEqual(restored.results,run.results)
let calls=0
const reused=await runComparison(random,{previous:restored,simulate:()=>{calls++;throw Error('must reuse')}})
assert.equal(calls,0);assert.equal(reused.status,'completed')
const controller=new AbortController()
const cancelled=await runComparison(random,{signal:controller.signal,simulate:d=>service.simulate(d),onProgress:p=>{if(p.results.length===1)controller.abort()}})
assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.results.length,1)
assert.equal(sampleStatistics(cancelled.results.map(i=>i.result.total_damage)).sd,null)
validateLibraryPayload('comparison-record',cancelled)
let count=0
const failed=await runComparison(random,{simulate:async d=>{if(++count===2)throw Error('expected');return service.simulate(d)}})
assert.equal(failed.status,'failed');assert.equal(failed.results.length,1);assert.equal(count,2)
validateLibraryPayload('comparison-record',failed)
const interrupted=validateLibraryPayload('comparison-record',{...cancelled,status:'running'})
assert.equal(interrupted.status,'interrupted')
const mixed=clone(run);mixed.results[1].result.seed=3
assert.throws(()=>validateLibraryPayload('comparison-record',mixed),/种子/)
const operationRun=await runComparison({...workspace,candidates:workspace.candidates.slice(0,2)},{simulate:d=>service.simulate(d)})
assert.equal(operationRun.status,'completed',operationRun.error)
for(const item of operationRun.results)assert.equal((await service.simulate(item.draft)).total_damage,item.result.total_damage)
const cubeRun=await runComparison({...createComparison(draft),candidates:combo.slice(0,2)},{simulate:d=>service.simulate(d)})
assert.equal(cubeRun.status,'completed',cubeRun.error)
for(const item of cubeRun.results)assert.equal((await service.simulate(item.draft)).total_damage,item.result.total_damage)
const actual=buildDamageTimeline(run.results[0].result)
assert.ok(actual.lanes.some(l=>l.kind==='buff'&&l.segments.length))
assert.ok(actual.lanes.some(l=>l.kind==='ammo'&&l.points.length))
assert.ok(actual.lanes.some(l=>l.kind==='burst'&&l.segments.length))
const group=(rows,truncated=false)=>({rows,truncated,total:rows.length+(truncated?100:0)})
const fixture={duration:20,members:[{name:'A'}],desktop:{burst:[{t:1,event:'full_burst 시작',caster:''},{t:11,event:'full_burst 종료',caster:''}],events:{
 buffs:group([{t:0,kind:'activate',name:'ATK',caster:'A',target:'A',stat:'atk',value:10,expires_at:10},{t:3,kind:'activate',name:'ATK',caster:'A',target:'A',stat:'atk',value:20,expires_at:null},{t:5,kind:'expire',name:'ATK',caster:'A',target:'A',stat:null},{t:6,kind:'activate',name:'PERM',caster:'A',target:'A',stat:null,expires_at:null},{t:8,kind:'expire',name:'unknown',caster:'A',target:'A'}],true),
 reload:group([{t:2,caster:'A',event:'재장전 시작'},{t:3,caster:'A',event:'재장전 취소(탄충)'},{t:7,caster:'A',event:'재장전 시작'}]),
 ammo:group([{t:0,caster:'A',ammo:10},{t:4,caster:'A',ammo:4}],true)
}}}
const timeline=buildDamageTimeline(fixture)
assert.deepEqual(timeline.lanes.find(l=>l.label.startsWith('ATK')).segments.map(s=>[s.start,s.end]),[[0,3],[3,5]])
assert.equal(timeline.lanes.find(l=>l.label.startsWith('PERM')).segments[0].end,8)
assert.deepEqual(timeline.lanes.find(l=>l.kind==='reload').segments.map(s=>[s.start,s.end,s.open]),[[2,3,false],[7,20,true]])
assert.equal(timeline.lanes.find(l=>l.kind==='ammo').horizon,4)
assert.equal(timeline.warnings.length,2)
assert.deepEqual(timeline.lanes.find(l=>l.kind==='burst').segments.map(s=>[s.start,s.end]),[[1,11]])
const report={passed:true,cubeCartesianAndCapacity:true,operationsCartesianAndValidation:true,atomicLimits:true,dedup:true,inputImmutable:true,randomSeedsAndIntegrity:true,statistics:true,realRandomReproducible:true,actualRandomVariation:true,realSearchMatchesIndependent:true,recordsRoundTrip:true,differentialReuse:true,cancelAndFailurePartial:true,timelineActualLogs:true,refreshExpireCancelAndTruncation:true}
const dir='E:/博哥/codex temp/nikke-desktop/experiments-check'
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
console.log(report)
