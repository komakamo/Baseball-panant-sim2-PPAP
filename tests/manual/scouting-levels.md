# スカウティング誤差幅 QA チェックリスト

候補レベルに応じてスカウティング誤差の幅が変わることを確認します。

## 手動チェック
1. `index.html` をブラウザで開き、開発者ツールのコンソールを開きます。
2. 以下のスニペットを実行して、同じ真の能力値と乱数シードからレベル別のスカウティング結果を取得します。
   ```js
   const ratings = { con: 60, disc: 58, pwr: 62, spd: 55, fld: 57, pot: 72 };
   const sample = (level) => {
     const rng = mulberry32(12345);
     return createScoutingProfile(ratings, 'BAT', level, rng);
   };
   const hs = sample('高校');
   const college = sample('大学');
   const company = sample('社会人');
   ({
     highSchool: Math.abs(hs.errors.con),
     college: Math.abs(college.errors.con),
     corporate: Math.abs(company.errors.con),
   });
   ```
3. 出力された `highSchool` / `college` / `corporate` の値を確認し、`高校` ≥ `大学` ≥ `社会人` の順で誤差が小さくなっていることを確認します。
4. 同じスニペットで `errors.pot` や `errors.spd` など他の属性を参照し、レベル差によって誤差幅が縮むことを複数属性で確認します。
5. 追加で `sample('独立リーグ')` や `sample('海外')` を呼び出し、大学と比較してやや広めの誤差になることも確認してください。

これによりレベルに応じた誤差コントロールが機能していることを確認できます。
