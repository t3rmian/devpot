---
title: Vert.x – decoding unsecure JWT
url: vertx-unsecure-jwt
id: 43
category:
  - java: Java
tags:
  - vertx
  - security
  - json
author: Damian Terlecki
date: 2020-11-15T20:00:00
---

Vert.x offers many different dependencies that you can use, which significantly accelerate the development, providing ready-made solutions for the most popular use cases. Today we will take a look at 'io.vertx: vertx-auth-jwt' (v3.9.x), a library that facilitates JWT generation and validation. Actually, I will show you how to decode the token skipping the signature validation.

If you don't know what's JWT signature then I recommend you check out [the JWT article on the angular blog](https://blog.angular-university.io/angular-jwt/). Generally, such validation should be performed on the JWT token against the public key (e.g. [from the certificate](https://www.googleapis.com/oauth2/v1/certs), or [JWKS](https://www.googleapis.com/oauth2/v3/certs)). In exceptional use-cases [[1](https://developers.google.com/identity/protocols/oauth2/openid-connect#obtainuserinfo), [2](https://github.com/vert-x3/vertx-auth/issues/168)], and during development or testing we may want to skip this verification.

<figure>
<a href="https://jwt.io/"><img src="/img/hq/jwt.png" alt="Screenshot showing JWT segments, separated by a period, and its decoded form (header, payload and signature)" title="JWT token segments and its decoded form"/></a>
</figure>

Vert.x provides us the `io.vertx.ext.jwt.JWT` class with the `JsonObject decode (final String token)` method to decode the token. This form is later easy to read, as its simple JSON. The signature verification is built into the method and we don't have any means of disabling it.

If the `alg` field in the first of the three segments (header) separated by a period is `none`, then we can get rid of the last element (signature) and the JWT will be properly decoded. We would do it from the default constructor `new JWT().decode(jwtString)` according to the spec:

```java
  // Source: io.vertx.ext.jwt.JWT
  public JWT() {
    // Spec requires "none" to always be available
    cryptoMap.put("none", Collections.singletonList(new CryptoNone()));
  }
```

However, if there is already an algorithm in the token, we will get an exception `NoSuchKeyIdException`:

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

The condition for decoding the JWT with a valid algorithm and signature, but without verifying it is not that straightforward. We need to get rid of the signature and ensure that the variable `cryptoMap` will contain one algorithm whose value will match the header one. Vert.x does not provide such an interface, but looking at the JWT implementation, you will quickly notice:

```java
  // Source: io.vertx.ext.jwt.JWT
  private final Map<String, List<Crypto>> cryptoMap = new ConcurrentHashMap<>();

  public Collection<String> availableAlgorithms() {
    return cryptoMap.keySet();
  }
```

Knowing the name of the algorithm, which probably does not change in our case, we can cleverly modify the `cryptoMap` (fortunately it's not `unmodifiableList()`):

```java
  String insecureJwt = Arrays.stream(token.split("\\.")).limit(2).collect(Collectors.joining("."))
  JWT jwt = new JWT().addPublicKey("RS256", null);
  jwt.availableAlgorithms().remove("none");
  return jwt.decode(insecureJwt).getString("sub");
```

With this simple trick, we bypass JWT verification and decode the token gaining access to the data it contains. No need to implement our own decoding!