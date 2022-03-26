---
title: Konfiguracja bezpiecznego połączenia w Javie
url: java-konfiguracja-https
id: 32
tags:
  - java
  - bezpieczeństwo
author: Damian Terlecki
date: 2020-06-14T20:00:00
---

Standardowy pakiet Javy, który zapewnia warstwę abstrakcji umożliwiającą bezpieczną komunikację sieciową (zarządzanie certyfikatami, handshaking i weryfikacja) to `javax.net.ssl`. Prawdopodobnie najpopularniejszym protokołem, z którym programiści mają do czynienia w tym obszarze, jest HTTPS. HTTPS jest bezpieczną wersją protokołu HTTP (RFC 2616). Może być on zaimplementowany poprzez wykorzystanie protokołu niższej warstwy modelu sieci, np. SSL bądź bezpieczniejszą i zaktualizowaną odpowiednikiem – protokołem TLS.

<style type="text/css" scoped>
    td:first-of-type {
        font-weight: 600;
    }
</style>
<center>
  <table class="rwd">
    <thead>
        <tr>
          <th>Protokół</th>
          <th>Publikacja</th>
          <th>Wsparcie stron internetowych</th>
          <th>Bezpieczeństwo</th>
        </tr>
    </thead>
    <tbody>
        <tr>
          <td data-label="Protokół">
              SSL 1.0
          </td>
          <td data-label="Publikacja" colspan="3">
              Nieopublikowany
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              SSL 2.0
          </td>
          <td data-label="Publikacja">
              1995
          </td>
          <td data-label="Wsparcie stron internetowych">
              1.6%
          </td>
          <td data-label="Bezpieczeństwo" class="err">
              Niebezpieczny
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              SSL 3.0
          </td>
          <td data-label="Publikacja">
              1996
          </td>
          <td data-label="Wsparcie stron internetowych">
              6.7%
          </td>
          <td data-label="Bezpieczeństwo" class="err">
              Niebezpieczny
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              TLS 1.0
          </td>
          <td data-label="Publikacja">
              1999
          </td>
          <td data-label="Wsparcie stron internetowych">
              65.0%	
          </td>
          <td data-label="Bezpieczeństwo" class="warn">
              Zależy szyfru i ograniczeń po stronie klienta
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              TLS 1.1
          </td>
          <td data-label="Publikacja">
              2006
          </td>
          <td data-label="Wsparcie stron internetowych">
              75.1%
          </td>
          <td data-label="Bezpieczeństwo" class="warn">
              Zależy szyfru i ograniczeń po stronie klienta
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              TLS 1.2
          </td>
          <td data-label="Publikacja">
              2008
          </td>
          <td data-label="Wsparcie stron internetowych">
              96.0%
          </td>
          <td data-label="Bezpieczeństwo" class="warn">
              Zależy szyfru i ograniczeń po stronie klienta
          </td>
        </tr>
        <tr>
          <td data-label="Protokół">
              TLS 1.3
          </td>
          <td data-label="Publikacja">
              2018
          </td>
          <td data-label="Wsparcie stron internetowych">
              18.4%
          </td>
          <td data-label="Bezpieczeństwo">
              Bezpieczny
          </td>
        </tr>
      </tbody>
  </table>
  <p><i>Źródła: <a href="https://en.wikipedia.org/wiki/Transport_Layer_Security">https://en.wikipedia.org/wiki/Transport_Layer_Security</a>, <a href="https://www.ssllabs.com/ssl-pulse/">https://www.ssllabs.com/ssl-pulse/</a></i>
  </p>
</center>

Obsługa różnych wersji protokołów i szyfrów w Javie jest realizowana w formie architektury bezpieczeństwa typu pluggable za pośrednictwem tzw. dostawców zabezpieczeń. Domyślnie co najmniej jeden dostawca zabezpieczeń (provider) jest dystrybuowany wraz z JRE/JDK, a w razie potrzeby możemy dodać własnego dostawcę.

