import definition from '../data/cn-roster.json' with { type: 'json' }
// Independent membership; never infer membership from ownership or player records.
const codes = new Set(definition.nameCodes)
export const isCnCharacterAt = (character, now) => {
  const code = String(character?.nameCode)
  const unlockAt = definition.unlockAt?.[code]
  return codes.has(code) && (!unlockAt || now >= Date.parse(unlockAt))
}
export const isCnCharacter = character => isCnCharacterAt(character, Date.now())
export const getCnRosterCount = (now = Date.now()) => definition.nameCodes.filter(nameCode => isCnCharacterAt({ nameCode }, now)).length
export const cnRosterCount = getCnRosterCount()
export const filterRosterScope = (list, scope) => scope === 'cn' ? list.filter(isCnCharacter) : list
