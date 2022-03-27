---
title: Stripe Checkout – deduplikacja subskrypcji
url: stripe-checkout-deduplikacja-subskrypcji
id: 75
category:
- other: Inne
tags:
  - api
  - rest
  - stripe
  - web services
author: Damian Terlecki
date: 2021-09-19T20:00:00
---

Stripe to jeden z liderów na rynku bram płatności. Na tle konkurencji odznacza się bardzo dobrze udokumentowanym
API, które pozwala na implementację różnych przypadków użycia. Prawdopodobnie najłatwiejszą integrację systemu
płatności umożliwia Stripe Checkout. Jest to aplikacja internetowa, dająca możliwość 
realizacji jednorazowej bądź powracającej (subskrypcja) płatności za produkt.

### Integracja z Stripe Checkout

Stripe Checkout znacząco ułatwia implementację systemu subskrypcji w aplikacji. Integracja wygląda dosyć standardowo i szybko załapiesz o co chodzi po przejrzeniu dokumentacji.
Po podaniu do API wartości konfiguracyjnych (produkt, cena, typ płatności, powtarzalność) otrzymujemy
odnośnik do tzw. sesji, która będzie [aktywna przez 24 godziny](https://stripe.com/docs/payments/accept-a-payment#:~:text=Checkout%20Sessions%20expire%2024%20hours%20after%20creation.).
Następnie klient po przejściu na stronę
Stripe uzupełnia dane potrzebne do płatności. Po sfinalizowaniu transakcji aplikacja przenosi klienta na
stronę naszego sklepu. Jednocześnie do aplikacji (*webhook*) wysyłana jest notyfikację o zdarzeniu.
Na skutek zapłaconej faktury bądź aktualizacji subskrypcji możemy nadać użytkownikowi dodatkowe uprawnienia lub zająć się
kompletowaniem zamówionych towarów.

Mimo tego, że w [sesji Stripe Checkout](https://stripe.com/docs/api/checkout/sessions) znajdziemy pola z odnośnikami do faktury i subskrypcji,
to przed dokonaniem płatności będą one puste. Dopiero po finalizacji transakcji utworzone zostaną powiązane obiekty
i (korzystając z parametrów `expand`) będziemy w stanie wyciągnąć użyteczne dane potrzebne do zarządzania subskrypcją.

### Problem duplikacji subskrypcji

Stripe Checkout nie zajmuje się kwestią deduplikacji i pozwala na wielokrotną subskrypcję tego samego produktu.
Ze względu na brak interfejsu do zarządzania sesjami i ich aktywność przez 24 godzin, nasza aplikacja musi liczyć się z faktem
możliwości jednocześnie wielokrotnej subskrypcji produktu przez pojedynczego użytkownika.

<img src="/img/hq/stripe-payments-dashboard.png" alt="Zduplikowane płatności klienta na stronie Stripe" title="Podsumowanie płatności klienta na stronie Stripe">

W takiej sytuacji mamy kilka możliwości do wyboru:
- anulowanie zduplikowanej subskrypcji:
  - [zwrot płatności](https://stripe.com/docs/api/refunds/create) (sklep będzie na minusie ze względu na opłaty transakcyjne oryginalnej płatności);
  - zakredytowaniem niewykorzystanego czasu na poczet kolejnych transakcji – tj. anulowanie subskrypcji z parametrem [`prorate=true`](https://stripe.com/docs/api/subscriptions/cancel#cancel_subscription-prorate);
  - wydłużeniem pierwszej subskrypcji – tj. anulowanie subskrypcji i [aktualizacja drugiej](https://stripe.com/docs/billing/subscriptions/billing-cycle#changing)) z parametrem `proration_behavior=none`;
- inicjalizacja sesji z odroczeniem płatności poprzez [dodanie okresu testowego](https://stripe.com/docs/billing/subscriptions/trials), wystarczającego na wygaśnięcie aktywnych
sesji i deduplikację subskrypcji;
- inicjalizacja sesji w trybie `mode=setup` – tj. zapisanie danych do płatności na przyszłość (niestety bez informacji o cenie na samej stronie) i idempotentne stworzenie subskrypcji bezpośrednio przez naszą aplikację.

Nie polecam używania do tego celu [`Idempotency-Key`](https://stripe.com/docs/api/idempotent_requests), chyba że mamy rzadką sytuację, w której zapytanie tworzące sesję nie będzie się zmieniać przez 24 godziny.
Nawet przypadku jednego produktu oferowanego przez sklep lepszym rozwiązaniem byłoby tymczasowe zapisanie identyfikatora sesji w bazie na potrzeby ponownego wykorzystania.
Klucz sprawdzi się natomiast w przypadku bezpośredniego inicjowania płatności przez aplikację.

Ze względu na deduplikację, ważnym aspektem jest uprzednie stworzenie klienta w celu przypisania go do sesji i posługiwanie się referencją do niego dla sesji przyszłych.
Pomimo rzadkości opisanego problemu z duplikacją, każde odstępstwo od standardowego zachowania sklepu, nawet jeśli zgodne z regulaminem, może okazać się długiem technicznym.

## Podsumowanie

Stripe Checkout to bardzo szybki i prosty sposób na integrację płatności w naszej aplikacji.
Podczas wyboru tego procesora warto wziąć pod uwagę kwestię deduplikacji płatności, która nie jest standardowo zaimplementowana w wersji Checkout Session API 2020-08-27.
Taką funkcjonalność możemy uzyskać poprzez implementację procesu po stronie naszej aplikacji – anulowanie zduplikowanych subskrypcji bądź własnoręczne tworzenie
subskrypcji.

Jeśli potrzebujesz większej kontroli nad zapewnieniem deduplikacji, możesz rozważyć przeniesienie części procesu płatności na swoją stronę.
W spełnieniu zgodności z najnowszymi standardami pomoże Ci biblioteka [Stripe.js & Elements](https://stripe.dev/elements-examples/). 