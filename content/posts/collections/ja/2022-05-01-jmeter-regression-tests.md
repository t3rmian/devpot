---
title: JMeterを使ったシンプルなWebサービス回帰テスト
url: jmeter-webサービス-回帰テスト
id: 85
category:
- testing: テスト
tags:
- jmeter
- webサービス
author: Damian Terlecki
date: 2022-05-01T20:00:00
source: https://gist.github.com/t3rmian/293a8933ed0952cb47e22328a5c3ffc0
---

JMeterには、すぐに使える強力なサンプラーがたくさん用意されており、1つのテストプランを作成して、それを異なる環境で実行することができます。
環境によって異なる入力データをデータベースから直接取得することで、テストケースの準備が大幅に簡素化されます。

IntelliSenseのような機能がないため、JMeterに習熟するには時間がかかります。しかし、非常にシンプルなテストを作成するだけで、
多くの場合、大きな価値をもたらすことができます。Webサービスの読み取りエンドポイントにおける回帰を検出するテストの準備方法を紹介します。

<img src="/img/hq/jmeter-regression-tests/jmeter-regression-test.png" alt="JMeterテストプラン" title="JMeterテストプラン">

### バージョン管理されたAPIの回帰

最もシンプルな形式では、同じリソースIDのWebサービスレスポンスを比較することで回帰を探すことができます。
そのためには、何らかの入力データが必要です。多くの場合、このデータはテストプランのユーザー変数、CSVファイル設定要素、または
JDBC/HTTPサンプラーを介して供給します。

<figure class="flex">
<img src="/img/hq/jmeter-regression-tests/jmeter-test-plan.png" alt="JMeterユーザー変数" title="JMeterユーザー変数">
<img src="/img/hq/jmeter-regression-tests/jmeter-jdbc-sampler.png" alt="JMeter JDBCサンプラー" title="JMeter JDBCサンプラー">
</figure>

入力データを用意したら、ForEachコントローラーと、APIエンドポイントの両方のバージョンに対応する2つのHTTPサンプラーを追加するだけです。
最初のサンプラーの下に、ステータスチェックを無効にするレスポンスアサーションを追加します。これにより、
レスポンスのステータスを無視し、後で独自のアサーションに頼ることができます。正規表現抽出を使用して、レスポンスデータを変数に抽出します。

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-foreach-controller.png" alt="JMeter ForEachコントローラー" title="JMeter ForEachコントローラー">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regex.png" alt="JMeter正規表現抽出" title="JMeter正規表現抽出">
</figure>

2番目のサンプラーの下で、レスポンスアサーションを再利用し、2番目のレスポンスを最初のサンプラーの変数と比較します。
これにより、同じエンドポイントの2つのバージョン間のレスポンスの変更を検出できます。結果をツリーで表示すると、
失敗したアサーションをすばやく確認できます。

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-response-assertion.png" alt="JMeterレスポンスアサーション" title="JMeterレスポンスアサーション">

すべての違いが回帰とは限りません。このテストはパフォーマンス最適化には有効です。機能的な変更については、
要件に合わせていくつかの調整を行う必要があるかもしれません。データの代わりにレスポンスコードを検証したり、REGEXのスコープを変更したり、JSON抽出を使用して
レスポンスの関連部分を比較したりします。

### バージョン管理されていないAPIの回帰

もう一つのアプローチは、ファイルに保存されたサンプラーの結果を比較することです。これは特に次の場合に便利です。
- バージョン管理されていないAPIがある場合
- 変更が何らかの内部フラグの背後でデプロイされている場合
- エンドポイントへの外部的な変更がないにもかかわらず、単に回帰を検出したい場合

レスポンスの後処理が不要であれば、このテストプランは非常にシンプルです。結果をツリーで表示を使用して、初期結果をファイルに保存します。
次に、デプロイメント後またはフラグを切り替えた後に再度呼び出し、両方のファイルを比較します。

同じ抽出ロジックを実現したい場合は、簡単なJSR223サンプラーを使用します。スクリプトで`vars["responseV1"]`行を介して抽出されたレスポンスを表示し、
このサンプラーの下に結果をツリーで表示を追加します。

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-save-results-tree.png" alt="JMeter結果をツリーで表示" title="JMeter結果をツリーで表示">

内容を比較するには、スレッドグループを連続して実行します（テストプランレベル）。これにより、ファイルが1つのスレッドグループで保存され、別のスレッドグループで検証されます。
比較は、OSプロセスサンプラーの`diff`コマンドを両方のファイルに対して使用するのと同じくらい簡単です。このオプションでは、期待されるリターンコードを設定することを忘れないでください。
そうでなければ、OSに依存しない方法は、
他のサンプラー（例：デバッグサンプラー）と以下を組み合わせることです。
- 2つのユーザーパラメータプリプロセッサーでファイルの内容を変数に抽出する：`${__FileToString(testResults1.xml)}`
- 両方の変数を比較するレスポンスアサーション

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-os-process-sampler.png" alt="JMeter OSプロセスサンプラー" title="JMeter OSプロセスサンプラー">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-user-parameters.png" alt="JMeterユーザーパラメータ" title="JMeterユーザーパラメータ">
</figure>

説明したプランは、JMeter 5.4.3で、Java 18の`jwebserver`でスタブ化されたレスポンスに対して実行されました。
関連するソースファイルはページの下部にあります。
独自の回帰テストの出発点として自由に使用してください。

