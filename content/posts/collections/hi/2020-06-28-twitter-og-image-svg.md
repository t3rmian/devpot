---
title: SVG og:image समर्थित न होने पर NodeJS में समाधान
url: twitter-og-image-svg-समर्थित-नहीं
id: 33
category:
- javascript: जेएस
tags:
- रिएक्टजेएस
- नोडजेएस
author: Damian Terlecki
date: 2020-06-28T20:00:00
---

`og:image` ओपन ग्राफ़ प्रोटोकॉल की एक विशेषता है जो हमें उस छवि को परिभाषित करने की अनुमति देती है जो सोशल मीडिया पर हमारी साइट को लिंक करते समय दिखाई देगी। इसके अभाव में, हम सोशल वेबसाइट के एल्गोरिदम पर निर्भर करते हैं। अपेक्षित ग्राफिक्स के बजाय, पाठ के आगे हम डिफ़ॉल्ट रूप से या तो एक प्लेसहोल्डर या साइट क्रॉलर द्वारा खोजी गई एक यादृच्छिक (आमतौर पर पहली) छवि की उम्मीद कर सकते हैं।

यदि हमारी साइट सोशल नेटवर्किंग साइटों पर लिंक की जाती है, तो ओपन ग्राफ़ प्रोटोकॉल के टैग को सही ढंग से सेट करने के लिए कुछ समय बिताना उचित है। उदाहरण के लिए, हम नहीं चाहेंगे कि फेसबुक हमारे लेख में प्रदर्शित विज्ञापन की तस्वीर निकाले। इसके बजाय, हमारा लक्ष्य किसी भी आकर्षक और प्रासंगिक छवि या लोगो को साझा करना होगा।

<img src="/img/hq/social-svg-share.svg" alt="एक SVG इमेज के साथ एक लेख साझा करें" title="एक SVG इमेज के साथ एक लेख साझा करें">


मेरे ब्लॉग के मामले में, समर्थित छवि प्रकारों की सूची एक छोटी सी समस्या बन गई। जबकि जेपीईजी और पीएनजी प्रारूप ट्विटर और फेसबुक द्वारा आसानी से प्रदर्शित किए जाते हैं, समस्या असमर्थित एसवीजी प्रारूप के साथ है। इस प्रारूप (और टीआईएफएफ जैसे अन्य कम लोकप्रिय प्रारूपों) में, वास्तविक तस्वीर के बजाय पाठ के आगे प्लेसहोल्डर दिखाई देता है।

