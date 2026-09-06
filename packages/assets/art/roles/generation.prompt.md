# 身份材质生成提示词

使用内置 ImageGen。编辑参考为 `master.png`：左侧空白身份签，右侧空白编号挂签。
每个身份单独执行一次配色编辑，保留原始输出为对应目录的 `source.png`。

| 身份     | Role ID                   | 颜料色  |
| -------- | ------------------------- | ------- |
| 平民     | role-villager             | #a8905d |
| 狼人     | role-werewolf             | #9f382b |
| 预言家   | role-seer                 | #34677b |
| 女巫     | role-witch                | #665170 |
| 猎人     | role-hunter               | #4d6950 |
| 白痴     | role-idiot                | #ffffff |
| 守卫     | role-guard                | #347171 |
| 魔镜少女 | role-magic-mirror-girl    | #927187 |
| 白狼王   | role-white-wolf-king      | #c8c0a7 |
| 觉醒隐狼 | role-awakened-hidden-wolf | #865741 |
| 丘比特   | role-cupid                | #99616a |
| 盗贼     | role-thief                | #856338 |
| 骑士     | role-knight               | #596b73 |
| 驯熊师   | role-bear-tamer           | #805c32 |
| 守墓人   | role-gravekeeper          | #647258 |
| 摄梦人   | role-dreamweaver          | #575777 |
| 乌鸦     | role-crow                 | #3e5260 |
| 长老     | role-elder                | #79886c |
| 狼王     | role-wolf-king            | #702d33 |
| 隐狼     | role-hidden-wolf          | #645c64 |

## 编辑提示词

以下为逐项执行的原始提示词；输出不包含固定身份文字和编号。

### 平民

```text
Use case: precise-object-edit. Edit the supplied blank identity plaque and number ribbon for 平民, replacing cinnabar pigment with muted mineral-pigment #a8905d. Preserve the original print shapes, paper grain, black cuts and ivory lines. Keep both text areas blank and the surrounding background transparent.
```

### 预言家

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #34677b for 预言家. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 白痴

```text
使用 role-idiot/reference.png 中用户提供的纯白素材。只移除两件签牌外部的白色背景，保留内部白色纸纹、黑色双边线、磨损缺口与编号牌底部纹样。透明轮廓与不透明白纸分别保存，身份文字与编号由组件渲染。
```

### 狼人

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #9f382b for 狼人. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 守卫

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #347171 for 守卫. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 猎人

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #4d6950 for 猎人. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 魔镜少女

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #927187 for 魔镜少女. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 女巫

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #665170 for 女巫. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 白狼王

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #c8c0a7 for 白狼王. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 骑士

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #596b73 for 骑士. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 觉醒隐狼

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #865741 for 觉醒隐狼. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 驯熊师

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #805c32 for 驯熊师. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 丘比特

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #99616a for 丘比特. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 守墓人

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #647258 for 守墓人. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 摄梦人

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #575777 for 摄梦人. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 盗贼

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #856338 for 盗贼. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 乌鸦

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #3e5260 for 乌鸦. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 长老

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #79886c for 长老. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 狼王

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #702d33 for 狼王. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```

### 隐狼

```text
Use case: precise-object-edit. Edit the supplied two blank Chinese woodcut identity plaques, recoloring ONLY the red pigment to #645c64 for 隐狼. Preserve the exact chamfered tag on the left and the swallowtail number ribbon with its black lower diamond on the right, their arrangement, worn engraving, grain and delicate ivory lines. Deliver the SAME two objects on actual transparent alpha background. Keep every text area blank. No words, numbers, extra ornaments or role drawings. Strictly keep the shapes and dark print texture, no shiny material, no modern icons, no red pigment remaining.
```
