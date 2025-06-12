---
title: サポートされていないSVG og:imageのNodeJSでの回避策
url: twitter-og-image-svg
id: 33
category:
- javascript: JS
tags:
- reactjs
- nodejs
author: Damian Terlecki
date: 2020-06-28T20:00:00
---

`og:image`はOpen Graphプロトコルの属性で、ソーシャルメディアでサイトをリンクしたときに表示される画像を定義できます。これがない場合、ソーシャルウェブサイトのアルゴリズムに頼ることになります。期待したグラフィックの代わりに、テキストの横にはデフォルトでプレースホルダーか、サイトのクローラーが検出したランダムな（通常は最初の）画像が表示されます。

サイトがソーシャルネットワーキングサイトでリンクされる場合、Open Graphプロトコルのタグを正しく設定するために時間を費やす価値があります。例えば、Facebookが記事に表示されている広告の写真を引っ張り出してくるのは避けたいでしょう。代わりに、キャッチーで関連性のある画像やロゴを共有することを目指します。

<img src="/img/hq/social-svg-share.svg" alt="SVG画像付きの記事を共有" title="SVG画像付きの記事を共有">


私のブログの場合、サポートされている画像タイプのリストがちょっとした問題になりました。JPEGやPNG形式はTwitterやFacebookで簡単に表示されますが、問題はサポートされていないSVG形式です。この形式（およびTIFFのようなあまり人気のない他の形式）では、実際の画像の代わりにテキストの横にプレースホルダーが表示されます。

