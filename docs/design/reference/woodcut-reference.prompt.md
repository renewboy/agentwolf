# 木刻桌游视觉参考

## 组局

文件：[setup-woodcut.png](setup-woodcut.png)。生成提示词：

```text
Use case: ui-mockup. A high-fidelity Chinese werewolf web game SETUP screen at 1536x1024. Brand "月影议会". Charcoal black #181916 background, warm parchment text #e4ddcb, subdued moss, restrained cinnabar #bd4934 primary button. Folk mystery and crafted physical tabletop game, woodcut printed cards, matte surfaces, no glossy fantasy, no gold frames, no blue dashboards. Slim left vertical navigation with wolf sigil and labeled links. Main heading "准备一场对局" with short subtitle. A clear two-step progress navigation "选择牌组" and "安排玩家". Show active first step. Compact player-count selector 6人 / 9人 / 10人 / 12人 (12 selected). Main area 3-column board game cards: 12人标准场 / 12人守卫场 / 12人盗丘场. Each card an upper wide crop of an exquisite wolf woodcut physical card-back, below clean readable board name, short description, role composition chips with icon and count. Selected card has thin cinnabar border and a simple check, not glowing. Large calm negative space below. Fixed bottom summary bar spans only content area, shows small card thumbnail, selected board name, '12人入席', single strong red button '确认牌组，安排玩家 →'. Top right subtle back link. Clear interaction hierarchy, accessible text sizes, real app not poster; images integrated sparingly. Avoid fake legal footer, invented stats, decorative English. No browser frame.
```


使用内置 ImageGen 生成。参考图用于构图、材质和信息层级，准确的产品文字与功能由前端组件提供。

## 大厅

文件：[lobby-woodcut.png](lobby-woodcut.png)。生成提示词：

```text
Use case: ui-mockup. Generate a high fidelity polished desktop web game LOBBY design reference for a Chinese werewolf game named "月影议会", 1536x1024 landscape. Original art direction: Chinese folk mystery meets an exceptionally crafted physical board game, mature editorial layout, charcoal black #181916, warm ivory #e4ddcb typography, muted moss, vivid cinnabar #bd4934 used sparingly, dry woodcut printmaking illustration, quiet texture. NOT medieval gold game UI, NOT blue tech dashboard, no glassmorphism, no glows, no repeated rounded cards. Left narrow vertical sidebar 180px with tiny woodcut wolf mark, Chinese brand wordmark, clear labeled navigation 大厅 / 开始对局 / 板型 / 人设 / Agent / 设置. Main content about 1200px wide. Bold composed hero: left headline "天黑，请入局。" in large elegant Chinese print type, subtitle "一桌身份，一场关于信任的博弈。", strong flat cinnabar button "开始一局", right beautifully detailed grainy ivory/black woodcut village in forest with large red moon. Hero is integrated into background with a crisp bottom boundary, not enclosed in a rounded rectangle. Below spacious section "你的牌局", segmented filter 全部 / 进行中 / 已结束. Three crafted compact match rows with small illustrated seal or playing-card thumbnail, "12 人标准场", "第 2 天 · 自由发言", seat count 12, visual status, primary action 继续观战, secondary subtle menu. Small footer at bottom. Functional clear typography, a single screen of a real highly usable game product, strong contrast, tangible woodcut atmosphere, restrained and intelligent hierarchy. Avoid English decorative metadata and fake statistics. No browser chrome.
```

## 观战与配置工作区

观战参考与提示词见 [玩家议会](match-council.prompt.md)，有界配置布局见 [配置工作区](catalog-workspace.png)。
