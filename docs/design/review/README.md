# 玩家卡片与气泡边框审核

状态：待用户审核。候选图尚未用于页面素材。

审核范围是边框材质、轮廓、雕刻细节与阅读面的纸质底纹。头像、字段内容与现有页面布局沿用当前实现。

[磨砂雕纹与纸质底面审核：C、D、E](material-studies-cde.md)

- [A：墨木细边](borders-inkwood.png)，深色木框、浅色内嵌线与小范围雕纹。
- [B：自然木纹](borders-walnut.png)，较明显的木纹与浅刻边缘。

两张图均使用内置 ImageGen 生成。图中的文字与头像用于展示边框的相对关系。

## 生成提示词

### 方案 A

```text
Use case: ui-mockup. Create a high-fidelity approval image for TWO game UI components: a player card and a speech bubble, in a Chinese folk-mystery werewolf tabletop web game. This is a close-up COMPONENT MATERIAL STUDY, not a full webpage. Landscape 1600 x 1000.
Use a solid deep charcoal #181916 background, quiet and flat. Place one compact player card at left (roughly 450 x 260), and one larger speech bubble at right (roughly 900 x 420), with generous separation. Include a small enlarged corner detail for each underneath so the natural wood grain and shallow carving can be inspected. All views are perfectly straight-on, orthographic, flat UI layout. No surrounding frame around the image, no scenery, no dashboard, no extra panels, no icons floating outside.
The card and bubble interiors are the SAME calm dark charcoal-olive #20221b. The design work is concentrated on the border. The card has a rounded human hooded woodcut avatar at upper right, diameter about 108, and this exact ivory copy at left: "云岚守夜", then a small paper role label "预言家", then "已结束"; one readable footer line "Agent · Model · High". Name is Chinese Songti; metadata is a clean Chinese UI font. Maintain a compact useful card layout.
The speech component has speaker label above the frame "云岚守夜" and small "03:44". A restrained tail on its LEFT edge points toward the player. Inside show two paragraphs of ivory text, around 28px, comfortably spaced:
"我先把发言和票型放在一起看，听完这一轮，再决定今天的选择。"
"还没有公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。"
Text must be legible and correctly contained. No text embedded into the wooden rim. No oversized avatar, no wasted large blank header or footer.
MATERIAL QUALITY: Real fine-grained hardwood, believable pores and grain direction, extremely low relief and matte finish, understated careful joinery. Refined physical tabletop craftsmanship, somber and composed. The rim stays slim: around 8–10px in this enlarged image. Narrow wooden edges surround an uninterrupted dark reading area. Corner carvings are shallow, small and integrated into the wood, not glued-on symbols.
Absolute exclusions: no metal, bronze, copper, gold, shiny bevel, screws, nail heads, rivets, circular studs, rope, dirty scuffs, fake distressed ink speckles, black gaps in the border, excessive scrollwork, casino ornament, generic rounded SaaS card, or cartoon wood. No glowing outline, no heavy 3D shadow. The player card and speech bubble have related material but DIFFERENT subtle carving details. Never repeat the same corner stamp on both components.
DESIGN A — title at top left: "A · 墨木细边". Use smoked dark hardwood, near-ebony warm brown #30291f, with a restrained pale bone-colored inner inlay. Grain is tactile but not busy. The player card uses slightly rounded shoulders and a subtle diagonal scarf-joint carving at the four corners. The speech bubble uses an even slimmer wood rim, a narrow inner groove, and tiny shallow bamboo-leaf cuts only on its bottom corners. Its tail is dark wood and integral to the frame. The look is quiet, refined, dark, and tactile, with crisp legible ivory text. Do not make the bone inlay bright white or metallic. Show enlarged corner details clearly.
```

### 方案 B

```text
Use case: ui-mockup. Create a high-fidelity approval image for TWO game UI components: a player card and a speech bubble, in a Chinese folk-mystery werewolf tabletop web game. This is a close-up COMPONENT MATERIAL STUDY, not a full webpage. Landscape 1600 x 1000.
Use a solid deep charcoal #181916 background, quiet and flat. Place one compact player card at left (roughly 450 x 260), and one larger speech bubble at right (roughly 900 x 420), with generous separation. Include a small enlarged corner detail for each underneath so the natural wood grain and shallow carving can be inspected. All views are perfectly straight-on, orthographic, flat UI layout. No surrounding frame around the image, no scenery, no dashboard, no extra panels, no icons floating outside.
The card and bubble interiors are the SAME calm dark charcoal-olive #20221b. The design work is concentrated on the border. The card has a rounded human hooded woodcut avatar at upper right, diameter about 108, and this exact ivory copy at left: "云岚守夜", then a small paper role label "预言家", then "已结束"; one readable footer line "Agent · Model · High". Name is Chinese Songti; metadata is a clean Chinese UI font. Maintain a compact useful card layout.
The speech component has speaker label above the frame "云岚守夜" and small "03:44". A restrained tail on its LEFT edge points toward the player. Inside show two paragraphs of ivory text, around 28px, comfortably spaced:
"我先把发言和票型放在一起看，听完这一轮，再决定今天的选择。"
"还没有公开的信息，我会保留判断。请把推断依据讲清楚，让其他玩家能够沿着同一份信息继续判断。"
Text must be legible and correctly contained. No text embedded into the wooden rim. No oversized avatar, no wasted large blank header or footer.
MATERIAL QUALITY: Real fine-grained hardwood, believable pores and grain direction, extremely low relief and matte finish, understated careful joinery. Refined physical tabletop craftsmanship, somber and composed. The rim stays slim: around 8–10px in this enlarged image. Narrow wooden edges surround an uninterrupted dark reading area. Corner carvings are shallow, small and integrated into the wood, not glued-on symbols.
Absolute exclusions: no metal, bronze, copper, gold, shiny bevel, screws, nail heads, rivets, circular studs, rope, dirty scuffs, fake distressed ink speckles, black gaps in the border, excessive scrollwork, casino ornament, generic rounded SaaS card, or cartoon wood. No glowing outline, no heavy 3D shadow. The player card and speech bubble have related material but DIFFERENT subtle carving details. Never repeat the same corner stamp on both components.
DESIGN B — title at top left: "B · 自然木纹". Use muted natural walnut #584432, gently curved outside corners, restrained matte wood with visible lengthwise grain. The card is built with smooth mitered wooden strips and a delicate carved parallel groove following the inner perimeter; a very small incised joinery notch accents the corners. The speech frame is thinner and uses a different shallow carved twig pattern along the outer lower corners, not the card's parallel groove. Keep carvings subtle and architectural, no floral garlands. The tail is a small matching wooden taper. More visible warm wood than Design A, but no orange cast, no polished metal highlights and no thick furniture frame. Show enlarged corner details clearly.
```