SVGはベクターグラフィック形式であるため、PNG形式と比較してはるかに小さいサイズを実現できます。状況に応じて、[サイズが60%から80%削減される] (https://vecta.io/blog/comparing-svg-and-png-file-sizes)ことを期待できます。もちろん、SVG画像が非常に重くなる場合（手動で埋め込まれたフォントなど）もあるので、常に必要なものに適した形式を選択することが重要です。

SVG形式のこれらの利点やその他の利点から、私は時々それを利用します。では、SVGを使用しつつ、ソーシャルメディアで画像が正しく表示されるようにするにはどうすればよいでしょうか？

## SVGからJPEG/PNGへ

最も簡単な解決策は、サポートされているタイプのいずれかに画像を変換/生成することです。手動で行うこともできますが、それは面倒で忘れやすいです。アプリケーションが**NodeJS**で書かれている場合（または少なくともその一部 − SSR/SSG）、この目的のために人気のある画像変換プラグインの1つを使用できます。

### svg2img

最初に見つけたモジュールは、[node-svg2img](https://www.npmjs.com/package/svg2img)コンバーターでした。簡単なインターフェース（v0.7）のおかげで、NodeJS 12でSVGからJPG画像への変換をかなり迅速に実装できました。

```js
import fs from "fs";
import svg2img from "svg2img";

async function generateThumbnails(DIST) {
  const root = DIST + "/img/hq/";
  const dir = fs.opendirSync(root);
  let entry;
  while ((entry = dir.readSync()) !== null) {
    const inputFilePath = root + entry.name;
    if (inputFilePath.endsWith(".svg")) {
      console.debug(
        "Found a SVG image applicable for conversion: " + inputFilePath
      );

      await svg2img(inputFilePath, { format: "jpg", quality: 100 }, function (
        error,
        buffer
      ) {
        const outputFilePath =
          inputFilePath.substring(0, inputFilePath.length - 3) + "jpg";
        if (error !== null) {
          console.error(
            "Encountered error during conversion of: " +
              inputFilePath +
              " -> " +
              outputFilePath +
              ": " +
              error
          );
          return;
        }
        fs.writeFileSync(outputFilePath, buffer);
        console.info("Converted: " + inputFilePath + " -> " + outputFilePath);
      });
    }
  }
  dir.closeSync();
}
```

残念ながら、私の場合、生成された画像の一部が正しく描画されませんでした。主な問題は、PlantUMLを使用して生成された画像で、特に背景色とダイアグラムが正しくありませんでした。実際、他の画像はかなり良好でした。私が理解するところでは、SVG変換にはいくつかのネイティブライブラリが必要であり、私の環境が互換性がなかった可能性があります。

<img src="/img/hq/svg2img-background-problems.jpg" alt="svg2img − SVG PlantUMLダイアグラムの変換" title="svg2img − SVG PlantUMLダイアグラムの変換">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp)は、おそらくNodeJSで最も人気のある画像変換モジュールであり、同時に私が選んだ2番目のオプションです。同時に、これが問題なかったわけではありません。プラス点はもちろん、同様にシンプルなインターフェースでした。早速作業に取り掛かりましょう − いくつかの実装調整と...

```javascript
import fs from "fs";
import sharp from "sharp";

function generateThumbnails(DIST) {
  const root = DIST + "/img/hq/";
  const dir = fs.opendirSync(root);
  let entry;
  while ((entry = dir.readSync()) !== null) {
    const inputFilePath = root + entry.name;
    if (inputFilePath.endsWith(".svg")) {
      const outputFilePath =
        inputFilePath.substring(0, inputFilePath.length - 3) + "jpeg";
      console.debug(
        "Found a SVG image applicable for conversion: " + inputFilePath
      );
      sharp(inputFilePath)
        .jpeg({
          quality: 100,
          chromaSubsampling: "4:4:4",
        })
        .toFile(outputFilePath)
        .then(function () {
          console.info("Converted: " + inputFilePath + " -> " + outputFilePath);
        })
        .catch(function (err) {
          console.error(
            "Encountered error during conversion of: " +
              inputFilePath +
              " -> " +
              outputFilePath +
              ": " +
              err
          );
        });
    }
  }
}
```

> (sharp:14808): Pango-WARNING **: 21:25:18.422: couldn't load font "sans-serif Bold Not-Rotated 13", falling back to "Sans Bold Not-Rotated 13", expect ugly output.  
> (sharp:14808): Pango-WARNING **: 21:25:18.424: couldn't load font "Sans Bold Not-Rotated 13", falling back to "Sans Not-Rotated 13", expect ugly output.  
> (sharp:14808): Pango-WARNING \*\*: 21:25:18.435: All font fallbacks failed!!!!

うーん、これは意図したようには動作しませんでした。モジュールリポジトリで問題を素早く検索したところ、このエラーは[Windowsで複数のスレッドでテキストを生成する場合](https://github.com/lovell/sharp/issues/1162)に特有のものであるという答えを得ました。残念ながら、コードを`async / await`で同期処理に変換するだけでは問題を解決できませんでした。

間違いなく、エラーが発生しないLinuxで本番バージョンをビルドするプロセスがここでの救いです。さらに、Netlifyホスティングでは、プルリクエストでテストバージョンをデプロイする機能を使用できます。このソリューションは、ソーシャルメディアでの画像の表示をテストするには十分であり、したがって、ローカルでの変換の可能性は幸いにも私には不要です。

### ビルド

最後に、変換をビルドプロセス自体に接続する必要があります。React-static（v7.x）SSG（Static Site Generator）の場合、これはプロジェクトのルートにあるスクリプト`node.api.js`を使用して行うことができます。必要なのは、ビルドフェーズの1つ（例えば*afterExport*）に私たちの関数をバインドすることだけです。

```javascript
export default (options = {}) => ({
  afterExport: async state => {
    const {
      config: {
        paths: { DIST }
      },
      staging
    } = state;
    generateThumbnails(DIST);
  }
}
```

実際には、`package.json`でビルド直後にスクリプトの実行をフックすることもできます。これは**他のジェネレーター**でも機能するはずです。
再ビルド後、各SVG画像はJPEG拡張子を持つ同等のものを持つはずです。その後、`og:image`/`twitter:image`属性でそれらを参照できます。

