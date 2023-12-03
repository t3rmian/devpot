---
title: Protokół przy przekierowaniu serwletowym w WebLogic
url: weblogic-servlet-redirect-https
id: 121
category:
  - jee: JEE
tags:
  - weblogic
  - serwlety
author: Damian Terlecki
date: 2023-12-03T20:00:00
---

Dla niektórych kodów stanu HTTP przeglądarka automatycznie przekierowuje użytkownika do miejsca wskazanego przez nagłówek "Location" zwracany w odpowiedzi zapytania.
Kody wyzwalające automatyczne przekierowanie zaczynają się od cyfry 3. W przypadku interfejsu serwletowego w Javie, tj.
`javax.servlet.http.HttpServletResponse.sendRedirect(String)`, będzie to najczęściej status 302.

Podczas migracji aplikacji serwletowej z serwera takiego jak Tomcat na serwer WebLogic możesz napotkać
na pewną funkcjonalność, która sprawia, że nagłówek "Location" zostanie uzupełniony wartością absolutną wraz z protokołem.
Niestety, funkcjonalność ta często gryzie się z *reverse-proxy*, które to terminuje ruch SSL i komunikuje się z serwerem WebLogic przy wykorzystaniu
niezabezpieczonego portu HTTP.

<img src="/img/hq/browser-mixed-content.png" title="Przeglądarki blokują żądania HTTP w kontekście strony załadowanej przy użyciu HTTPS np. przy dołączaniu zasobów lub przy zapytaniach AJAX, zwracając błąd mixed-content" alt="Przeglądarki internetowe blokują treści mieszane, aby zwiększyć bezpieczeństwo i prywatność użytkowników podczas przeglądania stron internetowych. Treść mieszana odnosi się do strony internetowej załadowanej bezpiecznym protokołem (HTTPS) zawierającej elementy niezabezpieczone (HTTP). Kiedy bezpieczna strona internetowa (ładowana przez HTTPS) zawiera zasoby (takie jak obrazy, skrypty, arkusze stylów, a także przekierowania lokalizacji w przypadku AJAX) z niepewnego połączenia (HTTP), tworzy to lukę w zabezpieczeniach.">

## WebLogic a przekierowanie względnej lokalizacji na bezwzględny adres URL

Sytuację, w której WebLogic standardowo przekieruje do lokalizacji HTTP przy użyciu protokołu HTTPS, można łatwo zasymulować
przy użyciu *reverse-proxy* nginx bądź Apache.
Załóżmy, że wysyłamy zapytanie POST do https://example.com/app/foo, czyli serwletu WebLogic wywołującego `sendRedirect("bar")` zza *reverse-proxy*:

```shell
#  Nagłówki żądania (zbędne nagłówki zostały pominięte)
POST /app/foo HTTP/1.1
Host: example.com
Origin: https://example.com
Referer: https://example.com/bar
```

Żądanie wychodzące od *reverse-proxy*:
```shell
POST /app/foo HTTP/1.1
Host: [example.com]
X-forwarded-host: [example.com]
Upgrade-insecure-requests: [1]
X-forwarded-server: [example.com]
X-forwarded-for: [192.168.0.100]
X-forwarded-proto: [https]
X-forwarded-ssl: [on]
```

Mimo że *reverse-proxy* dołożyło nagłówki `X-forwarded-*` pozwalające na skonstruowanie poprawnego adresu zwrotnego, WebLogic odpowie zasobem HTTP zamiast HTTPS:
```shell
HTTP/1.1 302 Moved Temporarily
Location: http://example.com/app/bar
```

## Rozwiązanie problemu mixed-content przy przekierowaniu

Problem możemy rozwiązać na kilka różnych sposobów:
- przepisując nagłówek odpowiedzi na serwerze proxy;
- implementując niestandardowy filtr, który przepisze nagłówek odpowiedzi przy wyjściu z WebLogica;
- włączając opcję "WebLogic Plugin Enabled" w konsoli WebLogic i dodając nagłówek żądania "WL-Proxy-SSL: ON” na serwerze proxy;
- ustawiając "WL front end host" i port w konsoli WebLogica.

Zaciekawiony, dlaczego standardowe nagłówki nie są obsługiwane, zerknąłem wewnątrz dostarczonej biblioteki serwletów WebLogica.
Szybko jednak zdałem sobie sprawę, że najbezpieczniejszym i najprostszym rozwiązaniem jest po prostu wyłączenie bezwzględnego uzupełniania adresu URL podczas przekierowania.

> Do zweryfikowania działania umieściłem *breakpoint* na metodzie `sendRedirect()`, i wywołałem w debuggerze `getClass().getProtectionDomain().getCodeSource().getLocation()`.
> Mając lokalizację implementacji `HttpServletResponse`, dodałem ją do ścieżki klas w moim IDE:
> */u01/oracle/wlserver/modules/com.oracle.weblogic.servlet.jar!/weblogic/servlet/internal/ServletResponseImpl.class* (z oficjalnego obrazu dockerowego wersji WebLogic 12.1.2.4).

Okazuje się, że możemy to zrobić w deskryptorze aplikacji internetowej `WEB-INF/weblogic.xml`. Pamiętaj aby zamienić wersję XSD `1.9` na
[pasującą do Twojego WebLogica](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app
                   http://xmlns.oracle.com/weblogic/weblogic-web-app/1.9/weblogic-web-app.xsd">
    <context-root>/app</context-root>
    <container-descriptor>
        <redirect-with-absolute-url>false</redirect-with-absolute-url>
    </container-descriptor>
</weblogic-web-app>
```

> Komentarz z pliku XSD: Jeśli element `redirect-with-absolute-url` jest ustawiony na `false`, wówczas kontener serwletu nie przekonwertuje względnego adresu URL na bezwzględny adres URL w nagłówku lokalizacji w przekierowaniu.