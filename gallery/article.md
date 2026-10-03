# MiFiTo 図のギャラリー

SEM、EDX元素マップ、AFM高さ画像の7サンプルを使い、スケールバーとラベルの置き方を比較します。各サンプルに画像内・画像外の2パターンを用意しました。ラベルはパネル記号と補足文字を組み合わせています。

**すべて人工的に生成した模擬画像です。実際の顕微鏡で取得した画像ではありません。** 画素寸法と高さ・計数データを持つモデルから作成し、MiFiToの実際の描画処理でバーとラベルを付けています。

[MiFiToを開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/) · [学生向けマニュアル](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/manual/) · [全プロジェクトを保存（ZIP）](projects.zip?v=a9dc9fd7300d) · [esa掲載用一式](gallery.zip?v=a9dc9fd7300d)

## 2つの配置ルール

|配置|スケールバーの個別背景|ラベルの個別背景|文字色|
|---|---|---|---|
|画像内部|あり 半透明黒|あり 半透明黒|白|
|画像外部|なし|なし|黒|

画像外の白い部分は上下に追加した余白です。バーとラベルの個別背景は両方オフにしてあります。画像外ではラベルを上、バーを下に配置しています。

## 全作例のプロジェクト

[全15プロジェクトを保存（ZIP）](projects.zip?v=a9dc9fd7300d)

|作例|プロジェクト|
|---|---|
|SEM Auナノ粒子（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-particles-inside) · [保存](projects/sem-particles-inside.mifito?v=a9dc9fd7300d)|
|SEM Auナノ粒子（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-particles-outside) · [保存](projects/sem-particles-outside.mifito?v=a9dc9fd7300d)|
|SEM 多孔質膜（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-porous-inside) · [保存](projects/sem-porous-inside.mifito?v=a9dc9fd7300d)|
|SEM 多孔質膜（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-porous-outside) · [保存](projects/sem-porous-outside.mifito?v=a9dc9fd7300d)|
|EDX Auマップ（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-au-inside) · [保存](projects/edx-au-inside.mifito?v=a9dc9fd7300d)|
|EDX Auマップ（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-au-outside) · [保存](projects/edx-au-outside.mifito?v=a9dc9fd7300d)|
|EDX Siマップ（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-si-inside) · [保存](projects/edx-si-inside.mifito?v=a9dc9fd7300d)|
|EDX Siマップ（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-si-outside) · [保存](projects/edx-si-outside.mifito?v=a9dc9fd7300d)|
|EDX AuとSiの重ね合わせ（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-overlay-inside) · [保存](projects/edx-overlay-inside.mifito?v=a9dc9fd7300d)|
|EDX AuとSiの重ね合わせ（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-overlay-outside) · [保存](projects/edx-overlay-outside.mifito?v=a9dc9fd7300d)|
|AFM ナノ粒状表面（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-grains-inside) · [保存](projects/afm-grains-inside.mifito?v=a9dc9fd7300d)|
|AFM ナノ粒状表面（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-grains-outside) · [保存](projects/afm-grains-outside.mifito?v=a9dc9fd7300d)|
|AFM 段差を持つ表面（画像内）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-terraces-inside) · [保存](projects/afm-terraces-inside.mifito?v=a9dc9fd7300d)|
|AFM 段差を持つ表面（画像外）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-terraces-outside) · [保存](projects/afm-terraces-outside.mifito?v=a9dc9fd7300d)|
|SEM Auナノ粒子（記号のみ）|[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-label-only) · [保存](projects/sem-label-only.mifito?v=a9dc9fd7300d)|

## プロジェクトで再現する

1. 作例の「プロジェクトを保存」を押す。まとめて保存する場合は「全プロジェクトを保存（ZIP）」を使い、ZIPを展開する。
2. MiFiToの「プロジェクトを開く」で開く。元画像、校正、バー、ラベル設定が復元される。
3. ラベルと補足文字、個別背景、位置を変更する。

