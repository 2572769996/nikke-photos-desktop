import { useState } from 'react'
import { Link } from 'react-router-dom'
import { setSoundsEnabled, soundsEnabled } from '../lib/uiSound.js'

function SoundSetting({ group, title, children }) {
  const [enabled, setEnabled] = useState(() => soundsEnabled(group))
  return <section className="panel settings-sounds">
      <div><h2 id={group+'-sound-label'}>{title}</h2>
        <p className="config-note" id={group+'-sound-note'}>{children}</p></div>
      <button type="button" role="switch" aria-checked={enabled} aria-labelledby={group+'-sound-label'}
        aria-describedby={group+'-sound-note'} className={enabled ? 'switch on' : 'switch'} data-ui-sound={group === 'interface' ? 'silent' : 'click'} onClick={() => {
          setSoundsEnabled(group, !enabled)
          setEnabled(!enabled)
        }}><span className="track" />{enabled ? '已开启' : '已关闭'}</button>
    </section>
}

export default function SettingsPage() {
  return <main className="page">
    <div className="page-head"><h1>设置</h1><Link className="btn" to="/my">返回更多</Link></div>
    <SoundSetting group="interface" title="界面音效">播放按钮点击和切换选项的游戏音效。</SoundSetting>
    <SoundSetting group="wash" title="洗词条音效">显示洗练结果时，每条非空词条响一声，锁定词条也计入。采用新结果时播放变更音。</SoundSetting>
  </main>
}
