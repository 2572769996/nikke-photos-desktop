import test from 'node:test'
import assert from 'node:assert/strict'
import roster from '../src/data/roster.json' with { type: 'json' }
import preset from '../src/data/collab-preset.json' with { type: 'json' }
import {
  COLLAB_KEY, collabGroups, collabPools, commitCollabRecruit, readCollabSimulation, resetCollabRecruit,
  selectCollabRecruit,
} from '../src/lib/collabRecruitment.js'
import {
  commitSpecialRecruit, drawRecruit, readSpecialSimulation, specialRecruitBanners, summarizeRecruitSSR,
} from '../src/lib/recruitment.js'
import { ORDINARY_KEY } from '../src/lib/ordinaryRecruitment.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const day = '2026-11-25'

function useMembers(t, ids) {
  const original = preset.memberIds
  preset.memberIds = ids
  t.after(() => { preset.memberIds = original })
}

test('随包候选属于可招募的十九名联动 SSR，使用同一非联动名单及 2% 权重', () => {
  const eligible = collabGroups.flatMap(group => group.members)
  const abnormal = roster.characters.filter(c => c.corporation === 'ABNORMAL')
  assert.equal(collabGroups.length, 9)
  assert.equal(eligible.length, 19)
  assert.deepEqual(new Set(eligible), new Set(abnormal.filter(c => c.original_rare === 'SSR').map(c => c.resourceId)))
  assert.equal(abnormal.filter(c => c.original_rare === 'SR').length, 9)
  assert.equal(new Set(preset.memberIds).size, preset.memberIds.length)
  for (const id of preset.memberIds) {
    assert.ok(eligible.includes(id))
    const pools = collabPools(id)
    assert.deepEqual(pools[0].members, [id])
    assert.deepEqual(pools.map(p => p.percent), [2, .5, 1.5, 43, 53])
    assert.deepEqual(pools.slice(1), specialRecruitBanners.sky.pools.slice(1))
    assert.equal(drawRecruit(() => .02 - Number.EPSILON, pools), id)
    assert.ok(!eligible.includes(drawRecruit(() => .02, pools)))
    assert.equal(pools.flatMap(p => p.members).filter(member => eligible.includes(member)).length, 1)
  }
})

test('空发布名单不能选择、单抽、十连或兑换，余额与抽数保持不变', t => {
  useMembers(t, [])
  const storage = memoryStorage()
  const initial = readCollabSimulation(storage)
  assert.deepEqual(collabPools(''), [])
  for (const id of collabGroups.flatMap(group => group.members)) {
    assert.throws(() => selectCollabRecruit(storage, id), /UP/)
    assert.throws(() => collabPools(id), /UP/)
  }
  for (const kind of ['one', 'ten', 'exchange']) {
    assert.throws(() => commitCollabRecruit(storage, kind), /UP/)
  }
  assert.deepEqual(readCollabSimulation(storage), initial)
})

test('玩家只能选择随包候选，存档仅保存 UP；替换预设后保留历史并清除已移出目标', t => {
  useMembers(t, ['811', '801'])
  const storage = memoryStorage()
  const { record } = readCollabSimulation(storage)
  assert.ok(!Object.hasOwn(record, 'memberIds'))
  assert.equal(record.selectedId, '')
  assert.throws(() => commitCollabRecruit(storage, 'one'), /UP/)
  assert.throws(() => commitCollabRecruit(storage, 'exchange'), /UP/)
  const offered = preset.memberIds[0]
  const retired = '820'
  assert.throws(() => selectCollabRecruit(storage, '822'), /UP/)
  selectCollabRecruit(storage, offered)
  assert.equal(selectCollabRecruit(storage, '').record.selectedId, '')
  assert.ok(!Object.hasOwn(JSON.parse(storage.getItem(COLLAB_KEY)), 'memberIds'))
  const old = {
    ...record, memberIds: [retired], selectedId: retired, pulls: 201, featured: 2, ssr: 2, redeemed: 1,
    copies: { [retired]: 3, 300: 199 }, ssrDraws: { [retired]: 2 },
  }
  storage.setItem(COLLAB_KEY, JSON.stringify(old))
  const upgraded = readCollabSimulation(storage)
  assert.equal(upgraded.record.selectedId, '')
  assert.equal(upgraded.tickets, 1)
  assert.deepEqual(summarizeRecruitSSR(upgraded.record).rows, [{ id: retired, count: 2 }])
  assert.deepEqual(upgraded.record.copies, old.copies)
  assert.ok(!Object.hasOwn(JSON.parse(storage.getItem(COLLAB_KEY)), 'memberIds'))
  assert.throws(() => selectCollabRecruit(storage, retired), /UP/)
  assert.throws(() => commitCollabRecruit(storage, 'ten'), /UP/)
  assert.throws(() => commitCollabRecruit(storage, 'exchange'), /UP/)
  assert.equal(selectCollabRecruit(storage, offered).record.redeemed, 1)
})

