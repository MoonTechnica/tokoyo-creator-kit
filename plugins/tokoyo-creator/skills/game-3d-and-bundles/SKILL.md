---
name: game-3d-and-bundles
description: 3D のゲーム（同梱の Babylon.js の WebGPUEngine。WebGPU が無い端末は自動で WebGL2）と、素材が多い大きいゲーム（bundles/ への分割ダウンロード）を作る。GLB と KTX2 テクスチャの読み込み、バンドルの宣言と読み込み・解放、スマートフォンで落ちないためのメモリの見積もりと減らし方を扱う。3D で描くとき、ステージが複数あるとき、画像・音・モデルの合計が数 MiB を超えそうなとき、検証で MEMORY_ESTIMATE_LARGE が出たときに使う。Babylon.js, GLB, AssetContainer, bundles, memory.
---

# 3D と大きいゲーム

全画面shader・雲/霧・透明描画の重なり・動的影を設計/追加するときは、
`$game-design` references/performance-risk.md を先に読む。実装を広げる前に小さく実描画を比較し、懸念を利用者へ伝える。

## 1. バンドルの分割（大きいゲーム）

**最初の画面に要るものだけを `bundles/` の外（`assets/`）に置く。** 2 面目以降のステージ・BGM・3D モデルは
`bundles/<名前>/` に置き、`manifest.json` の `bundles` に同じ名前を宣言する
（名前は英小文字・数字・`_`・`-`。ディレクトリと宣言は 1 対 1。片方だけだと取り込みで落とされる）。

```jsonc
// manifest.json
"bundles": {
  "stage2": { "load": "background" },  // 起動後に裏で取り始める（次に要るもの）
  "boss":   { "load": "demand" }       // app.bundles.load() したときだけ取る
}
```

```ts
import { loadModel } from '@workspace/app-sdk/3d'
import type { AssetContainer } from '@babylonjs/core/assetContainer.js'

let stageAssets: AssetContainer | undefined
async function enterStage2() {
  // background でも、使う前に必ず load する（裏での取得が終わっている保証は無い）
  await app.bundles.load('stage2', { onProgress: (loaded, total) => drawBar(loaded / total) })
  stageAssets = await loadModel('bundles/stage2/map.glb', scene)
  stageAssets.addAllToScene()
}

// モデル・マテリアル・テクスチャを解放してから blob URL を解放する
function leaveStage2() {
  stageAssets?.dispose()
  stageAssets = undefined
  app.bundles.unload('stage2')
}
```

- 読み込み中は進み具合を画面に出す（止まって見える時間を作らない）。`load` の失敗は `SdkError`。
  `retryable` なら「タップ / クリックで再試行」を出し、同じ `load` をもう一度呼ぶ。
- `bundles/` の外（起動前に全部届く分）は **20 MiB まで**、10 MiB を超えると警告
  （スマートフォンの回線で起動を待たせる）。
- GLB を自分で作る・手直しする・動かすなら `$game-3d-studio`（Blender）。
- `bundles/` の下のファイルもほかのソースと同じく commit する。画像・音・3D・動画・フォントは `.gitattributes` の規則で
  自動的に Git LFS のポインタになる（次のターンにも残る）。台帳の素材は、置く代わりに下の `bundles.refs.json` で参照してもよい
  （参照したパスのファイルは commit せず、`dist/` にも置かない）。

### 大きい素材は台帳から参照する（書庫に入れない）

書庫（`dist.tar.gz`）は圧縮後 200 MiB・1 ファイル 30 MiB まで。それより大きいゲーム（合計 4 GiB まで）は、大きい素材を
**素材台帳に置いたまま参照**する。

1. 素材を台帳に載せる（生成ツール、または自分で作ったものは `upload_asset` → `upload_url` へ PUT → `get_asset`）。1 つ 256 MiB まで
2. `source/bundles.refs.json` に、配りたいパスと `asset_id` を書く

   ```json
   { "refs": { "bundles/stage2/boss.glb": "<asset_id>", "bundles/movie/intro.mp4": "<asset_id>" } }
   ```

3. **そのパスのファイルは `dist/` に置かない**（置くと取り込みで `DUPLICATE_ENTRY`）。バンドル名は `manifest.json` の `bundles` に宣言する
4. ゲームのコードは書庫のファイルと同じく `app.assets.url('bundles/stage2/boss.glb')`（`await app.bundles.load('stage2')` の後）

