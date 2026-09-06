# 大厅品牌素材与颜料纹理

`lobby-print-reference.png` 保存用户提供的完整参考图。狼徽、斜坡山林、月牙和两枚印章直接从
该图提取，保留其轮廓、刻痕和朱砂色。透明负形由页面深色底纹承托。

## 裁片

- 狼徽与印章：原图坐标 `(44,39)`，范围 `123×124`。
- 山林与印章：原图坐标 `(0,730)`，范围 `199×294`。
- 深色印刷底纹：原图坐标 `(240,8)`，范围 `320×80`。

浏览器素材放大到两倍像素尺寸并保留透明边缘，实际显示保持原比例。文件名包含内容指纹。

## 标题颜料

`headline-pigment-source.png` 为内置 ImageGen 输出。导出纹理强调微小的局部缺墨颗粒；页面用
`background-clip: text` 将材质填入真实标题文字，文字仍可选择、读取和本地化。

内置 ImageGen 使用参考图生成颜料底材的提示词：

```text
Use case: style-transfer. Derive a seamless flat pigment texture from the worn cream lettering 天黑，请入局 in the reference. This is a material tile to clip inside live text, not a picture containing text. Warm aged ivory mineral pigment around #cdbf9f, matte, very fine granular dry-brush deposition, subtle uneven ink density and sparse charcoal pinholes and tiny worn scratches. Similar to the actual headline's letter surfaces in the reference. Fill the entire square canvas with the material evenly. No letters, words, symbols, large cracks, wood boards, fibers, directional lighting, 3D bevels or gradients. The grain must remain delicate enough for small print, with clearly readable ivory letters after clipping.
```
