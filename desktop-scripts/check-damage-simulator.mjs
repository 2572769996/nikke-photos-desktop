import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {DAMAGE_CATALOG as catalog,defaultBattle,presetMember,buildDamageRequest,importDamageMember} from '../src/lib/damageSimulator.js'
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..')
const {createDamageService}=require('../electron/damage-simulator.cjs')
const codeFor=name=>catalog.characters.find(c=>c.engineName===name).code
const draft={name:'隔离验证',members:['리타','크라운','라피 : 레드 후드','앨리스','헬름'].map(n=>presetMember(codeFor(n))),battle:{...defaultBattle(),duration:15}}
assert.equal(catalog.characters.filter(c=>c.supported).length,206)
assert.throws(()=>buildDamageRequest({...draft,members:[draft.members[0],draft.members[0]]}),/重复/)
assert.throws(()=>buildDamageRequest({...draft,members:[{...draft.members[0],code:'cn-exclusive-huapi'}]}),/暂不支持/)
assert.throws(()=>buildDamageRequest({...draft,battle:{...draft.battle,duration:Infinity}}),/整数/)
const before=JSON.stringify(draft),req=buildDamageRequest(draft)
assert.equal(JSON.stringify(draft),before)
assert.deepEqual(req.profile.chars['리타'].equip_skills.max_ammo_pct,[64.82,64.82])
const data=JSON.parse(fs.readFileSync(path.join(root,'src/data/roster.json'),'utf8')).characters
const host=data.find(c=>entryForTest(c.nameCode)?.favorite)
function entryForTest(code){return catalog.characters.find(c=>c.code===code)}
const record={limitBreak:{grade:3,core:0},affection:30,skills:{skill1:10,skill2:10,burst:10},cube:{resourceId:10003,level:15},favoriteItem:{rarity:'SSR',level:0},equipments:Array.from({length:4},()=>[{functionType:'StatAtk',level:4,value:6.88}])}
const profile={name:'隔离档案',synchroLevel:400,research:{class:{[host.class]:100},corporation:{[host.corporation]:100}}}
const inputs=JSON.stringify({record,profile})
const imported=importDamageMember(host.nameCode,record,profile,host,{common:180,gearLevel:5})
assert.equal(imported.growth.favorite,1)
assert.equal(imported.lines.atk_pct,'6.88,6.88,6.88,6.88')
assert.equal(JSON.stringify({record,profile}),inputs)
assert.throws(()=>importDamageMember(host.nameCode,{...record,skills:{}},profile,host,{common:180,gearLevel:5}),/技能/)
assert.throws(()=>importDamageMember(host.nameCode,{...record,equipments:[[],...record.equipments.slice(1)]},profile,host,{common:180,gearLevel:5}),/未录入/)
const hashes=JSON.parse(fs.readFileSync(path.join(root,'tools/damage-simulator/vendor-hashes.json'),'utf8'))
for(const [file,hash] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'tools/damage-simulator/vendor',file))).digest('hex'),hash,file+' was modified')
const service=createDamageService({project:root})
const result=await service.simulate(draft)
assert.ok(result.total_damage>0,JSON.stringify(result))
assert.equal(result.members.length,5)
assert.equal(result.desktop.analysis.length,5)
for(const member of result.members)assert.equal(result.desktop.cumulative[member.name].at(-1),member.damage)
const python=path.join(root,'tools/damage-simulator/python/python.exe'),vendor=path.join(root,'tools/damage-simulator/vendor')
const native=spawnSync(python,['-I','-B','-c',`import sys;sys.path.insert(0,${JSON.stringify(vendor)});from runner import sim;sim.main(['--batch'])`],{input:JSON.stringify(req)+'\n',encoding:'utf8',maxBuffer:5e6,windowsHide:true})
assert.equal(native.status,0,native.stderr)
const reference=JSON.parse(native.stdout)
assert.equal(result.total_damage,reference.total_damage,'adapter total vs unmodified upstream CLI')
assert.deepEqual(result.members,reference.members)
const repeat=await service.simulate(draft)
assert.equal(repeat.total_damage,result.total_damage,'expected result is reproducible')
const portable=createDamageService({project:path.join(root,'.cache/damage-simulator/no-app-source'),resourcesPath:path.join(root,'tools'),packaged:true})
assert.equal((await portable.simulate(draft)).total_damage,result.total_damage,'packaged resource layout needs no source checkout')
const randomDraft={...draft,battle:{...draft.battle,expected:false,seed:12345}}
const randomA=await service.simulate(randomDraft),randomB=await service.simulate(randomDraft)
assert.equal(randomA.total_damage,randomB.total_damage,'fixed random seed is reproducible')
const pending=service.simulate({...draft,battle:{...draft.battle,duration:600}})
await new Promise(r=>setTimeout(r,100))
await assert.rejects(service.simulate(draft),/已有/)
assert.equal(service.cancel(),true)
await assert.rejects(pending,/取消/)
assert.equal(service.status().running,false)
const timed=createDamageService({project:root,timeoutMs:1})
await assert.rejects(timed.simulate(draft),/超时/)
const report={passed:true,supported:206,upstreamHashes:Object.keys(hashes).length,total:result.total_damage,unmodifiedCliEqual:true,deterministic:true,randomSeed:true,packagedResourceLayout:true,importAtomic:true,cancel:true,timeout:true,singleFlight:true}
fs.mkdirSync(path.join(root,'.cache/damage-simulator/check'),{recursive:true})
fs.writeFileSync(path.join(root,'.cache/damage-simulator/check/result.json'),JSON.stringify(report,null,2))
console.log(report)
