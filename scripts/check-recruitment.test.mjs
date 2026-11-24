import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import roster from '../src/data/roster.json' with { type: 'json' }
import {
  commitSpecialRecruit, drawRecruit, emptyRecord, mileage, QUEEN, readRecord, readSpecialSimulation,
  recruit, recruitDay, resetSpecialRecruit, specialRecruitBanners, summarizeRecruitSSR,
} from '../src/lib/recruitment.js'

const characters = new Map(roster.characters.map(c => [c.resourceId, c]))
const day = '2026-10-29'

test('玛丽安池为非 UP 朝圣者及超规格留出 0.5%，普通 SSR 占 2.5%', () => {
  const special = new Set(), standard = new Set()
  for (let i = 0; i < 21; i++) special.add(drawRecruit(() => .01 + (i + .5) * .005 / 21))
  for (let i = 0; i < 105; i++) standard.add(drawRecruit(() => .015 + (i + .5) * .025 / 105))
  assert.equal(special.size, 21)
  assert.equal(standard.size, 105)
  assert.ok([...special].every(id => id !== QUEEN && (characters.get(id).corporation === 'PILGRIM' || characters.get(id).overSpec)))
  assert.ok([...standard].every(id => characters.get(id).original_rare === 'SSR' && characters.get(id).corporation !== 'PILGRIM' && !characters.get(id).overSpec))
  assert.ok(special.has(drawRecruit(() => .015 - Number.EPSILON)))
  assert.ok(standard.has(drawRecruit(() => .015)))
})

