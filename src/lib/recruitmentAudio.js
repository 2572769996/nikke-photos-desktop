import { useEffect, useRef } from 'react'
import { assetUrl } from './roster.js'
import { soundsEnabled } from './uiSound.js'

const active = new Set()

export function useRecruitMusic(stage) {
  const current = useRef(null)
  useEffect(() => () => current.current?.pause(), [])
  useEffect(() => {
    if (!stage || !soundsEnabled('interface')) return
    const previous = current.current
    const track = stage === 'reveal' ? 'open' : 'default'
    const music = new Audio(assetUrl('recruitment/menu-gacha-' + track + '.mp3'))
    current.current = music
    music.loop = true
    // 同池实录中，结算从 Default 的第三个乐段切入。
    if (stage === 'result') music.currentTime = 61.9355
    const crossfade = previous && !previous.paused
    const previousVolume = previous?.volume
    const volume = stage === 'gate' ? .57 : .6
    const fadeMs = stage === 'result' ? 600 : 800
    music.volume = crossfade ? 0 : volume
    let fade
    const start = () => {
      music.play().catch(error => {
        if (error.name !== 'AbortError') console.warn('招募背景音乐播放失败', error)
      })
      if (!crossfade) return
      const begin = performance.now()
      fade = setInterval(() => {
        const fraction = Math.min(1, (performance.now() - begin) / fadeMs)
        music.volume = volume * fraction
        previous.volume = previousVolume * (1 - fraction)
        if (fraction === 1) { clearInterval(fade); previous.pause() }
      }, 25)
    }
    let delay
    if (crossfade && stage === 'result') delay = setTimeout(start, 200)
    else start()
    return () => {
      clearTimeout(delay)
      clearInterval(fade)
      previous?.pause()
    }
  }, [stage])
}

export function playRecruitSound(cue) {
  if (!soundsEnabled('interface')) return
  const player = new Audio(assetUrl(`recruitment/sound/${cue}.wav`))
  player.loop = cue === 'gacha_ambient'
  active.add(player)
  player.onended = () => active.delete(player)
  player.play().catch(error => {
    active.delete(player)
    if (error.name !== 'AbortError') console.warn('招募音效播放失败', cue, error)
  })
  if (player.loop) return () => {
    player.pause()
    active.delete(player)
  }
}

export function stopRecruitSounds() {
  for (const player of active) player.pause()
  active.clear()
}
