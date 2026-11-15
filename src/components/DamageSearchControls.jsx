import {DAMAGE_CATALOG,entryFor} from '../lib/damageSimulator.js'
import {OPERATION_FIELDS} from '../lib/damageExperiments.js'
export const defaultCubeSearch = () => ({codes:[],cubes:DAMAGE_CATALOG.cubes.filter(c=>c.engineName&&!c.limited).slice(0,2).map(c=>({id:c.id,level:15,capacity:5}))})
export default function DamageSearchControls({kind,baseline,cubes,onCubes,dimensions,onDimensions}) {
  const supported=DAMAGE_CATALOG.cubes.filter(c=>c.engineName&&!c.limited)
  if(kind==='cubeSearch')return <div className="damage-search-controls">
    <p>选择参与组合的成员；未勾选成员保持原魔方，并计入可装备人数。等级与人数由你按实际持有情况填写。</p>
    <div className="growth-selection">{baseline.members.map(m=><label key={m.code}><input type="checkbox" checked={cubes.codes.includes(m.code)} onChange={e=>onCubes({...cubes,codes:e.target.checked?[...cubes.codes,m.code]:cubes.codes.filter(c=>c!==m.code)})}/>{entryFor(m.code).name}</label>)}</div>
    <div className="damage-table-wrap"><table><thead><tr><th>候选魔方</th><th>等级</th><th>全队可装备人数</th></tr></thead><tbody>{supported.map(c=>{
      const item=cubes.cubes.find(x=>x.id===c.id)
      const change=(key,value)=>onCubes({...cubes,cubes:cubes.cubes.map(x=>x.id===c.id?{...x,[key]:Number(value)}:x)})
      return <tr key={c.id}><td><label><input type="checkbox" checked={!!item} onChange={e=>onCubes({...cubes,cubes:e.target.checked?[...cubes.cubes,{id:c.id,level:15,capacity:5}]:cubes.cubes.filter(x=>x.id!==c.id)})}/>{c.name}</label></td><td><input aria-label={c.name+'等级'} type="number" min="1" max="15" disabled={!item} value={item?.level??15} onChange={e=>change('level',e.target.value)}/></td><td><input aria-label={c.name+'可装备人数'} type="number" min="0" max="5" disabled={!item} value={item?.capacity??5} onChange={e=>change('capacity',e.target.value)}/></td></tr>
    })}</tbody></table></div>
    <p className="damage-muted">原始组合空间 {Math.pow(cubes.cubes.length,cubes.codes.length)}。最多240种，先按人数筛选，再去除与基准或已有候选相同的输入。</p>
  </div>
  const change=(index,key,value)=>onDimensions(dimensions.map((d,i)=>i===index?{...d,[key]:value}:d))
  return <div className="damage-search-controls">
    <p>每行是一项搜索维度，逗号分隔候选值，多行取全部组合。其他参数保持基准配置。速射需同时启用速射开关，装填提前量需配合装填策略。</p>
    {dimensions.map((d,i)=><div className="damage-fields" key={i}>
      <label className="damage-field"><span>搜索成员 {i+1}</span><select value={d.code} onChange={e=>change(i,'code',e.target.value)}>{baseline.members.map(m=><option key={m.code} value={m.code}>{entryFor(m.code).name}</option>)}</select></label>
      <label className="damage-field"><span>搜索参数 {i+1}</span><select value={d.field} onChange={e=>onDimensions(dimensions.map((row,j)=>j===i?{...row,field:e.target.value,values:OPERATION_FIELDS[e.target.value][1]==='cycles'?'all;1,3;2,4':OPERATION_FIELDS[e.target.value][1]==='boolean'?'false,true':Array.isArray(OPERATION_FIELDS[e.target.value][1])?OPERATION_FIELDS[e.target.value][1].join(','):'0'}:row))}>{Object.entries(OPERATION_FIELDS).map(([key,[label]])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label className="damage-field"><span>候选值 {i+1}</span><input value={d.values} onChange={e=>change(i,'values',e.target.value)}/><small>{OPERATION_FIELDS[d.field][1]==='cycles'?'all 全部轮次；分号分隔方案，如 all;1,3;2,4':Array.isArray(OPERATION_FIELDS[d.field][1])?OPERATION_FIELDS[d.field][1].join(' / '):OPERATION_FIELDS[d.field][1]==='boolean'?'false 关闭 / true 开启':'数值用逗号分隔，单位同角色操作配置'}</small></label>
      <button onClick={()=>onDimensions(dimensions.filter((_,j)=>i!==j))}>移除维度 {i+1}</button>
    </div>)}
    <button disabled={dimensions.length>=12} onClick={()=>onDimensions([...dimensions,{code:baseline.members[0].code,field:'burstDelay',values:'0,0.5,1'}])}>添加搜索维度</button>
    <p className="damage-muted">仅搜索已列出的范围，结果为该范围内最高伤害方案。任一组合不符合上游输入约束时整批拒绝，请调整参数后再生成。随机模式排名受单次种子影响。</p>
  </div>
}
