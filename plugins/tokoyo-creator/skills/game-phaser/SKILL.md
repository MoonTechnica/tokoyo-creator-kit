---
name: game-phaser
description: 同梱の 2D ゲームエンジン Phaser 4 で作るときの Platform との継ぎ目を扱う。素材は app.assets.url の URL だけを Loader に渡す、キーボードとゲームパッドは入力キット・Phaser はポインタだけ、Scale Manager の FIT / EXPAND、物理は 1 人用なら Arcade・対戦は Rapier、止める・再開・画面の共有、Phaser 3 の書き方を混ぜないこと。横スクロール・見下ろし・シューティング・タイルマップ・スプライトアニメの多い 2D を Phaser で作ると決めたときに使う。phaser, 2d engine, sprite, tilemap, tween, particles, arcade physics.
---

# 2D のゲームエンジン（同梱の Phaser 4）

多数の粒子・重なる透明描画・全画面filter・大量NPCを設計/追加するときは、
`$game-design` references/performance-risk.md を先に読む。実描画の比較と事前警告を省かない。

Kit には **Phaser 4**（`<kit>/sdk/package.json` の版）が入っている。**使うかどうかは作りたいゲームで決める**
（`instructions.md` §4.2）。この Skill は **Phaser を使うと決めたとき**の決まりごと。

- **API は Phaser 公式の Skill が正本**: `<kit>/sdk/node_modules/phaser/skills/<名前>/SKILL.md`（Kit の Phaser と同じ版）。
  使う機能の Skill を先に読む（`scenes` / `sprites-and-images` / `animations` / `loading-assets` / `tweens` /
  `physics-arcade` / `tilemaps` / `particles` / `text-and-bitmaptext` / `audio-and-sound` / `cameras` / `scale-and-responsive` …）。
  型は `<kit>/sdk/node_modules/phaser/types/phaser.d.ts`。
- **公式の Skill は一般の Web サイト向け**（CDN・相対パス・全画面・キーボードを Phaser で読む前提）。
  **この Skill の §2〜§7 と食い違ったら、この Skill に従う**（Platform の中ではそのままでは動かない）。
- **Phaser 4 で書く。Phaser 3 の書き方を混ぜない。** 記憶にあるコードの多くは Phaser 3。次は 4 で**削除**された:
  `setPipeline` / `postFX` / `preFX`（→ `filters`）、`BitmapMask`（→ `Mask` フィルタ）、`Geom.Point`（→ `Math.Vector2`）、
  `Math.PI2`（→ `Math.TAU`）、`Create.GenerateTexture`、`Mesh` / `Plane`。迷ったら
  `<kit>/sdk/node_modules/phaser/skills/v3-to-v4-migration/SKILL.md`。混ざると公開前の検証が `PHASER_V3_API` の警告を出す。

## 1. 入れ方

`package.json`（`dependencies`）に足す:

```json
{ "dependencies": { "phaser": "file:/workspace/sdk/node_modules/phaser" } }
```

```ts
import Phaser from 'phaser'
```

- `manifest.json` に **`"renderer": "webgl"`**（Phaser 4 は WebGL で描く）。違うと検証が `RENDERER_MISMATCH` を出す。
- `type: Phaser.WEBGL` にする。`Phaser.AUTO` は WebGL が無いと Canvas に落ちるが、Canvas の描画は v4 で非推奨で見た目が変わる。
- build-config が Kit の Phaser を `app.bundle.js` に取り込む（約 1.4 MB。起動前に届く 20 MiB に数える）。
  `phaser/src/*` のような内部の import はビルドが落ちる。入口は `phaser` だけ。
- 対戦のサーバー（`server/main.ts`）では **Phaser を import しない**（サーバーに画面は無い。検証が `SERVER_IMPORTS_PHASER` で落とす）。

## 2. ゲームの設定（ひな形）

