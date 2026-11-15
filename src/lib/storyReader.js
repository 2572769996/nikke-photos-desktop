import {Converter} from 'opencc-js/t2cn'

const convert = Converter({from:'tw', to:'cn'})
export function storyText(value, player = '指挥官') {
  return convert(String(value ?? '')).replaceAll('@UserName', player)
}

export function findStoryPosition(scene, position) {
  if (!scene?.rows.length) return 0
  if (!position) return 0
  if (scene.rows[position.index]?.id === position.recordId) return position.index
  const found = scene.rows.findIndex(row => row.id === position.recordId)
  return found >= 0 ? found : Math.min(position.index, scene.rows.length - 1)
}

export function storyLocation(catalog, id) {
  for (const chapter of catalog?.chapters || []) {
    const index = chapter.scenes.findIndex(scene => scene.id === id)
    if (index >= 0) return {chapter, scene:chapter.scenes[index], index}
  }
  return null
}
