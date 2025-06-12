---
title: SAAJ, CXF, Camelを使ったSOAPクライアントのサンプル
url: saaj-cxf-camel-soap-client
id: 107
category:
- java: Java
tags:
- camel
- cxf
- webサービス
- soap
- jaxb
- xml
- jaxws
- jakarta
author: Damian Terlecki
date: 2023-03-31T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

一般的にモノリシックなアーキテクチャを持ち、開発速度が遅くなりがちな大規模なレガシーシステムを扱う場合、
一時的な統合ソリューションを実装するための信頼できるツールがあると便利です。
Camelは複数のプロトコルとデータ形式をサポートしているため、多様なシステムとの統合が容易です。
さらに、スタンドアロンモードでは既存のインフラストラクチャへの干渉が必要ありません。
これにより、Camelはポーリング、スプリッター、スロットル、サーキットブレーカーなど、さまざまな統合パターンをもたらし、一時的なソリューションを構築するのに理想的です。

古いシステムの文脈におけるSOAPは、より人気のある（出現頻度の観点から）データ交換プロトコルの一つです。
XMLと組み合わせると、このようなWebサービスとの通信の実装は、HTTPプロトコルに基づく典型的なRESTアーキテクチャほど
高速ではないことがよくあります。ゼロから準備された迅速な一時的ソリューションが必要な場合はなおさらです。

## SAAJ

JavaはSAAJ（*SOAP with Attachments API for Java*）と呼ばれる一連のインターフェースをSOAP通信用に提供していますが、これは
`javax.xml.soap`パッケージ下の低レベルAPIです。はっきり言って、複雑なリクエストやレスポンスの構造にはあまり
便利ではありません。また、XML/XSDドキュメントの検証機能もありません。

しかし、いくつかの例を見てみましょう。
私のサンプルリポジトリhttps://github.com/t3rmian/jmeter-samplesに、SOAP Webサービスを持つサーバーがあります。
このサービスは、サンプルのリクエストを待ち受け、応答します。

<img src="/img/hq/soap-request-response.png" title='SOAPリクエストとレスポンスのサンプル' alt='<!--getUser_4_smith_request.xml Request-->&#10<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">&#10    <soap:Body>&#10        <ns2:getUserRequest xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        </ns2:getUserRequest>&#10    </soap:Body>&#10</soap:Envelope>&#10&#10<!--Response-->&#10<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">&#10<SOAP-ENV:Header/>&#10<SOAP-ENV:Body>&#10    <ns2:getUserResponse xmlns:ns2="https://github.com/t3rmian/jmeter-samples">&#10        <ns2:id>4</ns2:id>&#10        <ns2:name>smith</ns2:name>&#10        <ns2:email>smith@example.com</ns2:email>&#10        <ns2:registrationDate>2023-03-31T15:40:09.825+02:00</ns2:registrationDate>&#10    </ns2:getUserResponse>&#10</SOAP-ENV:Body>&#10</SOAP-ENV:Envelope>'>

SAAJと自己記述的なコードを使用してクライアントレベルから通信を実装するために必要なクラスは、次のようになります。

```java
import javax.xml.namespace.QName;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPBody;
import javax.xml.soap.SOAPBodyElement;
import javax.xml.soap.SOAPConnection;
import javax.xml.soap.SOAPConnectionFactory;
import javax.xml.soap.SOAPConstants;
import javax.xml.soap.SOAPElement;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;
import org.junit.Test;

import java.net.MalformedURLException;
import java.net.URL;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    static final String NS = "https://github.com/t3rmian/jmeter-samples";
    
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingSAAJ_Then_returnSmithName() throws SOAPException, MalformedURLException {
        SOAPMessage soapMessage = createGetUserSAAJMessage(EXISTING_USER_ID);
        URL endpointUrl = new URL(System.getProperty("wsEndpointAddress"));
        SOAPConnectionFactory soapConnectionFactory = SOAPConnectionFactory.newInstance();
        SOAPConnection soapConnection = soapConnectionFactory.createConnection();

        SOAPMessage response = soapConnection.call(soapMessage, endpointUrl);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSAAJMessage(long userId) throws SOAPException {
        MessageFactory messageFactory = MessageFactory.newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        SOAPBody body = envelope.getBody();
        SOAPBodyElement getUserRequest = body.addBodyElement(new QName(NS, "getUserRequest"));
        SOAPElement id = getUserRequest.addChildElement(new QName(NS, "id"));
        id.setTextContent(String.valueOf(userId));
        return soapMessage;
    }
}
```
このAPIを効果的に使用するには、要素の作成時とレスポンス内の要素を検索する際に名前空間を利用することを忘れないでください。
それらを省略すると、リクエストが拒否されるか、読み取り時に要素が見つからなくなり、オプションの部分にとっては致命的になる可能性があります。

