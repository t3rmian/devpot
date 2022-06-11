---
title: Testowanie różnych rozdzielczości na przeglądarkach mobilnych
url: testowanie-rozdzielczości-na-przeglądarkach-mobilnych
id: 86
category:
  - javascript: JS
  - testing: Testy
tags:
  - android
  - ios
author: Damian Terlecki
date: 2022-05-15T20:00:00
---

Podczas testów mobilnych i debugowania na rzeczywistych urządzeniach zauważysz zapewnę, brak opcji emulowania
różnych rozdzielczości. Zwykły pasek narzędzi urządzenia jest zastępowany opcją *screencastu* (przechwytywanie widoku). Bez dostępu do
systamu macOS (Safari) lub chcąc przetestować silnik przeglądarki w systemie Android,
możemy napotkać problemy z uzyskaniem potrzebnej rozdzielczości.

Strona opracowana z myślą o RWD zawiera metatag HTML, który dostosowuje szerokość widocznego
obszaru do szerokości urządzenia. Bez niego przeglądarki mobilne zazwyczaj renderują stronę w
wirtualnym obszarze większym niż szerokość ekranu. Zapominając o tym dostosowaniu tracimy możliwość pełnego wykorzystania reguł 
wiązanych z rozmiarem obszaru.

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Modyfikacja wyżej wymienionych właściwości pozwala również na emulację różnych rozdzielczości w przeglądarce mobilnej.
Jeśli masz już sesję debugowania zdalnego/USB, wystarczy, że wywołasz poniższą funkcję w konsoli przeglądarki:

```javascript
function changeViewportWidth(width = "device-width") {
    document.querySelector('meta[name="viewport"]')
        .setAttribute("content", "width=" + width + ", initial-scale=1.0, user-scalable=yes");
}

changeViewportWidth(1920);
```

<figure class="flex">
<img src="/img/hq/ios-standard-viewport.jpg" alt="Safari iOS 'device-width' viewport" title="Safari iOS 'device-width' viewport">
<img src="/img/hq/ios-big-viewport.jpg" alt="Safari iOS zwiększony viewport" title="Safari iOS zwiększony viewport">
</figure>

W przypadku wryfikacji wysokości, możesz użyć odpowiednio właściwości `height` i `device-height`.
Ostatecznie, jeśli potrzebujesz zmniejszyć obszar wyświetlania poniżej właściwości urządzenia,
spróbuj zwiększyć wartość `initial-scale` (liczba pikseli ekranu w stosunku do pikseli CSS), aby osiągnąć pożądany rezultat.
