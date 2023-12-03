---
title: Wymuszenie kolorów wyświetlanych przez klienta w sklepie online
url: wymuszenie-kolorów-klienta-sklep-online
id: 119
category:
  - javascript: JS
tags:
  - arkusze stylów
  - przeglądarki
  - firefox
  - chrome
  - opera
  - safari
author: Damian Terlecki
date: 2023-11-05T20:00:00
---

Ostatnio przeglądałem na telefonie jeden ze sklepów internetowy w poszukiwaniu następcy mojej jesiennej kurtki.
Gdy znalazłem naprawdę fajny egzemplarz w kolorze kamelowym tuż przed zakończeniem zamówienia z jakiegoś powodu przerzuciłem się na komputer.
Ku mojemu zdziwieniu kolor wyświetlany w przeglądarce na PC zmienił się na czerwony! Zajęło mi kilka minut, zanim
powiązałem problem z (wymuszonym) trybem nocnym, o którego włączeniu nie pamiętałem już przeszło rok.

<figure class="flex">
<img src="/img/hq/filtered-dark-mode.png" alt="Night mode (Brave Browser iOS)" title="Night mode (Brave Browser iOS)">
<img src="/img/hq/standard-dark-mode.png" alt="Standardowe kolory" title="Standardowe kolory">
<center>
  <figcaption><small>Zrzuty ekranu obrazu modelu RGB renderowanego w przeglądarkach z włączonym trybem nocnym/bez niego<br/>na stronie<a href="https://en.wikipedia.org/wiki/RGB_color_model">https://en.wikipedia.org/wiki/ RGB_color_model</a>, stworzonego przez użytkownika Immanuelle, na licencji <a href="https://creativecommons.org/licenses/by-sa/4.0/#">CC BY-SA 4.0</a>.</small></figcaption>
</center>
</figure>

## Tryb ciemny standardowy, wymuszony bądź zdefiniowane przez użytkownika

Okazuje się, że istnieją różne implementacje trybu nocnego, a wersja robocza W3C o nazwie [CSS Color Adjustment Module Level 1](https://www.w3.org/TR/css-color-adjust-1/)
próbuje ujednolicić niektóre z problematycznych kwestii (i jest zaimplementowana przez wiele przeglądarek), przede wszystkim:
1. Opisuje definiowanie preferowanych schematów kolorów i zapytanie CSS o preferowany schemat `@media (prefers-color-schemat: dark)`.
2. Wyjaśnia możliwość zastąpienia schematu kolorów przez przeglądarkę i sposoby pracy z nim/obejścia.
3. Ostatecznie opisuje integrację z arkuszami stylów przeglądarki/użytkownika, które zazwyczaj można dostosować za pomocą wtyczek.

Biorąc pod uwagę ten dokument oraz inne funkcjonalności możemy zadać pytanie: które obecnie (2023) przeglądarki 
pozwalają na zmianę motywu poprzez wymuszenie niestandardowych kolorów strony?

| Przeglądarka         | Nazwa funkcjonalności                                                                                          | Zasada (poziom) działania         |
|----------------------|----------------------------------------------------------------------------------------------------------------|-----------------------------------|
| bazująca na Chromium | \<nazwa_przeglądarki\>://flags/</br>– Auto Dark Mode for Web Contents                                          | przeglądarka                      |
| Firefox              | Dark Mode (WebExtension);</br>about:config</br>– toolkit<wbr>.legacyUserProfileCustomizations<wbr>.stylesheets | arkusze stylów                    |
| *                    | Night Eye (wtyczka/rozszerzenie)                                                                               | arkusze stylów                    |
| Safari mobile        | Nitefall (wtyczka/rozszerzenie)                                                                                | arkusze stylów                    |
| Opera GX             | Force dark pages                                                                                               | przeglądarka                      |
| Opera GX             | Web modding                                                                                                    | arkusze stylów                    |
| Brave mobile         | Night mode (nie mylić z dark mode)                                                                             | przeglądarka</br>+ arkusze stylów |


Otrzymanie w trakcie zamówienia koloru innego niż postrzegany przy zamówieniu jest z w tym przypadku problemem klienta
i w pewnym stopniu samo-rozwiązywalnym, jeśli mamy prawo do zwrotu przy zamówieniu online tak jak w UE.
Czy można jednak temu zapobiec na wczesnym etapie ograniczając niepotrzebne koszty?

## Wykryć czy zastąpić wymuszony tryb ciemny?

Czasami niektóre elementy są zbyt krytyczne biznesowo, aby pozwolić przeglądarce na zmianę ich kolory.
W takiej sytuacji możesz spróbować obejść to zachowanie lub powiadomić użytkownika o różnicy kolorów.

<img src="/img/hq/problem-ciemnego-motywu.svg" alt="Diagram przedstawiający możliwe rozwiązania problemu ciemnego motywu nadpisującego krytyczne elementy strony. Sposoby na wyłączenie tego zachowania oraz jego wykrycie i powiadomienie użytkownika." title="Potencjalne rozwiązania problemu ciemnego motywu nadpisującego kolory krytycznych elementów strony">

Na podstawie powyższego diagramu można dojść do wniosku, że najlepszym podejściem
będzie wyłączenie możliwości wymuszania kolorów i powiadomienie użytkownika, gdy ma on jakiś niestandardowy
arkusz stylów. Trudno bowiem wykryć, czy specyficzne elementy (np. jedynie obrazy) strony zmieniły kolory na poziomie przeglądarki.
Jednocześnie, nadpisywanie arkuszy stylów użytkownika jest trudne w implementacji
– nawet selektor o najwyższej specyficzności można zastąpić w kodzie JS wtyczki.
Innym razem może to być nawet niepożądane, szczególnie gdy użytkownik wymusza specyficzne kolory z powodu problemów z rozpoznawaniem barw.
