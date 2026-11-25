const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { PNG } = require('pngjs')
const { createCollection } = require('../electron/maanikke-collection.cjs')
const { createScreenshotStore } = require('../electron/maanikke-screenshots.cjs')

test('跳过截图对应目标搜索，补采保留已完成或尚未读取的角色', async () => {
  const project = path.resolve(__dirname, '..')
  const cacheRoot = fs.mkdtempSync(path.join(process.env.NIKKE_CACHE_DIR || os.tmpdir(), 'retry-skipped-'))
  const screenshots = createScreenshotStore({ cacheRoot })
  const codes = ['5061', '5146', '5179']
  const target = { hwnd: '123', pid: 123 }
  const png = PNG.sync.write(new PNG({ width: 2, height: 2 }))
  const requests = []
  const actions = [
    async ({ begin, complete, skip, send }) => {
      await complete(codes[0])
      await begin(codes[1])
      await skip(codes[1], '伊莱格：boom与惊吓')
      await send('failed', { error: '中断', canceled: false })
    },
    async ({ complete, done }) => { await complete(codes[1]); await done() },
    async ({ begin, skip, done }) => { await begin(codes[2]); await skip(codes[2], 'queen（真）'); await done() },
    async ({ complete, done }) => { await complete(codes[2]); await done() }
  ]
  const manager = createCollection({
    project, cacheRoot, screenshots, shortcuts: { register: () => true, unregister() {} },
    async launch(_command, args) {
      const file = args[args.indexOf('-RequestFile') + 1]
      const request = JSON.parse(fs.readFileSync(file))
      requests.push(request)
      const spool = path.join(path.dirname(file), 'spool')
      let sequence = 0
      async function send(kind, data, image = false) {
        const id = ++sequence
        if (image) fs.writeFileSync(path.join(spool, id + '.png'), png)
        fs.writeFileSync(path.join(spool, id + '.json'), JSON.stringify({ kind, data, id, image, savedAt: Date.now() / 1000 }))
        const reply = path.join(spool, id + '.reply.json')
        const deadline = Date.now() + 5000
        while (!fs.existsSync(reply)) {
          assert.ok(Date.now() < deadline, '等待截图确认超时')
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        const response = JSON.parse(fs.readFileSync(reply))
        assert.ok(response.ok, response.error)
      }
      const begin = nameCode => send('characterBegin', { nameCode, index: request.nameCodes.indexOf(nameCode) })
      async function complete(nameCode) {
        await begin(nameCode)
        for (const slot of ['head', 'chest', 'hands', 'legs'])
          await send('equipment', { nameCode, slot, classification: 'unequipped' }, true)
        await send('character', { nameCode })
      }
      async function skip(nameCode, searchTerm) {
        const info = { nameCode, searchTerm, clientSize: [2560, 1440] }
        await send('frame', { ...info, phase: '等待搜索结果' }, true)
        await send('skipped', { ...info, reason: '未检测到可确认的角色卡' })
      }
      await actions[requests.length - 1]({ begin, complete, skip, send, done: () => send('done', { returnedToLobby: true }) })
      return { stdout: '{"canceled":false}' }
    }
  })
  const run = async (options = {}) => {
    await manager.start({ nameCodes: codes, target, ...options })
    return manager.wait()
  }
  const first = await run()
  assert.equal(first.stage, 'failed')
  const evidence = first.draft[codes[1]].searchEvidence
  assert.equal(evidence.searchTerm, '伊莱格：boom与惊吓')
  assert.deepEqual(evidence.clientSize, [2560, 1440])
  assert.ok(screenshots.read(evidence.imageId).available)
  const manifest = JSON.parse(fs.readFileSync(path.join(cacheRoot, 'maanikke-screenshots.json')))
  const entry = manifest.entries.find(e => e.id === evidence.imageId)
  assert.equal(entry.character, codes[1])
  assert.equal(entry.kind, 'exception')
  const original = structuredClone(first.draft[codes[0]])
  const retry = await run({ resumeRunId: first.runId, retrySkipped: true })
  assert.deepEqual(requests[1].nameCodes, [codes[1]])
  assert.equal(retry.stage, 'interrupted')
  assert.deepEqual(retry.draft[codes[0]], original)
  assert.equal(retry.draft[codes[1]].status, 'complete')
  assert.equal(retry.draft[codes[2]], undefined)
  const resumed = await run({ resumeRunId: retry.runId })
  assert.deepEqual(requests[2].completedCodes, codes.slice(0, 2))
  assert.equal(resumed.stage, 'completed')
  assert.ok(screenshots.read(resumed.draft[codes[2]].searchEvidence.imageId).available)
  const final = await run({ resumeRunId: resumed.runId, retrySkipped: true })
  assert.deepEqual(requests[3].nameCodes, [codes[2]])
  assert.deepEqual(final.nameCodes, codes)
  assert.equal(final.stage, 'completed')
  assert.ok(codes.every(code => final.draft[code].status === 'complete'))
  assert.deepEqual(final.draft[codes[0]], original)
  await assert.rejects(run({ resumeRunId: final.runId, retrySkipped: true }), /没有.*跳过/)
})
