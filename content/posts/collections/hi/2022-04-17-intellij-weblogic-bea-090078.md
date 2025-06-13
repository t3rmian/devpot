---
title: IntelliJ WebLogic BEA-090078
url: intellij-weblogic-bea-090078
id: 84
category:
- other: विविध
tags:
- वेबलॉजिक
author: Damian Terlecki
date: 2022-04-17T20:00:00
---

BEA-090078 एक त्रुटि है जो यह सूचित करती है कि WebLogic सर्वर पर खाता अमान्य लॉगिन प्रयासों की सीमा पार करने के परिणामस्वरूप ब्लॉक कर दिया गया है। सही क्रेडेंशियल प्रदान करने के बावजूद, IntelliJ (संस्करण 2021.3.3 और पहले) से सर्वर शुरू करते समय कभी-कभी एक दखल देने वाली त्रुटि दिखाई देती है। बहुत अधिक संभावना है कि IDE और सर्वर को टर्मिनेट विकल्प का उपयोग करके बंद करने के बाद, अगली बार जब आप इसे शुरू करेंगे तो आपको यह त्रुटि दिखाई देगी।

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

आप किसी अन्य खाते का उपयोग करके उपयोगकर्ता को अनब्लॉक कर सकते हैं, लेकिन एक साधारण सर्वर पुनरारंभ लॉक को रीसेट कर देता है। इसके अलावा, `boot.properties` फ़ाइल का उपयोग करके पासवर्ड रीसेट करने से यहां समस्या हल नहीं होती है। जब IDE सर्वर को रोकने के लिए कनेक्ट होता है, तो आप कंसोल आउटपुट में एक प्लेनटेक्स्ट पासवर्ड देखेंगे, जो सेट किए गए पासवर्ड से अलग है, ASCII सीमा के बाहर:

```html
C:\wls\domains\admin\bin\stopWebLogic.cmd weblogic �w�F`�G�Ể t3://localhost:7001
Disconnected from the target VM, address: '127.0.0.1:6690', transport: 'socket'
Disconnected from server
Stopping Weblogic Server...

Process finished with exit code 0

Initializing WebLogic Scripting Tool (WLST) ...

Welcome to WebLogic Server Administration Scripting Shell

Type help() for help on available commands

Connecting to t3://localhost:7001 with userid weblogic ...
This Exception occurred at Fri Apr 15 18:09:43 CEST 2022.
javax.naming.AuthenticationException: User failed to be authenticated. [Root exception is java.lang.SecurityException: User failed to be authenticated.]
Problem invoking WLST - Traceback (innermost last):
  File "C:\wls\domains\admin\shutdown.py", line 1, in ?
  File "<iostream>", line 19, in connect
  File "<iostream>", line 553, in raiseWLSTException
WLSTException: Error occurred while performing connect : User failed to be authenticated. 
Use dumpStack() to view the full stacktrace :

Done
```

पासवर्ड मान IDE कॉन्फ़िगरेशन द्वारा इंगित KeePass फ़ाइल से आता है: Settings > Appearance & Behavior > System Settings > Passwords। विकल्प आइकन का विस्तार करके, आप फ़ाइल के लिए अपना स्वयं का पासवर्ड सेट कर सकते हैं, इसे खोल सकते हैं, और सहेजे गए क्रेडेंशियल्स पर एक नज़र डाल सकते हैं। अपराधी को प्रोजेक्ट कॉन्फ़िगरेशन में `.idea/workspace.xml` पर सहेजे गए CREDENTIAL_ALIAS विकल्प मान के माध्यम से देखा जा सकता है। इस बिंदु पर, आप KeePass में गलत वर्णों को नोटिस कर सकते हैं।

इसका समाधान IntelliJ में WebLogic रन कॉन्फ़िगरेशन में पासवर्ड को फिर से दर्ज करना है। सुनिश्चित करें कि परिवर्तन वास्तव में लागू किए गए हैं। आपको उपयोगकर्ता नाम को अस्थायी रूप से बदलने की आवश्यकता हो सकती है ताकि लागू करें बटन हाइलाइट हो जाए। अंत में, टर्मिनेट फ़ंक्शन के साथ IDE को बंद करने के बारे में भूल जाएं, और आपको अब त्रुटि का सामना नहीं करना पड़ेगा।
