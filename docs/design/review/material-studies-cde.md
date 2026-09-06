# 磨砂雕纹与纸质底面审核

状态：待用户审核，尚未用于页面。

审核范围包括磨砂做旧的边框、狼人杀雕纹和阅读面内的淡纸纤维。头像、字段和布局沿用页面实现；候选图中的内容仅作材质展示。

- [C：月蚀墨木](borders-moon-ebony.png)：深色木纹、月牙与抽象狼头。
- [D：旧檀狼纹](borders-wolf-sandalwood.png)：偏暖的旧檀纹理、狼形与月松雕纹。
- [E：灰木藏月](borders-ash-lunar.png)：低饱和灰木、月相与几何狼纹。

三张审核图均由内置 ImageGen 生成，保存为带真实 alpha 通道的 PNG。木框、阅读底面和文字保持不透明，组件外部透明。

[B 方案透明背景版本](borders-walnut-transparent.png)保留原图 RGB 像素，仅处理背景的透明度；组件内部的阅读表面仍完整保留。

## 生成提示词

### 方案 C

```text
Use case: ui-mockup. Generate a premium material-review sheet for a Chinese folk-mystery WEREWOLF tabletop web game. Landscape 1600 x 1000. Show one compact player card at upper left, one wider speech bubble at upper right, and two enlarged close-ups of their distinct corner/border details below. All components are front-on, aligned and fully inside the canvas. Exterior space around and between the components is truly TRANSPARENT, without a painted checkerboard. The dark surfaces INSIDE each card, bubble and close-up are foreground and must remain opaque.
The frame material must be convincingly matte, finely sanded and lightly aged: subtle frost-like abrasion, worn high points, visible wood pores and direction, shallow engraved patterns. Wear is restrained and tactile, not broken holes, dirty stains or scattered damage. No metal studs, screws, rivets, shiny copper/gold bevels, ropes, plastic, glow, or flat generic outline.
Integrate restrained WEREWOLF motifs into the actual rim: an abstract wolf-head silhouette, crescent moon or small lunar cuts. These must be CARVED or INLAID into the wood, not separate round badges or pasted icons. Different engraving pattern on player card and speech bubble; keep the center reading area quiet and unobscured. Rounded or gently shaped corners, slim substantial wooden rim.
All interior backgrounds have SUBTLE DARK PAPER TEXTURE: charcoal-olive #23251e with fine visible rice-paper fibers and a soft tooth, only 3–5 percent tonal variation. Not smooth gradients, not cloth or leather, not a grey overlay. Preserve high text contrast.
Player card layout: name left “云岚守夜”, small paper role label “预言家”, status “已结束”, footer “Agent · Model · High”. A compact round hooded human woodcut portrait on the right with a small seat number “2” at its lower edge. The portrait is secondary to the border study.
Speech bubble: a small integrated wooden tail points left. Above it write “云岚守夜” and “03:44”. Two readable paragraphs in warm ivory #d4c6a5:
“我先把发言和票型放在一起看，听完这一轮，再决定今天的选择。”
“还没有公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。”
Text is crisp, calm and contained. Use Songti for the name and a clean Chinese UI font for the speech. Keep all typography warm ivory, never pure white. Put a small clear study title in the top-left exterior space. Show the SAME design in the component and its enlarged detail; do not invent a different pattern in the close-up. This image is only for material review, no navigation, no buttons, no scenery.
STUDY C title: “C · 月蚀墨木”. Very dark smoked pearwood, charcoal-warm brown, matte lightly abraded grain. Player card: a quiet crescent carved into its upper-right wooden corner, with short fine lunar hatch marks following the rim. Speech frame: a tiny angular abstract wolf-head negative-space carving on the lower-left rim, tapering into understated fine parallel grooves. A restrained muted bone inlay catches the engraved edges; avoid bright outlines. Very small realistic edge wear. Dark-paper fibers remain softly visible inside.
```

### 方案 D

