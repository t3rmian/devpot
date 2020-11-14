---
title: Spring – autentykacja X.509 z MongoDB i konfiguracja SSL/TLS
url: spring-mongodb-x509-ssl-tls
id: 38
tags:
  - java
  - spring
  - bezpieczeństwo
  - database
author: Damian Terlecki
date: 2020-09-06T20:00:00
---


MongoClient (*com.mongodb.client.MongoClient*) to podstawowy interfejs do synchronicznej komunikacji z bazą danych MongoDB w Javie. Znajdziemy go w otwartoźródłowej paczce sterownika MongoClient (*org.mongodb:mongodb-driver-sync:4.0.x*). Na jego bazie zbudowane są klasy, które oferują nieco bardziej przyjazny interfejs (MongoTemplate, SimpleMongoRepository) wyższego poziomu.

## SSL/TLS

Jeśli chcemy skonfigurować połączenie SSL/TLS wraz z autentykacją przy użyciu certyfikatu, powinniśmy naszą implementację podpiąć właśnie w okolicach tworzenia klasy MongoClient. W Springu Boocie (2.3.x) miejscem tym jest klasa MongoAutoConfiguration, a właściwie Bean zadeklarowany w tej klasie:

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

Możemy oczywiście zdefiniować własnego Beana, ale dużo lepszą praktyką będzie wykorzystanie wyżej przedstawionego interfejsu `ObjectProvider` poprzez stworzenie konfiguratorów `MongoClientSettingsBuilderCustomizer`. Po pierwsze warto się zastanowić nad poprawnym ustawieniem kontekstu SSL. Do wyboru mamy stworzenie własnego kontekstu, albo skorzystanie ze standardowego, tworzonego na bazie następujacych parametrów:

```bash
-Djavax.net.ssl.trustStore=%JAVA_HOME%/lib/security/cacerts
-Djavax.net.ssl.trustStorePassword=changeit
```

Do szczęścia wystarczy tylko dodać SSL/TLS to parametru URI MongoDB: `spring.data.mongodb.uri=mongodb://127.0.0.1:27017/admin?tls=true`. Jeśli potrzebujemy stworzyć odrębny kontekst, możemy to zrobić za pomocą dosyć szablonowego kodu:

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

Następnie wystarczy podpiąć utworzony kontekst do konfiguratora klienta:

```java
    @Bean
    public MongoClientSettingsBuilderCustomizer mongoSslCustomizer(SSLContext mongoSSLContext) {
        return clientSettingsBuilder -> clientSettingsBuilder.applyToSslSettings(sslBuilder -> sslBuilder.context(mongoSSLContext));
    }
```

Oprócz włączenia SSL/TLS za pomocą parametru URI, bezpieczne połączenie możemy wymusić, wywołując metodę `sslBuilder.enabled(true)`. W tym miejscu, na potrzeby testów, możemy też wyłączyć weryfikację nazwy hosta certyfikatu zaprezentowanego przez serwer (*mongod*) – `sslBuilder.invalidHostNameAllowed(true)`.

## Wzajemne uwierzytelnianie/autentykacja przy użyciu certyfikatu X.509

MongoDB oferuje także autentykację przy użyciu certyfikatów X.509. Jeśli potrzebujemy takiego uwierzytelniania to nasz (jako klienta) certyfikat i klucz prywatny musimy załadować do kontekstu SSL:

```bash
-Djavax.net.ssl.keyStore=<ścieżka_do_utworzonego_key_store>
-Djavax.net.ssl.keyStorePassword=<hasło_do_key_store>
```

Opcja bazująca na niestandardowym kontekście:

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

Analogicznie do konfiguracji SSL/TLS, możemy zalogować się do bazy przy użyciu certyfikatu. Do tego potrzebujemy podania podmiotu (*subject*) certyfikatu `mongoX509Credential` w formacie RFC2253:

```java
    @Bean
    public MongoClientSettingsBuilderCustomizer mongoCredentialCustomizer() throws CertificateEncodingException {
        return clientSettingsBuilder -> clientSettingsBuilder.credential(
                MongoCredential.createMongoX509Credential(mongoX509Credential)
        );
    }
```

