---
title: SAAJ, CXF, Camel और SOAP क्लाइंट के नमूने
url: saaj-cxf-camel-soap-क्लाइंट
id: 107
category:
- java: जावा
tags:
- कैमल
- सीएक्सएफ
- वेब-सेवाएं
- सोप
- जैक्सबी
- एक्सएमएल
- जैक्स-डब्लूएस
- जकार्ता
author: Damian Terlecki
date: 2023-03-31T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

बड़े विरासत प्रणालियों से निपटने के दौरान जो आमतौर पर मोनोलिथिक वास्तुकला की ओर ले जाती हैं, जिससे वितरण की गति धीमी हो जाती है,
अस्थायी एकीकरण समाधानों को लागू करने के लिए एक विश्वसनीय उपकरण होना सहायक होता है।
कैमल का कई प्रोटोकॉल और डेटा प्रारूपों के लिए समर्थन विविध प्रणालियों के साथ आसान एकीकरण को सक्षम बनाता है।
इसके अलावा, स्टैंडअलोन मोड को मौजूदा बुनियादी ढांचे में हस्तक्षेप की आवश्यकता नहीं होती है।
यह कैमल को अस्थायी समाधान बनाने के लिए आदर्श बनाता है, जिसके लिए यह मतदान,
स्प्लिटर, थ्रॉटल, सर्किट ब्रेकर और कई अन्य जैसे विभिन्न एकीकरण पैटर्न लाता है।

पुराने सिस्टम के संदर्भ में SOAP सबसे लोकप्रिय (घटना की आवृत्ति के मामले में) डेटा विनिमय प्रोटोकॉल में से एक है।
XML के संयोजन में, ऐसे वेब सेवा के साथ संचार का कार्यान्वयन अक्सर HTTP प्रोटोकॉल पर आधारित एक विशिष्ट REST वास्तुकला के साथ उतना तेज़ नहीं होता है।
और भी तब जब आपको खरोंच से तैयार किए गए एक त्वरित अस्थायी समाधान की आवश्यकता होती है।

## SAAJ

जबकि जावा SAAJ (*SOAP with Attachments API for Java*) नामक SOAP संचार के लिए इंटरफेस का एक सेट प्रदान करता है, यह
`javax.xml.soap` पैकेज के तहत एक निम्न-स्तरीय API है। स्पष्ट होने के लिए, यह जटिल अनुरोध और प्रतिक्रिया संरचनाओं के लिए बहुत
आसान नहीं है। इसमें XML/XSD दस्तावेज़ों के लिए सत्यापन सुविधा भी नहीं है।

लेकिन चलिए कुछ उदाहरण देखते हैं।
हमारे पास मेरे नमूने रिपॉजिटरी https://github.com/t3rmian/jmeter-samples से एक SOAP वेब सेवा के साथ एक सर्वर है।
सेवा नमूना अनुरोधों को सुनती है और प्रतिक्रिया देती है:

<img src="/img/hq/soap-request-response.png" title='नमूना SOAP क्वेरी और प्रतिक्रिया' alt='<!--getUser_4_smith_request.xml अनुरोध-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--प्रतिक्रिया-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

SAAJ और स्व-वर्णनात्मक कोड का उपयोग करके क्लाइंट स्तर से संचार को लागू करने के लिए आवश्यक कक्षाएं इस तरह दिख सकती हैं:

