---
title: Licencje na obrazy rejestru kontenerów Oracle
url: licencje-na-obrazy-rejestru-kontenerów-oracle
id: 115
category:
  - other: Inne
tags:
  - oracle
author: Damian Terlecki
date: 2023-09-03T20:00:00
---

Większość obrazów Dockerowych z produktami Oracle jest dostępna wyłącznie w rejestrze kontenerów Oracle pod adresem https://container-registry.oracle.com/.
Głównym tego powodem jest polityka licencyjna, dzięki której Oracle udostępnia obrazy na różnego rodzaju warunkach, począwszy od 
licencji otwartoźródłowych, poprzez licencje testowe/standardowe, kończąc na licencjach dedykowanych.

<img src="/img/hq/oracle-standard-terms-and-restrictions.png" alt='Obrazek przedstawiający zgodę na "Standardowe warunki i ograniczenia firmy Oracle"' title="Warunek wstępny do pobrania jednego z obrazów z rejestru kontenerów Oracle">

## Produkty licencjonowane

Poniżej wypisałem 5 najczęściej spotykanych licencji wraz z listą produktów, których dotyczą.

Open Source Terms and Restrictions:
- bazy danych: Oracle Database Express Edition/Free/Observability Exporter/Operator for Kubernetes, Oracle REST Data Services, Oracle Transaction Manager for Microservices, Oracle SQLDeveloper Command Line;
- GraalVM: wersje Community Edition GraalVM, compact JDK, compact Native Image, compact Nodejs;
- Java: Oracle OpenJDK;
- Middleware: Coherence CE, Coherence Operator, Oracle WebLogic Kubernetes Operator, WebLogic Monitoring Exporter;
- MySQL: wersje Community – Cluster, NDB/Kubernetes Operator, Router, Server;
- OS: Oracle Linux, Container Registry;
- obrazy Cloud Native;
- inne: Oracle GoldenGate Free, Oracle Linux Automation Manager 2.0, TimesTen XE, obrazy Verrazzano Enterprise.

Oracle Standard Terms and Restrictions:
- bazy danych: Oracle Database Enterprise Edition, Oracle Global Service Manager, Oracle Instant Client, Oracle Real Application Clusters;
- Java: Oracle JDK, Oracle JRE;
- większa część produktów middleware;
- MySQL: Commercial versions of Cluster, NDB/Kubernetes Operator, Router, Server;
- inne: Oracle TimesTen In-Memory Database, przykładowe obrazy Verrazzano Enterprise.

Oracle Other Closed Source Licenses:
- GraalVM: wersje Enterprise Edition GraalVM, compact JDK, compact Native Image, compact Nodejs.

OCR CPU Repository Terms and Restrictions:
- wybrane produkty Middleware.

Oracle JDK Container Images Licenses:
- Java: Oracle JDK.

## Podsumowanie Licencji

Na obecną chwilę podsumować można najważniejsze warunki licencji:

<table class="rwd">
   <thead>
      <tr>
         <th>Licencja</th>
         <th>Podsumowanie</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Licencja">
            Open Source Terms and Restrictions
         </td>
         <td data-label="Podsumowanie">
             Obraz i oprogramowanie kontenera na warunkach licencji otwartoźródłowych. Konkretne licencje rzadko podawane są w opisie obrazu i trzeba je weryfikować na własną rękę. 
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            Oracle Standard Terms and Restrictions
         </td>
         <td data-label="Podsumowanie">
            Jest to standardowa licencja, gdy produkt nie jest otwartoźródłowy:
            <ul>
              <li>Obraz i oprogramowanie udostępniane jest na licencji próbnej, jeśli użytkownik nie posiada innej licencji. Po okresie próbnym wymagane jest uzyskanie licencji bądź usunięcie oprogramowania.</li>
              <li>Dozwolone jest jedynie tymczasowe wykorzystanie w celach oceny/testowania (nieprodukcyjnej, nieudostępnianej klientom), nie można używać do aktualizacji programów niewspieranych (nieobjętych ważną licencją/wsparciem).</li>
              <li>Wsparcie techniczne nie jest standardowo udzielane, brak odpowiedzialności, gwarancji, możliwości przeprowadzania inżynierii wstecznej ani modyfikacji klas od Oracle. Kod źródłowy jest dostarczany tylko w celach referencyjnych, a dodatkowo Oracle może przeprowadzić audyt użytkowania.</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            Oracle Other Closed Source Licenses
         </td>
         <td data-label="Podsumowanie">
            Obecnie w kontekście tego typu licencji występuje jedno połączenie licencji Oracle Technology Network License z licencją GraalVM Enterprise Edition dla wczesnych użytkowników.
            <ul>
              <li>Obecni użytkownicy subskrypcji Oracle Java SE warunki zapisane mają w swoich umowach.</li>
              <li>Pozostali użytkownicy mają ograniczone możliwości użycia, jedynie:
                <ul>
                  <li>w ramach OCI (Oracle Cloud Infrastructure), lub;</li>
                  <li>do celów rozwoju, testowania, prototypowania i prezentacji swoich aplikacji.</li>
                </ul>
              </li>
              <li>Wsparcie techniczne nie jest standardowo udzielane, brak odpowiedzialności, gwarancji, możliwości przeprowadzania inżynierii wstecznej ani modyfikacji klas związanych z Oracle. Kod źródłowy jest dostarczany tylko w celach referencyjnych, a dodatkowo Oracle może przeprowadzić audyt użytkowania.</li>
            </ul>
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            OCR CPU Repository Terms and Restrictions
         </td>
         <td data-label="Podsumowanie">
            Jest to licencja obrazów typowo produkcyjnych (po aplikacji krytycznych poprawek) dla klientów mających dostęp do wsparcia danego produktu.
         </td>
      </tr>
      <tr>
         <td data-label="Licencja">
            Oracle JDK Container Images Licenses
         </td>
         <td data-label="Podsumowanie">
            Do tego typu licencji kwalifikuje się obecnie licencja Oracle No-Fee Terms and Conditions (NFTC) dla najnowszych wersji obrazu LTS Oracle JDK wraz z Oracle Linux License.<br/>
            Umożliwia bezpłatne użytkowanie nawet w kontekście komercyjnym i produkcyjnym. Podobnie jak w poprzednich licencjach – bez wsparcia technicznego, gwarancji, itd., ale już bez obostrzeń audytowych.
         </td>
      </tr>
    </tbody>
</table>

Jeśli powyższe licencje Ci nie odpowiadają, możesz stworzyć własne obrazy od podstaw.
Jednakże nawet w przypadku niestandardowego obrazu nadal konieczne będzie uzyskanie licencji na produkty Oracle w taki sam sposób, jak w przypadku zakończenia okresu próbnego, opisanego w Oracle Standard Terms and Restrictions.

> Uwaga: Powyższe informacje nie są formą porady prawnej i mogą nie być aktualne wraz z upływem czasu. Potraktuj je jako ogólny zarys licencjonowania dostępnego w rejestrze kontenerów i w razie wykorzystania, zweryfikuj pełną treść warunków.
