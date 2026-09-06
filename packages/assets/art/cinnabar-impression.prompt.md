# 朱砂印面

`cinnabar-impression.png` 是生成原图，`cinnabar-impression.webp` 是控件使用的透明背景。印面保留缺墨、纤维纹与轻微不规则边缘，文字由 Button 渲染。

选择态颜色从原图内部的 1200 × 240 区域（左上角 480、240）提取平均色，结果为 `#AF2C1C`。切分时按印面边缘裁切并保留少量透明留白，运行时纹理不携带文字。

## 生成提示词

使用内置 ImageGen，参考用户提供的朱砂按钮。

```text
Edit the attached red button reference into a reusable blank UI background. Match its EXACT material, color and wear pattern: matte deep cinnabar ink on old black paper, slight irregular edges, chipped black flecks mainly along edges, restrained uneven coverage. This is a flat printed ink rectangle, not an object. Remove the Chinese text completely. Remove all surrounding black background to actual transparent RGBA pixels. Retain ONLY one blank horizontal red print impression with width:height approximately 4:1, taking up 94% of the image width with narrow transparent margins.
Preserve the reference's desaturated dark terracotta/cinnabar red (roughly #9e3525 to #aa412c), with faint fibrous darker patches. The surface is flat color ink. NO ornamental frame, NO bevel, NO gold, NO bright orange, NO glow, NO shadow, NO rounded plastic corners, NO thick black stroke around the edge. Boundary may show thin broken black edge scratches exactly as reference, irregular slightly frayed ink edge and microscopic pinholes. No text, letters, logo, number, or other marks. The red center stays large and clean enough for a separately rendered white button label. High resolution horizontal image.
```
