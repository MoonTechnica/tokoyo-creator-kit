---
name: game-physics
description: 物理で動くゲーム（落下・衝突・転がる・積む・跳ねる・車・ラグドール・物理パズル）を作る。3D は Babylon Physics V2 / Havok と headless Scene、2D は同梱の Rapier 決定版。描画とルールの分離、固定 dt、物理 Scene の解放、3D 対戦のサーバー権威と補間を扱う。physics, babylon, havok, rapier, rigid body, collision.
---

# 物理（3D は Babylon / Havok、2D は Rapier）

**API の正本は `<kit>/sdk/app-sdk/spec.md` §9** と、Kit の同梱型。3D と 2D を混ぜない。
3D は Babylon Physics V2 9.29.0 / Havok 1.3.14、2D は Rapier 決定版 0.21.0。
Phaser の Arcade / Matter は 1 人用の 2D ゲームだけで使える（`$game-phaser` §6）。

## 1. 3D の準備と作り方

- `@babylonjs/core` は Kit の `file:/workspace/sdk/node_modules/@babylonjs/core` を参照する。
- 対応する helper をバンドルすると Kit が **`physics/HavokPhysics.wasm`** を自動配置する（spec §9）。
  手で WASM をコピーしない。
  ブラウザは `await initPhysics()`（`@workspace/app-sdk/3d`）を呼ぶ。対戦は `app.space.join()` の前。
  Space Server の loader は初期化済み。外部 CDN・ゲームからの直接 fetch は使わない。
- ルールは `@workspace/app-server-sdk/physics` の再 export と helper で書く。
  `createPhysicsScene` は NullEngine + Havok の独立した Scene。描画 Scene とは別にする。
- 物理ノードは `TransformNode`。初期位置・四元数を決めてから `PhysicsBody` を作り、明示的な
  `PhysicsShapeSphere` / `Box` / `Capsule` などを付ける。headless で Mesh 境界に依存する `PhysicsAggregate` は使わない。

```ts
import { initPhysics } from '@workspace/app-sdk/3d'
import {
  createPhysicsScene, stepPhysics, disposePhysicsScene,
  TransformNode, Vector3, Quaternion,
  PhysicsBody, PhysicsMotionType, PhysicsShapeSphere,
} from '@workspace/app-server-sdk/physics'

async function startPhysics() {
  await initPhysics() // ブラウザだけ。Space Server の loader は初期化済み
  const physicsScene = createPhysicsScene(new Vector3(0, -9.81, 0), 1 / 60)
  const node = new TransformNode('ball-body', physicsScene)
  node.position.set(0, 5, 0) // body を作る前に初期配置を決める
  node.rotationQuaternion = Quaternion.Identity()
  const body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, physicsScene)
  body.shape = new PhysicsShapeSphere(Vector3.Zero(), 0.5, physicsScene)
  body.setMassProperties({ mass: 1 })

  // 固定 dt の tick（描画フレームとは分ける）
  function tick() {
    stepPhysics(physicsScene, 1 / 60)
    ballMesh.position.copyFrom(node.position)
    ballMesh.rotationQuaternion ??= Quaternion.Identity()
    ballMesh.rotationQuaternion.copyFrom(node.rotationQuaternion!)
  }
  // tick をルールから呼ぶ。終了時は disposePhysicsScene(physicsScene)。
}

startPhysics().catch((error: unknown) => console.error(error))
```

## 2. 3D のルールと対戦

1. `dt` は固定（`1 / 60`、対戦は `1 / tickRate`）。描画の可変時間を物理の step に使わない。
   描画フレームが遅い分は回数で追いかけ、1 フレーム最大 3 tick まで。
   余剰accumulatorを無限に持たず過負荷時の時間の扱いを決める。pause復帰で時計をresetし追いつきstormを防ぐ。
   Phaser Arcadeの固定stepへ同じaccumulatorを二重適用しない。
2. 物理は `stepPhysics(scene, dt)` で 1 tick だけ進める。描画の `scene.render()` から物理を step しない。
3. 物理の世界を作る関数はルールから export し、1 人用・練習モード・対戦サーバーが共有する。
   卓ごとに Scene を持ち、同じ Sandbox の別の卓と共有しない（`ctx.state` をキーに `WeakMap`）。
4. **対戦の 3D 物理はサーバーを正とする**。状態は数値の位置・四元数・速度のみ。
   画面は自分を含めて `predict.attachAll` / `predict.value` で補間して描く。Havok の step を
   `predict.reconciler` に渡さない。端末間の完全一致・rollback を前提にしない。
5. 1 人用は headless の TransformNode を visible Mesh に写す。位置は `copyFrom`、向きは `rotationQuaternion.copyFrom`。
   毎回の Mesh / shape 生成を避ける。GPU の粒子や cloth は見た目の飾りだけにする。
6. 終了時は `disposePhysicsScene(scene)`。リトライ・ステージ切り替え・卓終了で Scene と WASM の剛体を残さない。
7. 背景はSTATIC、動く物だけDYNAMIC。簡素shape/maskと近傍の活動範囲。飾りにcolliderを付けない。
   不可視でもbody/AIは動き得る。地域離脱でbody/shape/node/observerを解放し共有shapeは最後まで保持。
   未準備の衝突地域へ進めない。headless stepPhysicsはplugin直呼びなのでhelper周囲で時間を測る。

## 3. 2D（Rapier 決定版）

```json
{ "dependencies": { "@dimforge/rapier2d-compat": "file:/workspace/sdk/node_modules/@dimforge/rapier2d-deterministic-compat" } }
```

```ts
import RAPIER from '@dimforge/rapier2d-compat'

async function start2d() {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81 })
  world.timestep = 1 / 60
  // ルールの固定 tick で world.step()。終了時に world.free()。
}
```

画面と Space Server の 2D の結果をそろえるため、次を守る:

- 初期配置に `Math.random()` を使わず、seed 付き乱数（mulberry32）を使う。seed は状態に保存する。
  初期配置の演算は四則と整数のハッシュ。`Math.sin` / `cos` で作る数値はサーバーで計算して配る。
- `world.timestep` を固定し、可変フレーム時間を `step` に渡さない。
- 剛体の生成・破棄は slot・ID の昇順のように順番を決め、通信到着順や Map の走査順に頼らない。
- 物理のルールを export して画面・練習モード・サーバーで共有する。ブラウザは join の前に `RAPIER.init()`。
- 2D の遊びに 3D 物理を使わない（負荷と奥行きの処理が増える）。

## 4. 出力前のチェック

- [ ] 3D は Havok、2D は Rapier 2D または 1 人用 Phaser 物理
- [ ] 3D の WASM を `physics/HavokPhysics.wasm` に同梱し、ブラウザは `initPhysics()` を await
- [ ] 3D の物理 Scene と描画 Scene が別で、`stepPhysics` と描画が二重 step していない
- [ ] 対戦の Havok を reconciler で予測せず、サーバーの状態を補間
- [ ] 固定 dt、卓ごとの世界、終了時の Scene / World 解放
- [ ] 2D の Rapier は決定版で、初期乱数と剛体生成順を共有
