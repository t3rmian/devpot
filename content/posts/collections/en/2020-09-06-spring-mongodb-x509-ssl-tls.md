---
title: Spring – X.509 authentication with MongoDB and SSL/TLS configuration
url: spring-mongodb-x509-ssl-tls
id: 38
tags:
  - java
  - spring
  - security
  - database
author: Damian Terlecki
date: 2020-09-06T20:00:00
---

MongoClient (*com.mongodb.client.MongoClient*) is the basic interface for synchronous communication with the MongoDB database in Java. We can find it in the MongoClient open-source driver package (*org.mongodb:mongodb-driver-sync:4.0.x*). This interface is also the building block for other higher-level classes like MongoTemplate, SimpleMongoRepository.

## SSL/TLS

If we want to configure the SSL/TLS connection together with authentication using a certificate, we should inject our configuration just around the place of MongoClient creation. In Spring Boot (2.3.x), the default place for this is MongoAutoConfiguration class, or actually, the Bean declared in this class:

```java
    @Bean
    @ConditionalOnMissingBean(MongoClient.class)
    public MongoClient mongo(MongoProperties properties, Environment environment,
                             ObjectProvider<MongoClientSettingsBuilderCustomizer> builderCustomizers,
                             ObjectProvider<MongoClientSettings> settings) {
        return new MongoClientFactory(properties, environment,
                builderCustomizers.orderedStream().collect(Collectors.toList()))
                .createMongoClient(settings.getIfAvailable());
    }
```

We can of course define our own Bean, but a much better practice will be to use the `ObjectProvider` interface presented in the above code, by creating `MongoClientSettingsBuilderCustomizer` configurators. Before that, it is worth considering the approach we will take for initializing the SSL context. We can choose to create our own context, or use a standard one, created based on the following parameters:

```bash
-Djavax.net.ssl.trustStore=%JAVA_HOME%/lib/security/cacerts
-Djavax.net.ssl.trustStorePassword=changeit
```

With this approach, all you need to do is enable SSL/TLS through the MongoDB URI parameter: `spring.data.mongodb.uri=mongodb://127.0.0.1:27017/admin?tls=true`. If we need to create a separate context, we can do it with the following template:

```java
    @Bean
    public SSLContext mongoSSLContext() throws GeneralSecurityException, IOException {
        KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
        try (InputStream in = new FileInputStream(trustStoreFile)) {
            trustStore.load(in, trustStorePassword.toCharArray());
        }
        TrustManagerFactory trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trustManagerFactory.init(trustStore);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, trustManagerFactory.getTrustManagers(), new SecureRandom());

        return sslContext;
    }
```

Then, we need to attach the custom context to the client configurator:

```java
    @Bean
    public MongoClientSettingsBuilderCustomizer mongoSslCustomizer(SSLContext mongoSSLContext) {
        return clientSettingsBuilder -> clientSettingsBuilder.applyToSslSettings(sslBuilder -> sslBuilder.context(mongoSSLContext));
    }
```

In addition to enabling SSL/TLS through the URI parameter, we can also force a secure connection by calling the `sslBuilder.enabled(true)` method. Here, for testing purposes, we can also disable the verification of the hostname of the certificate presented by the server (*mongod*) – `sslBuilder.invalidHostNameAllowed(true)`.

## Mutual authentication / authentication using an X.509 certificate

MongoDB also provides a way to authenticate the client using X.509 certificates. If we need such authentication, we must additionally load our (client) certificate and private key into the SSL context:

```bash
-Djavax.net.ssl.keyStore=<path_to_our_key_store>
-Djavax.net.ssl.keyStorePassword=<key_store_password>
```

How the keystore is loaded into the context can be clearly seen if we take the programmatic approach:

```java
    @Bean
    public SSLContext mongoSSLContext() throws GeneralSecurityException, IOException {
        KeyStore keystore = KeyStore.getInstance(KeyStore.getDefaultType());
        try (InputStream in = new FileInputStream(keyStoreFile)) {
            keystore.load(in, keyStorePassword.toCharArray());
        }
        KeyManagerFactory keyManagerFactory =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagerFactory.init(keystore, keyStorePassword.toCharArray());

        KeyStore trustStore = KeyStore.getInstance(KeyStore.getDefaultType());
        try (InputStream in = new FileInputStream(trustStoreFile)) {
            trustStore.load(in, trustStorePassword.toCharArray());
        }
        TrustManagerFactory trustManagerFactory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trustManagerFactory.init(trustStore);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(keyManagerFactory.getKeyManagers(), trustManagerFactory.getTrustManagers(), new SecureRandom());

        return sslContext;
    }
```

