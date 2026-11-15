import { useEffect, useRef, useState } from 'react'
import { DAMAGE_CATALOG, DAMAGE_STATS, presetMember } from '../lib/damageSimulator.js'
import { AFFIX_TIER_VALUES } from '../data/affixTiers.js'
import { COMPARISON_KEY, createComparison, generateComparisonCandidates, runComparison, rankComparisonResults, readComparison, serializeComparison, parseComparisonFile } from '../lib/damageComparison.js'
import { clone, compact, memberName, Field, Select, MemberEditor, ProfileImport, DamageResults, engineLabel } from './DamageSimulatorShared.jsx'
import {SaveDamageLibraryButton} from './DamageLibraryPanel.jsx'
import {saveComparisonCheckpoint} from '../lib/damageLibraryStore.js'
import {validateLibraryPayload} from '../lib/damageLibraryModel.js'
import DamageSearchControls, {defaultCubeSearch} from './DamageSearchControls.jsx'
import DamageRandomStatistics from './DamageRandomStatistics.jsx'
import {createRandomExperiment} from '../lib/damageExperiments.js'
import TeamGrowthControls from './TeamGrowthControls.jsx'
import {defaultGrowthOptions} from '../lib/damageGrowth.js'
import '../styles/damageComparison.css'

function download(text, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], {type}))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function DamageComparisonPanel({libraryLoad,currentDraft, ready, externalBusy, onBusyChange, onApply}) {
  const [initial] = useState(() => readComparison(localStorage))
  const [workspace, setWorkspace] = useState(initial.workspace)
  const [error, setError] = useState(initial.error)
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState(null)
  const [slot, setSlot] = useState(0)
  const [kind, setKind] = useState(() => initial.workspace?.experiment ? 'random' : initial.workspace?.candidates.some(item => item.growth) ? 'teamGrowth' : 'replacement')
  const [growthOptions, setGrowthOptions] = useState(defaultGrowthOptions)
  const [cubeSearch,setCubeSearch]=useState(defaultCubeSearch)
  const [dimensions,setDimensions]=useState([])
  const [sampleCount,setSampleCount]=useState(20),[sampleSeed,setSampleSeed]=useState(42)
  const [rankingMember, setRankingMember] = useState('')
  const [replacement, setReplacement] = useState('')
  const [query, setQuery] = useState('')
  const [cubeLevel, setCubeLevel] = useState(15)
  const [stat, setStat] = useState('atk_pct')
  const [affixCount, setAffixCount] = useState(1)
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [notice, setNotice] = useState('')
  const [archive,setArchive]=useState({state:'',error:''})
  const archiveQueue=useRef(Promise.resolve()),archiveJob=useRef(null),loadedLibrary=useRef(null)
  const controller = useRef(null)
  const running = useRef(false)
  const alive = useRef(true)
  const fileInput = useRef(null)
  useEffect(() => {
    alive.current = true
    return () => {
    alive.current = false
    if (running.current) {
      controller.current?.abort()
      window.nikkeDesktop?.damageSimulator?.cancel().catch(() => {})
    }
    }
  }, [])
  useEffect(() => {
    if (!workspace) return
    try { localStorage.setItem(COMPARISON_KEY, serializeComparison(workspace)) }
    catch (exception) { setError(`比较方案保存失败：${exception.message}`) }
  }, [workspace])
  useEffect(()=>{
    if(!libraryLoad||loadedLibrary.current===libraryLoad.nonce)return
    loadedLibrary.current=libraryLoad.nonce
    try{
      if(running.current||externalBusy)throw Error('请等待计算或存档完成')
      const payload=validateLibraryPayload(libraryLoad.kind,libraryLoad.payload)
      const restored=libraryLoad.kind==='comparison-record'?payload:null
      const next=restored?restored.workspace:payload
      localStorage.setItem(COMPARISON_KEY,serializeComparison(next))
      setWorkspace(next);setRun(restored);setSlot(0);
      setKind(next.experiment ? 'random' : next.candidates.some(item => item.growth) ? 'teamGrowth' : 'replacement');setGrowthOptions(defaultGrowthOptions());setRankingMember('');setEditing(null);setImporting(null);setDetailId(null)
      setError('');setArchive({state:'',error:''});archiveJob.current=null
      setNotice(restored?'已恢复比较快照与结果。可查看详情或手动运行差分计算。':'已从方案库加载比较方案。')
    }catch(e){setError(e.message)}
  },[libraryLoad])
  const checkpoint=(job,progress)=>{
    const signature=progress.status+':'+progress.results.length
    if(job.signature===signature)return
    job.signature=signature
    // Queue snapshots share immutable run results; keep only the latest pending
    // checkpoint so a fast differential run does not clone its full history 240 times.
    const snapshot={...progress,results:[...progress.results]}
    job.latest=snapshot;job.pending=snapshot
    if(alive.current)setArchive({state:'saving',error:''})
    if(job.writing)return
    job.writing=true
    archiveQueue.current=archiveQueue.current.then(async()=>{
      try {
        while(job.pending){
          const pending=job.pending;job.pending=null
          try{
            await saveComparisonCheckpoint(job.id,pending,{create:!job.created})
            job.created=true
            if(alive.current&&!job.pending)setArchive({state:'saved',error:''})
          }catch(e){if(alive.current&&!job.pending)setArchive({state:'failed',error:e.message})}
        }
      }finally{job.writing=false}
    })
  }
  const retryArchive=async()=>{
    const job=archiveJob.current
    if(!job?.latest||running.current||externalBusy)return
    running.current=true;setBusy(true);onBusyChange(true)
    job.signature=null;checkpoint(job,job.latest)
    await archiveQueue.current
    running.current=false
    if(alive.current){setBusy(false);onBusyChange(false)}
  }
  const locked = busy || externalBusy
  const perform = action => {
    setError('')
    setNotice('')
    try { action() } catch (exception) { setError(engineLabel(exception.message)) }
  }
  const importCurrent = () => perform(() => {
    const next = createComparison(currentDraft)
    if (workspace && !window.confirm('使用当前单队快照建立新的比较，替换工作台中的基准与候选？')) return
    setWorkspace(next)
    setGrowthOptions(defaultGrowthOptions())
    setKind('replacement');setCubeSearch(defaultCubeSearch());setDimensions([])
    setRankingMember('')
    setRun(null)
    setArchive({state:'',error:''});archiveJob.current=null
    setSlot(0)
    setNotice('已建立基准快照。替换角色初始使用统一预设，可逐项配置或从档案导入。')
  })
  const addCandidates = () => perform(() => {
    let value = kind === 'teamGrowth' ? growthOptions : kind==='cubeSearch' ? cubeSearch : kind==='operationSearch' ? dimensions : cubeLevel
    if (kind === 'affix') {
      const definition = DAMAGE_STATS.find(([key]) => key === stat)
      if (!Number.isInteger(affixCount) || affixCount < 0 || affixCount > 4) throw Error('词条数量须为0～4')
      value = {stat, values: affixCount === 0 ? [''] : AFFIX_TIER_VALUES[definition[2]].map(tier => Array(affixCount).fill(tier).join(','))}
    }
    const additions = generateComparisonCandidates(workspace, {
      kind, slot, value, members: kind === 'replacement' ? [presetMember(replacement)] : [],
    })
    setWorkspace(previous => ({...previous, candidates: [...previous.candidates, ...additions]}))
    setNotice(additions.length ? `已添加 ${additions.length} 个候选。` : kind === 'teamGrowth' ? '没有新增候选。请检查已达到目标的项目、装备类型和已有候选，统一预设可能已达到所选目标。' : '这些候选与基准或已有方案相同。')
  })
  const createSamples = () => perform(()=>{
    const next=createRandomExperiment(workspace.baseline,sampleCount,sampleSeed)
    if(workspace.candidates.length&&!window.confirm('建立随机样本会替换当前候选与结果，是否继续？'))return
    setWorkspace(next);setRun(null);setDetailId(null);setArchive({state:'',error:''});archiveJob.current=null
    setNotice('随机样本已建立，请运行全部比较。全部样本仅种子不同，当前单队配置保持不变。')
  })
  const editMember = (candidateId, index, member) => {
    setWorkspace(previous => ({
      ...previous,
      candidates: previous.candidates.map(candidate => {
        if (candidate.id !== candidateId) return candidate
        const updated = {...candidate, draft: {...candidate.draft, members: candidate.draft.members.map((item, position) => position === index ? member : item)}}
        delete updated.growth
        return updated
      }),
    }))
  }
  const start = async differential => {
    if (running.current || externalBusy) return
    if(archive.state==='failed'&&!window.confirm('上次比较记录尚未保存成功。开始新比较将替换当前结果，是否继续？'))return
    setError('')
    setNotice('')
    running.current = true
    controller.current = new AbortController()
    setBusy(true)
    onBusyChange(true)
    const job={id:crypto.randomUUID(),created:false,signature:null,latest:null}
    archiveJob.current=job;setArchive({state:'',error:''})
    try {
      if (!window.nikkeDesktop?.damageSimulator) throw Error('请在桌面客户端中运行比较')
      await runComparison(workspace, {
        simulate: draft => window.nikkeDesktop.damageSimulator.simulate(draft),
        signal: controller.current.signal,
        previous: differential ? run : null,
        onProgress: progress => { if (alive.current) setRun(progress);checkpoint(job,progress) },
      })
    } catch (exception) {
      if (alive.current) setError(engineLabel(exception.message))
    } finally {
      await archiveQueue.current
      running.current = false
      if (alive.current) { setBusy(false); onBusyChange(false) }
    }
  }
  const cancel = async () => {
    controller.current?.abort()
    try { await window.nikkeDesktop.damageSimulator.cancel() }
    catch (exception) { setError(exception.message) }
  }
  const importFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      if (file.size > 5e6) throw Error('比较方案不得超过5 MB')
      const next = parseComparisonFile(await file.text())
      if (running.current || externalBusy) throw Error('请在计算结束后导入')
      if (!window.confirm('导入文件将替换比较工作台的基准与候选，是否继续？')) return
      setWorkspace(next); setRun(null); setSlot(0); setError('');setKind(next.experiment ? 'random' : next.candidates.some(item => item.growth) ? 'teamGrowth' : 'replacement');setGrowthOptions(defaultGrowthOptions());setRankingMember('');setArchive({state:'',error:''});archiveJob.current=null
    } catch (exception) { setError(exception.message) }
  }
  const ranking = rankComparisonResults(run)
  const sorted = [...(ranking.baseline ? [ranking.baseline] : []), ...ranking.rows.map(row => row.item)]
  const visibleRanking = ranking.rows.filter(row => !rankingMember || row.growth?.code === rankingMember)
  const hasGrowthResults = Boolean(run?.workspace.candidates.some(item => item.growth))
  const gain = value => value == null ? '—' : (value > 0 ? '+' : value < 0 ? '−' : '') + compact(Math.abs(value))
  const gainPercent = value => value == null ? '—' : (value > 0 ? '+' : '') + (value * 100).toFixed(2) + '%'
  const stale = Boolean(run && JSON.stringify(workspace) !== JSON.stringify(run.workspace))
  const detail = run?.results.find(item => item.id === detailId)
  const candidateEditing = workspace?.candidates.find(item => item.id === editing?.id)
  const candidateImporting = workspace?.candidates.find(item => item.id === importing)
  const characters = DAMAGE_CATALOG.characters.filter(character => character.supported
    && character.name.includes(query)
    && !workspace?.baseline.members.some((member, index) => index !== slot && member.code === character.code))
  const exportCsv = () => {
    const cell = value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"'
    const rows = [['排名','方案','角色','养成项目','提升前后','队伍总伤害','增加伤害','相对基准变化','计算状态','引擎版本']]
    if (ranking.baseline) rows.push(['','基准编队','','','',ranking.baseline.result.total_damage,0,0,run.status,DAMAGE_CATALOG.commit])
    rows.push(...ranking.rows.map(row => [
      row.rank,row.item.label,row.growth?.character || '',row.growth?.project || '',row.growth?.change || '',
      row.item.result.total_damage,row.delta ?? '',row.percentage ?? '',run.status,DAMAGE_CATALOG.commit,
    ]))
    download('\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'NIKKE-比较结果.csv', 'text/csv;charset=utf-8')
  }
  return <div className="damage-comparison">
    <section className="damage-card">
      <div className="comparison-actions">
        <h2>比较工作台</h2>
        <SaveDamageLibraryButton kind="comparison" payload={workspace} disabled={locked}/>
        <button disabled={locked} onClick={importCurrent}>从当前单队建立比较</button>
        <button disabled={locked} onClick={() => fileInput.current.click()}>导入比较方案</button>
        <button disabled={!workspace} onClick={() => perform(() => download(serializeComparison(workspace), 'NIKKE-比较方案.json'))}>导出比较方案</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={importFile}/>
      </div>
      {error && <p className="damage-error" role="alert">{error}</p>}
      {notice && <p className="damage-notice" role="status">{notice}</p>}
      {!workspace && <p className="damage-muted">先在“编队与设置”配置战斗条件与角色养成，再建立比较。</p>}
      {workspace && <>
        <p className="damage-muted">基准为 {workspace.baseline.members.map(member => memberName(member.code)).join(' / ')}，战斗时长 {workspace.baseline.battle.duration} 秒。所有候选共用这份战斗条件快照。</p>
        <fieldset disabled={locked} className="comparison-controls">
          <label className="damage-field"><span>比较名称</span><input maxLength={60} value={workspace.name} onChange={event => setWorkspace({...workspace, name: event.target.value})}/></label>
          <div className="damage-fields">
            <Select label="比较类型" value={kind} onChange={setKind}>
              <option value="replacement">换人比较（输出 / 辅助）</option><option value="cube">魔方比较</option>
              <option value="cubeSearch">魔方组合搜索</option><option value="operationSearch">操作参数搜索</option><option value="random">多次随机模拟统计</option><option value="teamGrowth">全队养成收益排序</option><option value="affix">改造词条比较</option><option value="growth">养成提升比较</option><option value="order">站位与爆裂优先顺序比较</option>
            </Select>
            {!['teamGrowth','cubeSearch','operationSearch','random'].includes(kind) && <Select label="比较位置" value={slot} onChange={value => setSlot(Number(value))}>
              {workspace.baseline.members.map((member, index) => <option key={member.code} value={index}>{index + 1} · {memberName(member.code)}</option>)}
            </Select>}
            {kind === 'replacement' && <>
              <label className="damage-field"><span>筛选替换角色</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="输入角色名称"/></label>
              <Select label="替换角色（统一预设）" value={replacement} onChange={setReplacement}>
                <option value="">请选择</option>{characters.map(character => <option key={character.code} value={character.code}>{character.name} · 爆裂{character.burst}</option>)}
              </Select>
            </>}
            {kind === 'cube' && <Field label="候选魔方统一等级" min={1} max={15} value={cubeLevel} onChange={setCubeLevel}/>}
            {kind === 'affix' && <>
              <Select label="比较词条" value={stat} onChange={setStat}>{DAMAGE_STATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>
              <Field label="该词条数量（0为清空）" min={0} max={4} value={affixCount} onChange={setAffixCount}/>
            </>}
          </div>
          {['cubeSearch','operationSearch'].includes(kind) && <DamageSearchControls kind={kind} baseline={workspace.baseline} cubes={cubeSearch} onCubes={setCubeSearch} dimensions={dimensions} onDimensions={setDimensions}/>}
          {kind==='random' && <div className="damage-fields"><Field label="随机样本数" min={2} max={240} value={sampleCount} onChange={setSampleCount}/><Field label="起始随机种子" min={0} max={2147483647} value={sampleSeed} onChange={setSampleSeed}/><button onClick={createSamples}>建立随机样本</button><p className="damage-muted">从基准快照切换为随机模式，共2～240次，每次种子递增1。生成后输入固定，可保存到方案库并复现。会替换当前候选。</p></div>}
          {workspace.experiment && <p className="damage-notice">当前为独立随机样本队列，成员与养成已固定。需要进行其他比较时请从当前单队重新建立比较。</p>}
          {kind === 'teamGrowth' && <TeamGrowthControls baseline={workspace.baseline} options={growthOptions} onChange={setGrowthOptions}/>}
          <p className="damage-muted">{kind === 'random' ? '统计会保存每个样本的完整输入、种子和已输出日志，可在方案库恢复。' : ['cubeSearch','operationSearch'].includes(kind) ? '生成后运行全部比较，按整队伤害排序；可查看详情并将选中方案应用到单队。' : kind === 'teamGrowth'
            ? '生成后运行全部比较，按整队伤害增加量排序。排名同时包含输出角色与辅助角色带来的全队收益。'
            : kind === 'order'
            ? '枚举成员站位，最多120种顺序。站位也可能影响相邻目标技能，比较的是整个编队结果。'
            : kind === 'affix' ? '替换所选角色的该类词条，按15档生成候选，每档各条使用相同数值。'
              : kind === 'growth' ? '分别将单项提升到目标，按整队伤害评估收益。已经达到目标的项目自动跳过。'
                : kind === 'cube' ? '按指定统一等级比较上游支持的魔方，可在候选中改为实际持有等级。'
                  : '添加后可编辑候选各成员养成，也可导入所选本地档案快照。'}</p>
          {kind!=='random' && !workspace.experiment && <button onClick={addCandidates}>{kind === 'teamGrowth' ? '生成全队养成候选' : '添加比较候选'}</button>}
          {!workspace.experiment && <button onClick={() => perform(() => {
            if (workspace.candidates.length >= 240) throw Error('每个比较最多240个候选')
            const draft = clone(workspace.baseline)
            setWorkspace({...workspace, candidates: [...workspace.candidates, {id: crypto.randomUUID(), label: '自定义方案', draft}]})
          })}>复制基准为自定义候选</button>}
        </fieldset>
      </>}
    </section>
    {workspace && <section className="damage-card">
      <div className="comparison-actions"><h2>候选方案 · {workspace.candidates.length}</h2>
        <button disabled={locked || !!workspace.experiment || !workspace.candidates.length} onClick={() => {
          if (window.confirm('清空全部比较候选？')) setWorkspace({...workspace, candidates: []})
        }}>清空候选</button>
      </div>
      <div className="comparison-candidates">{workspace.candidates.map(candidate => <article className="comparison-candidate" key={candidate.id}>
        {candidate.growth && <small className="damage-muted">单项养成快照 · 编辑配置后将作为自定义方案</small>}
        <input aria-label="候选名称" maxLength={100} disabled={locked} value={candidate.label} onChange={event => setWorkspace(previous => ({
          ...previous, candidates: previous.candidates.map(item => item.id === candidate.id ? {...item, label: event.target.value} : item),
        }))}/>
        {!workspace.experiment && <div className="comparison-actions">{candidate.draft.members.map((member, index) =>
          <button key={member.code} disabled={locked} onClick={() => setEditing({id: candidate.id, index})}>{memberName(member.code)} · 配置</button>)}</div>}
        {!workspace.experiment && <div className="comparison-actions">
          <button disabled={locked} onClick={() => setImporting(candidate.id)}>导入候选养成</button>
          <button disabled={locked} onClick={() => setWorkspace({...workspace, candidates: workspace.candidates.filter(item => item.id !== candidate.id)})}>删除候选</button>
        </div>}
        {workspace.experiment && <p>固定养成 · 随机种子 {candidate.draft.battle.seed}</p>}
      </article>)}</div>
      <div className="comparison-actions">
        <button className="damage-primary" disabled={locked || !ready || !workspace.candidates.length} onClick={() => start(false)}>运行全部比较</button>
        <button disabled={locked || !ready || !workspace.candidates.length} onClick={() => start(true)}>差分计算</button>
        {busy && <button onClick={cancel}>取消比较</button>}
        {run && <span role="status">{({running: '计算中', completed: '全部完成', cancelled: '已取消', failed: '计算失败', interrupted:'已中断'})[run.status]} · {run.results.length}/{run.total}</span>}
      </div>
      <p className="damage-muted">差分计算复用当前已加载记录中输入与引擎版本完全一致的结果。每个候选单独调用本地引擎，取消后保留已完成结果。</p>
    </section>}
    {archive.state&&<div className="damage-card library-archive-status">
      <span className={archive.state==='failed'?'damage-error':'damage-muted'}>{archive.state==='saving'?'正在保存比较记录…':archive.state==='saved'?'比较记录已保存到方案库':('保存失败：'+archive.error)}</span>
      {archive.state==='failed'&&<><button disabled={locked} onClick={retryArchive}>重试保存记录</button><SaveDamageLibraryButton kind="comparison-record" payload={run} disabled={locked} label="另存当前比较记录"/></>}
    </div>}
    {run?.workspace.experiment && <><p className="damage-notice">{stale?'配置已修改，统计对应上次运行快照。':'随机统计与逐次样本随比较记录长期保存。'}</p><DamageRandomStatistics key={run.workspace.experiment.seed+':'+run.total} run={run} onDetail={setDetailId}/></>}
    {run && !run.workspace.experiment && <section className="damage-card">
      <div className="comparison-actions"><h2>{hasGrowthResults ? '全队养成收益排名' : '比较结果'}</h2><button disabled={!sorted.length} onClick={exportCsv}>导出结果表格</button></div>
      {stale && <p className="damage-notice">方案已修改，结果对应上次计算快照。</p>}
      {run.status !== 'completed' && <p className="damage-notice">当前为部分结果，已完成 {run.results.length}/{run.total} 项。</p>}
      {run.error && <p role="alert" className="damage-error">{engineLabel(run.error)}</p>}
      {hasGrowthResults && <>
        <Select label="查看成员收益" value={rankingMember} onChange={setRankingMember}>
          <option value="">全队排名</option>
          {run.workspace.baseline.members.map(member => <option key={member.code} value={member.code}>{memberName(member.code)}</option>)}
        </Select>
        <p className="damage-muted">每行均相对本次基准独立计算。多项一起提升时可在候选中修改后重算。表格导出包含全部已完成结果。</p>
        {!run.workspace.baseline.battle.expected && <p className="damage-notice">当前为固定种子的单次随机模拟，排名可能受随机波动影响。可用期望值模式建立基准后比较。</p>}
      </>}
      <div className="damage-table-wrap"><table className="comparison-ranking"><thead><tr><th>排名</th><th>方案</th><th>养成变化</th><th>整队伤害</th><th>增加伤害</th><th>相对基准</th><th>结果来源</th><th>操作</th></tr></thead>
        <tbody>
          {ranking.baseline && <tr className="comparison-baseline"><td>—</td><td>基准编队</td><td>—</td><td>{compact(ranking.baseline.result.total_damage)}</td><td>—</td><td>—</td><td>{ranking.baseline.reused ? '复用同输入结果' : '本次计算'}</td><td><button onClick={() => setDetailId('baseline')}>查看详情</button><button disabled={locked} onClick={() => {
              if (window.confirm('将基准编队与战斗条件应用到单队模拟？')) onApply(clone(ranking.baseline.draft))
            }}>应用到单队</button></td></tr>}
          {visibleRanking.map(row => <tr key={row.item.id} data-rank={row.rank}>
            <td>{row.rank}</td><td>{row.item.label}</td><td>{row.growth ? <>{row.growth.project}<br/>{row.growth.change}</> : '自定义方案'}</td>
            <td>{compact(row.item.result.total_damage)}</td><td>{gain(row.delta)}</td><td>{gainPercent(row.percentage)}</td><td>{row.item.reused ? '复用同输入结果' : '本次计算'}</td>
            <td><button onClick={() => setDetailId(row.item.id)}>查看详情</button><button disabled={locked} onClick={() => {
              if (window.confirm('将这份结果对应的编队与战斗条件应用到单队模拟？')) onApply(clone(row.item.draft))
            }}>应用到单队</button></td>
          </tr>)}
        </tbody></table></div>
        {rankingMember && !visibleRanking.length && <p className="damage-muted">当前成员还没有已完成的单项养成结果。</p>}
    </section>}
    {detail && <DamageResults run={detail} stale={stale} records={[]}/>}
    {candidateEditing && <MemberEditor member={candidateEditing.draft.members[editing.index]} onClose={() => setEditing(null)} onSave={member => {
      editMember(editing.id, editing.index, member); setEditing(null)
    }}/>}
    {candidateImporting && <ProfileImport members={candidateImporting.draft.members} onClose={() => setImporting(null)} onImport={member => {
      editMember(importing, candidateImporting.draft.members.findIndex(item => item.code === member.code), member); setImporting(null)
    }}/>}
  </div>
}