```ts
import { app } from '@workspace/app-sdk'
import Phaser from 'phaser'
import { createInput } from './input'                   // $game-controls の入力キット

const input = createInput({
  root: document.body,
  move: { style: 'stick' },
  buttons: {
    start: { keys: ['Space', 'Enter', 'KeyZ'] },
    pause: { keys: ['Escape', 'KeyP'], pad: [9] },
  },
})

class Main extends Phaser.Scene {
  constructor() { super('main') }
  preload() {
    this.load.spritesheet('hero', app.assets.url('assets/hero.png'), { frameWidth: 32, frameHeight: 32 })
  }
  create() { /* … */ }
  update(_time: number, delta: number) {
    const dt = delta / 1000 // Phaserの時計。通常の低FPSを一律33ms capで遅くしない
    // input.move / input.pressed('…') でゲームを動かす
    input.endFrame()                                   // 毎フレームの最後に 1 回
  }
}

Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: '#0b1020' })

new Phaser.Game({
  type: Phaser.WEBGL,
  backgroundColor: '#0b1020',
  scale: {
    mode: Phaser.Scale.EXPAND,                          // §5。固定の盤面なら FIT
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 1280,
  },
  input: { keyboard: false, gamepad: false },          // §4。キーとパッドは入力キットが読む
  disableContextMenu: true,
  physics: { default: 'arcade' },                      // §6。物理が要らなければ書かない
  scene: [Main],
})
```

- 配信用のバンドルは iife なので **top-level `await` は使えない**。起動前に `app.store.get()` などを待つなら
  `loadSave().then(start)` の形にする。
- `parent` は書かない（`document.body` に canvas が入る）。`#app` や自前の `<div>` に入れるなら `expandParent` の挙動を確かめる。

## 3. 素材の読み込み（必ず守る）

Platform の中では Artifact のファイルに URL が無い。**Loader には `app.assets.url(path)` が返した URL だけを渡す。**

| 書く | 書かない（検証が `PHASER_LOADER_URL` で落とす） |
|---|---|
| `this.load.image('bg', app.assets.url('assets/bg.png'))` | `this.load.image('bg', 'assets/bg.png')`（相対パス） |
| `this.load.spritesheet('hero', app.assets.url('assets/hero.png'), { frameWidth, frameHeight })` | `this.load.setBaseURL(…)` / `this.load.setPath(…)` |
| `this.load.atlas('ui', app.assets.url('assets/ui.png'), app.assets.url('assets/ui.json'))` | `this.load.multiatlas(…)`（JSON の中の相対パスから画像を引く） |
| `this.load.audio('bgm', app.assets.url('bundles/stage2/bgm.mp3'))` | `http(s)://` の URL・CDN |
| `this.load.bitmapFont('pixel', app.assets.url('assets/pixel.png'), app.assets.url('assets/pixel.xml'))` | `this.load.script` / `scripts` / `plugin` / `scenePlugin` / `sceneFile` / `pack` |
| `this.load.tilemapTiledJSON('map', app.assets.url('assets/map.json'))` + 画像は別に `load.image` | Tiled の JSON に画像を埋め込む・JSON の中の画像パスに頼る |

- タイルマップは **タイルセットの画像を `load.image` で別に読み**、`map.addTilesetImage('<Tiled のタイルセット名>', '<画像の key>')`
  で結び付ける（JSON の中のパスは使われない）。
- `bundles/` の素材は **`await app.bundles.load(name)` の後**に、そのステージのシーンの `preload()` で読む
  （`$game-3d-and-bundles` のバンドルの決まりは同じ）。届く前のバンドルのパスを `app.assets.url()` に渡すと例外になる。
- 音は `mp3` / `ogg` / `wav`。1 つの形式で足りる（Artifact の中から選べる形式を全部置かなくてよい）。
- 素材の用意（画像生成・効果音・BGM）は `$game-asset-tools`。スプライトシートは 1 コマの大きさを揃えて横に並べる。

## 4. 入力（キーボードとゲームパッドは入力キット）

`$game-controls` の入力キットをそのまま使う（`src/input.ts` にコピー）。**Phaser の設定で `keyboard: false, gamepad: false`**
にして、**Phaser からはポインタ（タップ・クリック・ドラッグ）だけ**を使う。

