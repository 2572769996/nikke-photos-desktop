import {
  drawRecruit, isRecruitSSR, pilgrimAndOverSpec, QUEEN, R, SCARLET_GODDEATH, settleRecruitCopies, SKY, SR,
  standardSsrByManufacturer,
} from './recruitment.js'
import { recruitmentKeys, resumeRecruitmentReset } from './recruitmentStorage.js'

export const ORDINARY_KEY = recruitmentKeys.ordinary
export const bonusChoices = ['82', '450', '191', '451', '352']
// 保留 11/19 逐人公示基准；桌面模拟在下方愿望清单追加三名角色。
export const publishedOrdinaryPools = [
  { label: '朝圣者／超规格 SSR', percent: 0.5, members: pilgrimAndOverSpec },
  { label: '普通 SSR', percent: 3.5, members: Object.values(standardSsrByManufacturer).flat() },
  { label: 'SR', percent: 43, members: SR },
  { label: 'R', percent: 53, members: R },
]
export const ordinaryWishlistGroups = [
  { id: 'elysion', label: '极乐净土', members: [...standardSsrByManufacturer.elysion, SKY] },
  { id: 'missilis', label: '米西利斯', members: standardSsrByManufacturer.missilis },
  { id: 'tetra', label: '泰特拉', members: standardSsrByManufacturer.tetra },
  { id: 'pilgrim', label: '朝圣者／超规格', members: [...pilgrimAndOverSpec, QUEEN, SCARLET_GODDEATH] },
]
const ordinaryIds = new Set([...ordinaryWishlistGroups.flatMap(group => group.members), ...SR, ...R])

export const emptyOrdinaryRecord = () => ({
  pulls: 0, ssr: 0, gemsSpent: 0, vouchersSpent: 0, discounts: 0, lastDiscountDay: '',
  bonusClaims: 0, copies: {}, ssrDraws: {}, wishlist: { elysion: [], missilis: [], tetra: [], pilgrim: [] },
})

// 上限按本期累计获得的积分计算，兑换后不能重新积满 1,000 分。
export const bonusPoints = record => Math.min(1000, record.pulls) - 100 * record.bonusClaims
export const isWishlistActive = record => ordinaryWishlistGroups.every(({ id }) => record.wishlist[id].length === 5)

export function readOrdinaryWishlist(wishlist) {
  return Object.fromEntries(ordinaryWishlistGroups.map(({ id, label, members }) => {
    const selection = wishlist?.[id]
    if (!Array.isArray(selection) || selection.length > 5 || new Set(selection).size !== selection.length
      || selection.some(member => !members.includes(member))) {
      throw new RangeError(label + '愿望清单需选择至多 5 名不同的本组角色')
    }
    return [id, [...selection]]
  }))
}

export function setOrdinaryWishlist(record, wishlist) {
  const next = { ...record, wishlist: readOrdinaryWishlist(wishlist) }
  if (!isWishlistActive(next)) throw new RangeError('愿望清单的四组角色须各选满 5 名才能保存')
  return next
}

export function ordinaryPools(record) {
  if (!isWishlistActive(record)) return []
  const { elysion, missilis, tetra, pilgrim } = record.wishlist
  const [special, standard, sr, r] = publishedOrdinaryPools
  return [
    { ...special, members: pilgrim }, { ...standard, members: [...elysion, ...missilis, ...tetra] }, sr, r,
  ]
}

