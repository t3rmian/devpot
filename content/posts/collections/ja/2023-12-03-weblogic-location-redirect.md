---
title: WebLogicでのサーブレットリダイレクションプロトコル
url: weblogic-サーブレット-https-リダイレクト
id: 121
category:
- jee: JEE
tags:
- weblogic
- サーブレット
author: Damian Terlecki
date: 2023-12-03T20:00:00
---


Web開発において、ブラウザは特定のHTTPステータスコードに対して「Location」ヘッダーを含むレスポンスを受け取ると、自動的にリダイレクトします。自動リダイレクトをトリガーするコードは3で始まります。Java Servlet API、すなわち`javax.servlet.http.HttpServletResponse.sendRedirect(String)`を使用すると、
通常は302になります。

サーブレットアプリケーションをTomcatなどからWebLogicに移行すると、「Location」ヘッダーが絶対URLに評価されてしまうという奇妙な現象に遭遇することがあります。残念ながら、これはSSLを終端し、HTTPポートでWebLogicに接続するリバースプロキシとうまく連携しない可能性があります。

<img src="/img/hq/browser-mixed-content.png" title="ブラウザは、リソースのインクルードやAJAXの使用時に、混合コンテンツエラーでHTTPSのダウングレードを引き起こすリクエストをブロックします" alt="Webブラウザは、ウェブサイト閲覧中のユーザーのセキュリティとプライバシーを強化するために、混合コンテンツをブロックします。混合コンテンツとは、安全な（HTTPS）プロトコルで読み込まれたWebページに、安全でない（HTTP）要素が含まれている状態を指します。安全なWebページ（HTTPSで読み込まれた）が、安全でない接続（HTTP）からのリソース（画像、スクリプト、スタイルシート、AJAXのロケーションリダイレクトなど）を含むと、セキュリティ上の脆弱性が生まれます。">

## WebLogicの絶対URLリダイレクト

WebLogic上のサーブレットは、HTTPSリバースプロキシ経由で接続しているにもかかわらず（転送されたヘッダーに関わらず）、HTTPプロトコルのLocationにリダイレクトすることがあります。
https://example.com/app/foo にPOSTを送信するとします。これはリバースプロキシの背後で`sendRedirect("bar")`を呼び出すWebLogicサーブレットです。

```shell
# リクエストヘッダー（簡潔さのため、無関係なヘッダーは省略）
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

リバースプロキシからのリクエスト：
```shell
POST /app/foo HTTP/1.1
Host: [example.com]
X-forwarded-host: [example.com]
Upgrade-insecure-requests: [1]
X-forwarded-server: [example.com]
X-forwarded-for: [192.168.0.100]
X-forwarded-proto: [https]
X-forwarded-ssl: [on]
```

転送されたヘッダーが存在するにもかかわらず、WebLogicはHTTPSではなくHTTPのロケーションで応答します：
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## 混合コンテンツリダイレクトの解決策

これにはさまざまな解決策があります：
- プロキシでレスポンスヘッダーを書き換える。
- レスポンスヘッダーを書き換えるカスタムフィルターを実装する。
- WebLogicコンソールで「WebLogic Plugin Enabled」オプションをオンにし、プロキシで「WL-Proxy-SSL: ON」リクエストヘッダーを追加する。
- WebLogicコンソールにWLフロントエンドホストとポートを追加する。

しかし、提供されているサーブレットライブラリの内容を調べた結果、
最も安全で簡単な解決策は、リダイレクション中の絶対URL評価を無効にすることだと気づきました。

> これをデバッグするために、`sendRedirect()`メソッドにブレークポイントを置き、任意の`getClass().getProtectionDomain().getCodeSource().getLocation()`を実行しました。
> `HttpServletResponse`実装の場所がわかったので、それをIDEのクラスパスに追加しました：
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (公式の12.1.2.4 dockerイメージより)。

`WEB-INF/weblogic.xml`ウェブアプリケーションディスクリプタでこれを設定できることがわかりました。こんな感じです（`1.9` XSDバージョンを
お使いの[WebLogicと互換性のあるバージョン](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html)に置き換えてください）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                  http://xmlns.oracle.com/weblogic/weblogic-web-app/1.9/weblogic-web-app.xsd">
    <context-root>/app</context-root>
    <container-descriptor>
        <redirect-with-absolute-url>false</redirect-with-absolute-url>
    </container-descriptor>
</weblogic-web-app>
```

> XSDファイルのコメントより：redirect-with-absolute-url要素がfalseに設定されている場合、サーブレットコンテナはリダイレクトのlocationヘッダー内の相対URLを絶対URLに変換しません。
