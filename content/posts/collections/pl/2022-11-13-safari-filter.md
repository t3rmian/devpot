---
title: Docelowy kolor przy użyciu filtru CSS
url: docelowy-odcień-filtru-css
id: 99
category:
  - other: Inne
tags:
  - css
  - safari
  - chrome
author: Damian Terlecki
date: 2022-11-13T20:00:00
---

Popularnym przypadkiem użycia filtru CSS jest zmiana odcieniu ikon bez konieczności ingerencji w źródło obrazu.
Obecnie dwa popularne narzędzia demonstrujące mechanizm uzyskania dowolnego koloru przy pomocy filtru to:
- [Hex Color To CSS Filter Converter](https://isotropic.co/tool/hex-color-to-css-filter/);
- [css-color-filter-generator](https://angel-rs.github.io/css-color-filter-generator/).

## Zmiana odcienia przy pomocy filtru

Algorytm w obu przypadkach jest podobny i można zaliczyć go do heurystycznego wyszukiwania koloru najbardziej zbliżonego (RGB/HSV) do zadeklarowanego.
Do tego celu testowane są różne argumenty filtru CSS przepisanego na język JS (potencjalne źródło różnic), składającego się z następujących funkcji:
- brightness;
- saturate;
- invert;
- sepia;
- hue-rotation;
- contrast.

Wychodząc od koloru czarnego `brightness(0) saturate(100%)`, w założeniu powinniśmy być w stanie otrzymać kolor bliski zadeklarowanemu.
Sprawdza się to w dużej części przypadków. Ostateczny kolor może jednak różnić się w zależności od wybranego profilu koloru i przeglądarki.

### Chrome 107.0.0.0 (Blink 537.36) Mac OS X Intel 10.15.7

Bez [wymuszenia profilu kolorów sRGB](brave://flags/#force-color-profile), w tej wersji przeglądarki Chrome występuje przesycenie przy użyciu filtru względem normalnie zadeklarowanego koloru.

<figure class="flex">
  <img src="/img/hq/filter-color-saturated.png" alt="Nasycenie (profil sRGB)" title="Nasycenie (profil sRGB)">
  <img src="/img/hq/filter-color-oversaturated.png" alt="Nasycenie/przesycenie (profil standardowy)" title="Nasycenie/przesycenie (profil standardowy)">
  <figcaption><center>Od góry: kolejne wartości nasycenia (profil sRGB);<br/>przesycenie (profil standardowy) zauważalne dla dwóch ostatnich obrazków.</center></figcaption>
</figure>
<center>
  <iframe width="640" scrolling="no" height="110" src="/resources/filter-color.html" ></iframe>
  <figcaption>Powyżej test kolorów (iframe) na Twojej przeglądarce</figcaption>
</center>
<br/>

### Safari 15.6 (WebKit 605.1.15) Mac OS X Intel 10.15.7
Filtr czasami gryzie się z transformacją `transform: translate3d(0, 0, 0)`, używaną czasami do wymuszenia akceleracji sprzętowej w przeglądarce Safari. 

<figure class="flex">
  <img src="/img/hq/filter-color-transformed.png" alt="Wartościu odcieniu bez/z transformacją" title="Wartościu odcieniu bez z transformacją">
  <figcaption><center>Od góry: filtr z różnym nasyceniem bez transformacji;<br/>z transformacją wyraźne różnice widoczne od trzeciego obrazku.</center></figcaption>
</figure>
<center>
<iframe width="640" scrolling="no" height="220" src="/resources/filter-color-3d.html" ></iframe>
  <figcaption>Powyżej test kolorów (iframe) na Twojej przeglądarce</figcaption>
</center>

Co ciekawe, w drzewie DOM transformacja może dotyczyć innego, niepowiązanego relacją rodzic-dziecko elementu. Do odtworzenia wystarczy, że element z filtrem będzie wyświetlany w obrębie elementu z transformacją.

Korzystając z powyższego mechanizmu, warto jest więc przetestować, czy otrzymujemy poprawną wartość odcieniu w różnych konfiguracjach.
Zwróć na to uwagę szczególnie w przypadku bardziej złożonych filtrów.
Poszczególne filtry zastosowane powyżej podejrzysz w DevToolsach przeglądarki.
