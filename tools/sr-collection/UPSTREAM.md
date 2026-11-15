# 收藏品强化规划器来源与桌面适配

- 原项目：https://github.com/SHIKI1255/nikke-sr-collection-planner
- 作者：SHIKI1255，Copyright (c) 2026 SHIKI1255。
- 固定提交：e9f3d9462241cd48a9cb4fb2bbc51a68c2e21049。
- 程序版本：1.4.0；规则基线：2026-07-29。
- 原创代码及文档：MIT，完整原文见 vendor/LICENSE / 随附 LICENSE.txt。

vendor 中保留上游文本源文件、文档、规则、构建脚本和测试；upstream-manifest.json 记录每个文件的 Git blob SHA。未复制上游二进制核算底稿（reference/workbook 下的 xlsx），原文件可在固定提交查看。不修改或复制计算常量，core、state、runtime、公开 window.__SR_CALCULATOR__ API 均保持原样。

build.mjs 复用上游 assembleHtml 构建简体中文单文件，并在产物层移除独立主题按钮、跟随宿主主题，提供就绪和拖放文件消息。页脚仅保留数据基线，作者、来源和许可统一在宿主“更多 → 关于”展示。无网络依赖、账户、遥测或库存上传。嵌入独立 nikke://collection 来源，无法读取宿主角色档案的 localStorage；库存、保留量、当前经验和历史使用上游自己的本地存储键，与角色档案及其他工具分开。

在主项目根目录 npm ci 后，运行 node tools/sr-collection/build.mjs；完整 npm run build 会自动构建本工具。严格类型检查：node node_modules/typescript/bin/tsc --noEmit -p tools/sr-collection/vendor/tsconfig.json。上游单测在 vendor 工作目录运行 node --test tests/*.test.mjs，使用主项目锁定的 esbuild。桌面界面验收见 desktop-scripts/check-sr-collection.cjs。

计算结果为概率期望，混合策略比例不是单次成功保证；每次记录真实结果后重新计算。库存按工具个数保存，每10个工具折算一次强化；保留库存不参与可用预算。玩家自行记录实际结果，不会操作游戏。原项目免责声明和方法说明见 vendor/DISCLAIMER.md 及 vendor/docs/calculation_model.md。

2026-11-03：桌面构建在库存输入区明确提示仅适用于SR收藏品0–15级，R/SR/SSR为保养工具品质；当前等级标签明确SR。上游vendor、规则、算法未改，不提供R收藏品计算。

2026-11-03 文案适配：desktop-copy.js仅解释已经渲染的预计完成份数、当前推荐工具品质与库存瓶颈，补当前/目标等级、每次强化后重算及概率平均提示。原计算输出、取整、库存、状态、规则和vendor哈希不变。