```java
import javax.xml.namespace.QName;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPBody;
import javax.xml.soap.SOAPBodyElement;
import javax.xml.soap.SOAPConnection;
import javax.xml.soap.SOAPConnectionFactory;
import javax.xml.soap.SOAPConstants;
import javax.xml.soap.SOAPElement;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;
import org.junit.Test;

import java.net.MalformedURLException;
import java.net.URL;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    static final String NS = "https://github.com/t3rmian/jmeter-samples";
    
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingSAAJ_Then_returnSmithName() throws SOAPException, MalformedURLException {
        SOAPMessage soapMessage = createGetUserSAAJMessage(EXISTING_USER_ID);
        URL endpointUrl = new URL(System.getProperty("wsEndpointAddress"));
        SOAPConnectionFactory soapConnectionFactory = SOAPConnectionFactory.newInstance();
        SOAPConnection soapConnection = soapConnectionFactory.createConnection();

        SOAPMessage response = soapConnection.call(soapMessage, endpointUrl);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSAAJMessage(long userId) throws SOAPException {
        MessageFactory messageFactory = MessageFactory.newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        SOAPBody body = envelope.getBody();
        SOAPBodyElement getUserRequest = body.addBodyElement(new QName(NS, "getUserRequest"));
        SOAPElement id = getUserRequest.addChildElement(new QName(NS, "id"));
        id.setTextContent(String.valueOf(userId));
        return soapMessage;
    }
}
```
इस API का प्रभावी ढंग से उपयोग करने के लिए, तत्व निर्माण के दौरान और प्रतिक्रिया में तत्वों की खोज करते समय नेमस्पेस का उपयोग करना याद रखें।
उन्हें छोड़ने से या तो अनुरोध की अस्वीकृति होगी या पढ़ने के दौरान तत्व को खोजने में असमर्थता होगी, जो वैकल्पिक भागों के लिए विनाशकारी हो सकता है।

> जावा प्लेटफॉर्म के चल रहे विकास में, SAAJ को हटा दिया गया है और फिर जावा SE 11 से [हटा दिया गया है](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4) और अब JDK के साथ नहीं आता है। इस पैकेज को एक अलग आर्टिफैक्ट `javax.xml.soap:javax.xml.soap-api` में निकाला गया है, जिसे आप Maven सेंट्रल रिपॉजिटरी में पा सकते हैं।

## JAX-WS और Apache CXF

CXF (2006 से सेल्टिक्स और एक्सफायर उत्पादों के विलय से बनाया गया एक संक्षिप्त नाम) वेब सेवाओं और ग्राहकों के निर्माण के लिए एक रूपरेखा के रूप में संचार के बहुत तेज
कार्यान्वयन को सक्षम बनाता है, खासकर
जब उन्नत संरचनाओं और एक्सटेंशन से निपटने के लिए, उदाहरण के लिए, WSS। मानक इंटरफेस (जावा 11 तक) के दायरे में,
यह JAX-WS (जावा एपीआई फॉर एक्सएमएल वेब सर्विसेज) के लिए एक प्रदाता के रूप में भी कार्य करता है।

टूलींग के मामले में, Apache CXF WSDL/XSD फ़ाइलों से एक वेब सेवा का प्रतिनिधित्व करने वाली जावा कक्षाएं उत्पन्न करने के लिए एक मावेन प्लगइन `org.apache.cxf:cxf-codegen` प्रदान करता है।

```xml
<plugin>
    <groupId>org.apache.cxf</groupId>
    <artifactId>cxf-codegen-plugin</artifactId>
    <version>3.5.5</version>
    <executions>
        <execution>
            <id>generate-sources</id>
            <phase>generate-sources</phase>
            <configuration>
                <wsdlOptions>
                    <wsdlOption>
                        <wsdl>
                            ${basedir}/src/main/resources/users.wsdl
                        </wsdl>
                    </wsdlOption>
                </wsdlOptions>
            </configuration>
            <goals>
                <goal>wsdl2java</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

> एक IDE (जैसे, IntelliJ) आमतौर पर इस प्लगइन को स्वचालित रूप से लागू नहीं करता है। आप सीधे Maven का उपयोग कर सकते हैं या इस चरण को अपने रनटाइम कॉन्फ़िगरेशन में मैन्युअल रूप से शामिल कर सकते हैं।

क्लाइंट को लागू करने के लिए, आपको `org.apache.cxf` समूह से कलाकृतियों की आवश्यकता होगी:
- `cxf-core` - प्रसंस्करण, मानचित्रण और प्रोटोकॉल हैंडलिंग के लिए जिम्मेदार कक्षाएं;
- `cxf-rt-frontend-jaxws` - ग्राहक कक्षाएं;
- `cxf-rt-databinding-jaxb` - एक्सएमएल मानचित्रण;
- `cxf-rt-transports-http` - HTTP संचार;
- `cxf-rt-transports-soap` - SOAP समर्थन;
- `cxf-rt-features-logging` - संदेश लॉगिंग विस्तार।

> यदि आप `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2 .runtime.reflect.opt.Injector.defineClass" is null` जैसी त्रुटि का सामना कर रहे हैं, तो https://github.com/eclipse-ee4j/jaxb-ri/issues/1197 से समाधानों पर एक नज़र डालें।  
> मेरा नमूना समाधान सकर्मक JAXB `jaxb-runtime` निर्भरता के अलावा XML फ़ाइलों से जावा कोड उत्पन्न करने से संबंधित `com.sun.xml.bind:jaxb-xjc` आर्टिफैक्ट जोड़ना था। यद्यपि प्रदान किए गए उदाहरणों में कक्षाएं पहले से ही उत्पन्न होती हैं, उन्हें एक अलग जावा संस्करण पर चलाने से JAXB कार्यान्वयन के कारण एक आंतरिक त्रुटि हो सकती है जो लापता कक्षाओं का उपयोग करके पहुंच को अनुकूलित करने का प्रयास कर रही है।

