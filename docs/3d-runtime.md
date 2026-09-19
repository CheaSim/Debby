# FinPet 3D 桌宠运行时

## 结论

FinPet 不把 Mate-Engine Unity 工程硬塞进 Electron 渲染层。Mate-Engine 是 Unity 工程，且仓库的 MateProv2/AGPL 混合许可限制了衍生版本的分发方式；仓库也明确提示默认头像不能随自有构建再分发。FinPet 现在有两层运行时：默认使用独立的 Three.js WebGL 角色，另提供旁车启动器直接运行本地 MateEngineX.exe，让非商用用户可以使用上游完整 3D/VRM 能力。

研究来源：

- https://github.com/shinyflvre/Mate-Engine
- https://github.com/shinyflvre/Mate-Engine/blob/main/LICENSE.md

## 当前能力

- 透明 Electron 窗口中的 Three.js 3D 角色
- 低面数金融主题角色：耳朵、尾巴、胸前行情徽章、上升柱状图装饰
- Hemisphere/Key/Rim 三点灯光、ACES 色调映射、抗锯齿和 DPI 自适应
- 待机呼吸、左右摆动、跟随鼠标视线、眨眼、点击跳跃
- `idle`、`bullish`、`bearish`、`alert`、`offline` 五种行情状态材质反馈
- 紧凑桌宠和展开行情面板共用同一 3D 组件
- 托盘启动/关闭 Mate-Engine 官方 Windows 构建
- `npm.cmd run mate-engine:setup` 自动下载并解压最新公开构建到 Git 忽略目录

## 与 Mate-Engine 的能力映射

| Mate-Engine 思路 | FinPet 当前实现 |
| --- | --- |
| Idle animation | 呼吸、轻微悬浮和摆动 |
| Touch regions / dragging feedback | 角色区域点击跳跃、鼠标移动视线跟随 |
| Always on top / window sitting | 由 Electron 原生窗口和托盘控制 |
| Custom avatar | 当前为代码生成角色；后续可把 `buildPet` 替换成 GLB/VRM loader |
| Mood/event messages | 由行情状态和现有 speech bubble 驱动 |

## 旁车模式

旁车模式不复制或修改 Unity 二进制。FinPet 只负责启动和回收用户本地的 `MateEngineX.exe`，因此不需要在每台机器上安装 Node 原生窗口嵌入模块，也不会把 831 MB 的构建提交进 Git。Mate-Engine 自己的窗口、透明度、置顶、VRM 导入和拖拽行为由它的 Unity 运行时负责。

## 后续接入 VRM

如果要使用自有 VRM 模型，下一步只需要在 `ThreeDPet.tsx` 中增加 GLTF/VRM loader，把模型挂到同一个 `root`，并沿用当前的相机、灯光、ResizeObserver、输入事件和行情状态适配。模型文件必须由项目方确认可再分发，不能直接拿 Mate-Engine 默认头像打包。
