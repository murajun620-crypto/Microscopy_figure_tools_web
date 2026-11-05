# カラーバー配色の出典と実装

MiFiTo v1.8.2は次の8配色を備えています。配色は色の制御点からブラウザ内で描画し、他のアプリの実行プログラムや画面画像は同梱しません。

| 選択肢 | 配色・出典 |
| --- | --- |
| Gwyddion.net（黒・茶・金・白） | Gwyddion公式リポジトリの同名gradientの位置とRGB値に基づきます。 |
| MetroPro（虹色・Gwyddion再現） | Gwyddionが公開するMetroProの虹色再現gradientに基づきます。ZYGO製品から取り出したファイルではなく、全バージョンのMetroProとの一致を保証するものではありません。 |
| 熱色・グレースケール・ゴールド・スペクトル・青白赤・ブルー | MiFiTo用に独自に定義した6配色です。 |

参考にした公式の数値定義：

- [Gwyddion.net](https://sourceforge.net/p/gwyddion/code/30745/tree/trunk/gwyddion/data/gradients/Gwyddion.net)
- [MetroPro](https://sourceforge.net/p/gwyddion/code/30745/tree/trunk/gwyddion/data/gradients/MetroPro)
- [Gwyddionの変更履歴](https://gwyddion.net/news.php#v2.36)：MetroProの虹色を再現する配色を追加したことが記載されています。
- [gradientの仕様](https://gwyddion.net/documentation/user-guide-en/resources.html)：制御点間はRGBの線形補間です。

RGBは8-bitへ丸めています。MetroPro定義の重複端点はGwyddionと同じく「位置0の最後の色」「位置1の最初の色」として扱います。読み込んだマップの色・範囲に合わせて配色と最小値・最大値を指定してください。画像そのものの配色や測定値は変更しません。

## 著作権との区別

ソフトウェア全体のライセンスと、色の並びそのものが著作物に当たるかは別の問題です。GwyddionがGPLであることや、MetroPro本体に著作権表示があることだけで、同様のカラーバーの描画が禁止されるわけではありません。単純な配色・一般的なグラデーションに、当然に著作権があるという扱いはしていません。ただし、あらゆる配色や画像・プログラム・ファイルが無条件で再利用可能という意味ではありません。

- [文化庁：著作物の要件](https://www.bunka.go.jp/seisaku/chosakuken/kaizoku/faq.html)
- [米国著作権局：色・色付けについて（§906.3）](https://www.copyright.gov/comp3/chap900/ch900-visual-art.pdf#page=11)
- [Gwyddion本体のライセンス](https://gwyddion.net/documentation/user-guide-en/licensing.html)

## 配色の読み込み

ユーザーが用意したバー画像・配色ファイルは端末内で読み込み、配色の制御点をプロジェクトと設定JSONへ保存します。外部サーバーへ送信しません。

対応形式：文字や目盛りを除いた横長／縦長のPNG・JPEG・WebP、Gwyddion gradient、位置とRGBのCSV（0〜1または0〜255）、`{"name":"配色名","stops":[{"position":0,"color":"#000000"},{"position":1,"color":"#ffffff"}]}`形式のJSON。

Gwyddion形式は公開仕様に基づくMiFiToの読み込み処理を使います。alphaは公式仕様のとおり色の描画には使いません。

## 画像からの推定

「画像から配色を推定」は現在のトリミング範囲を使い、標準8配色と読み込み済みの配色の中から近いものを選びます。元画像から未知の配色を完全復元する機能ではありません。色が少ない・狭い範囲しかない・類似候補がある場合は設定を変えずに案内します。最小・最大値、単位、配色の向きは手動で確認してください。処理は端末内で完結します。
