import { collabBanner, collabSsrIds } from '../data/collabRecruitGroups.js'
import preset from '../data/collab-preset.json' with { type: 'json' }
import { emptyRecord, isRecruitSSR, mileage, persistRecruitResult, pickupPools, readSpecialSimulation, recruit } from './recruitment.js'

export { collabGroups } from '../data/collabRecruitGroups.js'
export const COLLAB_KEY = collabBanner.key

export function isOfferedCollabRecruit(id) {
  return preset.memberIds.includes(id) && collabSsrIds.has(id)
}

export function readCollabSimulation(storage) {
  const simulation = readSpecialSimulation(storage, collabBanner)
  const { record, tickets } = simulation
  const selectedId = isOfferedCollabRecruit(record.selectedId) ? record.selectedId : ''
  if (record.selectedId === selectedId && !Object.hasOwn(record, 'memberIds')) return simulation
  // 旧版在玩家存档内保存过群像。只迁移选择，发布预设不会改动历史持有与收支。
  delete record.memberIds
  return storeRecord(storage, { ...record, selectedId }, tickets)
}

export function collabPools(selectedId) {
  if (selectedId === '') return []
  if (!isOfferedCollabRecruit(selectedId)) throw new Error('请从本期发布的联动候选中选择 UP')
  return pickupPools(selectedId, 2, 1.5)
}

function storeRecord(storage, record, tickets) {
  storage.setItem(COLLAB_KEY, JSON.stringify(record))
  return { record, tickets }
}

export function selectCollabRecruit(storage, id) {
  const { record, tickets } = readCollabSimulation(storage)
  if (id !== '' && !isOfferedCollabRecruit(id)) throw new Error('请从本期发布的联动候选中选择 UP')
  return storeRecord(storage, { ...record, selectedId: id }, tickets)
}

export function commitCollabRecruit(storage, kind, { currency = 'gems', random = Math.random } = {}) {
  const { record, tickets } = readCollabSimulation(storage)
  if (!record.selectedId) throw new Error('请先从当前群像中选择一名联动 UP')
  if (!['one', 'ten', 'exchange'].includes(kind)) throw new Error('联动池支持单抽、十连或金票兑换')
  const banner = { ...collabBanner, featuredId: record.selectedId, pools: collabPools(record.selectedId) }
  const next = recruit(record, kind, '', random, { banner, tickets, currency })
  if (kind !== 'exchange') {
    // 多个 UP 共用同一持有记录；单独留下实际抽获，以免切换后把兑换也算入。
    const ssrDraws = { ...record.ssrDraws }
    for (const id of next.results.filter(isRecruitSSR)) ssrDraws[id] = (ssrDraws[id] ?? 0) + 1
    next.record.ssrDraws = ssrDraws
  }
  return persistRecruitResult(storage, COLLAB_KEY, record, tickets, next)
}

export function resetCollabRecruit(storage) {
  const { record, tickets } = readCollabSimulation(storage)
  const cleared = {
    ...emptyRecord(), carriedGold: mileage(record), selectedId: record.selectedId, ssrDraws: {},
  }
  return storeRecord(storage, cleared, tickets)
}
