---
name: game-open-world
description: 広い世界を局所的に読み込み、解放して長く遊べるようにする。作者設計map/seed生成、時間予算、活動NPC、地域資源の所有、進行保存/再開、協力卓のチェックポイントを扱う。探索・RPG・サンドボックスを作るときに使う。open world, RPG, chunks, streaming, save, memory.
---

# オープンワールド・長時間探索

RPGの進行は `$game-design` references/rpg.md。SDK APIの正本は `<kit>/sdk/app-sdk/spec.md`。
エンジンAPIは同梱版の型/公式Skill。存在しないThree.js APIをBabylon/Phaserへ持ち込まない。
世界規模・活動NPC・生成・描画方式を決める段階で `$game-design` references/performance-risk.md を読み、
懸念を先に伝え、代表的な地域の最小試作を実描画して比較する。広げてから負荷を調べない。

## 1. 世界と活動範囲

作者設計の地域データ/tilemap/GLB、seed生成、両者の組み合わせを使える。総面積ではなく現在の負荷を限定する。

- 地形はチャンクへ分割する。32mや32–64tileは初期候補であり保証値ではない。
- 読み込み半径r、保持半径r+1、描画、physics、AI、骨格animationの範囲を別に決める。
  r=2なら読み込み25に対し保持集合の保守的上限49。r=3なら49に対し81。
- pointer:coarseは操作方式の判定だけ。スマホ/PCやWebGPU対応だけで性能を判断しない。
- 中心チャンク/進行方向が変わった時にqueueを更新する。全候補を毎frame配列化/sortしない。
- 近傍NPCの感知/経路探索だけ更新し、時間分散と要求上限を持つ。不可視meshにも計算が残り得る。
- 表示と衝突が準備できるまで未ロード地域へ進めない。teleportはロード画面と進捗を用意する。

## 2. 時間予算と取消

「1フレーム1チャンク」は停止時間を保証しない。生成/組立/decode/GPU登録/解放を小さな工程に分ける。

```ts
import { createWorkQueue, createFrameStats } from '@workspace/app-sdk/runtime'
const work = createWorkQueue({ maxPending: 128, maxSteps: 32 })
const frames = createFrameStats()
function frame() {
  frames.record(performance.now()) // Phaserの平滑化deltaを計測に使わない
  work.tick(2)                    // 調整用初期値。同期step自体は中断できない
  // 既存engineのupdate/renderを続ける。第二のRAFを作らない
}
function* buildRegion() {
  // 小さな単位でCPU生成しyield。最後にengineへ登録する
  // 取消時はfinallyで未登録の地域専用資源を解放する
}
work.add('region-id', buildRegion())
```

- 地域離脱でwork.cancel(id)。通信の後着は世代/所有を照合し、不要meshを登録せず解放する。
- 大きな同期decode/uploadをasync関数で包むだけでは分割にならない。素材分割と段階別測定が先。
- pauseで時計の基準をresetしsimulationを止める。通常の低FPSを一律33ms capで遅くしない。
- frame p50/p95/p99と最大停止、各jobの時間を記録。CPU描画時間はGPU完了時間ではない。

## 3. 資源の所有と地域素材

bundles/<地域>/へ素材/定義を置きmanifestへ宣言。使う前にapp.bundles.load(name)を待つ。
隣地域はapp.bundles.hint(neighbors)（最大8名）で先読みできる。
Cacheありの先読みは永続cacheへ、なしの場合はHost保持32MiB予算。decode/GPUメモリとは別。

- 地域専用資源と常駐/共有資源を分け、最後の利用者が共有資源を解放する。
- **Babylon**: 地域meshはmesh.dispose()。共有material/textureを地域退出時に破棄しない。
  container複製を解放してから所有containerをdispose。霧はscene.fogMode/fogStart/fogEnd、clipはcamera.maxZ。
  thin instancesは地域×モデル単位。収集物は通常instance/pool。freezeActiveMeshes()を常時既定にしない。
- **Phaser**: GameObject/layer/map/body→専用TextureManager/cache/audioの順に片付ける。
  Scene sleepは解放ではない。SHUTDOWNで外部listener/timerを解除。共通atlasは最後まで保持。
- engine資源を片付けてからapp.bundles.unload(name)。URL revokeだけではGPU/audioは解放されない。
- loading中unloadは旧loadを拒否し、不要な後着をURL化しない。再loadは未完了の同じ不変bundleに合流する。
  複数地域が同じbundleを借りるなら利用者数を管理し、最後の利用者だけunloadする。

## 4. 決定的生成と保存

- 生成worldはseed＋生成方式version＋安定ID＋差分＋位置/進行を保存。作者設計worldは定義版＋安定ID＋進行。
- 生成は描画から分離し整数hash/seed付き乱数を使う。Math.randomや実装依存sin noiseを使わない。
  同seed/version/座標の再現と境界一致を検査。camera方向のsin/cosは生成ではない。
- 改変はblobへ。上限1MiBはgzip+base64後の最終JSON UTF-8。圧縮だけで無限改変を保証しない。
- 活動中の定期/重要進行時にdirtyをまとめ、毎分12write以内で保存する。
  createCheckpointで単一flight/固定snapshot/同requestId再送/ACKした変更だけ確認できる。
- onPauseでstore APIを呼ばない（paused中は拒否）。入力/simulationを止め、resume後に未保存分を再試行する。
  OS終了前の非同期完了は保証しない。未保存/最後の確定/競合/容量超過を画面で知らせる。
- 毎保存で最新revisionだけreadして古いローカルworldを上書きしない。起動revision→ACK revisionを使う。
- 生成版変更/rollbackで旧IDが別物を指さないようにする。読めない旧セーブを消して新worldにしない。

## 5. メモリ予算

素材の静的概算＋保持チャンク集合＋旧新地域の重複＋decode/upload＋手続き生成＋骨格/RTT/保存snapshotを計上する。
groupは同時保持の宣言であり実行時の保持数を強制しない。見積もりは実機安全性の保証ではない。

- 3D textureはKTX2候補。圧縮対応時とRGBA fallbackを別計上。Phaser Loader対応を確認せず一律要求しない。
- 単色/頂点色で済む地形はtexture不要。長いBGMはstreaming、短い効果音は共有decode。
- 512/768MiBは素材警告の目安。OS総メモリ上限ではない。対象端末でruntime資源の頭打ちを確認する。

## 6. 協力world

ルール/敵/改変は `$game-multiplayer` のサーバー権威。次回のworldは `$game-documents`、個人持ち物はstore。
共有documentのサイズ/件数/失効/書込権を守る。1卓は最長30分でソロの総プレイ時間制限ではない。
**上限前から定期チェックポイント。timeoutのonFinishで初めて保存しない。** 切断/所有者交代/競合を定義し、
終了前に知らせ次の卓から続ける導線を作る。永久共有世界や無期限卓を既存SDKが保証すると説明しない。

## 7. チェック

- [ ] 生成版/安定IDと進行保存/再開があり、読込失敗を空データで上書きしない
- [ ] 作業は時間/個数の予算を持ち、不要jobと後着結果を解放する
- [ ] 保持r+1/遷移ピーク/共有資源を予算に含める
- [ ] NPC/physics/骨格/探索を局所化し、描画非表示だけで停止と扱わない
- [ ] pause/resumeが冪等で、停止中APIを呼ばず活動中に保存を確定する
- [ ] 公開前スモークと長時間QAの未確認を区別。長時間QAは `$game-playtest` §5
