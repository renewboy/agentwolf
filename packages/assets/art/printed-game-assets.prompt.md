# 印刷游戏素材生成

使用内置 ImageGen 生成 `printed-game-assets.png`，实际尺寸 1254 × 1254。狼徽、山林、空白红牌与
空白身份签分别裁切为独立 WebP。边缘中的透明留白不计入控件文字承托区域。

## 提示词

```text
Use case: stylized-concept. Create a production asset atlas for a Chinese folk-mystery werewolf game, a strict 2 by 2 grid of 1024px square cells, total 2048x2048, four different assets centered in separate cells, no grid lines or captions. Art direction: old ivory hand-carved woodcut on extremely dark charcoal, worn dry ink, muted vermilion, authentic fine imperfect relief printing, no shiny bevels or gradients or neon. TOP LEFT: a right-facing wolf head in side profile with an incomplete circular crescent of rough ivory ink around it, elegant thin fur engraving, a tiny red square seal at lower right with no writing; large centered emblem fills 75% of cell. TOP RIGHT: a tall craggy Chinese mountain with pine tree growing on top and sparse forest at its foot, bottom-heavy composition, ivory engraved strokes, dark upper area, no moon, no figures, no text; suitable to anchor the bottom of a narrow game navigation sidebar. BOTTOM LEFT: a single wide blank muted vermilion rectangular inked plaque, aspect ratio 3.8:1, centered, dry ink scuffed outline and hairline black inner rim, softly distressed irregular edge, completely empty flat red interior for live button text. The edges must look physically printed, not a glossy digital frame. No symbols inside this plaque. BOTTOM RIGHT: a single wide blank worn ivory/grey paper identity label, aspect ratio 3:1, centered, thin dark ornamental ink rim with understated cut corners, slightly irregular paper edges, empty clean center for dynamic Chinese role text, no symbols, no lettering. All backgrounds true transparent alpha, all objects completely inside their cell with generous safe margin. No text, numbers, watermarks, UI, extra artifacts, cards or contact-sheet labels. All backgrounds true transparent alpha.
```
