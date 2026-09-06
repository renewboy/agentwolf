# 桌游控件材质图集

使用内置 ImageGen 一次生成四格素材，原图为 [tabletop-materials.png](tabletop-materials.png)。每格尺寸一致，使用 ImageMagick 按 2 × 2 格切分，并编码为 WebP。

| 位置 | 交付素材            | 用途             |
| ---- | ------------------- | ---------------- |
| 左上 | charcoal-wood.webp  | 炭化木纹控件表面 |
| 右上 | cinnabar-ink.webp   | 朱砂印泥关键动作 |
| 左下 | rice-paper.webp     | 纸质选中态       |
| 右下 | engraved-frame.webp | 可伸缩木刻边框   |

## 生成提示词

```text
Use case: stylized-concept. Create a production UI MATERIAL TEXTURE ATLAS for a crafted Chinese folk-mystery werewolf tabletop game. EXACT flat square canvas 1024x1024, divided into an exact 2 by 2 grid of 512x512 square material cells with NO gutters and NO labels. These are flat orthographic surface swatches for actual game UI backgrounds, not objects, no perspective, no shadows or surrounding scene. Top left cell: extremely dark charcoal black stained wood #1b1d17 with subtle fine dry woodgrain and sparse paper printing speckles; very low contrast, almost flat, must not distract under text. Top right cell: matte cinnabar red ink #aa412f rolled on textured paper, fine irregular hand-inked density, light worn speckles, tactile restrained pigment, no large scratches. Bottom left cell: aged warm grey-ivory rice paper #d8d0bb, natural fine fibers, no stains or text, subdued. Bottom right cell: charcoal black #1b1d17 field with a beautifully restrained fine engraved rectangular frame in muted parchment #9c967e, frame located 20px inside all four edges, tiny interrupted dry-ink irregularities, double line at 20px and 25px, carefully finished corner joins, an old physical game card border, ample black center; NO other symbols, corner ornaments, bevels, metallic shine, flourishes or words. Style is printed and hand crafted but highly legible modern UI. No glow, no gradients, no blue, no golden fantasy. Exact quadrant boundaries enable deterministic cutting.
```
