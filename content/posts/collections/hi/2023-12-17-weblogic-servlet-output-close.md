---
title: WebLogic के सर्वलेट्स में न बंद होने वाला आउटपुट स्ट्रीम
url: वेब्लॉजिक-सर्वलेट-आउटपुट-क्लोज
id: 122
category:
- jee: जेईई
tags:
- वेब्लॉजिक
- सर्वलेट्स
author: Damian Terlecki
date: 2023-12-17T20:00:00
---

जावा में सर्वलेट आउटपुट स्ट्रीम में डेटा लिखने का प्रयास (`javax.servlet.ServletResponse` से प्राप्त),
स्ट्रीम के बंद होने के बाद, आमतौर पर विफल हो जाएगा। भले ही कोई विशिष्ट अपवाद नहीं फेंका जाता है,
ऑपरेशन को बस अनदेखा कर दिया जाएगा। आप इस व्यवहार को उदाहरण के लिए टॉमकाट सर्वर में देखेंगे।

हालांकि, WebLogic सर्वर में सर्वलेट का कार्यान्वयन टॉमकाट से ज्ञात एक से भिन्न होता है। स्ट्रीम को बंद करना,
साथ ही `PrintWriter` इंटरफ़ेस के रूप में इसका विकल्प, किसी भी ऑपरेशन के बराबर नहीं है।
आह्वान के बाद, आप अभी भी आउटपुट डेटा प्रदान कर सकते हैं, और यह अंततः क्लाइंट तक पहुंच जाएगा।

```java
import javax.servlet.ServletOutputStream;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@WebServlet(name = "HelloWorldServlet", urlPatterns = "/hello")
public class HelloWorldServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request,
                         HttpServletResponse response)
            throws IOException {
        ServletOutputStream os = response.getOutputStream();
        os.println("Hello World");
        os.flush();
        os.close();
        /*below output is not printed on the Tomcat*/
        os.println("Hello World after stream close."
                + " Is the response committed? "
                + response.isCommitted());
    }
}
```

<img src="/img/hq/weblogic-servlet-output-close.png" title="सर्वर द्वारा लौटाए गए सर्वलेट से प्रतिक्रिया" alt="सर्वर द्वारा लौटाए गए सर्वलेट की प्रतिक्रिया जिसमें आउटपुट स्ट्रीम को बंद करने के बाद भेजे गए डेटा शामिल हैं">

स्ट्रीम को बंद करने से संबंधित व्यवहार को जावा सिस्टम पैरामीटर
`-Dweblogic.http.allowClosingServletOutputStream` का उपयोग करके टॉमकाट से ज्ञात एक में बदला जा सकता है। हालांकि, यदि आप `PrintWriter`
इंटरफ़ेस का उपयोग करते हैं तो कृपया ध्यान दें कि इस ध्वज के लिए समर्थन वहां लागू नहीं किया गया है।

आप इस अनपेक्षित प्रतिक्रिया संयोजन को कई अलग-अलग तरीकों से हल कर सकते हैं:
- एक कोड संरचना (या एकीकरण कॉन्फ़िगरेशन) बनाकर जो बंद धाराओं में लिखने के प्रयास से बचेगी;
- सर्वलेट अनुरोध से जुड़े एक अस्थायी विशेषता में, लिखने से पहले स्ट्रीम स्थिति को सहेजना और सत्यापित करना;
- `HttpServletResponse`, `ServletOutputStream`, और `PrintWriter` इंटरफेस के लिए एक प्रॉक्सी/डेकोरेटर बनाना,
  `close()`, `write()`, और अन्य `print()` विधियों के कार्यान्वयन को, टॉमकाट से ज्ञात व्यवहार के साथ प्रतिस्थापित करना [(अनुरूप उदाहरण)](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging);
- प्रदाता के कार्यान्वयन पर आधारित एक "फैंसी रिफ्लेक्शन" के माध्यम से (शायद नहीं)।

इनमें से कुछ समाधान दूसरों की तुलना में बेहतर लगते हैं, लेकिन किसी विशेष एप्लिकेशन के संदर्भ में, वे अनुकूलित करने में मुश्किल साबित हो सकते हैं।

आप इस व्यवहार के प्रदाता के कार्यान्वयन को `com.oracle.weblogic.servlet.jar` लाइब्रेरी में मानक सर्वर मॉड्यूल स्थान `/u01/oracle/wlserver/modules/` के तहत पाएंगे।
WebLogic इंस्टॉलर Oracle वेबसाइट पर उपलब्ध है, और मेरा पसंदीदा दृष्टिकोण जो एक डॉकर छवि में पूर्व-स्थापित संस्करण है,
`container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11` एक खाता बनाने और उपयोग की शर्तों को स्वीकार करने के बाद प्राप्त किया जा सकता है।
