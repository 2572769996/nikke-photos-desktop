import {useEffect, useRef, useState} from 'react'

export default function BlablaAccountImport({onReady}) {
  const bridge = window.nikkeDesktop?.blablalink
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  const [identity, setIdentity] = useState(null)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const alive = useRef(true)
  const running = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    alive.current = true
    const unsubscribe = bridge.subscribe(state => {
      if (alive.current && state.phase) setProgress(state.phase)
    })
    return () => {
      alive.current = false
      generation.current += 1
      unsubscribe()
      bridge.cancel().catch(() => {})
    }
  }, [bridge])

  const perform = async action => {
    if (running.current) return
    running.current = true
    const token = ++generation.current
    setBusy(true)
    setError('')
    try {
      await action(() => alive.current && generation.current === token)
    } catch (problem) {
      if (alive.current && generation.current === token) setError(problem.message)
    } finally {
      running.current = false
      if (alive.current) setBusy(false)
    }
  }
  const openLogin = () => perform(async current => {
    await bridge.open()
    if (current()) {
      setOpened(true)
      setIdentity(null)
      setProgress('在官方窗口登录并选择游戏账号，再通过“账号导入 → 返回账号导入”菜单或关闭登录窗口返回这里。')
    }
  })
  const inspect = () => perform(async current => {
    setIdentity(null)
    const next = await bridge.inspect()
    if (current()) {
      setIdentity(next)
      setProgress('请核对当前账号与区服，再读取角色数据。')
    }
  })
  const collect = () => perform(async current => {
    const data = await bridge.collect(identity.id)
    if (current()) onReady(data)
  })
  const cancel = async () => {
    generation.current += 1
    setIdentity(null)
    setOpened(false)
    setProgress('本次读取已取消，可重新打开登录窗口。')
    try { await bridge.cancel() }
    catch (problem) { if (alive.current) setError(problem.message) }
  }
  const logout = () => perform(async current => {
    await bridge.logout()
    if (current()) {
      setIdentity(null)
      setOpened(false)
      setProgress('登录状态已清除。')
    }
  })

  return <section className="blabla-import" aria-label="国际服账号直接导入">
    <h3>国际服账号直接导入</h3>
    <p>登录 BlaBlaLink 后读取账号，在预览中确认导入。</p>
    <div className="blabla-actions">
      <button className="btn btn-primary" disabled={busy} onClick={openLogin}>{opened ? '打开登录窗口' : '登录 BlaBlaLink'}</button>
      {opened && <button className="btn" disabled={busy} onClick={inspect}>我已登录，读取账号信息</button>}
      <button className="btn" disabled={busy} onClick={logout}>清除登录状态</button>
      {busy && <button className="btn" onClick={cancel}>取消读取</button>}
    </div>
    {identity && <div className="blabla-identity">
      <dl><div><dt>游戏账号</dt><dd>{identity.profileName}</dd></div><div><dt>区服编号</dt><dd>{identity.areaId}</dd></div></dl>
      <button className="btn btn-primary" disabled={busy} onClick={collect}>确认账号并读取角色数据</button>
      <p className="import-hint">需要换号或切换区服时，在官方窗口完成后重新读取账号信息。</p>
    </div>}
    {progress && <p className="import-hint" role="status">{progress}</p>}
    {error && <p className="dlg-error" role="alert">{error}</p>}
    <p className="import-hint">登录状态保留到本次软件退出。密码和验证码在官方页面填写。</p>
  </section>
}