| 入力 | 読むもの |
|---|---|
| 移動・アクション・ポーズ | 入力キット（`input.move` / `input.down('…')` / `input.pressed('…')` / `input.onAction`）。`update()` の最後に `input.endFrame()` |
| 盤面のマス・カード・メニューの選択 | 入力キットの `onNavigate`（十字キー・矢印）+ Phaser のポインタ（`gameObject.setInteractive().on('pointerdown', …)`）。同じ選択の見た目にする |
| 画面のタップで進む（タイトル・リザルト） | `this.input.on('pointerdown', …)` |
| スマホの操作部 | 入力キットが DOM で canvas の上に重ねる。遊びの物（自機・盤面）が操作部の下に入らないよう、`input.mode === 'touch'` の間は下に余白を取る |

- 二重に読まない（Phaser の keyboard を生かしたまま入力キットも使うと、同じキーで 2 回動く）。
- 音の鳴り始めと iframe へのキー入力には、最初の 1 回だけタップ / クリック / キーが要る（ゲームパッドでは始まらない）。
  Phaser の WebAudio は最初の入力で自動で鳴り始める。開始画面で「タップ / クリック / Space ではじめる」と促す。
- マウスで視点を回す（Pointer Lock）なら Phaser の `requestPointerLock` ではなく入力キットの `pointerLock` を使う
  （Manifest の `device.pointerLock` と揃える。`$game-controls`）。

## 5. 画面（Scale Manager）

`$game-screen-layout` の 2 つの方式を Scale Manager で書く。**`RESIZE` は使わない**（canvas の画素が CSS の px と 1:1 になり、
スマホの高解像度の画面でぼける）。

| 方式 | 設定 | 見える範囲 |
|---|---|---|
| A. 固定の論理サイズを拡大縮小（盤面・パズル・カード・固定画面のアクション） | `mode: Phaser.Scale.FIT`, `autoCenter: CENTER_BOTH` | 基準の大きさ（`width` × `height`）のまま。余りは帯になる |
| B. 見える範囲を広げる（横スクロール・見下ろし・ランナー） | `mode: Phaser.Scale.EXPAND`, `autoCenter: CENTER_BOTH` | 基準の大きさが必ず入り、長い辺の方向に広がる。`this.scale.gameSize` が今の見える範囲 |

- 基準は論理viewportと描画画素数を区別して決める。720×1280 / 1280×720は候補で一律必須ではない。
  読みやすいHUDと入力座標を保ち、低負荷backbufferを比較する。DPRやpointerから速度を推定しない。
  ドット絵は `pixelArt: true`（拡大縮小で滲まない）。
- 回転・全画面の切り替えで大きさが変わる。**`this.scale.on('resize', () => this.layout())`** で HUD・可動範囲・
  `this.physics.world.setBounds(…)` を決め直す（B では `this.scale.gameSize` の幅と高さを使う）。
- `this.scale.startFullscreen()` は呼ばない（全画面は Platform の枠のボタンが出す）。
- 文字は `this.add.text(…)` を基準の大きさで本文 32px 以上・プレイ中の数字 48px 以上にする（縮めて表示されるので、
  実際の画面で `$game-ux` §3 の 16px / 24px 前後になる）。背板か縁取り（`setStroke`）を付ける。

## 6. 物理

| 遊び | 使うもの |
|---|---|
| 1 人用（`space: null`）の当たり判定・重力・跳ね返り | **Phaser の Arcade**（`physics: { default: 'arcade' }`）。四角と円。まずこれ |
| 1 人用で、積む・転がる・関節など形のある物理 | Phaser の Matter か、同梱の Rapier 2D（`$game-physics`）。どちらでもよい |
| **オンライン対戦**（練習モードを含む） | **ルールの物理は `server/main.ts` の Rapier**（`$game-physics`・`$game-multiplayer`）。Phaser はサーバーから届いた状態を描くだけで、Arcade / Matter で勝敗を決めない |

