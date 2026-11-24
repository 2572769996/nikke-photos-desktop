import { recruitmentKeys } from '../lib/recruitmentStorage.js'

const notice = 'https://nikke.hotcool.tw/'

export const collabGroups = [
  { id: 'chainsaw', label: '电锯人', members: ['800', '801'], noticeUrl: notice + 'impt_5348.html' },
  { id: 'nier', label: '尼尔：机械纪元', members: ['810', '811'], noticeUrl: notice + 'News_detail-41' },
  { id: 'rezero', label: 'Re:从零开始的异世界生活', members: ['820', '821'], noticeUrl: notice + 'News_detail-81' },
  { id: 'eva', label: '新世纪福音战士 · 一期', members: ['830', '831', '832'], noticeUrl: notice + 'News_detail-103' },
  { id: 'eva2', label: '新世纪福音战士 · 二期', members: ['835', '834'], noticeUrl: notice + 'News_detail-129' },
  { id: 'stellar', label: '剑星', members: ['850', '851'], noticeUrl: notice + 'News_detail-143' },
  { id: 'resident', label: '生化危机', members: ['840', '841'], noticeUrl: notice + 'News_detail-160' },
  { id: 'lycoris', label: '莉可丽丝', members: ['860', '861'], noticeUrl: notice + 'News_detail-184' },
  { id: 'persona', label: '女神异闻录', members: ['870', '871'], noticeUrl: notice + 'News_detail-214' },
]

export const collabSsrIds = new Set(collabGroups.flatMap(group => group.members))
export const collabBanner = {
  id: 'collab', key: recruitmentKeys.collab, name: '联动自选', dailyFree: false,
}
export const validCollabMembers = ids => Array.isArray(ids) && new Set(ids).size === ids.length
  && ids.every(id => collabSsrIds.has(id))
