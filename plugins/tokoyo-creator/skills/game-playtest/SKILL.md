---
name: game-playtest
description: 作ったゲームを自分で遊んで確かめ、直す。核が遊べる形になったときと、仕上げの前に使う。design/playtest.md の確かめる項目（rubric）の作り方、ルールを node で回す検査（assets/playtest-rules.mjs をコピーして使う）、利用者が頼んだときだけ Platform にしっかりした試遊を頼むこと、前の版の試遊結果（input/playtest-report.json）の読み方、直す順序を扱う。playtest, rubric, self-test, headless, simulation, autoplay, bug triage.
---

# 自分で遊んで確かめる

ビルドが通ることと遊べることは別。**操作が効かない・勝ち負けが起きない・状態が進まない**は、コードを読んでも見つからない。
ここでは遊びの振る舞いと実画面を確かめる。見た目の数値（文字・コントラスト・点滅）は `$game-ux`、
世界観・素材・明暗・材質・照明の比較は `$game-art-direction` references/visual-direction.md §6 に従う。
重い表現の設計・追加時は `$game-design` references/performance-risk.md を読み、
本実装の前に利用できる環境で実描画の比較を行う。これは短いPlatform起動検証や描画なしのルール検査では代替できない。
Platformの毎版検証やthoroughを自動で増やす指示ではない。描画環境が無ければ理由と未確認を報告する。

## 1. 確かめる項目（`design/playtest.md`）

`design/brief.md` から 6〜10 項目を起こす。**1 項目 = 遊んで観察できる振る舞い 1 つ**（「面白い」「ちゃんと動く」は項目にしない）。

```markdown
| # | 項目 | 確かめ方 | 結果 |
|---|---|---|---|
| 1 | 1 回の操作で遊び始められる | 公開前検証/作者プレビュー（§3） | 未確認 |
| 2 | 左右の入力で自機が動く | ルール検査 | ✓ |
| 3 | 何もしなくても最初の 10 秒は終わらない | ルール検査 | ✓ |
| 4 | 針に触れると終わり、リザルトが出る | ルール検査 | ✓ |
| 5 | リザルトから 1 回の操作で最初に戻る | ルール検査 | ✓ |
| 6 | うまく取るほど点が増える | ルール検査 | ✓ |
| 7 | 10 秒ごとに星が速くなる | ルール検査（tuning の値） | ✓ |
| 8 | プレイ中もスコアが読める | 公開前検証/作者プレビューの画面（§3） | 未確認 |
```

- 「結果」は、このターンで確かめて通ったものだけ ✓、通らなかったものは ✗（理由）。**確かめていないものに ✓ を付けない**。
  Platformで見る項目は「未確認（公開前検証/作者プレビュー待ち）」と書く。結果が届いたらArtifact/版を照合して埋める。

必須: 開始/入力/目的に向けた進行/適切な区切り/失敗からの復帰。短時間ゲームは結果と再挑戦。
進行型は保存→再開とクエスト/所持品の保持を検査する。短い時間切れやスコアを全作品へ課さない。
残りはジャンルの下限（`$game-design` references/genres-minimum.md）から選ぶ。

## 2. ルール検査（`rules.ts` があるターンは毎回・このターンの中で）

`src/rules.ts` の遊びのルールを、描画なしで `node` から回す（`$game-design` §3 の形が前提。`rules.ts` の無い前の版を続けるときは
省いて `notes` に 1 行書く。`$game-design` §1）。

1. `<kit>/skills/game-playtest/assets/playtest-rules.mjs` を `scripts/playtest-rules.mjs` にコピーする（初回だけ。以後はそのファイルを直す）。
2. 下の方の `CHECKS` を、このゲームの rubric に合わせて書き換える。`idle`（何もしない）と `play`（うまく遊ぶ人の入力）を rules.ts の `Input` の形にする。
   RPG等の進行型は`PROGRESSION = true`にし、終了/得点のCHECKSを保存再開・進行条件・報酬重複防止へ置換する。
   この場合`loadRules(path, { progression: true })`は`init`/`step`だけ要求し、未定義のscoreはnull、isOverはfalseとして扱う。
   `world.ts`等を直接検査する独立したテストも可。使わないscore/isOverをダミーで追加しない。
   `simulate(rules, { seed, seconds, input })` が `over` / `endedAt` / `score` / `samples` / `brokenNumber` を返す。
   **雛形の `CHECKS` はアクション向け**（放置しても 10 秒は終わらない・放置すればいつか終わる）。放置で負ける遊び（ワンボタン）、
   入力が無いと進まない遊び（パズル・ターン制・クリッカー）では、その項目を遊びに合う形（「最初の手で状態が変わる」「解ける」など）に置き換える。
   「再挑戦で最初に戻る」は `init` が同じ seed で同じ状態を返すことだけを見る。リザルトから戻る操作は画面側なので、`main.ts` を読んで確かめる。
