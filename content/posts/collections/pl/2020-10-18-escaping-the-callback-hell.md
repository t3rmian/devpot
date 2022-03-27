---
title: Piekło wywołań zwrotnych na przykładzie Vert.x
url: piekło-wywołań-zwrotnych-vertx
id: 41
category:
- java: Java
tags:
  - vertx
author: Damian Terlecki
date: 2020-10-18T20:00:00
---

Piekło wywołań zwrotnych nie jest zbyt popularnym tematem w środowisku Java, które zapewnia świetne wsparcie dla wielowątkowości. Dużo częściej z problemem można spotkać się wykonując kod JavaScript w przeglądarce (jednowątkowość), gdzie oczekiwanie na jakieś zdarzenie może sprawić, że aplikacja będzie nieresponsywna.

Podstawowym rozwiązaniem problemu blokowania jest właśnie wykorzystanie wywołań zwrotnych na zasadzie: nie dzwoń do nas, my zadzwonimy do Ciebie, gdy wszystko będzie gotowe, a ty w tym czasie możesz zająć się swoimi sprawami.

## Vert.x

Architektura Vert.x'a opiera się właśnie na wywołaniach zwrotnych. W podstawowym założeniu zapytanie klienta (np. HTTP) przychodząc do aplikacji, trafia do puli zdarzeń i zostaje przetworzony przez przypisany do niego wątek. Dzięki zmniejszeniu liczby wątków, w porównaniu do standardowego modelu serwletowego (wątek per zapytanie), teoretycznie uzyskujemy mniejsze przełączanie kontekstu. 

Na podobnej zasadzie co w JavaScripcie przeglądarkowym, nie chcemy, żeby przetwarzanie zapytania zablokowało nam wątek na dłuższy czas. Jeśli mamy do czynienia z operacją blokującą (zapytanie HTTP, zapytanie bazodanowe) to oddelegowujemy ją do innego wątku (worker), bądź, jeśli mamy takie szczęście, wykorzystujemy klienta asynchronicznego. W obu przypadkach podajemy wywołanie zwrotne, które przetworzy otrzymany wynik.

<img src="/img/hq/callback-hell.png" alt="Zrzut ekranu przedstawiający zagnieżdżone wywołania zwrotne" title="Zagnieżdżone wywołania zwrotne">

Piekło wywołań zwrotnych występuje w sytuacji, gdy w każdym kolejnym wywołaniu zwrotnym, musimy wywołać kolejną operację, która w standardowym modelu zablokowałaby wykonywanie kodu w oczekiwaniu na wynik. Zobaczmy więc, jak to wygląda na przykładzie komunikacji z bazą danych Cassandra:

## Model

Do zobrazowania problemu posłużę się podstawową tabelką z loginem i hasłem użytkownika. Jego dane będziemy chcieli pobrać z bazy podając login jako parametr.

```sql
CREATE TABLE IF NOT EXISTS app.credentials
(
    login    text,
    user_id  UUID,
    password text,

    PRIMARY KEY (login)
);
```

```java
import java.util.UUID;

public class Credential {

    private String login;

    private String password;

    private UUID userId;

    /* getters/setters */

}
```

## Piekło wywołań zwrotnych

Do pobrania danych wykorzystam klasę `CassandraClient` i niskopoziomowe zapytania *cql* (Cassandra Query Language). Oczywiście możemy to uprościć, korzystając z mappera oferowanego przez sterownik Cassandry oraz cache'owanie statementów, jednak przyjmijmy to za przykład akademicki. Cały proces można rozpisać w następujących krokach:
1. Zapytanie warstwy DAO o dane klienta – `dao.getCredentialsWithCallback()`;
2. Przygotowanie zapytania – `CassandraClient.prepare()`;
3. Wywołanie zapytania – `CassandraClient.execute()`;
4. Zaciągnięcie danych – `ResultSet.one()`;
5. Przetworzenie danych i zwrócenie ich w wywołaniu zwrotnym z punktu 1.

Pierwsze cztery operacje wymagają podania funkcji obsługującej wyniki. Pomijając punkt pierwszy, sama implementacja DAO wygląda następująco:

```java
import com.datastax.driver.core.PreparedStatement;
import com.datastax.driver.core.Row;
import io.vertx.core.AsyncResult;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.reactivex.cassandra.CassandraClient;
import io.vertx.reactivex.cassandra.ResultSet;
import io.reactivex.Single;

import java.util.NoSuchElementException;

public void getCredentialsWithCallback(String login, Handler<AsyncResult<Credentials>> resultHandler) {
    client.prepare("""
            SELECT user_id, password FROM app.credentials
            WHERE provider = :provider AND login = :login
            """, statementHandler -> {
        if (statementHandler.succeeded()) {
            PreparedStatement statement = statementHandler.result();
            client.execute(statement.bind().setString("login", login), selectHandler -> {
                if (selectHandler.succeeded()) {
                    ResultSet resultSet = selectHandler.result();
                    resultSet.one(fetchHandler -> {
                        if (fetchHandler.succeeded()) {
                            Row row = fetchHandler.result();
                            if (row == null) {
                                resultHandler.handle(Future.failedFuture(new NoSuchElementException("Wrong login or password")));
                            } else {
                                Credentials credentials = new Credentials();
                                credentials.setLogin(login);
                                credentials.setPassword(row.getString("password"));
                                credentials.setUserId(row.getUUID("user_id"));
                                resultHandler.handle(Future.succeededFuture(credentials));
                            }
                        } else {
                            resultHandler.handle(Future.failedFuture(fetchHandler.cause()));
                        }
                    });
                } else {
                    resultHandler.handle(Future.failedFuture(selectHandler.cause()));
                }
            });
        } else {
            resultHandler.handle(Future.failedFuture(statementHandler.cause()));
        }
    });
}
```