इस तथ्य के कारण कि एसवीजी एक वेक्टर ग्राफिक्स प्रारूप है, यह हमें पीएनजी प्रारूप की तुलना में बहुत छोटा आकार प्राप्त करने की अनुमति देता है। स्थिति के आधार पर, हम [आकार में 60% से 80% तक] (https://vecta.io/blog/comparing-svg-and-png-file-sizes) की बचत की उम्मीद कर सकते हैं। बेशक, ऐसे भी मामले हैं जहां हमारी एसवीजी छवि का वजन एक टन होगा (हाथ से एम्बेडेड फोंट), इसलिए आपको जो चाहिए उसके लिए सही प्रारूप चुनना हमेशा उचित होता है।

एसवीजी प्रारूप के ये और अन्य फायदे मुझे समय-समय पर इसका उपयोग करने के लिए प्रेरित करते हैं। तो क्या होगा अगर मैं एसवीजी का उपयोग करना चाहता हूं और साथ ही यह सुनिश्चित करना चाहता हूं कि छवियां सोशल मीडिया पर सही ढंग से प्रदर्शित हों?

## SVG से JPEG/PNG

सबसे सरल समाधान समर्थित प्रकारों में से किसी एक में छवि को परिवर्तित/उत्पन्न करना है। हम इसे मैन्युअल रूप से कर सकते हैं, लेकिन यह थकाऊ है और भूलना आसान है। यदि हमारा एप्लिकेशन **NodeJS** में लिखा गया था (या कम से-कम इसका एक हिस्सा - SSR/SSG), तो हम इस उद्देश्य के लिए लोकप्रिय छवि रूपांतरण प्लगइन्स में से एक का उपयोग कर सकते हैं।

### svg2img

पहला मॉड्यूल जो मुझे मिला वह [node-svg2img](https://www.npmjs.com/package/svg2img) कनवर्टर था। सीधे-सादे इंटरफ़ेस (v0.7) ने मुझे NodeJS 12 पर SVG से JPG छवियों के रूपांतरण को काफी तेज़ी से लागू करने की अनुमति दी:

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

दुर्भाग्य से, मेरे मामले में, कुछ उत्पन्न छवियां ठीक से नहीं खींची गई थीं। मुख्य समस्या PlantUML का उपयोग करके उत्पन्न छवियां थीं, विशेष रूप से गलत पृष्ठभूमि रंग और आरेख। वास्तव में, अन्य छवियां काफी ठीक थीं। जैसा कि मैं समझता हूं, एसवीजी रूपांतरण के लिए कुछ देशी पुस्तकालयों की आवश्यकता होती है, यह संभव है कि मेरा वातावरण संगत नहीं था।

<img src="/img/hq/svg2img-background-problems.jpg" alt="svg2img – SVG PlantUML डायग्राम का रूपांतरण" title="svg2img – SVG PlantUML डायग्राम का रूपांतरण">

### Sharp

[Sharp](https://www.npmjs.com/package/sharp) शायद NodeJS में सबसे लोकप्रिय छवि रूपांतरण मॉड्यूल है और साथ ही मेरे द्वारा चुना गया दूसरा विकल्प है। साथ ही, इसका मतलब यह नहीं है कि यह परेशानी मुक्त था। प्लस निश्चित रूप से एक समान रूप से सरल इंटरफ़ेस था। काम पर लग जाते हैं - कुछ कार्यान्वयन समायोजन और...

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

हम्म, यह ऐसा नहीं होना चाहिए था। मॉड्यूल रिपॉजिटरी में समस्या की एक त्वरित खोज ने मुझे जवाब दिया कि त्रुटि [विंडोज पर कई थ्रेड के साथ पाठ उत्पन्न करने](https://github.com/lovell/sharp/issues/1162) के लिए विशिष्ट है। दुर्भाग्य से, मैं कोड को `async / await` के साथ सिंक्रोनस प्रोसेसिंग में परिवर्तित करके समस्या को हल नहीं कर सका।

निस्संदेह, लिनक्स पर उत्पादन संस्करण बनाने की प्रक्रिया, जहां त्रुटि नहीं होती है, यहां उद्धार है। इसके अलावा, नेटलिफाई होस्टिंग मुझे पुल अनुरोधों के साथ परीक्षण संस्करणों को तैनात करने की कार्यक्षमता का उपयोग करने की अनुमति देती है। यह समाधान सोशल मीडिया पर छवियों के प्रदर्शन का परीक्षण करने के लिए पर्याप्त है, इस प्रकार स्थानीय रूपांतरण की संभावना सौभाग्य से मेरे लिए अनावश्यक है।

### निर्माण (Build)

अंत में, रूपांतरण को निर्माण प्रक्रिया से ही जोड़ा जाना चाहिए। React-static (v7.x) SSG (स्टैटिक साइट जेनरेटर) के मामले में, यह प्रोजेक्ट के रूट पर स्थित स्क्रिप्ट `node.api.js` का उपयोग करके किया जा सकता है। हमें बस अपने फ़ंक्शन को निर्माण चरणों में से एक से बांधना है (जैसे *afterExport*):

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

वास्तव में, हम अपने स्क्रिप्ट के निष्पादन को `package.json` में बिल्ड के ठीक बाद हुक कर सकते हैं, जो **अन्य जेनरेटर** के साथ भी काम करना चाहिए। पुनर्निर्माण के बाद, प्रत्येक SVG छवि का JPEG एक्सटेंशन के साथ अपना समकक्ष होना चाहिए। फिर हम उन्हें `og:image`/`twitter:image` विशेषताओं में संदर्भित कर सकते हैं।