> Javaプラットフォームの継続的な進化の中で、SAAJは非推奨となり、その後Java SE 11から[削除](https://docs.oracle.com/en/java/javase/11/migrate/index.html#GUID-FE4C4FB1-B91C-4)され、JDKには同梱されなくなりました。このパッケージは別のアーティファクト`javax.xml.soap:javax.xml.soap-api`に抽出されており、Maven Central Repositoryで見つけることができます。

## JAX-WSとApache CXF

CXF（2006年にCeltixとXFireという製品が統合されてできた頭字語）は、Webサービスとクライアントを構築するためのフレームワークとして、
特にWSSなどの高度な構造や拡張機能を扱う場合に、通信の実装をはるかに高速化します。
標準インターフェース（Java 11まで）の範囲では、JAX-WS（Java API for XML Web Services）のプロバイダーとしても機能します。

ツーリングの観点から、Apache CXFはWSDL/XSDファイルからWebサービスを表すJavaクラスを生成するためのMavenプラグイン`org.apache.cxf:cxf-codegen`を提供しています。

```xml
<plugin>
    <groupId>org.apache.cxf</groupId>
    <artifactId>cxf-codegen-plugin</artifactId>
    <version>3.5.5</version>
    <executions>
        <execution>
            <id>generate-sources</id>
            <phase>generate-sources</phase>
            <configuration>
                <wsdlOptions>
                    <wsdlOption>
                        <wsdl>
                            ${basedir}/src/main/resources/users.wsdl
                        </wsdl>
                    </wsdlOption>
                </wsdlOptions>
            </configuration>
            <goals>
                <goal>wsdl2java</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

> IDE（例：IntelliJ）は通常、このプラグインを自動的に呼び出しません。Mavenを直接使用するか、実行構成にこのステップを手動で含めることができます。

クライアントを実装するには、`org.apache.cxf`グループのアーティファクトが必要になります：
- `cxf-core` – 処理、マッピング、プロトコル処理を担当するクラス。
- `cxf-rt-frontend-jaxws` – クライアントクラス。
- `cxf-rt-databinding-jaxb` – XMLマッピング。
- `cxf-rt-transports-http` – HTTP通信。
- `cxf-rt-transports-soap` – SOAPサポート。
- `cxf-rt-features-logging` – メッセージロギング拡張。

> `Caused by: java.lang.NullPointerException: Cannot invoke "java.lang.reflect.Method.invoke(Object, Object[])" because "com.sun.xml.bind.v2 .runtime.reflect.opt.Injector.defineClass" is null`のようなエラーに直面している場合は、https://github.com/eclipse-ee4j/jaxb-ri/issues/1197の解決策を見てください。
> 私のサンプル回避策は、推移的なJAXB `jaxb-runtime`依存関係に加えて、XMLファイルからJavaコードを生成することに関連するアーティファクト`com.sun.xml.bind:jaxb-xjc`を追加することでした。提供された例ではクラスはすでに生成されていますが、異なるJavaバージョンで実行すると、JAXB実装が不足しているクラスを使用してアクセスを最適化しようとするため、内部エラーが発生する可能性があります。

今回のコードははるかにシンプルです。プラグインによって生成されたDTOを使用します。さらに、CXFの実装を
参照することで、クライアントを構成する機会があります（タイムアウト、ロギング、SSL）。

```java
import https.github_com.t3rmian.jmeter_samples.CommonFault;
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.Users;
import https.github_com.t3rmian.jmeter_samples.UsersService;
import org.apache.cxf.ext.logging.LoggingFeature;
import org.apache.cxf.frontend.ClientProxy;
import org.apache.cxf.transport.http.HTTPConduit;

import javax.xml.ws.BindingProvider;
import javax.xml.ws.WebServiceFeature;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCxf_Then_returnSmithName() throws CommonFault {
        UserPayload userPayload = new UserPayload();
        userPayload.setId(EXISTING_USER_ID);

        Users users = new UsersService().getUsersSoap11(getCxfLoggingFeature());
        ((HTTPConduit) ClientProxy.getClient(users).getConduit())
                .getClient().setReceiveTimeout(1000L);
        BindingProvider bindingProvider = (BindingProvider) users;
        bindingProvider.getRequestContext()
                .put(BindingProvider.ENDPOINT_ADDRESS_PROPERTY,
                        System.getProperty("wsEndpointAddress"));
        User user = users.getUser(userPayload);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static WebServiceFeature getCxfLoggingFeature() {
        LoggingFeature loggingFeature = new LoggingFeature();
        loggingFeature.setPrettyLogging(true);
        loggingFeature.setVerbose(true);
        loggingFeature.setLogMultipart(true);
        return loggingFeature;
    }
}
```

## CamelとSOAP

Camelは、その統合パターンを通じて、SOAP Webサービスとの通信を補完します。
それらのおかげで、データベースからデータをプールしたり、2つの異なるエンドポイント間のブリッジを実装したりできます。
バージョン3.18の時点で、CXFとの統合に必要な依存関係は、いくつかの小さなパッケージに[分割](https://camel.apache.org/manual/camel-3x-upgrade-guide-3_18.html#_camel_cxf)されました（CAMEL-9627）。
以前のバージョン、Java 8をサポートする2.xも、単一のアーティファクト、すなわち`org.apache.camel:camel-cxf`のみを必要としました。
名前に`soap`（3.18+）が付いているアーティファクトは、我々の例で機能します。

エンドポイント間のメッセージの流れのためのURIパスの概念は、多くの構成オプションを可能にします。
メッセージを構築する方法を定義するデータ形式を考えてみましょう。
4つの形式のいずれかを選択できます。
- RAW/MESSAGE - 生の形式、例えば`String`でメッセージを送受信できます。
- POJO - CXFの例のようなPOJO。
- PAYLOAD - Camelの`CxfPayload`にロードできる、SOAPボディを表す`org.w3c.dom` XMLドキュメント。
- CXF_MESSAGE – `javax.xml.soap`パッケージからのSOAPエンベロープ。

各データ形式には、CXFインターセプターの適用など、独自のルールセットがあります。それらについては[ドキュメント](https://camel.apache.org/components/3.20.x/cxf-component.html)で読むことができます。
しかし、始めるためには、クライアント実装のいくつかの例を調べることが重要です。

> さらに別の方法は、CXFの直接通信をBeanでラップし、それをCamelのルートにバインドすることです。

### RAW/MESSAGE

`RAW`形式は、例えばファイルからロードされたテキスト形式でメッセージを送信するのに適しています。
応答としてテキストを受け取りますが、これは実装が速い一方で、他の目的でアクセスするには適していない場合があります。

ただし、データを送信する前に、Camelがデータを適切な場所に送信するために使用するURIを作成する必要があります。

```java
import org.apache.camel.CamelContext;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.impl.DefaultCamelContext;

import static org.hamcrest.CoreMatchers.containsString;
import static org.hamcrest.MatcherAssert.assertThat;

public class CamelSoapClientIT {

    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfRawFormat_Then_returnSmithName() throws Exception {
        String message = getTestResourceContent("getUser_4_smith_request.xml");

        try (CamelContext camelContext = new DefaultCamelContext()) {
            camelContext.addRoutes(new RouteBuilder() {
                @Override
                public void configure() {
                    from("direct:getUser")
                            .log("Body before cxf route: ${body}")
                            .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
                            .to(getCxfUriWithVerboseLoggingOfDataFormat(DataFormat.RAW))
                            .log("Body after cxf route: ${body}");
                }
            });
            camelContext.start();
            String response = camelContext.createProducerTemplate()
                    .requestBody("direct:getUser", message, String.class);

            assertThat(response, containsString(String.valueOf(EXISTING_USER_ID)));
            assertThat(response, containsString(EXISTING_USER_NAME));
        }
    }

    static String getCxfUriWithVerboseLoggingOfDataFormat(DataFormat dataFormat) {
        return getCxfUri(dataFormat) +
                "&cxfConfigurer=#class:io.github.t3rmian.jmetersamples.CxfTimeoutConfigurer";
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}/UsersSoap11?dataFormat=" + dataFormat;
    }
}
```

URIは、含まれている依存関係で自動登録される`cxf`コンポーネントで始まります。式`{{wsEndpointAddress}}`は、環境変数または
Javaプロパティ（例：`http://localhost:8080/ws/users`）をロードできます。`cxfConfigurer`については後で説明します。今のところ、これは汎用的なCXFディスパッチモードの構成であり、
特定のスキーマにバインドされていない任意の構造を送信するのに便利です。

