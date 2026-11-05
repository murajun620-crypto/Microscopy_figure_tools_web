# カラーバー配色の出典と利用条件

MiFiToの標準6配色（熱色・グレースケール・ゴールド・スペクトル・青白赤・ブルー）は、MiFiTo用に色の制御点を独自に定義しています。Gwyddion／MetroProの配色データ、画面、ライブラリは転載・同梱していません。

配色全般を「著作権がない」と一括して判断することはできません。ソフトウェア自体の権利と、個別の配色データの利用条件も区別する必要があります。

- Gwyddion公式の利用条件はGNU GPLです。著作権がないという意味ではなく、配布する場合のソース提供などの条件が記載されています。個別のgradientファイルについて、無条件の再配布を認める例外は今回確認できませんでした。このため、著作権なしの素材として取り込んでいません。
  https://gwyddion.net/documentation/user-guide-en/licensing.html
- MetroProのZYGO使用許諾ではソフトウェアの所有権・著作権と使用制限を定めています。個別の配色データを別アプリで再配布できる許諾は今回確認できませんでした。そのため同梱していません。以下はZYGOのReference GuideをCaltech/LIGOが公開しているものです。
  https://labcit.ligo.caltech.edu/~coreopt/metropro/ZygoAnalysisTools-forMike/MetroPro%20Reference%20Guide.pdf
- ユーザーが用意したバー画像・配色ファイルは端末内で読み込み、そのプロジェクト／設定JSONへ色の制御点として保存します。サーバーへ送信したり標準配色として再配布したりしません。

Gwyddion形式の読み込みは、公式ドキュメントに公開された `Gwyddion resource GwyGradient` のテキスト形式（位置・RGB・alpha）を独自に実装しています。Gwyddionのプログラムコードは使用していません。公式説明のとおりalphaは使用せず、色として読み込みます。
https://gwyddion.net/documentation/user-guide-en/resources.html

その他の読み込み形式：横長／縦長のPNG・JPEG・WebP、位置とRGBのCSV（0〜1または0〜255）、`{"name":"配色名","stops":[{"position":0,"color":"#000000"},{"position":1,"color":"#ffffff"}]}` 形式のJSON。
