---
title: Konwersja HTML na DOCX w przeglądarce
url: konwersja-html-na-docx-w-przeglądarce
id: 73
tags:
  - javascript
author: Damian Terlecki
date: 2021-08-22T20:00:00
---

DOCX to format plików kojarzony z Microsoft Wordem. Nie każdy zdaje sobie jednak sprawę, że jest to ustandaryzowany format otwarty,
nieograniczony żadną licencją. W ramach specyfikacji Office Open XML (OOXML) zaimplementowane zostały również pozostałe formaty
dla przedstawiania prezentacji (PPTX) oraz arkuszy kalkulacyjnych (XSLX). Co ciekawe plik zgodny z formatem OOXML to tak naprawdę
archiwum powiązanych ze sobą plików XML. Możemy to w bardzo prosty sposób zweryfikować, rozpakowując dowolny plik DOCX:
```groovy
t3rmian@wasp:~/$ unzip "test.docx" 
Archive:  test.docx
   creating: word/
   creating: word/media/
 extracting: word/media/image-WngyOTnaQ.png  
 extracting: word/media/image-Xom8iU2nqh.png  
 extracting: word/media/image-2MiVrdV3Lg.png  
 extracting: word/media/image-u5K-49bkCE.png  
 extracting: word/media/image-AM5Ve0JASj.png  
 extracting: word/media/image-L85HC3HelY.png  
 extracting: word/media/image-TGo0ZXsleV.png  
 extracting: word/media/image-YOBg89XJk0.png  
   creating: _rels/
 extracting: _rels/.rels             
   creating: docProps/
 extracting: docProps/core.xml       
   creating: word/theme/
 extracting: word/theme/theme1.xml   
 extracting: word/document.xml       
 extracting: word/fontTable.xml      
 extracting: word/styles.xml         
 extracting: word/numbering.xml      
 extracting: word/settings.xml       
 extracting: word/webSettings.xml    
   creating: word/_rels/
 extracting: word/_rels/document.xml.rels  
 extracting: [Content_Types].xml
```

Po rozpakowaniu w folderze *word* znajdziemy pliki XML m.in. odpowiedzialne za style (*styles.xml*), zawartość dokumentu (*document.xml*) oraz 
referencje do zasobów (*_rels/document.xml.rels*), a także same zasoby, np. obrazki (*media/\**). 

## Konwersja HTML na DOCX – budowanie dokumentu czy *altChunk*?

W kontekście konwersji dokumentu HTML na format DOCX mamy właściwie dwa podejścia.
Dokument taki możemy zbudować, konwertując poszczególne tagi i style HTML na ich odpowiedniki w formacie DOCX,
bądź wykorzystać funkcjonalność *altChunk*ów.

<img src="/img/hq/html-to-docx.png" alt="Przykład dokumentu HTML w Google Docs wyeksportowanego do DOCX przy pomocy html-to-docx" title="Przykład dokumentu HTML w Google Docs wyeksportowanego do DOCX przy pomocy html-to-docx">