Arcade / Matter は端末ごとに結果が同じになる約束が無い。対戦では相手と違う世界になる。

## 7. 止める・再開・共有

- **手応え**（`cameras.main.shake`・tween の伸び縮み・`particles` の `explode`・ヒットストップ）は `$game-ux` の
  references/feedback.md §4。揺れとパーティクルの量に `effects` を掛け、`cameras.main.flash` の全画面フラッシュは使わない。

- **止める**: `app.lifecycle.onPause` と `document.visibilityState === 'hidden'` で、ゲームのシーンを止めてポーズ画面を出す
  （`this.scene.pause()` + ポーズ用のシーンを `this.scene.launch('pause')` で重ねる、または
  `this.physics.pause()` / `this.anims.pauseAll()` / `this.tweens.pauseAll()` で止めて文字を出す）。
  **再開は利用者の操作で**（`this.scene.resume('main')`）。入力キットの押しっぱなしは自動で離される。
- **画面の共有**（`$game-screen-layout` §5.1）: WebGL の画面は描いた直後しか読めない。**描画が終わった瞬間**に渡す:

  ```ts
  this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
    app.share.capture(this.game.canvas).then(({ captureId }) => app.ui.openShare({ captureId, text: `スコア ${score}` }))
      .catch((error: unknown) => console.error('share failed', error))
  })
  ```

## 8. 出力前のチェック

### 長時間・大量オブジェクト

- TilemapLayerのcameraカリングを利用。GPU layerは内容変更頻度と端末で比較し全mapを毎frame再uploadしない。
  [Phaser4 Rendering Concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts)もmobileで常に有利とはしていない。
- atlasと描画状態をまとめる。大量数値はBitmapText候補、日本語全文字を巨大atlasへ一律変換しない。
- 弾/敵は有限pool。非表示/inactiveに加えbody停止、速度/tween/animation/timerをreset。
- AI/pathfinding/physicsは活動範囲と時間予算を持つ。描画カリングは計算や素材の解放ではない。
- Scene SHUTDOWNで外部resize/inputを解除。sleepは保持、TextureManager/SoundManagerはScene共通。
  使用中textureをremoveせず専用資源を最後の利用者が解放してからbundleをunloadする。
- Phaser TimeStep/Arcade固定stepへ第二のclockを被せない。pause/resumeで計測基準をreset。
  実frame間隔は `@workspace/app-sdk/runtime` のcreateFrameStatsで記録できる。
- RPGは `$game-design` references/rpg.md、地域寿命は `$game-open-world`。

照明・normal map・色調・filters を決める前に `$game-art-direction` の references/visual-direction.md §4 を読む。
素材の粒度と焼き込んだ光を揃え、HUD の読みやすさを保つ。実画面の比較は同 §6。

- [ ] `package.json` に `"phaser": "file:/workspace/sdk/node_modules/phaser"`、`manifest.json` に `"renderer": "webgl"`
- [ ] `type: Phaser.WEBGL`、`input: { keyboard: false, gamepad: false }`、`update()` の最後に `input.endFrame()`
- [ ] Loader に渡す URL が全部 `app.assets.url(…)`（相対パス・`setBaseURL`・`setPath`・`multiatlas`・外部 URL が無い）
- [ ] Scale Manager が `FIT` か `EXPAND`（`RESIZE` ではない）で、`resize` で配置を決め直す
- [ ] Phaser 3 で削除された API（`setPipeline` / `postFX` / `preFX` / `BitmapMask` / `Geom.Point` / `Math.PI2`）を使っていない
- [ ] 対戦なら、勝敗に関わる物理は `server/main.ts` の Rapier で、`server/main.ts` は Phaser を import していない
- [ ] `$game-controls` と `$game-screen-layout` のチェックも満たしている
- [ ] `$game-art-direction` の基準に画風・粒度・明暗・光・UI / VFX が合い、見た画面と未確認の場面を `design/playtest.md` に区別して残した
