import click from '../assets/ui-sounds/uis_click.wav'
import button from '../assets/ui-sounds/uis_button.wav'
import wash1 from '../assets/ui-sounds/uis_equipment_tunning_1.wav'
import wash2 from '../assets/ui-sounds/uis_equipment_tunning.wav'
import wash3 from '../assets/ui-sounds/uis_equipment_tunning_3.wav'
import apply from '../assets/ui-sounds/uis_equipment_setchange.wav'

const legacyKey = 'nikke.uiSounds.enabled'
const keys = { interface: 'nikke.uiSounds.interface', wash: 'nikke.uiSounds.wash' }
const clips = { interface: { click, button }, wash: { wash1, wash2, wash3, apply } }
const players = new Map()

export const soundsEnabled = group => (localStorage.getItem(keys[group]) ?? localStorage.getItem(legacyKey)) === '1'

export function setSoundsEnabled(group, enabled) {
  localStorage.setItem(keys[group], enabled ? '1' : '0')
  if (!enabled) {
    for (const cue of Object.keys(clips[group])) players.get(cue)?.pause()
  } else if (group === 'interface') playUiSound('click')
}

export function playUiSound(cue) {
  if (typeof cue !== 'string') return
  if (cue === 'endReveal') {
    for (const name of ['wash1', 'wash2', 'wash3']) players.get(name)?.pause()
    return
  }
  const group = Object.hasOwn(clips.wash, cue) ? 'wash' : 'interface'
  if (!Object.hasOwn(clips[group], cue) || !soundsEnabled(group)) return
  if (group === 'wash' && cue !== 'apply') {
    // 连洗时上一轮的尾音不能计入新结果。
    for (const previous of Object.keys(clips.wash)) {
      if (previous !== cue) players.get(previous)?.pause()
    }
  }
  if (!players.has(cue)) players.set(cue, new Audio(clips[group][cue]))
  const player = players.get(cue)
  player.currentTime = 0
  player.play().catch(error => {
    if (error.name !== 'AbortError') console.warn('界面音效播放失败', cue, error)
  })
}
