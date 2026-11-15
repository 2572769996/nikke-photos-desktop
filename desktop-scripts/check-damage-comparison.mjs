import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {DAMAGE_CATALOG, defaultBattle, presetMember, buildDamageRequest} from '../src/lib/damageSimulator.js'
import {createComparison, generateComparisonCandidates, runComparison, serializeComparison, parseComparisonFile} from '../src/lib/damageComparison.js'

const root = path.resolve(import.meta.dirname, '..')
const clone = value => JSON.parse(JSON.stringify(value))
const names = ['리타', '크라운', '라피 : 레드 후드', '앨리스', '헬름']
const draft = {name:'比较验收', battle:{...defaultBattle(), duration:5}, members:names.map(name => presetMember(DAMAGE_CATALOG.characters.find(character => character.engineName === name).code))}
const source = JSON.stringify(draft)
const workspace = createComparison(draft)
workspace.candidates = generateComparisonCandidates(workspace, {kind:'cube', slot:2, value:10}).slice(0,2)
assert.equal(workspace.candidates.length, 2)
const fake = input => ({schema_version:2, evaluator:{commit:DAMAGE_CATALOG.commit}, duration:5, total_damage:100, expected:true, members:buildDamageRequest(input).squad.map((name,index) => ({name,damage:index ? 0 : 100,share:index ? 0 : 1}))})
let calls = 0
const simulate = async input => { calls++; return fake(input) }
const complete = await runComparison(workspace, {simulate})
assert.equal(complete.status, 'completed')
assert.equal(calls, 3)
calls = 0
const reused = await runComparison(workspace, {simulate, previous:complete})
assert.equal(calls, 0)
assert.ok(reused.results.every(item => item.reused))
const changed = clone(workspace)
changed.candidates[0].draft.members[2].growth.level++
await runComparison(changed, {simulate, previous:complete})
assert.equal(calls, 1)
const controller = new AbortController()
calls = 0
const cancelled = await runComparison(workspace, {simulate, signal:controller.signal, onProgress:run => {
  if (run.results.length === 1) controller.abort()
}})
assert.equal(cancelled.status, 'cancelled')
assert.equal(cancelled.results.length, 1)
assert.equal(calls, 1)
calls = 0
const failed = await runComparison(workspace, {simulate:async input => {
  calls++
  if (calls === 2) throw Error('isolated failure')
  return fake(input)
}})
assert.equal(failed.status, 'failed')
assert.equal(failed.results.length, 1)
assert.equal(calls, 2)
const invalid = clone(workspace)
invalid.candidates[1].draft.battle.duration++
calls = 0
await assert.rejects(runComparison(invalid, {simulate}), /战斗条件/)
assert.equal(calls, 0)
const mutable = clone(workspace)
const snapshot = await runComparison(mutable, {simulate:async input => {
  mutable.candidates[1].label = 'changed after start'
  return fake(input)
}})
assert.notEqual(snapshot.workspace.candidates[1].label, 'changed after start')
assert.deepEqual(parseComparisonFile(serializeComparison(workspace)), workspace)
assert.throws(() => parseComparisonFile(serializeComparison(workspace).replace(DAMAGE_CATALOG.commit, 'bad-version')), /版本/)
assert.equal(generateComparisonCandidates(createComparison(draft), {kind:'order',slot:0}).length, 119)
assert.equal(JSON.stringify(draft), source)
const require = createRequire(import.meta.url)
const service = require('../electron/damage-simulator.cjs').createDamageService({project:root})
const real = await runComparison(workspace, {simulate:input => service.simulate(input)})
assert.equal(real.status, 'completed', real.error)
for (const item of real.results) {
  const independent = await service.simulate(item.draft)
  assert.equal(item.result.total_damage, independent.total_damage)
}
const report = {passed:true, preflightAtomic:true, cancelRetainsCompleted:true, failureStopsQueue:true, snapshotImmutable:true, diffCache:true, fileRoundTrip:true, orderPermutations:true, realResultsEqual:true, totalRuns:real.results.length}
const dir = path.join(root, '.cache/damage-simulator/comparison-check')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
console.log(report)
