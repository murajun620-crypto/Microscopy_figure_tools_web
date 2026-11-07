# MiFiTo Web v1.9.1

[Webアプリを開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/)

[画像ギャラリー](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/gallery/) — SEM・EDX・AFMの模擬画像7種類。画像内の個別背景あり、画像外の個別背景なし、補足文字付きラベルを比較できます。元画像と設定済みプロジェクト、esa用本文を収録しています。

## Figure Studioへまとめて反映

「まとめてStudioへ送る」で、開いている画像をFigure Studioへ一括追加・更新できます。Studioの図からMiFiToを開いて編集した場合は「変更画像をまとめて反映」を使います。表示中の1枚だけを送る従来のボタンも利用できます。

プロジェクト・画像ごとの識別情報を `.mifito` に保存するため、画像を並べ替えたりプロジェクトを開き直したりしても対応が維持されます。変更した画像だけを更新し、変更のないプレビューはスキップします。既に複数のFigureへ配置した画像は位置・サイズを保ち、未追加の画像は受信先で開いているFigure（連携編集時は元のFigure）へ追加します。更新・追加・変更なしの枚数を表示し、StudioのCtrl+Zで一括変更を1回で戻せます。MiFiToから画像を削除しても、Studio上の画像は自動削除しません。Figure Studio v0.3.4以降と組み合わせて利用してください。

## 学生向けマニュアル

- [簡易版](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/quick.html)
- [詳細版](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/detailed.html)
- [esa投稿用の本文・画像・GIF一式](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/manual.zip)

画像を開く、校正、トリミング、スケールバーとラベル、一括保存、プロジェクトの再開を説明します。操作部やダイアログを拡大した画像、マウス操作を示すGIFを使っています。
