# 木刻美术素材

本目录保存 AgentWolf 的浏览器美术素材。场景、人物、图标和控件材质使用同一套炭黑、纸色与朱砂
印刷语言，图像通过内置 ImageGen 生成。文字、人数、身份和游戏状态由组件渲染。

## 浏览器交付

| 素材                                                                | 用途                                        |
| ------------------------------------------------------------------- | ------------------------------------------- |
| village-night.webp                                                  | 大厅村落背景，保持顶部、裁切底部            |
| hero-printed-edge.webp                                              | 大厅封面下沿的浅色磨损印刷边                |
| wolf-crescent-seal-\*.webp                                          | 参考图提取的咧齿狼徽、月牙与小印章          |
| ridge-tree-seal-\*.webp                                             | 参考图提取的斜坡山林、枯枝与山林有影印章    |
| `headline-pigment-*.webp` / `charcoal-pigment-*.webp`               | 大厅标题的矿物颜料颗粒与深色印刷底纹        |
| default-player.webp                                                 | 未绑定 Character 的统一人物头像，以圆形显示 |
| card-back.webp                                                      | 板型牌组图形                                |
| cinnabar-impression.webp                                            | 文字主按钮的朱砂缺墨印面                    |
| `cursors/*.png`                                                     | 用户提供的鼠标两态，原生光标热点位于箭尖    |
| `portrait-etched-ring-*.webp`                                       | 由控件刻印边线转换的圆形配置头像框          |
| charcoal-wood.webp / rice-paper.webp                                | 控件与面板底材                              |
| cinnabar-ink.webp / engraved-frame.webp                             | 刻印表面与边缘                              |
| date-wood-rail.webp / date-wood-center.webp                         | 日期分组的木质横线和中央菱榫雕纹            |
| council-woodcut-source.png                                          | 用户确认的玩家卡与双款气泡原始参考          |
| council-player-frame.webp / council-avatar-frame.webp               | 玩家卡边缘与凸出的狼月头像轮廓              |
| council-dark-paper.webp / council-cloud.webp / council-village.webp | 玩家卡纸面、云纹与村落                      |
| `speech-paper-*.webp` / `speech-cinnabar-*.webp`                    | 白色与朱砂气泡的边缘、纸面、云纹和山林      |
| roles/\*                                                            | 20 套身份配色和中性未知身份材质             |
| icons/\*.webp                                                       | 导航与功能操作图标                          |

`hero-printed-edge.webp` 从刻印框的浅色上边缘提取，保留透明背景、缺墨颗粒与轻微起伏。
复盘评分分隔线复用 `engraved-frame.webp` 的面板下边缘。

原始 PNG 包含场景、牌背、人物、`printed-game-assets.png`、`tabletop-materials.png`与
`control-icons.png`。切分素材保留透明边缘，裁切依据实际图形范围；运行时使用压缩后的 WebP。
`game-art.ts` 提供场景 URL，GameIcon 提供通用图标。

- [图标映射与生成提示词](icons/README.md)
- [控件底材提示词](materials.prompt.md)
- [狼徽、山林、按钮和身份签提示词](printed-game-assets.prompt.md)
- [朱砂印面提示词](cinnabar-impression.prompt.md)
- [默认人物头像提示词](default-player.prompt.md)
- [对局木质材质图集与提示词](match-wood-materials.prompt.md)
- [身份材质目录与替换方式](roles/README.md)
- [玩家卡与气泡的提取说明](council-woodcut.prompt.md)
- [大厅品牌素材与颜料纹理](lobby-print-assets.prompt.md)

Role 身份、人数和其他动态数值不绘制进素材。绑定 Character 的玩家使用对应 Character 肖像；
默认头像不携带阵营、Role 或技能信息。