PNGのdpiから画素寸法を推定して校正しないでください。この作例ではモデルに与えたnm/pxを校正値として使っています。実画像は装置の画素寸法や既知長のスケールで校正します。

<a id="sem-particles"></a>

## SEM Auナノ粒子

### 画像内部 個別背景あり

![SEM Auナノ粒子 画像内 バーとラベルの個別背景あり 模擬画像](assets/sem-particles-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-particles-inside) · [元画像](data/sem-particles.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/sem-particles-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/sem-particles-inside.png?v=a9dc9fd7300d) · [SVG](figures/sem-particles-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![SEM Auナノ粒子 画像外 バーとラベルの個別背景なし 模擬画像](assets/sem-particles-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-particles-outside) · [元画像](data/sem-particles.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/sem-particles-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/sem-particles-outside.png?v=a9dc9fd7300d) · [SVG](figures/sem-particles-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(a)」＋補足文字「Au nanoparticles」。

### 元画像の作り方

対数正規粒径の楕円状粒子を配置し、表面傾斜、明るい縁、照射方向の陰影、計数ノイズを重ねたSEM二次電子像の近似。

1024×768 px、4 nm/px。190個を配置。幾何学的投影径の中央値184 nm、対数標準偏差0.32。重なりあり。実際の電子輸送計算ではない。

二次電子像の表面コントラストと縁の明るさは[JEOLのSEM像解説](https://www.jeol.com/words/semterms/20121024.070958.php)を参考にした近似です。

<a id="sem-porous"></a>

## SEM 多孔質膜

### 画像内部 個別背景あり

![SEM 多孔質膜 画像内 バーとラベルの個別背景あり 模擬画像](assets/sem-porous-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-porous-inside) · [元画像](data/sem-porous.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/sem-porous-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/sem-porous-inside.png?v=a9dc9fd7300d) · [SVG](figures/sem-porous-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![SEM 多孔質膜 画像外 バーとラベルの個別背景なし 模擬画像](assets/sem-porous-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-porous-outside) · [元画像](data/sem-porous.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/sem-porous-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/sem-porous-outside.png?v=a9dc9fd7300d) · [SVG](figures/sem-porous-outside.svg?v=a9dc9fd7300d)

**校正：** 6 nm/px。バー1000 nm = 元画像上167 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(b)」＋補足文字「Porous film」。

### 元画像の作り方

空間相関を持つランダム場を閾値化して連続骨格と孔を作り、縁のコントラストと計数ノイズを加えた。

6 nm/px、視野6.144×4.608 µm、相関長の設定78 nm。材料名や実測孔径は割り当てていない。

二次電子像の表面コントラストと縁の明るさは[JEOLのSEM像解説](https://www.jeol.com/words/semterms/20121024.070958.php)を参考にした近似です。

<a id="edx-au"></a>

## EDX Auマップ

### 画像内部 個別背景あり

![EDX Auマップ 画像内 バーとラベルの個別背景あり 模擬画像](assets/edx-au-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-au-inside) · [元画像](data/edx-au.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-au-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-au-inside.png?v=a9dc9fd7300d) · [SVG](figures/edx-au-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![EDX Auマップ 画像外 バーとラベルの個別背景なし 模擬画像](assets/edx-au-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-au-outside) · [元画像](data/edx-au.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-au-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-au-outside.png?v=a9dc9fd7300d) · [SVG](figures/edx-au-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(c)」＋補足文字「Au M counts」。

### 元画像の作り方

SEMと同じ粒子配置からAuとSiの期待計数を作り、標準偏差48 nmの空間ぼけとPoisson計数ノイズを加えた。

Auは粒子部分、Siは基板部分が優勢。各色の表示上限はAu 30 counts/px、Si 22 counts/px。別々の表示スケールなので色の明るさを元素間の濃度比較に使わない。

EDXは画素ごとの特性X線計数を表すという[JEOLの元素マッピング解説](https://www.jeol.com/words/semterms/20121024.031359.php)を参考にしました。濃度マップではありません。

<a id="edx-si"></a>

## EDX Siマップ

### 画像内部 個別背景あり

![EDX Siマップ 画像内 バーとラベルの個別背景あり 模擬画像](assets/edx-si-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-si-inside) · [元画像](data/edx-si.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-si-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-si-inside.png?v=a9dc9fd7300d) · [SVG](figures/edx-si-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![EDX Siマップ 画像外 バーとラベルの個別背景なし 模擬画像](assets/edx-si-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-si-outside) · [元画像](data/edx-si.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-si-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-si-outside.png?v=a9dc9fd7300d) · [SVG](figures/edx-si-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(d)」＋補足文字「Si K counts」。

### 元画像の作り方

SEMと同じ粒子配置からAuとSiの期待計数を作り、標準偏差48 nmの空間ぼけとPoisson計数ノイズを加えた。

Auは粒子部分、Siは基板部分が優勢。各色の表示上限はAu 30 counts/px、Si 22 counts/px。別々の表示スケールなので色の明るさを元素間の濃度比較に使わない。

EDXは画素ごとの特性X線計数を表すという[JEOLの元素マッピング解説](https://www.jeol.com/words/semterms/20121024.031359.php)を参考にしました。濃度マップではありません。

<a id="edx-overlay"></a>

## EDX AuとSiの重ね合わせ

### 画像内部 個別背景あり

![EDX AuとSiの重ね合わせ 画像内 バーとラベルの個別背景あり 模擬画像](assets/edx-overlay-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-overlay-inside) · [元画像](data/edx-overlay.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-overlay-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-overlay-inside.png?v=a9dc9fd7300d) · [SVG](figures/edx-overlay-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![EDX AuとSiの重ね合わせ 画像外 バーとラベルの個別背景なし 模擬画像](assets/edx-overlay-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=edx-overlay-outside) · [元画像](data/edx-overlay.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/edx-overlay-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/edx-overlay-outside.png?v=a9dc9fd7300d) · [SVG](figures/edx-overlay-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(e)」＋補足文字「Au + Si」。

### 元画像の作り方

SEMと同じ粒子配置からAuとSiの期待計数を作り、標準偏差48 nmの空間ぼけとPoisson計数ノイズを加えた。

Auは粒子部分、Siは基板部分が優勢。各色の表示上限はAu 30 counts/px、Si 22 counts/px。別々の表示スケールなので色の明るさを元素間の濃度比較に使わない。

EDXは画素ごとの特性X線計数を表すという[JEOLの元素マッピング解説](https://www.jeol.com/words/semterms/20121024.031359.php)を参考にしました。濃度マップではありません。

<a id="afm-grains"></a>

## AFM ナノ粒状表面

### 画像内部 個別背景あり

![AFM ナノ粒状表面 画像内 バーとラベルの個別背景あり 模擬画像](assets/afm-grains-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-grains-inside) · [元画像](data/afm-grains.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/afm-grains-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/afm-grains-inside.png?v=a9dc9fd7300d) · [SVG](figures/afm-grains-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![AFM ナノ粒状表面 画像外 バーとラベルの個別背景なし 模擬画像](assets/afm-grains-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-grains-outside) · [元画像](data/afm-grains.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/afm-grains-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/afm-grains-outside.png?v=a9dc9fd7300d) · [SVG](figures/afm-grains-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(f)」＋補足文字「Height: 0–60 nm」。

### 元画像の作り方

相関した基板粗さに多数の高さピークを加え、半径12 nmの放物面探針による形態学的膨張と高さノイズを適用した。

画像768×768 px、4 nm/px、視野3.072 µm角。カラーマップmagma、共通範囲0–60 nm。高さカラーバーは付けていない。

<a id="afm-terraces"></a>

## AFM 段差を持つ表面

### 画像内部 個別背景あり

![AFM 段差を持つ表面 画像内 バーとラベルの個別背景あり 模擬画像](assets/afm-terraces-inside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-terraces-inside) · [元画像](data/afm-terraces.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/afm-terraces-inside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/afm-terraces-inside.png?v=a9dc9fd7300d) · [SVG](figures/afm-terraces-inside.svg?v=a9dc9fd7300d)

### 画像外部 個別背景なし

![AFM 段差を持つ表面 画像外 バーとラベルの個別背景なし 模擬画像](assets/afm-terraces-outside.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=afm-terraces-outside) · [元画像](data/afm-terraces.png?v=a9dc9fd7300d) · [プロジェクトを保存](projects/afm-terraces-outside.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/afm-terraces-outside.png?v=a9dc9fd7300d) · [SVG](figures/afm-terraces-outside.svg?v=a9dc9fd7300d)

**校正：** 4 nm/px。バー500 nm = 元画像上125 px。両パターンの走査画像部分の大きさは同じです。

**ラベル：** 「(g)」＋補足文字「3.2 nm steps」。

### 元画像の作り方

ゆるく曲がった平行テラスに3.2 nmの段差と空間相関した小さな高さノイズを加えた。

画像768×768 px、4 nm/px、視野3.072 µm角。高さ表示0–36 nm。高さカラーバーは付けていない。ステップは特定結晶の原子層高さを意味しない。

## 補足文字を付けないラベル

SEM粒子像を使った「(a)」のみの例です。上の「(a) Au nanoparticles」と比較できます。

![SEM パネル記号のみ 個別背景あり 模擬画像](assets/sem-label-only.png?v=a9dc9fd7300d)

[Web版で開く](https://murajun620-crypto.github.io/Microscopy_figure_tools_web/?gallery=sem-label-only) · [プロジェクトを保存](projects/sem-label-only.mifito?v=a9dc9fd7300d) · [PNG 600 dpi](figures/sem-label-only.png?v=a9dc9fd7300d) · [SVG](figures/sem-label-only.svg?v=a9dc9fd7300d)

## 数値データと表示の注意点

- [粒子配置と投影径CSV](data/particle_ground_truth.csv?v=a9dc9fd7300d)：SEM粒子モデルの真値。画像から測定した結果ではありません。
- [EDX計数データ](data/edx_counts.npz?v=a9dc9fd7300d)：AuとSiのPoisson計数配列。色画像は可視化用で、定量濃度を意味しません。
- [AFM高さデータ nm](data/afm_heights_nm.npz?v=a9dc9fd7300d)：grainとterraceの高さ配列。NPZは解析用の数値データで、MiFiToに開くときは各PNGを使います。
- [AFM断面CSV](data/afm_line_profiles.csv?v=a9dc9fd7300d)：粒状高さマップから抽出した2断面。
- AFMは高さカラーバーなし。元画像全体が768×768 pxの走査領域で、校正は4 nm/pxです。高さ表示範囲は生成条件に記載しています。
- バーとパネルラベルの文字サイズはWeb版の標準9%。内部配置の個別背景は不透明度72%。図中文字と線を見やすくする背景です。画像そのものの背景を塗り替える設定ではありません。
- 画像外の余白を除いた画像領域は両パターンで同じ大きさです。PNG 600 dpiは保存時の印刷指定で、元画像の解像度を増やしません。

図中文字は通常書体。保存幅8.9 cm、PNG 600 dpi、SVGは元の画像にベクトルのバーとラベルを重ねて保存しています。[Natureの最終図版ガイド](https://www.nature.com/documents/NRJs-guide-to-preparing-final-artwork.pdf)にあるスケール表示と判読性の方針を参考にしました。

乱数の初期値は20261004。掲載図のPNG・SVGは、全15プロジェクトをMiFiTo Web v1.1.1のアプリ画面で開き、保存ボタンから出力しました。元画像と校正・バー・ラベル設定は各プロジェクトに同梱しています。端末により使用できるフォントに差がある場合、文字の幅は変わることがあります。
