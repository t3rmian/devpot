---
title: Problemy statycznego weavingu EclipseLink w projekcie wielomodułowym
url: eclipselink-statyczny-wielo-modułowy-weaving
id: 109
category:
  - java: Java
tags:
  - jpa
  - eclipselink
  - bajtkod
author: Damian Terlecki
date: 2023-04-23T20:00:00
---

Dostawcy JPA często używają techniki *weavingu* (manipulacji kodu bajtowego skompilowanych klas Javy) w celu realizacji pewnych funkcjonalności w pełnym ich zakresie.
W przypadku EclipseLink *weaving* umożliwia przede wszystkim implementację leniwego zaciągania relacji `@ManyToOne`, `@OneToOne`, pól `@Basic`.
Niektóre kontenery zgodne z EJB 3+, takie jak WebLogic, zapewniają automatyzację tego procesu. Z kolei dla Javy SE wymaga to parametryzacji agenta (dowiązania biblioteki) podczas uruchomienia.

Pomijając możliwość wyłączenia *weavingu*, drugą opcją jest statyczne (w czasie kompilacji) przetworzenie klas na własną rękę.
Klasa startowa tego procesu znajduje się w artefakcie
`eclipelink.jar`, a krok taki dopniemy do procesu budowania np. przy pomocy zadania Ant lub dedykowanej wtyczki mavenowej.
W [dokumentacji]((https://wiki.eclipse.org/EclipseLink/UserGuide/JPA/Advanced_JPA_Development/Performance/Weaving/Static_Weaving)) znajdziesz obszerne wyjaśnienie takiej konfiguracji.

## Wielomodułowy *weaving* statyczny a dziedziczenie

Dyskretny charakter agenta/*weavingu* sprawia, że łatwo zapomnieć o tym kroku konfiguracyjnym.
Jednakże pominięcie go niechybnie prowadzi do pogorszenia wydajności a w najgorszym przypadku do błędów braku pamięci.

<img src="/img/hq/eclipselink-no-weaving.png" title='Ostrzeżenie o braku weavingu kontrolowane przez poziom logowania "eclipselink.logging.level" ustawiany w pliku persistence' alt='[EL Warning]: metadata: 2023-04-23 17:26:05.917--ServerSession(1234586997)--Thread(Thread[main,5,main])--Reverting the lazy setting on the OneToOne or ManyToOne attribute [address] for the entity class [class com.example.MyEntity] since weaving was not enabled or did not occur.'>

Powyższy błąd wskazuje, że weaving nie został poprawnie zaaplikowany. W tym miejscu warto zerknąć na dokumentację,
Sytuacja komplikuje się jednak gdy do czynienia mamy z dziedziczeniem `@MappedSuperclass` rozbitym po modułach. 

O ile w przeszłości zaimplementowano [udoskonalenia](https://bugs.eclipse.org/bugs/show_bug.cgi?id=466271) poprawiające błędy w wielomodułowej manipulacji kodu bajtowego,
to dla złożonych konfiguracji, funkcjonalność ciągle wydaje się niekompletna. Weźmy prosty przykład
dziedziczenia wielomodułowego JPA:

```java
// moduł bazowy
@MappedSuperclass
public abstract class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    private String name;

    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "ADDRESS_ID")
    private Address address;

    // getters/setters
}

// moduł dziedziczący
@Entity
public class Employee extends Person {

    private String department;
    
    // getters/setters
}
```

Dla tego przykładu możesz napotkać kilka ciekawych błędów.

### Brak weavingu modułu bazowego

Gdy zapomnisz dopiąć weavingu do modułu bazowego, odkryjesz, że kompilacja modułu rozszerzającego kończy się niepowodzeniem z powodu braku metody w subklasie.

> Exception in thread "main" java.lang.NoSuchMethodError: com.example.MyEntity._persistence_shallow_clone()Ljava/lang/Object;

Wystąpienie tego błędu powinno w pierwszej kolejności skłonić Cię do sprawdzenia, czy moduł podstawowy jest ma włączony *weaving*.
Po kompilacji zweryfikuj czy klasy w katalogu docelowym (`target`), zawierające kod bajtowy `org.eclipse.persistence.*`.

### Wewnętrzne optymalizacje EclipseLink a *weaving*

W połączeniu z domyślną konfiguracją pliku *persistence* `<property name="eclipselink.weaving.internal" value="true"/>`,
podklasy `@MappedSuperclass` mogą oczekiwać *super* konstruktora
akceptującego implementację interfejsu `org.eclipse.persistence.internal.descriptors.PersistenceObject`.

> javax.persistence.PersistenceException: Exception [EclipseLink-28019] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.EntityManagerSetupException  
> Exception Description: Deployment of PersistenceUnit [my-persistence-unit] failed. Close all factories for this PersistenceUnit.  
> Internal Exception: java.lang.NoSuchMethodError: 'void com.example.MyEntity.<init>(org.eclipse.persistence.internal.descriptors.PersistenceObject)'

Ten parametr pozwala na pewne specyficzne optymalizacje np. dostępu do pól `@Basic` czy też sposobu budowania obiektów przez EclipseLink.
Powodem błędu jest to, że weaver nie wykrywa żadnego użycia `@MappedSupperclass` w czasie procesowania modułu podstawowego.
W konsekwencji pomija on generowanie kodu bajtowego dla takiego konstruktora, prowadząc do błędów w trakcie uruchomienia aplikacji.

### Brak wygenerowanego kodu niektórych metod dostępowych `_vh_`

*Weaver* w hierarchii dziedziczenia zaczyna od samego dołu.
Tym samym pomija optymalizację leniwych pól, jeśli zmapowana klasa
nie ma żadnego zastosowania. Ponownie, moduł bazowy niekoniecznie zna sposób wykorzystania `@MappedSupperclass`, a z kolei
moduł rozszerzający posiadający takie informacje nie umożliwia ingerencji w kod bajtowy modułu bazowego.

Podobnie dostawca zgłasza problem braku kodu oczekiwanej metody:

> Exception [EclipseLink-60] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.DescriptorException  
> Exception Description: The method [_persistence_set_address_vh] or [_persistence_get_address_vh] is not defined in the object [com.example.MyEntity].  
> Internal Exception: java.lang.NoSuchMethodException: com.example.MyEntity._persistence_get_address_vh()  
> Mapping: org.eclipse.persistence.mappings.ManyToOneMapping[address]  
> Descriptor: RelationalDescriptor(com.example.MyEntity --> [DatabaseTable(MYENTITY)])  

> Exception [EclipseLink-218] (Eclipse Persistence Services - 2.7.12.v20230209-e5c4074ef3): org.eclipse.persistence.exceptions.DescriptorException  
> Exception Description: A NullPointerException would have occurred accessing a non-existent weaved \_vh\_ method [_persistence_get_address_vh].  The class was not weaved properly - for EE deployments, check the module order in the application.xml deployment descriptor and verify that the module containing the persistence unit is ahead of any other module that uses it.  


## Rozwiązania

Jeśli naprawdę chcesz używać wielomodułowego *weavingu* statycznego, nadal istnieje rozwiązanie.
Do prawidłowego generowania kodu bajtowego potrzebny jest kompletny zestaw klas ze wszystkich modułów.
Idealnym miejscem do tego jest moduł agregatora. Może to być moduł WAR/EAR lub moduł uruchomieniowy ze wszystkimi niezbędnymi zależnościami.

W takim miejscu możesz rozpakować wszystkie zależności (`maven-dependency-plugin`) i przetworzyć je jednocześnie.
Następnie możesz je spakować do tzw. artefaktu *fat jar* zawierającego wszystkie klasy, bądź wypuścić poszczególne pakiety pod odrębnym klasyfikatorem.

To statyczne rozwiązanie jest dość elastyczne, ponieważ umożliwia niestandardowe filtrowania.
Przydaje się na późnym etapie procesu wytwarzania aplikacji do stopniowego wprowadzania *weavingu* w obawie o `LazyInitializationException`.
Szczególnie gdy część kodu została napisana z perspektywy zachłannego zaciąganie.
Zbiór klas ograniczysz odrębnym plikiem `persistence.xml` z opcją `exclude-unlisted-classes`.

W każdym innym przypadku polecam *weaving* dynamiczny. Skonfigurujesz go dodając parametr `-javaagent:/path/to/eclipselink.jar` do środowiska wykonawczego (aplikacji) Java (lub do zmiennej środowiskowej `JAVA_TOOL_OPTIONS`).
Dodany w ten sposób agent wykona praktycznie tą samą pracę, tym razem podczas ładowania konkretnych klas.
Parametr dodaj do swojej aplikacji, a także testów (jeśli są uruchamiane z IDE) i wtyczek (jeśli korzystasz z delegacji do Mavena – `maven-surefire-plugin`, `maven-failsafe-plugin`: `configuration` > `argLine`).