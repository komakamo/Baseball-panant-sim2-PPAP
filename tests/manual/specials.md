# 特能発動ロジック QA チェックリスト

## 自動テスト
1. `npm test` （内部で `node --test` を実行）を実行して、`tests/specials.test.js` が通ることを確認します。
   - `対左投手○` が左投手相手でのみ発動し、規定回数で止まることを検証します。
   - `クラッチヒッター` が得点圏のみで発動することを検証します。
   - `奪三振マシン` が三振確率を上げつつ被安打を抑える補正を返すことを検証します。

## 手動スポットチェック
1. 左投手トリガーと重複制御を確認するため、`node tests/manual/plate-specials-demo.mjs` を実行します。
   - 左投手相手では 3 回まで発動ログが出力され、4 回目以降および右投手相手では「発動なし」と出ることを確認します。
   - 併せてクラッチヒッターの有無で出力が変わることも確認します。
2. Web アプリでの表示確認：
   1. `index.html` をブラウザで開き、開発者ツールのコンソールで下記スニペットを実行して任意のチーム/選手に特能を付与します。
      ```js
      const homeId = State.schedule.find(evt => evt.type === 'game')?.home_id;
      const awayId = State.schedule.find(evt => evt.type === 'game')?.away_id;
      const homeBat = State.rosters[homeId].bats[0];
      homeBat.traits = ['lefty_killer'];
      const awayPitcher = State.rosters[awayId].pits[0];
      awayPitcher.hand = 'L';
      saveAndRerender?.();
      ```
   2. 1試合シミュレーション（例：その日の試合を進めるボタン）を行います。
   3. 試合終了後、ゲームレポートの「得点プレー」欄で `特能発動: 対左投手○` の表記が1打席につき1回のみ表示されることを確認します。
   4. 同一打者で複数打席がある場合も、規定回数を超える表示が出ないことを合わせて確認します。
