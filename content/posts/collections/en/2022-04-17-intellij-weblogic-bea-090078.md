---
title: IntelliJ WebLogic BEA-090078
url: intellij-weblogic-bea-090078
id: 84
category:
  - other: Misc
tags:
  - weblogic
author: Damian Terlecki
date: 2022-04-17T20:00:00
---

The BEA-090078 is an error informing that the account on the WebLogic server has been blocked as a result of exceeding the
limit of invalid login attempts. Despite providing the correct credentials, an intrusive error occasionally appears
when starting the server from the IntelliJ (version 2021.3.3 and earlier).
With a high probability after closing the IDE and the server using a terminate option, you will see this error the next time you start it.

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

You can unblock the user using another account, but a simple server restart resets the lock. Moreover, resetting the password
using the `boot.properties` file does not solve the problem here. When the IDE connects to stop the server, you will
see a plaintext password in the console output, different than the one set, outside the ASCII range:

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

The password value comes from the KeePass file indicated by the IDE configuration: Settings > Appearance & Behavior >
System Settings > Passwords. By expanding the options icon, you can set your own password for the file, open it, and peek at the saved credentials.
The culprit can be looked up through the CREDENTIAL_ALIAS option value saved in the project
configuration at `.idea/workspace.xml`. At this point, you can notice incorrect characters in the KeePass.

The workaround is to re-enter the password in the WebLogic run configuration in the IntelliJ. Make sure that
the changes are actually applied. You may need to change the username temporarily so that the apply button gets highlighted.
Finally, forget about closing the IDE with the terminate function, and you should no longer encounter the error.