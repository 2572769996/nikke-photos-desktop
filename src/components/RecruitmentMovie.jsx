import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { recruitMotionReduced, subscribeMotionPreference } from '../lib/motionPreference.js'

export default function RecruitmentMovie({ src, poster, label, suspended }) {
  const video = useRef(null)
  const reduced = useSyncExternalStore(subscribeMotionPreference, recruitMotionReduced)
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (suspended || !playing) element.pause()
    else element.play().catch(error => { if (error.name !== 'AbortError') setPlaying(false) })
  }, [suspended, playing, reduced])

  if (reduced) return <div className="recruit-art"><img className="recruit-keyart" src={poster} alt="" /></div>

  return <>
    <div className="recruit-art">
      {failed ? <img className="recruit-keyart" src={poster} alt="" />
        : <video ref={video} muted loop playsInline preload="metadata" src={src} poster={poster}
            aria-label={label} onError={() => setFailed(true)} />}
    </div>
    {failed ? <span className="recruit-video-toggle">影片暂不可用</span>
      : <button type="button" className="recruit-video-toggle" onClick={() => setPlaying(!playing)}>
          {playing ? 'Ⅱ　暂停影片' : '▷　播放影片'}
        </button>}
  </>
}
