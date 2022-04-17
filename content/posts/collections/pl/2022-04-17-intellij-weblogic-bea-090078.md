---
title: IntelliJ WebLogic BEA-090078
url: intellij-weblogic-bea-090078
id: 84
category:
  - other: Inne
tags:
  - weblogic
author: Damian Terlecki
date: 2022-04-17T20:00:00
---

BEA-090078 to błąd informujący o zablokowaniu konta na serwerze WebLogic na skutek przekroczenia limitu nieprawidłowych
prób zalogowania. Mimo podania poprawnych danych logowania, natrętny błąd objawia się co pewien czas przy startowania serwera z poziomu IDE IntelliJ (wersja 2021.3.3 i starsze).
Z dużym prawdopodobieństwem, gdy zamkniemy edytor w trakcie działania serwera i wybierzemy opcję *terminate*, przy kolejnym jego uruchomieniu zobaczymy wspomniany błąd.

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

Możemy odblokować użytkownika z poziomu innego konta, jednak ponowne uruchomienie zwyczajnie resetuje blokadę.
Natomiast reset hasła za pomocą pliku `boot.properties` nie jest tutaj rozwiązaniem problemu.
Przy próbie połączenia z IDE w celu zatrzymania serwera widzimy hasło, inne niż ustawiliśmy, spoza zakresu ASCII:

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

Wartość hasła pochodzi z pliku KeePass wskazanego przez konfigurację IDE: *Settings > Appearance & Behavior > System Settings > Passwords*.
Rozwijając ikonkę opcji, możemy ustawić własne hasło do pliku i otworzyć go podglądając zapisane informacje.
Szukane hasło znajdziemy poprzez CREDENTIAL_ALIAS zapisany w konfiguracji projektu *.idea/workspace.xml*.
To w tym miejscu zauważymy niepoprawne znaki.

Obejściem problemu jest ponowne wpisanie hasła w konfiguracji uruchomieniowej WebLogica w IntelliJ.
Przy tym należy zwrócić uwagę, aby zmiany faktycznie zostały zaaplikowane. Aby przycisk zapisania zmian się podświetlił konieczna może być
zmiana nazwy użytkownika na inną i z powrotem. Z kolei rezygnacja z zamykania IDE z wykorzystaniem funkcji terminate powinna
zapobiec występowaniu błędu.