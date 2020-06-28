---
title: Workaround in NodeJS for SVG og:image not being supported
url: twitter-og-image-svg
id: 33
tags:
  - javascript
  - react
  - nodejs
author: Damian Terlecki
date: 2020-06-28T20:00:00
---

The `og:image` is an attribute of the Open Graph protocol that allows us to define the image that will appear when linking our site on social media. In the absence of it, we rely on the algorithms of the social website. Instead of the expected graphics, next to the text we by default we can expect either a placeholder or a random (usually first) image detected by the site crawler.

If our site is linked on social networking sites, it is worth spending some time to correctly set the tags of the Open Graph protocol. For example, we would not like Facebook to pull out a picture of the advertisement displayed in our article. Instead, we would aim for sharing any catchy and relevant image or logo.

<img src="/img/hq/social-svg-share.svg" alt="Share an article with an SVG image" title="Share an article with an SVG image">


In the case of my blog, the list of supported image types turned out to be a teeny-weeny problem. While JPEG and PNG formats are easily displayed by Twitter and Facebook, the issue is with unsupported SVG format. In this format (and other less popular ones like TIFF), placeholder appears next to the text instead of the actual picture.

Due to the fact that SVG is a vector graphics format, it allows us to obtain a much smaller size compared to the PNG format. Depending on the situation, we can count on savings in the range [from 60% to 80% of the size] (https://vecta.io/blog/comparing-svg-and-png-file-sizes). Of course, there are also cases where our SVG image will weigh a ton (hand-embedded fonts), so it's always worth choosing the right format for what you need.

Ze względu na to, że SVG jest formatem grafiki wektorowej, pozwala na uzyskanie znacznie mniejszego rozmiaru w porównaniu do formatu PNG. W zależności od sytuacji, możemy liczyć na oszczędności w zakresie [od 60% do 80% rozmiaru](https://vecta.io/blog/comparing-svg-and-png-file-sizes). Oczywiście są też przypadki gdzie nasz obrazek SVG będzie ważył tonę (ręcznie osadzone czcionki), dlatego zawsze warto dobierać odpowiedni format do tego co potrzebujemy (format SVG ma również inne zalety).

These and other advantages of the SVG format make me reach for it from time to time. So what if I wanted to use SVG and at the same time ensure that the images display correctly on social media?

## SVG to JPEG/PNG

The simplest solution is to convert/generate the image in one of the supported types. We can do it manually, but it is tiring and it is easy to forget. If our application was written (or at least part of it − SSR/SSG) in **NodeJS**, we can use one of the popular image conversion plugins for this purpose.

### svg2img

The first module I found was the [node-svg2img](https://www.npmjs.com/package/svg2img) converter. The straightforward interface (v0.7) allowed me to implement the conversion of SVG to JPG images quite quickly on NodeJS 12:

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

Unfortunately, in my case, some of the generated images were not drawn properly. The main problem was the images generated using PlantUML, specifically the incorrect background color and diagrams. Actually, the other images were quite fine. As I understand, the SVG conversion requires some native libraries, it's possible that my environment was not compatible.

<img src="/img/hq/svg2img-background-problems.jpg" alt="svg2img − conversion of SVG PlantUML diagram" title="svg2img − conversion of SVG PlantUML diagram">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp) is probably the most popular image conversion module in NodeJS and at the same the second option chosen by me. At the same time, this does not mean that it was trouble-free. The plus was of course an equally simple interface. Let's get to work − some implementation adjustment and...

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

Hmm, that's not how it was supposed to work. A quick search of the problem in the module repository gave me the answer that the error is specific for [generating text with multiple threads on Windows](https://github.com/lovell/sharp/issues/1162). Unfortunately, I could not solve the problem simply by converting the code into synchronous processing with `async / await`.

Undoubtedly, the process of building a production version on Linux, where the error does not occur, is salvation here. In addition, Netlify hosting allows me to use the functionality of deploying test versions with pull requests. This solution is sufficient to test the display of images on social media, thus the possibility of local conversion is fortunately unnecessary for me.

### NodeJS

Finally, the conversion should be connected to the building process itself. In the case of the React-static (v7.x) SSG (Static Site Generator), this can be done using the script `node.api.js` located at the root of the project. All we neet to do is to bind our function to one of the build phases (e.g. *afterExport*):

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

Actually, we can hook the execution of our script in `package.json` right after the build, which should also work with **other generators**.
After rebuilding, each SVG image should have its equivalent with the JPEG extension. We can then reference them in `og:image`/`twitter:image` attributes.
