import test from 'node:test'
import assert from 'node:assert/strict'
import { recruitRecordStats } from '../src/lib/recruitRecordStats.js'

const values = rows => rows.map(row => row.value)

test('没有逐人明细的历史记录使用累计抽数、出金和当期 UP，排除已兑换角色', () => {
  const stats = recruitRecordStats({ pulls: 200, ssr: 9, featured: 2, redeemed: 1, copies: { 19: 3 } }, '玛丽安：女王')
  assert.deepEqual(values(stats.counts), ['200', '9', '2'])
  assert.deepEqual(values(stats.rates), ['4.50%', '22.22%'])
})

test('零抽、未抽中 SSR、已出 SSR 但未出 UP 分别按实际分母表示', () => {
  const rates = (pulls, ssr) => values(recruitRecordStats({ pulls, ssr, featured: 0 }, '思凯').rates)
  assert.deepEqual(rates(0, 0), ['—', '—'])
  assert.deepEqual(rates(10, 0), ['0%', '—'])
  assert.deepEqual(rates(10, 1), ['10.00%', '0%'])
})

test('常驻不将愿望单和追加招募计作 UP；更换自选目标后仍显示联动累计抽获', () => {
  const ordinary = recruitRecordStats({ pulls: 200, ssr: 8, bonusClaims: 2 }, null)
  assert.deepEqual(values(ordinary.counts), ['200', '8', '—'])
  assert.deepEqual(values(ordinary.rates), ['4.00%', '—'])
  const collab = recruitRecordStats({ pulls: 200, ssr: 4, featured: 3, selectedId: '821',
    redeemed: 1, ssrDraws: { 820: 2, 821: 1, 220: 1 }, copies: { 820: 2, 821: 2, 220: 1 } }, '自选 UP')
  assert.deepEqual(values(collab.counts), ['200', '4', '3'])
  assert.deepEqual(values(collab.rates), ['2.00%', '75.00%'])
})