### POJO

`POJO`形式は、その単純さから、`cxf-codegen-plugin`プラグインによって生成されたクラスの使用を可能にします。
ただし、適切なバインディングが行われるように、URI設定を調整する必要があります。

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import https.github_com.t3rmian.jmeter_samples.User;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPOJOFormat_Then_returnSmithName() throws Exception {
        UserPayload userPayload = new ObjectFactory().createUserPayload();
        userPayload.setId(EXISTING_USER_ID);

        //... .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
        User user = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", userPayload, User.class);

        assertEquals(EXISTING_USER_NAME, user.getName());
        assertEquals(EXISTING_USER_ID, user.getId());
    }

    static String getCxfUri(DataFormat dataFormat) {
        return "cxf://{{wsEndpointAddress}}"
                + "?wsdlURL=classpath:users.wsdl"
                + "&serviceClass=https.github_com.t3rmian.jmeter_samples.Users"
                + "&dataFormat=" + dataFormat;
    }
}
```

`wsdlURL`パスの下には、SOAPサービスを記述するクラスパスファイルがあります。
次に、`serviceClass`パラメータがクライアント実装を決定し、これは`POJO`形式でのみ必須です。

`CxfConstants.OPERATION_NAME`と`CxfConstants.OPERATION_NAMESPACE`ヘッダーに基づいて、Camel/CXFは
メッセージを適切な操作に関連付けます。そうでなければ、推測します。同様に、サーバーが必要とする場合（例：1つのサービス下に複数の操作がある場合）、
`SOAPAction` HTTPヘッダーを`SoapBindingConstants.SOAP_ACTION`（SOAP 1.1）で設定できます。
SOAP 1.2の同等のパラメータは`SoapBindingConstants.PARAMETER_ACTION`です。

### PAYLOAD

`PAYLOAD`形式でメッセージを準備するのは、より困難です。まずXMLドキュメントを構築し、それを`CxfPayload`にロードします。
同様に、ヘッダーをコンストラクタの最初の引数として渡します。
レスポンスは典型的なXMLの方法で読み取り、指定された名前と名前空間でレスポンス内の要素を探します。

```java
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.apache.camel.component.cxf.common.CxfPayload;
import org.apache.cxf.binding.soap.SoapHeader;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.dom.DOMSource;
import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfPayloadFormat_Then_returnSmithName() throws Exception {
        List<Source> outElements = new ArrayList<>();
        Document outDocument = createGetUserXmlDocument(EXISTING_USER_ID);
        outElements.add(new DOMSource(outDocument.getDocumentElement()));
        CxfPayload<SoapHeader> payload = new CxfPayload<>(null, outElements, null);
        
        //...
        CxfPayload<Element> response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", payload, CxfPayload.class);
        Element getUserResponse = response.getBody().get(0);

        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(getUserResponse.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static Document createGetUserXmlDocument(long existingUserId)
            throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        DocumentBuilder builder = factory.newDocumentBuilder();
        Document document = builder.newDocument();
        document.setXmlVersion("1.1");

        Element rootElement = document.createElementNS(NS, "getUserRequest");
        document.appendChild(rootElement);

        Element childElement = document.createElementNS(NS, "id");
        childElement.appendChild(document.createTextNode(String.valueOf(existingUserId)));
        rootElement.appendChild(childElement);

        return document;
    }
}
```

### CXF_MESSAGE

`CXF_MESSAGE`形式は`PAYLOAD`に非常に似ていますが、今回は使用されるクラスがSOAPパッケージ（SAAJ）のものです。

```java
import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.soap.MessageFactory;
import javax.xml.soap.SOAPEnvelope;
import javax.xml.soap.SOAPException;
import javax.xml.soap.SOAPMessage;

