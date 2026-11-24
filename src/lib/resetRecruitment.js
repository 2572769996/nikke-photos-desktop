import { emptyOrdinaryRecord, ORDINARY_KEY, readOrdinaryWishlist } from './ordinaryRecruitment.js'
import { emptyRecord } from './recruitment.js'
import { COLLAB_KEY, isOfferedCollabRecruit } from './collabRecruitment.js'
import { commitRecruitmentReset } from './recruitmentStorage.js'

function savedPreferences(storage, key) {
  const raw = storage.getItem(key)
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export function resetAllRecruitment(storage) {
  const wishlist = savedPreferences(storage, ORDINARY_KEY)?.wishlist
  let ordinary = null
  if (wishlist) {
    try {
      ordinary = { ...emptyOrdinaryRecord(), wishlist: readOrdinaryWishlist(wishlist) }
    } catch (error) {
      // 已确认重置的损坏档可能包含过期或非法的愿望单，重新从空清单开始。
      if (!(error instanceof RangeError)) throw error
    }
  }
  const selectedId = savedPreferences(storage, COLLAB_KEY)?.selectedId
  const collab = isOfferedCollabRecruit(selectedId) ? { ...emptyRecord(), selectedId, ssrDraws: {} } : null
  commitRecruitmentReset(storage, ordinary, collab)
}