इस बार कोड बहुत सरल है। हम प्लगइन द्वारा उत्पन्न डीटीओ का उपयोग करते हैं। इसके अतिरिक्त, सीएक्सएफ
कार्यान्वयन का संदर्भ देकर, आपके पास क्लाइंट को कॉन्फ़िगर करने का अवसर है (टाइमआउट, लॉगिंग, एसएसएल):

```java
import https.github_com.t3rmian.jmeter_samples.CommonFault;
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.Users;
import https.github_com.t3rmian.jmeter_samples.UsersService;
import org.apache.cxf.ext.logging.LoggingFeature;
import org.apache.cxf.frontend.ClientProxy;
import org.apache.cxf.transport.http.HTTPConduit;

import javax.xml.ws.BindingProvider;
import javax.xml.ws.WebServiceFeature;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCxf_Then_returnSmithName() throws CommonFault {
        UserPayload userPayload = new UserPayload();
        userPayload.setId(EXISTING_USER_ID);

        Users users = new UsersService().getUsersSoap11(getCxfLoggingFeature());
        ((HTTPConduit) ClientProxy.getClient(users).getConduit())
                .getClient().setReceiveTimeout(1000L);
        BindingProvider bindingProvider = (BindingProvider) users;
        bindingProvider.getRequestContext()
                .put(BindingProvider.ENDPOINT_ADDRESS_PROPERTY,
                        System.getProperty("wsEndpointAddress"));
        User user = users.getUser(userPayload);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static WebServiceFeature getCxfLoggingFeature() {
        LoggingFeature loggingFeature = new LoggingFeature();
        loggingFeature.setPrettyLogging(true);
        loggingFeature.setVerbose(true);
        loggingFeature.setLogMultipart(true);
        return loggingFeature;
    }
}
```

## कैमल और सोप

कैमल अपने एकीकरण पैटर्न के माध्यम से SOAP वेब सेवाओं के साथ संचार को पूरक करता है।
उनके लिए धन्यवाद, आप डेटाबेस से डेटा एकत्र कर सकते हैं या दो अलग-अलग समापन बिंदुओं के बीच एक पुल लागू कर सकते हैं।
संस्करण 3.18 के अनुसार, CXF के साथ एकीकरण के लिए आवश्यक निर्भरताओं को कई छोटे पैकेजों में [विभाजित](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf) (CAMEL-9627) कर दिया गया है।
पहले के संस्करण, 2.x भी (जो जावा 8 का समर्थन करता है), को केवल एक ही आर्टिफैक्ट की आवश्यकता होती थी, यानी, `org.apache.camel:camel-cxf`।
`soap` (3.18+) नाम वाला कोई भी आर्टिफैक्ट हमारे उदाहरणों के लिए काम करेगा।

एंडपॉइंट्स के बीच संदेशों के प्रवाह के लिए URI पथ की अवधारणा कई कॉन्फ़िगरेशन विकल्पों की अनुमति देती है।
आइए डेटा स्वरूपों पर विचार करें जो परिभाषित करते हैं कि संदेश का निर्माण कैसे किया जाए।
आप चार स्वरूपों में से एक चुन सकते हैं।
- रॉ/मैसेज - कच्चे रूप में संदेश भेजने और प्राप्त करने की अनुमति देता है, जैसे, `String`;
- पोजो - CXF उदाहरण में POJO के रूप में;
- पेलोड - `org.w3c.dom` XML दस्तावेज़ जो SOAP बॉडी का प्रतिनिधित्व करते हैं जिसे आप कैमल `CxfPayload` में लोड कर सकते हैं;
- CXF_MESSAGE - `javax.xml.soap` पैकेज से SOAP लिफाफा।

