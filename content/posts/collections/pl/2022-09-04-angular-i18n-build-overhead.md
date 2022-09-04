---
title: Angular – narzut kompilacji przy i18n
url: angular-narzut-kompilacji-i18n
id: 94
category:
  - javascript: JS
tags:
  - angular
  - nodejs
  - wydajność
author: Damian Terlecki
date: 2022-09-04T20:00:00
---

Gdy budowanie aplikacji Angularowej zaczyna wpływać na komfort Twojej pracy, warto spojrzeć, które części kompilacji
zajmują najwięcej czasu. Do niedawna, profilowanie w `angular-cli` mogliśmy włączyć zmienną środowiskową: 
- `NG_BUILD_PROFILING=1`, która:
  - przed wersją 12 pozwalała za pomocą wtyczki `speed-measure-webpack-plugin` mierzyć czas spędzony przez każdy plugin Webpacka (narzędzia wykorzystywanego do budowania aplikacji);
  - przed wersją 14 przy pomocy wbudowanego pluginu `ProfilePlugin` wypluwała również dane (`events.json`) do załadowania np. w Chrome w zakładce Performance;
- `NG_CLI_PROFILING=profile_name`, która:
  - przed wersją 12.1 dzięki pakietowi `v8-profiler-node8` generuje plik `profile_name.cpuprofile` do załadowania w narzędziach deweloperskich przeglądarki.

W wersji 14 nie uświadczymy już wbudowanego profilowania, a deweloperzy Angulara zalecają wykorzystanie flagi Node.js `--cpu-prof`. Możemy to zrobić, podając parametr bezpośrednio do
`node`, wskazując uruchomienie `ng` wraz z poleceniem budowy jako kolejny parametr: `node --cpu-prof node_modules/.bin/ng build`.

Wywołanie wygeneruje pliki z nazwą w formacie `CPU.${yyyymmdd}.${hhmmss}.${pid}.${tid}.${seq}.cpuprofile`, które załadujesz w DevToolsach przeglądarki (JavaScript Profiler).

<img src="/img/hq/node-cpuprof-angular-i18n-build.png" alt="NodeJS profil CPU internacjonalizacji aplikacji Angular" title="NodeJS profil CPU internacjonalizacji aplikacji Angular">

Weryfikacja wyników profilowania może początkowo wydawać się niezbyt przystępna. Porównując jednak rezultaty otrzymane w poprzednich iteracjach, z pewnością znajdziesz wskazówki
dotyczące potencjalnych powodów wydłużenia czasu kompilacji. Po nitce do kłębka, od największych czasów poprzez nazwy funkcji i ich lokalizację aż do właściwego procesu danego etapu budowania. 

## Przetwarzanie translacji przez Angular DevKit

Korzystając ze standardowej lokalizacji (i18n) podczas budowania, możesz spodziewać się kilku wyników profilowania różniących się sekwencją pliku.
Poszczególne pliki są między innymi wynikiem działania [puli workerów](https://github.com/angular/angular-cli/blob/14.2.x/packages/angular_devkit/build_angular/src/utils/action-executor.ts) pracujących nad wstrzyknięciem translacji (np. z plików XLF) do wynikowych plików JS.

Jeśli w danym momencie nie potrzebujesz konkretnego *locale*, możesz [wyłączyć lokalizację](https://github.com/angular/angular-cli/blob/14.2.x/packages/angular_devkit/build_angular/src/utils/i18n-options.ts#L175) i zaoszczędzić nawet kilkadziesiąt sekund podczas budowania aplikacji (*project/angular.json*):
```json
{
  "targets": {
    "build": {
      "configurations": {
        "development": {
          "localize": false
        }
      }
    }
  }
}
```
Dzięki tej opcji udało mi się uzyskać krótszy średnio o 30% czas budowania jednej z mniejszych aplikacji (25 stron, Angular w wersji 14). Źródło tekstu w tym przypadku pochodzi ze standardowego placeholdera zdefiniowanego w szablonie HTML:   
```html
<h2 i18n="@@register.register">
  Registration
</h2>
```