'use strict';

const crypto = require('node:crypto');
const SOURCE_URL = 'https://www.blablalink.com/shiftyspad/scene-list';
const CATALOG_PATH = 'scene/zh-TW/scene_list_zh-TW.json';
const PRIMES = [224737, 1000639, 2654435761];
const identifier = /^[a-zA-Z0-9_-]{1,100}$/;

function sceneId(value) {
  if (typeof value !== 'string' || !identifier.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) throw Error('剧情小节编号无效');
  return value;
}

function resourceUrl(resourcePath) {
  if (resourcePath !== CATALOG_PATH && !/^scene\/zh-TW\/scene_detail_[a-zA-Z0-9_-]{1,100}_zh-TW\.json$/.test(resourcePath)) {
    throw Error('不支持的剧情资源路径');
  }
  const directories = resourcePath.split('/').slice(0, -1).map((_, index) => {
    const prime = PRIMES[index];
    let value = prime;
    for (const character of resourcePath) value = (Math.imul(value, 33) + character.charCodeAt(0)) | 0;
    const remainder = ((value % prime) + prime) % prime;
    const prefix = String.fromCharCode(97 + Math.floor(remainder / 26) % 26, 97 + remainder % 26);
    return prefix + '-' + String(remainder % 99).padStart(2, '0');
  });
  const digest = crypto.createHash('md5').update(resourcePath, 'utf8').digest('hex');
  return 'https://sg-tools-cdn.blablalink.com/' + [...directories, digest + '.json'].join('/');
}

function plainText(value) {
  if (typeof value !== 'string') throw Error('剧情文本格式变化，请刷新后重试');
  const entities = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' '};
  return value.replace(/\\+n/g, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : match;
    }).trim();
}

function normalizeCatalog(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 2000) throw Error('主线目录格式变化');
  const chapterIds = new Set();
  let sceneCount = 0;
  const chapters = raw.map(chapter => {
    const number = chapter?.sub_category_id?.value;
    const title = chapter?.sub_category_name_localkey?.chapter_name;
    const entries = chapter?.sub_category_id?.scenes?.value;
    if (!Number.isInteger(number) || number < 0 || chapterIds.has(number) || !Array.isArray(entries)) throw Error('主线章节结构无效');
    chapterIds.add(number);
    const ids = new Set();
    const scenes = entries.map(entry => {
      const id = sceneId(entry?.value?.scenario_group_id);
      if (ids.has(id)) throw Error('主线目录包含重复小节');
      ids.add(id);
      sceneCount++;
      return {id, title:plainText(entry?.scenario_name_localkey?.scenario_name ?? id)};
    });
    return {id:String(number), number, title:plainText(title ?? String(number)), scenes};
  });
  if (!sceneCount || sceneCount > 20000) throw Error('主线目录小节数量异常');
  return chapters;
}

function normalizeScene(raw, id) {
  sceneId(id);
  if (raw?.scenario_group_id?.value !== id) throw Error('剧情响应的小节编号不一致');
  const records = raw?.scenario_group_id?.records?.value;
  if (!Array.isArray(records) || !records.length || records.length > 20000) throw Error('剧情记录为空或格式变化');
  const rows = records.map((record, index) => {
    const value = record?.value;
    if (!value || !['string','number'].includes(typeof value.id)) throw Error('剧情对白编号缺失');
    const recordId = String(value.id);
    if (recordId.length > 120 || typeof record.quest_name !== 'string') throw Error('剧情对白内容格式变化');
    const kind = String(value.speech_window ?? 'speech').toLowerCase();
    const rawSpeaker = String(value.speaker ?? '');
    let speaker = record.speaker?.name_localkey?.character_name || rawSpeaker;
    if (kind === 'self' || rawSpeaker.toLowerCase() === 'self') speaker = '@UserName';
    if (['narration','monologue','subtitles','choice'].includes(kind)) {
      speaker = {narration:'旁白', monologue:'独白', subtitles:'字幕', choice:'选项'}[kind];
    }
    const jump = value.jump_target == null ? '' : String(value.jump_target);
    if (jump.length > 1000) throw Error('剧情跳转信息过长');
    return {index, id:recordId, kind, speaker:plainText(String(speaker)), text:plainText(record.quest_name), jump};
  });
  return {id, rows, hasBranches:rows.some(row => row.kind === 'choice' || row.jump)};
}

function defaultReading() {
  return {
    version:1,
    preferences:{fontSize:18, lineHeight:1.9, width:780, player:'指挥官', hideSpoilers:true},
    positions:{}, bookmarks:[], read:[], lastSceneId:null,
  };
}

function validatePreferences(value) {
  if (!value || !Number.isInteger(value.fontSize) || value.fontSize < 14 || value.fontSize > 30
    || !Number.isFinite(value.lineHeight) || value.lineHeight < 1.4 || value.lineHeight > 2.6
    || !Number.isInteger(value.width) || value.width < 560 || value.width > 1000
    || typeof value.player !== 'string' || !value.player.trim() || value.player.length > 40
    || typeof value.hideSpoilers !== 'boolean') throw Error('阅读设置无效');
  return {...value, player:value.player.trim()};
}

function validatePosition(value) {
  if (!value || !Number.isInteger(value.index) || value.index < 0 || value.index > 20000
    || typeof value.recordId !== 'string' || value.recordId.length > 120) throw Error('阅读位置无效');
  return {index:value.index, recordId:value.recordId};
}

function validateReading(value) {
  if (!value || value.version !== 1 || !value.positions || Array.isArray(value.positions)
    || !Array.isArray(value.bookmarks) || value.bookmarks.length > 10000
    || !Array.isArray(value.read) || value.read.length > 20000) throw Error('阅读记录格式无效');
  validatePreferences(value.preferences);
  if (value.lastSceneId !== null) sceneId(value.lastSceneId);
  for (const [id, position] of Object.entries(value.positions)) { sceneId(id); validatePosition(position); }
  for (const bookmark of value.bookmarks) { sceneId(bookmark.sceneId); validatePosition(bookmark); }
  value.read.forEach(sceneId);
  return value;
}

module.exports = {SOURCE_URL, CATALOG_PATH, sceneId, resourceUrl, normalizeCatalog, normalizeScene, defaultReading, validatePreferences, validatePosition, validateReading};
