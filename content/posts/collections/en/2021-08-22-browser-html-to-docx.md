---
title: How to convert HTML to DOCX in the browser
url: html-na-docx-w-przeglądarce
id: 73
tags:
  - javascript
author: Damian Terlecki
date: 2021-08-22T20:00:00
---

DOCX is a file format commonly associated with Microsoft Word. However, not everyone might be aware that this is a standardized open format,
not limited by any license. Implemented according to the Office Open XML (OOXML) specification, DOCX shares the similar structure with
presentation files (PPTX) and spreadsheets (XSLX). Interestingly, a file compatible with the OOXML format is actually
an archive of related XML files. We can easily verify this by unpacking any DOCX file:

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

After unpacking, in the *word* folder we will find XML files, among others responsible for styles (*styles.xml*), document content (*document.xml*) with
references (*_rels/document.xml.rels*) to various resources (*media/\**), e.g. images.

## HTML to DOCX conversion – document building or *altChunks*?

There are actually two approaches to converting an HTML document to DOCX.
We can build such a document by converting individual HTML tags and styles to their equivalents in DOCX format
or use <i>altChunk</i> feature.

<img src="/img/hq/html-to-docx.png" alt="An example of an HTML document displayed in Google Docs exported to DOCX using html-to-docx" title="An example of an HTML document displayed in Google Docs exported to DOCX using html-to-docx">

The first approach is understandable, but what is *altChunk*?
The ***altchunk*** element is simply a pointer to a file whose contents will be processed and imported into the document by
the application (e.g. Microsoft Word) that [supports the indicated format](https://docs.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/c391c28f-1b03-4a21-a4f8-4d9cddd4a95c).
This option doesn't give much control over the resulting document.

Among the most popular applications that are able to display the DOCX format, only Microsoft Word will correctly display
a document built using *altChunk*. In the LibreOffice Writer, Apache OpenOffice Writer, and Google Docs we will see a
blank document. Note this when choosing or implementing a conversion from HTML to OOXML.

## Client side conversion

When it comes to web applications, the undoubted advantage of feature feasibility is the possibility of implementation on the client's (browser) side.
This method reduces server-side processing and delegates the work to the client, making the application more scalable and closer to a distributed system.
Converting an HTML file to DOCX, despite being familiar with the structure of the OOXML format, is not an easy task.

Among the available solutions, however, we have a choice of two libraries written in JavaScript that implement this complicated process.
A solution based on *altChunk* feature can be found in a slightly older [html-docx-js](https://github.com/evidenceprime/html-docx-js) project.
On the other hand, tag and style conversion is used in a more recent [html-to-docx](https://github.com/privateOmega/html-to-docx) library.

### html-docx-js

Using the *html-docx-js* library is really simple. All we need to do is add [this script](https://github.com/evidenceprime/html-docx-js/blob/master/dist/html-docx.js) to our website.
If you are using the *npm* package manager, you can find the library under the same name and install it with the [`npm i html-docx-js`](https://www.npmjs.com/package/html-docx-js) command.
It is worth mentioning that *html-docx-js* will also work on the server-side. But let's see how we can use it the browser:

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

After the page is loaded, it will be converted to DOCX format and saved under the download *href* *blob* link.
The unpacked DOCX archive will contain a folder with, among others, the *word/document.xml* file:

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

The actual content of the document can be found under the reference to the *word/afchunk.mht*:

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

Moreover, in case of the images, it will be necessary to first convert them to the *base64* form [(example)](https://github.com/evidenceprime/html-docx-js/blob/master/test/sample.html).

### html-to-docx

Converting HTML by building a document is a complicated process that the *html-to-docx* library does best. In the latest version 1.2.2,
we will also find some support for generating documents in the browser. Using *npm*, install the module with the [`npm i html-to-docx`](https://www.npmjs.com/package/html-to-docx)
command.
Here comes the harder step, importing the library on the website is not so straightforward as in the previous case.

In the *./node_modules/html-to-docx/dist/* folder we find two *html-to-docx.[esm|umd].js* files, which we can load on the website.
The source of the problem turns out to be, the dependency on other CJS type modules. 
This type requires transpilation before loading it into the browser, and unfortunately, these modules are not bundled with the library.
Often it is not a problem. If we already use some kind of a bundler, loading the library usually does not require additional steps.

To familiarize ourselves with this topic, let's see how to build a browser script from scratch.
One of the quickest solutions here is to install the webpack bundler: `npm i webpack webpack-cli --save-dev`.
Its latest version does not require any additional configuration. Then in the *src/index.js* file add the code referencing the installed library:

```javascript
import HTMLtoDOCX from "html-to-docx/dist/html-to-docx.umd"

const link = document.getElementById("download")
HTMLtoDOCX(document.documentElement.outerHTML)
    .then(blob => {
        link.href = URL.createObjectURL(blob)
    })
```

Next add the polyfills for necessary features that are not implemented in browsers: `npm i util url buffer`.
Finally, build the code bundle with the `npx webpack` command. The HTML file will look like this:

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

Meanwhile, the *word/document.xml*, after running the conversion in the browser, will contain specific word processing tags and styles:

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

Similar to *html-docx-js* the images will have to be converted to *base64* format.
Additionally, in the current version, you will have to keep them out of some [specific tags](https://github.com/privateOmega/html-to-docx/issues/41),
otherwise, they might not be displayed.

## Summary

The JavaScript *html-docx-js* and *html-to-docx* libraries allow you to convert HTML documents to DOCX in two different ways.
The DOCX format itself is not so complicated and you can viev or create your own document in the form of an XML files archive.
When used in production, it is worth remembering that you will not always get the same result in every application that displays the OOXML format
due to implementation differences (e.g. images anchoring in LibreOffice and Microsoft Word).

Do not forget to convert relevant images to the *base64* format. In case of problems with referencing external
resources e.g. for complex SVG references you can consider the [canvg](https://github.com/canvg/canvg) library.
For other maybe unsupported elements, quite an interesting approach is to try to render as an image using
[html2canvas](https://html2canvas.hertzen.com/). Do also consider contributing to the above-mentioned projects in case you find a fix to any of the
encountered problems.