import static org.junit.Assert.assertEquals;

public class CamelSoapClientIT {
    @Test
    public void given_existingUserSmith_When_getUserBySmithId_usingCamelCxfCxfMessageFormat_Then_returnSmithName() throws Exception {
        SOAPMessage soapMessage = createGetUserSOAPMessage(EXISTING_USER_ID);

        //...
        SOAPMessage response = camelContext.createProducerTemplate()
                .requestBody("direct:getUser", soapMessage, SOAPMessage.class);

        SOAPBody soapBody = response.getSOAPBody();
        assertEquals(soapBody.getElementsByTagNameNS(NS, "id")
                .item(0).getTextContent(), String.valueOf(EXISTING_USER_ID));
        assertEquals(soapBody.getElementsByTagNameNS(NS, "name")
                .item(0).getTextContent(), EXISTING_USER_NAME);
    }

    static SOAPMessage createGetUserSOAPMessage(long userId) 
            throws SOAPException, JAXBException {
        MessageFactory messageFactory = MessageFactory
                .newInstance(SOAPConstants.SOAP_1_1_PROTOCOL);
        SOAPMessage soapMessage = messageFactory.createMessage();
        SOAPEnvelope envelope = soapMessage.getSOAPPart().getEnvelope();
        ObjectFactory objectFactory = new ObjectFactory();
        UserPayload userPayload = objectFactory.createUserPayload();
        userPayload.setId(userId);
        JAXBContext.newInstance(UserPayload.class).createMarshaller()
                .marshal(objectFactory.createGetUserRequest(userPayload),
                        envelope.getBody());
        // or handcraft: envelope.getBody().addBodyElement().addChildElement()...
        return soapMessage;
    }
}
```

SAAJの例のように手動で要素を作成する代わりに、今回はJAXBインターフェースを使用してPOJOをSOAPボディに変換しましょう。

### CamelでのCXF設定

Camelの`cxfConfigurer` URI設定オプションを使用すると、CXFの設定にプラグインできます。これにより、接続オプションを設定したり、
通信をさらにセキュアにしたり（例：
*[mTLS](https://cxf.apache.org/docs/client-http-transport-including-ssl-support.html)*を使用、一方*Basic Auth*はURI経由で設定可能）、
またはインターセプターを設定したりできます。

```java
package io.github.t3rmian.jmetersamples;