Na przykład w chwili pisania tego artykułu Oracle JRE8/JDK8 nie zapewniają obsługi protokołu TLS 1.3, chociaż jest to planowane na [2020-07-14](https://java.com/en/jre-jdk-cryptoroadmap.html). Tymczasem możemy cieszyć się z [TLS 1.3 w Javie 11](http://openjdk.java.net/jeps/332) i na [JVM/JDK Javy 8 od Azul Systems (Zing/Zulu)](https://www.azul.com/press_release/azul-systems-brings-updated-transport-layer-security-to-java-se-8/).

### Konfiguracja bezpiecznego połączenia

Wcześniej wspomniany security provider dostarczany jest do klasy `SSLContext`, którego następnie używamy do skonfigurowania połączenia. Domyślne obsługiwane protokoły zawarte są w parametrach kontekstu `SSLContext.getDefault().getSupportedSSLParameters().getProtocols()`. Aby ograniczyć listę tylko do wybranych protokołów, możemy użyć metody `setEnabledProtocols(String[] protocols)` klasy `SSLContext`.

Przed tym rzućmy najpierw okiem na elementy potrzebne do inicjalizacji kontekstu:

<table class="rwd">
   <thead>
      <tr>
         <th>Klasa</th>
         <th>Opis</th>
         <th>Przykład użycia</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Klasa">
            SSL<wbr>Context
         </td>
         <td data-label="Opis">
            Warstwa abstrakcji pozwalająca na konfigurację połączenia SSL/TLS przy użyciu certyfikatów zawartych w zarządzanych trust/key store'ach.
         </td>
         <td data-label="Przykład użycia">
         <pre>
            <code class="language-java">SSLContext context = SSLContext.getInstance("TLSv1.2");
context.init(keyManagerFactory.getKeyManagers(), trustManagerFactory.getTrustManagers(), null);</code>
         </pre>
      </tr>
      <tr>
         <td data-label="Klasa">
            Trust<wbr>Store
         </td>
         <td data-label="Opis" colspan="2">
            Przechowuje zaufane certyfikaty z punktu widzenia klienta.
         </td>
      </tr>
      <tr>
         <td data-label="Klasa">
            Key<wbr>Store
         </td>
         <td data-label="Opis">
            Przechowuje certyfikat naszej tożsamości.
         </td>
         <td data-label="Przykład użycia">
         <pre>
            <code class="language-java">KeyStore ks = KeyStore.getInstance("JKS");
char[] password = "changeit".toCharArray();
try (FileInputStream fis = FileInputStream("path/to/keystore")) {
    ks.load(fis, password);
}</code>
         </pre>
         </td>
      </tr>
      <tr>
         <td data-label="Klasa">
            Trust<wbr>Manager<wbr>Factory<br/>/<br/>Key<wbr>Manager<wbr>Factory
         </td>
         <td data-label="Opis">
            Fabryki do zarządzania magazynami kluczy, które mogą być dostarczane przez środowisko bądź zainicjalizowane z konkretnego keystore'a. Możemy również pominąć inicjalizację za pomocą fabryki, dostarczając własną implementację menadżera.
         </td>
         <td data-label="Przykład użycia">
         <pre>
            <code class="language-java">KeyManagerFactory kmf = KeyManagerFactory.getInstance(ksAlgorithm);
kmf.init(ks, password);
TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
tmf.init((KeyStore) null); // Default keystore will be used</code>
         </pre>
         </td>
      </tr>
      <tr>
         <td data-label="Klasa">
            Key<wbr>Manager
         </td>
         <td data-label="Opis">
            Udostępnia klientowi łańcuch certyfikatów wraz z kluczem publicznym oraz przechowuje klucz prywatny do odszyfrowywania danych zaszyfrowanych przez klucz publiczny.
         </td>
         <td data-label="Przykład użycia">
            Wiemy, że hasła są powiązane z magazynami kluczy, ale klucze prywatne również mogą mieć hasła. Ponieważ interfejs KeyManagera nie udostępnia możliwości podania hasła dla klucza prywatnego, gdy używany jest standardowy algorytm "SunX509" przy tworzeniu samej fabryki, zakłada się, że jest ono takie samo jak hasło do keystore'a.
            <br/>Jeśli jednak użyjemy algorytmu „NewSunX509”, możemy rozwiązać ten problem – <a href="https://tersesystems.com/blog/2018/09/08/keymanagers-and-keystores/">szczegółowiej zostało to wyjaśniene przz Willa Argenta</a>.
         </td>
      </tr>
      <tr>
         <td data-label="Klasa">
            Trust<wbr>Manager
         </td>
         <td data-label="Opis" colspan="2">
            Decyduje czy odrzucić połączenie na podstawie danych uwierzytelniających podanych przez drugą stronę.
         </td>
      </tr>
      <tr>
         <td data-label="Klasa">
            Hostname<wbr>Verifier
         </td>
         <td data-label="Opis">
            Podczas połączenia SSL/TLS w celu zapobiegania atakom MITM (Man In The Middle) zaleca się sprawdzenie, czy docelowa nazwa hosta jest taka sama jak nazwa podana w certyfikacie.
         </td>
         <td data-label="Przykład użycia">
            Trzy popularne implementacje można znaleźć w bibliotece Apache HttpComponents:
            <ul>
            <li><code>org.apache.http.conn.ssl.DefaultHostnameVerifier</code> – weryfikuje nazwę hosta (IPv4/IPv6/DNS) na podstawie RFC 2818 w sposób rygorystyczny (tylko pojedynczy wildcard w nazwie domeny jest dozwolony) poprzez porównanie docelowej nazwy hosta i wartości DNS Name z certyfikatu z pola Subject Alternative Name (subjectAltName);</li><li>
            <code>org.apache.http.conn.ssl.BrowserCompatHostnameVerifier</code> – podobnie do DefaultHostnameVerifier, ale bez obostrzeń związanych z wildcardem, oznaczony jako przestarzały;</li><li>
            <code>org.apache.http.conn.ssl.NoopHostnameVerifier</code> – podczas weryfikacji zwraca true, tj. weryfikacja nie jest przeprowadzana – nie należy używać tej implementacji, chyba że zawęzimy zakres dopuszczalnych certyfikatów do tego, który przedstawia serwer (<a href="https://tools.ietf.org/search/rfc6125">RFC 6125</a>).</li>
            </ul>
            Jeśli te trzy rozwiązania nie pasują do Twojego przypadku, możesz dostarczyć własną implementację w oparciu o jakieś informacje zewnętrzne. Szczegółowiej weryfikację opisuje Will Argent <a href="https://tersesystems.com/blog/2014/03/23/fixing-hostname-verification/">w kolejnym artykule</a>.
         </td>
      </tr>
    </tbody>
</table>

Większość klientów HTTP obsługuje konfigurację połączenia za pomocą klasy SSLContext. Zasadniczo domyślna konfiguracja zapewniana przez JDK/JRE często wystarcza przy inicjalizacji bezpiecznego połączenia jako klient. O ile oczywiście serwer nie wymaga również od nas ważnego certyfikatu. W takim przypadku będziemy musieli przekazać naszą tożsamość za pomocą KeyManagera.

Kilka przykładów ostatecznego ogniwa między konfiguracją połączenia a klasami klientów HTTP zamieściłem poniżej:

```java
// javax.net.ssl
HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
connection.setSSLSocketFactory(sslContext.getSocketFactory());
connection.setHostnameVerifier(hostnameVerifier);

// org.apache.httpcomponents:httpclient:4.5
CloseableHttpClient httpClient = HttpClientBuilder.create()
    .setSSLContext(sslContext)
    .setHostnameVerifier(hostnameVerifier)
    .build();

// com.squareup.okhttp3:okhttp:4.x
OkHttpClient okHttpClient = OkHttpClient.Builder()
    .sslSocketFactory(sslContext.getSocketFactory(), trustManager)
    .hostnameVerifier(hostnameVerifier)
    .build()

// org.glassfish.jersey.core:jersey-client:2.x
Client jerseyClient = ClientBuilder.newBuilder()
    .sslContext(sslContext)
    .hostnameVerifier(hostnameVerifier)
    .build();
```

Na potrzeby zarządzania keystore'ami, tworzenia CSR (Certificate Signing Request – żądania podpisania przez urząd certyfikacji) używa się programu wiersza poleceń `keytool` zawartego w katalogu `bin` JRE/JDK. Listę przydatnych poleceń można podejrzeć na [stronie SSL Shopper](https://www.sslshopper.com/article-most-common-java-keytool-keystore-commands.html).

W razie wątpliwości, dlaczego standardowa konfiguracja nie działa, zawsze warto sprawdzić ważność certyfikatu witryny, z którą się łączymy, nazwę domeny i łańcuch poświadczeń. No chyba że certyfikat jest self-signed i zaimportowaliśmy go do trust store'a (również to powinniśmy sprawdzić).

<figure class="center-text">
<img loading="lazy" class="inline inline-end" src="/img/hq/https-certificate-browser.png" alt="Wyświetlenie certyfikatu witryny za pomocą przeglądarki (ikona kłódki)" title="Wyświetlenie certyfikatu witryny za pomocą przeglądarki (ikona kłódki)">
<br/>
<img loading="lazy" class="inline inline-end" src="/img/hq/https-certificate-windows.png" alt="Weryfikacja nazwy DNS certyfikatu" title="Weryfikacja nazwy DNS certyfikatu">
<img loading="lazy" class="inline inline-end" src="/img/hq/https-certificate-certification-path.png" alt="Sprawdzanie ścieżki certyfikacji" title="Sprawdzanie ścieżki certyfikacji">
</figure>

Często jednak sprawdzanie certyfikatu na serwerach za pomocą przeglądarki nie jest wykonalnym scenariuszem, gdyż zazwyczaj nie udostępniają one powłoki graficznej. W takim przypadku możemy skorzystać z narzędzi wiersza polecenia, takich jak [curl lub openssl, w celu wyodrębnienia certyfikatu](https://serverfault.com/questions/661978/displaying-a-remote-ssl-certificate-details-using-cli-tools).
