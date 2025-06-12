---
title: JSPのエンコーディング
url: jsp-エンコーディング
id: 62
category:
- jee: JEE
tags:
- weblogic
- tomcat
author: Damian Terlecki
date: 2021-03-21T20:00:00
---

JSPテクノロジーで構築されたアプリケーションがある場合、通常、ターゲットサーバーはサーブレットコンテナを実装する単純なサーバー、
例えばTomcatになります。アプリケーションで非標準のダイアクリティカルマーク、ウムラウトなどを表示する場合、
それらが正しく表示されるか検証する価値があります。エンコーディングを正確に指定しないと、サーバーはJSPテンプレートのディレクティブを異なる方法で扱う可能性があります。

<img src="/img/hq/jsp-encoding.png" alt="JSPでの文字エンコーディングの問題を示す画像" title="JSPのエンコーディング問題">

## エンコーディング

JSPの場合、エンコーディングは`page`ディレクティブの属性を介して制御されます。
```java
<%@ page language="java" pageEncoding="UTF-8" contentType="text/html; UTF-8"%>
```
- `pageEncoding` – 翻訳時にページのエンコーディングを設定し、`contentType`がない場合はサーバーの応答時にも設定します。
- `contentType` – サーバーの応答時にエンコーディングを設定します。

拡張子によって、これらのパラメータのデフォルト値は異なる場合があります。
- `*.jsp` – `pageEncoding="ISO-8859-1" contentType="text/html; ISO-8859-1"`
- `*.jspx` – `pageEncoding="UTF-8" contentType="text/xml; UTF-8"` または `pageEncoding="UTF-16" contentType="text/xml; UTF-16"`

さらに、ページをインポートするには3つの方法があります。
- 翻訳時に考慮される**include**ディレクティブを介して：`<%@ include file="page.jsp" %>`
- 応答生成時に**include**アクション要素を介して：`<jsp:include page="page.jsp" />`
- または、応答生成時にJSTLタグでページをインポートする：
```java
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<c:import url="page.jsp" charEncoding="UTF-8"/>
```

タイミング（翻訳/応答）と選択された（またはされていない）文字エンコーディングに基づいて、さまざまな状況でさまざまな問題が発生する可能性があります。
各ページ（インクルードされるページも含む）に`pageEncoding`と`contentType`パラメータを追加し、
インポート時の`charEncoding`も忘れないようにすることをお勧めします。

## テスト
テスト用のプレイグラウンドを作成するには、[spring JSP demo](https://github.com/YogenRaii/spring-examples/tree/master/spring-boot-jsp)をお勧めします。
*hello.jsp*を置き換えて、エンコーディングパラメータをいじるためにサンプルのJSPテンプレートを使用できます。
```xml
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>UTF-8 Test</title>
</head>
<body>
    <h1>Main page:</h1>
    <h3>dynamic: ${name}</h3>
    <h3>static: Heizölrückstoßabdämpfung</h3>
    
    <h1>Directive include:</h1>
    <%@ include file="page.jsp" %>
    
    <h1>JSP include:</h1>
    <jsp:include page="page.jsp"/>
    
    <h1>Import:</h1>
    <c:import url="page.jsp" charEncoding="UTF-8"/>
</body>
</html>
```
*page.jsp*:
```html
<%@ page pageEncoding="UTF-8" contentType="text/html; UTF-8" %>
<h3>dynamic: ${name}</h3>
<h3>static: Heizölrückstoßabdämpfung</h3>
```

JSTLの依存関係を追加し、非組み込みサーバーにデプロイする場合は、パッケージングをWARに変更します。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <packaging>war</packaging>
    <!--...-->

    <dependencies>
        <!--...-->
		<dependency>
			<groupId>javax.servlet</groupId>
			<artifactId>jstl</artifactId>
			<version>1.2</version>
		</dependency>
    </dependencies>
</project>
```

次に、サーバーにデプロイするか、Mavenラッパーで実行します：`./mvnw clean spring-boot:run`そして[http://localhost:8080/?name=Heizölrückstoßabdämpfung](http://localhost:8080/?name=Heiz%C3%B6lr%C3%BCcksto%C3%9Fabd%C3%A4mpfung)を開きます。

興味深いことに、Tomcat（9）とWebLogic（12/14）は、特定のエンコーディングがない場合、わずかに異なる動作をします。
EL構文を使用してBean属性を参照する場合、例えば`${utf8Variable}`、TomcatはURLインポート中に変数値のエンコーディングに問題がないようですが、
WebLogicはそうではありません。
