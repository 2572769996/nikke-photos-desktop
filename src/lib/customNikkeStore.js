import roster from '../data/roster.json' with { type: 'json' }
import { CUSTOM_ID, CUSTOM_IMAGE_LIMIT, nameKey, normalizeCustomRecord } from './customNikkeModel.js'

const DATABASE = 'nikke-photos-custom-nikke-v1'
let databasePromise, records = [], failure = '', revision = 0, loaded = false, channel
const listeners = new Set()
export const getCustomNikkes = () => records.filter(record => !record.deletedAt)
export const getDeletedCustomNikkes = () => records.filter(record => record.deletedAt)
export const getCustomNikkeError = () => failure
export const getCustomNikkeRevision = () => revision
export const subscribeCustomNikkes = listener => { listeners.add(listener); return () => listeners.delete(listener) }
function emit() { revision++; for (const listener of listeners) listener() }
function openDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(Error('当前环境无法使用本地角色库')); return }
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('characters', { keyPath: 'id' })
    request.onerror = () => reject(Error('无法打开本地角色库，请检查存储空间与浏览器权限'))
    request.onblocked = () => reject(Error('角色库正被其他窗口占用，请关闭旧窗口后重试'))
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); databasePromise = undefined; loaded = false; failure = '角色库已在其他窗口更新，请重新加载'; emit() }
      resolve(request.result)
    }
  }).catch(error => { databasePromise = undefined; throw error })
  return databasePromise
}
export async function initializeCustomNikkes() {
  try {
    const db = await openDatabase()
    const items = await new Promise((resolve, reject) => {
      const tx = db.transaction('characters', 'readonly'), request = tx.objectStore('characters').getAll()
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = tx.onabort = () => reject(Error('读取本地角色库失败，现有资料未被覆盖'))
    })
    const normalized = items.map(normalizeCustomRecord)
    records = normalized; loaded = true; failure = ''; emit()
    if (!channel && typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(DATABASE)
      channel.onmessage = () => { initializeCustomNikkes().catch(() => {}) }
    }
  } catch (error) { failure = error.message; loaded = false; emit(); throw error }
}

export async function readCustomImage(file) {
  if (!(file instanceof Blob) || !file.size) throw Error('请选择有效的图片')
  if (file.size > CUSTOM_IMAGE_LIMIT) throw Error('图片不能超过10 MB')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const type = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : ''
  if (!type) throw Error('请选择 PNG、JPEG 或 WebP 图片')
  const blob = file.type === type ? file : new Blob([file], { type })
  let bitmap
  try { bitmap = await createImageBitmap(blob) } catch { throw Error('无法读取这张图片，请重新选择') }
  try {
    if (bitmap.width > 16384 || bitmap.height > 16384 || bitmap.width * bitmap.height > 64 * 1024 * 1024) throw Error('图片分辨率过大，请使用较小的原图')
    return { blob, name: file.name || '角色图片', width: bitmap.width, height: bitmap.height }
  } finally { bitmap.close() }
}

export async function saveCustomNikke(draft) {
  if (!loaded) throw Error(failure || '本地角色库尚未加载，请重新加载后再保存')
  const id = draft.id || `custom-${crypto.randomUUID()}`
  if (!CUSTOM_ID.test(id)) throw Error('无效的本地角色身份')
  const now = new Date().toISOString()
  const candidate = normalizeCustomRecord({ ...draft, id, schemaVersion: 1, createdAt: draft.createdAt || now, updatedAt: now })
  if (roster.characters.some(character => nameKey(character.nameCn) === nameKey(candidate.nameCn))) throw Error('内置名单已有同名妮姬，请确认名称或使用原角色')
  const db = await openDatabase()
  let next
  await new Promise((resolve, reject) => {
    const tx = db.transaction('characters', 'readwrite'), store = tx.objectStore('characters'), request = store.getAll()
    let message = '保存失败，可能是本机存储空间不足，请保留输入后重试'
    request.onsuccess = () => {
      try {
        const all = request.result, existing = all.find(item => item.id === id)
        if (all.some(item => !item.deletedAt && item.id !== id && nameKey(item.nameCn) === nameKey(candidate.nameCn))) { message = '已添加同名妮姬，请在下方列表中编辑原角色'; tx.abort(); return }
        if (draft.id && (!existing || existing.deletedAt || existing.updatedAt !== draft.updatedAt)) { message = '该妮姬已在其他窗口修改或删除，请重新加载后再编辑'; tx.abort(); return }
        next = [...all.filter(item => item.id !== id), candidate].map(normalizeCustomRecord)
        store.put(candidate)
      } catch { tx.abort() }
    }
    tx.oncomplete = resolve
    tx.onerror = tx.onabort = () => reject(Error(message))
  })
  records = next; failure = ''; emit(); channel?.postMessage('changed')
  return candidate
}

