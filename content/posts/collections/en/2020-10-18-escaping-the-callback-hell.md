---
title: Escaping the callback hell in Vert.x
url: escaping-the-callback-hell-in-vertx
id: 41
category:
  - java: Java
tags:
  - vertx
author: Damian Terlecki
date: 2020-10-18T20:00:00
---

Callback hell is not a very popular topic in the Java stack, which provides great support for multithreading. The problem is much more common when dealing with JavaScript code executed in the browser (single-threading); where waiting for an event can make the application unresponsive. The basic solution to the blocking problem is the use of callbacks: do not call us, we will call you.

## Vert.x

Vert.x's core is based on callbacks. The client's request (eg HTTP), arrival in the application, is registered as an event in the event pool and processed by the thread assigned to this pool. By reducing the number of threads compared to the standard servlet model (thread per query), we theoretically should achieve reduced context switching.

Similar to browser JS, we don't want query processing to block the thread for a long time. If we are dealing with a blocking operation (HTTP query, database query), we delegate it to another thread (worker), or, if we are lucky, we can use an asynchronous client. In both cases, we give a callback that will process the operation result.

<img src="/img/hq/callback-hell.png" alt="Screenshot showing nested callbacks" title="Nested callbacks">

The callback hell occurs when in each subsequent callback, we have to call another operation that in the standard model would block code execution in wait for the result. Let's see how it looks like when implementing communication with the database (Cassandra in this case):

## Model

To illustrate the problem, I will use a basic table containing the user's login and password. We will want to fetch his encoded password and the user id from the database providing the login as a parameter.

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

## The callback hell

I will use the `CassandraClient` class and low-level CQL (Cassandra Query Language) queries to retrieve the data. You could simplify this by using Cassandra driver mapping and statement caching but keep me company for a while. The whole process can be broken down into the following steps:
1. DAO query for customer data – `dao.getCredentialsWithCallback()`;
2. Prepare the query – `CassandraClient.prepare()`;
3. Executing the query – `CassandraClient.execute()`;
4. Fetching the data – `ResultSet.one()`;
5. Mapping the data and returning it in the callback from point 1.

The first four operations require a result handler. Apart from the first point, the DAO implementation itself looks like this:

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

You will probably admit that nested if/else conditions are not very readable due to [cyclomatic complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity). In the real world, unmaintained cases, it usually looks even worse and is quite hard to analyze.

## Flattening through chaining

One of the basic practices when dealing with such [arrow code](https://blog.codinghorror.com/flattening-arrow-code/) is to flatten it. Using the `Promise` class, we can attach another call to each subsequent call with `.future().compose()` and finally return a `Future <>` object. This is a bit more usable, one less parameter to provide and finally a return type which we can use through `handle()`/`onComplete()`/`onSuccess()`/`onFailure()`.

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

Thanks to this form, our callbacks can be refactored into separate functions and the code will become much more readable.
Still, it is not a perfect figure. As you can see, a lot of code is repeated here – the creation of `Promise<>` objects and error handling.

### ReactiveX/RxJava

ReactiveX is one of the libraries that offer a solution to the problem of nested callbacks. The previously discussed flattening mechanism is exposed through an interface that eliminates the boilerplate needed to chain subsequent result handlers. Using the available integration with Vert.x `io.vertx:vertx-rx-java2`, we can significantly refactor our method to 15 concise lines:

```java
public Single<Credentials> getCredentialsRxJava(String login) {
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

The code is much cleaner and, as a result, more than twice as short. Additionally, we get access to the `Disposable` interface, which [to some extent](https://medium.com/stepstone-tech/the-curious-case-of-rxjava-disposables-e64ff8a06879) allows us to interrupt processing, unlike the `io.vertx.core.Future` class (not to be confused with `java.util.concurrent.Future`).

## Conclusion

ReactiveX/RxJava is a really nice library that goes along with asynchronous and event-based processing. If you're not convinced, you can still use the `Promise`/`Future` chaining method. Aside from that, the code snippets use Java 15 text blocks, for Java 14 use the `--enable-preview` JVM argument (don't forget to add this to the build tool if you're running it that way).