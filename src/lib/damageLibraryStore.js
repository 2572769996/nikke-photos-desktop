import {DAMAGE_CATALOG} from './damageSimulator.js'
import {LIBRARY_FORMAT, libraryText, librarySummary, validateLibraryPayload, validateLibraryMetadata, validateLibraryBackup} from './damageLibraryModel.js'

export const DAMAGE_LIBRARY_DATABASE = 'nikke-photos-damage-library-v1'
const listeners = new Set()
let channel
function connectChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(DAMAGE_LIBRARY_DATABASE)
    channel.onmessage = () => { for (const callback of listeners) callback() }
  }
}
export function subscribeDamageLibrary(listener) {
  listeners.add(listener)
  connectChannel()
  return () => listeners.delete(listener)
}
function changed() {
  connectChannel()
  for (const listener of listeners) listener()
  channel?.postMessage('changed')
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(Error('当前环境无法使用本地方案库')); return }
    const request = indexedDB.open(DAMAGE_LIBRARY_DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      for (const name of ['entries','payloads','folders']) request.result.createObjectStore(name, {keyPath:'id'})
    }
    request.onerror = () => reject(Error('无法打开方案库，请检查本机存储空间'))
    request.onblocked = () => { blocked = true; reject(Error('方案库正等待其他窗口释放，请关闭旧窗口后重试')) }
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}
const requestValue = request => new Promise((resolve,reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function transaction(mode, action) {
  const database = await openDatabase()
  const tx = database.transaction(['entries','payloads','folders'],mode, {durability:mode==='readwrite'?'strict':'default'})
  const stores = Object.fromEntries(['entries','payloads','folders'].map(name=>[name,tx.objectStore(name)]))
  const completed = new Promise((resolve,reject) => {
    tx.oncomplete = resolve
    tx.onabort = () => reject(tx.error || Error('方案库事务已取消'))
    tx.onerror = () => {}
  })
  // Attach a handler immediately, including when a request aborts before action completes.
  completed.catch(()=>{})
  try {
    const result = await action(stores)
    await completed
    if (mode === 'readwrite') changed()
    return result
  } catch (error) {
    try { tx.abort() } catch { /* A failed request may already have aborted the transaction. */ }
    await completed.catch(()=>{})
    if (error?.name === 'QuotaExceededError') throw Error('本机存储空间不足，保存未完成。已有记录已保留，请导出备份后整理空间。')
    throw error
  } finally { database.close() }
}
function checkRevision(existing, revision) {
  if (!existing || existing.revision !== revision) throw Error('该条目已在其他窗口修改或删除，请刷新后重试')
}
async function checkFolder(stores, folderId) {
  if (folderId && !await requestValue(stores.folders.get(folderId))) throw Error('所选文件夹已不存在，请重新选择')
}
function metadataFields(input) {
  return {
    title:libraryText(input.title,100,'方案名称',true).trim(),
    note:libraryText(input.note ?? '',2000,'方案备注'),
    folderId:libraryText(input.folderId ?? '',128,'文件夹标识'),
  }
}
export async function listDamageLibrary() {
  return transaction('readonly',async stores => {
    const [entries,folders] = await Promise.all([requestValue(stores.entries.getAll()),requestValue(stores.folders.getAll())])
    entries.forEach(validateLibraryMetadata)
    return {entries:entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), folders:folders.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'))}
  })
}
export async function getDamageLibraryItem(id) {
  return transaction('readonly',async stores => {
    const [metadata,data] = await Promise.all([requestValue(stores.entries.get(id)),requestValue(stores.payloads.get(id))])
    if (!metadata || !data) throw Error('方案或记录已不存在')
    validateLibraryMetadata(metadata)
    if (metadata.engine !== DAMAGE_CATALOG.commit) throw Error('此条目的计算核心版本与当前版本不一致')
    return {...metadata,payload:validateLibraryPayload(metadata.kind,data.payload)}
  })
}
export async function saveDamageLibraryItem(input) {
  const payload = validateLibraryPayload(input.kind,input.payload)
  const fields = metadataFields(input)
  const id = input.id || crypto.randomUUID()
  return transaction('readwrite',async stores => {
    await checkFolder(stores,fields.folderId)
    const existing = await requestValue(stores.entries.get(id))
    if (input.id) {
      checkRevision(existing,input.revision)
      if (existing.kind !== input.kind) throw Error('不能覆盖不同类型的方案')
    } else if (existing) throw Error('方案编号冲突，请重试')
    const now = new Date().toISOString()
    const metadata = {id,kind:input.kind,...fields,version:1,engine:DAMAGE_CATALOG.commit,
      createdAt:existing?.createdAt || now,updatedAt:now,revision:(existing?.revision || 0)+1,summary:librarySummary(input.kind,payload)}
    stores.payloads.put({id,payload})
    stores.entries.put(metadata)
    return metadata
  })
}
export async function saveComparisonCheckpoint(id, input, {create = false} = {}) {
  const payload = validateLibraryPayload('comparison-record',input)
  return transaction('readwrite',async stores => {
    const existing = await requestValue(stores.entries.get(id))
    if (!existing && !create) throw Error('比较记录已被删除，自动保存已停止；可将当前结果另存为新记录')
    if (existing && existing.kind !== 'comparison-record') throw Error('比较记录编号冲突')
    const now = new Date().toISOString()
    const metadata = {id,kind:'comparison-record',title:existing?.title || payload.workspace.name || '比较记录',
      note:existing?.note || '',folderId:existing?.folderId || '',version:1,engine:DAMAGE_CATALOG.commit,
      createdAt:existing?.createdAt || now,updatedAt:now,revision:(existing?.revision || 0)+1,summary:librarySummary('comparison-record',payload)}
    stores.entries.put(metadata)
    stores.payloads.put({id,payload})
    return metadata
  })
}
export async function updateDamageLibraryMetadata(item, fields) {
  const next = metadataFields(fields)
  return transaction('readwrite',async stores => {
    const existing = await requestValue(stores.entries.get(item.id))
    checkRevision(existing,item.revision)
    await checkFolder(stores,next.folderId)
    const metadata = {...existing,...next,revision:existing.revision+1,updatedAt:new Date().toISOString()}
    stores.entries.put(metadata)
    return metadata
  })
}
export async function deleteDamageLibraryItem(item) {
  return transaction('readwrite',async stores => {
    checkRevision(await requestValue(stores.entries.get(item.id)),item.revision)
    stores.entries.delete(item.id)
    stores.payloads.delete(item.id)
  })
}
export async function saveDamageLibraryFolder(name, folder = null) {
  const title = libraryText(name,60,'文件夹名称',true).trim()
  return transaction('readwrite',async stores => {
    const folders = await requestValue(stores.folders.getAll())
    if (folder) checkRevision(folders.find(item=>item.id===folder.id),folder.revision)
    if (folders.some(item=>item.name===title && item.id!==folder?.id)) throw Error('已有同名文件夹')
    const next = {id:folder?.id || crypto.randomUUID(),name:title,revision:(folder?.revision || 0)+1}
    stores.folders.put(next)
    return next
  })
}
export async function deleteDamageLibraryFolder(folder) {
  return transaction('readwrite',async stores => {
    checkRevision(await requestValue(stores.folders.get(folder.id)),folder.revision)
    const entries = await requestValue(stores.entries.getAll())
    for (const item of entries.filter(item=>item.folderId===folder.id)) {
      stores.entries.put({...item,folderId:'',revision:item.revision+1,updatedAt:new Date().toISOString()})
    }
    stores.folders.delete(folder.id)
  })
}
export async function exportDamageLibrary() {
  return transaction('readonly',async stores => {
    const [entries,payloads,folders] = await Promise.all([
      requestValue(stores.entries.getAll()),requestValue(stores.payloads.getAll()),requestValue(stores.folders.getAll()),
    ])
    const data = new Map(payloads.map(item=>[item.id,item.payload]))
    const file = {format:LIBRARY_FORMAT,version:1,engine:DAMAGE_CATALOG.commit,exportedAt:new Date().toISOString(),
      folders,items:entries.map(item=>({...item,payload:data.get(item.id)}))}
    validateLibraryBackup(file)
    return JSON.stringify(file,null,2)
  })
}
export async function importDamageLibrary(file) {
  const checked = validateLibraryBackup(file)
  return transaction('readwrite',async stores => {
    const existingFolders = await requestValue(stores.folders.getAll())
    const folderMap = new Map()
    for (const folder of checked.folders) {
      let target = existingFolders.find(item=>item.name===folder.name)
      if (!target) {
        target = {id:crypto.randomUUID(),name:folder.name,revision:1}
        existingFolders.push(target)
        stores.folders.put(target)
      }
      folderMap.set(folder.id,target.id)
    }
    for (const item of checked.items) {
      const id = crypto.randomUUID()
      const {payload,...metadata} = item
      stores.entries.put({...metadata,id,folderId:folderMap.get(item.folderId) || '',revision:1,updatedAt:new Date().toISOString()})
      stores.payloads.put({id,payload})
    }
    return checked.items.length
  })
}
