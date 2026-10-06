---
name: tokoyo-pull
description: Platform にある TOKOYO.games のゲームを手元に取り込む（続きを作る・制作画面で進んだ版を取り込む）。Platform MCP（tokoyo）の get_app / get_git_bundles と Creator Kit の CLI（clone / pull。手元は git のリポジトリ）を使う。app_id や制作画面の URL を渡されたとき、「続きを作って」「最新にして」「本流を取り込んで」のときに使う。pull, sync, continue, upstream.
---

# 手元に取り込む

`<kit>` は作業ディレクトリの `.tokoyo.json` の `kit_root`。まだ作業ディレクトリが無ければ、この Skill の
ディレクトリの 2 つ上（分からなければ利用者に Kit の場所を聞く）。git と Git LFS が要る。

1. **SDK を用意する**: `get_sdk()` → `node <kit>/scripts/kit.mjs setup --sdk-url <url> --sha256 <sha256>`（展開して Kit の lockfile どおりに `npm ci`。同じ版なら何もしない）。
2. **App を決める**: 渡された `app_id`（制作画面の URL なら `/create/<app_id>` の部分）。分からなければ
   `list_apps()` の一覧から利用者に選んでもらう。
3. `.tokoyo.json` または `get_app` で自分のsession_idを確認し、`get_git_bundles({ app_id, session_id })` を呼ぶ（署名 URL は短命なので、すぐ次へ渡す）。
   `requires_proposal: true` なら返る `contribution_policy` を読む。以後の各編集依頼の前にも
   `get_contribution_policy({ app_id })` で最新を確認する。禁止事項・ガイドラインに抵触する依頼は
   該当の規約と理由を説明して編集を拒否し、素材生成・commit・push は行わない。取得失敗時も作業を止める。
4. **取り込む**: その App の `.tokoyo.json` があるディレクトリなら
   `node <kit>/scripts/kit.mjs pull --bundles '<get_git_bundles の JSON>'`。
   無ければ新しいディレクトリを作って移り、`node <kit>/scripts/kit.mjs clone --bundles '<同じ JSON>'`。
   `pull` は commit していない変更があると断るので、先に `git commit` する（`<kit>/profile/instructions.md` §8.3 / §8.4）。
5. 結果の `status` が `conflict` なら、示されたファイルの衝突を解き `git add` → `git rebase --continue`（§8.4）。
6. **参照を許可された最新mainだけを自分のfeatへ取り込む**: `main` が返る場合だけ行う。一般参加者には公開済みリリースのみが渡される。参照権限がある取得結果のmainは `refs/remotes/tokoyo/heads/main` にfetchされる。
   feat上で `git merge refs/remotes/tokoyo/heads/main`。競合を解決してcommitし、build・pushで再検証する。
   mainをfetchしても、featのhead・pushのbase・公開版は自動で置き換わらない。

7. **公開版を参照する**: `main` が null で `reference` が返る場合、`reference.ref_name`（`refs/releases/<version_id>`）は安全な公開スナップショット。fetch済みの `refs/remotes/tokoyo/releases/<version_id>` は公開版の参照用で、自分のfeatを置き換えない。通常のpullは自分のfeatだけを同期する。公開スナップショットには未公開履歴を含めず、別の公開版との共通祖先を仮定しない。未公開 main の取得やプレビューは求めない。作者側の取り込みは、固定された公開スナップショットを共通の起点として最新mainへ行う。
