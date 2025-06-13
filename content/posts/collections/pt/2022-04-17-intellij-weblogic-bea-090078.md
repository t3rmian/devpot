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

O BEA-090078 é um erro que informa que a conta no servidor WebLogic foi bloqueada como resultado de exceder o limite de tentativas de login inválidas. Apesar de fornecer as credenciais corretas, um erro intrusivo aparece ocasionalmente ao iniciar o servidor a partir do IntelliJ (versão 2021.3.3 e anteriores).
Com alta probabilidade, após fechar o IDE e o servidor usando a opção de terminar, você verá esse erro na próxima vez que iniciá-lo.

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

Você pode desbloquear o usuário usando outra conta, mas uma simples reinicialização do servidor reverte o bloqueio. Além disso, redefinir a senha usando o arquivo `boot.properties` não resolve o problema aqui. Quando o IDE se conecta para parar o servidor, você verá uma senha em texto plano na saída do console, diferente da definida, fora do intervalo ASCII:

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

O valor da senha vem do arquivo KeePass indicado pela configuração do IDE: Settings > Appearance & Behavior > System Settings > Passwords. Ao expandir o ícone de opções, você pode definir sua própria senha para o arquivo, abri-lo e espiar as credenciais salvas. O culpado pode ser encontrado através do valor da opção CREDENTIAL_ALIAS salvo na configuração do projeto em `.idea/workspace.xml`. Neste ponto, você pode notar caracteres incorretos no KeePass.

A solução alternativa é reinserir a senha na configuração de execução do WebLogic no IntelliJ. Certifique-se de que as alterações sejam realmente aplicadas. Pode ser necessário alterar o nome de usuário temporariamente para que o botão de aplicar fique destacado. Finalmente, esqueça de fechar o IDE com a função de terminar, e você não deverá mais encontrar o erro.
