import { collabBanner, collabSsrIds } from '../data/collabRecruitGroups.js'
import { recruitmentKeys, resumeRecruitmentReset } from './recruitmentStorage.js'

export const RECRUIT_KEY = recruitmentKeys.marian
export const QUEEN = '19'
export const SKY = '530'
export const SCARLET_GODDEATH = '472'
// 三期特殊招募的非 UP 名单与 11/19 常驻名单对照各自专栏逐人相同。
export const pilgrimAndOverSpec = [
  '220 221 222 223 225 230 231 232 233 260 262 330 470 471 511 513 514', // 朝圣者
  '16 17 18 162', // 超规格
].flatMap(group => group.split(' '))
export const standardSsrByManufacturer = {
  elysion: '22 23 30 32 33 40 41 43 70 71 72 74 90 91 92 93 94 95 113 170 180 181 313 321 350 352 354 355 390 532 580 581 582 583'.split(' '),
  missilis: '80 82 100 101 102 103 104 105 110 111 131 150 160 172 192 241 290 391 403 404 405 411 412 450 451 500 501 620'.split(' '),
  tetra: '63 112 130 140 141 142 143 171 190 191 195 200 201 202 210 212 240 242 270 271 272 280 281 282 310 311 312 314 315 316 380 381 382 430 431 432 520 521 550 551 570 600 601'.split(' '),
}
const standardSSR = Object.values(standardSsrByManufacturer).flat()
export const SR = ['10', '11', '12', '20', '60', '61', '120', '161', '291']
export const R = ['300', '301', '302', '303', '304', '305', '306', '307', '308']
export function pickupPools(featuredId, featuredRate, standardRate) {
  return [
    { label: 'SSR · 当期 UP', percent: featuredRate, members: [featuredId] },
    { label: '非 UP 朝圣者／超规格', percent: 0.5, members: pilgrimAndOverSpec },
    { label: '普通 SSR', percent: standardRate, members: standardSSR },
    { label: 'SR', percent: 43, members: SR },
    { label: 'R', percent: 53, members: R },
  ]
}
const anniversaryRates = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHwNzbGkBbJ_HCKbb1OoHjDPYLJhRVuDFKa2t11k1_Ruz6sWmQ0WFWkk7sppE_uwPlJDYcQAJc_Xd7/pubhtml#gid=647451479'
const anniversaryNotice = 'https://nikke.hotcool.tw/News_detail-237'
export const marianQueenPools = pickupPools(QUEEN, 1, 2.5)
export const specialRecruitBanners = {
  marian: {
    id: 'marian', key: RECRUIT_KEY, name: '玛丽安：女王', featuredId: QUEEN, pools: marianQueenPools,
    dailyFree: true, hasRecruitBenefits: true, ratesUrl: anniversaryRates, noticeUrl: anniversaryNotice,
  },
  sky: {
    id: 'sky', key: recruitmentKeys.sky, name: '思凯', featuredId: SKY, pools: pickupPools(SKY, 2, 1.5),
    dailyFree: false, hasRecruitBenefits: false, noticeUrl: 'https://nikke.hotcool.tw/m/News_detail-246',
    ratesUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQdVV_dKg7lTl9KkIIU4ZylWgE4qq8WzDHnMC9ljzbiIsZwY6vnqZa2PkAIeDUiTO8du4CqTv9KufYE/pubhtml#gid=647451479',
  },
  scarlet: {
    id: 'scarlet', key: recruitmentKeys.scarlet, name: '红莲：弑神', featuredId: SCARLET_GODDEATH,
    pools: pickupPools(SCARLET_GODDEATH, 1, 2.5), dailyFree: true, hasRecruitBenefits: true,
    ratesUrl: anniversaryRates, noticeUrl: anniversaryNotice,
  },
}
const offBannerIds = new Set([...pilgrimAndOverSpec, ...standardSSR, ...SR, ...R])
const ssrIds = new Set([QUEEN, ...pilgrimAndOverSpec, ...standardSSR, SKY, SCARLET_GODDEATH, ...collabSsrIds])
export const isRecruitSSR = id => ssrIds.has(id)
const duplicateRewards = new Map([
  ...[...ssrIds].map(id => [id, { maxCopies: 11, labels: 6000 }]),
  ...SR.map(id => [id, { maxCopies: 3, labels: 200 }]),
  ...R.map(id => [id, { maxCopies: 1, labels: 150 }]),
])
const totalCopies = copies => Object.values(copies).reduce((sum, count) => sum + count, 0)

