# MiFiTo Web v1.9.2

[Webアプリを開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/)

[画像ギャラリー](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/gallery/) — SEM・EDX・AFMの模擬画像7種類。画像内の個別背景あり、画像外の個別背景なし、補足文字付きラベルを比較できます。元画像と設定済みプロジェクト、esa用本文を収録しています。

## Figure Studioへまとめて反映

トップバーの「まとめてStudioへ送る」で、開いている画像をFigure Studioへ一括追加・更新できます。表示中の1枚だけを送る場合は「Figure Studioへ送る」を使います。通常起動でもStudioの図から開いた場合でも、同じトップバーのボタンを利用できます。Studioから開いた場合は、関連付けた元の画像を更新します。接続状態や処理結果もヘッダー内に表示し、画像・表を操作しながら確認できます。

プロジェクト・画像ごとの識別情報を `.mifito` に保存するため、画像を並べ替えたりプロジェクトを開き直したりしても対応が維持されます。変更した画像だけを更新し、変更のないプレビューはスキップします。既に複数のFigureへ配置した画像は位置を保ち、未追加の画像は受信先で開いているFigure（連携編集時は元のFigure）へ追加します。更新・追加・変更なしの枚数を表示し、StudioのCtrl+Zで一括変更を1回で戻せます。MiFiToから画像を削除しても、Studio上の画像は自動削除しません。Figure Studio v0.3.5以降と組み合わせて利用してください。

プレビュー上の「Studioに貼る画像サイズ」で「画像本体のサイズを指定」をオンにし、幅または高さを0.1〜1000 mmで指定できます。初期値は40 mmです。設定対象の画像だけを変更し、「全画像に適用」でまとめて揃えられます。カラーバーや画像外のラベル領域を含まない画像本体の寸法で、縦横比を維持します。単体送信・一括送信の両方に対応し、通常のファイル保存の寸法は変えません。

既存画像に初めてサイズを指定したときは、Studioでその寸法を採用します。その後の再編集ではStudio上で手動変更した倍率と位置を維持します。サイズを指定しない画像は従来どおり追加時に用紙へ収め、更新時は既存の配置サイズを維持します。

## 学生向けマニュアル

- [簡易版](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/quick.html)
- [詳細版](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/detailed.html)
- [esa投稿用の本文・画像・GIF一式](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/manual.zip)

画像を開く、校正、トリミング、スケールバーとラベル、一括保存、プロジェクトの再開を説明します。操作部やダイアログを拡大した画像、マウス操作を示すGIFを使っています。