Jeśli nasz certyfikat jest dosyć standardowy, to możemy go wyciągnąć z KeyManagera, podając jego alias (utworzony przy imporcie do keystora):

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

> **Uwaga:** Jeśli w podmiocie występują dodatkowe elementy tzw. oid ([RFC2253](https://tools.ietf.org/html/rfc2253)) to możemy mieć problem z autentykacją w bazie.  
> Przykładowo podmiot "emailAddress=abc@example.com,CN=test,..." zostanie zamieniony na "1.2.840.113549.1.9.1=#<zaenkodowana_wartość>,CS=test,...".   
> W takim przypadku warto rozważyć sparametryzowanie tej wartości. Poprawny podmiot powinniśmy uzyskać za pomocą `openssl x509 -in <pathToClientPEM> -inform PEM -subject -nameopt RFC2253`.

Szybkie sprawdzenie w Springu możemy zrobić już po inicjalizacji klienta mongo:

```java
    @DependsOn("mongo")
    @Bean
    public Void displayDbNames(MongoClient mongoClient) {
        mongoClient.listDatabaseNames().forEach(System.out::println);
        return null;
    }
```

## mongod

Po stronie serwera (*mongod*), do połączenia SSL/TLS, będziemy potrzebować wygenerowania klucza i certyfikatu poświadczonego przez zaufany urząd certyfikacji. Dodatkowo konieczne będzie stworzenie użytkownika, który będzie uwierzytelniany za pomocą certyfikatu (który na tej samej zasadzie powinien być wydany przez CA). Zasadniczo, wymagana konfiguracja została świetnie opisana w dokumentacji MongoDB:

1. [MongoDB TLS/SSL](https://docs.mongodb.com/manual/core/security-transport-encryption/);
2. [MongoDB X.509 Client Certificates Authentication](https://docs.mongodb.com/manual/tutorial/configure-x509-client-authentication/);
3. [MongoDB Driver Connecting](https://mongodb.github.io/mongo-java-driver/3.0/driver/reference/connecting/).

Oprócz tego przydatne będą materiały opisujące:
1. [Generowanie certyfikatów testowych](https://gist.github.com/kevinadi/96090f6f9973ff8c2d019bbe0d9a0f70);
  - warto zwrócić uwagę na to, aby wartość the **hostname** certyfikatu zgadzała się przy uruchomieniu;
  - w przypadku nowszej wersji serwera MongoDB, powinniśmy zaktualizować parametry z *ssl* na *tls*;
2. Import certyfikatów i kluczy do keystore'ów:

```bash
keytool -genkey -keyalg RSA -alias demo -keystore truststore.jks # Stworzenie truststore'a z podanymi losowymi wartościami
keytool -delete -alias demo -keystore truststore.jks # Wyczyszczenie keystore'a
keytool -importcert -file ca.crt -keystore truststore.jks -alias "Alias" # Import certyfikatu

keytool -genkey -keyalg RSA -alias demo -keystore keystore.jks # Stworzenie keystore'a
keytool -delete -alias demo -keystore keystore.jks # Wyczyszczenie
openssl pkcs12 -export -in client.crt -inkey client.key -out client.p12 -name mongo-client # Stworzenie pliku z kluczem i certyfikatem w formacie pkcs12
keytool -importkeystore -destkeystore keystore.jks -srckeystore client.p12 -srcstoretype PKCS12 -alias mongo-client # Import klucza i certyfikatu
```

W przypadku jakichkolwiek problemów z połączeniem źródło problemu najczęściej znajdziemy, analizując logi po stronie serwera (*mongod*). Z poziomu klienta zazwyczaj nie dostaniemy niezbędnych danych poza informacją o błędzie autoryzacji.

<img src="/img/hq/mongod-ssl-tls-x509.png" alt="Logi z mongod – adres, port, połączenie z certyfikatem, autentykacja za pomocą x509 oraz bazy $external" title="Logi z mongod">