3. `node scripts/playtest-rules.mjs` を実行する。✗ が出たら直して、全部 ✓ になるまで回す。
4. 結果を `design/playtest.md` の「結果」に写す。

- 世界生成・保存往復・クエスト遷移など独立した重要性質の検査は必要なら追加する。実装をなぞるだけのテストは書かない。
- 対戦のルールも `src/rules.ts` に書き、`server/main.ts` の `defineSpace` がそれを呼ぶ（`$game-design` §3）。検査はその `rules.ts` を回す。
- 数値を直すときは `src/tuning.ts` だけを変えて回し直す。

## 3. Platform の試遊（検証のついで）

通常制作・提案取り込みは静的検証まで。**main公開直前だけ**Platformが短い動的スモークを行う。
中央タップ/Enter/Space後1.5秒の画面で起動を確認する。同じArtifactの合格は再利用される。
短い試遊は長時間の滑らかさやRPG進行の保証ではない。

**利用者が明確に頼んだとき**（「遊んで確かめて」「ちゃんと動くかテストして」など）だけ、`build-report.json` に
`"playtest": { "level": "thorough" }` を書く。その版は 12 秒ほど矢印・Space・タップを押し続け、4 秒ごとに撮る（3 枚まで）。
**自分の判断では頼まない**（検証が長くなり、利用者を待たせる）。遊びの振る舞いは §2 のルール検査で確かめる。

実施済み結果があれば `./input/playtest-report.json` と `input/playtest/*.png` に届く。未実施の版へ結果が届くと約束しない。
手元では `kit.mjs clone` / `kit.mjs pull` が `get_git_bundles` の `head.playtest` を同じ場所に置く（`instructions.md` §8.3）。
```jsonc
{ "versionId": "…",
  "findings": [ { "code": "STATIC_AFTER_INPUT", "message": "…" },   // 最初の入力で画面が変わらなかった
                { "code": "STATIC_SCREEN", "message": "…" },        // しっかりした試遊で最後まで変わらなかった
                { "code": "PAGE_ERROR", "message": "TypeError: …" } ],
  "screenshots": ["playtest/1.png"] }
```

- **届いていたら、依頼の作業より先に読む**。`PAGE_ERROR` と `STATIC_AFTER_INPUT` / `STATIC_SCREEN` は、依頼の作業のついでに直す
  （最初の画面でタップを待っているだけなら、タップで始まることを確かめて `notes` に 1 行書けばよい）。
- 画像を見て、HUD が読めるか・主役が見えるか・最初にすることが出ているかを確かめる。
- 画像を実際に見て style-guide と比較する。狙った雰囲気、素材の形と質感、明暗、光と影、手掛かり、UI / VFX の調和から
  作品に必要な項目を `design/playtest.md` に加える（`$game-art-direction` references/visual-direction.md §6）。
  問題の場所・基準との差・原因・修正を記録し、前の版の画像で修正後の版に ✓ を付けない。画像が無い場面は未確認と残す。
- 乱数で押すだけなので、「勝てない」「点が入らない」は判断の根拠にしない（それはルール検査で見る）。

## 4. 直す順序

1. 起動しない・エラーが出る（`PAGE_ERROR`・ビルドの失敗）
2. 状態が進まない（入力が効かない・終わらない・再挑戦できない）
3. ルールが brief と違う（勝ち負けの条件・点数）
4. 手応えが無い（`$game-ux` §2）
5. 見た目（絵柄のずれ・読めない文字）

報告（`build-report.json` の `notes` と最後の返事）は、何を確かめて何が ✓ になったかを短く書く。✗ が残ったら、何が残ったかと理由を書く。

## 5. 明示依頼の長時間QA

長時間性能/RPGの動作確認を利用者が頼んだ時だけ行う。12秒thoroughを長期性能の保証としない。
端末/版/設定/経路を記録し20–30分以上の地域往復/再訪、teleport、読込中離脱を確認する。
保存ACK喪失/競合/容量不足、旧セーブ、pause/resume反復、回転、長いsleepからの復帰も含める。
frame p50/p95/p99/最大停止とlive chunk/body/texture/audio/listenerの頭打ちを観察する。
CPU/GPU/素材推定/実機総メモリは別項目。GPU未対応を0としない。未確認の端末/場面を明記する。
端末監視サービスや毎版の実機検証を自動追加しない。
