---
title: EclipseLink detach a pole lazy (change tracking)
url: eclipselink-detached-lazy-field-fetch-change-tracking
id: 95
category:
  - jpa: JPA
tags:
  - eclipselink
  - wydajność
author: Damian Terlecki
date: 2022-09-18T20:00:00
---

W specyfikacji JPA zachowanie przy dostępie do atrybutu *lazy* encji w stanie *detached* nie jest jasno zdefiniowane. Godnym
uwagi zachowaniem EclipseLinka, w porównaniu z OpenJPA/Hibernate, jest próba zaciągnięcia takiego atrybutu z bazy przy włączonym *weavingu*.
Weaving oznacza tutaj manipulowanie kodem bajtowym skompilowanych klas Javy na potrzeby optymalizacji dostępu do bazy.

# Leniwe pobieranie po odłączeniu

Jeśli pracujesz z EclipseLinkiem, błąd *EclipseLink-7242* prawdopodobnie nie jest dla Ciebie niczym obcym.

> Caused by: Exception [EclipseLink-7242] (Eclipse Persistence Services - 2.7.10.v20211216-fe64cd39c3): org.eclipse.persistence.exceptions.ValidationException
> Exception Description: An attempt was made to traverse a relationship using indirection that had a null Session.  
> This often occurs when an entity with an uninstantiated LAZY relationship is serialized and that relationship is traversed after serialization.  
> To avoid this issue, instantiate the LAZY relationship prior to serialization.

Jednak w większą pułapkę możemy wpaść przy próbie dostępu do pola tuż po operacji `detach()`, ale jeszcze przed zamknięciem kontekstu *persistence*.
Wyobraź sobie, po załadowaniu encji chcesz zainicjować jej leniwy atrybut dowolną wartością z pamięci przed zwróceniem jej klientowi.

W taki wypadku EclipseLink najpierw pobierze ten atrybut z bazy danych przed przypisaniem wartości w ramach *change trackingu*.
Zależnie od mapowania poniesiesz koszt dodatkowego zapytania, w najgorszym przypadku wielu zapytań (również dla relacji wspomnianego atrybutu).
Popatrzmy na następującą definicję encji `Order`, która ma leniwe powiązanie `@OneToMany` z encjami `OrderItem`, a te z kolei jakieś powiązanie z produktem:

```java
import lombok.Getter;
import lombok.Setter;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OneToOne;
import javax.persistence.Table;
import java.util.List;

@Getter
@Setter
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @OneToMany(fetch = FetchType.LAZY, mappedBy = "order")
    private List<OrderItem> items;

    @OneToOne
    @JoinColumn(name = "user_id")
    private User user;
}
```

Teraz spróbujmy zainicjować atrybut po odłączeniu zamówienia, ale tuż przed zamknięciem kontekstu *persistence*.
W realnym scenariuszu możesz to zrobić, w celu zmniejszenia liczby zapytań, ponownie wykorzystując już załadowane dane (np. z pamięci podręcznej) lub
w celu zainicjalizowania go przy użyciu innych dostępnych informacji.

```java
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.Arrays;
import java.util.List;

@SpringBootTest
public class LazyTest {
    private final List<OrderItem> previouslyLoadedOrderItems = Arrays.asList(
            //...
    );

    @PersistenceContext(name = "my-pu")
    private EntityManager entityManager;

    @Test
    public void testFetchLazyAfterDetach() {
        Order order = entityManager.createQuery("SELECT o FROM Order o", Order.class)
                .setMaxResults(1)
                .getSingleResult();
        entityManager.detach(order);
        System.out.println("Order has been detached");
        order.setItems(previouslyLoadedOrderItems);
    }
}
```

Dokładne logi z tego, co dzieje się za kulisami (np. komunikacja z bazą) uzyskamy po ustawieniu `<property name="eclipselink.logging.level" value="FINEST"/>` w pliku *persitence.xml*.
Jeśli tkanie jest wyłączone, po napisaniu "Order has been detached" nie są wykonywane żadne dodatkowe czynności.
Spróbuj jednak przeprowadzić test z dynamicznym *weavingiem*:
- w JEE *weaving* jest zazwyczaj włączany automatycznie wspierany przez serwer aplikacyjny;
- w JSE możesz go przetestować, konfigurując agenta Javy. Wskaż artefakt EclipseLinka jako argument uruchomieniowy, np. z lokalnego repozytorium Mavena: `java -javaagent:C:/Users/t3rmian/.m2/repository/org/eclipse/persistence/eclipselink/2.7.10/eclipselink-2.7.10.jar ...`