Pierwsze podejście jest zrozumiałe, czym jest jednak *altChunk*?
Element ***altchunk*** to po prostu wskaźnik na plik, którego zawartość będzie przeprocesowana i zaimportowana do dokumentu pod warunkiem,
że aplikacja (np. Microsoft Word) [wspiera wskazany format](https://docs.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/c391c28f-1b03-4a21-a4f8-4d9cddd4a95c).
W przypadku tej opcji nie mamy zbyt dużej kontroli nad wyjściowym rezultatem dokumentu.

Spośród najpopularniejszych aplikacji, które są w stanie wyświetlić format DOCX, jedynie Microsoft Word poprawnie zaprezentuje
dokument zbudowany przy użyciu *altChunk*ów. Zarówno w LibreOffice Writer, Apache OpenOffice Writer, jak i Google Docs zobaczymy
pusty dokument. Warto o tym pamiętać przy implementacji konwersji z formatu HTML.

## Konwersja w przeglądarce

Jeśli chodzi o aplikacje internetowe, to niewątpliwą zaletą funkcjonalności może być możliwość jej implementacji po stronie klienta (przeglądarki).
W ten sposób jesteśmy w stanie odciążyć serwer i przenieść część procesu przetwarzania danych na klienta zbliżając się do pojęcia aplikacji rozproszonej.
Konwersja pliku HTML na DOCX, mimo zaznajomienia ze strukturą formatu OOXML nie jest jednak tak prosta w implementacji.

Spośród dostępnych rozwiązań mamy jednak do wyboru dwie biblioteki napisane w języku JavaScript realizujące ten skomplikowany proces.
Rozwiązanie bazujące na funkcjonalności *altChunk*ów znajdziemy w nieco starszym projekcie [html-docx-js](https://github.com/evidenceprime/html-docx-js).
Standardową konwersję tagów i stylów wykorzystano natomiast w nowszej bibliotece o dosyć podobnej nazwie [html-to-docx](https://github.com/privateOmega/html-to-docx).
 
### html-docx-js
Wykorzystanie biblioteki *html-docx-js* jest zasadniczo proste. Wystarczy, że do naszej strony dołączymy [skrypt](https://github.com/evidenceprime/html-docx-js/blob/master/dist/html-docx.js) z naszą biblioteką.
Jeśli korzystamy z managera pakietów *npm*, bibliotekę znajdziemy pod tą samą nazwą i zainstalujemy poleceniem [`npm i html-docx-js`](https://www.npmjs.com/package/html-docx-js).
Warto wspomnieć, że *html-docx-js* zadziała również po stronie serwerowej. Zobaczmy jednak, jak możemy ją użyć stronie przeglądarki:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>html-docx-js</title>
    <script type="application/javascript" src="node_modules/html-docx-js/dist/html-docx.js"></script>
    <style>p { color: red; font-size: 2em; font-weight: bold}</style>
</head>
<body>
<p>Hello HTML</p>
<a id="download" download="test.docx">Download</a>
</body>
<script>
    const link = document.getElementById("download")
    const blob = htmlDocx.asBlob(document.documentElement.outerHTML)
    link.href = URL.createObjectURL(blob)
</script>
</html>
```

Po załadowaniu strony zostanie ona przekonwertowana do formatu DOCX i zapisana pod linkiem do pobrania. Po rozpakowaniu struktura
archiwum DOCX będzie zawierała między innymi plik *word/document.xml*:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:body>
        <w:altChunk r:id="htmlChunk" />
        <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840" w:orient="portrait" />
            <w:pgMar w:top="1440"
                     w:right="1440"
                     w:bottom="1440"
                     w:left="1440"
                     w:header="720"
                     w:footer="720"
                     w:gutter="0"/>
        </w:sectPr>
    </w:body>
</w:document>
```

Właściwą zawartość dokumentu znajdziemy natomiast pod referencją do *word/afchunk.mht*:

```xml
MIME-Version: 1.0
Content-Type: multipart/related;
    type="text/html";
    boundary="----=mhtDocumentPart"


------=mhtDocumentPart
Content-Type: text/html;
    charset="utf-8"
Content-Transfer-Encoding: quoted-printable
Content-Location: file:///C:/fake/document.html

<html lang=3D"en"><head>
    <meta charset=3D"UTF-8">
    <title>html-docx-js</title>
    <script type=3D"application/javascript" src=3D"node_modules/html-docx-js/dist/html-docx.js"></script>
    <style>p { color: red; font-size: 2em; font-weight: bold}</style>
</head>
<body>
<p>Hello HTML</p>
<a id=3D"download" download=3D"test.docx">Download</a>

<script>
    const link =3D document.getElementById("download")
    const blob =3D htmlDocx.asBlob(document.documentElement.outerHTML)
    link.href =3D URL.createObjectURL(blob)
</script></body></html>



------=mhtDocumentPart--
```

Warto nadmienić, że w przypadku obrazków, konieczne będzie uprzednie zamienienie ich do postaci *base64* [(przykład)](https://github.com/evidenceprime/html-docx-js/blob/master/test/sample.html).

### html-to-docx

Konwersja HTML poprzez budowanie dokumentu to skomplikowany proces, z którym biblioteka *html-to-docx* radzi sobie świetnie. W najnowszej wersji 1.2.2
znajdziemy również wsparcie dla generowania dokumentów w przeglądarce. Przy użyciu *npm* moduł zainstalujemy poleceniem [`npm i html-to-docx`](https://www.npmjs.com/package/html-to-docx).
Niestety zaimportowanie biblioteki na stronie nie jest już takie kolorowe.

W folderze *./node_modules/html-to-docx/dist/* znajdziemy dwa pliki *html-to-docx.[esm|umd].js*, które możemy załadować na stronie. Problemem okazuje się
jednak ich zależność od innych modułów typu CJS (wymagających transpilacji przed dołączeniem ich do witryny), a właściwie to, że nie są one
dostarczone wraz z samą biblioteką. Często nie jest to problemem. Jeśli używamy już jakiegoś bundlera, to załadowanie biblioteki praktycznie nie
będzie od nas wymagało żadnych dodatkowych kroków.

Na potrzeby zaznajomienia z tematem zobaczmy jednak jak od zera zbudować paczkę, która zadziała w przeglądarce. Najszybszym rozwiązaniem będzie zainstalowanie bundlera
*webpack*: `npm i webpack webpack-cli --save-dev`. Najnowsza jego wersja nie wymaga dodatkowej konfiguracji. Następnie w pliku *src/index.js* dodamy nasz kod:
```javascript
import HTMLtoDOCX from "html-to-docx/dist/html-to-docx.umd"

const link = document.getElementById("download")
HTMLtoDOCX(document.documentElement.outerHTML)
    .then(blob => {
        link.href = URL.createObjectURL(blob)
    })
```
Kolejnym krokiem będzie dodanie polyfilli dla części funkcjonalności, które nie są implementowane w przeglądarkach: `npm i util url buffer`.
Ostatecznie naszą paczkę z kodem zbudujemy poleceniem `npx webpack`. Plik HTML będzie wyglądał następująco:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>html-docx-js</title>
</head>
<body>
<p class="p" style="color: red; font-size: 30px; font-weight: bold">Hello HTML</p>
<a id="download" download="test.docx">Download</a>
</body>
<script>process = {}; process.env = {}</script>
<script src="dist/main.js"></script>
</html>
```

Natomiast plik *word/document.xml* będzie zawierał już właściwe tagi i style OOXML:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:cdr="http://schemas.openxmlformats.org/drawingml/2006/chartDrawing" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:ve="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml">
  <w:body>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>
      <w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
    <w:p>
      <w:pPr>
        <w:spacing w:line="240" w:lineRule="exact"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:color w:val="ff0000"/>
          <w:b/>
          <w:sz w:val="45"/>
        </w:rPr>
        <w:t xml:space="preserve">Hello HTML</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:spacing w:lineRule="exact"/>
      </w:pPr>
      <w:hyperlink r:id="rId5">
        <w:r>
          <w:rPr>
            <w:rStyle w:val="Hyperlink"/>
          </w:rPr>
          <w:t xml:space="preserve">Download</w:t>
        </w:r>
      </w:hyperlink>
    </w:p>
  </w:body>
</w:document>
```

Podobnie jak w przypadku *html-docx-js* obrazki będziemy musieli zamienić na *base64*. Dodatkowo w obecnej wersji nie wyświetlą się przy opakowaniu
w [niektóre tagi](https://github.com/privateOmega/html-to-docx/issues/41).

## Podsumowanie

Biblioteki JavaScript *html-docx-js* oraz *html-to-docx* umożliwiają konwertowanie dokumentów HTML na DOCX na dwa różne sposoby.
Sam format DOCX nie jest skomplikowany i jesteśmy w stanie podejrzeć bądź stworzyć własny dokument w postaci archiwum plików XML.
Przy produkcyjnym wykorzystaniu warto pamiętać, że nie zawsze uzyskamy taki sam rezultat w każdej aplikacji wyświetlającej format OOXML.

Przede wszystkim nasze obrazki będziemy musieli przekształcić do formatu *base64*. W przypadku problemów z odniesieniem do zewnętrznych
zasobów np. w przypadku skomplikowanych obrazów SVG można rozważyć bibliotekę [canvg](https://github.com/canvg/canvg). Inne niewspierane elementy możemy również 
spróbować wyrenderować w postaci obrazu dzięki [html2canvas](https://html2canvas.hertzen.com/), bądź zastanowić się nad kontrybucją
do wyżej wymienionych projektów.
