---
title: Cheat sheet for secure connection in Java
url: java-secure-connection
id: 32
category:
  - java: Java
tags:
  - security
author: Damian Terlecki
date: 2020-06-14T20:00:00
---

The standard Java package that provides an abstraction over secure network communication (certificate management, handshaking and verification) is `javax.net.ssl`. The most popular protocol which developers have to deal with is the HTTPS. HTTPS is the secure version of the request-response HTTP (RFC 2616) protocol. It can be either implemented over SSL or a more secure and upgraded version – TLS.

<style type="text/css" scoped>
    td:first-of-type {
        font-weight: 600;
    }
</style>
<center>
  <table class="rwd">
    <thead>
        <tr>
          <th>Protocol</th>
          <th>Published</th>
          <th>Website support</th>
          <th>Security</th>
        </tr>
    </thead>
    <tbody>
        <tr>
          <td data-label="Protocol">
              SSL 1.0
          </td>
          <td data-label="Published" colspan="3">
              Unpublished
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              SSL 2.0
          </td>
          <td data-label="Published">
              1995
          </td>
          <td data-label="Website support">
              1.6%
          </td>
          <td data-label="Security" class="err">
              Insecure
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              SSL 3.0
          </td>
          <td data-label="Published">
              1996
          </td>
          <td data-label="Website support">
              6.7%
          </td>
          <td data-label="Security" class="err">
              Insecure
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              TLS 1.0
          </td>
          <td data-label="Published">
              1999
          </td>
          <td data-label="Website support">
              65.0%	
          </td>
          <td data-label="Security" class="warn">
              Depends on cipher and client mitigations
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              TLS 1.1
          </td>
          <td data-label="Published">
              2006
          </td>
          <td data-label="Website support">
              75.1%
          </td>
          <td data-label="Security" class="warn">
              Depends on cipher and client mitigations
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              TLS 1.2
          </td>
          <td data-label="Published">
              2008
          </td>
          <td data-label="Website support">
              96.0%
          </td>
          <td data-label="Security" class="warn">
              Depends on cipher and client mitigations
          </td>
        </tr>
        <tr>
          <td data-label="Protocol">
              TLS 1.3
          </td>
          <td data-label="Published">
              2018
          </td>
          <td data-label="Website support">
              18.4%
          </td>
          <td data-label="Security">
              Secure
          </td>
        </tr>
      </tbody>
  </table>
  <p><i>Sources: <a href="https://en.wikipedia.org/wiki/Transport_Layer_Security">https://en.wikipedia.org/wiki/Transport_Layer_Security</a>, <a href="https://www.ssllabs.com/ssl-pulse/">https://www.ssllabs.com/ssl-pulse/</a></i>
  </p>
</center>

The support for various protocol versions and ciphers in Java is implemented in the form of a pluggable security architecture through the means of security providers. By default, at least one security provider is distributed with JRE/JDK and if needed a third-party provider can be added.