test('随包 UP 重复奖励连续，200 金票两方向跨池兑换，重置保留 UP 和余额', t => {
  useMembers(t, ['811'])
  const storage = memoryStorage()
  const { sky, scarlet } = specialRecruitBanners
  storage.setItem(ORDINARY_KEY, '独立普通池')
  const id = preset.memberIds[0]
  selectCollabRecruit(storage, id)
  const ten = commitCollabRecruit(storage, 'ten', { random: () => 0, currency: 'vouchers' })
  assert.deepEqual(ten.results, Array(10).fill(id))
  assert.deepEqual(ten.rewards, ['new', ...Array(9).fill('body')])
  assert.equal(ten.record.vouchersSpent, 10)
  assert.deepEqual(commitCollabRecruit(storage, 'one', { random: () => 0 }).rewards, ['body'])
  assert.deepEqual(commitCollabRecruit(storage, 'one', { random: () => 0 }).rewards, [6000])
  commitCollabRecruit(storage, 'one', { random: () => .48 })
  for (let i = 0; i < 19; i++) commitCollabRecruit(storage, 'ten', { random: () => .48 })
  assert.equal(readSpecialSimulation(storage, sky).tickets, 203)
  assert.equal(commitSpecialRecruit(storage, sky, 'exchange', day).tickets, 3)
  for (let i = 0; i < 20; i++) commitSpecialRecruit(storage, scarlet, 'ten', day, { random: () => .48 })
  const claim = commitCollabRecruit(storage, 'exchange')
  assert.deepEqual(claim.results, [id])
  assert.deepEqual(claim.rewards, [6000])
  assert.equal(claim.tickets, 3)
  assert.deepEqual(summarizeRecruitSSR(claim.record), {
    total: 12, rows: [{ id, count: 12 }], unattributed: 0,
  })
  assert.equal(claim.record.redeemed, 1)
  assert.equal(claim.record.featured, 12)
  assert.deepEqual(readCollabSimulation(storage), { record: claim.record, tickets: 3 })
  assert.throws(() => commitCollabRecruit(storage, 'free'), /单抽/)
  const brokenWrite = { ...storage, setItem: () => { throw Error('quota') } }
  assert.throws(() => commitCollabRecruit(brokenWrite, 'one'), /quota/)
  assert.deepEqual(readCollabSimulation(storage).record, claim.record)
  const cleared = resetCollabRecruit(storage)
  assert.ok(!Object.hasOwn(cleared.record, 'memberIds'))
  assert.equal(cleared.record.selectedId, id)
  assert.equal(cleared.record.pulls, 0)
  assert.equal(cleared.tickets, 3)
  assert.equal(readSpecialSimulation(storage, sky).record.redeemed, 1)
  assert.equal(storage.getItem(ORDINARY_KEY), '独立普通池')
  storage.setItem(COLLAB_KEY, '{')
  assert.throws(() => commitSpecialRecruit(storage, sky, 'one', day), /联动.*备份/)
  assert.equal(storage.getItem(COLLAB_KEY), '{')
})
