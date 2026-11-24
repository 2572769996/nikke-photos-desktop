import test from 'node:test'
import assert from 'node:assert/strict'
import preset from '../src/data/collab-preset.json' with { type: 'json' }
import { resetAllRecruitment } from '../src/lib/resetRecruitment.js'
import { commitSpecialRecruit, emptyRecord, readSpecialSimulation, specialRecruitBanners } from '../src/lib/recruitment.js'
import { COLLAB_KEY, readCollabSimulation } from '../src/lib/collabRecruitment.js'
import { bonusPoints, emptyOrdinaryRecord, ORDINARY_KEY, ordinaryRecruit, ordinaryWishlistGroups, readOrdinaryRecord } from '../src/lib/ordinaryRecruitment.js'

const day = '2026-11-25'
const wishlist = Object.fromEntries(ordinaryWishlistGroups.map(({ id, members }) => [id, members.slice(0, 5)]))
const { marian, sky, scarlet } = specialRecruitBanners
function store() {
  const entries = new Map()
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }
}

test('全局重置清除五池收支、持有、积分与当日资格，保留合法配置和非招募记录', () => {
  const storage = store()
  storage.setItem('nikke-photos/sound', 'on')
  storage.setItem('nikke-photos/recruitment/unrelated', 'untouched')
  storage.setItem(marian.key, JSON.stringify({ pulls: 201, free: 1, ssr: 2, featured: 1, redeemed: 0, lastFreeDay: day }))
  commitSpecialRecruit(storage, sky, 'exchange', day)
  commitSpecialRecruit(storage, scarlet, 'free', day)
  const selectedId = preset.memberIds[0] ?? ''
  storage.setItem(COLLAB_KEY, JSON.stringify({ ...emptyRecord(), selectedId, memberIds: [], pulls: 2, vouchersSpent: 1, copies: { 300: 2 }, ssrDraws: {} }))
  let ordinary = { ...emptyOrdinaryRecord(), wishlist }
  for (let i = 0; i < 10; i++) ordinary = ordinaryRecruit(ordinary, 'ten', day, { currency: 'vouchers', random: () => .8 }).record
  ordinary = ordinaryRecruit(ordinary, 'bonus', day, { bonusId: '82' }).record
  ordinary = ordinaryRecruit(ordinary, 'discount', day).record
  storage.setItem(ORDINARY_KEY, JSON.stringify(ordinary))
  assert.equal(readCollabSimulation(storage).tickets, 2)
  assert.equal(bonusPoints(readOrdinaryRecord(storage)), 1)

  resetAllRecruitment(storage)
  for (const banner of [marian, sky, scarlet]) assert.deepEqual(readSpecialSimulation(storage, banner), { record: emptyRecord(), tickets: 0 })
  assert.deepEqual(readCollabSimulation(storage), { record: { ...emptyRecord(), selectedId, ssrDraws: {} }, tickets: 0 })
  assert.deepEqual(readOrdinaryRecord(storage), { ...emptyOrdinaryRecord(), wishlist })
  assert.equal(ordinaryRecruit(readOrdinaryRecord(storage), 'discount', day).record.gemsSpent, 150)
  for (const banner of [marian, scarlet]) assert.equal(commitSpecialRecruit(storage, banner, 'free', day).record.free, 1)
  assert.equal(storage.getItem('nikke-photos/sound'), 'on')
  assert.equal(storage.getItem('nikke-photos/recruitment/unrelated'), 'untouched')
})

test('五池重置中断后，从常驻或特殊池进入均完成同一轮重置，不会用半清空的余额结算', () => {
  for (const read of [readOrdinaryRecord, storage => readSpecialSimulation(storage, sky)]) {
    const storage = store()
    storage.setItem(marian.key, JSON.stringify({ ...emptyRecord(), carriedGold: 50 }))
    storage.setItem(sky.key, JSON.stringify({ ...emptyRecord(), carriedGold: -10 }))
    const partial = { ...wishlist, pilgrim: [] }
    storage.setItem(ORDINARY_KEY, JSON.stringify({ ...emptyOrdinaryRecord(), wishlist: partial }))
    const blocked = { ...storage, removeItem(key) {
      if (key === sky.key) throw Error('storage unavailable')
      storage.removeItem(key)
    } }
    assert.throws(() => resetAllRecruitment(blocked), /storage unavailable/)
    assert.throws(() => read(blocked), /storage unavailable/)
    read(storage)
    assert.equal(readSpecialSimulation(storage, sky).tickets, 0)
    assert.deepEqual(readOrdinaryRecord(storage).wishlist, partial)
    assert.throws(() => ordinaryRecruit(readOrdinaryRecord(storage), 'one', day), /愿望清单/)
    commitSpecialRecruit(storage, sky, 'one', day)
    assert.equal(readCollabSimulation(storage).tickets, 1)
  }
})

test('确认全局重置可恢复损坏的旧记录，已移出联动 UP 也清空', () => {
  const storage = store()
  storage.setItem(sky.key, '{')
  storage.setItem(COLLAB_KEY, JSON.stringify({ selectedId: 'invalid', memberIds: ['invalid'] }))
  storage.setItem(ORDINARY_KEY, JSON.stringify({ wishlist: { ...wishlist, elysion: ['invalid'] } }))
  resetAllRecruitment(storage)
  assert.deepEqual(readOrdinaryRecord(storage), emptyOrdinaryRecord())
  assert.deepEqual(readCollabSimulation(storage), { record: { ...emptyRecord(), selectedId: '', ssrDraws: {} }, tickets: 0 })
})