Zapewne przyznasz, że wielokrotnie zagnieżdżone warunki nie są zbyt czytelne ze względu na [złożoność cyklomatyczną](https://pl.wikipedia.org/wiki/Z%C5%82o%C5%BCono%C5%9B%C4%87_cyklomatyczna). W realnych przypadkach zazwyczaj wygląda to jeszcze gorzej i jest dosyć ciężkie w utrzymaniu.

## Spłaszczenie wywołań poprzez łączenie

Jedną z podstawowych praktyk, gdy mamy do czynienia z tak [hierarchiczną strukturą](https://blog.codinghorror.com/flattening-arrow-code/) jest jej spłaszczenie. Korzystając z klasy `Promise`, do każdego wywołania możemy podpiąć kolejne wywołanie poprzez `.future().compose()` i ostatecznie zwrócić obiekt `Future<>`, wystawiający interfejs do obsługi rezultatu `handle()`/`onComplete()`/`onSuccess()`/`onFailure()`.

```java
public Future<Credentials> getCredentialsFuture(String login) {
    Promise<PreparedStatement> statementPromise = Promise.promise();
    client.prepare("""
            SELECT user_id, password FROM app.credentials
            WHERE provider = :provider AND login = :login
            """, statementHandler -> {
        if (statementHandler.succeeded()) {
            statementPromise.complete(statementHandler.result());
        } else {
            statementPromise.fail(statementHandler.cause());
        }
    });
    return statementPromise.future().compose(statement -> {
        Promise<ResultSet> selectPromise = Promise.promise();
        client.execute(statement.bind().setString("login", login), selectHandler -> {
            if (selectHandler.succeeded()) {
                selectPromise.complete(selectHandler.result());
            } else {
                selectPromise.fail(selectHandler.cause());
            }
        });
        return selectPromise.future();
    }).compose(resultSet -> {
        Promise<Row> fetchPromise = Promise.promise();
        resultSet.one(fetchHandler -> {
            if (fetchHandler.succeeded()) {
                fetchPromise.complete(fetchHandler.result());
            } else {
                fetchPromise.fail(fetchHandler.cause());
            }
        });
        return fetchPromise.future();
    }).compose(row -> {
        if (row == null) {
            return Future.failedFuture(new NoSuchElementException("Wrong login or password"));
        } else {
            Credentials credentials = new Credentials();
            credentials.setLogin(login);
            credentials.setPassword(row.getString("password"));
            credentials.setUserId(row.getUUID("user_id"));
            return Future.succeededFuture(credentials);
        }
    });
}
```

Dzięki takiej formie, nasze wywołania zwrotne możemy zrefaktorować do oddzielnych funkcji, a kod stanie się dużo bardziej czytelny. Przy okazji możemy pozbyć się wywołania zwrotnego jako parametru. Wciąż nie jest to jednak postać idealna. Jak można zauważyć, spora część kodu się tu powtarza – tworzenie obiektów `Promise<>` i przekazywanie błędów.

### ReactiveX/RxJava

ReactiveX to jedna z bibliotek oferująca rozwiązanie problemu zagnieżdżonych wywołań zwrotnych. Poprzednio przedstawioną metodę spłaszczania, udostępnia za pomocą interfejsu, który eliminuje boilerplate potrzebny do połączenia kolejnych funkcji obsługujących rezultaty. Korzystając z dostępnej integracji z Vert.x'em `io.vertx:vertx-rx-java2`, naszą metodę możemy znacząco zrefaktorować do 15 linii:

```java
public Single<Credentials> getCredentialsReactively(String login) {
    return client.rxPrepare("""
            SELECT user_id, password FROM app.credentials
            WHERE provider = :provider AND id = :id
            """)
            .flatMap(statement -> client.rxExecute(statement.bind().setString("login", login)))
            .flatMapMaybe(ResultSet::rxOne)
            .map(row -> {
                Credentials credentials = new Credentials();
                credentials.setLogin(login);
                credentials.setPassword(row.getString("password"));
                credentials.setUserId(row.getUUID("user_id"));
                return credentials;
            })
            .toSingle();
}
```

Kod jest znacznie czytelniejszy i wynikowo ponad dwukrotnie krótszy. Dodatkowo otrzymujemy dostęp do interfejsu `Disposable`, który [w pewnym stopniu](https://medium.com/stepstone-tech/the-curious-case-of-rxjava-disposables-e64ff8a06879) pozwala na przerwanie przetwarzania w odróżnieniu od klasy `io.vertx.core.Future` (nie mylić z `java.util.concurrent.Future`).

## Podsumowanie

ReactiveX/RxJava to naprawdę fajna biblioteka, która pasuje do przetwarzania asynchronicznego i zdarzeniowego. Jeśli nie jesteś przekonany, możesz ciągle skorzystać z łączenia wywołań zwrotnych za pomocą obiektów `Promise`/`Future`. Oprócz tego zamieszczone tutaj fragmenty kodu używają bloków tekstowych Java 15, w przypadku Javy 14 można je włączyć za pomocą parametru JVM `--enable-preview`, a dla starszych wersji przerobić je do standardowej formy.