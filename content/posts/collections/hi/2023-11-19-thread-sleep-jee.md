---
title: JEE में थ्रेड स्लीप
url: थ्रेड-स्लीप-जेईई
id: 120
category:
- jee: जेईई
tags:
- थ्रेड्स
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

`Thread.sleep()` विधि, हालांकि एक कृत्रिम देरी शुरू करने का एक प्रतीत होता है सरल तरीका है, इसका उपयोग [आमतौर पर JEE में हतोत्साहित किया जाता है](https://www.oracle.com/java/technologies/restriction.html#threads)
वातावरण। यह सीधे
थ्रेड शेड्यूलिंग का प्रबंधन करता है, एक ऐसा कार्य जिसे एप्लिकेशन सर्वर के कंटेनर द्वारा नियंत्रित किया जाना चाहिए। यह हस्तक्षेप कंटेनर की
संसाधन आवंटन और थ्रेड प्रबंधन को अनुकूलित करने की क्षमता को बाधित कर सकता है, जिससे प्रदर्शन
में गिरावट और संभावित बाधाएं हो सकती हैं। उच्च-यातायात परिदृश्यों में, कंटेनर में मुफ्त थ्रेड्स की कमी हो सकती है, जिसके परिणामस्वरूप
एक अनुरोध प्राप्त करने में देरी या विफलता हो सकती है।

## टाइमर सेवा

`Thread.sleep` का एक JEE-अनुपालन विकल्प `TimerService` है।
यह एपीआई का एक सेट है जो डेवलपर्स को विशिष्ट समय, देरी या अंतराल पर निष्पादित किए जाने वाले कार्यों को शेड्यूल करने की
अनुमति देता है।

<img src="/img/hq/thread-sleep-jee.png" alt="JEE में Thread.sleep() के विकल्प के रूप में नमूना TimerService चलाने के परिणाम" title="नमूना TimerService चलाने पर कंसोल आउटपुट के परिणाम">

टाइमर सेवाओं का उपयोग करने के लिए, आपको अपने एंटरप्राइज़ बीन में `TimerService` इंटरफ़ेस संसाधन को इंजेक्ट करना चाहिए। फिर
एक टाइमर बनाने और वांछित निष्पादन समय या शेड्यूल निर्दिष्ट करने के लिए `createTimer()` विधि का उपयोग करें। अंत में, `@Timeout`
एनोटेशन के साथ एनोटेट की गई एक विधि उस कार्य को लागू करेगी जिसे एक विशिष्ट देरी के बाद चलाया जाना है।

`createTimer()` विधि को कॉल करते समय, आप `getInfo()` को लागू करके `@Timeout` एनोटेट की गई विधि में `Timer`
पैरामीटर से पुनर्प्राप्त किए जाने वाले `Serializable` पैरामीटर प्रदान कर सकते हैं। इस तरह आप अपने काम की प्रगति को पास कर सकते हैं।

यहाँ बीच में 5 सेकंड की देरी के साथ `foo()` और `bar()` विधि का एक उदाहरण है:

```java
import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.ejb.Timeout;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Stateless
public class MyEJB {
    public static class MyTimerInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private final LocalDateTime startDateTime;
        private final LocalDateTime fooEndDateTime;

        public MyTimerInfo(LocalDateTime startDateTime, LocalDateTime fooEndDate) {
            this.startDateTime = startDateTime;
            this.fooEndDateTime = fooEndDate;
        }
    }

    @Resource
    private TimerService timerService;

    public void runFooBar() {
        LocalDateTime workStartDate = LocalDateTime.now();
        System.out.println("Starting foo() at " + workStartDate);
        foo();
        LocalDateTime fooEndDate = LocalDateTime.now();
        System.out.println("Ended foo() at " + fooEndDate);
        long delay = TimeUnit.SECONDS.toMillis(5);
        timerService.createTimer(delay, new MyTimerInfo(workStartDate, fooEndDate));
    }

    @Timeout
    public void onTimeout(Timer timer) {
        if (timer.getInfo() instanceof MyTimerInfo) {
            MyTimerInfo myTimerInfo = (MyTimerInfo) timer.getInfo();
            LocalDateTime barStartDateTime = LocalDateTime.now();
            System.out.println("Starting bar() at " + barStartDateTime);
            bar(myTimerInfo);
            LocalDateTime workEndDateTime = LocalDateTime.now();
            System.out.println("Ended bar() at " + workEndDateTime);
            System.out.printf("Total time for foo[%sms] + delay[%sms] + bar[%sms] = %sms%n",
                    Duration.between(myTimerInfo.startDateTime, myTimerInfo.fooEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.fooEndDateTime, barStartDateTime).toMillis(),
                    Duration.between(barStartDateTime, workEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.startDateTime, workEndDateTime).toMillis());
        } else {
            System.err.println("Unknown timer config");
        }
    }

    public void foo() {/***/} // This could return tracking id
    public void bar(MyTimerInfo workProgress) {/***/}
}
```

`createTimer()` के अलावा, अधिक स्व-वर्णनात्मक विधियाँ हैं जैसे `createSingleActionTimer()`, `createIntervalTimer()` और `createCalendarTimer()`।
उनका API एक `Serializable` पैरामीटर की अपेक्षा करता है जो वैकल्पिक रूप से एक `TimerConfig` ऑब्जेक्ट में लपेटा जाता है जो
`persistent` विकल्प (डिफ़ॉल्ट रूप से सत्य) को बदलने का एक तरीका प्रदान करता है। यह एक टाइमर के जीवनकाल को वर्तमान JVM उदाहरण से आगे बढ़ाने का एक तरीका है।

ध्यान दें कि `@Timeout`-एनोटेट की गई विधियों के लिए, दो महत्वपूर्ण बाधाएँ हैं:
> EJB विनिर्देश केवल इस विधि के लिए `RequiresNew` (डिफ़ॉल्ट) या `NotSupported` लेनदेन विशेषताओं को निर्दिष्ट करने की अनुमति देता है।

> टाइमआउट विधि को एप्लिकेशन अपवाद नहीं फेंकना चाहिए।

इसके अतिरिक्त, मैंने पाया कि कंटेनर WebLogic पर `@Timeout` विधि के आह्वान पर इंटरसेप्टर को लागू नहीं कर सकता है।
इस और अपने प्रदाता की अन्य समान कंटेनर सुविधाओं से सावधान रहें।

## सारांश

`Thread.sleep` का JEE-अनुपालन विकल्प इंजेक्ट किया गया `TimerService` संसाधन और एक `@Timeout` विधि हो सकता है।
मौलिक रूप से, इसके लिए कोड को कम से
कम दो भागों में विभाजित करने की आवश्यकता होती है, जो कॉल पदानुक्रम में जितना गहरा होता है और आपकी प्रक्रिया जितनी अधिक परमाणु होने की आवश्यकता होती है, उतना ही कम तुच्छ होता है।

अतुल्यकालिक प्रकृति को भी एक अलग संचार प्रवाह की आवश्यकता हो सकती है। यदि यह एक उपयोगकर्ता है जो इस तरह के ऑपरेशन के परिणाम की प्रतीक्षा कर रहा है, तो आपको
प्रतिक्रिया तंत्र के बारे में सोचना चाहिए (उदाहरण के लिए, एक तत्काल, क्वेरी करने योग्य ट्रैकिंग पहचानकर्ता प्रदान करें)।

(परिवर्तन) जटिलता के कारण, अक्सर
`Thread.sleep` की संभावना को संतुलित करना इष्टतम होता है, जो उच्च-यातायात परिदृश्यों में कंटेनर संसाधन प्रबंधन में बाधा डालता है, एक अतुल्यकालिक मॉडल से आवश्यक
अतिरिक्त कार्य और रखरखाव के विरुद्ध।
अंततः, संज्ञानात्मक जटिलता को कम करने और जिम्मेदारियों को अलग करने के लिए इस प्रकार की प्रक्रियाओं के लिए एक अच्छा ढांचा लागू करना सबसे अच्छा है।
