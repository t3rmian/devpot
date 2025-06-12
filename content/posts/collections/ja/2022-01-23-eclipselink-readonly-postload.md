---
title: readOnly (EclipseLink) クエリ中のJPA @PostLoad
url: jpa-postload-readonly-eclipselink
id: 78
category:
- jpa: JPA
tags:
- sql
- eclipselink
author: Damian Terlecki
date: 2022-01-23T20:00:00
---
JPA 2.1仕様によれば、`@PostLoad`でアノテーションされたエンティティメソッドは、エンティティがデータベースからロードされる際のコールバックとして使用されます。
より正確には、エンティティが永続性コンテキストにロードされるときと、リフレッシュが呼び出されたときに発生します。しかし、
データベースからデータをフェッチするたびにこのメソッドが呼び出されるという誤解があります。

エンティティに設定された`@ReadOnly`アノテーションと、EclipseLink実装に固有の`QueryHints.READ_ONLY`（"eclipselink.read-only"）ヒントは、どちらもクエリ処理中に永続性コンテキストをバイパスすることを可能にします。
これは、より大きなデータセットをロードする際のヒープメモリ消費を削減する興味深い最適化オプションです。同時に、
永続性ユニットレベルで共有キャッシュを利用することもできます。エンティティを変更する必要がない場合には便利です。

しかし、上記の機能を使用すると、`@PostLoad`メソッドは呼び出されません。この状況の例を示すために、
そのようなメソッドを持つ単純なエンティティを使用します。

```java
package dev.termian.demo;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.eclipse.persistence.annotations.Customizer;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.PostLoad;
import javax.persistence.Table;
import javax.persistence.Transient;

@Getter
@Setter
@ToString(exclude = "id")
@Entity
@Table(name="users")
@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    @Transient
    private int index = 0;

    @PostLoad
    void postLoad() {
        index++;
    }

}
```

データベースからロードした後の`index`フィールドの値のテストは、*readOnly*クエリではメソッドが呼び出されなかったことを示しています。

```java
package dev.termian.demo;

import org.eclipse.persistence.config.HintValues;
import org.eclipse.persistence.config.QueryHints;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import javax.persistence.TypedQuery;
import javax.persistence.criteria.CriteriaBuilder;
import javax.persistence.criteria.CriteriaQuery;
import javax.transaction.Transactional;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

@SpringBootTest
class DemoApplicationTests {

    @PersistenceContext
    EntityManager em;

    @Test
    void testPostLoadReadOnly() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        query.setHint(QueryHints.READ_ONLY, HintValues.TRUE);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    @Test
    void testPostLoad() {
        CriteriaBuilder builder = em.getCriteriaBuilder();
        CriteriaQuery<User> criteria = builder.createQuery(User.class);
        TypedQuery<User> query = em.createQuery(criteria);

        List<User> users = query.getResultList();
        assertPostLoadExecutedOnce(users);
    }

    private void assertPostLoadExecutedOnce(List<User> users) {
        assertFalse(users.isEmpty());
        for (User user : users) {
            assertEquals(1, user.getIndex());
        }
    }

}
```

<img src="/img/hq/eclipselink-readonly-postload-not-invoked.png" alt="readOnlyクエリでは@PostLoadメソッドが呼び出されない" title="readOnlyクエリでは@PostLoadメソッドが呼び出されない">

