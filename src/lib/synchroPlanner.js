import outpost from '../../tools/core-dust/public/json/outpost.json' with { type: 'json' }

export const HOURS = [24, 12, 8, 4, 2, 1]
export const RESOURCES = [
  { id: 'credit', name: '信用点', field: 'credit', color: '#c78a10' },
  { id: 'battle', name: '战斗数据辑', field: 'battle_data_set', color: '#1687c4' },
  { id: 'core', name: '芯尘', field: 'core_dust', color: '#dc467d' },
]
export const MAX_LEVEL = 1000
export const STORAGE_KEY = 'nikke-tools:synchro-planner:v1'
// Prydwen 的分段按“升到的等级”查表；800+ 在此只计算至 1000。
const COSTS = [
  [250, 1694200, 20944600, 10000], [300, 3134000, 39883600, 10000],
  [350, 3809800, 50478800, 10000], [400, 4762250, 56536256, 11000],
  [450, 5952813, 61624519, 12000], [500, 7441016, 67170726, 13000],
  [550, 8185117, 72544384, 14000], [600, 9003629, 78347935, 15000],
  [650, 9453810, 83832290, 16000], [700, 9926501, 89700550, 17000],
  [750, 10422826, 95082583, 18000], [800, 10943967, 100787538, 19000],
  [1000, 11491166, 105826915, 20000],
]
const sum = xs => xs.reduce((a, b) => a + b, 0)
const cents = value => Math.round(value * 100)
const clean = value => cents(value) / 100

export function parseQuantity(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)([kKmMbB万亿]?)$/)
  if (!match) return NaN
  const exponent = { k: 3, m: 6, b: 9, 万: 4, 亿: 8 }
  // 连同十进制倍率一次解析，避免先转浮点再相乘使合法整数偏移。
  return Number(`${match[1]}e${exponent[match[2].toLowerCase()] ?? 0}`)
}

export function baseRates(level, academy = true) {
  const row = outpost.outpost.find(item => item.level === level)
  if (!row) throw Error('基地等级须在 1～800 级之间。')
  return RESOURCES.map(resource => parseQuantity(row[resource.field + (academy ? '_mul' : '')]))
}

export function emptyPlanner() {
  return { current: '200', target: '201', base: '1', academy: true, customRates: false,
    rates: ['0', '0', '0'], cash: ['0', '0', '0'], boxes: RESOURCES.map(() => HOURS.map(() => '0')),
    monthly: '0', choice: '0', reserve: true }
}

export function decodePlanner(text) {
  const value = JSON.parse(text)
  const template = emptyPlanner()
  if (!value || Object.keys(template).some(key => typeof value[key] !== typeof template[key]) ||
    ![value.rates, value.cash].every(row => Array.isArray(row) && row.length === 3 && row.every(cell => typeof cell === 'string')) ||
    !Array.isArray(value.boxes) || value.boxes.length !== 3 || !value.boxes.every(row => Array.isArray(row) && row.length === 6 && row.every(cell => typeof cell === 'string'))) throw Error('升级规划草稿格式无效。')
  return value
}

export function parsePlanner(form) {
  const errors = []
  function number(value, name, min, max, integer = true) {
    const result = parseQuantity(value)
    if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isSafeInteger(result))) errors.push(`${name}须为 ${min}～${max} 的${integer ? '整数' : '数值'}。`)
    return result
  }
  const current = number(form.current, '当前同步等级', 200, MAX_LEVEL)
  const target = number(form.target, '目标等级', 200, MAX_LEVEL)
  const base = number(form.base, '基地等级', 1, 800)
  if (target < current) errors.push('目标等级不能低于当前等级。')
  const cash = form.cash.map((value, i) => number(value, `${RESOURCES[i].name}现有数量`, 0, 1e12))
  const boxes = form.boxes.map((row, i) => row.map((value, j) => number(value, `${RESOURCES[i].name} ${HOURS[j]} 小时箱`, 0, 1e6)))
  const monthly = number(form.monthly, '大月卡箱数量', 0, 1e6)
  const choice = number(form.choice, '三选一箱数量', 0, 1e6)
  let rates
  if (form.customRates) {
    rates = form.rates.map((value, i) => number(value, `${RESOURCES[i].name}每小时产出`, 0.01, 1e6, false))
    if (rates.some(value => Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) errors.push('每小时产出最多保留两位小数。')
  } else if (Number.isInteger(base) && base >= 1 && base <= 800) rates = baseRates(base, form.academy)
  return { errors, value: { current, target, base, cash, boxes, rates, monthly, choice, reserve: form.reserve } }
}

export function levelCost(destination) {
  if (!Number.isInteger(destination) || destination <= 200 || destination > MAX_LEVEL) throw Error('升级消耗数据仅覆盖升至 201～1000 级。')
  return COSTS.find(row => destination <= row[0]).slice(1)
}

export function totalCost(current, target) {
  const cost = [0, 0, 0]
  for (let level = current + 1; level <= target; level++) levelCost(level).forEach((value, i) => { cost[i] += value })
  return cost
}

export function reachLevel(current, amount, resource) {
  let level = current
  let remaining = amount
  while (level < MAX_LEVEL && cents(remaining) >= levelCost(level + 1)[resource] * 100) {
    remaining = clean(remaining - levelCost(++level)[resource])
  }
  const next = level < MAX_LEVEL ? levelCost(level + 1)[resource] : null
  return { level, remaining, next, fraction: next === null ? null : remaining / next }
}