प्रत्येक डेटा प्रारूप के अपने नियमों का सेट होता है, जैसे कि CXF इंटरसेप्टर्स का अनुप्रयोग। आप उनके बारे में [दस्तावेज़ीकरण](https://camel.apache.org/components/3.20.x/cxf-component.html) में पढ़ सकते हैं।
हालांकि, शुरू करने के लिए, ग्राहक कार्यान्वयन के कुछ उदाहरणों की जांच करना महत्वपूर्ण है।

> फिर भी एक और तरीका यह है कि CXF प्रत्यक्ष संचार को एक बीन में लपेटा जाए और इसे एक कैमल ट्रैक से बांधा जाए।

### रॉ/मैसेज

`RAW` प्रारूप टेक्स्ट के रूप में संदेश भेजने के लिए अच्छी तरह से काम करता है, उदाहरण के लिए, एक फ़ाइल से लोड किया गया।
आपको प्रतिक्रिया में एक टेक्स्ट प्राप्त होगा, जो कि लागू करने में तेज़ होते हुए भी, अन्य उद्देश्यों के लिए इसे एक्सेस करने के लिए उपयुक्त नहीं हो सकता है।

हालांकि, डेटा भेजने से पहले, आपको एक URI बनाने की आवश्यकता है जिसका उपयोग करके कैमल डेटा को सही जगह पर भेजेगा।

```java
import org.apache.camel.CamelContext;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.impl.DefaultCamelContext;

import static org.hamcrest.CoreMatchers.containsString;
import static org.hamcrest.MatcherAssert.assertThat;

public class CamelSoapClientIT {

    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfRawFormat_Then_returnSmithName() throws Exception {
        String message = getTestResourceContent("getUser_4_smith_request.xml");

        try (CamelContext camelContext = new DefaultCamelContext()) {
            camelContext.addRoutes(new RouteBuilder() {
                @Override
                public void configure() {
                    from("direct:getUser")
                            .log("Body before cxf route: ${body}")
                            .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
                            .to(getCxfUriWithVerboseLoggingOfDataFormat(DataFormat.RAW))
                            .log("Body after cxf route: ${body}");
                }
            });
            camelContext.start();
            String response = camelContext.createProducerTemplate()
                    .requestBody("direct:getUser", message, String.class);

            assertThat(response, containsString(String.valueOf(EXISTING_USER_ID)));
            assertThat(response, containsString(EXISTING_USER_NAME));
        }
    }

    static String getCxfUriWithVerboseLoggingOfDataFormat(DataFormat dataFormat) {
        return getCxfUri(dataFormat) +
                "&cxfConfigurer=#class:io.github.t3rmian.jmetersamples.CxfTimeoutConfigurer";
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}/UsersSoap11?dataFormat=" + dataFormat;
    }
}
```

URI `cxf` घटक के साथ शुरू होता है जो शामिल निर्भरता के साथ स्वतः पंजीकृत होता है। अभिव्यक्ति `{{wsEndpointAddress}}` आपको पर्यावरण चर या
एक जावा प्रॉपर्टी, जैसे, `http://localhost:8080/ws/users` को लोड करने की अनुमति देती है। `cxfConfigurer` को बाद में वर्णित किया जाएगा। अभी के लिए, बस ध्यान दें कि यह एक सामान्य CXF प्रेषण मोड के लिए एक कॉन्फ़िगरेशन है,
जो एक विशिष्ट स्कीमा से बंधे नहीं मनमाने संरचनाओं को भेजने के लिए उपयोगी है।

### पोजो

`POJO` प्रारूप, अपनी सादगी में, `cxf-codegen-plugin` प्लगइन द्वारा उत्पन्न कक्षाओं के उपयोग की अनुमति देता है।
हालांकि, आपको URI कॉन्फ़िगरेशन को समायोजित करने की आवश्यकता है ताकि उचित बाइंडिंग की जा सके।

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.User;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPOJOFormat_Then_returnSmithName() throws Exception {
        UserPayload userPayload = new ObjectFactory().createUserPayload();
        userPayload.setId(EXISTING_USER_ID);

        //... .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
        User user = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", userPayload, User.class);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}"
                + "?wsdlURL=classpath:users.wsdl"
                + "&serviceClass=https.github_com.t3rmian.jmeter_samples.Users"
                + "&dataFormat=" + dataFormat;
    }
}
```

`wsdlURL` पथ के तहत, एक क्लासपाथ फ़ाइल है जो SOAP सेवा का वर्णन करती है।
इसके बाद, `serviceClass` पैरामीटर क्लाइंट कार्यान्वयन को निर्धारित करता है, और यह केवल `POJO` प्रारूप के लिए अनिवार्य है।

`CxfConstants.OPERATION_NAME` और `CxfConstants.OPERATION_NAMESPACE` हेडर के आधार पर, Camel/CXF संदेश को
उचित ऑपरेशन के साथ संबद्ध करेगा। अन्यथा, यह एक शिक्षित अनुमान लगाएगा। इसी तरह, आप `SOAPAction` HTTP हेडर
को `SoapBindingConstants.SOAP_ACTION` (SOAP 1.1) के साथ सेट कर सकते हैं, यदि सर्वर द्वारा इसकी आवश्यकता हो (उदाहरण के लिए, एक सेवा के तहत कई ऑपरेशन)।
SOAP 1.2 के लिए समतुल्य पैरामीटर `SoapBindingConstants.PARAMETER_ACTION` है।

### पेलोड

`PAYLOAD` प्रारूप में एक संदेश तैयार करना अधिक चुनौतीपूर्ण है। एक XML दस्तावेज़ बनाकर शुरू करें, और इसे `CxfPayload` में लोड करें।
इसी तरह, हेडर को कंस्ट्रक्टर के पहले तर्क के रूप में पास करें।
प्रतिक्रिया को एक विशिष्ट XML तरीके से पढ़ें, और दिए गए नाम और एक नेमस्पेस द्वारा प्रतिक्रिया में तत्वों की तलाश करें।

```java
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.apache.camel.component.cxf.common.CxfPayload;
import org.apache.cxf.binding.soap.SoapHeader;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.dom.DOMSource;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPayloadFormat_Then_returnSmithName() throws Exception {
        List<Source> outElements = new ArrayList<>();
        Document outDocument = createGetUserXmlDocument(EXISTING_USER_ID);
        outElements.add(new DOMSource(outDocument.getDocumentElement()));
        CxfPayload<SoapHeader> payload = new CxfPayload<>(null, outElements, null);
        
        //...
        CxfPayload<Element> response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", payload, CxfPayload.class);
        Element getUserResponse = response.getBody().get(0);

        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static Document createGetUserXmlDocument(long existingUserId)
            throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.newDocument();
        document.setXmlVersion("1.1");

        Element rootElement = document.createElementNS(NS, "getUserRequest");
        document.appendChild(rootElement);

        Element childElement = document.createElementNS(NS, "id");
        childElement.appendChild(document.createTextNode(String.valueOf(existingUserId)));
        rootElement.appendChild(childElement);

        return document;
    }
}
```

### CXF_MESSAGE

`CXF_MESSAGE` प्रारूप `PAYLOAD` के समान दिखता है, लेकिन इस बार उपयोग की जाने वाली कक्षाएं SOAP पैकेज (SAAJ) से हैं:

```java
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfCxfMessageFormat_Then_returnSmithName() throws Exception {
        SOAPMessage soapMessage = createGetUserSOAPMessage(EXISTING_USER_ID);

        //...
        SOAPMessage response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", soapMessage, SOAPMessage.class);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSOAPMessage(long userId) 
            throws SOAPException, JAXBException {
        MessageFactory messageFactory = MessageFactory
                .newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        ObjectFactory objectFactory = new ObjectFactory();
        UserPayload userPayload = objectFactory.createUserPayload();
        userPayload.setId(userId);
        JAXBContext.newInstance(UserPayload.class).createMarshaller()
                .marshal(objectFactory.createGetUserRequest(userPayload),
                        envelope.getBody());
        // or handcraft: envelope.getBody().addBodyElement().addChildElement()...
        return soapMessage;
    }
}
```

SAAJ उदाहरण की तरह मैन्युअल रूप से तत्व बनाने के बजाय, इस बार, आइए POJO को SOAP बॉडी में बदलने के लिए JAXB इंटरफ़ेस का उपयोग करें।

### कैमल में CXF कॉन्फ़िगरेशन

कैमल `cxfConfigurer` URI कॉन्फ़िगरेशन विकल्प आपको CXF कॉन्फ़िगरेशन में प्लग इन करने की अनुमति देता है। इसके साथ, आप कनेक्शन
विकल्प सेट कर सकते हैं, अतिरिक्त रूप से संचार को सुरक्षित कर सकते हैं (उदाहरण के लिए,
*[mTLS](https://cxf.apache.org/docs/client-http-transport-including-ssl-support.html)* का उपयोग करके, जबकि *बेसिक ऑथ* को
URI के माध्यम से कॉन्फ़िगर किया जा सकता है), या इंटरसेप्टर सेट कर सकते हैं।

```java
package io.github.t3rmian.jmetersamples;