export function drawRecruit(random = Math.random, pools = marianQueenPools) {
  let point = random() * 100
  for (const { percent, members } of pools) {
    if (point < percent) return members[Math.floor(point / percent * members.length)]
    point -= percent
  }
}

export function recruitDay(time = Date.now()) {
  // 国际服每日重置时间为北京时间 04:00。
  return new Date(time + 4 * 3600000).toISOString().slice(0, 10)
}

export const emptyRecord = () => ({
  pulls: 0, free: 0, ssr: 0, featured: 0, redeemed: 0, vouchersSpent: 0, carriedGold: 0, lastFreeDay: '', copies: {},
})
// 每池可为负值，例如用另外两池赚到的金票在本池兑换。
export const mileage = record => (record.carriedGold ?? 0) + record.pulls - record.free - 200 * record.redeemed

export function summarizeRecruitSSR(record, banner = specialRecruitBanners.marian) {
  const counts = record.ssrDraws ?? { ...record.copies, [banner.featuredId]: record.featured }
  const rows = Object.entries(counts)
    .filter(([id, count]) => isRecruitSSR(id) && count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || Number(a.id) - Number(b.id))
  const known = rows.reduce((sum, row) => sum + row.count, 0)
  return { total: record.ssr, rows, unattributed: record.ssr - known }
}

export function readRecord(storage, banner = specialRecruitBanners.marian) {
  const raw = storage.getItem(banner.key)
  const collab = banner.id === collabBanner.id
  if (raw === null) return collab
    ? { ...emptyRecord(), selectedId: '', ssrDraws: {} } : emptyRecord()
  const record = JSON.parse(raw)
  const valid = record && ['pulls', 'free', 'ssr', 'featured', 'redeemed'].every(
    key => Number.isSafeInteger(record[key]) && record[key] >= 0)
  if (!valid || typeof record.lastFreeDay !== 'string' || (record.free > 0 && !record.lastFreeDay)
    || (record.lastFreeDay && (!banner.dailyFree || !/^\d{4}-\d{2}-\d{2}$/.test(record.lastFreeDay)))
    || record.free > record.pulls || record.featured > record.ssr || record.ssr > record.pulls) {
    throw new Error('招募模拟记录无法读取')
  }
  const legacy = banner.id === 'marian' && record.vouchersSpent === undefined && record.carriedGold === undefined
  if (legacy) {
    record.vouchersSpent = 0
    record.carriedGold = 0
  }
  if (!Number.isSafeInteger(record.carriedGold) || !Number.isSafeInteger(record.vouchersSpent)
    || record.vouchersSpent < 0 || record.vouchersSpent > record.pulls - record.free) throw new Error('招募收支记录无法读取')
  const featuredId = banner.featuredId
  const featuredCopies = record.featured + record.redeemed
  if (legacy && record.copies === undefined) {
    // 旧记录只保存过 UP 角色的总数。
    record.copies = featuredCopies ? { [featuredId]: featuredCopies } : {}
  } else if (!record.copies || typeof record.copies !== 'object' || Array.isArray(record.copies)
    || Object.entries(record.copies).some(([id, count]) => (!offBannerIds.has(id) && !(collab ? collabSsrIds.has(id) : id === featuredId))
      || !Number.isSafeInteger(count) || count < 1)
    || (!collab && (record.copies[featuredId] ?? 0) !== featuredCopies)
    || totalCopies(record.copies) > record.pulls + record.redeemed) {
    throw new Error('模拟角色持有记录无法读取')
  }
  if (collab) {
    if (typeof record.selectedId !== 'string') throw new Error('联动 UP 记录无法读取')
    const { copies, ssrDraws } = record
    if (!ssrDraws || typeof ssrDraws !== 'object' || Array.isArray(ssrDraws)
      || Object.entries(ssrDraws).some(([id, count]) => !isRecruitSSR(id) || !Number.isSafeInteger(count)
        || count < 1 || count > (copies[id] ?? 0))
      || Object.entries(copies).some(([id, count]) => isRecruitSSR(id) && !collabSsrIds.has(id) && ssrDraws[id] !== count)
      || totalCopies(ssrDraws) !== record.ssr || totalCopies(copies) !== record.pulls + record.redeemed) {
      throw new Error('联动角色抽获或兑换记录无法读取')
    }
    let drewUp = 0, ownedUp = 0
    for (const id of collabSsrIds) {
      drewUp += ssrDraws[id] ?? 0
      ownedUp += copies[id] ?? 0
    }
    if (drewUp !== record.featured || ownedUp !== featuredCopies) throw new Error('联动 UP 记录与持有角色数量不符')
    return record
  }
  const { unattributed } = summarizeRecruitSSR(record, banner)
  if (unattributed < 0 || unattributed > record.pulls + record.redeemed - totalCopies(record.copies)) {
    throw new Error('招募 SSR 抽获记录与持有角色数量不符')
  }
  return record
}