ELによるターゲットの振る舞いがないため、オープンなバグレポート[336066](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066)
と[477063](https://bugs.eclipse.org/bugs/show_bug.cgi?id=477063)が見つかります。レポートの一つで、Jan
Vermeulenがこの問題がEclipseLinkのコードにどのように翻訳されるかを[説明しています](https://bugs.eclipse.org/bugs/show_bug.cgi?id=336066#c0)。
要するに、`@PostLoad`メソッドは、エンティティがコンテキストにロードされるときに発生するEclipseLinkの**clone**および**refresh**イベントにアタッチされます。しかし、
通常はUnit of Workの外部で発生し、潜在的に問題を解決できる**build**イベントにはフックされていません。

`@PostLoad`メソッドを永続性コンテキストを超えて拡張したい場合、エンティティのライフサイクルメソッドをEclipseLinkイベントにバインドするコードにたどり着く必要があります。
関連する操作は、永続性ユニットの初期化中に`EntityListener`クラスで行われます。
同時に、ELは永続性レイヤーをさらに設定するためのAPIを提供してくれます。以下の
インターフェースを使用して、我々の目的を達成できます。
- 永続性ユニットレベルで定義される`SessionCustomizer`
- エンティティレベルで定義される`DescriptorCustomizer`

## SessionCustomizer

セッションの初期化は通常、最初のエンティティマネージャ（永続性コンテキスト）が作成される直前に行われます。初期化中の
最後のステップの一つが設定です。インターフェースは、セッションパラメータを持つ1つのカスタマイズメソッドのみを提供します。
セッションから、このプロセスの前の段階で検出されたエンティティディスクリプタ(#1)の形で初期化されたメタデータを読み取ることができます。

```java
package dev.termian.demo;

import org.eclipse.persistence.config.SessionCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {

    @Override
    public void customize(Session session) {
        for (ClassDescriptor classDescriptor : session.getDescriptors().values()) { // #1
            DescriptorEventListener entityEventListener = classDescriptor.getEventManager()
                    .getEntityEventListener();
            if (entityEventListener instanceof EntityListener) { // #2
                setPostLoadToPostBuild((EntityListener<?>) entityEventListener);
            }
        }
    }

    private void setPostLoadToPostBuild(EntityListener<?> listener) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods(); // #3
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE,
                Collections.emptyList()); // #4
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            listener.setPostBuildMethod(postLoad); // #5
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

以前に発見されたクラスに関連付けられた*エンティティリスナー*(#2)には、エンティティの関連するライフサイクルメソッド(#3)への参照が含まれています。
EclipseLinkの*POST\_CLONE*イベント(#4)が`@PostLoad`メソッドにアタッチされていることを知っているので、*POST\_BUILD*イベント(#5)にもアタッチすることができます。

上記の解決策では、*postLoad*メソッドが2回（*build*と*clone*中に）呼び出される[状況](https://github.com/eclipse-ee4j/eclipselink/blob/2.7/foundation/org.eclipse.persistence.core/src/org/eclipse/persistence/internal/descriptors/ObjectBuilder.java#L2149)があります。
これは、オブジェクトがUnit of Work（永続性ユニット）でクローンされるときに発生する可能性があります。
中間リスナー(#6)を使用すると、このケースをカバーし、条件付きで(#7)*postBuild*を基本リスナーの*postClone*に委譲できます(#8)。


```java
public class PostLoadOnReadOnlySessionCustomizer implements SessionCustomizer {
    //...
    private void setPostLoadToPostBuild(EntityListener<?> listener, ClassDescriptor classDescriptor) {
        Map<String, List<Method>> eventMethods = listener.getAllEventMethods();
        List<Method> methods = eventMethods.getOrDefault(EntityListener.POST_CLONE, Collections.emptyList());
        if (!methods.isEmpty()) {
            Method postLoad = methods.get(0);
            classDescriptor.getEventManager().addListener(new DescriptorEventAdapter() { // #6
                @Override
                public void postBuild(DescriptorEvent event) {
                    if (!event.getSession().isUnitOfWork()) { // #7
                        listener.postClone(event); // #8
                    }
                }
            });
            System.out.println(postLoad + " bound to the EL postBuild");
        }
    }
}
```

コンフィギュレータは*persistence.xml*ファイルで適用します（適切な名前空間はJPAバージョン*2.x*と*3.x*で異なる場合があります）。
`eclipselink.session.customizer`プロパティの下にクラスのパッケージ名を提供してこれを定義します。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<persistence version="2.1" xmlns="http://xmlns.jcp.org/xml/ns/persistence"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/persistence 
             http://xmlns.jcp.org/xml/ns/persistence/persistence_2_1.xsd">
    <persistence-unit name="my-pu" transaction-type="RESOURCE_LOCAL">
        <!--...-->
        <properties>
            <!--...-->
            <property name="eclipselink.session.customizer"
                      value="dev.termian.demo.PostLoadOnReadOnlySessionCustomizer"/>
        </properties>
    </persistence-unit>
</persistence>
```

## DescriptorCustomizer

同様の拡張はエンティティレベルでも実装できます。設定時には、この場合、標準の
`EntityListener`は初期化されません(#9)。しかし、コードの必要な部分(#2, #7, #9)をイベント処理に移動することを妨げるものは何もありません。
実際、#8の例を同じようにリファクタリングすることもできます。

```java
package dev.termian.demo;

import org.eclipse.persistence.config.DescriptorCustomizer;
import org.eclipse.persistence.descriptors.ClassDescriptor;
import org.eclipse.persistence.descriptors.DescriptorEvent;
import org.eclipse.persistence.descriptors.DescriptorEventAdapter;
import org.eclipse.persistence.descriptors.DescriptorEventListener;
import org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener;
import org.eclipse.persistence.sessions.Session;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public class PostLoadOnReadOnlyDescriptorCustomizer extends DescriptorEventAdapter implements DescriptorCustomizer {

    @Override
    public void customize(ClassDescriptor descriptor) {
        assert descriptor.getEventManager().getEntityEventListener() == null; // #9
        descriptor.getEventManager().addListener(this);
    }

    @Override
    public void postBuild(DescriptorEvent event) {
        // ((User)event.getSource()).postLoad();
        if (!event.getSession().isUnitOfWork()) {
            DescriptorEventListener entityEventListener = event.getDescriptor().getEventManager().getEntityEventListener();
            if (entityEventListener instanceof EntityListener) {
                EntityListener<?> entityListener = (EntityListener<?>) entityEventListener;
                entityListener.postClone(event);
            }
        }
    }

}
```

`org.eclipse.persistence.annotations.Customizer`アノテーションを使用して、カスタマイザを適用できます。i.e.
`@Customizer(PostLoadOnReadOnlyDescriptorCustomizer.class)`。あるいは、
[永続性ディスクリプタ](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/p_descriptor_customizer.htm)や
EclipseLink [ORMディスクリプタ](https://www.eclipse.org/eclipselink/documentation/2.5/jpa/extensions/a_customizer.htm#BABDJIFC)を介して行うこともできます。

<img src="/img/hq/eclipselink-readonly-postload-workaround.png" alt="POST_BUILDイベントにアタッチされた@PostLoadメソッド" title="POST_BUILDイベントにアタッチされた@PostLoadメソッド">

このサンプルでは、内部のEclipseLinkインターフェース
`org.eclipse.persistence.internal.jpa.metadata.listeners.EntityListener`が使用されていることに注意してください（EL 2.7.4）。
この依存関係を削除するには、`@PostLoad`アノテーションが付けられたメソッドを独自の方法で検索する方法を見つけるだけです。
ただし、そのようなメソッドは`@MappedSuperclass`アノテーションが付けられた親クラスにも見つかる可能性があることに注意してください。

