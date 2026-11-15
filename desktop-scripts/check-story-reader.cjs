'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createStoryReader} = require('../electron/story-reader.cjs');
const {resourceUrl, CATALOG_PATH, normalizeCatalog, normalizeScene} = require('../electron/story-model.cjs');

const root = 'E:/博哥/codex temp/nikke-desktop/story-reader';
fs.mkdirSync(root, {recursive:true});
const testRoot = fs.mkdtempSync(path.join(root, 'model-check-'));
const catalog = [
  {sub_category_id:{value:0, scenes:{value:[
    {value:{scenario_group_id:'scene_a'}, scenario_name_localkey:{scenario_name:'開始'}},
    {value:{scenario_group_id:'scene_b'}, scenario_name_localkey:{scenario_name:'選擇'}},
  ]}}, sub_category_name_localkey:{chapter_name:'墜落'}},
];
function fixture(id, text = '請跟隨@UserName\\n前進<br>這是故事。') {
  return {scenario_group_id:{value:id, records:{value:[
    {value:{id:1, speaker:'self', speech_window:'Self'}, quest_name:text},
    {value:{id:2, speaker:'npc', speech_window:'Choice', jump_target:3}, quest_name:'選擇前進', speaker:{name_localkey:{character_name:'拉毗'}}},
    {value:{id:3, speaker:'npc', speech_window:'Narration'}, quest_name:'&lt;img src="https://invalid.example/image"&gt; &amp; &#x4e2d;'},
  ]}}};
}
const responseMap = new Map([
  [resourceUrl(CATALOG_PATH), catalog],
  [resourceUrl('scene/zh-TW/scene_detail_scene_a_zh-TW.json'), fixture('scene_a')],
  [resourceUrl('scene/zh-TW/scene_detail_scene_b_zh-TW.json'), fixture('scene_b')],
]);
const calls = [];
let failure = null;
let slow = false;
const fakeFetch = async (url, options) => {
  calls.push({url, credentials:options.credentials, redirect:options.redirect});
  if (slow) await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 10000);
    options.signal.addEventListener('abort', () => {clearTimeout(timer); reject(Error('aborted'));}, {once:true});
  });
  if (failure) return new Response('failure', {status:failure});
  if (!responseMap.has(url)) throw Error('Unexpected request');
  return new Response(JSON.stringify(responseMap.get(url)), {headers:{'Content-Type':'application/json'}});
};
const service = createStoryReader({dataRoot:testRoot, fetchImpl:fakeFetch, interval:0});

