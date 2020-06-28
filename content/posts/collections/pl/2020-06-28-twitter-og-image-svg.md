---
title: Implementacja wsparcia SVG dla og:image
url: twitter-og-image-svg
id: 33
tags:
  - javascript
  - react
  - nodejs
author: Damian Terlecki
date: 2020-06-28T20:00:00
---

Atrybut `og:image` metadanych protokołu Open Graph umożliwia nam zdefiniowanie obrazu, który pojawi się podczas linkowania naszej strony w mediach społecznościowych. W przypadku jego braku, zdani jesteśmy na algorytmy serwisu społecznościowego. Zamiast oczekiwanej grafiki, obok tekstu możemy finalnie spodziewać się albo placeholdera, albo pierwszego lepszego obrazka wykrytego przez crawler serwisu.

Jeśli nasza strona jest linkowana w serwisach społecznościowych, to warto poświęcić chwilę czasu na poprawne ustawienie tagów protokołu Open Graph. Przykładowo, nie chcielibyśmy, żeby Facebook wyciągnął obrazek reklamy wyświetlanej w naszym artykule, zamiast grafiki przewodniej bądź logo.

<img src="/img/hq/link-social-svg.svg" alt="Udostępnianie artykułu z obrazem SVG" title="Udostępnianie artykułu z obrazem SVG">

Na moim blogu, niewielkim problemem okazała się lista obsługiwanych typów obrazków. O ile formaty JPEG i PNG są bez problemu wyświetlane przez Twittera i Facebook, to problem pojawia się w przypadku SVG. W tym formacie (oraz innych, mniej popularnych takich jak TIFF) obok tekstu pojawia się niestety placeholder zamiast właściwego zdjęcia.

Ze względu na to, że SVG jest formatem grafiki wektorowej, pozwala na uzyskanie znacznie mniejszego rozmiaru w porównaniu do formatu PNG. W zależności od sytuacji możemy liczyć na oszczędności w zakresie [od 60% do 80% rozmiaru](https://vecta.io/blog/comparing-svg-and-png-file-sizes). Oczywiście są też przypadki, gdzie nasz obrazek SVG będzie ważył tonę (ręcznie osadzone czcionki), dlatego zawsze warto dobierać odpowiedni format do tego, co potrzebujemy.

Te i inne zalety formatu SVG sprawiają, że od czasu do czasu sam po niego sięgam. Co więc, jeśli chciałbym dalej korzystać z SVG i jednocześnie zapewnić, aby obrazki poprawnie wyświetlały się w mediach społecznościowych?

## Konwersja SVG do JPEG/PNG

Najprostszym rozwiązaniem jest przekonwertowanie/wygenerowanie obrazu w jedyn ze wspieranych typów. Możemy to robić ręcznie, jest to jednak męczące i łatwo o tym zapomnieć. Jeśli nasza aplikacja chociaż w części (SSR/SSG) została napisana pod **NodeJS**, możemy do tego celu użyć jednego z popularnych pluginów do konwersji obrazów.

### svg2img

Pierwszą opcją, na którą zwróciłem uwagę, był konwerter [node-svg2img](https://www.npmjs.com/package/svg2img). Dosyć przejrzyste API (v0.7) pozwoliło mi na szybkie zaimplementowanie konwersji obrazków SVG do JPG (NodeJS 12):

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
          inputFilePath.substring(0, inputFilePath.length - 4) + ".jpg";
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
        console.debug("Converted: " + inputFilePath + " -> " + outputFilePath);
      });
    }
  }
  dir.closeSync();
}
```

Niestety w moim przypadku część wygenerowanych obrazków niezbyt nadawała się do użycia. Głównym problemem były obrazki wygenerowane przy użyciu PlantUML, a właściwie niepoprawny kolor tła bądź diagramów. Właściwie to pozostałe obrazy były ok. Jak dobrze rozumiem, konwersja SVG wymaga bibliotek natywnych, być może moje środowisko nie było kompatybilne.

<img src="/img/hq/svg2img-background-problems.jpg" loading="lazy" alt="svg2img − konwersja diagramu SVG PlantUML" title="svg2img − konwersja diagramu SVG PlantUML">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp) to prawdopodobnie najpopularniejszy moduł do konwersji obrazów w NodeJS, a zarazem druga opcja wybrana przeze mnie. Jednocześnie nie oznacza to, że jest on bezproblemowy. Plusem jest oczywiście równie prosty interfejs. Szybka podmiana implementacji i:

```js
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
          console.log("Converted: " + inputFilePath + " -> " + outputFilePath);
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

Hmm, chyba nie tak miało to działać? Szybkie wyszukanie problemu w repozytorium modułu dało mi odpowiedź, że [błąd jest specyficzny dla generowania tekstu przy wielu wątkach w systemie Windows](https://github.com/lovell/sharp/issues/1162). Niestety, nie udało mi się rozwiązać problemu poprzez przekształcenie kodu do synchronicznego przetwarzania przy pomocy `async/await`.

Niewątpliwie proces budowania wersji produkcyjnej na Linuxie, gdzie błąd nie występuje, jest tutaj zbawieniem. Dodatkowo hosting Netlify, pozwala mi wykorzystać funkcjonalność deployowania wersji testowych przy pull requestach. Takie rozwiązanie jest wystarczające do przetestowania wyświetlania obrazów w mediach społecznościowych, tym samym możliwość konwersji lokalnie jest mi na szczęście zbędna.

### React-static/NodeJS

Ostatecznie konwersję warto podpiąć do samego procesu budowania. W przypadku generator stron statycznych React-static (v7.x), można to zrealizować za pomocą skryptu `node.api.js` umieszczonego w korzeniu projektu, wpinając się do jednej z faz budowania (*afterExport*):

```js
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

Właściwie to możemy podpiąć wykonanie naszego skryptu w `package.json`, zaraz po buildzie co **powinno się sprawdzić również w przypadku innych generatorów**.
Po przebudowaniu każdy obraz SVG powinien mieć swój odpowiednik w formacie z rozszerzeniem JPEG, dlatego możemy bez pzreszkód umieścić do nich odwołania w `og:image`/`twitter:image`.
