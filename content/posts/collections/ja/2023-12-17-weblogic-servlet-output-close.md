---
title: WebLogicサーブレットで閉じられない出力ストリーム
url: weblogic-サーブレット-出力ストリーム-close
id: 122
category:
- jee: JEE
tags:
- weblogic
- サーブレット
author: Damian Terlecki
date: 2023-12-17T20:00:00
---

Javaでサーブレットの出力ストリーム（`javax.servlet.ServletResponse`から取得）に、ストリームが閉じられた後にデータを書き込もうとすると、通常は失敗します。特定の例外がスローされるわけではありませんが、
操作は単に無視されます。この振る舞いは、例えばTomcatサーバーで見られます。

しかし、WebLogicサーバーのサーブレット実装は、Tomcatで知られているものとは異なります。ストリームを閉じること、
そしてその代替である`PrintWriter`インターフェースも同様に、何もしないのと同じです。
呼び出し後も出力データを提供でき、それは最終的にクライアントに届きます。

```java
import javax.servlet.ServletOutputStream;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@WebServlet(name = "HelloWorldServlet", urlPatterns = "/hello")
public class HelloWorldServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest request,
                         HttpServletResponse response)
            throws IOException {
        ServletOutputStream os = response.getOutputStream();
        os.println("Hello World");
        os.flush();
        os.close();
        /*below output is not printed on the Tomcat*/
        os.println("Hello World after stream close."
                + " Is the response committed? "
                + response.isCommitted());
    }
}
```

<img src="/img/hq/weblogic-servlet-output-close.png" title="サーバーから返されたサーブレットのレスポンス" alt="出力ストリームを閉じた後に送信されたデータを含む、サーバーから返されたサーブレットのレスポンス">

ストリームを閉じることに関連するこの振る舞いは、Javaのシステムパラメータ`-Dweblogic.http.allowClosingServletOutputStream`を使用してTomcatで知られているものに変更できます。
しかし、`PrintWriter`インターフェースを使用する場合、このフラグのサポートは実装されていないことに注意してください。

この意図しないレスポンスの連結は、複数の異なる方法で解決できます：
- 閉じたストリームに書き込もうとしないコード構造（または統合設定）を作成する。
- ストリームの状態をサーブレットリクエストに関連付けられた一時的な属性に保存し、書き込み前に検証する。
- `HttpServletResponse`、`ServletOutputStream`、`PrintWriter`インターフェースのプロキシ/デコレータを作成し、
  `close()`、`write()`、および他の`print()`メソッドの実装をTomcatで知られている振る舞いに置き換える（[類似の例](https://stackoverflow.com/questions/8933054/how-to-read-and-copy-the-http-servlet-response-output-stream-content-for-logging)）。
- プロバイダの実装に基づいた「凝ったリフレクション」を介して（おそらくやらない方が良い）。

これらの解決策のいくつかは他よりも優れているように見えますが、特定のアプリケーションの文脈では、適応が難しい場合があります。

この振る舞いのプロバイダ実装は、標準的なサーバーモジュールの場所`/u01/oracle/wlserver/modules/`にある`com.oracle.weblogic.servlet.jar`ライブラリ内に見つかります。
WebLogicインストーラーはOracleのウェブサイトで入手できます。私が好むアプローチは、dockerイメージにあらかじめインストールされているバージョンで、
アカウントを作成して利用規約に同意した後、`container-registry.oracle.com/middleware/weblogic:14.1.1.0-dev-11`を入手できます。