export function readOrdinaryRecord(storage) {
  resumeRecruitmentReset(storage)
  const raw = storage.getItem(ORDINARY_KEY)
  if (raw === null) return emptyOrdinaryRecord()
  const record = JSON.parse(raw)
  if (!record || !['pulls', 'ssr', 'gemsSpent', 'vouchersSpent', 'discounts', 'bonusClaims']
    .every(key => Number.isSafeInteger(record[key]) && record[key] >= 0)
    || record.discounts + record.vouchersSpent > record.pulls || bonusPoints(record) < 0
    || record.gemsSpent !== 300 * (record.pulls - record.vouchersSpent) - 150 * record.discounts
    || typeof record.lastDiscountDay !== 'string'
    || (record.discounts ? !/^\d{4}-\d{2}-\d{2}$/.test(record.lastDiscountDay) : record.lastDiscountDay !== '')) {
    throw new Error('普通招募记录无法读取')
  }
  record.wishlist = readOrdinaryWishlist(record.wishlist)
  if (!record.copies || typeof record.copies !== 'object' || Array.isArray(record.copies)) {
    throw new Error('模拟角色持有记录无法读取')
  }
  let total = 0
  let ssr = 0
  for (const [id, count] of Object.entries(record.copies)) {
    if (!ordinaryIds.has(id) || !Number.isSafeInteger(count) || count < 1) throw new Error('模拟角色持有记录无法读取')
    total += count
    if (isRecruitSSR(id)) ssr += count
  }
  const exchangeableCopies = bonusChoices.reduce((sum, id) => sum + (record.copies[id] ?? 0), 0)
  if (total !== record.pulls + record.bonusClaims || ssr !== record.ssr + record.bonusClaims
    || exchangeableCopies < record.bonusClaims) {
    throw new Error('普通招募记录与持有角色数量不符')
  }
  if (record.ssrDraws === undefined) {
    // 旧版只记兑换总数。每位可兑角色超出该总数的持有量一定来自招募。
    record.ssrDraws = {}
    for (const [id, count] of Object.entries(record.copies)) {
      const known = bonusChoices.includes(id) ? count - record.bonusClaims : count
      if (known > 0 && isRecruitSSR(id)) record.ssrDraws[id] = known
    }
  } else if (!record.ssrDraws || typeof record.ssrDraws !== 'object' || Array.isArray(record.ssrDraws)
    || Object.entries(record.ssrDraws).some(([id, count]) => !isRecruitSSR(id) || !Number.isSafeInteger(count)
      || count < 1 || count > (record.copies[id] ?? 0))
    || Object.values(record.ssrDraws).reduce((sum, count) => sum + count, 0) > record.ssr) {
    throw new Error('普通招募 SSR 抽获记录无法读取')
  }
  return record
}

export function ordinaryRecruit(record, kind, day, { currency = 'gems', random = Math.random, bonusId } = {}) {
  if (kind === 'bonus') {
    if (bonusPoints(record) < 100) throw new Error('追加招募需要 100 兑换积分')
    if (!bonusChoices.includes(bonusId)) throw new Error('请选择本期追加招募中的角色')
    const results = [bonusId]
    const { copies, rewards } = settleRecruitCopies(record.copies, results)
    return { record: { ...record, copies, bonusClaims: record.bonusClaims + 1 }, results, rewards }
  }
  const pools = ordinaryPools(record)
  if (!pools.length) throw new Error('请先在愿望清单中为四组各选择 5 名角色')
  const discount = kind === 'discount'
  if (discount && record.lastDiscountDay === day) throw new Error('本日半价招募已使用')
  const count = kind === 'ten' ? 10 : 1
  const results = Array.from({ length: count }, () => drawRecruit(random, pools))
  const { copies, rewards } = settleRecruitCopies(record.copies, results)
  const vouchers = !discount && currency === 'vouchers' ? count : 0
  const gems = discount ? 150 : (count - vouchers) * 300
  const drawn = results.filter(isRecruitSSR)
  const ssrDraws = { ...record.ssrDraws }
  for (const id of drawn) ssrDraws[id] = (ssrDraws[id] ?? 0) + 1
  return {
    record: {
      ...record, copies, ssrDraws, pulls: record.pulls + count, ssr: record.ssr + drawn.length,
      vouchersSpent: record.vouchersSpent + vouchers, gemsSpent: record.gemsSpent + gems,
      discounts: record.discounts + Number(discount), lastDiscountDay: discount ? day : record.lastDiscountDay,
    },
    results, rewards,
  }
}
