# Cozy Farm generated assets

Environment and crop PNGs are original transparent atlases generated with the built-in image_gen tool for this project. Source alpha is preserved; runtime textures use two texels per world pixel with nearest filtering.

## Front-facing buildings

`buildings-front-v2.png` is an original transparent cottage/shed atlas generated
with the built-in image_gen tool. The [generation prompt](buildings-front-v2-prompt.txt)
uses `environment-v1.png` as a style reference and specifies a north-up view with
level front foundations and south-facing doors. `BUILDING_ART` in `art.ts` owns
the measured frames, shared-grid dimensions and foundation anchors. The cottage
facade spans approximately 112 world pixels; the shed spans 64. Small roof,
foliage and doorstep overhangs remain visual. The original atlas still supplies
the other environment objects.

## Garden props

`garden-props-v1.png` is an original transparent atlas generated with the built-in
image_gen tool, using `environment-v1.png` as a style reference. The
[generation prompt](garden-props-v1-prompt.txt) specifies a three-column layout:
bench, mailbox and flower pot on the first row; produce crate, watering can and
basket on the second; mushrooms in the first cell of the third row. Remaining
cells are empty. `gardenProps.ts` owns measured source frames and world sizes;
`art.ts` normalizes the sprites to the shared sampling density.
No external asset host is required.

## Aiko character

The active character uses the original Aiko v2 PNGs and registration code moved from the removed garden adventure. Image files were moved byte-for-byte; no new images were generated for this transfer. `playerSprites.ts` measures each pose, applies shared scale and bounded width correction per facing, removes isolated specks, and registers the head and foot baseline into 96-pixel cells. Idle preserves planted feet; leftward locomotion mirrors the right profile. `art.ts` scales these canvases to Cozy's 30-world-pixel character height.

| State | Sources | Runtime frames per direction | Generation prompts |
| --- | --- | --- | --- |
| Idle | `aiko-idle-v2.png` | 4 | [Idle](aiko-idle-v2-prompt.txt) |
| Walk | `aiko-walk-{front,back,side}-v2.png` | 8 | [Front](aiko-walk-front-v2-prompt.txt), [back](aiko-walk-back-v2-prompt.txt), [side](aiko-walk-side-v2-prompt.txt) |
| Run | `aiko-run-{front,back,side}-v2.png` | 8 | [Front](aiko-run-front-v2-prompt.txt), [back](aiko-run-back-v2-prompt.txt), [side](aiko-run-side-v2-prompt.txt) |

The adjacent prompts record the original built-in image_gen requests. All source sheets load before gameplay; loading or empty-frame failures use the game's artwork error state. No external asset host is required.

## Environment prompt

Use case: stylized-concept. Asset type: production pixel-art game sprite atlas, NOT a scene or screenshot. Create one 2048x2048 RGBA transparent sprite sheet with exactly 4 columns and 4 rows, each cell 512x512. All sprites isolated with true transparent background, no labels, no grid lines, no UI. Rich handcrafted cozy fantasy 3/4 top-down pixel art, orange terracotta cottage roof, detailed stone and timber, deep emerald foliage, golden lamps, mossy rocks, turquoise lake elements. Fine crisp square pixel clusters, no blur or vector geometric look. Consistent perspective looking down 35 degrees, consistent source pixel density across every object. Each cell has its object horizontally centered at x=256 and ground/contact baseline y=470. Important different physical sizes below, do NOT fill each cell equally. Every object wholly inside its own cell with transparent margins.
Row 1: [cottage width450 height450, intricately layered orange red roof, chimney, lit windows, timber and stone facade, arched oak door, flowering vines, pots and soft contact shadow] [storage shed width240 height240, weathered wood, brown shingle roof, barrels and tools] [mature broadleaf oak tree width280 height390, irregular branching canopy with rich emerald leaf clusters and yellow green light] [tall fir tree width235 height400, natural asymmetric layered evergreen foliage, gnarled trunk].
Row 2: [organic mossy shoreline boulder group width110 height85, detailed slate facets and small tufts] [flowering leafy shrub width150 height115] [wildflower and grass cluster width90 height75, tiny pink white yellow flowers] [aquatic reeds width110 height160 with cattails and stones].
Row 3: [wooden hanging golden lantern post width70 height180] [one wooden farm fence section width64 height75, natural timber with horizontal rails extends to either side of post] [straight wooden dock module width128 height64, TOP DOWN rectangular horizontal planks and narrow posts, no surrounding water] [rowboat width160 height110, warm wood and oars, top down three quarter view].
Row 4: [rocky waterfall width230 height250, craggy mossy stone crown, clear blue-white descending water, foamy foot, no lake background] [lily pad cluster width120 height70 with one pink water lily, no water background] [friendly scarecrow width110 height175, straw hat and blue tunic] [small produce cart width160 height130 filled with pumpkins and cabbage].
Match a richly detailed fantasy farming game illustration aesthetic. Transparent alpha around every object including all unused portions of every cell. No checkerboard painted into image. No surrounding landscape.

## Crops prompt

Use case: stylized-concept. Asset type: farming game crop sprite atlas. Transparent background, 1024x512, exactly four equal columns by two equal rows, wide transparent gaps separating each sprite, no text or grid. Consistent richly detailed crisp pixel art three-quarter top-down perspective, little golden highlights, deep emerald leaves, same visual world as an intricate cozy fantasy cottage. Top row: four growth stages of turnip, from two tiny cotyledon leaves, to four leaves, to bushy broad leaves with small purple root, to ripe cream turnip with purple shoulder and lush leaves. Bottom row: four growth stages of strawberry, from tiny seedling, to leafy young bush, to lush plant with white blossoms, to leafy plant with several ripe red berries and white blossoms. Only plants, no soil tile or pot or ground. Each plant centered in its cell and rooted at y=220 local, occupies at most 170x180 pixels, seedlings naturally much smaller. True transparent alpha, no checkerboard. Organic botanic shapes, consistent pixel density, no smooth vector art.
