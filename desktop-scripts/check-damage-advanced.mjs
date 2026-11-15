import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {DAMAGE_CATALOG, DAMAGE_STATS, defaultBattle, presetMember, buildDamageRequest, defaultDamageOperations} from '../src/lib/damageSimulator.js'
import {createSoloRaid, validateSoloRaidDraft} from '../src/lib/soloRaid.js'
const root=path.resolve(import.meta.dirname,'..')
const require=createRequire(import.meta.url)
const service=require('../electron/damage-simulator.cjs').createDamageService({project:root})
const draft={name:'装备操作验证',battle:{...defaultBattle(),duration:15,detail:true},members:['리타','크라운','라피 : 레드 후드','앨리스','헬름'].map(name=>presetMember(DAMAGE_CATALOG.characters.find(character=>character.engineName===name).code))}
draft.members[0].equipment=[{type:'corporate',corporation:'미실리스',level:3},{type:'T8',level:0},{type:'none',level:0},{type:'overload',level:2}]
draft.members[0].lines=Object.fromEntries(DAMAGE_STATS.map(([key])=>[key,key==='atk_pct'?'11.11':'']))
draft.members[3].operations={...defaultDamageOperations(),tap:true,burstDelay:0.5,burstCycles:'1,3,5',reload:'finish_by_fb_end',cancelOnFull:true}
draft.members[4].operations={...defaultDamageOperations(),noBurst:true}
const before=JSON.stringify(draft)
const request=buildDamageRequest(draft)
assert.deepEqual(request.profile.chars['리타'].equipment['머리'],{tier:'T9',corp:'미실리스',level:3,skills:[]})
assert.equal(request.chars['앨리스'].control.tap_fire.window,'burst_charge')
assert.equal(request.operation.no_burst,'헬름')
const raid=createSoloRaid()
raid.teams[0].members=structuredClone(draft.members)
assert.deepEqual(validateSoloRaidDraft(raid).teams[0].members,draft.members)
const result=await service.simulate(draft)
assert.ok(result.desktop.events.ammo.rows.length>0)
assert.ok(result.desktop.events.buffs.rows.length>0)
assert.equal(result.desktop.events.hits.total>=result.desktop.events.hits.rows.length,true)
const vendor=path.join(root,'tools/damage-simulator/vendor')
const python=path.join(root,'tools/damage-simulator/python/python.exe')
const native=spawnSync(python,['-I','-B','-c',`import sys;sys.path.insert(0,${JSON.stringify(vendor)});from runner import sim;sim.main(['--batch'])`],{input:JSON.stringify(request)+'\n',encoding:'utf8',maxBuffer:5e6,windowsHide:true})
assert.equal(native.status,0,native.stderr)
const reference=JSON.parse(native.stdout)
assert.equal(result.total_damage,reference.total_damage,JSON.stringify(reference))
assert.deepEqual(result.members,reference.members)
assert.equal(JSON.stringify(draft),before)
const invalid=structuredClone(draft)
invalid.members[0].lines.atk_pct='11.11,11.11'
assert.throws(()=>buildDamageRequest(invalid),/词条数量/)
invalid.members[0].lines.atk_pct='11.11'
invalid.members[3].operations.tapWindow='full_burst'
assert.throws(()=>buildDamageRequest(invalid),/区间/)
const packaged=require('../electron/damage-simulator.cjs').createDamageService({project:root,resourcesPath:path.join(root,'tools'),packaged:true})
assert.equal((await packaged.simulate(draft)).total_damage,result.total_damage)
const report={passed:true,perSlotEquipment:true,characterControls:true,upstreamCliEqual:true,fiveTeamRoundTrip:true,packagedLayout:true,inputImmutable:true,total:result.total_damage}
const dir=path.join(root,'.cache/damage-simulator/advanced-check')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
console.log(report)