import org.apache.camel.component.cxf.jaxws.CxfConfigurer;
import org.apache.cxf.endpoint.Client;
import org.apache.cxf.endpoint.Server;
import org.apache.cxf.ext.logging.LoggingInInterceptor;
import org.apache.cxf.ext.logging.LoggingOutInterceptor;
import org.apache.cxf.ext.logging.event.PrettyLoggingFilter;
import org.apache.cxf.ext.logging.slf4j.Slf4jVerboseEventSender;
import org.apache.cxf.frontend.AbstractWSDLBasedEndpointFactory;
import org.apache.cxf.transport.http.HTTPConduit;
import org.apache.cxf.transports.http.configuration.HTTPClientPolicy;

public class CxfTimeoutConfigurer implements CxfConfigurer {

    @Override
    public void configure(AbstractWSDLBasedEndpointFactory factoryBean) {}

    @Override
    public void configureClient(Client client) {
        HTTPConduit httpConduit = (HTTPConduit) client.getConduit();
        httpConduit.setClient(getHttpClientPolicy());
        LoggingInInterceptor loggingInInterceptor = new LoggingInInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingInInterceptor);
        LoggingOutInterceptor loggingOutInterceptor = new LoggingOutInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingOutInterceptor);
    }

    static HTTPClientPolicy getHttpClientPolicy() {
        HTTPClientPolicy httpClientPolicy = new HTTPClientPolicy();
        httpClientPolicy.setConnectionTimeout(1000);
        httpClientPolicy.setConnectionRequestTimeout(1000);
        httpClientPolicy.setReceiveTimeout(1000);
        return httpClientPolicy;
    }

    @Override
    public void configureServer(Server server) {}
}
```

उपरोक्त कॉन्फ़िगरेशन में, मैंने लॉगिंग को सक्षम किया है जो वर्बोस सेटिंग्स के लिए विशिष्ट है। कैमल URI के माध्यम से, आपके पास
`loggingFeatureEnabled=true` विकल्प तक पहुंच है, जो दुर्भाग्य से संदेश की सामग्री को लॉग नहीं करता है। खरोंच से कार्यान्वयन करते समय अतिरिक्त लॉगिंग
मूल्यवान साबित होती है। कैमल की `log()` विधि पर निर्भर रहने से अंतिम संदेश नहीं दिखता है, केवल
ऑब्जेक्ट (भेजने) से पहले / मैपिंग के बाद।

एक वैकल्पिक कॉन्फ़िगरेशन विकल्प [`cxf.xml`](https://cxf.apache.org/docs/configuration.html) क्लासपाथ फ़ाइल है।
हालांकि, इस विकल्प के लिए स्प्रिंग निर्भरता की आवश्यकता होती है। इस संबंध में, आपको केवल `org.springframework:spring-context` की आवश्यकता है।

## स्टैंडअलोन कैमल

उपरोक्त नमूनों में अंतिम समाधान के मामले में कुछ कमी है। अपनी सादगी में,
निर्भरता [`org.apache.camel:camel-main`](https://camel.apache.org/components/3.20.x/others/main.html) सभी मार्गों
को कार्यक्रम की समाप्ति की प्रतीक्षा करते हुए शुरू करने की अनुमति देती है। इसके अलावा, यह स्वचालित कॉन्फ़िगरेशन स्कैनिंग प्रदान करता है। नीचे एक छोटा
उदाहरण है:

```java
package io.github.t3rmian.jmetersamples;

