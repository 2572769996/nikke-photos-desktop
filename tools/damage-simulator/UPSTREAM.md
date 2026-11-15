# 伤害模拟核心

- 来源：https://github.com/Jgaram/nikke-calc
- 固定提交：67835ca3033a95482749ea2db35a8ee2a0856a92（2026-11-02）
- 原作者：Jgaram；计算核心采用 MIT，原许可保留在 vendor/LICENSE。
- vendor 为固定版本原始源码；不修改技能、公式或时间轴。新角色跟随上游，不自行补造。
- 桌面界面及进程适配在 vendor 外维护，玩家养成通过内联 JSON 输入，不写入 vendor/profiles。
- 游戏角色、数据和图片权利不包含在 MIT 代码许可中；遵循软件“关于”中的待核实说明。

开发准备运行 desktop-scripts/setup-damage-simulator.ps1；它下载固定上游归档和官方 Python 3.12.10 Windows x64 嵌入运行时，只写本项目的 tools/damage-simulator 与 .cache/damage-simulator，不安装系统 Python。不执行游戏、采集或管理员操作。

Python 来自 https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip ，其许可保留在 python/LICENSE.txt。来源、文件 SHA256 与引擎提交记录在 provenance.json。
