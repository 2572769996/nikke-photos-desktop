const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createCollection } = require('../electron/maanikke-collection.cjs')
const { createScreenshotStore } = require('../electron/maanikke-screenshots.cjs')

const project = path.resolve(__dirname, '..')
const nameCode = require('../src/data/roster.json').characters.find(c => c.nameCn === '桃乐丝').nameCode
const cacheRoot = fs.mkdtempSync(path.join(process.env.NIKKE_CACHE_DIR || os.tmpdir(), 'collection-terminal-'))
const scenarios = [
  { name: '未收到失败事件时显示子进程保存的错误', report: { phase: 'failed', error: '[WinError 5] 拒绝访问 progress.json' }, exitCode: 1 },
  { name: '未收到停止事件时保留停止状态', report: { phase: 'canceled', error: '用户已停止，进度已保存' }, exitCode: 0 },
  { name: '没有终态文件时报告子进程退出码', exitCode: 23 },
]

for (const [index, { name, report, exitCode }] of scenarios.entries()) {
  test(name, async () => {
    const folder = path.join(cacheRoot, String(index))
    const collection = createCollection({
      project, cacheRoot: folder, screenshots: createScreenshotStore({ cacheRoot: folder }),
      shortcuts: { register: () => true, unregister() {} },
      launch: async (_exe, args) => {
        const request = args[args.indexOf('-RequestFile') + 1]
        if (report) fs.writeFileSync(path.join(path.dirname(request), 'run-result.json'), JSON.stringify(report))
        return { stdout: JSON.stringify({ canceled: false, exitCode }) }
      },
    })
    await collection.start({ nameCodes: [nameCode], target: { hwnd: '123', pid: 123 } })
    const result = await collection.wait()
    assert.equal(result.active, false)
    assert.equal(result.stage, report?.phase || 'failed')
    if (report) assert.equal(result.error, report.error)
    else assert.match(result.error, /退出码\s*23/)
  })
}

async function holdWindowsReadHandle(file) {
  const script = [
    '$ErrorActionPreference="Stop"',
    '$stream=[IO.File]::Open($env:NIKKE_LOCK_TEST,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)',
    '[Console]::WriteLine("locked")', '[Console]::Out.Flush()',
    '[void][Console]::ReadLine()', '$stream.Dispose()',
  ].join('; ')
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, env: { ...process.env, NIKKE_LOCK_TEST: file },
  })
  const closed = once(child, 'close')
  const { value } = await child.stdout[Symbol.asyncIterator]().next()
  assert.equal(String(value).trim(), 'locked')
  return async () => { child.stdin.end('\n'); await closed }
}

function trackedShortcuts() {
  const keys = new Set()
  return {
    keys,
    register(key) { if (keys.has(key)) return false; keys.add(key); return true },
    unregister(key) { keys.delete(key) },
  }
}

const request = { nameCodes: [nameCode], target: { hwnd: '123', pid: 123 } }
test('事件写盘失败能回复子进程并保留原因，不因记录错误再次写同一文件', { skip: process.platform !== 'win32' }, async () => {
  const folder = path.join(cacheRoot, 'lock-event')
  const manager = createCollection({ project, cacheRoot: folder, screenshots: createScreenshotStore({ cacheRoot: folder }), shortcuts: trackedShortcuts(),
    launch: async (_, args) => {
      const run = path.dirname(args[args.indexOf('-RequestFile') + 1])
      const release = await holdWindowsReadHandle(path.join(run, 'status.json'))
      try {
        const event = { id: 1, kind: 'characterBegin', data: { nameCode, index: 0 } }
        const reply = await sendEvent(run, event)
        assert.equal(reply.ok, false)
        assert.match(reply.error, /EPERM|EBUSY/)
        fs.writeFileSync(path.join(run, 'run-result.json'), JSON.stringify({ phase: 'failed', error: reply.error }))
      } finally { await release() }
      return { stdout: JSON.stringify({ exitCode: 1 }) }
    },
  })
  await manager.start(request)
  const result = await manager.wait()
  assert.equal(manager.active(), false)
  assert.match(result.error, /EPERM|EBUSY/)
  assert.ok(result.logs.some(line => line.includes('处理失败') && line.includes('status.json')))
})

async function sendEvent(run, event) {
  const spool = path.join(run, 'spool')
  fs.writeFileSync(path.join(spool, event.id + '.json'), JSON.stringify(event))
  const reply = path.join(spool, event.id + '.reply.json')
  const deadline = Date.now() + 5000
  while (!fs.existsSync(reply)) {
    assert.ok(Date.now() < deadline, '事件应收到回执')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return JSON.parse(fs.readFileSync(reply))
}

test('启动索引被占用后保留上一轮状态并允许重新启动', { skip: process.platform !== 'win32' }, async () => {
  const folder = path.join(cacheRoot, 'lock-start')
  const screenshots = createScreenshotStore({ cacheRoot: folder })
  const shortcuts = trackedShortcuts()
  const manager = createCollection({ project, cacheRoot: folder, screenshots, shortcuts,
    launch: async () => ({ stdout: JSON.stringify({ canceled: true }) }),
  })
  const first = await manager.start(request)
  await manager.wait()
  const latest = path.join(folder, 'maanikke-collection', 'latest.json')
  const release = await holdWindowsReadHandle(latest)
  try {
    await assert.rejects(manager.start(request), /EPERM|EBUSY/)
    assert.equal(manager.active(), false)
    assert.equal(manager.status().runId, first.runId)
    assert.equal(JSON.parse(fs.readFileSync(latest)).runId, first.runId)
    assert.equal(screenshots.stats().activeTasks, 0)
    assert.equal(shortcuts.keys.size, 0)
  } finally { await release() }
  await manager.start(request)
  assert.equal((await manager.wait()).stage, 'canceled')
})

for (const filename of ['status.json', 'maanikke-screenshots.json']) {
  test(`收尾遇到 ${filename} 共享冲突时保留草稿、释放快捷键、可再次采集`, { skip: process.platform !== 'win32' }, async () => {
    const folder = path.join(cacheRoot, 'lock-end-' + filename)
    const shortcuts = trackedShortcuts()
    let release
    async function launch(_, args) {
      if (!release) {
        const run = path.dirname(args[args.indexOf('-RequestFile') + 1])
        const reply = await sendEvent(run, { id: 1, kind: 'characterBegin', data: { nameCode, index: 0 } })
        assert.equal(reply.ok, true)
        release = await holdWindowsReadHandle(path.join(filename === 'status.json' ? run : folder, filename))
      }
      return { stdout: JSON.stringify({ canceled: true }) }
    }
    const manager = createCollection({ project, cacheRoot: folder, screenshots: createScreenshotStore({ cacheRoot: folder }), shortcuts, launch })
    const run = await manager.start(request)
    try {
      const result = await manager.wait()
      assert.equal(manager.active(), false)
      assert.equal(shortcuts.keys.size, 0)
      assert.equal(result.stage, 'canceled')
      assert.equal(result.active, false)
      assert.match(result.error, /UAC已取消/)
      assert.match(result.error, /EPERM|EBUSY/)
      assert.ok(result.error.includes(filename))
      assert.equal(result.draft[nameCode].nameCode, nameCode)
      assert.equal(JSON.parse(fs.readFileSync(path.join(run.folder, 'draft.json')))[nameCode].nameCode, nameCode)
    } finally { if (release) await release() }
    await manager.start({ ...request, resumeRunId: run.runId })
    assert.equal((await manager.wait()).stage, 'canceled')
  })
}
