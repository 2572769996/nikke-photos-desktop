import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_VERSION } from '../data/changelog.js'
import { specialRecruitBanners } from '../lib/recruitment.js'
import '../styles/about.css'

const local = (file) => `${import.meta.env.BASE_URL}${file}`

function Document({ title, file }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open || text) return
    const controller = new AbortController()
    setError('')
    fetch(local(file), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('文件暂时无法读取')
      return response.text()
    }).then(setText).catch(problem => {
      if (problem.name !== 'AbortError') setError('未能读取随附说明，请重试或下载原文件。')
    })
    return () => controller.abort()
  }, [open, file, retry, text])
  return <details className="about-document" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>
    <div className="about-document-body">
      <a href={local(file)} download>下载原文件</a>
      {error ? <p role="alert">{error} <button className="btn btn-sm" onClick={() => setRetry(value => value + 1)}>重试</button></p>
        : text ? <pre tabIndex={0} aria-label={title}>{text}</pre> : <p role="status">正在读取本地文件…</p>}
    </div>
  </details>
}

function Source({ children }) { return <p className="about-source">{children}</p> }

export default function AboutPage() {
  const [fullSource, setFullSource] = useState(false)
  useEffect(() => { window.nikkeDesktop?.getInfo?.().then(info => setFullSource(info.capabilities?.applicationSource === true)).catch(() => {}) }, [])
  return <main className="page about-page">
    <Link to="/my" className="back">← 返回更多</Link>
    <div className="page-head"><div><h1>关于</h1><p className="desc">软件信息、第三方来源与许可说明</p></div></div>
    <section className="about-section about-identity" aria-label="软件信息">
      <div><h2>NIKKE Photos</h2><p>妮姬档案、装备记录与本地计算工具</p></div>
      <div><span className="about-version">v{CURRENT_VERSION}</span><p>作者：小云雀来海</p></div>
    </section>

    <section className="about-section" aria-labelledby="about-project-license">
      <h2 id="about-project-license">软件许可</h2>
      <p>本项目原创代码采用 GNU GPL v3（GPL-3.0-only）。第三方组件保留各自的版权及许可，图片等素材不自动包含在代码许可中。</p>
      <Document title="本软件 GPL v3 许可全文" file="about/project-GPL-3.0.txt"/>
      {fullSource ? <a className="about-download" href={local(`about/NIKKE-Photos-v${CURRENT_VERSION}-source.zip`)} download>下载 v{CURRENT_VERSION} 对应应用源码（含构建说明）</a> : null}
    </section>

    <section className="about-section" aria-labelledby="about-components">
      <h2 id="about-components">第三方项目</h2>
      <p className="about-intro">感谢以下项目与数据贡献者。许可原文可离线阅读，来源地址可选中复制。</p>
      <article className="about-item"><h3>同步器升级计算</h3>
        <p>界面及库存规划算法由本项目实现。升级消耗按用户指定的 Prydwen Level requirements 表录入，分段按升到的等级计算；800+ 档仅使用至 1000 级。基地小时产出复用红球计算器已有 doro112 表（版本 202507，800 级）。</p>
        <p>大月卡箱 30/10/10 小时由用户确认；三选一箱 3/1/1 小时参考 NIKKE Synergy 的公开箱子定义。核对日期：2026-11-15。未复制这些网站的页面或计算代码。</p>
        <Source>https://www.prydwen.gg/nikke/guides/level-requirements<br/>https://nikkeoutpost.netlify.app/outpost.json<br/>https://nikke-synergy.com/outpost_en</Source>
      </article>
      <article className="about-item"><h3>主线剧情与简体转换</h3>
        <p>主线目录与正文来自 BlaBlaLink 的公开剧情资源，剧情版权归原权利人。软件按用户选择下载到本机供阅读，正文简体展示使用 OpenCC JS 1.4.2。</p>
        <Source>https://www.blablalink.com/shiftyspad/scene-list<br/>https://github.com/nk2028/opencc-js</Source>
        <Document title="OpenCC JS MIT 许可" file="about/opencc-js-MIT.txt"/>
        <Document title="OpenCC 字典与第三方来源说明" file="about/opencc-js-third-party.txt"/>
        <Document title="OpenCC 字典 Apache 2.0 许可" file="about/opencc-data-Apache-2.0.txt"/>
      </article>
      <article className="about-item"><h3>编队伤害模拟 <span>MIT</span></h3>
        <p>使用 Jgaram 的 nikke-calc Python 计算核心，固定上游源码保持原样。简体中文编队界面、档案快照导入与本地计算桥由本项目实现；新角色及机制跟随上游。Copyright © 2026 Jgaram。</p>
        <p>界面操作结构参考 DILDORO；未使用其未公开的服务端计算实现。独立 Python 3.12.10 仅用于本地伤害计算。</p>
        <Source>https://github.com/Jgaram/nikke-calc<br/>固定提交：67835ca3033a95482749ea2db35a8ee2a0856a92<br/>交互参考：https://dildoro.com/</Source>
        <Document title="伤害计算核心 MIT 许可" file="about/damage-simulator-MIT.txt"/>
        <Document title="核心来源与桌面适配说明" file="about/damage-simulator-source.txt"/>
        <Document title="独立计算 Python 许可" file="about/damage-python-LICENSE.txt"/>
      </article>
      <article className="about-item"><h3>红球计算器 <span>MIT</span></h3>
        <p>基于 zbxzbx98 的 NikkeCalc.vue，保留原始计算与查表算法，调整桌面布局、本地资源与设置存储。Copyright © 2024 zbxzbx98。</p>
        <p>原始关卡与产出数据来源：doro112 / nikkeoutpost。</p>
        <Source>https://github.com/zbxzbx98/zbxzbx98.github.io<br/>https://nikkeoutpost.netlify.app<br/>固定提交：4a2d9a5219919c3b88b7c1f9eff85ad8424e1d6b</Source>
        <Document title="MIT 许可全文" file="about/zbx-MIT.txt"/>
      </article>
      <article className="about-item"><h3>洗词条计算器与装备 OCR <span>GPL-3.0-or-later</span></h3>
        <p>计算器基于 ChrisLu7899 的 NIKKE Workshop 1.0.15；装备 OCR 的部分定位、模板和判定模块也复用了该项目。桌面版适配独立界面、本地存储、角色装备快照与计算策略，保留原作者和源码版权标头。</p>
        <Source>https://github.com/ChrisLu7899/NIKKE-Workshop<br/>固定提交：24b52299b23098cb6f816a5a3308daa8b2058388</Source>
        <Document title="GPL 许可全文" file="about/workshop-GPL.txt"/>
        <Document title="洗词条组件来源与修改记录" file="tools/equipment-reroll/SOURCE-NOTICE.txt"/>
        <Document title="组件源码构建说明" file="tools/equipment-reroll/source/BUILDING.txt"/>
        <a className="about-download" href={local('about/equipment-reroll-source.zip')} download>下载洗词条组件源码（含构建说明）</a>
      </article>
      <article className="about-item"><h3>秘钥策略与装备洗练模拟器 <span>MIT / GPL-3.0-or-later</span></h3>
        <p>复用 zbxzbx98 的秘钥求解器、模拟器、四装备求解器及档位范围。原始组件保留 MIT 许可，桌面集成适配沿用 GPL-3.0-or-later。Copyright © 2024 zbxzbx98。</p>
        <Source>https://github.com/zbxzbx98/zbxzbx98.github.io<br/>固定提交：4a2d9a5219919c3b88b7c1f9eff85ad8424e1d6b</Source>
        <Document title="zbx 原始组件许可全文" file="tools/equipment-reroll/ZBX-LICENSE.txt"/>
      </article>
      <article className="about-item"><h3>收藏品强化规划器 <span>MIT</span></h3>
        <p>基于 SHIKI1255 的 NIKKE SR 收藏品强化规划器 1.4.0，保留原计算引擎、2026-07-29 规则基线与本地库存历史；适配桌面工具入口、主题及独立存储来源。Copyright © 2026 SHIKI1255。</p>
        <Source>https://github.com/SHIKI1255/nikke-sr-collection-planner<br/>固定提交：e9f3d9462241cd48a9cb4fb2bbc51a68c2e21049</Source>
        <Document title="收藏品规划器 MIT 许可全文" file="about/sr-collection-MIT.txt"/>
        <Document title="收藏品规划器来源与修改记录" file="about/sr-collection-source.txt"/>
        <Document title="收藏品规划器原项目免责声明" file="about/sr-collection-disclaimer.txt"/>
      </article>
      <article className="about-item"><h3>自动化开发组件 <span>MaaNikke · GPL-3.0</span></h3>
        <p>装备采集复用 MaaNikke 的部分识别、资源与 Agent，基于 MaaFramework 5.12.2；模型来源为 PaddleOCR PP-OCRv6。其他框架、依赖与模型的条款须分别核对，不统一视作 MaaNikke 的代码许可。</p>
        <Source>https://github.com/Shinarin/MaaNikke<br/>固定提交：eab10c90ba1f3502bf9576a6669d0f83e27bbc1e<br/>https://github.com/MaaXYZ/MaaFramework<br/>https://www.paddleocr.ai</Source>
        <p>上游另有非商业用途及游戏素材声明，具体适用范围与发行要求待核实。完整客户端随附采集所需运行环境与识别资源。</p>
        <Document title="MaaNikke 许可全文" file="about/maanikke-GPL.txt"/>
        <Document title="自动化组件来源与适配记录" file="about/automation-notice.txt"/>
        <Document title="OCR 模型来源说明" file="about/ocr-model-source.txt"/>
      </article>
    </section>

    <section className="about-section" aria-labelledby="about-dependencies">
      <h2 id="about-dependencies">软件依赖与运行环境</h2>
      <p>使用 React、React Router、Vue、Element Plus、ExcelJS、html-to-image、pinyin-pro 等组件；桌面运行环境为 Electron / Chromium。各项适用条款以随附原文为准。</p>
      <Document title="主界面依赖许可" file="about/host-dependencies.txt"/>
      <Document title="计算工具第三方依赖许可" file="tools/equipment-reroll/THIRD_PARTY_LICENSES.txt"/>
      <Document title="Electron 许可全文" file="about/electron-LICENSE.txt"/>
      {fullSource ? <><Document title="Python 许可全文" file="about/Python-LICENSE.txt"/><Document title="采集运行环境依赖许可" file="about/Python-dependencies.txt"/></> : null}
      <a className="about-download" href={local('about/chromium-licenses.html')} download>下载 Chromium 第三方许可集合（HTML）</a>
      <p className="about-muted">计算工具清单保守包含部分仅用于 Node 的依赖，不代表每个列出的包都在页面中运行；未声明条款的项不视为已获授权。</p>
    </section>

    <section className="about-section" aria-labelledby="about-assets">
      <h2 id="about-assets">注意事项</h2>
      <p>游戏头像、立绘、图标、音效、名称与商标属于 SHIFT UP、PROXIMA BETA 及相关权利人。代码的开源许可不自动覆盖这些素材；公开可访问或用户提供的文件不等于取得公开再分发许可。</p>
      <p>按钮点击、洗练结果提示及效果变更的音效取自国服游戏客户端，相关权利归原权利人所有，公开再分发许可待核实。</p>
      <p>蓝色点击特效使用国际服客户端的通用点击图集 fx_touch_point_atlas，按 UITouchEffect 的粒子大小、发射时间和材质混合方式在桌面端播放。</p>
      <p>特殊招募使用国际服客户端中玛丽安：女王、思凯、红莲：弑神各自的展示影片，以及国服客户端的通用招募素材及原声。闸门、企业转场、角色登场和结果揭晓按客户端动画时间线重建。</p>
      <p>思凯池的角色名条、单抽与十连按钮，以及红莲池的招募界面，参照当期游戏实录。</p>
      <Source>https://www.youtube.com/watch?v=AwAwkYmSE3A&amp;t=3160s<br/>https://www.bilibili.com/video/BV1oPs26pEJW/?t=41.5</Source>
      <p>玛丽安、红莲和思凯各期 145 名角色的概率分别核对国际服 2026 年 10 月 29 日及 11 月 19 日的公示。三个特殊池与联动自选池共用黄金积分券，抽获和兑换记录按池保存。</p>
      <p>联动自选是本地模拟规则。玩家从本期群像中选择一名联动 SSR 作为 2% UP。其余角色沿用思凯池的非 UP 名单与分组概率。</p>
      <p>结算使用游戏通用结算图集和 SkyXMoon/NikkeAssets 收录的角色半身像。招募配乐为 Cosmograph 的《ShowCase》。升降机与等待拉锁共用游戏版 Menu Gacha Default 的开头，开门演出中切换至 Menu Gacha Open，翻牌时切入 Default 约 1 分 02 秒处，与玛丽安当期实录对应。</p>
      <Source>https://github.com/SkyXMoon/NikkeAssets<br/>https://www.youtube.com/watch?v=hMOFSz6MOes<br/>https://downloads.khinsider.com/game-soundtracks/album/goddess-of-victory-nikke-android-ios-mobile-gamerip-2022<br/>https://www.bilibili.com/video/BV1oPs26pEJW/?t=320</Source>
      <p>首次获得和重复奖励根据本地模拟抽取记录判定。结算构图与积分券参考实机截图，躯体标签图案与数量参考 GameWith 资料。珠宝和高级招募券图标取自 Loot &amp; Waifus 收录的游戏道具图。</p>
      <Source>https://m.ruliweb.com/community/board/300143/read/73644902<br/>https://gamewith.jp/nikke/article/show/372029<br/>https://lootandwaifus.com/tooltips/nikke/gem.webp<br/>https://lootandwaifus.com/tooltips/nikke/advanced-recruit-voucher.webp</Source>
      <Source>{specialRecruitBanners.marian.noticeUrl}<br/>https://www.blablalink.com/post/detail?post_uuid=2941068716346652848&amp;lang=ko<br/>{specialRecruitBanners.marian.ratesUrl}<br/>{specialRecruitBanners.sky.noticeUrl}<br/>{specialRecruitBanners.sky.ratesUrl}</Source>
      <p>常驻模拟池以国际服 2026 年 11 月 19 日公示的 144 名角色为基础，额外开放思凯、玛丽安：女王、红莲：弑神。模拟从第一抽开始使用完整的 20 人愿望清单。每日半价、愿望清单的分组概率和 2026 年追加招募参考国际服公告。</p>
      <Source>https://docs.google.com/spreadsheets/d/e/2PACX-1vQdVV_dKg7lTl9KkIIU4ZylWgE4qq8WzDHnMC9ljzbiIsZwY6vnqZa2PkAIeDUiTO8du4CqTv9KufYE/pubhtml#gid=647451479<br/>https://nikke.hotcool.tw/News_detail-56<br/>https://nikke.hotcool.tw/News_detail-121<br/>https://nikke.hotcool.tw/News_detail-175</Source>
      <p>普通招募背景取自国际服客户端，并与同期游戏画面对照。普通招募券和白银积分券图标由 Loot &amp; Waifus 收录。</p>
      <Source>https://trees.gamemeca.com/amp/view.php?gid=1782927<br/>https://lootandwaifus.com/tooltips/nikke/recruit-voucher.webp<br/>https://lootandwaifus.com/tooltips/nikke/silver-mileage-ticket.webp</Source>
      <Document title="思凯角色资料与图片来源（BlaBlaLink）" file="asset-notices/sky.json"/>
    </section>
  </main>
}