Similarly to the SSL/TLS configuration, we can log in to the database using a certificate. We need to provide the subject (*subject*) of the `mongoX509Credential` certificate in the RFC2253 format:

```java
    @Bean
    public MongoClientSettingsBuilderCustomizer mongoCredentialCustomizer() throws CertificateEncodingException {
        return clientSettingsBuilder -> clientSettingsBuilder.credential(
                MongoCredential.createMongoX509Credential(mongoX509Credential)
        );
    }
```

If our certificate does not have any unusual attributes, we can extract it from KeyManager by alias (created when importing to keystore) and retrieve the subject:

```java
    @Bean
    public X509Certificate mongoClientCertificate() throws GeneralSecurityException, IOException {
        KeyStore keystore = KeyStore.getInstance(KeyStore.getDefaultType());
        try (InputStream in = new FileInputStream(keyStoreFile)) {
            keystore.load(in, keyStorePassword.toCharArray());
        }
        KeyManagerFactory keyManagerFactory =
                KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagerFactory.init(keystore, keyStorePassword.toCharArray());
        X509KeyManager keyManager = (X509KeyManager) keyManagerFactory.getKeyManagers()[0];
        return keyManager.getCertificateChain(keyAlias)[0];
    }

	@Bean
    public MongoClientSettingsBuilderCustomizer mongoCredentialCustomizer(X509Certificate mongoClientCertificate) {
        return clientSettingsBuilder -> clientSettingsBuilder.credential(
                MongoCredential.createMongoX509Credential(mongoClientCertificate.getSubjectX500Principal().getName()) // RFC2253
        );
    }
```

> **Warning:** We might encounter some problems if there are additional elements, the so-called oids ([RFC2253](https://tools.ietf.org/html/rfc2253)).  
> For an example the subject "emailAddress=abc@example.com,CN=test,..." will be converted to "1.2.840.113549.1.9.1=#<encoded_value>,CS=test,...".  
> In this case, you might consider parameterizing this value. We can obtain the correct (acceptable by MongoDB) subject by using `openssl x509 -in <pathToClientPEM> -inform PEM -subject -nameopt RFC2253`.

We can do a quick verification of whether we are authorized just after the mongo client initialization:

```java
    @DependsOn("mongo")
    @Bean
    public Void displayDbNames(MongoClient mongoClient) {
        mongoClient.listDatabaseNames().forEach(System.out::println);
        return null;
    }
```

## mongod

On the server (*mongod*) side, for SSL/TLS connection, we will need to generate a key and request certificate issuance from a trusted CA. Additionally, you will need to create a user who will be authenticated with the client certificate (which should also be issued by CA). The required configuration is well described in the MongoDB documentation:

1. [MongoDB TLS/SSL](https://docs.mongodb.com/manual/core/security-transport-encryption/);
2. [MongoDB X.509 Client Certificates Authentication](https://docs.mongodb.com/manual/tutorial/configure-x509-client-authentication/);
3. [MongoDB Driver Connecting](https://mongodb.github.io/mongo-java-driver/3.0/driver/reference/connecting/).

Some other useful materials:
1. [Generating test certificates](https://gist.github.com/kevinadi/96090f6f9973ff8c2d019bbe0d9a0f70);
  - note that the value of **hostname** of the certificate should be the same as the one configured for *mongod* instance;
  - for a newer version of the MongoDB server, we should update the parameters from *ssl* to *tls*;
2. Import of certificates and keys into key stores:

```bash
keytool -genkey -keyalg RSA -alias demo -keystore truststore.jks # Creation of a trust store with random values
keytool -delete -alias demo -keystore truststore.jks # Clearing the keystore
keytool -importcert -file ca.crt -keystore truststore.jks -alias "Alias" # Certificate import

keytool -genkey -keyalg RSA -alias demo -keystore keystore.jks # Create a keystore
keytool -delete -alias demo -keystore keystore.jks # Clearing
openssl pkcs12 -export -in client.crt -inkey client.key -out client.p12 -name mongo-client # Creation of a key and certificate file in pkcs12 format
keytool -importkeystore -destkeystore keystore.jks -srckeystore client.p12 -srcstoretype PKCS12 -alias mongo-client # Key and certificate import
```

In the case of connection problems, the source of the problem can most often be discovered by analyzing the logs on the server-side (*mongod*). From the client's point of view, we usually do not get the necessary information, apart from the message about the auth error.

<img src="/img/hq/mongod-ssl-tls-x509.png" alt="mongod console logs – address, port, connection with certificate, authentication with x509 certificate and $external database" title="mongod logs">