```text
Use case: ui-mockup. Generate a premium material-review sheet for a Chinese folk-mystery WEREWOLF tabletop web game. Landscape 1600 x 1000. Show one compact player card at upper left, one wider speech bubble at upper right, and two enlarged close-ups of their distinct corner/border details below. All components are front-on, aligned and fully inside the canvas. Exterior space around and between the components is truly TRANSPARENT, without a painted checkerboard. The dark surfaces INSIDE each card, bubble and close-up are foreground and must remain opaque.
The frame material must be convincingly matte, finely sanded and lightly aged: subtle frost-like abrasion, worn high points, visible wood pores and direction, shallow engraved patterns. Wear is restrained and tactile, not broken holes, dirty stains or scattered damage. No metal studs, screws, rivets, shiny copper/gold bevels, ropes, plastic, glow, or flat generic outline.
Integrate restrained WEREWOLF motifs into the actual rim: an abstract wolf-head silhouette, crescent moon or small lunar cuts. These must be CARVED or INLAID into the wood, not separate round badges or pasted icons. Different engraving pattern on player card and speech bubble; keep the center reading area quiet and unobscured. Rounded or gently shaped corners, slim substantial wooden rim.
All interior backgrounds have SUBTLE DARK PAPER TEXTURE: charcoal-olive #23251e with fine visible rice-paper fibers and a soft tooth, only 3–5 percent tonal variation. Not smooth gradients, not cloth or leather, not a grey overlay. Preserve high text contrast.
Player card layout: name left “云岚守夜”, small paper role label “预言家”, status “已结束”, footer “Agent · Model · High”. A compact round hooded human woodcut portrait on the right with a small seat number “2” at its lower edge. The portrait is secondary to the border study.
Speech bubble: a small integrated wooden tail points left. Above it write “云岚守夜” and “03:44”. Two readable paragraphs in warm ivory #d4c6a5:
“我先把发言和票型放在一起看，听完这一轮，再决定今天的选择。”
“还没有公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。”
Text is crisp, calm and contained. Use Songti for the name and a clean Chinese UI font for the speech. Keep all typography warm ivory, never pure white. Put a small clear study title in the top-left exterior space. Show the SAME design in the component and its enlarged detail; do not invent a different pattern in the close-up. This image is only for material review, no navigation, no buttons, no scenery.
STUDY D title: “D · 旧檀狼纹”. Muted aged sandalwood in brown with a very restrained cinnabar undertone, finely sanded surface, naturally softened rubbed corners. Player card: a small abstract wolf profile carved directly into one upper corner, flowing with directional wood grain and a fine geometric rail. Speech frame: shallow crescent-and-pine-needle engraving on the opposite lower corners, not the card's wolf motif repeated. Low-relief craftsmanship, subtle worn ivory residue inside cuts, no orange shine. Dark warm rice-paper texture beneath the text.
```

### 方案 E

```text
Use case: ui-mockup. Generate a premium material-review sheet for a Chinese folk-mystery WEREWOLF tabletop web game. Landscape 1600 x 1000. Show one compact player card at upper left, one wider speech bubble at upper right, and two enlarged close-ups of their distinct corner/border details below. All components are front-on, aligned and fully inside the canvas. Exterior space around and between the components is truly TRANSPARENT, without a painted checkerboard. The dark surfaces INSIDE each card, bubble and close-up are foreground and must remain opaque.
The frame material must be convincingly matte, finely sanded and lightly aged: subtle frost-like abrasion, worn high points, visible wood pores and direction, shallow engraved patterns. Wear is restrained and tactile, not broken holes, dirty stains or scattered damage. No metal studs, screws, rivets, shiny copper/gold bevels, ropes, plastic, glow, or flat generic outline.
Integrate restrained WEREWOLF motifs into the actual rim: an abstract wolf-head silhouette, crescent moon or small lunar cuts. These must be CARVED or INLAID into the wood, not separate round badges or pasted icons. Different engraving pattern on player card and speech bubble; keep the center reading area quiet and unobscured. Rounded or gently shaped corners, slim substantial wooden rim.
All interior backgrounds have SUBTLE DARK PAPER TEXTURE: charcoal-olive #23251e with fine visible rice-paper fibers and a soft tooth, only 3–5 percent tonal variation. Not smooth gradients, not cloth or leather, not a grey overlay. Preserve high text contrast.
Player card layout: name left “云岚守夜”, small paper role label “预言家”, status “已结束”, footer “Agent · Model · High”. A compact round hooded human woodcut portrait on the right with a small seat number “2” at its lower edge. The portrait is secondary to the border study.
Speech bubble: a small integrated wooden tail points left. Above it write “云岚守夜” and “03:44”. Two readable paragraphs in warm ivory #d4c6a5:
“我先把发言和票型放在一起看，听完这一轮，再决定今天的选择。”
“还没有公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。”
Text is crisp, calm and contained. Use Songti for the name and a clean Chinese UI font for the speech. Keep all typography warm ivory, never pure white. Put a small clear study title in the top-left exterior space. Show the SAME design in the component and its enlarged detail; do not invent a different pattern in the close-up. This image is only for material review, no navigation, no buttons, no scenery.
STUDY E title: “E · 灰木藏月”. Desaturated ashwood with a charcoal wash, dry matte finely frosted finish, narrow rounded rim and clean rubbed edges. Player card: abstract wolf ears and muzzle suggested through two small intersecting incised shapes at the lower corners, with no literal animal medallion. Speech frame: a delicate sequence of three shallow lunar cuts integrated along a short part of the upper rim, balanced by a tiny carved branch at its lower right. Patterns should be legible in the enlarged corner views but quiet at UI scale. Interior paper is dark olive-charcoal, not pale grey.
```