Tym razem zobaczysz dodatkowe zapytania, które zaciągają dane relacji `items`:
```java
Order has been detached
[EL Finest]: query: 2022-09-18 17:10:10.61--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadAllQuery(name="items" referenceClass=OrderItem )
[EL Fine]: sql: 2022-09-18 17:10:10.612--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT id, price, quantity, order_id, product_id FROM order_items WHERE (order_id = ?)
	bind => [1]
[EL Finest]: query: 2022-09-18 17:10:10.627--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="order" referenceClass=Order )
[EL Finest]: query: 2022-09-18 17:10:10.628--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="product" referenceClass=Product )
[EL Fine]: sql: 2022-09-18 17:10:10.628--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT ID, CODE, DESCRIPTION, NAME FROM products WHERE (ID = ?)
	bind => [1]
[EL Finest]: query: 2022-09-18 17:10:10.637--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="order" referenceClass=Order )
[EL Finest]: query: 2022-09-18 17:10:10.637--UnitOfWork(1086276486)--Thread(Thread[main,5,main])--Execute query ReadObjectQuery(name="product" referenceClass=Product )
[EL Fine]: sql: 2022-09-18 17:10:10.637--ServerSession(1775897362)--Connection(1480805145)--Thread(Thread[main,5,main])--SELECT ID, CODE, DESCRIPTION, NAME FROM products WHERE (ID = ?)
	bind => [2]
```

## Śledzenie zmian (change tracking)

Włączenie statycznego *weavingu* da nam nieco większy wgląd w proces odpowiedzialny za to zachowanie (śledzenie zmian).
EclipseLink udostępnia program `org.eclipse.persistence.tools.weaving.jpa.StaticWeave`, za pomocą którego można ręcznie przetworzyć klasy.
Jeśli korzystasz z Mavena, cały proces znacznie upraszcza wtyczka `staticweave-maven-plugin`:

```xml
<build>
    <plugins>
        <plugin>
            <groupId>de.empulse.eclipselink</groupId>
            <artifactId>staticweave-maven-plugin</artifactId>
            <version>1.0.0</version>
            <executions>
                <execution>
                    <phase>process-classes</phase>
                    <goals>
                        <goal>weave</goal>
                    </goals>
                    <configuration>
                        <persistenceXMLLocation>META-INF/persistence.xml</persistenceXMLLocation>
                        <logLevel>FINE</logLevel>
                    </configuration>
                </execution>
            </executions>
            <dependencies>
                <dependency>
                    <groupId>org.eclipse.persistence</groupId>
                    <artifactId>org.eclipse.persistence.jpa</artifactId>
                    <version>2.7.10</version>
                </dependency>
            </dependencies>
        </plugin>
    </plugins>
</build>
```

Po wywołaniu polecenia `mvn staticweave:weave` wraz z logami w terminalu powinieneś zobaczyć przetworzone klasy w katalogu *target/classes*.
Jeśli otworzysz plik klasy w dekompilatorze (np. w IntelliJ IDE), powinieneś zobaczyć dodatkowy kod:

<img src="/img/hq/intellij-fernflower-decompiler.png" alt="Dekompilator FernFlower" title="Dekompilator FernFlower">

