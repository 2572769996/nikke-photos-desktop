import {Field, Select, memberName} from './DamageSimulatorShared.jsx'
import {GROWTH_PROJECTS} from '../lib/damageGrowth.js'

export default function TeamGrowthControls({baseline, options, onChange}) {
  const selectedCodes = options.codes ?? baseline.members.map(member => member.code)
  const toggle = (values, value, enabled) => enabled ? [...values,value] : values.filter(item => item !== value)
  return <div className="team-growth-controls">
    <Select label="养成比较方式" value={options.mode} onChange={mode => onChange({...options,mode})}>
      <option value="target">升至指定目标</option>
      <option value="next">逐项升一级</option>
    </Select>
    <fieldset className="growth-selection"><legend>参与比较的成员</legend>
      {baseline.members.map(member => <label className="damage-checkbox" key={member.code}>
        <input type="checkbox" checked={selectedCodes.includes(member.code)} onChange={event => onChange({...options,codes:toggle(selectedCodes,member.code,event.target.checked)})}/>
        {memberName(member.code)}
      </label>)}
    </fieldset>
    <fieldset className="growth-selection"><legend>养成项目</legend>
      {GROWTH_PROJECTS.map(project => <label className="damage-checkbox" key={project.id}>
        <input type="checkbox" checked={options.projects.includes(project.id)} onChange={event => onChange({...options,projects:toggle(options.projects,project.id,event.target.checked)})}/>
        {project.label}
      </label>)}
    </fieldset>
    {options.mode === 'target' && <div className="damage-fields">
      {GROWTH_PROJECTS.filter(project => options.projects.includes(project.id)).map(project => project.id === 'collection'
        ? <Select key={project.id} label="收藏品目标" value={options.targets.collection} onChange={collection => onChange({...options,targets:{...options.targets,collection}})}>
          {['R','SR'].flatMap(rarity => Array.from({length:16},(_,level) => <option key={rarity+level} value={rarity+level}>{rarity}{level}</option>))}
        </Select>
        : <Field key={project.id} label={project.label+'目标'} min={project.min} max={project.max} value={options.targets[project.id]} onChange={value => onChange({...options,targets:{...options.targets,[project.id]:value}})}/>)}
    </div>}
    <p className="damage-muted">每项提升独立与基准比较。目标请按角色实际可达养成填写，已达到目标的项目自动跳过。分部位装备逐件评估，统一改造装备配置按四件一起提升。</p>
    {options.mode === 'next' && <p className="damage-muted">收藏品在当前品质内升一级，满级或未装备时可改用指定目标。装备强化支持企业与改造装备。</p>}
  </div>
}