(async () => {
  assert.equal(resourceUrl(CATALOG_PATH), 'https://sg-tools-cdn.blablalink.com/jl-07/im-07/9077b4012dd276c806041e9744382323.json');
  assert.throws(() => resourceUrl('https://example.com'), /路径/);
  assert.throws(() => normalizeCatalog([{sub_category_id:{value:0,scenes:{value:[{value:{scenario_group_id:'../escape'}}]}}}]), /编号/);
  assert.throws(() => normalizeScene({scenario_group_id:{value:'scene_a',records:{value:[]}}}, 'scene_a'), /为空/);
  await service.updateCatalog();
  const scene = await service.openScene({id:'scene_a'});
  assert.equal(scene.hasBranches, true);
  assert.equal(scene.rows[0].speaker, '@UserName');
  assert.equal(scene.rows[1].jump, '3');
  assert.ok(scene.rows[0].text.includes('\n'));
  assert.ok(scene.rows[2].text.includes('<img'));
  const count = calls.length;
  await service.openScene({id:'scene_a'});
  assert.equal(calls.length, count, 'cached reads require no network');
  service.changeReading({type:'preferences', value:{fontSize:22, player:'测试指挥官'}});
  service.changeReading({type:'position', value:{sceneId:'scene_a', index:1, recordId:'2'}});
  service.changeReading({type:'bookmark', value:{sceneId:'scene_a', index:1, recordId:'2'}});
  service.changeReading({type:'read', value:{sceneId:'scene_a', read:true}});
  const saved = service.snapshot();
  assert.equal(saved.reading.preferences.fontSize,22);
  assert.equal(saved.reading.lastSceneId,'scene_a');
  assert.equal(saved.reading.bookmarks.length,1);
  assert.throws(() => service.changeReading({type:'position',value:{sceneId:'scene_a',index:0,recordId:'wrong'}}), /不一致/);
  const offline = createStoryReader({dataRoot:testRoot, fetchImpl:() => {throw Error('must stay offline');}});
  assert.deepEqual(offline.snapshot().reading,saved.reading);
  assert.deepEqual(await offline.openScene({id:'scene_a'}), scene);
  assert.equal(offline.searchChunk(['scene_a','missing']).length,2);

  const sceneFile = path.join(testRoot,'tools/story-reader/scenes/scene_a.json');
  const before = fs.readFileSync(sceneFile,'utf8');
  failure = 404;
  const callsBefore404 = calls.length;
  await assert.rejects(service.openScene({id:'scene_a',refresh:true}), /404/);
  assert.equal(calls.length,callsBefore404+1);
  assert.equal(fs.readFileSync(sceneFile,'utf8'),before);
  failure = null;
  responseMap.set(resourceUrl('scene/zh-TW/scene_detail_scene_a_zh-TW.json'), {});
  await assert.rejects(service.openScene({id:'scene_a',refresh:true}), /编号/);
  assert.equal(fs.readFileSync(sceneFile,'utf8'),before);
  responseMap.set(resourceUrl('scene/zh-TW/scene_detail_scene_a_zh-TW.json'), fixture('scene_a'));

  failure = 403;
  const partial = await service.downloadChapter('0');
  assert.equal(partial.job.status,'partial');
  assert.equal(partial.job.completed,1);
  assert.equal(partial.job.failures.length,1);
  assert.equal(fs.existsSync(path.join(testRoot,'tools/story-reader/scenes/scene_b.json')),false);
  failure = null;
  slow = true;
  const downloading = service.downloadChapter('0');
  await new Promise(resolve => setTimeout(resolve,40));
  await assert.rejects(service.updateCatalog(), /正在进行/);
  service.cancel();
  await assert.rejects(downloading, /取消/);
  assert.equal(service.snapshot().job.completed,1);
  assert.equal(fs.existsSync(path.join(testRoot,'tools/story-reader/scenes/scene_b.json')),false);
  slow = false;
  const completed = await service.downloadChapter('0');
  assert.equal(completed.job.status,'completed');
  assert.equal(completed.downloaded.length,2);

  const readingFile = path.join(testRoot,'tools/story-reader/reading.json');
  const readingBefore = fs.readFileSync(readingFile,'utf8');
  const rename = fs.renameSync;
  fs.renameSync = (from,to) => { if(to === readingFile) throw Error('injected write failure'); return rename(from,to); };
  try { assert.throws(() => service.changeReading({type:'preferences',value:{fontSize:24}}), /injected/); }
  finally {fs.renameSync = rename;}
  assert.equal(fs.readFileSync(readingFile,'utf8'),readingBefore);
  const pending = JSON.parse(fs.readFileSync(readingFile,'utf8'));
  pending.version = 99;
  fs.writeFileSync(readingFile,JSON.stringify(pending));
  assert.throws(() => service.changeReading({type:'preferences',value:{fontSize:24}}), /损坏/);
  assert.equal(JSON.parse(fs.readFileSync(readingFile,'utf8')).version,99);
  fs.writeFileSync(readingFile,readingBefore);
  assert.ok(calls.every(call=>call.credentials==='omit'&&call.redirect==='error'));

  const conversion = await import('../src/lib/storyReader.js');
  assert.equal(conversion.storyText('劇情閱讀，@UserName的選擇','指挥官甲'),'剧情阅读，指挥官甲的选择');
  assert.equal(conversion.findStoryPosition(scene,{index:100,recordId:'2'}),1);

  const onlineRoot = path.join(testRoot,'online');
  const online = createStoryReader({dataRoot:onlineRoot});
  await online.updateCatalog();
  const current = online.snapshot().catalog;
  const first = current.chapters[0].scenes[0].id;
  const actual = await online.openScene({id:first});
  assert.ok(actual.rows.length > 0);
  const replay = createStoryReader({dataRoot:onlineRoot, fetchImpl:() => {throw Error('offline');}});
  assert.deepEqual(await replay.openScene({id:first}),actual);
  const raw = JSON.parse(fs.readFileSync(path.join(onlineRoot,'tools/story-reader/scenes',first+'.json'),'utf8')).raw;
  const report = {passed:true,pathMapping:true,validation:true,plainTextAndBranches:true,settingsAndBookmarks:true,
    coldOfflineReopen:true,atomicFailurePreservesOld:true,invalidRemotePreservesOld:true,noRetry403404:true,
    cancellationAndSingleJob:true,chapterPartialAndRetry:true,corruptReadingPreserved:true,
    simplifiedConversion:true,realCatalogChapters:current.chapters.length,realSceneRecords:actual.rows.length,
    sceneIdentityField:raw.scenario_group_id.value??null};
  fs.writeFileSync(path.join(testRoot,'result.json'),JSON.stringify(report,null,2));
  console.log(testRoot);
  console.log(report);
})().catch(error => {console.error(error);process.exitCode=1;});
