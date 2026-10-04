---
name: tokoyo-remix
description: 他の人のTOKOYO.gamesのゲームへ参加し、公開済みリリース（参照許可があれば最新main）から同じゲームのfeatを作って作業する。Platform MCPのresolve_app / create_branch / get_git_bundlesを使う。「これを改造して」「リミックスして」「作者へ提案したい」のときに使う。
---

# ゲームへ参加する

手順の正本は **<kit>/profile/instructions.md §8.6**。ゲームの所有権は元作者・元チームに残る。

1. `resolve_app({ reference })` で元ゲームと自分の立場を確認する。本人・所属チームのゲームは `get_app` の通常編集を使う。
2. 外部参加では `contribution.allowed` を確認する。`my_branches` に続けたい枝があれば再開する。無ければ `create_branch({ app_id, request_key: <UUID> })`。再送は同じrequest_keyを使う。
3. 元ゲームのapp_idと返されたsession_idで `get_git_bundles({ app_id, session_id })`。そのJSONを `kit.mjs clone --bundles '<JSON>'` へ渡す。既存の枝は `$tokoyo-pull` で続ける。
4. 素材ツールにもapp_id・session_idを渡す。自分のfeatを編集し、`$tokoyo-push` で検証する。mainへの提案は `$tokoyo-propose`。
5. 最新mainの参照権限がある場合だけ、最新mainを取り込むには `$tokoyo-pull` でmainもfetchし、feat上でgit mergeする。競合を解決して再検証する。

提案には1つの目的を入れる。掲載情報は頼まれない限り変えない。生成やpushが成功してもmain・公開リリースは更新されない。

一般参加者に未公開main・合流候補・そのプレビューを要求しない。公開版からの変更は作者側で最新mainへ3-way mergeする。作者・チームまたは招待者への明示的な参照許可がある場合だけ最新mainを取得できる。