```java
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.util.List;
import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OneToOne;
import javax.persistence.Table;
import javax.persistence.Transient;
import javax.xml.bind.annotation.XmlTransient;
import org.eclipse.persistence.descriptors.changetracking.ChangeTracker;
import org.eclipse.persistence.internal.descriptors.PersistenceEntity;
import org.eclipse.persistence.internal.descriptors.PersistenceObject;
import org.eclipse.persistence.internal.identitymaps.CacheKey;
import org.eclipse.persistence.internal.jpa.EntityManagerImpl;
import org.eclipse.persistence.internal.jpa.rs.metadata.model.ItemLinks;
import org.eclipse.persistence.internal.jpa.rs.metadata.model.Link;
import org.eclipse.persistence.internal.weaving.PersistenceWeaved;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedChangeTracking;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedFetchGroups;
import org.eclipse.persistence.internal.weaving.PersistenceWeavedRest;
import org.eclipse.persistence.queries.FetchGroup;
import org.eclipse.persistence.queries.FetchGroupTracker;
import org.eclipse.persistence.sessions.Session;

@Entity
@Table(
    name = "orders"
)
public class Order implements Cloneable, PersistenceWeaved, PersistenceEntity,
        PersistenceObject, FetchGroupTracker, PersistenceWeavedFetchGroups,
        ChangeTracker, PersistenceWeavedChangeTracking, PersistenceWeavedRest {
    //...
    @OneToMany(
            fetch = FetchType.LAZY,
            mappedBy = "order"
    )
    private List<OrderItem> items;
    
    protected transient PropertyChangeListener _persistence_listener;
    
    public List<OrderItem> getItems() {
        return this._persistence_get_items();
    }
    
    public void setItems(final List<OrderItem> items) {
        this._persistence_set_items(items);
    }
    
    public List _persistence_get_items() {
        this._persistence_checkFetched("items");
        return this.items;
    }

    public void _persistence_set_items(List var1) {
        this._persistence_checkFetchedForSet("items");
        this._persistence_propertyChange("items", this.items, var1);
        this.items = var1;
    }

    public void _persistence_checkFetched(String var1) {
        if (!this._persistence_isAttributeFetched(var1)) {
            EntityManagerImpl.processUnfetchedAttribute((FetchGroupTracker)this, var1);
        }

    }

    public void _persistence_checkFetchedForSet(String var1) {
        if (!this._persistence_isAttributeFetched(var1)) {
            EntityManagerImpl.processUnfetchedAttributeForSet((FetchGroupTracker)this, var1);
        }

    }

    public boolean _persistence_isAttributeFetched(String var1) {
        return this._persistence_fetchGroup == null ||
                this._persistence_fetchGroup.containsAttributeInternal(var1);
    }

    public void _persistence_setPropertyChangeListener(PropertyChangeListener var1) {
        this._persistence_listener = var1;
    }

    public void _persistence_propertyChange(String var1, Object var2, Object var3) {
        if (this._persistence_listener != null && var2 != var3) {
            this._persistence_listener
                    .propertyChange(new PropertyChangeEvent(this, var1, var2, var3));
        }

    }
    //...
}
```

Dużo wygenerowanego kodu (choć większość została pominięta), ale jeśli przyjrzymy się bliżej, przepływ wygląda następująco:
1. *setItems();*
2. *_persistence_set_items();*
3. *_persistence_propertyChange();*
4. *_persistence_listener.propertyChange();*

Standardową implementacją interfejsu `PropertyChangeListener` w EclipseLinku jest `org.eclipse.persistence.internal.descriptors.changetracking.AttributeChangeListener`.
Wewnątrz metody po sprawdzeniu flagi odpowiadającej za wyłączenie mechanizmu, następuje przetworzenie zmiany.
W tym czasie EclipseLink uzyskuje dostęp do leniwego *value holdera* z referencją do bazy danych i niepotrzebnie (w tym konkretnym przypadku) zaciąga dane z bazy.
Sam w sobie proces śledzenia zmian jest całkiem przydatny. Optymalizuje transakcję i fazę jej *committowania*.

Niektóre sposoby obejścia tej funkcjonalności to:
- dodanie adnotacji `@ChangeTracking(value = ChangeTrackingType.DEFERRED)` na poziomie klasy encji (deoptymalizacja);
- własna implementacja interfejsu `PropertyChangeListener` poprzez deskryptor klasowy/sesyjny (wymaga dobrej znajomości EclipseLinka);
- dynamiczna zmiana zachowania za pomocą mechanizmu refleksji (niezbyt czyste rozwiązanie);
- użycie DTO (rekomendowane).

## Podsumowanie

To zachowanie jest charakterystyczne dla EclipseLink i nie jest sprecyzowane w specyfikacji JPA.
Implementacje OpenJPA i Hibernate mogą przejawiać inne właściwości w ramach tego procesu, potencjalnie nie powodując żadnych problemów.

> Zachowaj ostrożność podczas debugowania. Wyświetlając encję, łatwo jest wywołać leniwą inicjalizację, tym samym dochodząc do niewłaściwych wniosków optymalizacyjnych. 

> Istnieją inne [opcje](https://www.eclipse.org/eclipselink/documentation/2.7/concepts/app_dev005.htm#OTLCG94276), których możesz użyć do konfiguracji *weavingu*, np. `eclipselink.weaving.changetracking`, która pozwala wyłączyć śledzenie zmian (change tracking).

> Ustawienie opcji `eclipselink.weaving` w pliku *persistence.xml* działa tylko jako mechanizm weryfikacyjny.


