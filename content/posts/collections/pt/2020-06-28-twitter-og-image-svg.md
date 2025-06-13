---
title: Solução em NodeJS para og:image SVG não suportado
url: twitter-og-image-svg-solucao
id: 33
category:
- javascript: JS
tags:
- reactjs
- nodejs
author: Damian Terlecki
date: 2020-06-28T20:00:00
---

O `og:image` é um atributo do protocolo Open Graph que nos permite definir a imagem que aparecerá ao vincular nosso site nas redes sociais. Na ausência dele, contamos com os algoritmos do site social. Em vez dos gráficos esperados, ao lado do texto, podemos esperar, por padrão, um placeholder ou uma imagem aleatória (geralmente a primeira) detectada pelo crawler do site.

Se nosso site é vinculado em redes sociais, vale a pena gastar algum tempo para configurar corretamente as tags do protocolo Open Graph. Por exemplo, não gostaríamos que o Facebook extraísse uma imagem do anúncio exibido em nosso artigo. Em vez disso, nosso objetivo seria compartilhar qualquer imagem ou logotipo cativante e relevante.

<img src="/img/hq/social-svg-share.svg" alt="Compartilhar um artigo com uma imagem SVG" title="Compartilhar um artigo com uma imagem SVG">


No caso do meu blog, a lista de tipos de imagem suportados acabou sendo um pequeno problema. Enquanto os formatos JPEG e PNG são facilmente exibidos pelo Twitter e Facebook, o problema está no formato SVG não suportado. Neste formato (e em outros menos populares como TIFF), um placeholder aparece ao lado do texto em vez da imagem real.

Devido ao fato de o SVG ser um formato de gráficos vetoriais, ele nos permite obter um tamanho muito menor em comparação com o formato PNG. Dependendo da situação, podemos contar com economias na faixa de [60% a 80% do tamanho](https://vecta.io/blog/comparing-svg-and-png-file-sizes). Claro, também há casos em que nossa imagem SVG pesará uma tonelada (fontes embutidas manualmente), então vale sempre a pena escolher o formato certo para o que você precisa.

Essas e outras vantagens do formato SVG me fazem recorrer a ele de vez em quando. Então, e se eu quisesse usar SVG e, ao mesmo tempo, garantir que as imagens sejam exibidas corretamente nas redes sociais?

## SVG para JPEG/PNG

A solução mais simples é converter/gerar a imagem em um dos tipos suportados. Podemos fazer isso manualmente, mas é cansativo e fácil de esquecer. Se nossa aplicação foi escrita (ou pelo menos parte dela − SSR/SSG) em **NodeJS**, podemos usar um dos plugins populares de conversão de imagem para este propósito.

### svg2img

O primeiro módulo que encontrei foi o conversor [node-svg2img](https://www.npmjs.com/package/svg2img). A interface direta (v0.7) me permitiu implementar a conversão de imagens SVG para JPG de forma bastante rápida no NodeJS 12:

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

Infelizmente, no meu caso, algumas das imagens geradas não foram desenhadas corretamente. O principal problema foram as imagens geradas usando PlantUML, especificamente a cor de fundo e os diagramas incorretos. Na verdade, as outras imagens estavam boas. Pelo que entendi, a conversão de SVG requer algumas bibliotecas nativas, é possível que meu ambiente não fosse compatível.

<img src="/img/hq/svg2img-background-problems.jpg" alt="svg2img – conversão de diagrama PlantUML SVG" title="svg2img – conversão de diagrama PlantUML SVG">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp) é provavelmente o módulo de conversão de imagem mais popular em NodeJS e, ao mesmo tempo, a segunda opção escolhida por mim. Ao mesmo tempo, isso não significa que não teve problemas. O ponto positivo foi, claro, uma interface igualmente simples. Vamos ao trabalho − alguns ajustes na implementação e...

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

Hmm, não era assim que deveria funcionar. Uma busca rápida do problema no repositório do módulo me deu a resposta de que o erro é específico para [gerar texto com múltiplos threads no Windows](https://github.com/lovell/sharp/issues/1162). Infelizmente, não consegui resolver o problema simplesmente convertendo o código para processamento síncrono com `async / await`.

Sem dúvida, o processo de construção de uma versão de produção no Linux, onde o erro não ocorre, é a salvação aqui. Além disso, a hospedagem Netlify me permite usar a funcionalidade de implantar versões de teste com pull requests. Esta solução é suficiente para testar a exibição de imagens nas redes sociais, assim, a possibilidade de conversão local é felizmente desnecessária para mim.

### Build

Finalmente, a conversão deve ser conectada ao próprio processo de construção. No caso do SSG (Static Site Generator) React-static (v7.x), isso pode ser feito usando o script `node.api.js` localizado na raiz do projeto. Tudo o que precisamos fazer é vincular nossa função a uma das fases de construção (por exemplo, *afterExport*):

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

Na verdade, podemos enganchar a execução do nosso script no `package.json` logo após a construção, o que também deve funcionar com **outros geradores**. Depois de reconstruir, cada imagem SVG deve ter seu equivalente com a extensão JPEG. Podemos então referenciá-las nos atributos `og:image`/`twitter:image`.