test('当期每名角色的精确抽取区间与官方公示一致', () => {
  const grade = point => characters.get(drawRecruit(() => point))?.original_rare
  assert.equal(drawRecruit(() => .01 - Number.EPSILON), QUEEN)
  assert.equal(grade(.01), 'SSR')
  assert.notEqual(drawRecruit(() => .01), QUEEN)
  assert.equal(grade(.04 - Number.EPSILON), 'SSR')
  assert.equal(grade(.04), 'SR')
  assert.equal(grade(.47 - Number.EPSILON), 'SR')
  assert.equal(grade(.47), 'R')
  assert.equal(grade(1 - Number.EPSILON / 2), 'R')

  const counts = new Map()
  for (let i = 0; i < 12600; i++) {
    const id = drawRecruit(() => (i + .5) / 12600)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  assert.equal(counts.size, 1 + 126 + 9 + 9)
  // 官方玛丽安专栏的韩文名映射为资源 ID 后，逐行按「ID 公示概率」排序校验。
  const published = [...counts].map(([id, hits]) => id + ' ' + (hits / 12600 * 100).toFixed(4) + '%').sort()
  assert.equal(createHash('sha256').update(published.join('\n')).digest('hex'),
    '76f9642df6bf598b64a3215cde7b5229d5302d93597499da46092e190a5e31a9')
  for (const [id, count] of counts) {
    const character = characters.get(id)
    assert.ok(character.nameCn && existsSync(new URL('../public/' + character.avatar, import.meta.url)), id)
    assert.ok(existsSync(new URL('../public/recruitment/result/portraits/' + id + '.webp', import.meta.url)), character.nameCn)
    assert.notEqual(character.corporation, 'ABNORMAL')
    assert.equal(character.chinaExclusive, false)
    assert.equal(count, id === QUEEN ? 126 : { SSR: 3, SR: 602, R: 742 }[character.original_rare], character.nameCn)
  }
  for (const id of ['14','234','515','820','193','351','392','441','400','261','473','472','530']) assert.equal(counts.has(id), false, id)
  for (const id of ['404','405','63','220','16','74']) assert.ok(counts.has(id), id)
})

test('十连逐抽统计，付费积分在 200 抽时可兑换一次', () => {
  const values = [0, .015, .025, .039, .04, .25, .46, .47, .5, .99]
  const batch = recruit(emptyRecord(), 'ten', day, () => values.shift())
  assert.equal(batch.results.length, 10)
  assert.equal(batch.record.ssr, 4)
  assert.equal(batch.record.featured, 1)
  assert.equal(mileage(batch.record), 10)
  let record = emptyRecord()
  for (let i = 0; i < 20; i++) {
    assert.throws(() => recruit(record, 'exchange', day), /200/)
    record = recruit(record, 'ten', day, () => .8).record
  }
  assert.equal(record.ssr, 0)
  const exchange = recruit(record, 'exchange', day)
  assert.deepEqual(exchange.results, [QUEEN])
  assert.deepEqual(exchange.record, { ...record, redeemed: 1, copies: { ...record.copies, [QUEEN]: 1 } })
  assert.equal(mileage(exchange.record), 0)
  assert.throws(() => recruit(exchange.record, 'exchange', day), /200/)
})

test('结算按本地模拟获得顺序标记新角色、备用躯体及躯体标签', () => {
  const draws = [.8,.8,.20,.20,.20,.20,0,0,0,0]
  const ten = recruit(emptyRecord(), 'ten', day, () => draws.shift())
  assert.deepEqual(ten.rewards, ['new',150,'new','body','body',200,'new','body','body','body'])
  const restored = readRecord({ getItem: () => JSON.stringify(ten.record) })
  let batch = { record: restored }
  for (let i = 0; i < 7; i++) {
    batch = recruit(batch.record, 'one', day, () => 0)
    assert.deepEqual(batch.rewards, ['body'])
  }
  assert.deepEqual(recruit(batch.record, 'one', day, () => 0).rewards, [6000])
})

test('旧记录只按可确认的持有情况展示奖励', () => {
  const old = { pulls: 10, free: 0, ssr: 1, featured: 1, redeemed: 0, lastFreeDay: '' }
  const restored = readRecord({ getItem: () => JSON.stringify(old) })
  const draws = [.8,.8,0,.2,.2,.2,.2,.2,.2,.2]
  const ten = recruit(restored, 'ten', day, () => draws.shift())
  assert.deepEqual(ten.rewards, [null,150,'body',null,null,null,200,200,200,200])
  assert.equal(ten.record.pulls, 20)
})

test('特别池的逐人抽获包含免费抽，兑换女王与历史未归属次数分开计数', () => {
  const old = { pulls: 201, free: 1, ssr: 5, featured: 2, redeemed: 1, lastFreeDay: day }
  const legacy = readRecord({ getItem: () => JSON.stringify(old) })
  assert.deepEqual(summarizeRecruitSSR(legacy), { total: 5, rows: [{ id: QUEEN, count: 2 }], unattributed: 3 })
  const next = recruit(legacy, 'one', day, () => .01).record
  assert.deepEqual(summarizeRecruitSSR(next), {
    total: 6, rows: [{ id: QUEEN, count: 2 }, { id: '220', count: 1 }], unattributed: 3,
  })
  const first = recruit(emptyRecord(), 'free', day, () => 0).record
  assert.deepEqual(summarizeRecruitSSR(first), { total: 1, rows: [{ id: QUEEN, count: 1 }], unattributed: 0 })
  const impossible = { ...first, copies: { 220: 1 }, ssr: 0, featured: 0 }
  assert.throws(() => readRecord({ getItem: () => JSON.stringify(impossible) }), /抽获记录/)
})

test('免费招募按北京时间四点跨日，记录可读回且不给券', () => {
  const before = recruitDay(Date.parse('2026-10-30T03:59:59.999+08:00'))
  const after = recruitDay(Date.parse('2026-10-30T04:00:00+08:00'))
  assert.equal(before, day)
  assert.equal(after, '2026-10-30')
  const { record } = recruit(emptyRecord(), 'free', before, () => 0)
  const restored = readRecord({ getItem: () => JSON.stringify(record) })
  assert.throws(() => recruit(restored, 'free', before), /已使用/)
  const next = recruit(restored, 'free', after, () => .03).record
  assert.equal(next.free, 2)
  assert.equal(next.ssr, 2)
  assert.equal(mileage(next), 0)
  assert.throws(() => readRecord({ getItem: () => '{' }))
})

test('思凯和红莲各自 145 名精确抽取区间按同期公示逐人校验', () => {
  const expected = [
    [specialRecruitBanners.sky, '6557d00528c62120129f06f654d7ba90ae432238554ce810d80ce690e03ff759'],
    [specialRecruitBanners.scarlet, '3b1a33a4c8d075b20e5b627f38f56efa78121083df85e03b858333e7957de37f'],
  ]
  for (const [banner, hash] of expected) {
    const counts = new Map()
    for (let i = 0; i < 63000; i++) {
      const id = drawRecruit(() => (i + .5) / 63000, banner.pools)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    assert.equal(counts.size, 145)
    const published = [...counts].map(([id, n]) => id + ' ' + (n / 63000 * 100).toFixed(4) + '%').sort()
    assert.equal(createHash('sha256').update(published.join('\n')).digest('hex'), hash)
  }
})

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('三期共用黄金券，跨池兑换与付费/免费招募分别计数，恢复旧档时只计一次', () => {
  const storage = memoryStorage()
  const { marian, sky, scarlet } = specialRecruitBanners
  const old = { pulls: 391, free: 1, redeemed: 1, ssr: 9, featured: 3, lastFreeDay: day }
  storage.setItem(marian.key, JSON.stringify(old))
  assert.equal(readSpecialSimulation(storage, sky).tickets, 190)
  assert.equal(readSpecialSimulation(storage, marian).record.vouchersSpent, 0)
  assert.throws(() => commitSpecialRecruit(storage, sky, 'free', day), /免费/)
  const ten = commitSpecialRecruit(storage, sky, 'ten', day, { random: () => 0, currency: 'vouchers' })
  assert.deepEqual(ten.results, Array(10).fill('530'))
  assert.equal(ten.record.vouchersSpent, 10)
  assert.equal(ten.tickets, 200)
  const exchange = commitSpecialRecruit(storage, scarlet, 'exchange', day)
  assert.equal(exchange.tickets, 0)
  assert.deepEqual(exchange.results, ['472'])
  assert.deepEqual(exchange.rewards, ['new'])
  assert.equal(exchange.record.pulls, 0)
  assert.equal(exchange.record.redeemed, 1)
  assert.equal(exchange.record.ssr, 0)
  assert.deepEqual(summarizeRecruitSSR(exchange.record, scarlet).rows, [])
  const free = commitSpecialRecruit(storage, scarlet, 'free', day, { random: () => 0 })
  assert.equal(free.tickets, 0)
  assert.equal(free.record.free, 1)
  assert.equal(free.record.pulls - free.record.free, 0)
  assert.deepEqual(free.rewards, ['body'])
  assert.deepEqual(summarizeRecruitSSR(free.record, scarlet).rows, [{ id:'472', count:1 }])
  assert.throws(() => commitSpecialRecruit(storage, scarlet, 'free', day), /已使用/)
  assert.throws(() => commitSpecialRecruit(storage, sky, 'exchange', day), /200/)
  assert.deepEqual(readSpecialSimulation(storage, sky), { record: ten.record, tickets: 0 })
  assert.deepEqual(summarizeRecruitSSR(ten.record, sky).rows, [{ id:'530', count:10 }])
  assert.equal(readSpecialSimulation(storage, marian).record.pulls, old.pulls)
  assert.equal(sky.hasRecruitBenefits, false)
  assert.equal(scarlet.hasRecruitBenefits, true)
})

test('清空任一特别池只清该池统计，三池金票收支在重开、再次清空和存储写入失败后仍一致', () => {
  const storage = memoryStorage()
  const { marian, scarlet, sky } = specialRecruitBanners
  for (let i = 0; i < 21; i++) commitSpecialRecruit(storage, marian, 'ten', day, { random: () => .3 })
  commitSpecialRecruit(storage, scarlet, 'exchange', day)
  const clear = resetSpecialRecruit(storage, marian)
  assert.equal(clear.tickets, 10)
  assert.equal(clear.record.pulls, 0)
  assert.deepEqual(clear.record.copies, {})
  assert.equal(readSpecialSimulation(storage, scarlet).record.redeemed, 1)
  assert.equal(resetSpecialRecruit(storage, scarlet).tickets, 10)
  assert.equal(resetSpecialRecruit(storage, marian).tickets, 10)
  assert.throws(() => commitSpecialRecruit(storage, scarlet, 'exchange', day), /200/)
  const failed = { ...storage, setItem: () => { throw Error('quota') } }
  assert.throws(() => commitSpecialRecruit(failed, sky, 'one', day), /quota/)
  assert.throws(() => resetSpecialRecruit(failed, marian), /quota/)
  const reopened = readSpecialSimulation(storage, sky)
  assert.equal(reopened.tickets, 10)
  assert.equal(reopened.record.pulls, 0)
  assert.equal(commitSpecialRecruit(storage, sky, 'one', day).tickets, 11)
  storage.setItem(scarlet.key, JSON.stringify({ ...emptyRecord(), carriedGold: -1000 }))
  assert.throws(() => commitSpecialRecruit(storage, sky, 'exchange', day), /收支记录不符/)
})

test('重置不补发已使用的日免，两周年池独立并于北京时间四点刷新', () => {
  const storage = memoryStorage()
  const { marian, scarlet } = specialRecruitBanners
  const before = recruitDay(Date.parse('2026-11-06T03:59:59.999+08:00'))
  const after = recruitDay(Date.parse('2026-11-06T04:00:00+08:00'))
  commitSpecialRecruit(storage, marian, 'free', before)
  const { record } = resetSpecialRecruit(storage, marian)
  assert.equal(record.pulls, 0)
  assert.equal(record.free, 0)
  assert.equal(readSpecialSimulation(storage, marian).record.lastFreeDay, before)
  assert.throws(() => commitSpecialRecruit(storage, marian, 'free', before), /已使用/)
  assert.equal(commitSpecialRecruit(storage, scarlet, 'free', before).record.free, 1)
  assert.equal(commitSpecialRecruit(storage, marian, 'free', after).record.free, 1)
})

test('损坏的记录指明卡池，跨池抽取、兑换和重置均保留原始存储', () => {
  const { marian, sky, scarlet } = specialRecruitBanners
  const storage = memoryStorage()
  for (let i = 0; i < 20; i++) commitSpecialRecruit(storage, marian, 'ten', day)
  const before = storage.getItem(marian.key)
  for (const broken of ['{', JSON.stringify({ ...emptyRecord(), vouchersSpent: -1 })]) {
    storage.setItem(sky.key, broken)
    const problem = /思凯.*备份/
    assert.throws(() => readSpecialSimulation(storage, marian), problem)
    assert.throws(() => commitSpecialRecruit(storage, scarlet, 'exchange', day), problem)
    assert.throws(() => commitSpecialRecruit(storage, marian, 'one', day), problem)
    assert.throws(() => resetSpecialRecruit(storage, marian), problem)
    assert.throws(() => resetSpecialRecruit(storage, sky), problem)
    assert.equal(storage.getItem(marian.key), before)
    assert.equal(storage.getItem(sky.key), broken)
    assert.equal(storage.getItem(scarlet.key), null)
  }
})
