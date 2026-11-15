import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOURS, baseRates, emptyPlanner, parsePlanner, decodePlanner, levelCost, totalCost, reachLevel, chooseBoxes, openingPlan, allocateChoices, analyzePlanner } from '../src/lib/synchroPlanner.js'

test('Prydwen 分段：跨档逐级累计，不拿当前单级成本乘级数', () => {
  assert.deepEqual(levelCost(350), [3809800, 50478800, 10000])
  assert.deepEqual(levelCost(351), [4762250, 56536256, 11000])
  assert.deepEqual(totalCost(399, 401), [10715063, 118160775, 23000])
  assert.equal(reachLevel(399, 22999, 2).level, 400)
  assert.equal(reachLevel(399, 23000, 2).level, 401)
  assert.equal(reachLevel(999, 20000, 2).next, null)
  assert.throws(() => levelCost(1001))
})

test('复用基地表、数量单位、非法草稿与独立恢复', () => {
  assert.deepEqual(baseRates(483), [57260, 570220, 88.18])
  const form = emptyPlanner()
  form.cash = ['7M', '1亿', '10K']
  assert.deepEqual(parsePlanner(form).value.cash, [7000000, 100000000, 10000])
  assert.deepEqual(decodePlanner(JSON.stringify(form)), form)
  form.boxes[2][5] = '-321'
  assert.ok(parsePlanner(form).errors.some(error => error.includes('芯尘 1 小时箱')))
  form.current = ''
  assert.ok(parsePlanner(form).errors.some(error => error.includes('当前同步等级')))
  assert.throws(() => decodePlanner('{"boxes":[]}'))
})

test('小数单位精确换算为整数，真正的非整数资源仍拒绝', () => {
  const form = emptyPlanner()
  for (const [text, expected] of [['1.001K',1001],['2.01M',2010000],['1.07B',1070000000],['0.07万',700],['0.29亿',29000000],['2.03k',2030],['2.05m',2050000],['1.07b',1070000000]]) {
    form.cash[0] = text
    const parsed = parsePlanner(form)
    assert.deepEqual(parsed.errors, [], text)
    assert.equal(parsed.value.cash[0], expected, text)
  }
  for (const text of ['1.0001K','0.0000001M','0.00001万','1.5']) {
    form.cash[0] = text
    assert.ok(parsePlanner(form).errors.some(error => error.includes('信用点现有数量')), text)
  }
  form.cash[0] = '0'
  form.customRates = true
  form.rates = ['57.26K','570.22K','88.18']
  assert.deepEqual(parsePlanner(form).value.rates, [57260,570220,88.18])
  assert.deepEqual(parsePlanner(form).errors, [])
})

function bruteBoxes(counts, target, policy) {
  let best
  const prefer = (a, b) => {
    if (policy === 'fewest' && a.reduce((x,y) => x+y) !== b.reduce((x,y) => x+y)) return a.reduce((x,y) => x+y) < b.reduce((x,y) => x+y)
    for (const i of policy === 'small' ? [5,4,3,2,1,0] : [0,1,2,3,4,5]) if (a[i] !== b[i]) return a[i] > b[i]
    return false
  }
  function visit(i, used, hours) {
    if (i === 6) {
      if (hours >= target && (!best || hours < best.hours || (hours === best.hours && prefer(used,best.used)))) best = { hours, used }
      return
    }
    for (let n = 0; n <= counts[i]; n++) visit(i+1,[...used,n],hours+n*HOURS[i])
  }
  visit(0,[],0)
  return best || { used:counts, hours:counts.reduce((n,c,i)=>n+c*HOURS[i],0) }
}

test('普通箱最小耗时与大小箱优先，和穷举所有组合对照', () => {
  // 12+8+8 的库存达到16小时应开8+8，而非贪心12+8。
  assert.deepEqual(chooseBoxes([0,1,2,0,0,0],16).used,[0,0,2,0,0,0])
  for (const counts of [[1,2,3,2,1,2],[0,1,2,0,0,0],[3,0,0,0,0,49],[0,4,0,0,13,0]]) {
    for (const target of [0,1,16,23,24,25,47,48,49,90,150]) for (const policy of ['large','small','fewest']) {
      assert.deepEqual(chooseBoxes(counts,target,policy),bruteBoxes(counts,target,policy),`${counts}/${target}/${policy}`)
    }
  }
  assert.equal(chooseBoxes(HOURS.map(()=>1000000),1234567).hours,1234567)
})

test('保留一箱、库存不足与已有资源够用时不多开箱', () => {
  const plan = openingPlan([0,0,0,0,2,1],0,500,100,true,'large')
  assert.deepEqual(plan.used,[0,0,0,0,1,0])
  assert.equal(plan.deficit,300)
  assert.ok(plan.used.every(n=>n>=0))
  assert.deepEqual(openingPlan([2,2,2,2,2,2],1000,900,88.18,true,'small').used,[0,0,0,0,0,0])
  assert.equal(openingPlan([0,0,0,0,0,5],0,264.54,88.18,false,'fewest').hours,3)
})

test('特殊箱分配可行性与枚举全部月卡分配对照', () => {
  for (const required of [[1,11,21],[12,12,12],[0,0,0],[33,7,19],[1,1,1]]) for (let m=0;m<=5;m++) for (let c=0;c<=5;c++) {
    let feasible = false
    for (let a=0;a<=m;a++) for (let b=0;b<=m-a;b++) for (let d=0;d<=m-a-b;d++) {
      if ([a,b,d].reduce((s,n,i)=>s+Math.max(0,required[i]-10*n),0)<=c) feasible=true
    }
    const actual = allocateChoices(required,m,c)
    assert.equal(actual.feasible,feasible,`${required}/${m}/${c}`)
    if (feasible) {
      assert.ok(actual.monthly.reduce((a,b)=>a+b)<=m)
      assert.ok(actual.choice.reduce((a,b)=>a+b)<=c)
      assert.ok(required.every((n,i)=>actual.monthly[i]*10+actual.choice[i]>=n))
    }
  }
})

test('三资源共同上限、特殊箱独立计算且不重复计入目标方案', () => {
  const input = {current:399,target:401,cash:[10715063,118160775,22000],boxes:HOURS.map(()=>0),rates:[100,100,100],monthly:1,choice:0,reserve:false}
  input.boxes = [HOURS.map(()=>0),HOURS.map(()=>0),HOURS.map(()=>0)]
  const result = analyzePlanner(input)
  assert.equal(result.joint,400)
  assert.equal(result.special.level,401)
  assert.deepEqual(result.special.monthly,[0,0,1])
  assert.equal(result.plans[0][2].deficit,1000)
  assert.equal(result.catchHours[2],10)
  assert.equal(input.monthly,1)
})
