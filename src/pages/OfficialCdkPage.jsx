import { useEffect, useRef, useState } from 'react'
import '../styles/officialCdk.css'

export default function OfficialCdkPage({ active }) {
  const container = useRef(null)
  const api = window.nikkeDesktop?.officialCdk
  const [state, setState] = useState({ loading: true, error: '', origin: 'https://nikke.qq.com' })

  useEffect(() => {
    if (!api || !active) return
    let live = true
    let frame
    let previous
    const receive = value => { if (live) setState(value) }
    const failure = error => { if (live) setState(value => ({ ...value, loading: false, error: error.message })) }
    const unsubscribe = api.subscribe(receive)
    const update = () => {
      frame = undefined
      const box = container.current.getBoundingClientRect()
      const overlay = document.querySelector('[role="dialog"], .nav-drawer-mask')
      const bounds = overlay || box.width <= 0 || box.height <= 0 ? null : { x: box.x, y: box.y, width: box.width, height: box.height }
      const key = JSON.stringify(bounds)
      if (key === previous) return
      previous = key
      api.layout(bounds).then(receive, failure)
    }
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update) }
    const resize = new ResizeObserver(schedule)
    resize.observe(container.current)
    const overlays = new MutationObserver(schedule)
    overlays.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    schedule()
    return () => {
      live = false
      unsubscribe()
      resize.disconnect()
      overlays.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      cancelAnimationFrame(frame)
      api.layout(null).catch(error => console.error('关闭官方网页显示区域失败', error))
    }
  }, [active, api])

  async function command(name) {
    try { await api[name]() }
    catch (error) { setState(value => ({ ...value, error: error.message })) }
  }

  if (!api) return <div className="tools-status">请重启桌面客户端后使用官方兑换网页。</div>
  return <div className="official-cdk-page">
    <div className="official-cdk-toolbar">
      <span>国服官方兑换网页 · {state.origin}</span>
      <button className="btn btn-sm" onClick={() => command('reload')}>刷新</button>
      <button className="btn btn-sm" onClick={() => command('home')}>返回兑换首页</button>
      {state.loading && <span role="status">正在加载…</span>}
    </div>
    {state.error && <div className="tools-status tools-error" role="alert">{state.error}</div>}
    <div className="official-cdk-content" ref={container} aria-label="官方兑换网页内容" />
  </div>
}
