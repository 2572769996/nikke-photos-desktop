import {useEffect, useId, useRef, useState} from 'react'
import {clone, compact, useDialogFocus} from './DamageSimulatorShared.jsx'
import {LIBRARY_KINDS, LIBRARY_FILE_LIMIT} from '../lib/damageLibraryModel.js'
import {listDamageLibrary, subscribeDamageLibrary, getDamageLibraryItem, saveDamageLibraryItem, updateDamageLibraryMetadata, deleteDamageLibraryItem, saveDamageLibraryFolder, deleteDamageLibraryFolder, exportDamageLibrary, importDamageLibrary} from '../lib/damageLibraryStore.js'
import '../styles/damageLibrary.css'

function useLibrary() {
  const [data,setData]=useState({entries:[],folders:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const refreshRef=useRef(()=>{})
  useEffect(()=>{
    let alive=true,sequence=0
    const refresh=async()=>{
      const current=++sequence
      try {const next=await listDamageLibrary();if(alive&&current===sequence){setData(next);setError('');setLoading(false)}}
      catch(e){if(alive&&current===sequence){setError(e.message);setLoading(false)}}
    }
    refreshRef.current=refresh
    const unsubscribe=subscribeDamageLibrary(refresh)
    refresh()
    return()=>{alive=false;unsubscribe()}
  },[])
  return {...data,error,loading,refresh:()=>refreshRef.current()}
}

function LibraryEditor({item,folders,entries=[],kind,folderOnly=false,onClose,onSubmit}) {
  const [title,setTitle]=useState(item?.title||item?.name||''),[note,setNote]=useState(item?.note||''),[folderId,setFolderId]=useState(item?.folderId||'')
  const [target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const submitting=useRef(false),id=useId()
  const close=()=>{if(!submitting.current)onClose()}
  const ref=useDialogFocus(close,error)
  const submit=async event=>{
    event.preventDefault()
    if(submitting.current)return
    submitting.current=true;setBusy(true);setError('')
    try {await onSubmit({title,note,folderId},entries.find(entry=>entry.id===target));onClose()}
    catch(e){setError(e.message)}
    finally{submitting.current=false;setBusy(false)}
  }
  return <div className="damage-modal-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="damage-dialog damage-library-dialog">
    <header><h2 id={id}>{folderOnly?'文件夹设置':'保存方案信息'}</h2><button disabled={busy} onClick={close}>关闭</button></header>
    <form onSubmit={submit}><fieldset disabled={busy}>
      {entries.length>0&&<label className="damage-field"><span>保存位置</span><select value={target} onChange={event=>{const next=entries.find(entry=>entry.id===event.target.value);setTarget(event.target.value);if(next){setTitle(next.title);setNote(next.note);setFolderId(next.folderId)}}}>
        <option value="">另存为新条目</option>{entries.filter(entry=>entry.kind===kind).map(entry=><option key={entry.id} value={entry.id}>覆盖：{entry.title} · {new Date(entry.updatedAt).toLocaleString('zh-CN')}</option>)}
      </select></label>}
      <label className="damage-field"><span>{folderOnly?'文件夹名称':'方案名称'}</span><input required maxLength={folderOnly?60:100} value={title} onChange={event=>setTitle(event.target.value)}/></label>
      {!folderOnly&&<><label className="damage-field"><span>备注</span><textarea maxLength={2000} rows={4} value={note} onChange={event=>setNote(event.target.value)}/></label>
      <label className="damage-field"><span>文件夹</span><select value={folderId} onChange={event=>setFolderId(event.target.value)}><option value="">未分组</option>{folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label></>}
      {target&&<p className="damage-notice">保存后将替换所选条目的快照及信息。</p>}
    </fieldset>{error&&<p className="damage-error" role="alert" tabIndex={-1}>{error}</p>}
    <footer><button type="button" disabled={busy} onClick={close}>取消</button><button className="damage-primary" disabled={busy||!title.trim()} type="submit">{busy?'保存中…':'确认保存'}</button></footer></form>
  </section></div>
}

export function SaveDamageLibraryButton({kind,payload,disabled=false,label='保存到方案库'}) {
  const [snapshot,setSnapshot]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false)
  const opening=useRef(false)
  const open=async()=>{
    if(disabled||opening.current)return
    opening.current=true;setLoading(true);setError('');setNotice('')
    const frozen=clone(payload)
    try{const next=await listDamageLibrary();setData(next);setSnapshot(frozen)}
    catch(e){setError(e.message)}
    finally{opening.current=false;setLoading(false)}
  }
  return <span className="damage-library-save"><button disabled={disabled||loading||!payload} onClick={open}>{loading?'读取方案库…':label}</button>
    {error&&<span className="damage-error" role="alert">{error}</span>}{notice&&<span className="damage-muted">{notice}</span>}
    {snapshot&&data&&<LibraryEditor item={{title:snapshot.name||snapshot.workspace?.name||'比较记录'}} folders={data.folders} entries={data.entries} kind={kind} onClose={()=>setSnapshot(null)} onSubmit={async(fields,target)=>{
      await saveDamageLibraryItem({...fields,kind,payload:snapshot,...(target?{id:target.id,revision:target.revision}:{})})
      setNotice('已保存到方案库')
    }}/>}
  </span>
}

const statusText={completed:'已完成',cancelled:'已取消',failed:'失败 · 部分结果',interrupted:'已中断'}
function summaryText(item) {
  const s=item.summary||{}
  if(s.experiment==='random')return `${statusText[s.status]||s.status} · ${s.completed}/${s.total} 个随机样本 · 均值 ${s.mean==null?'—':compact(s.mean)}`
  if(item.kind==='single')return `${s.members} 名角色 · ${s.duration} 秒`
  if(item.kind==='raid')return `${s.teams} 支非空队伍 · 每队 ${s.duration} 秒`
  if(item.kind==='comparison')return `${s.candidates} 个候选 · ${s.duration} 秒`
  return `${statusText[s.status]||s.status} · ${s.completed}/${s.total} 项 · 最高 ${s.best==null?'—':compact(s.best)}`
}
export default function DamageLibraryPanel({disabled,onLoad}) {
  const library=useLibrary()
  const [query,setQuery]=useState(''),[kind,setKind]=useState(''),[folderId,setFolderId]=useState('*')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(null)
  const input=useRef(null),working=useRef(false),disabledRef=useRef(disabled)
  disabledRef.current=disabled
  const locked=disabled||busy
  const act=async action=>{
    if(working.current||disabledRef.current)return
    working.current=true;setBusy(true);setError('');setNotice('')
    try {await action()}catch(e){setError(e.message)}
    finally{working.current=false;setBusy(false)}
  }
  const rows=library.entries.filter(item=>(!kind||item.kind===kind)&&(folderId==='*'||item.folderId===folderId)&&
    [item.title,item.note,library.folders.find(folder=>folder.id===item.folderId)?.name||''].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const selectedFolder=library.folders.find(folder=>folder.id===folderId)
  const importFile=event=>{
    const file=event.target.files?.[0];event.target.value=''
    if(!file)return
    act(async()=>{
      if(file.size>LIBRARY_FILE_LIMIT)throw Error('方案库备份不得超过256 MB')
      const data=JSON.parse(await file.text())
      const count=await importDamageLibrary(data)
      setNotice(`已追加导入 ${count} 个条目，原有条目保持不变。`)
    })
  }
  return <div className="damage-library">
    <section className="damage-card"><div className="library-actions"><h2>模拟方案与记录</h2>
      <button disabled={locked||library.loading||!!library.error} onClick={()=>setEditor({mode:'folder'})}>新建文件夹</button>
      <button disabled={locked||library.loading||!!library.error} onClick={()=>act(async()=>{
        const text=await exportDamageLibrary(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}))
        const a=document.createElement('a');a.href=url;a.download='NIKKE-方案库备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
        setNotice('备份已生成，请保留下载的JSON文件。')
      })}>导出整库备份</button>
      <button disabled={locked||library.loading||!!library.error} onClick={()=>input.current.click()}>追加导入备份</button>
      <input ref={input} type="file" hidden accept=".json,application/json" onChange={importFile}/>
    </div><p className="damage-muted">保存编队、养成与比较快照，重启后可继续查看。条目不自动淘汰；存于本机，建议定期导出备份。比较记录保留计算时已输出的日志，原有日志截断限制不变。</p>
      {disabled&&<p className="damage-notice">计算或存档期间暂停方案库操作。</p>}
      {(error||library.error)&&<div className="damage-error" role="alert">{error||library.error}<button disabled={locked} onClick={library.refresh}>重新读取</button></div>}
      {notice&&<p className="damage-notice" role="status">{notice}</p>}
      <div className="library-filters">
        <label className="damage-field"><span>搜索名称、备注或文件夹</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索方案库"/></label>
        <label className="damage-field"><span>类型</span><select value={kind} onChange={event=>setKind(event.target.value)}><option value="">全部类型</option>{Object.entries(LIBRARY_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="damage-field"><span>查看文件夹</span><select value={folderId} onChange={event=>setFolderId(event.target.value)}><option value="*">全部文件夹</option><option value="">未分组</option>{library.folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
      </div>
      {selectedFolder&&<div className="library-actions"><button disabled={locked} onClick={()=>setEditor({mode:'folder',item:selectedFolder})}>重命名文件夹</button><button disabled={locked} onClick={()=>act(async()=>{
        if(!window.confirm('删除此文件夹？其中所有条目将移至未分组，不会删除方案或记录。'))return
        await deleteDamageLibraryFolder(selectedFolder);setFolderId('*');setNotice('文件夹已删除，条目已移至未分组。')
      })}>删除文件夹</button></div>}
    </section>
    <p className="damage-muted">{library.loading?'正在读取方案库…':`显示 ${rows.length} / ${library.entries.length} 个条目`}</p>
    {!library.loading&&!rows.length&&<section className="damage-card"><h3>{library.entries.length?'没有匹配的方案':'还没有保存的方案'}</h3><p>在单队、个人突袭或比较工作台点击“保存到方案库”。运行比较时会自动保存比较记录。</p></section>}
    <div className="library-grid">{rows.map(item=><article className="damage-card library-entry" key={item.id} data-kind={item.kind}>
      <div className="library-entry-meta"><span>{LIBRARY_KINDS[item.kind]}</span><span>{library.folders.find(folder=>folder.id===item.folderId)?.name||'未分组'}</span></div>
      <h3>{item.title}</h3><p className="damage-muted">{summaryText(item)}</p>{item.note&&<p className="library-note">{item.note}</p>}
      <small>更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</small>
      <div className="library-actions">
        <button className="damage-primary" disabled={locked} onClick={()=>act(async()=>{
          const full=await getDamageLibraryItem(item.id)
          if(disabledRef.current)throw Error('请等待计算或存档完成')
          if(window.confirm('加载将替换对应工作台的当前草稿；方案库中的原条目仍保留。是否继续？'))onLoad(full)
        })}>{item.kind==='comparison-record'?'恢复比较记录':'加载方案'}</button>
        <button disabled={locked} onClick={()=>setEditor({mode:'metadata',item})}>编辑信息</button>
        <button disabled={locked} onClick={()=>act(async()=>{
          const full=await getDamageLibraryItem(item.id)
          setEditor({mode:'copy',item:{...full,title:(full.title+' · 副本').slice(0,100)}})
        })}>复制</button>
        <button disabled={locked} onClick={()=>act(async()=>{
          if(!window.confirm('确定删除“'+item.title+'”？此操作无法撤销，可先导出备份。'))return
          await deleteDamageLibraryItem(item);setNotice('条目已删除。')
        })}>删除</button>
      </div>
    </article>)}</div>
    {editor&&<LibraryEditor item={editor.item} folders={library.folders} folderOnly={editor.mode==='folder'} onClose={()=>setEditor(null)} onSubmit={async fields=>{
      if(disabledRef.current)throw Error('请等待计算或存档完成')
      if(editor.mode==='folder')await saveDamageLibraryFolder(fields.title,editor.item)
      else if(editor.mode==='metadata')await updateDamageLibraryMetadata(editor.item,fields)
      else await saveDamageLibraryItem({...fields,kind:editor.item.kind,payload:editor.item.payload})
      setNotice('已保存。')
    }}/>}
  </div>
}
