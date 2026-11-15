export function buildDamageTimeline(result) {
  const duration=result.duration, events=result.desktop?.events||{}
  const horizon=key=>events[key]?.truncated?Math.min(duration,events[key].rows.at(-1)?.t??0):duration
  const lanes=[],warnings=[]
  for(const [key,group] of Object.entries(events))if(['buffs','ammo','reload'].includes(key)&&group.truncated)warnings.push(key+'：共'+group.total+'条，只保留前'+group.rows.length+'条；图形在最后记录时刻截止。')
  const buffLanes=new Map(),active=new Map()
  const baseKey=e=>JSON.stringify([e.name,e.caster,e.target])
  for(const e of events.buffs?.rows||[]) {
    const base=baseKey(e),key=JSON.stringify([e.name,e.caster,e.target,e.stat??''])
    if(e.kind==='activate') {
      if(!buffLanes.has(key))buffLanes.set(key,{kind:'buff',label:e.name+' · '+(e.stat||'效果'),caster:e.caster,target:e.target,segments:[]})
      const prev=active.get(key)
      if(prev)prev.end=Math.max(prev.start,Math.min(prev.end,e.t))
      const segment={start:e.t,end:Math.max(e.t,Math.min(e.expires_at??duration,horizon('buffs'))),value:e.value,base,detail:e.expires_at==null?'记录为永久':'预计到期 '+e.expires_at+' 秒'}
      buffLanes.get(key).segments.push(segment);active.set(key,segment)
    } else if(e.kind==='expire') {
      // Upstream expiry has no stat or effect instance ID. Close matching named lanes.
      for(const [id,segment] of active)if(segment.base===base&&(e.stat==null||id===key)){
        segment.end=Math.max(segment.start,Math.min(segment.end,e.t));active.delete(id)
      }
    }
  }
  lanes.push(...buffLanes.values())
  for(const member of result.members) {
    const caster=member.name,segments=[]
    let open=null
    for(const e of events.reload?.rows||[])if(e.caster===caster) {
      if(e.event.startsWith('재장전 시작')) {
        if(open){open.end=e.t;open.detail='再次开始前的区间';segments.push(open)}
        open={start:e.t,end:horizon('reload'),detail:'未记录到结束',open:true}
      } else if(e.event.includes('완료')||e.event.includes('취소')) {
        if(open){open.end=e.t;open.detail=e.event.includes('취소')?'取消装填':'完成装填';open.open=false;segments.push(open);open=null}
      }
    }
    if(open)segments.push(open)
    if(segments.length)lanes.push({kind:'reload',label:'装填',caster,segments})
    const points=(events.ammo?.rows||[]).filter(e=>e.caster===caster)
    if(points.length)lanes.push({kind:'ammo',label:'剩余弹药',caster,points,horizon:horizon('ammo'),segments:[]})
  }
  const bursts=result.desktop?.burst||[],segments=[],marks=[]
  let open=null
  const burstEnd=bursts.length>=3000?bursts.at(-1).t:duration
  if(bursts.length>=3000)warnings.push('爆裂日志达到3000条保留上限，时间线在最后记录时刻截止。')
  for(const e of bursts) {
    if(e.event==='full_burst 시작') {
      if(open){open.end=e.t;segments.push(open)}
      open={start:e.t,end:burstEnd,detail:'全面爆裂',open:true}
    } else if(e.event==='full_burst 종료') {
      if(open){open.end=e.t;open.open=false;segments.push(open);open=null}
    } else marks.push(e)
  }
  if(open)segments.push(open)
  lanes.unshift({kind:'burst',label:'全面爆裂',caster:'',segments})
  for(const member of result.members) {
    const points=marks.filter(e=>e.caster===member.name)
    if(points.length)lanes.push({kind:'burst',label:'爆裂发动',caster:member.name,marks:points,segments:[]})
  }
  return {lanes,warnings}
}
