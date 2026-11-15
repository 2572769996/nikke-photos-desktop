'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {setTimeout:delay} = require('node:timers/promises');
const {
  SOURCE_URL, CATALOG_PATH, sceneId, resourceUrl, normalizeCatalog, normalizeScene,
  defaultReading, validatePreferences, validatePosition, validateReading,
} = require('./story-model.cjs');
const MAX_BYTES = 8 * 1024 * 1024;

function readJson(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw Error('本地剧情文件超过读取上限');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const content = JSON.stringify(value);
  if (Buffer.byteLength(content) > MAX_BYTES) throw Error('剧情文件超过保存上限');
  const pending = file + '.next';
  const handle = fs.openSync(pending, 'w');
  try {
    fs.writeFileSync(handle, content, 'utf8');
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(pending, file);
}

function createStoryReader({dataRoot, fetchImpl = fetch, interval = 600, onProgress = () => {}}) {
  const directory = path.join(dataRoot, 'tools', 'story-reader');
  const catalogFile = path.join(directory, 'catalog.json');
  const readingFile = path.join(directory, 'reading.json');
  const sceneDirectory = path.join(directory, 'scenes');
  let controller = null;
  let lastRequest = 0;
  let job = {status:'idle', total:0, completed:0, failures:[], sceneId:null};
  const sceneFile = id => path.join(sceneDirectory, sceneId(id) + '.json');
  const emit = () => onProgress(structuredClone(job));

  function readCatalog() {
    if (!fs.existsSync(catalogFile)) return null;
    const saved = readJson(catalogFile);
    if (saved.version !== 1) throw Error('本地主线目录版本不受支持');
    return {chapters:normalizeCatalog(saved.raw), updatedAt:saved.updatedAt};
  }

  function readReading() {
    if (!fs.existsSync(readingFile)) return defaultReading();
    try { return validateReading(readJson(readingFile)); }
    catch { throw Error('阅读记录损坏，原文件已保留。请检查数据目录 tools/story-reader/reading.json。'); }
  }

  function availableIds() {
    if (!fs.existsSync(sceneDirectory)) return [];
    return fs.readdirSync(sceneDirectory).filter(name => /^[a-zA-Z0-9_-]{1,100}\.json$/.test(name)).map(name => name.slice(0, -5));
  }

  function snapshot() {
    let catalog = null;
    let catalogError = '';
    try { catalog = readCatalog(); } catch (error) { catalogError = error.message; }
    return {catalog, catalogError, reading:readReading(), downloaded:availableIds(), job:structuredClone(job)};
  }

  function requireKnownScene(id, catalog = readCatalog()) {
    sceneId(id);
    const chapter = catalog?.chapters.find(chapter => chapter.scenes.some(scene => scene.id === id));
    if (!chapter) throw Error('当前主线目录中没有该小节，请刷新目录');
    return chapter;
  }

  function readScene(id) {
    const saved = readJson(sceneFile(id));
    if (saved.version !== 1 || saved.id !== id) throw Error('本地剧情文件身份不一致，请重新下载本节');
    return {...normalizeScene(saved.raw, id), downloadedAt:saved.downloadedAt};
  }

  async function request(resourcePath, signal) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      await delay(Math.max(0, lastRequest + interval - Date.now()), undefined, {signal});
      lastRequest = Date.now();
      const timeout = AbortSignal.timeout(30000);
      try {
        const response = await fetchImpl(resourceUrl(resourcePath), {
          headers:{Accept:'application/json', Referer:SOURCE_URL},
          credentials:'omit', redirect:'error', signal:AbortSignal.any([signal, timeout]),
        });
        if (!response.ok) {
          const error = Error('剧情资源请求失败（HTTP ' + response.status + '）');
          error.retryable = [429,500,502,503,504].includes(response.status);
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter && /^\d+$/.test(retryAfter)) error.retryAfter = Number(retryAfter) * 1000;
          throw error;
        }
        const chunks = [];
        let size = 0;
        for await (const part of response.body) {
          signal.throwIfAborted();
          size += part.byteLength;
          if (size > MAX_BYTES) throw Object.assign(Error('剧情响应超过读取上限'), {retryable:false});
          chunks.push(Buffer.from(part));
        }
        let raw;
        try { raw = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')); }
        catch { throw Object.assign(Error('剧情资源返回了无效 JSON'), {retryable:false}); }
        return raw;
      } catch (error) {
        signal.throwIfAborted();
        lastError = error;
        if (error.retryable === false || error.retryAfter > 60000 || attempt === 2) break;
        await delay(Math.max(2 ** attempt * 1000, error.retryAfter || 0), undefined, {signal});
      }
    }
    if (lastError?.message.startsWith('剧情')) throw lastError;
    throw Error('连接剧情来源失败，请检查网络后重试');
  }

  async function withJob(kind, total, operation) {
    if (controller) throw Error('剧情下载正在进行，可先取消当前任务');
    controller = new AbortController();
    const signal = controller.signal;
    job = {kind, status:'running', total, completed:0, failures:[], sceneId:null};
    emit();
    try {
      const result = await operation(signal);
      signal.throwIfAborted();
      job.status = job.failures.length ? 'partial' : 'completed';
      return result;
    } catch (error) {
      job.status = signal.aborted ? 'cancelled' : 'failed';
      if (!signal.aborted) job.failures.push({id:job.sceneId || '', message:error.message});
      throw Error(signal.aborted ? '剧情下载已取消，已完成内容已保留' : error.message);
    } finally {
      job.sceneId = null;
      controller = null;
      emit();
    }
  }

  async function updateCatalog() {
    await withJob('catalog', 1, async signal => {
      const raw = await request(CATALOG_PATH, signal);
      normalizeCatalog(raw);
      signal.throwIfAborted();
      writeAtomic(catalogFile, {version:1, updatedAt:new Date().toISOString(), raw});
      job.completed = 1;
    });
    return snapshot();
  }

  async function downloadOne(id, signal) {
    job.sceneId = id;
    emit();
    const raw = await request('scene/zh-TW/scene_detail_' + sceneId(id) + '_zh-TW.json', signal);
    const scene = normalizeScene(raw, id);
    signal.throwIfAborted();
    const downloadedAt = new Date().toISOString();
    writeAtomic(sceneFile(id), {version:1, id, downloadedAt, raw});
    return {...scene, downloadedAt};
  }

  async function openScene({id, refresh = false} = {}) {
    sceneId(id);
    if (typeof refresh !== 'boolean') throw Error('下载参数无效');
    if (!refresh && fs.existsSync(sceneFile(id))) {
      try { return readScene(id); }
      catch { throw Error('本节本地内容损坏，请点击重新下载本节'); }
    }
    requireKnownScene(id);
    return withJob('scene', 1, async signal => {
      const scene = await downloadOne(id, signal);
      job.completed = 1;
      return scene;
    });
  }

  async function downloadChapter(chapterId) {
    if (typeof chapterId !== 'string') throw Error('章节编号无效');
    const chapter = readCatalog()?.chapters.find(chapter => chapter.id === chapterId);
    if (!chapter) throw Error('章节不存在，请刷新目录');
    await withJob('chapter', chapter.scenes.length, async signal => {
      for (const scene of chapter.scenes) {
        signal.throwIfAborted();
        try {
          let cached = false;
          if (fs.existsSync(sceneFile(scene.id))) {
            try { readScene(scene.id); cached = true; } catch { /* Repair only this invalid scene. */ }
          }
          if (!cached) await downloadOne(scene.id, signal);
          job.completed++;
        } catch (error) {
          signal.throwIfAborted();
          job.failures.push({id:scene.id, message:error.message});
        }
        emit();
      }
    });
    return snapshot();
  }

  function changeReading({type, value} = {}) {
    const reading = readReading();
    if (type === 'preferences') reading.preferences = validatePreferences({...reading.preferences, ...value});
    else if (type === 'position' || type === 'bookmark') {
      sceneId(value?.sceneId);
      const position = validatePosition(value);
      const scene = readScene(value.sceneId);
      if (scene.rows[position.index]?.id !== position.recordId) throw Error('阅读位置与当前内容不一致，请重新打开本节');
      if (type === 'position') {
        reading.positions = {...reading.positions, [value.sceneId]:position};
        reading.lastSceneId = value.sceneId;
      } else {
        const exists = reading.bookmarks.some(item => item.sceneId === value.sceneId && item.index === position.index && item.recordId === position.recordId);
        reading.bookmarks = reading.bookmarks.filter(item => !(item.sceneId === value.sceneId && item.index === position.index && item.recordId === position.recordId));
        if (!exists) reading.bookmarks.push({sceneId:value.sceneId, ...position});
      }
    } else if (type === 'removeBookmark') {
      sceneId(value?.sceneId);
      const position = validatePosition(value);
      reading.bookmarks = reading.bookmarks.filter(item => !(item.sceneId === value.sceneId && item.index === position.index && item.recordId === position.recordId));
    } else if (type === 'read') {
      sceneId(value?.sceneId);
      if (typeof value.read !== 'boolean') throw Error('已读标记无效');
      readScene(value.sceneId);
      reading.read = reading.read.filter(id => id !== value.sceneId);
      if (value.read) reading.read.push(value.sceneId);
    } else throw Error('不支持的阅读记录操作');
    validateReading(reading);
    writeAtomic(readingFile, reading);
    return reading;
  }

  function searchChunk(ids) {
    if (!Array.isArray(ids) || ids.length > 20) throw Error('搜索批次无效');
    return ids.map(id => {
      sceneId(id);
      try { return {scene:readScene(id)}; }
      catch { return {id, error:'本节本地内容无法读取'}; }
    });
  }

  function previewBackup(input) {
    if (input?.format !== 'nikke-photos-story-reading' || input.version !== 1) throw Error('请选择剧情阅读记录备份');
    const reading = validateReading(input.reading);
    return {bookmarks:reading.bookmarks.length, read:reading.read.length, positions:Object.keys(reading.positions).length};
  }

  return {snapshot, updateCatalog, openScene, downloadChapter, changeReading, searchChunk, previewBackup,
    backup() { return {format:'nikke-photos-story-reading', version:1, reading:readReading()}; },
    restore(input) {
      if (controller) throw Error('请等待剧情下载结束后再恢复阅读记录');
      previewBackup(input);
      const reading = input.reading;
      writeAtomic(readingFile, reading);
      return reading;
    },
    cancel() { controller?.abort(); return structuredClone(job); },
  };
}

function registerStoryReader({ipcMain, requireSender, service}) {
  const commands = {
    snapshot:() => service.snapshot(),
    catalog:() => service.updateCatalog(),
    open:value => service.openScene(value),
    chapter:value => service.downloadChapter(value),
    reading:value => service.changeReading(value),
    backup:() => service.backup(),
    preview:value => service.previewBackup(value),
    restore:value => service.restore(value),
    search:value => service.searchChunk(value),
    cancel:() => service.cancel(),
  };
  for (const [name, action] of Object.entries(commands)) {
    ipcMain.handle('story-reader:' + name, async (event, value) => {
      requireSender(event);
      try { return {ok:true, value:await action(value)}; }
      catch (error) { return {ok:false, error:error.message}; }
    });
  }
}

module.exports = {createStoryReader, registerStoryReader};
