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

El BEA-090078 es un error que indica que la cuenta en el servidor WebLogic ha sido bloqueada por exceder el límite de intentos fallidos de inicio de sesión. Aunque se proporcionen las credenciales correctas, ocasionalmente aparece este error molesto al iniciar el servidor desde IntelliJ (versión 2021.3.3 y anteriores). Con alta probabilidad, después de cerrar el IDE y el servidor usando la opción de terminar, verás este error la próxima vez que lo inicies.

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

Puedes desbloquear el usuario usando otra cuenta, pero un simple reinicio del servidor restablece el bloqueo. Además, restablecer la contraseña usando el archivo `boot.properties` no resuelve el problema aquí. Cuando el IDE se conecta para detener el servidor, verás una contraseña en texto plano en la salida de la consola, diferente a la establecida y fuera del rango ASCII:

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

El valor de la contraseña proviene del archivo KeePass indicado por la configuración del IDE: Settings > Appearance & Behavior > System Settings > Passwords. Al expandir el icono de opciones, puedes establecer tu propia contraseña para el archivo, abrirlo y ver las credenciales guardadas. El responsable puede localizarse mediante el valor de la opción CREDENTIAL_ALIAS guardado en la configuración del proyecto en `.idea/workspace.xml`. En este punto, puedes notar caracteres incorrectos en el KeePass.

La solución temporal es volver a introducir la contraseña en la configuración de ejecución de WebLogic en IntelliJ. Asegúrate de que los cambios realmente se apliquen. Puede que necesites cambiar temporalmente el nombre de usuario para que el botón de aplicar se habilite. Finalmente, olvídate de cerrar el IDE con la función de terminar y no deberías volver a encontrar el error.
