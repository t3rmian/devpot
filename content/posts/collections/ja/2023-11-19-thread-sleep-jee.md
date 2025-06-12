---
title: JEEにおけるThread.sleep
url: jee-thread-sleep
id: 120
category:
- jee: JEE
tags:
- スレッド
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

`Thread.sleep()`メソッドは、人為的な遅延を導入する一見簡単な方法ですが、JEE環境ではその使用は[一般的に推奨されません](https://www.oracle.com/java/technologies/restriction.html#threads)。
スレッドのスケジューリングを直接管理してしまいますが、これはアプリケーションサーバーのコンテナが担当すべきタスクです。この干渉は、
コンテナがリソース割り当てとスレッド管理を最適化する能力を妨げ、パフォーマンスの低下や
潜在的なボトルネックにつながる可能性があります。高トラフィックのシナリオでは、コンテナが空きスレッドを使い果たし、
リクエストの受信に遅延や失敗が生じることがあります。

## タイマーサービス

`Thread.sleep`に代わるJEE準拠の方法として、`TimerService`があります。
これは、開発者が特定の時間、遅延、または間隔で実行されるタスクをスケジュールできるようにするAPIセットです。

<img src="/img/hq/thread-sleep-jee.png" alt="JEEでThread.sleep()の代替としてTimerServiceのサンプルを実行した結果" title="TimerServiceサンプル実行時のコンソール出力結果">

タイマーサービスを使用するには、エンタープライズビーンに`TimerService`インターフェースリソースをインジェクトします。次に、
`createTimer()`メソッドを使用してタイマーを作成し、希望の実行時間またはスケジュールを指定します。最後に、
`@Timeout`アノテーションが付いたメソッドが、指定された遅延の後に実行されるべき作業を実装します。

`createTimer()`メソッドを呼び出す際に、`Serializable`パラメータを提供できます。これは、`@Timeout`アノテーションが付いたメソッド内の`Timer`パラメータから
`getInfo()`を呼び出すことで取得できます。これにより、作業の進捗を渡すことができます。

以下は、`foo()`メソッドと`bar()`メソッドの間に5秒の遅延を持たせた例です。

```java
import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.ejb.Timeout;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Stateless
public class MyEJB {
    public static class MyTimerInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private final LocalDateTime startDateTime;
        private final LocalDateTime fooEndDateTime;

        public MyTimerInfo(LocalDateTime startDateTime, LocalDateTime fooEndDate) {
            this.startDateTime = startDateTime;
            this.fooEndDateTime = fooEndDate;
        }
    }

    @Resource
    private TimerService timerService;

    public void runFooBar() {
        LocalDateTime workStartDate = LocalDateTime.now();
        System.out.println("Starting foo() at " + workStartDate);
        foo();
        LocalDateTime fooEndDate = LocalDateTime.now();
        System.out.println("Ended foo() at " + fooEndDate);
        long delay = TimeUnit.SECONDS.toMillis(5);
        timerService.createTimer(delay, new MyTimerInfo(workStartDate, fooEndDate));
    }

    @Timeout
    public void onTimeout(Timer timer) {
        if (timer.getInfo() instanceof MyTimerInfo) {
            MyTimerInfo myTimerInfo = (MyTimerInfo) timer.getInfo();
            LocalDateTime barStartDateTime = LocalDateTime.now();
            System.out.println("Starting bar() at " + barStartDateTime);
            bar(myTimerInfo);
            LocalDateTime workEndDateTime = LocalDateTime.now();
            System.out.println("Ended bar() at " + workEndDateTime);
            System.out.printf("Total time for foo[%sms] + delay[%sms] + bar[%sms] = %sms%n",
                    Duration.between(myTimerInfo.startDateTime, myTimerInfo.fooEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.fooEndDateTime, barStartDateTime).toMillis(),
                    Duration.between(barStartDateTime, workEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.startDateTime, workEndDateTime).toMillis());
        } else {
            System.err.println("Unknown timer config");
        }
    }

    public void foo() {/***/} // This could return tracking id
    public void bar(MyTimerInfo workProgress) {/***/}
}
```

`createTimer()`に加えて、`createSingleActionTimer()`、`createIntervalTimer()`、`createCalendarTimer()`といった、より自己記述的なメソッドがあります。
これらのAPIは、`persistent`オプション（デフォルトはtrue）を変更する方法を提供する`TimerConfig`オブジェクトにオプションでラップされた`Serializable`パラメータを期待します。これは、現在のJVMインスタンスを超えてタイマーの寿命を延ばす方法です。

`@Timeout`アノテーションが付いたメソッドには、2つの重要な制約があることに注意してください。
> EJB仕様では、このメソッドに指定できるトランザクション属性は`RequiresNew`（デフォルト）または`NotSupported`のみです。

> タイムアウトメソッドはアプリケーション例外をスローしてはなりません。

さらに、WebLogicでは、コンテナが`@Timeout`メソッドの呼び出し時にインターセプタを呼び出さない場合があることがわかりました。
この点や、お使いのプロバイダの他の同様のコンテナ機能に注意してください。

## まとめ

`Thread.sleep`に代わるJEE準拠の方法として、インジェクトされた`TimerService`リソースと`@Timeout`メソッドがあります。
基本的には、コードを少なくとも2つの部分に分割する必要がありますが、これは呼び出し階層が深く、プロセスがよりアトミックであるほど、簡単ではなくなります。

非同期の性質は、異なる通信フローを必要とする場合もあります。このような操作の結果を待っているのがユーザーである場合、
フィードバックメカニズム（例：即時かつクエリ可能な追跡識別子を提供する）について考える必要があります。

（変更の）複雑さのため、`Thread.sleep`が高トラフィックのシナリオでコンテナのリソース管理を妨げる可能性と、
非同期モデルに求められる追加の作業および保守とを天秤にかけることが、しばしば最適です。
最終的には、この種のプロセスに対して良いフレームワークを実装し、認知的な複雑さを軽減し、責任を分離することが最善です。