import org.apache.camel.component.cxf.jaxws.CxfConfigurer;
import org.apache.cxf.endpoint.Client;
import org.apache.cxf.endpoint.Server;
import org.apache.cxf.ext.logging.LoggingInInterceptor;
import org.apache.cxf.ext.logging.LoggingOutInterceptor;
import org.apache.cxf.ext.logging.event.PrettyLoggingFilter;
import org.apache.cxf.ext.logging.slf4j.Slf4jVerboseEventSender;
import org.apache.cxf.frontend.AbstractWSDLBasedEndpointFactory;
import org.apache.cxf.transport.http.HTTPConduit;
import org.apache.cxf.transports.http.configuration.HTTPClientPolicy;

public class CxfTimeoutConfigurer implements CxfConfigurer {

    @Override
    public void configure(AbstractWSDLBasedEndpointFactory factoryBean) {}

    @Override
    public void configureClient(Client client) {
        HTTPConduit httpConduit = (HTTPConduit) client.getConduit();
        httpConduit.setClient(getHttpClientPolicy());
        LoggingInInterceptor loggingInInterceptor = new LoggingInInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingInInterceptor);
        LoggingOutInterceptor loggingOutInterceptor = new LoggingOutInterceptor(
                new PrettyLoggingFilter(new Slf4jVerboseEventSender())
        );
        client.getOutInterceptors().add(loggingOutInterceptor);
    }

    static HTTPClientPolicy getHttpClientPolicy() {
        HTTPClientPolicy httpClientPolicy = new HTTPClientPolicy();
        httpClientPolicy.setConnectionTimeout(1000);
        httpClientPolicy.setConnectionRequestTimeout(1000);
        httpClientPolicy.setReceiveTimeout(1000);
        return httpClientPolicy;
    }

    @Override
    public void configureServer(Server server) {}
}
```

上記の設定では、詳細設定に典型的なロギングを有効にしました。Camel URIを介して
`loggingFeatureEnabled=true`オプションにアクセスできますが、残念ながらこれはメッセージの内容をログに記録しません。ゼロから実装する場合、追加のロギングは
非常に価値があります。Camelの`log()`メソッドに頼っても最終的なメッセージは表示されず、マッピング前（送信時）/後（受信時）の
オブジェクトのみが表示されます。

代替の設定オプションは、クラスパスファイル[`cxf.xml`](https://cxf.apache.org/docs/configuration.html)です。
ただし、このオプションにはSpringの依存関係が必要です。この点では、`org.springframework:spring-context`のみが必要です。

## スタンドアロンCamel

上記のサンプルには、最終的なソリューションという点では何かが欠けています。その単純さにおいて、
依存関係[`org.apache.camel:camel-main`](https://camel.apache.org/components/3.20.x/others/main.html)は、プログラムの終了を待ちながらすべてのルートを
開始することを可能にします。さらに、自動構成スキャンも提供します。以下に短い
例を示します。

```java
package io.github.t3rmian.jmetersamples;