For example, at the moment of writing this, Oracle JRE8/JDK8 does not provide support for TLS 1.3, though it is planned for [2020-07-14](https://java.com/en/jre-jdk-cryptoroadmap.html). Meanwhile, you can enjoy [TLS 1.3 on Java 11](http://openjdk.java.net/jeps/332) and on [Azul's Zing/Zulu Java 8 JVMs/JDKs](https://www.azul.com/press_release/azul-systems-brings-updated-transport-layer-security-to-java-se-8/).

### Customizing the secure connection

A security provider is injected into the SSLContext which is used for initiating the connection. The default supported protocols can be seen by querying SSLContext parameters `SSLContext.getDefault().getSupportedSSLParameters().getProtocols()`. To restrict the list only to the chosen protocols, we can use `setEnabledProtocols(String[] protocols)` method of the `SSLContext`.

Let's check first what elements are there to initialize the context:

<table class="rwd">
   <thead>
      <tr>
         <th>Class</th>
         <th>Description</th>
         <th>Example use</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Class">
            SSL<wbr>Context
         </td>
         <td data-label="Description">
            An abstraction over SSL/TSL connection, facilitates connection using certificates contained within managed trust and key stores.
         </td>
         <td data-label="Example use">
         <pre>
            <code class="language-java">SSLContext context = SSLContext.getInstance("TLSv1.2");
context.init(keyManagerFactory.getKeyManagers(), trustManagerFactory.getTrustManagers(), null);</code>
         </pre>
      </tr>
      <tr>
         <td data-label="Class">
            Trust<wbr>Store
         </td>
         <td data-label="Description" colspan="2">
            A keystore containing trusted certificates from the client's point of view.
         </td>
      </tr>
      <tr>
         <td data-label="Class">
            Key<wbr>Store
         </td>
         <td data-label="Description">
            A store containing our identity certificate.
         </td>
         <td data-label="Example use">
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
         <td data-label="Class">
            Trust<wbr>Manager<wbr>Factory<br/>/<br/>Key<wbr>Manager<wbr>Factory
         </td>
         <td data-label="Description">
            Factories for initialization of trust/key managers from key stores or managers provided by the runtime. The trust/key managers can also be instantiated using your own implementation.
         </td>
         <td data-label="Example use">
         <pre>
            <code class="language-java">KeyManagerFactory kmf = KeyManagerFactory.getInstance(ksAlgorithm);
kmf.init(ks, password);
TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
tmf.init((KeyStore) null); // Default keystore will be used</code>
         </pre>
         </td>
      </tr>
      <tr>
         <td data-label="Class">
            Key<wbr>Manager
         </td>
         <td data-label="Description">
            Presents a certificate chain with the public key to the client and provides a private key for decryption of the data encrypted by the public key.
         </td>
         <td data-label="Example use">
            We've seen that passwords are associated with key stores but private keys can also have a password. Since there is no way to provide a password for the private key to the KeyManager, when the default "SunX509" KeyManagerFactory algorithm is used, it's assumed to be the same as the keystore password.
            <br/>However, if we use "NewSunX509" algorithm we can overcome this issue – <a href="https://tersesystems.com/blog/2018/09/08/keymanagers-and-keystores/">a more detailed explanation by Will Argent</a>.
         </td>
      </tr>
      <tr>
         <td data-label="Class">
            Trust<wbr>Manager
         </td>
         <td data-label="Description" colspan="2">
            Decides whether the credentials provided by the peer should be accepted.
         </td>
      </tr>
      <tr>
         <td data-label="Class">
            Hostname<wbr>Verifier
         </td>
         <td data-label="Description">
            During the SSL/TLS connection to further prevent MITM attacks, it's recommended to verify whether the target hostname is the same as the one provided with the certificate.
         </td>
         <td data-label="Example use">
            Three popular implementations can be found in Apache HttpComponents library:
            <ul>
            <li><code>org.apache.http.conn.ssl.DefaultHostnameVerifier</code> – verifies hostname (IPv4/IPv6/DNS name) based on RFC 2818 in a strict manner (only singular wildcard in the domain is legal) by comparing the target hostname and the certificate DNS Name values in the Subject Alternative Name (subjectAltName) field;</li><li>
            <code>org.apache.http.conn.ssl.BrowserCompatHostnameVerifier</code> – similar to DefaultHostnameVerifier but without the strict requirement, deprecated;</li><li>
            <code>org.apache.http.conn.ssl.NoopHostnameVerifier</code> – always returns true i.e. no verification is done – this should not be used, unless we narrow the scope of acceptable certificates to the one that the peer will present (<a href="https://tools.ietf.org/search/rfc6125">RFC 6125</a>).</li>
            </ul>
            If these three solutions do not suit your case, you can provide your own implementation based on some external information. You can read a detailed article on the <a href="https://tersesystems.com/blog/2014/03/23/fixing-hostname-verification/">hostname verification, by Will Argent</a>.
         </td>
      </tr>
    </tbody>
</table>

Most of the HTTP clients support customizing the connection through the SSLContext class. In general, the default configuration provided by the JDK/JRE would often suffice when making a secure connection as a client. Unless of course the server also requires a valid certificate from us. In such a case, we will have to prove our identity through the KeyManager.

Some examples of the final link between the secure connection configuration and client/connection classes:

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

To manage key stores, create CSR (Certificate Signing Request – to be signed by a Certification Authority) we use the `keytool` command-line program included in JRE/JDK `bin` directory. For some popular commands, refer to [the SSL Shopper's article](https://www.sslshopper.com/article-most-common-java-keytool-keystore-commands.html).

When in doubt why the standard configuration does not work, it's always a good idea to check the validity of the site certificate, domain name, and trust chain unless the certificate is self-signed and imported into the trust store (if so, verify this too).

<figure class="flex">
<img loading="lazy" src="/img/hq/https-certificate-browser.png" alt="Getting the site certificate using browser (lock symbol)" title="Getting the site certificate using browser (lock symbol)">
<img loading="lazy" src="/img/hq/https-certificate-windows.png" alt="Verification of certificate DNS name" title="Verification of certificate DNS name">
<img loading="lazy" src="/img/hq/https-certificate-certification-path.png" alt="Checking the certification path" title="Checking the certification path">
</figure>

Often though, on the servers, checking the certificate through the browser isn't a feasible scenario as they're usually run in a headless mode. You can still use some command-line tools like [curl or openssl to extract the certificate](https://serverfault.com/questions/661978/displaying-a-remote-ssl-certificate-details-using-cli-tools) in such a situation.

Cheers, and stay safe!
