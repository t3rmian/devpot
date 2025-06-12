---
title: Solución en NodeJS para SVG en og:image no soportado
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

El atributo `og:image` del protocolo Open Graph nos permite definir la imagen que aparecerá al enlazar nuestro sitio en redes sociales. Si no lo configuramos, dependemos de los algoritmos de la red social. En vez de la imagen esperada, junto al texto normalmente veremos un marcador de posición o una imagen aleatoria (usualmente la primera) detectada por el crawler del sitio.

Si nuestro sitio se comparte en redes sociales, vale la pena dedicarle un rato a configurar correctamente las etiquetas de Open Graph. Por ejemplo, no queremos que Facebook muestre la imagen de un anuncio en nuestro artículo. Lo ideal es compartir una imagen llamativa y relevante o el logo.

<img src="/img/hq/social-svg-share.svg" alt="Compartir un artículo con una imagen SVG" title="Compartir un artículo con una imagen SVG">

En mi blog, la lista de tipos de imagen soportados resultó ser un pequeño problema. Mientras que los formatos JPEG y PNG se muestran sin problemas en Twitter y Facebook, el formato SVG no es soportado. En este caso (y otros menos populares como TIFF), aparece un marcador de posición en vez de la imagen real.

Como SVG es un formato vectorial, permite obtener un tamaño mucho menor comparado con PNG. Dependiendo del caso, podemos ahorrar entre [un 60% y 80% del tamaño](https://vecta.io/blog/comparing-svg-and-png-file-sizes). Por supuesto, también hay casos donde el SVG pesa mucho (por ejemplo, fuentes embebidas), así que siempre conviene elegir el formato adecuado.

Estas y otras ventajas hacen que use SVG de vez en cuando. ¿Pero qué pasa si quiero usar SVG y asegurarme de que las imágenes se vean bien en redes sociales?

## De SVG a JPEG/PNG

La solución más simple es convertir/generar la imagen en uno de los tipos soportados. Podemos hacerlo manualmente, pero es tedioso y fácil de olvidar. Si tu aplicación está escrita (o al menos parte de ella − SSR/SSG) en **NodeJS**, puedes usar uno de los plugins populares de conversión de imágenes.

### svg2img

El primer módulo que probé fue el conversor [node-svg2img](https://www.npmjs.com/package/svg2img). Su interfaz sencilla (v0.7) me permitió implementar la conversión de SVG a JPG rápidamente en NodeJS 12:

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

Por desgracia, en mi caso algunas imágenes generadas no se renderizaban bien. El principal problema eran las imágenes generadas con PlantUML, especialmente el color de fondo y los diagramas. El resto de imágenes funcionaba bastante bien. Por lo que entiendo, la conversión SVG requiere algunas librerías nativas, así que es posible que mi entorno no fuera compatible.

<img src="/img/hq/svg2img-background-problems.jpg" alt="svg2img − conversión de diagrama SVG de PlantUML" title="svg2img − conversión de diagrama SVG de PlantUML">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp) es probablemente el módulo de conversión de imágenes más popular en NodeJS y fue mi segunda opción. Eso no significa que fuera libre de problemas. La ventaja fue, por supuesto, una interfaz igual de simple. Manos a la obra − un pequeño ajuste en la implementación y...

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
> (sharp:14808): Pango-WARNING **: 21:25:18.435: All font fallbacks failed!!!!

Hmm, no era lo que esperaba. Una búsqueda rápida en el repositorio del módulo me dio la respuesta: el error es específico de [generar texto con múltiples hilos en Windows](https://github.com/lovell/sharp/issues/1162). Por desgracia, no pude solucionarlo simplemente convirtiendo el código a procesamiento síncrono con `async / await`.

Sin duda, compilar la versión de producción en Linux, donde el error no ocurre, es la salvación aquí. Además, Netlify permite desplegar versiones de prueba con pull requests. Esta solución es suficiente para probar la visualización de imágenes en redes sociales, así que la conversión local no es imprescindible para mí.

### Build

Por último, la conversión debe integrarse en el proceso de build. En el caso de React-static (v7.x) SSG (Static Site Generator), esto puede hacerse usando el script `node.api.js` en la raíz del proyecto. Solo hay que enlazar nuestra función a una de las fases del build (por ejemplo, *afterExport*):

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

De hecho, podemos enganchar la ejecución del script en el `package.json` justo después del build, lo que también funcionará con **otros generadores**.
Tras reconstruir, cada imagen SVG debería tener su equivalente en JPEG. Ya podemos referenciarlas en los atributos `og:image`/`twitter:image`.