import https.github_com.t3rmian.jmeter_samples.ObjectFactory;
import https.github_com.t3rmian.jmeter_samples.User;
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.cxf.common.DataFormat;
import org.apache.camel.component.cxf.common.message.CxfConstants;
import org.apache.camel.main.BaseMainSupport;
import org.apache.camel.main.Main;
import org.apache.camel.main.MainListenerSupport;

public class CamelSoapClient {
    public static void main(String[] args) throws Exception {
        Main main = new Main(CamelSoapClient.class);
        main.addMainListener(new MainListenerSupport() {
            @Override
            public void afterStart(BaseMainSupport main) {
                UserPayload userPayload = new ObjectFactory().createUserPayload();
                userPayload.setId(EXISTING_USER_ID);
                System.out.println("Requesting user " + userPayload.getId());
                try (ProducerTemplate producerTemplate = main
                        .getCamelContext().createProducerTemplate()) {
                    User user = producerTemplate.requestBody("direct:getUser",
                            userPayload, User.class);
                    System.out.println("Response contains " + user.getName());
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
                System.out.println("Camel is running and waiting for SIGINT...");
            }
        });
        System.exit(main.run(args));
    }

    @SuppressWarnings("unused") // auto discovered by org.apache.camel.main.Main
    public static class MyRouteBuilder extends RouteBuilder {
        @Override
        public void configure() {
            from("direct:getUser")
                    .setHeader(CxfConstants.OPERATION_NAME, constant("getUser"))
// An alternative to cxfConfigurer URI parameter:
// .setHeader(Client.REQUEST_CONTEXT, () -> new HashMap<String, Object>() {{
//      this.put(HTTPClientPolicy.class.getName(),
//          CxfTimeoutConfigurer.getHttpClientPolicy());
// }})
                    .to(getCxfUri(DataFormat.POJO) + "&loggingFeatureEnabled=true")
                    .process(exchange -> exchange.getIn().setBody(exchange.getIn().getBody()));
        }
    }
}
```

Camelはスキャンプロセス中に`MyRouteBuilder`クラスを自動検出し、起動後、明示的に登録することなくパスを使用できます。

最初は、CamelConfigurationインターフェースを実装し、
`new Main().configure().addConfiguration(CamelSoapClient.class)`メソッドを使用して設定を追加しようとしました。しかし、
クラスにmainメソッドが含まれていたため、無視されました。
`new Main(CamelSoapClient.class)`を使用しても、私のクラスがCamelConfigurationインターフェースを実装している場合、まだ失敗しました。
```java
public class CamelSoapClient {
    @Override
    public void configure(CamelContext camelContext) throws Exception {
        camelContext.addRoutes(new RouteBuilder() {
            // ...
        });
    }
}
```
Camelは非静的な内部クラスを検出し、設定のためにそれを初期化しようとしました。
そして、かなり謎めいた`java.lang.NoSuchMethodException: io.github.t3rmian.jmetersamples.CamelSoapClient$2.<init>()`エラーをスローしました。

それで、うまくいく元の例に戻ります。ここでは`MainListenerSupport`を使用しており、これにより、
コンテキストの起動後に追加のコード（例えばテストコール）を呼び出すことができます。その後、SIGINTシグナルでそのようなアプリケーションを終了できます。

### Fat JAR

スタンドアロンアプリケーションを準備する最終ステップは、すべての依存関係を含むアーティファクト、いわゆる
Fat JARをビルドすることです。
このようなビルドには、`org.apache.camel:camel-maven-plugin`プラグインが必要です。これは`prepare-fatjar`ゴールで、
そのようなパッケージ用のCamel依存関係を準備します。例えば、複数のファイルを結合して`UberTypeConverterLoader`ファイルを作成し、
コンバーターが正しくロードされるように`META-INF`フォルダに保存します。

ただし、このプラグインは結果のアーティファクトを生成しません。アーティファクトを作成するには、別のプラグイン、例えば`maven-assembly-plugin`が必要です。
```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-assembly-plugin</artifactId>
    <configuration>
        <descriptorRefs>
            <descriptorRef>jar-with-dependencies</descriptorRef>
        </descriptorRefs>
        <archive>
            <manifest>
                <mainClass>io.github.t3rmian.jmetersamples.CamelSoapClient</mainClass>
            </manifest>
        </archive>
    </configuration>
    <executions>
        <execution>
            <id>make-assembly</id>
            <phase>package</phase>
            <goals>
                <goal>single</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

さて、CXFの依存関係を使用している場合、それらはCamelの依存関係と同じ方法で準備する必要があります。例えば、他のものの中でも、
`META-INF`フォルダに追記された`bus-extensions.txt`ファイルが必要です。`maven-shade-plugin`プラグインはこれに最適で、
CXFの適切な設定は[ドキュメント](https://cxf.apache.org/docs/bundling-cxf-into-single-jar-with-maven-shade-plugin.html)にあります。
`mainClass`の場所に独自の開始クラスを提供するだけです。

## まとめ

これで、SOAPクエリを構築し、レスポンスを読み、インターセプターを設定する方法がわかったので、
ビジネスロジックを実装するのはあなた次第です。依存関係を追加する際は、Javaプラットフォームの進化を忘れないでください。後続のバージョンでは、
一部のパッケージがJDKから除外され、別のアーティファクトになりました。さらに、最新のバージョンとプラグインは、
JEEの`javax`ネーミングからJakartaパッケージ名（Camel 4.x, CXF 4.x, JAXB 4.x）に移行しています。両方のパッケージを混在させると、
特に生成されたコードを検証しない場合に問題が発生することがよくあります。

例えば、JEEランタイムでJakartaアノテーションを使用した場合、それらが正確に解析される保証はありません。
`elementFormDefault = XmlNsForm.QUALIFIED`パッケージ設定があっても、ネストされたクエリエレメントが名前空間を剥ぎ取られてしまうことがあります。
これを疑う場合は、JAXBアノテーション付きクラスから生成されたスキーマをプリントして、この問題を確認してください。

```java
import https.github_com.t3rmian.jmeter_samples.UserPayload;
import javax.xml.bind.JAXBContext;
import javax.xml.bind.JAXBException;
import javax.xml.bind.SchemaOutputResolver;
import javax.xml.transform.Result;
import javax.xml.transform.stream.StreamResult;

import java.io.IOException;
import java.io.PrintWriter;

public class CamelSoapClientIT {
    static {
        printSchema();
    }

    private static void printSchema() throws JAXBException, IOException {
        JAXBContext jaxbContext = JAXBContext.newInstance(UserPayload.class);
        jaxbContext.generateSchema(new SchemaOutputResolver() {
            @Override
            public Result createOutput(String namespaceUri, String suggestedFileName) {
                StreamResult streamResult = new StreamResult(new PrintWriter(System.out) {
                    @Override
                    public void close() {
                    }
                });
                streamResult.setSystemId(suggestedFileName);
                return streamResult;
            }
        });
    }
}
```