export function settleRecruitCopies(current, results, knowsPrior = () => true) {
  const copies = { ...current }
  const rewards = results.map(id => {
    const prior = copies[id] ?? 0
    copies[id] = prior + 1
    const { maxCopies, labels } = duplicateRewards.get(id)
    if (prior >= maxCopies) return labels
    if (!knowsPrior(id)) return null
    return prior === 0 ? 'new' : 'body'
  })
  return { copies, rewards }
}

export function recruit(record, kind, day, random = Math.random, {
  banner = specialRecruitBanners.marian, tickets = mileage(record), currency = 'gems',
} = {}) {
  const exchange = kind === 'exchange'
  if (exchange && tickets < 200) throw new Error('兑换需要 200 张黄金积分券')
  const free = kind === 'free'
  if (free && !banner.dailyFree) throw new Error('此卡池没有每日免费招募')
  if (free && record.lastFreeDay === day) throw new Error('本日免费招募已使用')
  const count = kind === 'ten' ? 10 : 1
  const results = exchange ? [banner.featuredId] : Array.from({ length: count }, () => drawRecruit(random, banner.pools))
  const complete = totalCopies(record.copies) === record.pulls + record.redeemed
  const { copies, rewards } = settleRecruitCopies(record.copies, results, id => complete || id === banner.featuredId)
  if (exchange) return { record: { ...record, copies, redeemed: record.redeemed + 1 }, results, rewards }
  return {
    record: {
      ...record, copies, pulls: record.pulls + count, free: record.free + Number(free),
      ssr: record.ssr + results.filter(isRecruitSSR).length,
      featured: record.featured + results.filter(id => id === banner.featuredId).length,
      vouchersSpent: record.vouchersSpent + (!free && currency === 'vouchers' ? count : 0),
      lastFreeDay: free ? day : record.lastFreeDay,
    },
    results, rewards,
  }
}

export function readSpecialSimulation(storage, banner) {
  resumeRecruitmentReset(storage)
  const records = {}
  for (const item of [...Object.values(specialRecruitBanners), collabBanner]) {
    try {
      records[item.id] = readRecord(storage, item)
    } catch (cause) {
      throw new Error('「' + item.name + '」池的记录读取失败，无法核对共用金票。请检查本地存储。若记录损坏，请从与其他池一致的备份恢复该池记录。', { cause })
    }
  }
  const tickets = Object.values(records).reduce((sum, record) => sum + mileage(record), 0)
  if (!Number.isSafeInteger(tickets) || tickets < 0) {
    throw new Error('共用黄金积分券收支记录不符，无法判定哪一池缺失流水。请从同一时间点的备份恢复所有共用金票池的记录。')
  }
  return { record: records[banner.id], tickets }
}

export function commitSpecialRecruit(storage, banner, kind, day, { currency = 'gems', random = Math.random } = {}) {
  const { record, tickets } = readSpecialSimulation(storage, banner)
  const next = recruit(record, kind, day, random, { banner, tickets, currency })
  return persistRecruitResult(storage, banner.key, record, tickets, next)
}

export function persistRecruitResult(storage, key, previous, tickets, next) {
  storage.setItem(key, JSON.stringify(next.record))
  return { ...next, tickets: tickets + mileage(next.record) - mileage(previous) }
}

export function resetSpecialRecruit(storage, banner) {
  const { record, tickets } = readSpecialSimulation(storage, banner)
  const cleared = { ...emptyRecord(), carriedGold: mileage(record), lastFreeDay: record.lastFreeDay }
  storage.setItem(banner.key, JSON.stringify(cleared))
  return { record: cleared, tickets }
}

