# 从一张立绘到可独立运动的角色

来源核对：2026-11-01。Debby 将资产制作和桌面播放分开，推理环境与模型权重不进入桌宠安装包。

## 选型

| 工程 | 能完成的环节 | Debby 的接法 |
| --- | --- | --- |
| [See-through](https://github.com/shitagaki-lab/see-through/tree/df019de5129d6c4b406587a14c3501669441a783) | 单图语义拆分、遮挡补绘、深度排序、PSD 输出 | 本地 Python 子进程，或显式选择的 Gradio 资产制作端点 |
| [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig/tree/7ddbd9943ea3152561b3dc8348fd752c850f3e95) | 已分层 PSD 的锚点、五官、虹膜裁剪、网格、发丝弹簧 | Debby 已固定版本本地播放，宿主统一驱动表情与口型 |
| [StandRig](https://github.com/sayaka-aiart/StandRig/tree/d639ea5b123c37c1c3b7981b01b2cf64d3bd9e91) | 人工或 Agent 精细绑定、原生旋转层级、蒙皮、表情参数 | 保留 `.srig` 导入与原有鲸鱼娘骨架包 |
| [Stretchy Studio](https://github.com/MangoLion/stretchystudio) | 分层 PSD、DWPose 辅助骨架、形状关键帧和肢体蒙皮 | 后续整身 2D 动作作者工具候选，当前没有移植其运行时 |
| [rig-c/parts](https://github.com/rig-c/parts) | 全身与头部两次分层、部件检查、网格和绑定的 Agent 工作流 | 参考其逐层验收；没有引入 Spine 官方运行时 |

为整张插画加网格、或把同一张画切成多个三角形，都不会补出被头发挡住的脸、被衣服挡住的皮肤。它们和本页的语义拆层是两道独立工序。`See-through` 的输出也需要检查：不同图像可能漏掉衣服或产生错误五官，并不保证每张图都有完整的所有部件。

## 在线作者接口

```powershell
$env:HTTP_PROXY='http://127.0.0.1:7897'
$env:HTTPS_PROXY='http://127.0.0.1:7897'
$env:NODE_USE_ENV_PROXY='1' # Node 24.5+
npm.cmd run avatar:decompose:hosted -- --endpoint https://YOUR-GRADIO-HOST --input D:/art/character.png --output D:/art/layers --resolution 768
```

该命令会将输入图片上传至你明确指定的主机，不会被桌宠自动调用。可使用自己的 See-through Gradio 实例；作者的 [HF 演示](https://huggingface.co/spaces/24yearsold/see-through-demo) 和 [ModelScope 演示](https://modelscope.cn/studios/ljsabc/See-Through) 受各自登录、GPU 配额、排队及可用性约束。403 表示需要登录，不尝试绕过。取消停止当前客户端，但不保证远端 GPU 作业也停止。没有实现共享免费额度或绕过限流。

每次成功输出到新建目录：`character.psd`、按语义命名的 PNG、含输入及结果 SHA-256 的 `provenance.json`。校验 RGB / 8 bit PSD、PNG 签名、输出大小及文件来源；重定向或跨主机下载会被拒绝。

其他 Agent 可直接复用接口，注入网络、进度和取消，不依赖 Electron：

```js
import { readFile } from 'node:fs/promises'
import { decomposeHosted } from './integrations/see-through-hosted.mjs'
const controller = new AbortController()
const result = await decomposeHosted({
  endpoint: 'https://YOUR-GRADIO-HOST',
  image: await readFile('character.png'), filename: 'character.png', resolution: 768
}, { signal: controller.signal, fetch, onProgress: event => console.log(event.phase) })
// result.files: { name, role, bytes, sha256 }[]; result.provenance: reproducibility metadata
```

本地 Python 路径见 [推理环境与 PSD 后端](layered-avatar-integration.md)。AMD 使用官方匹配的 ROCm/PyTorch；不能拿 CUDA 安装命令直接替代，也不能只凭 GPU 型号承诺推理成功。

仅运行这条无 GUI 的推理路径时，可在匹配 GPU 的 torch / torchvision 安装完成后，安装 `integrations/requirements-see-through.txt`；不必安装上游 Qt 编辑器、训练、SAM2 或人像检测的全部可选依赖。仍需完整检出上表固定版本的 See-through，适配器通过子进程的 PYTHONPATH 载入其 `common` / `annotators`。Python、权重及临时输出应放在独立目录，不能提交进应用仓库。

## 验收和播放

内置鲸鱼娘已在 Windows / RX 9070 XT 16 GB 上完成真实本地推理：Python 3.12.9、PyTorch 2.9.1 / ROCm 7.2.1、BF16、1024 分辨率、30 步、seed 42，分组卸载；先释放 LayerDiff，再运行 768 分辨率的 4 步深度排序。两个权重仓库分别固定为 `4477e6ce529bc6a141732e1a55a4932176db3b89`、`4f4ffc46050b6feb764b628859968a26e76e6b6a`，下载后校验 LFS SHA-256。无需在桌宠播放时重新加载这些权重。

工坊「遇见鲸鱼娘」现在加载 27 个独立部件的 `debby-whale-girl.psd`。原封未改的旧内置立绘和骨架包按文件长度与 SHA-256 精确迁移；自改文件保持原样。分层版本包含原创斜向闭眼/闭口笔画；制作脚本还提供过大鼻部蒙版的修整逻辑，本次成品无需启用它。源 PSD、输入图片、模型版本、运行参数、实际修改记录和成品哈希保存在角色目录的 `layered-provenance.json`。

真实渲染验收：原轮廓覆盖率 99.32%，可见面积为原图的 100.74%；虹膜左右移动只改变脸部，身体像素不变；闭眼、开口、隐藏脸部、隐藏尾巴均产生对应像素变化；减少动态效果后发丝静止。检查摆头和抬手的实际图片，衣服完整、连接处连续。此前 768 结果漏裙装、1280 本机结果无效，均未替换为发布资产；这里验证的是 1024 这一次结果，不承诺所有图片/分辨率均能成功。

运行 `npm.cmd run test:decomposed-avatar` 可复核实际内置 PSD，检查工坊选择、口型、保存/恢复、Agent 表情/动作，以及舞蹈停止后恢复分层角色。它默认使用隐藏、不可聚焦、静音的独立 Electron 用户目录，不采集设备或调用云模型。全身、五官、工坊截图与测量输出在忽略的 `work/decomposed-avatar/`。

工坊 → 导入 PSD →「查看拆分图层」可单独关闭部件。该开关只作用于预览，保存及桌面角色始终使用完整模型。关闭前发应看见完整脸部；关闭虹膜仍有眼白；开闭嘴只改变嘴部；摆头、手臂及发梢移动时检查连接覆盖。效果差的生成结果应修整或重做，不作为默认发布资产。

`debby-parts.js` 将 See-through 的 `eyewhite-l/r`、`irides-l/r` 等名称转为绑定器的语义角色，左右锚点按真实像素位置求得。保留各张独立贴图；没有用整张立绘模拟虹膜移动。眼球绘制继续受对应眼白蒙版裁剪。

表情协议、真实音频幅度、Agent/MCP 与行情情绪继续走统一的 `LayeredAvatarDriver.frame`。可选 `context.hiddenLayers` 允许宿主做逐层检查；`reducedMotion` 同时停止发丝风力。2D 基础动作与五官是网格形变，VRMA 全身舞蹈仍由现有 3D 骨骼后端承担。

代码、模型、角色美术各自遵循许可证。See-through 权重还继承模型卡的 Open RAIL 条款；鲸鱼娘衍生美术继续使用 CC BY-NC-SA 4.0，并保留原始署名链，不能套用 Debby 代码的 MIT 许可。
