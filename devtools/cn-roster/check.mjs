import path from 'node:path'
import { createRequire } from 'node:module'
import { root } from './model.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roster, validateCodes, readState, hash } from './model.mjs'
import { isCnCharacter, isCnCharacterAt, getCnRosterCount, filterRosterScope } from '../../src/lib/cnRoster.js'
import { CHARACTERS, findCharacter, applyFilters } from '../../src/lib/roster.js'

test('page-local CN filtering preserves the complete identity list', () => {
  const cn = roster.filter(isCnCharacter), outside = roster.find(c => !isCnCharacter(c))
  assert.equal(cn.length, getCnRosterCount())
  assert.deepEqual(filterRosterScope(roster, 'cn'), cn)
  assert.equal(isCnCharacter({ nameCode: 'custom-unlisted' }), false)
  assert.equal(CHARACTERS.length, roster.length)
  assert.equal(findCharacter(outside.nameCode).nameCode, outside.nameCode)
  assert.equal(applyFilters(CHARACTERS, { toggles: { cnPublished: true } }).length, cn.length)
  assert.ok(applyFilters(CHARACTERS, { toggles: { cnPublished: true, collectible: true } }).every(c => isCnCharacter(c) && c.collectibleCn))
  assert.equal(applyFilters(CHARACTERS).length, roster.length)
})
test('maintenance rejects unknown, empty, duplicate and invalid identities', () => {
  for (const codes of [[], ['unknown'], [null], [123], [roster[0].nameCode, roster[0].nameCode]]) assert.throws(() => validateCodes(codes))
  assert.deepEqual(validateCodes([roster[1].nameCode, roster[0].nameCode]), [roster[0].nameCode, roster[1].nameCode])
  assert.notEqual(hash('before'), hash('after'))
})

// Boundary checks are independent of the machine running this test.
const releases = [
  ['5136', '2026-11-04T06:00:00+08:00'],
  ['5155', '2026-11-18T06:00:00+08:00'],
  ['5156', '2026-11-18T06:00:00+08:00'],
  ['5150', '2026-12-02T07:00:00+08:00'],
  ['5151', '2026-12-02T07:00:00+08:00'],
  ['5128', '2026-12-16T07:00:00+08:00'],
  ['5127', '2026-12-16T07:00:00+08:00'],
]
test('CN release gates use Beijing time and include the exact release instant', () => {
  for (const [nameCode, unlockAt] of releases) {
    const at = Date.parse(unlockAt)
    assert.equal(isCnCharacterAt({nameCode}, at - 1), false)
    assert.equal(isCnCharacterAt({nameCode}, at), true)
    assert.equal(isCnCharacterAt({nameCode}, at + 1), true)
  }
  assert.equal(getCnRosterCount(Date.parse('2026-11-04T05:59:59+08:00')), 152)
  assert.equal(getCnRosterCount(Date.parse('2026-11-04T06:00:00+08:00')), 153)
  assert.equal(getCnRosterCount(Date.parse('2026-11-18T06:00:00+08:00')), 155)
  const today = Date.parse('2026-11-23T00:00:00+08:00')
  for (const nameCode of ['5157', '3004']) assert.equal(isCnCharacterAt({nameCode}, today), true)
  assert.equal(getCnRosterCount(today), 157)
  assert.equal(getCnRosterCount(Date.parse('2026-12-02T07:00:00+08:00')), 159)
  assert.equal(getCnRosterCount(Date.parse('2026-12-16T07:00:00+08:00')), 161)
  assert.equal(isCnCharacterAt({nameCode:'unknown'}, Date.parse('2030-01-01')), false)
})

test('Node collection checks the current clock each time settings are submitted', () => {
  const {createCollection} = createRequire(import.meta.url)('../../electron/maanikke-collection.cjs')
  const cacheRoot = path.join(process.env.NIKKE_FILTER_CHECK_CACHE || path.resolve(root, '../codex temp/nikke-desktop/cn-roster-check'), 'node-time-' + Date.now())
  const collection = createCollection({project:root,cacheRoot,screenshots:{},shortcuts:{},launch:()=>{throw Error('No game inputs allowed')}})
  const original = Date.now
  try {
    for (const [code, date] of releases) {
      const at = Date.parse(date), input = {nameCodes:[code],keys:{pause:'F8',stop:'F9'}}
      Date.now = () => at - 1
      assert.throws(() => collection.preferences(input), /无效角色/)
      Date.now = () => at
      assert.deepEqual(collection.preferences(input).nameCodes,[code])
      Date.now = () => at - 1
      assert.throws(() => collection.preferences(input), /无效角色/)
    }
  } finally { Date.now = original }
})
