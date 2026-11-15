import {useEffect, useMemo, useRef, useState} from 'react'
import {storyText, findStoryPosition, storyLocation} from '../lib/storyReader.js'
import '../styles/storyReader.css'

const initialPreferences = {fontSize:18, lineHeight:1.9, width:780, player:'指挥官', hideSpoilers:true}
const emptyReading = {preferences:initialPreferences, positions:{}, bookmarks:[], read:[], lastSceneId:null}
const jobLabels = {running:'正在下载', completed:'下载完成', partial:'部分下载失败', cancelled:'已取消', failed:'下载失败'}

export default function StoryReaderPage({active}) {
  const api = window.nikkeDesktop?.storyReader
  const [catalog, setCatalog] = useState(null)
  const [reading, setReading] = useState(emptyReading)
  const [downloaded, setDownloaded] = useState([])
  const [job, setJob] = useState({status:'idle', completed:0, total:0, failures:[]})
  const [chapterId, setChapterId] = useState('')
  const [scene, setScene] = useState(null)
  const [failedScene, setFailedScene] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playerDraft, setPlayerDraft] = useState('指挥官')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState({busy:false, rows:[], message:''})
  const [saving, setSaving] = useState(false)
  const viewport = useRef(null)
  const readingRef = useRef(reading)
  const sceneRef = useRef(null)
  const visibleRef = useRef(active)
  const alive = useRef(true)
  const requestSequence = useRef(0)
  const searchSequence = useRef(0)
  const restoreTarget = useRef(null)
  const restoring = useRef(false)
  const pendingPosition = useRef(null)
  const positionTimer = useRef(null)
  const writing = useRef(Promise.resolve())
  const mutationCount = useRef(0)
  const actionPending = useRef(false)

  readingRef.current = reading
  sceneRef.current = scene
  visibleRef.current = active
  const preferences = reading.preferences
  const busy = job.status === 'running'
  const currentChapter = catalog?.chapters.find(chapter => chapter.id === chapterId)
  const location = storyLocation(catalog, scene?.id)
  const allScenes = catalog?.chapters.flatMap(chapter => chapter.scenes) || []
  const sceneIndex = allScenes.findIndex(item => item.id === scene?.id)
  const displayRows = useMemo(() => (scene?.rows || []).map(row => ({...row, speaker:storyText(row.speaker, preferences.player), text:storyText(row.text, preferences.player)})), [scene, preferences.player])
  const rowTargets = useMemo(() => new Map((scene?.rows || []).map(row => [row.id, row])), [scene])
  const bookmarkKeys = new Set(reading.bookmarks.filter(item => item.sceneId === scene?.id).map(item => item.index + ':' + item.recordId))

  function acceptReading(next) {
    readingRef.current = next
    if (alive.current) setReading(next)
  }

  function mutate(type, value) {
    mutationCount.current++
    if (alive.current) setSaving(true)
    const task = writing.current.then(() => api.reading({type, value}))
      .then(next => { acceptReading(next); return next })
    writing.current = task.catch(problem => {
      if (alive.current) setError(problem.message)
    }).finally(() => {
      mutationCount.current--
      if (alive.current) setSaving(mutationCount.current > 0)
    })
    return task
  }

  function flushPosition() {
    clearTimeout(positionTimer.current)
    const position = pendingPosition.current
    pendingPosition.current = null
    if (position) return mutate('position', position)
    return writing.current
  }

  async function refreshLibrary() {
    const next = await api.snapshot()
    if (!alive.current) return
    setCatalog(next.catalog)
    setDownloaded(next.downloaded)
    setJob(next.job)
    if (next.catalogError) setError(next.catalogError)
    return next
  }

  async function open(id, {refresh = false, position = null} = {}) {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError('')
    setNotice('')
    setFailedScene('')
    try {
      await flushPosition()
      const next = await api.open({id, refresh})
      if (!alive.current || sequence !== requestSequence.current) return
      restoreTarget.current = findStoryPosition(next, position || readingRef.current.positions[id])
      restoring.current = true
      setScene(next)
      const target = storyLocation(catalog, id)
      if (target) setChapterId(target.chapter.id)
      await refreshLibrary()
    } catch (problem) {
      if (alive.current && sequence === requestSequence.current) {
        setError(problem.message)
        setFailedScene(id)
      }
    } finally {
      if (alive.current && sequence === requestSequence.current) setLoading(false)
    }
  }

  useEffect(() => {
    alive.current = true
    if (!api) {
      setError('请在桌面客户端中使用主线剧情阅读')
      return () => { alive.current = false }
    }
    const unsubscribe = api.subscribe(next => {
      if (!alive.current) return
      setJob(next)
      if (next.status !== 'running') refreshLibrary().catch(problem => setError(problem.message))
    })
    api.snapshot().then(next => {
      if (!alive.current) return
      setCatalog(next.catalog)
      setDownloaded(next.downloaded)
      setJob(next.job)
      acceptReading(next.reading)
      setPlayerDraft(next.reading.preferences.player)
      setChapterId(next.catalog?.chapters[0]?.id || '')
      setInitialized(true)
      if (next.catalogError) setError(next.catalogError)
      const last = next.reading.lastSceneId
      if (last && next.downloaded.includes(last)) {
        const target = storyLocation(next.catalog, last)
        if (target) setChapterId(target.chapter.id)
        open(last, {position:next.reading.positions[last]})
      }
    }).catch(problem => setError(problem.message))
    return () => {
      flushPosition().catch(() => {})
      alive.current = false
      requestSequence.current++
      searchSequence.current++
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!active) flushPosition().catch(() => {})
  }, [active])

  useEffect(() => {
    if (!scene || !active || restoreTarget.current === null) return
    const index = restoreTarget.current
    const frame = requestAnimationFrame(() => {
      const element = viewport.current?.querySelector('[data-story-row="' + index + '"]')
      if (element) viewport.current.scrollTop += element.getBoundingClientRect().top - viewport.current.getBoundingClientRect().top - 24
      restoreTarget.current = null
      restoring.current = false
      const row = scene.rows[index]
      if (row) mutate('position', {sceneId:scene.id, index, recordId:row.id}).catch(() => {})
    })
    return () => cancelAnimationFrame(frame)
  }, [scene, active])

  function onScroll() {
    if (!visibleRef.current || restoring.current || !sceneRef.current) return
    const top = viewport.current.getBoundingClientRect().top + 30
    const element = [...viewport.current.querySelectorAll('[data-story-row]')].find(node => node.getBoundingClientRect().bottom > top)
    if (!element) return
    const index = Number(element.dataset.storyRow)
    const row = sceneRef.current.rows[index]
    pendingPosition.current = {sceneId:sceneRef.current.id, index, recordId:row.id}
    clearTimeout(positionTimer.current)
    positionTimer.current = setTimeout(() => { flushPosition().catch(() => {}) }, 250)
  }

  async function runDownload(operation) {
    if (actionPending.current) return
    actionPending.current = true
    setError('')
    setNotice('')
    try {
      await operation()
      const next = await refreshLibrary()
      if (next?.catalog && !chapterId) setChapterId(next.catalog.chapters[0].id)
    } catch (problem) {
      setError(problem.message)
    } finally {
      actionPending.current = false
    }
  }

  function updatePreference(key, value) {
    mutate('preferences', {[key]:value}).catch(() => {})
  }

  async function runSearch(event) {
    event.preventDefault()
    const term = storyText(query.trim(), preferences.player).toLocaleLowerCase()
    if (!term) { setSearch({busy:false, rows:[], message:'请输入搜索内容'}); return }
    const sequence = ++searchSequence.current
    const ids = downloaded.filter(id => allScenes.some(scene => scene.id === id))
    const rows = []
    let skipped = 0
    setSearch({busy:true, rows:[], message:'正在搜索已下载正文…'})
    try {
      for (let offset = 0; offset < ids.length; offset += 20) {
        const batch = await api.search(ids.slice(offset, offset + 20))
        if (sequence !== searchSequence.current || !alive.current) return
        for (const item of batch) {
          if (!item.scene) { skipped++; continue }
          for (const row of item.scene.rows) {
            const text = storyText(row.text, preferences.player)
            if ((storyText(row.speaker, preferences.player) + ' ' + text).toLocaleLowerCase().includes(term)) {
              rows.push({sceneId:item.scene.id, index:row.index, recordId:row.id, text:text.slice(0, 180)})
              if (rows.length >= 100) break
            }
          }
          if (rows.length >= 100) break
        }
        if (rows.length >= 100) break
      }
      setSearch({busy:false, rows, message:(rows.length >= 100 ? '已显示前100条，请缩小搜索范围。' : '找到 ' + rows.length + ' 条对白。') + (skipped ? '有 ' + skipped + ' 节本地内容无法读取。' : '')})
    } catch (problem) {
      if (sequence === searchSequence.current) setSearch({busy:false, rows, message:problem.message})
    }
  }

  function sectionLabel(id) {
    const target = storyLocation(catalog, id)
    if (!target) return '已保存小节'
    const number = String(target.chapter.number).padStart(2, '0')
    return '第 ' + number + ' 章 · 第 ' + (target.index + 1) + ' 节'
  }

  const cancel = () => api.cancel().catch(problem => setError(problem.message))
  return <div className="story-page">
    <header className="story-header">
      <div><h1>主线剧情</h1><p>章节阅读 · 离线续读</p></div>
      <div className="story-actions">
        <span role="status">{saving ? '正在保存阅读记录…' : initialized ? '阅读记录自动保存' : ''}</span>
        <button disabled={!api || !initialized || busy} onClick={() => runDownload(() => api.catalog())}>{catalog ? '刷新目录' : '获取主线目录'}</button>
        <button onClick={() => setSettingsOpen(!settingsOpen)} aria-expanded={settingsOpen}>阅读设置</button>
      </div>
    </header>
    {error && <div className="story-error" role="alert">{error}<button onClick={() => setError('')}>收起提示</button></div>}
    {notice && <p className="story-notice" role="status">{notice}</p>}
    {job.status !== 'idle' && <section className="story-download" aria-label="剧情下载进度">
      <div className="story-actions"><strong>{jobLabels[job.status]} · {job.completed}/{job.total}</strong>
        {busy && <button onClick={cancel}>取消下载</button>}
        {job.kind === 'chapter' && job.status === 'partial' && <span>再次下载该章会补齐失败小节。</span>}
      </div>
      {job.failures?.length > 0 && <details><summary>{job.failures.length} 项失败</summary>{job.failures.map((failure, index) => <p key={index}>{failure.id ? sectionLabel(failure.id) + ' · ' : ''}{failure.message}</p>)}</details>}
    </section>}
    {settingsOpen && <section className="story-settings" aria-label="阅读设置">
      <label>字号<select value={preferences.fontSize} onChange={event => updatePreference('fontSize', Number(event.target.value))}>{[14,16,18,20,22,24,28,30].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <label>行距<select value={preferences.lineHeight} onChange={event => updatePreference('lineHeight', Number(event.target.value))}>{[1.5,1.7,1.9,2.2,2.5].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <label>正文宽度<select value={preferences.width} onChange={event => updatePreference('width', Number(event.target.value))}><option value={600}>紧凑</option><option value={780}>标准</option><option value={960}>宽阔</option></select></label>
      <form onSubmit={event => { event.preventDefault(); updatePreference('player', playerDraft) }}><label>指挥官名字<input maxLength={40} value={playerDraft} onChange={event => setPlayerDraft(event.target.value)}/></label><button>保存名字</button></form>
      <label className="story-check"><input type="checkbox" checked={preferences.hideSpoilers} onChange={event => updatePreference('hideSpoilers', event.target.checked)}/>隐藏未读章节与小节标题</label>
      <p>正文显示为简体中文，主题跟随软件设置。</p>
    </section>}
    <div className="story-layout">
      <aside className="story-sidebar">
        <section className="story-catalog">
          <h2>章节目录</h2>
          {!catalog ? <p>获取目录后选择章节。下载过的正文可以离线阅读。</p> : <>
            <label className="story-field">选择章节<select value={chapterId} onChange={event => setChapterId(event.target.value)}>{catalog.chapters.map(chapter => {
              const hide = preferences.hideSpoilers && !chapter.scenes.every(item => reading.read.includes(item.id))
              return <option key={chapter.id} value={chapter.id}>第 {String(chapter.number).padStart(2, '0')} 章{hide ? '' : ' · ' + storyText(chapter.title)}</option>
            })}</select></label>
            <div className="story-actions"><button disabled={busy || !currentChapter} onClick={() => runDownload(() => api.chapter(chapterId))}>下载本章</button><small>{currentChapter?.scenes.filter(item => downloaded.includes(item.id)).length || 0}/{currentChapter?.scenes.length || 0} 节已下载</small></div>
            <nav className="story-scenes" aria-label="剧情小节">{currentChapter?.scenes.map((item, index) => <button key={item.id} aria-current={scene?.id === item.id ? 'page' : undefined} disabled={loading || (busy && !downloaded.includes(item.id))} onClick={() => open(item.id)}>
              <span>{index + 1}. {preferences.hideSpoilers && !reading.read.includes(item.id) && scene?.id !== item.id ? '未读小节' : storyText(item.title)}</span>
              <small>{reading.read.includes(item.id) ? '已读 · ' : ''}{downloaded.includes(item.id) ? '已下载' : '点击下载'}</small>
            </button>)}</nav>
            <small>目录更新于 {new Date(catalog.updatedAt).toLocaleString('zh-CN')}</small>
          </>}
        </section>
        <details className="story-bookmarks"><summary>书签 · {reading.bookmarks.length}</summary>
          {!reading.bookmarks.length && <p>点击对白旁的“添加书签”即可保存。</p>}
          {reading.bookmarks.map(bookmark => <div key={bookmark.sceneId + ':' + bookmark.index + ':' + bookmark.recordId}>
            <button disabled={loading} onClick={() => open(bookmark.sceneId, {position:bookmark})}>{sectionLabel(bookmark.sceneId)} · 第 {bookmark.index + 1} 条</button>
            <button aria-label="删除书签" onClick={() => mutate('removeBookmark', bookmark).catch(() => {})}>删除</button>
          </div>)}
        </details>
        <details className="story-search"><summary>搜索已下载剧情</summary>
          <form onSubmit={runSearch}><label>搜索内容<input maxLength={100} value={query} onChange={event => setQuery(event.target.value)}/></label><button disabled={!downloaded.length}>搜索</button></form>
          {search.busy && <button onClick={() => { searchSequence.current++; setSearch({...search, busy:false, message:'搜索已停止'}) }}>停止搜索</button>}
          <p role="status">{search.message}</p>
          <div>{search.rows.map((row, index) => <button key={index} onClick={() => open(row.sceneId, {position:row})}><strong>{sectionLabel(row.sceneId)}</strong><span>{row.text}</span></button>)}</div>
        </details>
      </aside>
      <section className="story-reader" aria-label="剧情正文">
        {loading && <p className="story-notice" role="status">正在打开剧情…</p>}
        {failedScene && failedScene !== scene?.id && <button disabled={busy || loading} onClick={() => open(failedScene, {refresh:true})}>重新下载本节</button>}
        {!scene ? <div className="story-empty"><h2>从一段故事开始</h2><p>在目录中选择小节，或下载整章后离线阅读。</p>
          {reading.lastSceneId && <button disabled={loading} onClick={() => open(reading.lastSceneId)}>继续上次阅读</button>}
        </div> : <>
          <header className="story-scene-header">
            <div><small>{sectionLabel(scene.id)}</small><h2>{storyText(location?.scene.title || '主线剧情', preferences.player)}</h2></div>
            <div className="story-actions"><button disabled={busy || loading} onClick={() => open(scene.id, {refresh:true})}>重新下载本节</button>
              <button onClick={() => mutate('read', {sceneId:scene.id, read:!reading.read.includes(scene.id)}).catch(() => {})}>{reading.read.includes(scene.id) ? '标为未读' : '标为已读'}</button></div>
          </header>
          {scene.hasBranches && <p className="story-notice">本节包含分支，正文按原始记录顺序展示全部选项。跳转编号可用于定位目标对白。</p>}
          <div ref={viewport} className="story-reader-scroll" onScroll={onScroll} style={{'--story-font':preferences.fontSize + 'px', '--story-line':preferences.lineHeight}}>
            <div className="story-prose" style={{maxWidth:preferences.width}}>
              {displayRows.map(row => {
                const bookmarked = bookmarkKeys.has(row.index + ':' + row.id)
                const target = rowTargets.get(row.jump)
                return <article key={row.index} className={'story-row story-row-' + (['narration','monologue','subtitles','choice','self'].includes(row.kind) ? row.kind : 'speech')} data-story-row={row.index}>
                  <header><strong>{row.speaker || '对白'}</strong><button aria-label={(bookmarked ? '移除书签 ' : '添加书签 ') + (row.index + 1)} aria-pressed={bookmarked} onClick={() => mutate('bookmark', {sceneId:scene.id, index:row.index, recordId:row.id}).catch(() => {})}>{bookmarked ? '已加书签' : '添加书签'}</button></header>
                  <p>{row.text}</p>
                  {row.jump && <p className="story-branch">跳转至 {row.jump}{target && <button onClick={() => {
                    const element = viewport.current.querySelector('[data-story-row="' + target.index + '"]')
                    viewport.current.scrollTop += element.getBoundingClientRect().top - viewport.current.getBoundingClientRect().top - 24
                  }}>定位对白</button>}</p>}
                </article>
              })}
              <footer className="story-end"><p>本节结束</p><button onClick={() => mutate('read', {sceneId:scene.id, read:true}).then(() => setNotice('本节已标记为已读')).catch(() => {})}>完成本节阅读</button></footer>
            </div>
          </div>
          <footer className="story-navigation">
            <button disabled={loading || sceneIndex <= 0 || (busy && !downloaded.includes(allScenes[sceneIndex - 1]?.id))} onClick={() => open(allScenes[sceneIndex - 1].id)}>上一节</button>
            <span>{scene.rows.length} 条记录</span>
            <button disabled={loading || sceneIndex < 0 || sceneIndex >= allScenes.length - 1 || (busy && !downloaded.includes(allScenes[sceneIndex + 1]?.id))} onClick={() => open(allScenes[sceneIndex + 1].id)}>下一节</button>
          </footer>
        </>}
      </section>
    </div>
  </div>
}
