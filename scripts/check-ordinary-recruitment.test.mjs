import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  ORDINARY_KEY, bonusChoices, bonusPoints, emptyOrdinaryRecord, isWishlistActive, ordinaryPools,
  ordinaryRecruit, ordinaryWishlistGroups, publishedOrdinaryPools, readOrdinaryRecord, setOrdinaryWishlist,
} from '../src/lib/ordinaryRecruitment.js'
import { drawRecruit, emptyRecord, RECRUIT_KEY, readRecord, recruitDay, summarizeRecruitSSR } from '../src/lib/recruitment.js'

const day = '2026-11-24'
const ten = record => ordinaryRecruit(record, 'ten', day, { currency: 'vouchers', random: () => .8 }).record
const sample = (pools, points) => points.map(point => drawRecruit(() => point, pools))
const fullList = () => Object.fromEntries(ordinaryWishlistGroups.map(({ id, members }) => [id, members.slice(-5)]))
const ready = () => setOrdinaryWishlist(emptyOrdinaryRecord(), fullList())
const storedRecord = record => ({ getItem: key => key === ORDINARY_KEY ? JSON.stringify(record) : null })

test('普通招募精确区间对应 11/19 官方常驻栏的全部 144 行公示', () => {
  const pools = publishedOrdinaryPools
  const counts = new Map()
  // 63,000 个等长区间可整除四组的逐人权重。
  for (let i = 0; i < 63000; i++) {
    const id = drawRecruit(() => (i + .5) / 63000, pools)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  assert.equal(counts.size, 144)
  const published = [...counts].map(([id, hits]) => id + ' ' + (hits / 63000 * 100).toFixed(4) + '%').sort()
  assert.equal(createHash('sha256').update(published.join('\n')).digest('hex'),
    '2065c084fb0bfb4e1baf94554a6069766cf5841f01ec9b4cf8dcbb1a0855577d')
  assert.equal(sample(pools, [1 - Number.EPSILON / 2])[0], '308')
})

test('零抽可设愿望单，四组各满五名才能招募，三名新增 SSR 仅进指定组', () => {
  const record = emptyOrdinaryRecord()
  const full = fullList()
  const partial = readOrdinaryRecord(storedRecord({ ...record, wishlist: { ...full, pilgrim: full.pilgrim.slice(1) } }))
  assert.equal(partial.wishlist.pilgrim.length, 4)
  assert.throws(() => setOrdinaryWishlist(ready(), partial.wishlist), /各选满 5 名/)
  assert.equal(isWishlistActive(partial), false)
  assert.deepEqual(ordinaryPools(partial), [])
  for (const kind of ['one', 'ten', 'discount']) {
    for (const currency of ['gems', 'vouchers']) {
      assert.throws(() => ordinaryRecruit(partial, kind, day, { currency }), /愿望清单/)
    }
  }
  assert.throws(() => setOrdinaryWishlist(record, { ...full, elysion: [full.pilgrim[0]] }))
  assert.throws(() => setOrdinaryWishlist(record, { ...full, elysion: full.elysion.map(() => full.elysion[0]) }))
  assert.throws(() => setOrdinaryWishlist(record, { ...full, elysion: ordinaryWishlistGroups[0].members.slice(0, 6) }))

  const active = setOrdinaryWishlist(record, full)
  const pools = ordinaryPools(active)
  assert.equal(isWishlistActive(active), true)
  assert.ok(full.elysion.includes('530'))
  assert.ok(full.pilgrim.includes('19') && full.pilgrim.includes('472'))
  const counts = new Map()
  for (let i = 0; i < 120; i++) {
    const id = drawRecruit(() => (i + .5) / 3000, pools)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  assert.equal(counts.size, 20)
  for (const id of full.pilgrim) assert.equal(counts.get(id), 3)
  for (const id of [...full.elysion, ...full.missilis, ...full.tetra]) assert.equal(counts.get(id), 7)
  assert.deepEqual(sample(pools, [.04, .469999, .47, .999]), sample(publishedOrdinaryPools, [.04, .469999, .47, .999]))
  const point = .03995
  assert.deepEqual(ordinaryRecruit(active, 'one', day, { random: () => point }).results, sample(pools, [point]))
})

test('常驻券、珠宝和每日半价独立结算，记录可恢复且不占特别招募记录', () => {
  const before = recruitDay(Date.parse('2026-11-25T03:59:59.999+08:00'))
  const after = recruitDay(Date.parse('2026-11-25T04:00:00+08:00'))
  let record = ten(ready())
  record = ordinaryRecruit(record, 'one', before).record
  record = ordinaryRecruit(record, 'ten', before).record
  record = ordinaryRecruit(record, 'one', before, { currency: 'vouchers' }).record
  record = ordinaryRecruit(record, 'discount', before, { currency: 'vouchers' }).record
  const storage = storedRecord(record)
  assert.notEqual(ORDINARY_KEY, RECRUIT_KEY)
  assert.deepEqual(readRecord(storage), emptyRecord())
  assert.deepEqual(readOrdinaryRecord(storage), record)
  assert.throws(() => ordinaryRecruit(readOrdinaryRecord(storage), 'discount', before), /已使用/)
  record = ordinaryRecruit(record, 'discount', after).record
  assert.equal(record.pulls, 24)
  assert.equal(record.discounts, 2)
  assert.equal(record.gemsSpent, 3600)
  assert.equal(record.vouchersSpent, 11)
  assert.throws(() => readOrdinaryRecord(storedRecord({ ...record, gemsSpent: 999 })), /普通招募记录/)
})

test('追加招募每 100 分五选一，最高累计 1000 分，兑换不增加抽数、银券或消费', () => {
  let record = ready()
  assert.deepEqual(new Set(bonusChoices), new Set(['82', '450', '191', '451', '352']))
  for (let i = 0; i < 9; i++) record = ten(record)
  for (let i = 0; i < 9; i++) record = ordinaryRecruit(record, 'one', day, { random: () => .8 }).record
  assert.equal(bonusPoints(record), 99)
  assert.throws(() => ordinaryRecruit(record, 'bonus', day, { bonusId: '82' }), /100/)
  record = ordinaryRecruit(record, 'one', day, { random: () => .8 }).record
  assert.throws(() => ordinaryRecruit(record, 'bonus', day, { bonusId: '19' }))
  const first = ordinaryRecruit(record, 'bonus', day, { bonusId: '82' })
  assert.deepEqual(first.results, ['82'])
  assert.deepEqual(first.rewards, ['new'])
  assert.deepEqual(first.record, { ...record, bonusClaims: 1, copies: { ...record.copies, 82: 1 } })
  record = first.record
  for (let i = 0; i < 91; i++) record = ten(record)
  assert.equal(bonusPoints(record), 900)
  for (let i = 0; i < 9; i++) {
    const claim = ordinaryRecruit(record, 'bonus', day, { bonusId: '82' })
    assert.deepEqual(claim.rewards, ['body'])
    record = claim.record
  }
  assert.equal(record.pulls, 1010)
  assert.equal(record.bonusClaims, 10)
  assert.equal(bonusPoints(record), 0)
  assert.throws(() => ordinaryRecruit(record, 'bonus', day, { bonusId: '82' }), /100/)
  assert.deepEqual(readOrdinaryRecord(storedRecord(record)), record)
})

test('三名新增 SSR 可领取首次与重复奖励，按抽获计数保存', () => {
  let record = ready()
  const values = [.0035, .0045, .0155, .0045]
  const received = []
  for (const point of values) {
    const result = ordinaryRecruit(record, 'one', day, { random: () => point })
    record = result.record
    received.push([result.results[0], result.rewards[0]])
  }
  assert.deepEqual(received, [['19', 'new'], ['472', 'new'], ['530', 'new'], ['472', 'body']])
  const restored = readOrdinaryRecord(storedRecord(record))
  assert.deepEqual(summarizeRecruitSSR(restored), {
    total: 4, rows: [{ id: '472', count: 2 }, { id: '19', count: 1 }, { id: '530', count: 1 }], unattributed: 0,
  })
})

test('旧常驻兑换只保留可证的逐人抽获，后续新增抽获与兑换分别结算', () => {
  const old = {
    ...ready(), pulls: 200, vouchersSpent: 200, ssr: 3, bonusClaims: 1,
    copies: { 82: 2, 352: 1, 221: 1, 300: 197 },
  }
  delete old.ssrDraws
  let record = readOrdinaryRecord(storedRecord(old))
  assert.deepEqual(summarizeRecruitSSR(record), {
    total: 3, rows: [{ id: '82', count: 1 }, { id: '221', count: 1 }], unattributed: 1,
  })
  const exchanged = ordinaryRecruit(record, 'bonus', day, { bonusId: '82' }).record
  assert.deepEqual(summarizeRecruitSSR(exchanged), summarizeRecruitSSR(record))
  record = ordinaryRecruit(exchanged, 'one', day, { random: () => .0045 }).record
  record = readOrdinaryRecord(storedRecord(record))
  assert.deepEqual(summarizeRecruitSSR(record), {
    total: 4, rows: [{ id: '82', count: 1 }, { id: '221', count: 1 }, { id: '472', count: 1 }], unattributed: 1,
  })
  old.copies = { 82: 3, 221: 1, 300: 197 }
  const certain = readOrdinaryRecord(storedRecord(old))
  assert.deepEqual(summarizeRecruitSSR(certain), {
    total: 3, rows: [{ id: '82', count: 2 }, { id: '221', count: 1 }], unattributed: 0,
  })
})
