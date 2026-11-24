import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { setSoundsEnabled, soundsEnabled } from '../lib/uiSound.js'
import { effectEnabled, setEffectEnabled, subscribeMotionPreference, systemReducesMotion } from '../lib/motionPreference.js'

function SettingSwitch({ id, title, children, enabled, setEnabled, cue = 'click' }) {
  return <section className="panel settings-sounds">
    <div><h2 id={id+'-label'}>{title}</h2>
      <p className="config-note" id={id+'-note'}>{children}</p></div>
    <button type="button" role="switch" aria-checked={enabled} aria-labelledby={id+'-label'}
      aria-describedby={id+'-note'} className={enabled ? 'switch on' : 'switch'} data-ui-sound={cue}
      onClick={() => setEnabled(!enabled)}><span className="track" />{enabled ? '已开启' : '已关闭'}</button>
  </section>
}

function SoundSetting({ group, title, children }) {
  const [enabled, setEnabled] = useState(() => soundsEnabled(group))
  function toggle(next) {
    setSoundsEnabled(group, next)
    setEnabled(next)
  }
  return <SettingSwitch id={group+'-sound'} title={title} enabled={enabled} setEnabled={toggle}
    cue={group === 'interface' ? 'silent' : 'click'}>{children}</SettingSwitch>
}

function MotionSetting({ effect, title, children }) {
  const enabled = useSyncExternalStore(subscribeMotionPreference, () => effectEnabled(effect))
  return <SettingSwitch id={effect+'-effect'} title={title} enabled={enabled}
    setEnabled={next => setEffectEnabled(effect, next)}>{children}</SettingSwitch>
}

export default function SettingsPage() {
  const systemReduced = useSyncExternalStore(subscribeMotionPreference, systemReducesMotion)
  return <main className="page">
    <div className="page-head"><h1>设置</h1><Link className="btn" to="/my">返回更多</Link></div>
    <SoundSetting group="interface" title="界面音效">播放按钮与选项音效，以及招募演出的音效和背景音乐。</SoundSetting>
    <SoundSetting group="wash" title="洗词条音效">显示洗练结果时，每条非空词条响一声，锁定词条也计入。采用新结果时播放变更音。</SoundSetting>
    <p className="config-note">{systemReduced
      ? '系统已开启「减少动态效果」，以下动画已暂停。你的开关选择会保留。'
      : '系统开启「减少动态效果」时，以下动画会自动暂停。'}</p>
    <MotionSetting effect="click" title="蓝色点击特效">在点击位置显示蓝色菱形和碎光。</MotionSetting>
    <MotionSetting effect="recruit" title="招募演出动画">播放卡池背景影片和招募演出。关闭后直接显示招募结果。</MotionSetting>
    <MotionSetting effect="wash" title="装备洗练动画">逐条揭晓洗练结果。关闭后同时显示本轮全部词条。</MotionSetting>
    <MotionSetting effect="interface" title="界面过渡动画">控制页面过渡和平滑滚动。</MotionSetting>
  </main>
}
