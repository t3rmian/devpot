---
title: Vert.x – pominięcie walidacji JWT
url: vertx-unsecure-jwt
id: 43
tags:
  - java
  - vertx
  - bezpieczeństwo
author: Damian Terlecki
date: 2020-11-15T20:00:00
---

Vert.x w swoim zasobie modułów oferuje wiele różnych komponentów, które znacznie przyspieszają dewelopment, dostarczając gotowe rozwiązania dla najpopularniejszych przypadków użycia. Dzisiaj na cel weźmiemy 'io.vertx:vertx-auth-jwt' w wersji 3.9.x, czyli biblioteką pozwalającą na generowanie i walidację tokenów JWT, a właściwie rozpatrzymy przypadek dekodowania tokenów, z pominięciem walidacji.

Jeśli nie kojarzysz walidacji sygnatury tokenu JWT, to polecam zapoznać się z [artykułem o JWT na blogu angulara](https://blog.angular-university.io/angular-jwt/). Generalnie taką walidację powinniśmy przeprowadzić na tokenie JWT, podając klucz publiczny (np. [z certyfikatu](https://www.googleapis.com/oauth2/v1/certs), [bądź JWKS](https://www.googleapis.com/oauth2/v3/certs)). W wyjątkowych sytuacjach [[1](https://developers.google.com/identity/protocols/oauth2/openid-connect#obtainuserinfo), [2](https://github.com/vert-x3/vertx-auth/issues/168)] i podczas dewelopmentu bądź testowania możemy chcieć pominąć taką weryfikację.

<figure>
<a href="https://jwt.io/"><img src="/img/hq/jwt.png" alt="Zrzut ekranu przedstawiający segmenty tokenu JWT rozdzielone kropką oraz jego postać zdekodowaną (header, payload i signature)" title="Segmenty tokenu JWT i postać zdekodowana"/></a>
</figure>

Vert.x udostępnia nam klasę `io.vertx.ext.jwt.JWT` z metodą `JsonObject decode(final String token)` pozwalajacą na zdekodowanie tokenu w celu odczytania danych. Weryfikacja sygnatury jest wbudowana w metodę i nie mamy interfejsu, za pomocą którego moglibyśmy pominąć ten etap.

Jeśli pole `alg` w pierwszym z trzech członów (header) oddzielonych kropką ma wartość `none`, to możemy pozbyć się ostatniego członu (sygnatury) i JWT zostanie poprawnie zdekodowany przy inicjalizacji standardowym konstruktorem `new JWT().decode(jwtString)`:

```java
  // Source: io.vertx.ext.jwt.JWT
  public JWT() {
    // Spec requires "none" to always be available
    cryptoMap.put("none", Collections.singletonList(new CryptoNone()));
  }
```

Jeśli jednak w tokenie znajduje się już jakiś algorytm, to otrzymamy wyjątek `NoSuchKeyIdException`:

```java
  // Source: io.vertx.ext.jwt.JWT
  public JsonObject decode(final String token) {
    String[] segments = token.split("\\.");
    if (segments.length != (isUnsecure() ? 2 : 3)) {
      throw new RuntimeException("Not enough or too many segments");
    }

    /** (...) Truncated - extraction of segments */

    String alg = header.getString("alg");

    List<Crypto> cryptos = cryptoMap.get(alg);

    if (cryptos == null || cryptos.size() == 0) {
      throw new NoSuchKeyIdException(alg);
    }

    // if we only allow secure alg, then none is not a valid option
    if (!isUnsecure() && "none".equals(alg)) {
      throw new RuntimeException("Algorithm \"none\" not allowed");
    }

    // verify signature. `sign` will return base64 string.
    if (!isUnsecure()) {
      /** (...) Truncated - verification */
    }

    return payload;
  }

  public boolean isUnsecure() {
    return cryptoMap.size() == 1;
  }
```

Warunkiem na zdekodowanie tokenu JWT z właściwym algorytmem i sygnaturą bez jej weryfikacji, jest więc pozbycie się sygnatury i zapewnienie, że zmienna `cryptoMap` będzie zawierała jeden algorytm, którego wartość będzie zgodna z headerem. Nie mamy dostępu do takiego interfejsu, ale podglądając implementację JWT, zauważysz szybko:

```java
  // Source: io.vertx.ext.jwt.JWT
  private final Map<String, List<Crypto>> cryptoMap = new ConcurrentHashMap<>();

  public Collection<String> availableAlgorithms() {
    return cryptoMap.keySet();
  }
```

Znając nazwę algorytmu, który w naszym przypadku prawdopodobnie się nie zmienia, możemy sprytnie wykorzystać możliwość modyfikacji `cryptoMap`:

```java
  String insecureJwt = Arrays.stream(token.split("\\.")).limit(2).collect(Collectors.joining("."))
  JWT jwt = new JWT().addPublicKey("RS256", null);
  jwt.availableAlgorithms().remove("none");
  return jwt.decode(insecureJwt).getString("sub");
```

W ten prosty sposób omijamy weryfikację tokenu JWT i otrzymujemy dostęp do danych w nim zawartych bez potrzeby implementowania własnego dekodowania.