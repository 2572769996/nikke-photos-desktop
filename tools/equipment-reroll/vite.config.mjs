import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [{ name:'key-calculator-template', transformIndexHtml: { order:'pre', handler(html, context) {
    if (!context.filename.replaceAll('\\','/').endsWith('/keys/index.html')) return html
    return fs.readFileSync(new URL('./index.html',import.meta.url),'utf8')
      .replace('<html lang="zh-CN">','<html lang="zh-CN" data-calculator="keys">')
      .replaceAll('洗词条计算器','洗词条计算器（允许自订秘钥）').replace('装备洗练期望','洗词条计算器<br><small>（允许自订秘钥）</small>')
      .replace('比较当前盘面与目标，规划下一次洗练。','分别估算洗练石与自订秘钥，规划下一次操作。')
      .replace('四装备全局模拟','四装备总档位规划').replace('src="./src/desktop.js"','src="../src/desktop.js"')
  } } },vue()],
  base: './',
  cacheDir: process.env.NIKKE_VITE_CACHE ? `${process.env.NIKKE_VITE_CACHE}/equipment-reroll` : '../../../codex temp/nikke-desktop/vite-equipment-reroll',
  build: {
    target: 'esnext',
    rolldownOptions: { input: { keys:fileURLToPath(new URL('./keys/index.html',import.meta.url)), calculator:fileURLToPath(new URL('./index.html',import.meta.url)), simulator:fileURLToPath(new URL('./simulator/index.html',import.meta.url)) } },
    outDir: fileURLToPath(new URL('../../public/tools/equipment-reroll', import.meta.url)),
    emptyOutDir: true,
  },
})
