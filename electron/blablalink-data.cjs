'use strict';

// Field transport follows app/public/nikke-photos-import.user.js in
// Kurumi-cn/nikke-photos at 39859b686428166553773be309e19b1ad659f0ca.
const ENDPOINTS = Object.freeze({
  playerInfo: '/api/ugc/direct/standalonesite/User/GetUserGamePlayerInfo',
  basicInfo: '/api/game/proxy/Game/GetUserProfileBasicInfo',
  outpostInfo: '/api/game/proxy/Game/GetUserProfileOutpostInfo',
  characters: '/api/game/proxy/Game/GetUserCharacters',
  characterDetails: '/api/game/proxy/Game/GetUserCharacterDetails',
});
const WEB_URL = 'https://www.blablalink.com/';
const API_ORIGIN = 'https://api.blablalink.com';
const SLOTS = ['head', 'torso', 'arm', 'leg'];
const RESEARCH_IDS = [1101, 1102, 1103, 1201, 1202, 1203, 1204, 1205];

function checkAbort(signal) {
  if (signal?.aborted) throw new Error('读取已取消');
}
function number(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function businessCode(payload) {
  return String(payload?.code ?? payload?.retcode ?? payload?.ret_code ?? '');
}
function requireSuccess(payload, label) {
  const code = businessCode(payload);
  if (code !== '0') {
    const suffix = /^-?\d{1,12}$/.test(code) ? '（代码 ' + code + '）' : '';
    throw new Error(label + '失败' + suffix + '。请在官方窗口确认已登录并选中正确的游戏账号，再重试。');
  }
  if (!payload.data || typeof payload.data !== 'object') throw new Error(label + '返回的数据格式发生变化');
  return payload.data;
}
async function delay(ms, signal) {
  checkAbort(signal);
  await new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); reject(new Error('读取已取消')); };
    signal?.addEventListener('abort', abort, {once:true});
  });
}
async function readIdentity(request, readOpenId, signal) {
  let payload;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    checkAbort(signal);
    payload = await request('playerInfo', {}, signal);
    if (businessCode(payload) !== '1300015' || attempt === 2) break;
    await delay((attempt + 1) * 1000, signal);
  }
  const data = requireSuccess(payload, '读取账号信息');
  const areaId = String(data.area_id ?? '').trim();
  if (!/^\d{1,9}$/.test(areaId) || Number(areaId) <= 0) throw new Error('官方接口未返回有效区服，请先在 BlaBlaLink 绑定或选择游戏账号。');
  const roleName = typeof data.role_name === 'string' ? data.role_name.slice(0,100) : '';
  const openId = await readOpenId();
  checkAbort(signal);
  return {areaId, roleName, openId};
}
function sameIdentity(left, right) {
  return left.areaId === right.areaId && left.openId === right.openId && left.roleName === right.roleName;
}
function characterEntry(detail, effects, missing) {
  const take = (label, value) => {
    const parsed = number(value);
    if (parsed === null) missing.set(label, (missing.get(label) || 0) + 1);
    return parsed;
  };
  const equipments = SLOTS.map(slot => {
    const lines = [];
    let hasFields = false;
    for (let position = 1; position <= 3; position += 1) {
      const key = slot + '_equip_option' + position + '_id';
      hasFields ||= Object.hasOwn(detail, key);
      const optionId = detail[key];
      if (optionId == null || optionId === '' || String(optionId) === '0') continue;
      const effect = effects.get(String(optionId));
      if (!Array.isArray(effect?.function_details) || !effect.function_details.length) {
        throw new Error('官方返回的装备词条缺少对应效果数据，请稍后重新读取。');
      }
      for (const effectPart of effect.function_details) {
        if (typeof effectPart?.function_type !== 'string' || !effectPart.function_type) throw new Error('官方装备词条格式发生变化，请稍后重试。');
        const amount = number(effectPart.function_value);
        lines.push({
          position, functionType:effectPart.function_type,
          level:number(effectPart.level), value:amount === null ? null : Math.abs(amount) / 100,
        });
      }
    }
    if (!hasFields) missing.set('装备词条字段', (missing.get('装备词条字段') || 0) + 1);
    return lines;
  });
  return {
    nameCode:String(detail.name_code).trim(),
    level:take('角色等级', detail.lv), grade:take('突破', detail.grade),
    core:take('核心', detail.core), combat:take('战斗力', detail.combat),
    affection:take('好感度', detail.attractive_lv),
    skills:{skill1:take('技能一', detail.skill1_lv), skill2:take('技能二', detail.skill2_lv), burst:take('爆裂技能', detail.ulti_skill_lv)},
    cube:{cubeId:number(detail.harmony_cube_tid), level:number(detail.harmony_cube_lv)},
    favoriteItem:{tid:number(detail.favorite_item_tid), level:number(detail.favorite_item_lv)},
    equipments,
  };
}
async function collectAccountData({request, readOpenId, identity, signal, onProgress = () => {}}) {
  onProgress('核对账号与区服…');
  const current = await readIdentity(request, readOpenId, signal);
  if (!sameIdentity(current, identity)) throw new Error('当前登录账号或区服已改变，请重新读取账号信息后确认。');
  const warnings = [];
  const body = {nikke_area_id:Number(identity.areaId)};
  if (identity.openId) body.intl_open_id = identity.openId;
  const optional = async (endpoint, requestBody, label) => {
    try { return requireSuccess(await request(endpoint, requestBody, signal), label); }
    catch (error) {
      checkAbort(signal);
      warnings.push(label + '未成功，本次预览会标明缺失字段。');
      return {};
    }
  };
  onProgress('读取昵称…');
  const basic = await optional('basicInfo', body, '读取基本资料');
  onProgress('读取同步器与研究等级…');
  const outpostResponse = await optional('outpostInfo', {nikke_area_id:Number(identity.areaId)}, '读取前哨资料');
  const outpost = outpostResponse.outpost_info || {};
  const researches = (Array.isArray(outpost.recycle_room_researches) ? outpost.recycle_room_researches : [])
    .map(item => ({tid:number(item?.tid), lv:number(item?.lv)}))
    .filter(item => item.tid !== null);
  const missingResearch = RESEARCH_IDS.filter(id => !researches.some(item => item.tid === id && Number.isInteger(item.lv) && item.lv >= 0 && item.lv <= 999));
  if (missingResearch.length) warnings.push('有 ' + missingResearch.length + ' 项研究等级未返回或无效，按现有导入规则预填为1，请导入后核对。');
  onProgress('读取已拥有角色…');
  const owned = requireSuccess(await request('characters', body, signal), '读取角色列表');
  if (!Array.isArray(owned.characters)) throw new Error('官方角色列表格式发生变化');
  const nameCodes = [...new Set(owned.characters.map(item => String(item?.name_code ?? '').trim()).filter(Boolean))];
  if (!nameCodes.length) throw new Error('当前账号没有返回角色，请核对游戏账号与区服。');
  onProgress('读取 ' + nameCodes.length + ' 名角色的详情…');
  const details = requireSuccess(await request('characterDetails', {...body, name_codes:nameCodes}, signal), '读取角色详情');
  if (!Array.isArray(details.character_details)) throw new Error('官方角色详情格式发生变化');
  const returned = new Set();
  for (const detail of details.character_details) {
    const code = String(detail?.name_code ?? '').trim();
    if (!nameCodes.includes(code) || returned.has(code)) throw new Error('官方角色详情含重复或不匹配的角色，请重新读取。');
    returned.add(code);
  }
  if (returned.size !== nameCodes.length) throw new Error('角色详情不完整（' + returned.size + '/' + nameCodes.length + '），请重新读取。');
  const effects = new Map((Array.isArray(details.state_effects) ? details.state_effects : []).map(effect => [String(effect.id), effect]));
  const missing = new Map();
  const characters = details.character_details.map(detail => characterEntry(detail, effects, missing));
  for (const [label, count] of missing) warnings.push(label + '有 ' + count + ' 处缺失，请在导入预览中核对。');
  onProgress('核对读取期间的登录账号…');
  const ending = await readIdentity(request, readOpenId, signal);
  if (!sameIdentity(ending, identity)) throw new Error('读取期间账号或区服发生变化，请重新确认账号再读取。');
  checkAbort(signal);
  const nickname = basic.basic_info?.nickname;
  return {
    format:'nikke-photos-account', version:1, source:'blablalink', exportedAt:new Date().toISOString(),
    areaId:identity.areaId, profileName:typeof nickname === 'string' ? nickname.slice(0,100) : identity.roleName,
    synchroLevel:number(outpost.synchro_level), outpostLevel:number(outpost.outpost_battle_level),
    researches, characters, warnings,
  };
}
module.exports = {WEB_URL, API_ORIGIN, ENDPOINTS, checkAbort, readIdentity, collectAccountData};
