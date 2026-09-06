# 木刻控件图标

本目录提供同一张图集切分的 49 枚独立木刻图标。单色旧纸墨迹、细刻痕与轻微缺墨边缘构成共同风格；图形具有独立轮廓，不增加统一的圆形外框。操作名称与可访问标签由 Web 组件提供。

[生成原图](../control-icons.png)为 1254 × 1254 的七列七行图集。浏览器 WebP 为 192 × 192，图形等比适配 152 × 152 后居中，保留透明边缘与内部刻痕。切分使用的横向中心是 122、289、457、627、795、963、1131，纵向中心是 126、300、477、650、816、975、1139；每格先取 164 × 164 区域，再按墨迹范围裁切。

原图的中性浅色底与带色墨迹分离为 alpha，运行时图形外部透明。去除浅色杂点后，以实际墨迹边界等比缩放并居中；文件名包含内容校验码。颜色与边缘在暗色控件上核对。导航的开始对局使用交叉兵器，新增记录使用加号。

## 图标映射

| 位置 | 文件                               | 含义     |
| ---- | ---------------------------------- | -------- |
| 1-1  | `woodcut-back-3c482090.webp`       | 返回     |
| 1-2  | `woodcut-forward-2418afd8.webp`    | 前进     |
| 1-3  | `woodcut-down-4b8c4e32.webp`       | 下拉     |
| 1-4  | `woodcut-refresh-8743741d.webp`    | 刷新     |
| 1-5  | `woodcut-swap-3ff0023c.webp`       | 交换     |
| 1-6  | `woodcut-cards-308d1856.webp`      | 身份牌   |
| 1-7  | `woodcut-check-185a268a.webp`      | 确认     |
| 2-1  | `woodcut-copy-d8f7ddaa.webp`       | 复制     |
| 2-2  | `woodcut-target-626ca9f2.webp`     | 目标     |
| 2-3  | `woodcut-crown-bc4bf254.webp`      | 警长     |
| 2-4  | `woodcut-dice-44a9dbc7.webp`       | 随机     |
| 2-5  | `woodcut-grip-c60ce9c8.webp`       | 拖动     |
| 2-6  | `woodcut-more-e2769894.webp`       | 更多     |
| 2-7  | `woodcut-drop-28a82852.webp`       | 水滴     |
| 3-1  | `woodcut-eye-be7a07c9.webp`        | 观战     |
| 3-2  | `woodcut-eye-closed-0cc5c996.webp` | 闭眼     |
| 3-3  | `woodcut-flask-bdbd6bf9.webp`      | 药剂     |
| 3-4  | `woodcut-save-a0365300.webp`       | 保存     |
| 3-5  | `woodcut-settings-bea19bfc.webp`   | 设置     |
| 3-6  | `woodcut-hand-afcc2177.webp`       | 手掌     |
| 3-7  | `woodcut-heart-6eb1f741.webp`      | 心形     |
| 4-1  | `woodcut-award-ed3c80fd.webp`      | 奖章     |
| 4-2  | `woodcut-minus-6f26100b.webp`      | 减少     |
| 4-3  | `woodcut-moon-6fca9994.webp`       | 夜晚     |
| 4-4  | `woodcut-pause-f2f721a6.webp`      | 暂停     |
| 4-5  | `woodcut-edit-2c895ffc.webp`       | 编辑     |
| 4-6  | `woodcut-play-7008278a.webp`       | 播放     |
| 4-7  | `woodcut-plus-d0673e72.webp`       | 增加     |
| 5-1  | `woodcut-pulse-6ace50f0.webp`      | 活动     |
| 5-2  | `woodcut-pawn-eb626bd5.webp`       | 玩家棋子 |
| 5-3  | `woodcut-scales-32a25d9d.webp`     | 投票天平 |
| 5-4  | `woodcut-shield-19a1bccd.webp`     | 守护     |
| 5-5  | `woodcut-shuffle-addb20e9.webp`    | 洗牌     |
| 5-6  | `woodcut-skip-8c2b2f76.webp`       | 跳过     |
| 5-7  | `woodcut-skull-f7e59ce1.webp`      | 出局     |
| 6-1  | `woodcut-smile-765a6352.webp`      | 人设面具 |
| 6-2  | `woodcut-sparkle-c191768c.webp`    | 特效     |
| 6-3  | `woodcut-sound-79aa818b.webp`      | 声音     |
| 6-4  | `woodcut-mute-e53ecd5e.webp`       | 静音     |
| 6-5  | `woodcut-stop-e617e82a.webp`       | 停止     |
| 6-6  | `woodcut-sun-cd6c6de2.webp`        | 白天     |
| 6-7  | `woodcut-text-c2e0991f.webp`       | 文本     |
| 7-1  | `woodcut-trash-c9d3c27c.webp`      | 删除     |
| 7-2  | `woodcut-upload-fc78e816.webp`     | 上传     |
| 7-3  | `woodcut-group-8be52a44.webp`      | 玩家群组 |
| 7-4  | `woodcut-warning-8b9457d4.webp`    | 提醒     |
| 7-5  | `woodcut-wifi-3d82da77.webp`       | 连接     |
| 7-6  | `woodcut-close-5e262061.webp`      | 关闭     |
| 7-7  | `woodcut-battle-3aca3563.webp`     | 开始对局 |

