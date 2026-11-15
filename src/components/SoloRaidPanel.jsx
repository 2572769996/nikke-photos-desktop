import { useEffect, useMemo, useRef, useState } from 'react'
import { CHARACTERS, assetUrl, matchesSearch } from '../lib/roster.js'
import { DAMAGE_CATALOG as catalog, ELEMENTS, entryFor, presetMember } from '../lib/damageSimulator.js'
import { SOLO_RAID_KEY, createSoloRaid, validateSoloRaidDraft, soloRaidConflicts, prepareSoloRaidQueue, runSoloRaidBatch, soloRaidTotal, readSoloRaidWorkspace, parseSoloRaidFile } from '../lib/soloRaid.js'
import { Icon, Field, Select, MemberEditor, ProfileImport, DamageResults, clone, compact, number, memberName, engineLabel } from './DamageSimulatorShared.jsx'
import {SaveDamageLibraryButton} from './DamageLibraryPanel.jsx'
import '../styles/soloRaid.css'

function RaidRoster({raid,selected,onAdd}) {
  const [query,setQuery]=useState(''),[stage,setStage]=useState('')
  const team=raid.teams[selected]
  const used=new Map()
  if(team.enabled)raid.teams.forEach((other,i)=>{if(i!==selected&&other.enabled)other.members.forEach(m=>used.set(entryFor(m.code)?.engineName,i))})
  const candidates=useMemo(()=>CHARACTERS.filter(c=>matchesSearch(c,query)).filter(c=>!stage||entryFor(c.nameCode)?.burst===stage),[query,stage])
  return <aside className="damage-roster damage-card"><div className="damage-section-title"><h2>角色库</h2><span>第{selected+1}队</span></div>
    <input className="damage-search" aria-label="搜索个人突袭角色" name="raid-search" autoComplete="off" placeholder="搜索名字或拼音…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="damage-stage-filter">{[['','全部'],['1','Ⅰ'],['2','Ⅱ'],['3','Ⅲ'],['A','通用']].map(([v,label])=><button key={v} aria-pressed={stage===v} onClick={()=>setStage(v)}>{label}</button>)}</div>
    <div className="damage-roster-list">{candidates.map(c=>{
      const entry=entryFor(c.nameCode),exists=team.members.some(m=>m.code===c.nameCode),owner=used.get(entry?.engineName)
      const reason=!entry?.supported?'此版本上游暂不支持':exists?'本队已选择':owner!=null?`第${owner+1}队已使用`:team.members.length>=5?'本队已满':''
      return <button className="damage-roster-character" key={c.nameCode} title={reason||c.nameCn} disabled={Boolean(reason)} onClick={()=>onAdd(c.nameCode)}>
        <img src={assetUrl(c.avatar)} width="128" height="128" alt="" loading="lazy"/><span><b>{c.nameCn}</b><small>{reason||`${c.weapon_type} · 爆裂 ${entry.burst}`}</small></span><em><Icon name={exists?'check':'plus'}/></em>
      </button>
    })}{!candidates.length&&<p className="damage-muted">没有匹配角色</p>}</div>
  </aside>
}
function RaidTeamCards({members,onEdit,onRemove,onMove}) {
  return <div className="damage-team-slots">{Array.from({length:5},(_,i)=>{
    const m=members[i],c=m&&CHARACTERS.find(c=>c.nameCode===m.code)
    return m?<article className="damage-member" key={i}>
      <div className="damage-member-portrait"><img src={assetUrl(c?.avatar)} width="128" height="128" alt=""/><span>{entryFor(m.code)?.burst}</span></div>
      <h3>{memberName(m.code)}</h3><small>{m.source}</small><p>Lv.{m.growth.level} · {m.growth.skills.join('/')}</p>
      <button onClick={()=>onEdit(i)}><Icon name="settings"/>配置角色</button>
      <div className="damage-member-actions"><button disabled={!i} aria-label={`向左移动${memberName(m.code)}`} onClick={()=>onMove(i,-1)}><Icon name="left"/></button><button aria-label={`移除${memberName(m.code)}`} onClick={()=>onRemove(i)}>移除</button><button disabled={i===members.length-1} aria-label={`向右移动${memberName(m.code)}`} onClick={()=>onMove(i,1)}><Icon name="right"/></button></div>
    </article>:<div className="damage-empty-slot" key={i}><Icon name="plus"/><small>选择第{i+1}位角色</small></div>
  })}</div>
}
function RaidBattle({battle,onChange}) {
  return <aside className="damage-settings damage-card"><h2>五队共用战斗条件</h2><div className="damage-fields">
    <Field label="每队战斗时长 · 秒" min={1} max={600} value={battle.duration} onChange={v=>onChange('duration',v)}/>
    <Field label="敌人防御力" min={0} max={1000000} value={battle.defense} onChange={v=>onChange('defense',v)}/>
    <Select label="敌人属性" value={battle.element} onChange={v=>onChange('element',v)}>{ELEMENTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</Select>
    <Field label="核心大小 · px（0 为无核心）" min={0} max={1000} value={battle.core} onChange={v=>onChange('core',v)}/>
    <Field label="距离 · 米" min={0} max={1000} value={battle.distance} onChange={v=>onChange('distance',v)}/>
    <Field label="首次爆裂 · 秒" min={0} max={600} step={0.1} value={battle.firstBurst} onChange={v=>onChange('firstBurst',v)}/>
    <Select label="计算模式" value={battle.expected?'expected':'random'} onChange={v=>onChange('expected',v==='expected')}><option value="expected">期望值 · 适合方案比较</option><option value="random">随机模拟 · 固定种子可复现</option></Select>
    <Field label="随机种子" min={0} max={2147483647} value={battle.seed} onChange={v=>onChange('seed',v)}/>
    <Select label="角色运用" value={battle.operation} onChange={v=>onChange('operation',v)}><option value="auto">全自动</option><option value="upstream">上游角色默认运用</option></Select>
    <Select label="爆裂充能模型" value={battle.gauge} onChange={v=>onChange('gauge',v)}><option value="fixed">上游固定充能时间</option><option value="accumulate">逐次命中累积（上游实验）</option></Select>
  </div><label className="damage-checkbox"><input type="checkbox" checked={battle.hasParts} onChange={e=>onChange('hasParts',e.target.checked)}/>敌人存在部件</label><label className="damage-checkbox"><input type="checkbox" checked={battle.detail===true} onChange={event=>onChange('detail',event.target.checked)}/>记录详细战斗日志</label><p className="damage-muted">每队分别运行相同时长，汇总为五队伤害之和。当前使用静态敌人，不模拟真实 Boss 攻击或阶段。</p></aside>
}
const statusText={running:'计算中',completed:'本轮已完成',cancelled:'本轮已取消',failed:'本轮已停止'}
export default function SoloRaidPanel({libraryLoad,ready,currentDraft,externalBusy=false,onBusyChange=()=>{}}) {
  const [initial]=useState(()=>readSoloRaidWorkspace(localStorage))
  const [raid,setRaid]=useState(initial.raid),[records,setRecords]=useState(initial.records),[storageBlocked,setStorageBlocked]=useState(Boolean(initial.error))
  const [selected,setSelected]=useState(0),[run,setRun]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[importTarget,setImportTarget]=useState(null),[detail,setDetail]=useState(null)
  const controller=useRef(null),live=useRef(true),fileInput=useRef(null)
  useEffect(()=>{onBusyChange(busy)},[busy,onBusyChange])
  useEffect(()=>()=>{live.current=false;if(controller.current){controller.current.abort();window.nikkeDesktop?.damageSimulator?.cancel().catch(()=>{})}onBusyChange(false)},[])
  useEffect(()=>{
    if(storageBlocked)return
    try{localStorage.setItem(SOLO_RAID_KEY,JSON.stringify({version:1,raid,records}))}catch{setError('五队方案尚未保存到本机，请导出备份；已有存储保持不变。')}
  },[raid,records,storageBlocked])
  const loadedLibrary=useRef(null)
  useEffect(()=>{
    if(!libraryLoad||loadedLibrary.current===libraryLoad.nonce)return
    loadedLibrary.current=libraryLoad.nonce
    try {
      if(busy||externalBusy)throw Error('请等待计算结束后加载')
      const next=validateSoloRaidDraft(libraryLoad.payload)
      if(persist(next,records)){
        setRaid(next);setRun(null);setDetail(null);setSelected(0);setEditing(null);setImportTarget(null)
        setStorageBlocked(false);setError('');setNotice('已从方案库加载五队快照。')
      }
    }catch(e){setError(e.message)}
  },[libraryLoad])
  const team=raid.teams[selected],conflicts=soloRaidConflicts(raid),locked=busy||externalBusy||storageBlocked
  const stale=Boolean(run&&JSON.stringify(run.raid)!==JSON.stringify(raid)),activeCount=raid.teams.filter(t=>t.enabled&&t.members.length).length
  const updateTeam=(index,change)=>{if(locked)return;setRaid(r=>({...r,teams:r.teams.map((t,i)=>i===index?change(t):t)}));setNotice('')}
  const add=code=>{
    if(locked)return
    try{
      if(team.members.length>=5)throw Error('本队最多五名角色')
      if(team.members.some(m=>m.code===code))throw Error('该角色已在本队')
      const next=clone(raid);next.teams[selected].members.push(presetMember(code))
      const duplicate=soloRaidConflicts(next)
      if(duplicate.length)throw Error(duplicate[0].message)
      setRaid(next);setError('')
    }catch(e){setError(e.message)}
  }
  const copySingle=()=>{
    if(currentDraft?.members.length!==5)return
    if(team.members.length&&!window.confirm('将用单队页面的五人及养成替换当前队伍；个人突袭共用战斗条件保持不变。'))return
    try{
      const next=clone(raid);next.teams[selected].members=clone(currentDraft.members)
      const duplicate=soloRaidConflicts(next);if(duplicate.length)throw Error(duplicate[0].message)
      setRaid(validateSoloRaidDraft(next));setNotice('已复制单队编队及养成，共用战斗条件保持不变。');setError('')
    }catch(e){setError(e.message)}
  }
  const start=async teamId=>{
    if(controller.current||externalBusy||storageBlocked)return
    setError('');setNotice('')
    try{
      prepareSoloRaidQueue(raid,teamId)
      if(!window.nikkeDesktop?.damageSimulator)throw Error('请在桌面客户端中运行本地计算')
      const abort=new AbortController();controller.current=abort;setBusy(true);setDetail(null)
      try{
        const output=await runSoloRaidBatch(raid,{teamId,signal:abort.signal,simulate:draft=>window.nikkeDesktop.damageSimulator.simulate(draft),onProgress:progress=>{if(live.current)setRun(progress)}})
        if(live.current&&output.error)setError(engineLabel(output.error))
      }finally{controller.current=null;if(live.current)setBusy(false)}
    }catch(e){setError(engineLabel(e.message))}
  }
  const cancel=async()=>{controller.current?.abort();try{await window.nikkeDesktop.damageSimulator.cancel()}catch(e){setError(e.message)}}
  const persist=(nextRaid,nextRecords)=>{
    try{localStorage.setItem(SOLO_RAID_KEY,JSON.stringify({version:1,raid:nextRaid,records:nextRecords}));return true}catch{setError('本机存储空间不足或不可写，本次操作未保存。请先导出方案。');return false}
  }
  const saveRun=()=>{
    if(run?.status!=='completed'||busy)return
    const next=[{...clone(run),id:crypto.randomUUID(),createdAt:new Date().toISOString()},...records].slice(0,10)
    if(persist(raid,next)){setRecords(next);setNotice('已保存本轮输入快照与逐队结果。')}
  }
  const exportFile=()=>{
    try{const snapshot=validateSoloRaidDraft(raid),blob=new Blob([JSON.stringify({format:'nikke-solo-raid',version:1,engine:catalog.commit,raid:snapshot},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='NIKKE-个人突袭五队方案.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e.message)}
  }
  const importFile=async e=>{
    try{
      const file=e.target.files?.[0];if(!file)return;if(file.size>2e6)throw Error('五队方案文件不得超过 2 MB')
      const next=parseSoloRaidFile(await file.text())
      if(!window.confirm('导入将替换个人突袭的五支队伍和共用战斗条件。单队页面、已保存突袭记录及角色档案保持不变。'))return
      if(!persist(next,records))return
      setRaid(next);setRun(null);setDetail(null);setSelected(0);setStorageBlocked(false);setError('');setNotice('五队方案已导入；如存在跨队重复或未完成配置，计算前会提示修正。')
    }catch(err){setError(err.message)}finally{e.target.value=''}
  }
  const resetCorrupt=()=>{if(window.confirm('重置无法读取的个人突袭草稿及其模拟记录？角色档案和单队页面保持不变。')){const next=createSoloRaid();if(persist(next,[])){setRaid(next);setRecords([]);setStorageBlocked(false);setError('')}}}
  const selectedDetail=run?.results.find(item=>item.teamId===detail)
  return <div className="solo-raid-panel">
    <header className="solo-raid-head"><div><h2>个人突袭 · 五队管理</h2><p className="damage-muted">五队共用战斗条件，同一角色不能在参与计算的队伍间重复使用。</p></div><div className="solo-raid-actions"><SaveDamageLibraryButton kind="raid" payload={raid} disabled={busy||externalBusy}/><button disabled={busy||externalBusy} onClick={exportFile}><Icon name="download"/>导出五队</button><button disabled={busy||externalBusy} onClick={()=>fileInput.current.click()}><Icon name="upload"/>导入五队</button><input ref={fileInput} type="file" hidden accept=".json,application/json" onChange={importFile}/></div></header>
    {error&&<div role="alert" className="damage-error">{error}{storageBlocked&&<button onClick={resetCorrupt}>重置模拟草稿</button>}<button aria-label="关闭个人突袭错误" onClick={()=>setError('')}><Icon name="close"/></button></div>}
    {notice&&<p role="status" className="damage-notice">{notice}</p>}
    {externalBusy&&<p className="damage-notice">单队计算正在运行，完成后可开始个人突袭计算。</p>}
    <div className="solo-raid-runbar"><div><strong>{activeCount} 支已配置队伍参与计算</strong><p className="damage-muted">每支非空队伍须编满五人；空队及未勾选队伍不计入总伤害。</p></div><div className="solo-raid-actions">{busy?<button onClick={cancel}>取消本轮计算</button>:<><button disabled={!ready||locked||team.members.length!==5||!team.enabled} onClick={()=>start(team.id)}>计算当前队</button><button className="damage-primary" aria-label="批量计算启用队伍" disabled={!ready||locked} onClick={()=>start(null)}><Icon name="play"/>批量计算</button></>}</div></div>
    <fieldset className="solo-raid-editing" disabled={locked}>
      <label className="damage-field solo-raid-name"><span>个人突袭方案名称</span><input aria-label="个人突袭方案名称" name="solo-raid-name" autoComplete="off" value={raid.name} maxLength={60} onChange={e=>setRaid(r=>({...r,name:e.target.value}))}/></label>
      <div className="solo-raid-team-tabs" aria-label="个人突袭五队">{raid.teams.map((item,i)=><article key={item.id} className={`solo-raid-team-tab ${selected===i?'is-selected':''}`}><button aria-label={`编辑第${i+1}队`} aria-pressed={selected===i} onClick={()=>{setSelected(i);setEditing(null);setImportTarget(null)}}><div><strong>{item.name||`第${i+1}队`}</strong><span>{item.members.length}/5</span></div><div className="solo-raid-miniavatars">{Array.from({length:5},(_,j)=>{const c=CHARACTERS.find(c=>c.nameCode===item.members[j]?.code);return c?<img key={j} src={assetUrl(c.avatar)} width="128" height="128" alt={c.nameCn}/>:<span key={j} aria-hidden="true">—</span>})}</div></button><label className="solo-raid-enabled"><input type="checkbox" aria-label={`第${i+1}队参与计算`} checked={item.enabled} onChange={e=>updateTeam(i,t=>({...t,enabled:e.target.checked}))}/>参与计算</label></article>)}</div>
      {conflicts.length>0&&<div className="damage-error" role="alert">{conflicts.map(c=><p key={c.teamIds.join('-')+c.code}>{c.message}</p>)}</div>}
      <div className="damage-workbench solo-raid-workbench">
        <RaidRoster raid={raid} selected={selected} onAdd={add}/>
        <div className="damage-team-column"><section className="damage-card"><div className="damage-section-title"><h2>编辑第{selected+1}队 <small>{team.members.length}/5</small></h2><div className="solo-raid-actions"><button disabled={currentDraft?.members.length!==5} onClick={copySingle}>使用单队编队</button><button disabled={!team.members.length} onClick={()=>{if(window.confirm(`清空${team.name||'当前队伍'}的模拟编队和养成？`))updateTeam(selected,t=>({...t,members:[]}))}}>清空本队</button></div></div>
          <input className="damage-team-name" aria-label="个人突袭当前队伍名称" name="raid-team-name" autoComplete="off" value={team.name} maxLength={50} onChange={e=>updateTeam(selected,t=>({...t,name:e.target.value}))}/>
          <p className="damage-muted">角色、技能和装备配置独立保存在本队。左右移动可调整同阶段爆裂优先顺序。</p>
          <RaidTeamCards members={team.members} onEdit={index=>setEditing({team:selected,index,code:team.members[index].code})} onRemove={index=>updateTeam(selected,t=>({...t,members:t.members.filter((_,i)=>i!==index)}))} onMove={(index,offset)=>updateTeam(selected,t=>{const members=[...t.members];[members[index],members[index+offset]]=[members[index+offset],members[index]];return {...t,members}})}/>
          <button className="damage-import-button" disabled={!team.members.length} onClick={()=>setImportTarget(selected)}>从本地档案导入本队养成</button>
        </section><p className="damage-muted">新加入角色采用单队页面相同的统一预设。档案导入沿用逐角色只读快照和缺项保护；不会写回角色档案。</p></div>
        <RaidBattle battle={raid.battle} onChange={(key,value)=>setRaid(r=>({...r,battle:{...r.battle,[key]:value}}))}/>
      </div>
    </fieldset>
    {run&&<section className="damage-card solo-raid-summary" aria-label="个人突袭批量结果">
      <div className="damage-section-title"><div><h2>{statusText[run.status]}</h2><p className="damage-muted" role="status">已完成 {run.results.length}/{run.queueIds.length} 队{run.activeTeamId?`，正在计算${run.raid.teams.find(t=>t.id===run.activeTeamId)?.name}`:''}</p></div><button disabled={run.status!=='completed'||busy} onClick={saveRun}>保存本轮结果</button></div>
      {stale&&<p className="damage-notice" role="status">五队配置已修改，下方仍为本轮输入快照的结果，请重新计算。</p>}
      <div className="solo-raid-total"><div><small>{run.status==='completed'?'本轮已计算队伍总伤害':'已完成队伍伤害小计'}</small><strong>{compact(soloRaidTotal(run))}</strong><span>{number(soloRaidTotal(run))}</span></div><p className="damage-muted">计算 {run.queueIds.length} 队，未参与 {5-run.queueIds.length} 队。{run.status!=='completed'?'本轮未完成，不能视作完整五队结果。':'每队结果均使用本轮固定的共用战斗条件。'}</p></div>
      <div className="damage-table-wrap"><table><thead><tr><th>队伍</th><th>状态</th><th>伤害</th><th>详情</th></tr></thead><tbody>{run.raid.teams.map(item=>{const row=run.results.find(r=>r.teamId===item.id),queued=run.queueIds.includes(item.id);return <tr key={item.id}><td>{item.name}</td><td>{row?'已完成':run.activeTeamId===item.id?'计算中':!queued?'未参与':run.status==='running'?'等待中':run.status==='cancelled'?'已取消':'未完成'}</td><td>{row?compact(row.result.total_damage):'—'}</td><td><button disabled={!row} onClick={()=>setDetail(detail===item.id?null:item.id)}>{detail===item.id?'收起明细':'查看明细'}</button></td></tr>})}</tbody></table></div>
      {run.error&&<p className="damage-error">{engineLabel(run.error)}；已完成结果保留，后续队伍未执行。</p>}
    </section>}
    {selectedDetail&&<section className="solo-raid-detail"><h2>{selectedDetail.draft.name} · 本轮结果</h2><DamageResults run={{draft:selectedDetail.draft,result:selectedDetail.result}} stale={stale} records={[]}/></section>}
    <section className="damage-card solo-raid-history"><div className="damage-section-title"><h2>个人突袭记录 <small>{records.length}/10</small></h2></div>{!records.length?<p className="damage-muted">完成计算后保存本轮输入与逐队结果，可在这里恢复和比较。</p>:<div className="damage-table-wrap"><table><thead><tr><th>方案与时间</th><th>计算队数</th><th>总伤害</th><th>本轮相对变化</th><th>操作</th></tr></thead><tbody>{records.map(record=><tr key={record.id}><td><strong>{record.raid.name}</strong><br/><small>{new Date(record.createdAt).toLocaleString('zh-CN')}</small></td><td>{record.results.length}</td><td>{compact(soloRaidTotal(record))}</td><td>{run?.status==='completed'&&soloRaidTotal(record)>0?`${((soloRaidTotal(run)/soloRaidTotal(record)-1)*100).toFixed(2)}%`:'—'}</td><td><div className="solo-raid-actions"><button disabled={busy||externalBusy} onClick={()=>{if(!window.confirm('加载本轮记录将替换个人突袭五队草稿和共用战斗条件。单队页面与角色档案保持不变。'))return;if(persist(record.raid,records)){setRaid(clone(record.raid));setRun(clone(record));setDetail(null);setError('');setStorageBlocked(false)}}}>加载本轮</button><button disabled={busy||externalBusy} onClick={()=>{if(!window.confirm('删除这条个人突袭模拟记录？'))return;const next=records.filter(r=>r.id!==record.id);if(persist(raid,next))setRecords(next)}}>删除</button></div></td></tr>)}</tbody></table></div>}<p className="damage-muted">队数、养成或敌人条件不同会影响比较；请先加载对应记录核对。</p></section>
    {editing&&raid.teams[editing.team].members[editing.index]?.code===editing.code&&<MemberEditor member={raid.teams[editing.team].members[editing.index]} onClose={()=>setEditing(null)} onSave={member=>{updateTeam(editing.team,t=>({...t,members:t.members.map((m,i)=>i===editing.index?member:m)}));setEditing(null)}}/>}
    {importTarget!==null&&<ProfileImport members={raid.teams[importTarget].members} onClose={()=>setImportTarget(null)} onImport={member=>{updateTeam(importTarget,t=>({...t,members:t.members.map(m=>m.code===member.code?member:m)}));setImportTarget(null);setNotice('本队角色已导入已保存档案快照。')}}/>}
  </div>
}