- 参照だけでできたバンドルも作れる。宣言した名前のディレクトリが `dist/bundles/` に無くてよい
- 書けるのは `asset_id` だけ。sha256・大きさは Platform が台帳から埋める。違う App の ID・まだ `ready` でない ID は取り込みで `ASSET_REF_INVALID`
- リミックス元の ID が残っていても、同じ中身がこの App の台帳に写されていれば通る（リミックスは親の素材を台帳へ写す）
- 手元の `kit.mjs check` は参照の中身を確かめられない（`LEDGER_NOT_CHECKED` の警告）。中身は push 後の Platform の検証が確かめる

## 2. 3D（Kit の Babylon.js）

**材質・光・影・露出を決める前に `$game-art-direction` の references/visual-direction.md §5 を読む。**
背景色だけで明暗を判断せず、直接光・環境照明・発光材質・露出を合わせる。素材の粗さと模様の尺度を揃え、
重要な光の caster / receiver を指定する。WebGL2 でも作品の明暗と手掛かりを維持し、同 §6 で得られた実画面と基準を比較する。

- `package.json` の `dependencies` に `"@babylonjs/core": "file:/workspace/sdk/node_modules/@babylonjs/core"` を足す。
  GLB を読むときは同様に `@babylonjs/loaders`、Babylon GUI を使うときは `@babylonjs/gui` を足す。いずれも **9.29.0** で、型は同梱。
- ESM の必要なモジュールだけを import する（例: `@babylonjs/core/scene`、`@babylonjs/core/Materials/PBR/pbrMaterial`）。
  UMD の `babylonjs`、CDN、Inspector、Havok は使わない。依存は Kit の許可リストだけ（`app-sdk/spec.md` §5）。
- 3D の形式は **GLB 1 本**（`.gltf` + `.bin` の分割・Draco は使えない）。テクスチャは **KTX2 / Basis**。
  モデルの読み込みは SDK の `loadModel(path, scene)` を使う（`app.assets.url()` と GLB 拡張指定・ローダーの登録をまとめて扱う）。
  `EXT_meshopt_compression` は同梱の meshoptimizer 1.2.0 の JS デコーダー（WASM 内包）で読む。Worker / CDN を使わない。
- GLB は `AssetContainer` で持ち、`addAllToScene()` で表示する。同じモデルを複数表示するときは
  `instantiateModelsToScene(undefined, false, { doNotInstantiate: false })`は互換な静的meshをinstanceにする候補。
  同梱9.29.0はdoNotInstantiate:trueが既定、独立骨格付きmeshはcloneになる。複製を解放してからcontainerをdisposeする。
- 画面は全面（`$game-screen-layout` §1）。ポーズは `engine.stopRenderLoop()`、再開は同じフレーム関数で `engine.runRenderLoop(frame)`。
- 操作は `$game-controls` の references/genres.md §10（左のスティックで移動、右半分のドラッグでカメラ）。
  Babylon の `camera.attachControl()` でキーボード入力を二重に持たず、入力キットの値からカメラとキャラを動かす。
- モデルが無いときは `MeshBuilder` の箱・球・カプセルと `StandardMaterial` / `PBRMaterial` の色で作る。
- 3D の物理は `$game-physics` の Babylon Physics V2 / Havok。対戦はサーバーの結果を正とし、画面は補間する。

### WebGPU と KTX2（sdkVersion 2 の既定）

**`@workspace/app-sdk/3d` の `createEngine(canvas, { prepare })` を await する**（`manifest.json` は `"renderer": "webgpu"`）。
`prepare(engine)` 内で Scene と最初の素材を作り、`scene.whenReadyAsync()` の後に
`engine.beginFrame()` → `scene.render()` → `engine.endFrame()` で最初の描画を確認する。
失敗した Scene を破棄して例外を返す。SDK が WebGPU の可否・初期化・最初の描画を確認し、
使えなければ WebGL2 で `prepare` を再試行する。入力キットには
`engine.getRenderingCanvas()` を渡す（GPU 初期化で canvas を置き換える場合がある）。API の正本は `<kit>/sdk/app-sdk/spec.md` §10。

1. 描画は `engine.runRenderLoop(() => scene.render())`。終了時は `engine.stopRenderLoop()`、`scene.dispose()`、`engine.dispose()`。
2. マテリアルは Babylon の `StandardMaterial` / `PBRMaterial` / `NodeMaterial`。独自 shader はネイティブ WGSL。GLSL → WebGPU の外部コンパイラを使わない。
   独自 WGSL は WebGPU の飾りだけにし、WebGL2 では標準マテリアルで遊べるようにする。
3. DPRは既定最大1.5。createEngineのmaxDevicePixelRatio/antialiasで明示的な低負荷設定を選べる。
   WebGPU対応は速度保証ではない。実測に合わせ装飾と解像度を別制御。画面変更でengine.resize()。