function preferred(a, b, policy) {
  if (!b) return true
  if (policy === 'fewest' && sum(a) !== sum(b)) return sum(a) < sum(b)
  const order = policy === 'small' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5]
  for (const i of order) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

// 各档都整除 24；整组压缩为 24 小时，保留一组用于拆零，避免按百万箱枚举。
export function chooseBoxes(counts, neededHours, policy = 'fewest') {
  const availableHours = sum(counts.map((count, i) => count * HOURS[i]))
  if (neededHours <= 0) return { used: HOURS.map(() => 0), hours: 0 }
  if (availableHours < neededHours) return { used: [...counts], hours: availableHours }
  const groups = counts.map((count, i) => Math.max(0, Math.floor(count / (24 / HOURS[i])) - 1))
  const small = counts.map((count, i) => count - groups[i] * (24 / HOURS[i]))
  let states = new Map([[0, HOURS.map(() => 0)]])
  small.forEach((count, i) => {
    const next = new Map()
    for (const [hours, used] of states) for (let n = 0; n <= count; n++) {
      const total = hours + n * HOURS[i]
      const candidate = [...used]; candidate[i] = n
      if (preferred(candidate, next.get(total), policy)) next.set(total, candidate)
    }
    states = next
  })
  let best
  const order = policy === 'small' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5]
  for (const [partialHours, partial] of states) {
    let full = Math.max(0, Math.ceil((neededHours - partialHours) / 24))
    if (full > sum(groups)) continue
    const hours = partialHours + full * 24
    if (best && hours > best.hours) continue
    const used = [...partial]
    for (const i of order) {
      const take = Math.min(full, groups[i]); full -= take
      used[i] += take * (24 / HOURS[i])
    }
    if (!best || hours < best.hours || preferred(used, best.used, policy)) best = { used, hours }
  }
  return best
}

export function openingPlan(counts, cash, cost, rate, reserve, policy) {
  const available = counts.map(count => Math.max(0, count - (reserve ? 1 : 0)))
  const needed = Math.max(0, cost - cash)
  const neededHours = Math.ceil(cents(needed) / cents(rate))
  const plan = chooseBoxes(available, neededHours, policy)
  const balance = clean(cash + plan.hours * rate - cost)
  return { ...plan, neededHours, deficit: Math.max(0, -balance), surplus: Math.max(0, balance),
    left: counts.map((count, i) => count - plan.used[i]) }
}

// 两种特殊箱具有相同的 3:1:1 比例，大月卡箱相当于十个三选一箱。
export function allocateChoices(required, monthly, choice) {
  const m = [0, 0, 0]
  let left = monthly
  for (let i = 0; i < 3; i++) { m[i] = Math.min(left, Math.floor(required[i] / 10)); left -= m[i] }
  const remainder = required.map((n, i) => Math.max(0, n - m[i] * 10))
  for (const i of [0, 1, 2].sort((a, b) => remainder[b] - remainder[a])) {
    if (left > 0 && remainder[i] > 0) { m[i]++; left--; remainder[i] = Math.max(0, remainder[i] - 10) }
  }
  // 仅缺一个单位时优先用三选一，开箱数相同且不多开九单位。
  if (sum(remainder) <= choice) for (let i = 0; i < 3; i++) {
    if (m[i] > 0 && required[i] % 10 === 1 && remainder[i] === 0 && sum(remainder) < choice) { m[i]--; remainder[i] = 1 }
  }
  return { feasible: sum(remainder) <= choice, monthly: m, choice: remainder }
}

export function specialPlan(current, totals, rates, monthly, choice) {
  const at = target => allocateChoices(totalCost(current, target).map((cost, i) =>
    Math.ceil(Math.max(0, cents(cost - totals[i])) / (cents(rates[i]) * (i === 0 ? 3 : 1)))), monthly, choice)
  let low = current, high = MAX_LEVEL
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (at(mid).feasible) low = mid
    else high = mid - 1
  }
  const allocation = at(low)
  const hours = rates.map((_, i) => (allocation.monthly[i] * 10 + allocation.choice[i]) * (i === 0 ? 3 : 1))
  return { level: low, ...allocation, hours, leftMonthly: monthly - sum(allocation.monthly), leftChoice: choice - sum(allocation.choice),
    reach: totals.map((value, i) => reachLevel(current, clean(value + hours[i] * rates[i]), i)) }
}

export function analyzePlanner(input) {
  const { current, target, cash, boxes, rates, monthly, choice, reserve } = input
  const hours = boxes.map(row => sum(row.map((count, i) => count * HOURS[i])))
  const totals = cash.map((value, i) => clean(value + hours[i] * rates[i]))
  const reach = totals.map((value, i) => reachLevel(current, value, i))
  const highest = Math.max(...reach.map(row => row.level))
  const joint = Math.min(...reach.map(row => row.level))
  const catchCost = totalCost(current, highest)
  const cost = totalCost(current, target)
  return { hours, totals, reach, highest, joint, cost,
    catchHours: catchCost.map((value, i) => Math.max(0, clean(value - totals[i])) / rates[i]),
    special: specialPlan(current, totals, rates, monthly, choice),
    plans: ['large', 'small'].map(policy => cost.map((value, i) => openingPlan(boxes[i], cash[i], value, rates[i], reserve, i === 2 ? 'fewest' : policy))),
  }
}
