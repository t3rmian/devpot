---
title: IntelliJ WebLogicのBEA-090078エラー
url: intellij-weblogic-bea-090078
id: 84
category:
- other: その他
tags:
- weblogic
author: Damian Terlecki
date: 2022-04-17T20:00:00
---

BEA-090078は、無効なログイン試行の制限を超えた結果、WebLogicサーバー上のアカウントがブロックされたことを通知するエラーです。
正しい認証情報を提供しているにもかかわらず、IntelliJ（バージョン2021.3.3以前）からサーバーを起動すると、時折この厄介なエラーが表示されます。
IDEとサーバーを終了オプションで閉じた後、次に起動するときにこのエラーが表示される可能性が高いです。

<img src="/img/hq/intellij-weblogic-bea-090078.png" alt="IntelliJ" title="IntelliJ">

```xml
<15-Apr-2022 18:01:00,492 o'clock CEST> <Notice> <WebLogicServer> <BEA-000365> <Server state changed to RUNNING.> 
<15-Apr-2022 18:01:05,359 o'clock CEST> <Notice> <Security> <BEA-090078> <User weblogic in security realm myrealm has had  5 invalid login attempts, locking account for 30 minutes.> 
```

別のアカウントを使用してユーザーのブロックを解除できますが、サーバーを再起動するだけでロックはリセットされます。さらに、`boot.properties`ファイルを使用してパスワードをリセットしても、ここでは問題は解決しません。
IDEがサーバーを停止するために接続すると、コンソール出力に設定したものとは異なる、ASCII範囲外の平文パスワードが表示されます。

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

パスワードの値は、IDEの設定で指定されたKeePassファイルから来ています：Settings > Appearance & Behavior > System Settings > Passwords。オプションアイコンを展開すると、ファイルに独自のパスワードを設定し、それを開いて保存されている認証情報を覗き見ることができます。
原因は、プロジェクト設定の`.idea/workspace.xml`に保存されているCREDENTIAL_ALIASオプションの値で調べることができます。この時点で、KeePassに不正な文字があることに気づくことができます。

回避策は、IntelliJのWebLogic実行構成でパスワードを再入力することです。
変更が実際に適用されていることを確認してください。適用ボタンがハイライトされるように、一時的にユーザー名を変更する必要があるかもしれません。
最後に、終了機能でIDEを閉じるのをやめれば、このエラーに遭遇することはなくなるはずです。
