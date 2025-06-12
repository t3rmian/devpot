---
title: WebLogic EJBとロードバランス
url: weblogic-ejb-ロードバランス
id: 125
category:
- jee: JEE
tags:
- weblogic
- パフォーマンス
author: Damian Terlecki
date: 2024-02-25T20:00:00
---

最近、WebLogic上の`@Remote` `@EJB`インターフェースのロードバランシング機能について質問されました。
リモートインターフェースはロードバランスされるのか？それはコンテキストに依存するのか？呼び出しがロードバランスされるのか、それともルックアップだけなのか？
クライアント側から、どのクラスタノードがリクエストを処理したかを知ることはできるのか？
これらのコンセプトを理解しておくと、パフォーマンスとスケーラビリティに優れたプロセスを実装する上で、きっと役立つはずです。

## ステートレスEJBリモートインターフェースのロードバランシング特性

これらの質問に答えるため、まず[WebLogic 14.1.1.0のドキュメント](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/clust/load_balancing.html#GUID-2470EEE9-F6F9-44EF-BA54-671728E93DE6)を参照しましょう
（古いバージョンでも類似点が見つかります）。
そこにはステートレスEJBリモートインターフェースのロードバランシング特性が記述されています。
要するに、2種類の接続があります：
1. クライアントからサーバーへ
2. サーバーからサーバーへ

クライアントからサーバーへの接続と呼び出しは、ラウンドロビン（デフォルト）、重みベース、ランダムの3つの戦略のいずれかを使用してロードバランスされます。
あるいは、サーバーアフィニティを優先してロードバランシングをオフにすることもできます。
サーバーアフィニティを使用する場合でも、管理対象サーバーの代わりにクラスタURIを使用し、かつ新しい初期コンテキストを作成するレベルでのみ、ロードバランシングの対象となります。
これらのオプションはすべてフェイルオーバーをサポートしています。

サーバーからサーバーへの接続については、サーバーアフィニティオプションがサーバー間のロードバランシングに影響を与えないことを理解することが重要です。
さらに、1つのクラスタ内では、WLSはリクエストを受け取ったノードと同じノード上にあるEJBを常に使用します。これははるかに効率的だからです。
いわゆるオブジェクトコロケーションは、`@EJB`内での`@Remote`インターフェースの使用を最適でないものにします（不要なシリアライズが発生します）。
偶然にも、クライアントの`UserTransaction`の処理や、オプションでXAについても同様の動作が記述されています。

<img src="/img/hq/weblogic-cluster-load-balancing.svg" title="WebLogic リモートEJBロードバランシング（簡易版）" alt="WebLogic リモートEJBロードバランシングチャート（簡易版）">

コロケーションが行われない（逆説的にロードバランシングが行われる）のは、例えば、多層Webアプリケーション設定のティアごとのクラスタ構成のように、別々のクラスタ間です。
コロケーションを望まない場合、代替の処理オプションはロードバランスされたJMSデスティネーションを介する方法です。
そうでなければ、WLSクライアントとして機能するカスタムクラスローダーを介してルックアップをプロキシすることも考えられますが、これはテストされたり推奨されたりする方法ではありません。

## どのサーバーが私の（クライアントの）リクエストを処理したかを特定する

時々、どのサーバーが特定のりクエストを処理しているかを知りたい場合があります。
私はかつて、クラスタ上で新しいアプリケーションバージョンが非同期にデプロイされ、ラウンドロビン方式で2つの異なるレスポンスを受け取るという事態に遭遇したことがあります。レスポンスを特定のサーバーに結びつける方法を見つけ出すことで、不要な再デプロイやクラスタ全体のシャットダウンなしに問題を解決できました。

一つの方法は、リクエスト/レスポンスを識別可能なロギングを実装することです。
その場で使える何かはあるでしょうか？
WLSを使ったことがあるなら、[`wlthint3client.jar`ライブラリ](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/wlthint3client.html#GUID-4EB44FDC-51E6-43B0-8963-D1101238CAD9)のオブジェクト内にそのような情報が存在するかもしれないことをご存知かもしれません。
これはWLSへの接続に使用され、`t3`プロトコルのロードバランシングロジックを含んでいます。

しかし、それだけではありません。ロードバランシングには、使用できる特定のロガーがあります。
それがなければ、参照されるロードバランサーの内部状態にアクセスするEJBスタブ呼び出しの周りにカスタムラッパーを作成することに頼らざるを得なくなります。

<img src="/img/hq/weblogic-remote-ejb-stub-cluster-ref.png" title='最近 "myRemoteRef" EJB呼び出しを処理したWLS名をIntelliJでデバッグ評価' alt="最近EJB呼び出しを処理したWLS名をIntelliJでデバッグ評価したスクリーンショット">

*Wlthint3client*のロギングは、内部でJUL（Java Util Logging）を使用しています。サードパーティのロギングフレームワークと統合する場合は、`jul-to-slf4j`のようなブリッジを探してください。
ロギングを有効にするには、アプリケーションを`-Dweblogic.debug.DebugLoadBalancing` JVMプロパティ付きで起動するか、共有ロガーに対してプログラム的に設定します。

<img src="/img/hq/weblogic-debug-load-balancing.png" title="WebLogic DebugLoadBalancingデバッガー" alt="WebLogic DebugLoadBalancingデバッガー">

```java
weblogic.diagnostics.debug.DebugLogger
        .getDebugLogger("DebugLoadBalancing")
        .setDebugEnabled(false);
```

次に、お使いのフレームワークに従ってロギングレベルとアペンドを設定する必要があります。
ここで、`displayName`は`Debug`プレフィックスが削除されたロガー名、つまりJULロガー名は`LoadBalancing`になります。
これにより、以下のようなログエントリが期待できます。

```plaintext
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1 to 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2 to 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3 to 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1
```

スレッド名と時間（ロギング形式）、または他のコンテキスト関連情報と組み合わせることで、各リクエストを特定のビジネスプロセスとEJBノードに結びつけることができます。
もう一つの便利なロガーは`DebugFailOver`で、それほどでもありませんが`DebugMessaging`もあります。最後のものは、追加の`-Dweblogic.kernel.debug=true`を設定した後に主に機能し、
メッセージをコンソールにバイトプリティ形式で出力します。
