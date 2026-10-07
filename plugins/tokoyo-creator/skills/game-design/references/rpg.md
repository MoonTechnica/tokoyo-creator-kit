# 長期RPG・探索の制作契約

高画質より、進行を失わず再開でき、地域やNPCが増えても現在の負荷が限定されることを優先する。
会話・装備・ショップなど全機能を毎作品へ足さない。briefで必要な核を選ぶ。

## データと進行

- アイテム/NPC/クエスト/地域の定義とruntime stateを分け、安定したIDで参照する。配列の現在のindexを保存IDにしない。
- クエストは未開始/進行中/達成/報酬受取などの遷移を明示。二重入力・再開・再訪で報酬が重複しない。
- 定義データは地域bundleで遅延ロードする。作者設計のtilemap/GLBも利用できる。
- 保存はschemaVersion、生成方式version、seed（生成worldの場合）、進行、必要な差分、必要なRNG状態。
  旧セーブや公開版rollbackで参照できない版を勝手に新規worldへ置き換えず、理由を表示する。
- 無限に改変できるworldの差分は圧縮だけでは有界にならない。有限範囲、同一IDの最新変更へのcompact、容量予算を決める。

## 保存

- 起動時のstore.getが失敗したら空データで上書きしない。最初のrevisionとACK済みrevisionを使う。
- `@workspace/app-sdk/runtime`のcreateCheckpointで固定snapshot・単一flight・同じ要求の再送を扱える。
  captureは保存対象の小さなJSONデータだけを返す。Mesh/Scene/Input/音は含めない。
- 活動中の定期/重要進行時にdirtyをまとめてflushする。毎分12writeを守り、移動毎frameや拾うたびに直接writeしない。
- onPauseは入力/simulation/timerを止める。paused中はSDK APIを使えない。未保存分はresume後の活動中に再試行する。
  OS終了時の非同期完了は保証しない。最後の確定時刻、未保存、再試行、容量不足、競合を表示する。
- 失敗した要求は同一payload/requestId/revisionで再送する。REVISION_CONFLICTで最新revisionだけ取得して古い世界を上書きしない。
  競合はプレイヤーに選択/再読込を示すか、ゲーム固有の安全なmergeを行う。
- 1MiBはgzip単体ではなくbase64を含む最終JSON UTF-8の長さ。所持品/設定/クエストを別保存処理が互いに上書きしない。

## NPCと世界の活動範囲

- 描画、骨格animation、物理、AI、経路探索、保持範囲を別にする。不可視にしただけで計算停止したと考えない。
- 近傍NPCだけ詳細更新、遠方は低頻度、非活動地域はデータだけ。戦闘結果を勝手に変える間引きはしない。
- 空間セルで近傍検索。全NPCの感知/pathfindingを毎frame行わず、要求queueと更新位相を分散する。
- 遠方の時間経過を復元する場合はゲームルールとして設計し、対戦はサーバー権威を維持する。LLMを毎frame呼ばない。
- Poolは有限。再利用時にbody、速度、animation、tween、timer、購読をreset。静的反復物のbatchは地域単位。

## 入力と復帰

- 会話/メニュー中は移動/攻撃を止め、決定・戻る・相互作用の割当を入力キットで管理する。閉じた入力が戦闘へ漏れない。
- 復帰地点、失うもの、続きからを明示。地域の表示と衝突が準備できるまで境界で待機する。
- pause/resumeは冪等にし、timer/render loop/listenerを二重登録しない。

## 検査

ルール検査: クエスト遷移/報酬一度だけ、保存往復、生成版とID、容量境界、未知版の拒否。
明示依頼の長時間QA: 地域往復/再訪、連続teleport、読み込み中の離脱、保存ACK喪失/競合、pause/resume反復。
live chunk/body/texture/audio/listenerが一定の高水位に収束するか、frame p95/p99/最大停止を調べる。
公開前の短い動的スモークを長時間性能の保証としない。端末別監視サービスや毎版実機QAを自動追加しない。
