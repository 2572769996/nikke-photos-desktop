import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const root = path.resolve(import.meta.dirname, '..')
const base = path.join(root, 'tools/damage-simulator/vendor')
const read = file => JSON.parse(fs.readFileSync(path.join(base, file), 'utf8').replace(/^\uFEFF/, ''))
const raw = read('scraper/nikke_scraped.json'), parsed = read('data/parsed_nikke.json'), skills = read('data/parsed_skills.json')
const roster = JSON.parse(fs.readFileSync(path.join(root, 'src/data/roster.json'), 'utf8')).characters
const cubes = JSON.parse(fs.readFileSync(path.join(root, 'src/data/cubes.json'), 'utf8')).cubes
const cubeTable = read('data/base_stat_tables/cube.json')
const byId = new Map()
for (const [name, item] of Object.entries(raw)) {
  if (item.id == null) continue
  const id = String(item.id)
  if (byId.has(id)) throw Error('上游资源编号重复：' + id)
  byId.set(id, name)
}
const characters = roster.map(c => {
  const name = byId.get(String(c.resourceId)), data = parsed[name]
  const supported = Boolean(name && data && Array.isArray(skills[name]) && !data.preview)
  return { code:c.nameCode, resourceId:c.resourceId, name:c.nameCn, engineName:supported ? name : null,
    burst:data?.burst_stage || '', weapon:c.weapon_type, element:data?.element_code || '',
    favorite:Boolean(data?.favorite_slots?.length), supported, reason:supported ? '' : '此固定版本上游尚未正式支持该角色' }
})
const cubeEntries = cubes.map(c => {
  const entry = Object.entries(cubeTable).find(([, v]) => v && typeof v === 'object' && Number(v.resource_id) === Number(c.resourceId))
  return { id:c.resourceId, name:c.nameCn, engineName:entry?.[0] || null, limited:Boolean(entry?.[1].unsupported) }
})
const files = {}
function hashTree(folder) {
  for (const e of fs.readdirSync(folder, {withFileTypes:true})) {
    if (e.name === '__pycache__') continue
    const file = path.join(folder, e.name)
    if (e.isDirectory()) hashTree(file)
    else files[path.relative(base, file).replaceAll('\\','/')] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }
}
hashTree(base)
const catalog = { repo:'Jgaram/nikke-calc', commit:'67835ca3033a95482749ea2db35a8ee2a0856a92', date:'2026-11-02', schemaVersion:2, characters, cubes:cubeEntries }
fs.writeFileSync(path.join(root, 'src/data/damageCatalog.json'), JSON.stringify(catalog, null, 2)+'\n')
const hashFile=path.join(root,'tools/damage-simulator/vendor-hashes.json')
if(fs.existsSync(hashFile)) {
  const expected=JSON.parse(fs.readFileSync(hashFile,'utf8'))
  if(Object.keys(expected).length!==Object.keys(files).length || Object.entries(files).some(([key,value])=>expected[key]!==value))throw Error('固定版本上游文件发生变化；停止生成，请审查差异。')
} else fs.writeFileSync(hashFile,JSON.stringify(files,null,2)+'\n')
const engineOut=path.join(root,'tools/damage-simulator')
fs.writeFileSync(path.join(engineOut,'catalog.json'),JSON.stringify(catalog))
fs.copyFileSync(path.join(root,'src/data/affixTiers.js'),path.join(engineOut,'affixTiers.mjs'))
fs.writeFileSync(path.join(engineOut,'request.mjs'),fs.readFileSync(path.join(root,'src/lib/damageSimulator.js'),'utf8').replace('../data/damageCatalog.json','./catalog.json').replace('../data/affixTiers.js','./affixTiers.mjs'))
console.log(`伤害核心目录：${characters.filter(c=>c.supported).length}/${characters.length} 个本地角色，${cubeEntries.filter(c=>c.engineName).length} 个魔方；${Object.keys(files).length} 个上游文件已记录哈希。`)