// Reversible deletion deliberately leaves per-profile records and image bytes intact.
export async function setCustomNikkeDeleted(record, deleted) {
  if (!CUSTOM_ID.test(record?.id || '')) throw Error('只能删除或恢复自定义妮姬')
  if (!loaded) throw Error(failure || '请先重新加载本地角色库')
  const db = await openDatabase()
  let next, updated
  await new Promise((resolve, reject) => {
    const tx = db.transaction('characters', 'readwrite'), store = tx.objectStore('characters'), request = store.getAll()
    let message = '操作失败，请稍后重试，现有资料未被清除'
    request.onsuccess = () => {
      try {
        const all = request.result, existing = all.find(item => item.id === record.id)
        if (!existing || existing.updatedAt !== record.updatedAt) { message = '该妮姬已在其他窗口更新，请重新选择后重试'; tx.abort(); return }
        if (!deleted && all.some(item => item.id !== record.id && !item.deletedAt && nameKey(item.nameCn) === nameKey(existing.nameCn))) { message = '已有同名自定义妮姬，请先修改其名称后再恢复'; tx.abort(); return }
        const now = new Date().toISOString()
        updated = normalizeCustomRecord({ ...existing, updatedAt: now, deletedAt: deleted ? now : null })
        next = all.map(item => normalizeCustomRecord(item.id === record.id ? updated : item))
        store.put(updated)
      } catch { tx.abort() }
    }
    tx.oncomplete = resolve
    tx.onerror = tx.onabort = () => reject(Error(message))
  })
  records = next; emit(); channel?.postMessage('changed')
  return updated
}

export async function exportCustomBackup() {
  await initializeCustomNikkes()
  const items = await Promise.all(records.map(async record => {
    const item = { ...record }
    for (const key of ['avatarImage', 'artworkImage']) {
      if (!record[key]) continue
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(record[key].blob)
      })
      const { blob, ...metadata } = record[key]
      item[key] = { ...metadata, data }
    }
    return item
  }))
  return { format: 'nikke-photos-custom-backup', version: 1, items }
}

export async function prepareCustomBackup(file) {
  if (file?.format !== 'nikke-photos-custom-backup' || file.version !== 1 || !Array.isArray(file.items)) throw Error('请选择自定义角色备份文件')
  const ids = new Set()
  return Promise.all(file.items.map(async input => {
    if (ids.has(input.id)) throw Error('备份包含重复角色身份')
    ids.add(input.id)
    const record = { ...input }
    for (const key of ['avatarImage', 'artworkImage']) {
      if (!input[key]) continue
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(input[key].data)
      if (!match || match[2].length > Math.ceil(CUSTOM_IMAGE_LIMIT / 3) * 4) throw Error('备份中的角色图片无效或超过10 MB')
      const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0))
      record[key] = await readCustomImage(new File([bytes], input[key].name || '角色图片', { type: match[1] }))
    }
    return normalizeCustomRecord(record)
  }))
}

export async function restoreCustomBackup(file) {
  const incoming = await prepareCustomBackup(file)
  const db = await openDatabase()
  let next
  await new Promise((resolve, reject) => {
    const tx = db.transaction('characters', 'readwrite')
    const store = tx.objectStore('characters')
    const request = store.getAll()
    let failure
    request.onsuccess = () => {
      try {
        const merged = new Map(request.result.map(item => [item.id, item]))
        for (const item of incoming) merged.set(item.id, item)
        next = [...merged.values()].map(normalizeCustomRecord)
        const builtInNames = new Set(roster.characters.map(item => nameKey(item.nameCn)))
        for (const item of incoming.filter(item => !item.deletedAt)) {
          const name = nameKey(item.nameCn)
          if (builtInNames.has(name) || next.some(existing => existing.id !== item.id && !existing.deletedAt && nameKey(existing.nameCn) === name)) {
            throw Error(`角色名称冲突“${item.nameCn}”，请先修改同名角色后恢复`)
          }
        }
        for (const item of incoming) store.put(item)
      } catch (error) { failure = error; tx.abort() }
    }
    tx.oncomplete = resolve
    tx.onerror = tx.onabort = () => reject(failure || tx.error || Error('角色库恢复失败'))
  })
  records = next; loaded = true; failure = ''; emit(); channel?.postMessage('changed')
  return incoming.length
}
