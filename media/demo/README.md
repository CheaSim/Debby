# Debby 竖屏演示

主片、封面、字幕和发布文案放在此目录。参数见 `validation.json`，复现方式见 [演示说明](../../docs/community-demo.md)。

原有主片、封面与 GIF 含第三方角色，不能将根目录的 MIT 代码许可证理解为第三方美术素材的再授权。角色 Zome：Yorshka；素材来源 Shiny / Mate-Engine。演示为个人非商用预览，角色使用遵循 [上游固定版本许可](https://github.com/shinyflvre/Mate-Engine/blob/2c5ea6b8f4cf5e1773a0816b46d9267cda5174d4/LICENSE.md)。VRM、贴图和独立角色素材不在此目录分发。

实际应用录制；行情为受控演示数据。旁白和对话声音由阿里云 TTS 合成，背景音乐为脚本原创合成音、没有外部采样。没有摄像头或麦克风录制素材。

## 鲸鱼娘多表情预览

`debby-whale-expressions.mp4`（720×1280，约 19.6 秒）与 `debby-whale-expressions.png` 展示同一位 DeepSeek 社区二创鲸鱼娘的七张分层全身立绘，已去除双手藏在背后的原好奇姿势。视频使用 `examples/avatar/mount-layered-avatar.ts` 的真实网格运行时播放，立绘以 220 ms 缓入缓出；静音，目光和口型为本地预览输入，没有调用云对话或采集设备；图集来自完整多立绘桌面 E2E。美术为 **CC BY-NC-SA 4.0**，署名链与完整许可见 [角色 NOTICE](../../src/renderer/public/models/whale-girl/NOTICE.md)。本段适用于新增鲸鱼娘预览，原有主片的说明见上文。