import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.component.cxf.common.message.CxfConstants;
import org.apache.camel.main.BaseMainSupport;
import org.apache.camel.main.Main;
import org.apache.camel.main.MainListenerSupport;

public class CamelSoapClient {
    public static void main(String[] args) throws Exception {
        Main main = new Main(CamelSoapClient.class);
        main.addMainListener(new MainListenerSupport() {
            @Override
            public void afterStart(BaseMainSupport main) {
                UserPayload userPayload = new ObjectFactory().createUserPayload();
                userPayload.setId(EXISTING_USER_ID);
                System.out.println("Requesting user " + userPayload.getId());
                try (ProducerTemplate producerTemplate = main
                        .getCamelContext().createProducerTemplate()) {
                    User user = producerTemplate.requestBody("direct:getUser",
                            userPayload, User.class);
                    System.out.println("Response contains " + user.getName());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
                System.out.println("Camel is running and waiting for SIGINT...");
            }
        });
        System.exit(main.run(args));
    }

    @SuppressWarnings("unused") // auto discovered by org.apache.camel.main.Main
    public static class MyRouteBuilder extends RouteBuilder {
        @Override
        public void configure() {
            from("direct:getUser")
                    .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
// An alternative to cxfConfigurer URI parameter:
// .setHeader(Client.REQUEST_CONTEXT, () -> new HashMap<String, Object>() {{
//      this.put(HTTPClientPolicy.class.getName(),
//          CxfTimeoutConfigurer.getHttpClientPolicy());
// }})
                    .to(getCxfUri(DataFormat.POJO) + "&loggingFeatureEnabled=true")
                    .process(exchange -> exchange.getIn().setBody(exchange.getIn().getBody()));
        }
    }
}
```

कैमल स्कैनिंग प्रक्रिया के दौरान `MyRouteBuilder` वर्ग का स्वतः पता लगाता है, और स्टार्टअप के बाद, आप इसे स्पष्ट रूप से पंजीकृत किए बिना पथ का उपयोग कर सकते हैं।

पहले, मैंने CamelConfiguration इंटरफ़ेस को लागू करने और `new Main().configure().addConfiguration(CamelSoapClient.class)`
विधि का उपयोग करके कॉन्फ़िगरेशन जोड़ने का प्रयास किया। हालांकि, इसे अनदेखा कर दिया गया
क्योंकि वर्ग में एक मुख्य विधि थी।
यहां तक ​​कि जब मैंने `new Main(CamelSoapClient.class)` का उपयोग किया, तब भी यह विफल रहा यदि मेरे वर्ग ने CamelConfiguration इंटरफ़ेस लागू किया:
```java
public class CamelSoapClient {
    @Override
    public void configure(CamelContext camelContext) throws Exception {
        camelContext.addRoutes(new RouteBuilder() {
            // ...
        });
    }
}
```
कैमल ने एक गैर-स्थिर आंतरिक वर्ग का पता लगाया और इसे कॉन्फ़िगरेशन के लिए प्रारंभ करने का प्रयास किया।
फिर इसने एक रहस्यमय `java.lang.NoSuchMethodException: io.github.t3rmian.jmetersamples.CamelSoapClient$2.<init>()` त्रुटि फेंकी।

तो हम मूल उदाहरण पर वापस आ गए हैं जो काम करता है। यहाँ मैं `MainListenerSupport` का उपयोग करता हूँ, जो आपको संदर्भ के स्टार्टअप के बाद
अतिरिक्त कोड को कॉल करने की अनुमति देता है - जैसे, एक परीक्षण कॉल। फिर SIGINT सिग्नल के साथ, आप ऐसे एप्लिकेशन को समाप्त कर सकते हैं।

### फैट जार

एक स्टैंडअलोन एप्लिकेशन तैयार करने का अंतिम चरण सभी निर्भरताओं वाले एक आर्टिफैक्ट का निर्माण करना है, तथाकथित
फैट जार।
ऐसे बिल्ड के लिए, आपको `org.apache.camel:camel-maven-plugin` प्लगइन की आवश्यकता है, जो `prepare-fatjar` लक्ष्य में,
ऐसे पैकेज के लिए कैमल निर्भरता तैयार करता है। उदाहरण के लिए, यह कई फ़ाइलों को मिलाकर एक `UberTypeConverterLoader` फ़ाइल बनाता है
और इसे `META-INF` फ़ोल्डर में संग्रहीत करता है ताकि यह सुनिश्चित हो सके कि कन्वर्टर्स सही ढंग से लोड किए गए हैं।

हालांकि, यह प्लगइन परिणामी आर्टिफैक्ट उत्पन्न नहीं करता है। एक आर्टिफैक्ट बनाने के लिए, आपको एक और प्लगइन की आवश्यकता है, जैसे, `maven-assembly-plugin`।
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-assembly-plugin</artifactId>
    <configuration>
        <descriptorRefs>
            <descriptorRef>jar-with-dependencies</descriptorRef>
        </descriptorRefs>
        <archive>
            <manifest>
                <mainClass>io.github.t3rmian.jmetersamples.CamelSoapClient</mainClass>
            </manifest>
        </archive>
    </configuration>
    <executions>
        <execution>
            <id>make-assembly</id>
            <phase>package</phase>
            <goals>
                <goal>single</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

अब, यदि आप CXF निर्भरताओं का उपयोग कर रहे हैं, तो उन्हें उसी तरह से तैयार करने की आवश्यकता है जैसे कैमल निर्भरताएँ। जैसे, अन्य बातों के अलावा, आपको `META-INF` फ़ोल्डर में एक
संलग्न `bus-extensions.txt` फ़ाइल की आवश्यकता है। `maven-shade-plugin` प्लगइन इसके लिए बहुत अच्छा काम करता है,
और CXF के लिए एक उचित कॉन्फ़िगरेशन [दस्तावेज़ीकरण](https://cxf.apache.org/docs/bundling-cxf-into-single-jar-with-maven-shade-plugin.html) में पाया जा सकता है।
आपको बस इतना करना है कि `mainClass` के स्थान पर अपना स्वयं का प्रारंभिक वर्ग प्रदान करें।

## सारांश

अब जब आप जानते हैं कि SOAP क्वेरी कैसे बनाएं, प्रतिक्रियाएं पढ़ें, और इंटरसेप्टर कॉन्फ़िगर करें, तो यह आप पर निर्भर है कि आप
व्यावसायिक तर्क को लागू करें। निर्भरता जोड़ते समय, जावा प्लेटफॉर्म के विकास को याद रखें। बाद के संस्करणों में,
कुछ पैकेजों को JDK से अलग आर्टिफैक्ट में बाहर रखा गया है। इसके अलावा, नवीनतम संस्करण और प्लगइन्स
JEE `javax` नामकरण से जकार्ता पैकेज नामों (Camel 4.x, CXF 4.x, JAXB 4.x) में चले जाते हैं। दोनों पैकेजों को मिलाने से अक्सर
समस्याएं होती हैं, खासकर जब हम उत्पन्न कोड को सत्यापित नहीं करते हैं।

उदाहरण के लिए, यदि आप JEE रनटाइम में जकार्ता एनोटेशन का उपयोग करते हैं, तो कोई गारंटी नहीं है कि वे सटीक रूप से पार्स किए जाएंगे।
नेस्टेड क्वेरी तत्व अपने नेमस्पेस से रहित हो सकते हैं, भले ही `elementFormDefault = XmlNsForm.QUALIFIED` पैकेज कॉन्फ़िगरेशन हो।
यदि आपको इसका संदेह है, तो इस मुद्दे को सत्यापित करने के लिए JAXB एनोटेट कक्षाओं से उत्पन्न स्कीमा को प्रिंट करें:

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.JAXBException;
import javax.xml.bind.SchemaOutputResolver;
import javax.xml.transform.Result;
import javax.xml.transform.stream.StreamResult;

import java.io.IOException;
import java.io.PrintWriter;

public class CamelSoapClientIT {
    static {
        printSchema();
    }

    private static void printSchema() throws JAXBException, IOException {
        JAXBContext jaxbContext = JAXBContext.newInstance(UserPayload.class);
        jaxbContext.generateSchema(new SchemaOutputResolver() {
            @Override
            public Result createOutput(String namespaceUri, String suggestedFileName) {
                StreamResult streamResult = new StreamResult(new PrintWriter(System.out) {
                    @Override
                    public void close() {
                    }
                });
                streamResult.setSystemId(suggestedFileName);
                return streamResult;
            }
        });
    }
}
```

