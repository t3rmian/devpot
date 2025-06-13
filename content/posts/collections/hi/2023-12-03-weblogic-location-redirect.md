---
title: WebLogic पर सर्वलेट रीडायरेक्शन प्रोटोकॉल
url: वेब्लॉजिक-सर्वलेट-रीडायरेक्ट-https
id: 121
category:
- jee: जेईई
tags:
- वेब्लॉजिक
- सर्वलेट्स
author: Damian Terlecki
date: 2023-12-03T20:00:00
---


वेब विकास में, ब्राउज़र स्वचालित रूप से रीडायरेक्ट करता है जब उसे कुछ
HTTP स्टेटस कोड के लिए "Location" हेडर के साथ एक प्रतिक्रिया मिलती है। कोड जो स्वचालित रीडायरेक्शन को ट्रिगर करते हैं, वे 3 से शुरू होते हैं। जावा सर्वलेट एपीआई का उपयोग करते समय, यानी, `javax.servlet.http.HttpServletResponse.sendRedirect(String)`, यह
आमतौर पर एक 302 होगा।

जब आप अपने सर्वलेट एप्लिकेशन को टॉमकाट जैसी किसी चीज़ से WebLogic में माइग्रेट करते हैं, तो आपको एक
अजीब बात का सामना करना पड़ सकता है जो "Location" हेडर को एक पूर्ण URL में मूल्यांकित करने का कारण बनता है। दुर्भाग्य से, यह एक रिवर्स-प्रॉक्सी के साथ अच्छा नहीं हो सकता है जो SSL को समाप्त करता है और HTTP पोर्ट पर WebLogic से कनेक्ट होता है।

<img src="/img/hq/browser-mixed-content.png" title="ब्राउज़र उन अनुरोधों को ब्लॉक कर देंगे जो संसाधनों को शामिल करते समय या AJAX का उपयोग करते समय मिश्रित-सामग्री त्रुटियों के साथ HTTPS डाउनग्रेड का कारण बनते हैं" alt="वेब ब्राउज़र वेबसाइटों को ब्राउज़ करते समय उपयोगकर्ताओं की सुरक्षा और गोपनीयता बढ़ाने के लिए मिश्रित सामग्री को ब्लॉक करते हैं। मिश्रित सामग्री एक सुरक्षित (HTTPS) प्रोटोकॉल के साथ लोड किए गए वेब पेज को संदर्भित करती है जिसमें गैर-सुरक्षित (HTTP) तत्व होते हैं। जब एक सुरक्षित वेब पेज (HTTPS पर लोड किया गया) एक असुरक्षित कनेक्शन (HTTP) से संसाधन (जैसे चित्र, स्क्रिप्ट, स्टाइलशीट के साथ-साथ AJAX स्थान पुनर्निर्देशन) शामिल करता है, तो यह एक सुरक्षा भेद्यता बनाता है।">

## WebLogic पूर्ण URL रीडायरेक्ट

WebLogic पर सर्वलेट HTTP प्रोटोकॉल के साथ एक स्थान पर रीडायरेक्ट कर सकता है, भले ही आप HTTPS
रिवर्स प्रॉक्सी के माध्यम से कनेक्ट हों (अग्रेषित हेडर की परवाह किए बिना)।
मान लीजिए हम https://example.com/app/foo पर एक POST भेजते हैं, जो एक रिवर्स-प्रॉक्सी के पीछे से `sendRedirect("bar")` को लागू करने वाला एक WebLogic सर्वलेट होगा:

```shell
# अनुरोध हेडर (संक्षिप्तता के लिए असंबंधित हेडर को छोड़ दिया गया है)
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

रिवर्स-प्रॉक्सी से अनुरोध:
```shell
POST /app/foo HTTP/1.1
Host: [example.com]
X-forwarded-host: [example.com]
Upgrade-insecure-requests: [1]
X-forwarded-server: [example.com]
X-forwarded-for: [192.168.0.100]
X-forwarded-proto: [https]
X-forwarded-ssl: [on]
```

भले ही अग्रेषित हेडर मौजूद हैं, WebLogic HTTPS के बजाय HTTP स्थान के साथ प्रतिक्रिया करता है:
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## मिश्रित-सामग्री रीडायरेक्ट समाधान

आप इसके लिए विभिन्न समाधान पा सकते हैं:
- प्रॉक्सी पर प्रतिक्रिया हेडर को फिर से लिखें।
- एक कस्टम फ़िल्टर लागू करें जो प्रतिक्रिया हेडर को फिर से लिखेगा।
- WebLogic कंसोल में "WebLogic Plugin Enabled" विकल्प चालू करें और प्रॉक्सी पर "WL-Proxy-SSL: ON" अनुरोध हेडर जोड़ें।
- WebLogic कंसोल में WL फ्रंट एंड होस्ट और पोर्ट जोड़ें।

हालांकि, प्रदान की गई सर्वलेट लाइब्रेरी की सामग्री की जांच करने के बाद,
मुझे एहसास हुआ कि सबसे सुरक्षित और सरल समाधान रीडायरेक्शन के दौरान पूर्ण URL मूल्यांकन को अक्षम करना था।

> इसे डीबग करने के लिए, मैंने `sendRedirect()` विधि पर एक ब्रेकपॉइंट लगाया, मनमाने ढंग से `getClass().getProtectionDomain().getCodeSource().getLocation()` निष्पादित किया।
> `HttpServletResponse` कार्यान्वयन का स्थान दिए जाने पर मैंने इसे अपने IDE में क्लासपाथ में जोड़ा:
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (आधिकारिक 12.1.2.4 छवि डॉकर से)।

पता चलता है कि आप इसे `WEB-INF/weblogic.xml` वेब एप्लिकेशन डिस्क्रिप्टर में कर सकते हैं, जैसे (स्वैप करें `1.9` XSD संस्करण को एक संस्करण के साथ
[आपके WebLogic के साथ संगत](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                  http://xmlns.oracle.com/weblogic/weblogic-web-app/1.9/weblogic-web-app.xsd">
    <context-root>/app</context-root>
    <container-descriptor>
        <redirect-with-absolute-url>false</redirect-with-absolute-url>
    </container-descriptor>
</weblogic-web-app>
```

> XSD फ़ाइल से टिप्पणी: यदि redirect-with-absolute-url तत्व को गलत पर सेट किया गया है, तो सर्वलेट कंटेनर पुनर्निर्देशन में स्थान हेडर में सापेक्ष यूआरएल को पूर्ण यूआरएल में परिवर्तित नहीं करेगा।
