// Each tool keeps its mounted state when switching top-level tabs.
export const NIKKE_TOOLS = Object.freeze([
  { id: 'core-dust', name: '红球计算器', status: 'ready', entry: 'tools/core-dust/index.html', origin: 'tools' },
  { id: 'synchro-planner', name: '同步器升级计算', status: 'ready', kind: 'synchro' },
  { id: 'official-cdk', name: '官方兑换码', status: 'ready', kind: 'official' },
  { id:'story-reader', name:'主线剧情', status:'ready', kind:'story' },
  { id:'damage-simulator', name:'编队伤害模拟', status:'ready', kind:'damage' },
  { id: 'equipment-reroll', name: '洗词条计算器', status: 'ready', entry: 'tools/equipment-reroll/index.html', origin: 'reroll' },
  { id:'key-strategy', name:'洗词条计算器（允许自订秘钥）', label:'洗词条计算器', subtitle:'（允许自订秘钥）', status:'ready', entry:'tools/equipment-reroll/keys/index.html', origin:'reroll' },
  { id:'equipment-simulator', name:'装备洗练模拟器', status:'ready', entry:'tools/equipment-reroll/simulator/index.html', origin:'reroll' },
  { id:'resource-income', name:'订制模组记录', status:'ready', kind:'native' },
  { id:'sr-collection', name:'收藏品强化规划器', status:'ready', entry:'tools/sr-collection/index.html', origin:'collection' },
])
export const DEFAULT_NIKKE_TOOL = NIKKE_TOOLS[0]