## 生成提示词

使用内置 ImageGen，参考游戏导航的木刻图形。

```text
Use case: stylized-concept. The attached screenshot is the approved VISUAL STYLE REFERENCE. Study the crossed swords, theatre mask and cog: thin, somber, angular antique woodcut printer's marks. Create a complete production atlas of EXACTLY 49 matching UI glyphs, 7 columns x 7 rows, each icon aligned to the same regular cell centers. Bare glyphs only. TRUE TRANSPARENT background. No words, no labels, no numbers, no grid, no tile borders.
Use ONE FLAT INK COLOR only: muted desaturated antique taupe #A69A80. The output must look like small illustrations stamped into a 19th-century printed folktale book, NOT physical objects, stickers, embossed paper, rounded cartoon icons or gold tokens. Medium-thin angular strokes and negative-space engraving, mature restrained silhouettes, tiny chipped/broken ink-edge marks. Slight hand-carved line variation. NO white bevels, NO yellow, NO orange outline, NO inner doubled outline, NO shine, NO drop shadow, NO raised edges, NO dimensional shading, NO paper-cut thickness, NO cute faces. All glyphs bare, NO added circles/rings/disks around them. Keep about 25% clear margin within each cell. Legible at 24px, simplified internal detail. Reference's serious flat woodcut character, not bubbly stock illustration.
Exact row-major grid:
R1: left arrow; right arrow; down chevron; curved refresh arrow; two opposing horizontal arrows; three overlapping rectangular playing cards; checkmark.
R2: overlapping document sheets; crosshair; pointed crown; die with five pips; six-dot vertical drag grip; three horizontal dots; teardrop.
R3: almond eye; closed eye slash; alchemical flask; simple save disk silhouette; eight-tooth cog; upright hand; anatomical-symbol heart simplified.
R4: award medallion with two ribbon ends; minus; crescent moon; two pause bars; quill-like diagonal editing pen; play triangle; plus.
R5: heartbeat zigzag; tall board-game pawn; balanced scales; shield; crossed shuffle arrows; skip triangle and bar; stern skull.
R6: solemn Chinese theatre mask (no happy cartoon grin); four-point glint; speaker with waves; muted speaker slash; stop square; sun rays; two horizontal text strokes.
R7: lidded rubbish bin; upload arrow and tray; three pawn silhouettes; warning triangle and exclamation; signal arcs; close X; TWO CROSSED CHINESE STRAIGHT SWORDS matching the reference.
A glyph may intrinsically be round (cog, refresh, target) but NEVER add an enclosing circular badge. Uniform subdued taupe-ivory monochrome. Prefer narrow angular silhouettes with visible empty space to thick inflated shapes. Pixel transparency outside marks, no grey field. Generate one square image at high resolution.
```
