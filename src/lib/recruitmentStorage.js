const prefix = 'nikke-photos/recruitment/'
export const recruitmentKeys = {
  marian: prefix + 'marian-queen/v1', sky: prefix + 'sky/v1', scarlet: prefix + 'scarlet-goddeath/v1',
  ordinary: prefix + 'ordinary/v1', collab: prefix + 'collab/v1',
}
const resetKey = prefix + 'pending-reset/v1'

export function resumeRecruitmentReset(storage) {
  const raw = storage.getItem(resetKey)
  if (raw === null) return
  const records = JSON.parse(raw)
  if (!Object.hasOwn(records, 'ordinary') || !Object.hasOwn(records, 'collab')) throw Error('招募重置记录无法读取')
  for (const [pool, key] of Object.entries(recruitmentKeys)) {
    const record = records[pool]
    if (record) storage.setItem(key, JSON.stringify(record))
    else storage.removeItem(key)
  }
  storage.removeItem(resetKey)
}

export function commitRecruitmentReset(storage, ordinary, collab) {
  // 先提交两份已清零且带偏好的目标记录。中断后，读任何卡池都会完成这次重置。
  storage.setItem(resetKey, JSON.stringify({ ordinary, collab }))
  resumeRecruitmentReset(storage)
}
