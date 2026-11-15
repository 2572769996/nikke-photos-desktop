import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {DAMAGE_CATALOG,buildDamageRequest,presetMember} from '../src/lib/damageSimulator.js'
import {SOLO_RAID_KEY,createSoloRaid,validateSoloRaidDraft,soloRaidConflicts,prepareSoloRaidQueue,runSoloRaidBatch,soloRaidTotal,readSoloRaidWorkspace,parseSoloRaidFile} from '../src/lib/soloRaid.js'
const clone=value=>JSON.parse(JSON.stringify(value)),root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url)
const source=createSoloRaid(),characters=DAMAGE_CATALOG.characters.filter(c=>c.supported).slice(0,25)
source.battle.duration=5
source.teams.forEach((t,i)=>{t.members=characters.slice(i*5,i*5+5).map(c=>presetMember(c.code))})
const baseline=JSON.stringify(source)
const mock=(draft,total=100)=>({schema_version:2,total_damage:total,duration:draft.battle.duration,expected:true,seed:42,evaluator:{commit:DAMAGE_CATALOG.commit},members:buildDamageRequest(draft).squad.map((name,i)=>({name,damage:i===0?total:0,share:i===0?1:0}))})
assert.equal(prepareSoloRaidQueue(source).queue.length,5)
const statuses=[],order=[]
const complete=await runSoloRaidBatch(source,{simulate:async draft=>{order.push(draft.name);return mock(draft)},onProgress:s=>statuses.push({completed:s.results.length,active:s.activeTeamId,status:s.status})})
assert.deepEqual(order,['第1队','第2队','第3队','第4队','第5队'])
assert.equal(complete.status,'completed');assert.equal(soloRaidTotal(complete),500);assert.equal(JSON.stringify(source),baseline)
const duplicate=clone(source);duplicate.teams[4].members[0]=clone(duplicate.teams[0].members[0])
assert.equal(soloRaidConflicts(duplicate)[0].name,characters[0].name)
let calls=0
await assert.rejects(runSoloRaidBatch(duplicate,{simulate:async d=>{calls++;return mock(d)}}),/第1队与第5队/)
assert.equal(calls,0,'all queues validate before the first calculation')
const incomplete=clone(source);incomplete.teams[3].members.pop()
await assert.rejects(runSoloRaidBatch(incomplete,{simulate:async d=>{calls++;return mock(d)}}),/第4队尚未编满/)
assert.equal(calls,0)
duplicate.teams[4].enabled=false
assert.equal(prepareSoloRaidQueue(duplicate).queue.length,4)
const empty=clone(source);empty.teams[2].members=[]
assert.equal(prepareSoloRaidQueue(empty).queue.length,4);assert.deepEqual(prepareSoloRaidQueue(empty).skipped,['team-3'])
const aborted=new AbortController();aborted.abort()
const before=await runSoloRaidBatch(source,{signal:aborted.signal,simulate:async d=>{calls++;return mock(d)}})
assert.equal(before.status,'cancelled');assert.equal(calls,0)
const cancelAfterFirst=new AbortController()
const partial=await runSoloRaidBatch(source,{signal:cancelAfterFirst.signal,simulate:async d=>{calls++;return mock(d)},onProgress:s=>{if(s.results.length===1)cancelAfterFirst.abort()}})
assert.equal(partial.status,'cancelled');assert.equal(partial.results.length,1);assert.equal(calls,1)
const during=new AbortController()
const cancelled=await runSoloRaidBatch(source,{signal:during.signal,simulate:async()=>{during.abort();throw Error('计算已取消')}})
assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.results.length,0)
calls=0
const failed=await runSoloRaidBatch(source,{simulate:async draft=>{calls++;if(calls===2)throw Error('isolated failure');return mock(draft)}})
assert.equal(failed.status,'failed');assert.equal(failed.results.length,1);assert.equal(calls,2);assert.match(failed.error,/第2队/)
const mutable=clone(source)
const frozen=await runSoloRaidBatch(mutable,{simulate:async d=>{mutable.teams[4].name='after-start';return mock(d)}})
assert.equal(frozen.raid.teams[4].name,'第5队')
const broken=clone(source);broken.teams[0].members[0].growth.level=''
assert.equal(validateSoloRaidDraft(broken).teams[0].members[0].growth.level,'')
assert.throws(()=>prepareSoloRaidQueue(broken),/等级/)
const workspace={version:1,raid:source,records:[{...complete,id:'saved-1',createdAt:new Date().toISOString()}]}
const original=JSON.stringify(workspace),storage={getItem:key=>key===SOLO_RAID_KEY?original:null}
assert.equal(readSoloRaidWorkspace(storage).records.length,1)
const selectedInput=clone(incomplete),single=await runSoloRaidBatch(selectedInput,{teamId:'team-1',simulate:async d=>mock(d)})
const singleRecord={version:1,raid:selectedInput,records:[{...single,id:'selected',createdAt:new Date().toISOString()}]}
assert.equal(readSoloRaidWorkspace({getItem:()=>JSON.stringify(singleRecord)}).records.length,1,'selected-team record survives unrelated incomplete team')
const corrupt=clone(workspace);corrupt.records[0].results[0].result.total_damage++
assert.equal(readSoloRaidWorkspace({getItem:()=>JSON.stringify(corrupt)}).records.length,0)
assert.ok(readSoloRaidWorkspace({getItem:()=>'{bad json'}).error)
const file=JSON.stringify({format:'nikke-solo-raid',version:1,engine:DAMAGE_CATALOG.commit,raid:source})
assert.deepEqual(parseSoloRaidFile(file),source)
assert.throws(()=>parseSoloRaidFile(file.replace(DAMAGE_CATALOG.commit,'bad-engine')),/版本/)
assert.equal(JSON.stringify(source),baseline)

// Real calculations use 25 distinct upstream-supported identities and the unchanged service.
const {createDamageService}=require('../electron/damage-simulator.cjs'),service=createDamageService({project:root})
const real=await runSoloRaidBatch(source,{simulate:draft=>service.simulate(draft)})
assert.equal(real.status,'completed',real.error)
assert.equal(real.results.length,5);assert.ok(soloRaidTotal(real)>0)
for(const item of real.results){const reference=await service.simulate(item.draft);assert.equal(item.result.total_damage,reference.total_damage)}
const dir=path.join(root,'.cache/damage-simulator/solo-raid-check');fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'fixture.json'),file)
const report={passed:true,realFiveTeams:true,individualResultsEqual:true,preflightAtomic:true,crossTeamDuplicates:true,cancelBeforeAndDuring:true,cancelKeepsCompleted:true,failureStopsQueue:true,immutableSnapshot:true,recordReload:true,fileRoundTrip:true,total:soloRaidTotal(real),teamTotals:real.results.map(r=>r.result.total_damage)}
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));console.log(report)