4. WebGPU専用飾りは対応確認に加え時間予算と簡素設定を持つ。WebGL2でも遊べるようにする。
   雲のraymarch/透明重なり/影/RTTを無制限に増やさない。freezeActiveMeshesやsnapshot renderingは動的worldの一律既定にしない。
   useLargeWorldRenderingは座標精度が必要な場合だけ。局所ロード/LODの代替ではない。
5. 最初の描画と素材の読み込みに失敗したらログとエラー表示を出す。白い画面のままにしない。
6. GLB の animation は `container.animationGroups` から名前で選び `start(true)` で繰り返す。毎フレーム mixer を自作しない。

**テクスチャは KTX2（Basis Universal）**: 素材ツールの `convert_texture` で `.ktx2` にする。
対応する helper をバンドルすると Kit が `basis/basis_transcoder.wasm` を Artifact に自動配置する。
手でコピーしない。JS factory は静的バンドルに含まれる。
`loadModel` がローカルのデコーダーを設定する。単体テクスチャは先に `initialize3dAssets()` を await してから
`new Texture(app.assets.url(path), scene)` で読む（spec §10）。Babylon の既定 CDN URL に任せない（外部通信は不可）。
PNG をそのまま大量の 3D テクスチャにしない。GLB の `KHR_texture_basisu` も同じデコーダーを使う。

## 3. メモリ（スマートフォンで落ちないために）

スマートフォンのブラウザは、**使えるメモリを超えるとエラーを出さずにページを閉じる**（iOS は上限を公表していない）。
効くのはダウンロードの大きさではなく、**展開して同時に持っている量**:

| 素材 | 展開後の大きさ（目安） |
|---|---|
| 画像・テクスチャ（PNG / JPEG / WebP） | **幅 × 高さ × 4 byte × 4/3**。1024×1024 で約 5.3 MiB、2048×2048 で約 21 MiB（ファイルが 200 KB でも同じ） |
| テクスチャ（KTX2 / Basis） | GPU 圧縮が使えると **幅 × 高さ × 約 1 byte × 4/3**。1024×1024 で約 1.3 MiB。使えない端末は RGBA に戻るため PNG と同じ量 |
| GLB | 中のテクスチャ（同上）+ 頂点データ |
| 音（MP3 など） | **秒数 × 48,000 × チャンネル数 × 4 byte**。ステレオ 1 分で約 22 MiB |

- **検証は「起動前の分 + 同時に持つバンドル（同じ `group` の合計。`group` が無ければいちばん大きい 1 つ）」を見積もり、
  512 MiB を超えると `MEMORY_ESTIMATE_LARGE`、768 MiB を超えると `MEMORY_ESTIMATE_VERY_LARGE` の警告を出す。**
  警告が出たら下のどれかで減らして作り直す。2〜3 GB の端末でも動かしたいなら 256 MiB に収める。
- **テクスチャは 1 辺 1024px まで**を基本にする（2048px は画面の主役 1〜2 枚だけ）。
  UI・アイコン・遠くのものは 512px 以下。縦横は 2 のべき乗にする。
- **ステージは 1 つずつ読む。** 次のステージの `app.bundles.load()` の前に、今のステージを片付ける:
  - Babylon.js: 複製を解放してから所有AssetContainer.dispose()。単体meshはmesh.dispose()で外す。
    material/textureは専用所有物だけ最後に解放し、共有資源へdispose(false,true)を一律に使わない
  - Canvas 2D: `createImageBitmap()` で作った画像は `bitmap.close()`、`Image` は参照を外す
  - 最後に `app.bundles.unload('<名前>')`
- **BGM は `<audio>` で流す**（`const bgm = new Audio(app.assets.url('bundles/town/bgm.mp3')); bgm.loop = true`）。
  `decodeAudioData` で丸ごと PCM にしない（ステレオ 1 分で約 22 MiB）。`<audio>` なら圧縮したまま少しずつ再生される。
  音が鳴るのは最初のタップ / クリックの後（`$game-controls`）。効果音は短いものだけまとめて 1 回 decode して使い回す。
- 同じ画像・モデルを何度も読み込まない（一度読んだものを使い回す）。
  静的概算は実機総メモリではない。保持猶予/地域遷移/手続きmesh/decode/upload/RTT/骨格のピークを計上。
  圧縮対応時とRGBA fallbackを分け、frame p95/p99/最大停止と資源数を測る。
- 広い世界を歩き回るゲームは、ステージ単位ではなくチャンク単位で読み込み・解放する（`$game-open-world`）。
  地域ごとのバンドルは `group` で組にし、地域を移るたびに `app.bundles.hint([...])` で隣を先読みさせる。
