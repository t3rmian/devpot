---
title: Testowanie RWD bazującego na rozmiarze ekranu
url: testowanie-device-width-rwd
id: 117
category:
  - testing: Testing
tags:
  - iframe
  - rwd
author: Damian Terlecki
date: 2023-10-01T20:00:00
---

Układ strony projektowany na podstawie rozmiaru okna przeglądarki to najpopularniejsza opcja
stosowana w przypadku RWD (Responsive Web Design).
Definiowanie rozmiaru elementów widoku znając rozmiar okna, jest znacznie łatwiejsze
niż ich ustalanie dla różnych rozmiarów urządzeń, proporcji pikseli i orientacji.
Mimo tego czasami natkniesz się na witrynę, która używa zapytania o media CSS `device-max-width`
(oznaczona jako przestarzała) lub właściwości JS `window.screen.width`
zamiast odpowiednio `max-width` i `window.innerWidth`.

Testowanie RWD opartego na szerokości okna jest proste, bo wymaga po prostu zmiany rozmiar okna.
Użycie jednej z predefiniowanych rozdzielczości urządzania w zakładce DevTools przeglądarki może znacznie usprawnić nam pracę.
Trudniejsza jest jednak zweryfikowanie widoku RWD opartego na szerokości ekranu urządzenia.

# Testowanie w Safari/Chrome/Firefox

Weźmy na tapet Safari. Przeglądarka nie zmienia raportowanego rozmiaru ekranu okna nawet w trybie projektowania responsywnego.
Chrome i Firefox są tu nieco bardziej przydatne, ponieważ propagują zmianę rozmiaru po włączeniu
okienka z urządzeniami w DevToolsach.

Co więcej, nawet DevToolsy nam nie pomogą, jeśli umieścimy stronę z innej domeny wewnątrz iframe.
W przeciwieństwie do symulowanej obsługi dotykowej, np. określanej właściwością JS `navigator.maxTouchPoints`,
zmiana rozmiaru ekranu nie jest przekazywana do elementu iframe.
Żmudnym obejściem jest zmiana rozdzielczości ekranu lub testowanie na rzeczywistym bądź emulowanym urządzeniu.


<img src="/img/hq/testing-device-width.gif" alt='Obraz przedstawiający testy wartości „min-width” i „min-device-width” za pomocą przeglądarki DevTools bezpośrednio na stronie i poprzez element iframe' title='Obraz przedstawiający testy wartości „min-width” i „min-device-width” za pomocą przeglądarki DevTools bezpośrednio na stronie i poprzez element iframe'>

Innym zachowaniem, które warto przetestować, jest zamiana raportowania szerokości i wysokością ekranu po zmianie
orientacji na różnych systemach (iOS/Android). Połączenie tych wszystkich niuansów może
nawet wprowadzić w błąd, mylnie wskazując, że RWD w ogóle nie jest zaimplementowany, gdyż jest, ale słabo testowalny.
