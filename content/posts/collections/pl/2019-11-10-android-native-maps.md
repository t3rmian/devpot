---
title: Mapy natywne na przykładzie MapyPB
url: mobilne-mapy-natywne
id: 16
tags:
  - aplikacje mobilne
  - android
  - geo-mapowanie
author: Damian Terlecki
date: 2019-11-10T20:00:00
source: https://github.com/t3rmian/PBMap
---

Tworzenie własnych map w Androidzie może wydawać się z pozoru trudne, ale po zrozumieniu ich działania, może stać się punktem wejściowym do całkiem fajnego projektu. Jeśli nie wiesz jeszcze jakie mechanizmy stoją za takimi mapami i jakie problemy mogą pojawić się podczas dewelopmentu — nic straconego. Dzisiaj postaram się krótko wyjaśnić podstawowe aspekty silnika odpowiedzialnego za wyświetlanie i interakcję z mapą, a także opowiem o ich przygotowaniu, mapowaniu i routingu. Artykuł ten jest oparty na moich doświadczeniach w tworzeniu aplikacji związanych z mapowaniem, a w szczególności z ostatnią aktualizacją [MapyPB](https://play.google.com/store/apps/details?id=io.github.t3r1jj.pbmap) — interaktywnej mapy Politechniki Białostockiej na urządzenia mobilne.

# Interfejs (silnik) mapy

Jednym z czynników ograniczających urządzenia mobilne są zasoby. W tym przypadku główne problemy związane są z obrazem mapy. Idealnie chcielibyśmy mieć mapę bardzo wysokiej jakości. Jest to zwykle związane z obrazem o wysokiej rozdzielczości, który dodatkowo zwiększa się wraz z rozmiarem obszaru mapy. Weźmy jako przykład mapę *4000px x 4000px*. Jest to rozsądny rozmiar do wyświetlenia dostatecznie szczegółowej mapy kampusu uniwersyteckiego. Biorąc teraz pod uwagę rozmiar, zainicjalizowany obraz reprezentujący tę mapę w formacie *ARGB8888* zajmie ponad **60 MB** pamięci (pomijając kwestię wykorzystania kanału alfa)! Załadowanie zajmie trochę czasu, ale najgorsze jest to, że interakcja z mapą będzie tragiczna. Aplikacja zacznie klatkować. Zacznie się ciąć przy powiększaniu i pomniejszaniu, a przeciąganie też nie będzie płynne. Oczywiście zakładając, że w pewnym momencie nie zabraknie pamięci.

Co w takiej sytuacji? Jak można się spodziewać, istnieje wiele różnych rozwiązań, na których oparto działanie map (Google Maps, jakdojade). Wśród nich są mechanizmy takie jak ładowanie progresywne lub podpróbkowanie (ang. subsampling), najczęściej jednak wykorzystywany jest podział mapy na mniejsze kawałki, tzw. kafelki.

<figure>
<a href="https://play.google.com/store/apps/details?id=io.github.t3r1jj.pbmap"><img src="/img/hq/PBMap-loading.png" alt="MapaPB — ładowanie kafelków" title="MapaPB — ładowanie kafelków"></a>
</figure>

## Kafelki

Jest to rozwiązanie, w którym zamiast ładowania jednego dużego obrazu mapa jest dzielona na kafelki. To znacznie poprawia interakcję z nią, ponieważ każdy kafelek jest znacznie mniejszy i nie trzeba go ładować, dopóki nie jest potrzebny. Silnik, oprócz danych potrzebnych do wyświetlenia obecnego zakresu, przygotuje również kilka kafelków poza jego granicami, próbując utrzymać płynne przewijanie. Jeśli przesuniesz bardzo szybko, z pewnością zobaczysz, że ładowanie nie może nadążyć za interakcją użytkownika. Jest to kompromis pozwalający zapewnić dobre doświadczenie użytkownikowi (ang. user experience). Ok, ale w tym momencie ugryźliśmy tylko połowę problemu. Pomniejszając mapę, wrócimy do punktu wyjścia...

Poprzez ładowanie obrazów w różnych rozdzielczościach, mapy radzą sobie również z tym problemem. Przy maksymalnym powiększeniu chcemy dość szczegółowej mapy, ale przy oddaleniu szczegóły stają się mniej ważne. Idealne jest więc ładowanie kafelków o znacznie gorszej rozdzielczości, ponieważ szczegóły i tak nie będą widoczne. Oznacza to, że jeśli chcesz mieć mapę z dużym powiększeniem, zaleca się przygotowanie obrazów o różnych rozdzielczościach, odpowiadających współczynnikowi przybliżenia, i pocięcie ich na płytki. Silnik mapy zajmie się buforowaniem i ponownym wykorzystaniem bitmap w celu efektywniejszego wykorzystania zasobów.

<figure>
  <figcaption><center><b>GPL-3.0 MapView autorstwa 'peterLaurence'</b></center></figcaption>
  <a href="https://github.com/peterLaurence/MapView"><img src="/img/hq/MapView.png" alt="Mapa z głębokim powiększeniem" title="Mapa z głębokim powiększeniem"></a>
</figure>

## Warstwy

Zarządzanie kafelkami to tylko część logiki stojącej za interfejsem mapy. Czym jest dobra mapa, bez zestawu punktów POI (Point of Interest)? Mapy zazwyczaj wyświetlają przydatne miejsca, takie jak stacje, sklepy, szpitale, policja itp. Oczywiście można je uwzględnić bezpośrednio w obrazie mapy. Nie jest to jednak zalecane, gdyż punkty te są często zmienne w czasie, bądź możemy chcieć je wyświetlać inaczej, w zależności od lokalizacji. Do realizacji takiej funkcjonalności mapy oferują interfejs nakładek (warstw). Dzięki nim możemy, na mapie możemy umieszczać różne rzeczy, od elementów tekstowych, poprzez markery i obrazy kończąc na interaktywnych kształtach. Jest to jedna z podstawowych funkcji oferowanych przez porządny silnik mapy.

Problem z nakładkami, który może Cię dotknąć, polega na tym, że silnik zazwyczaj pozostawia ich zarządzanie w gestii programisty (klienta). Zwykle biblioteka zajmuje się tylko kafelkami. Dlatego, jeśli utworzysz kilkaset lub kilka tysięcy markerów, aplikacja może zacząć drastycznie spowolnić lub zacznie brakować pamięci. Utrzymywanie ich w możliwie najprostszej formie pozwala zachować wydajność. Preferowanym jednak rozwiązaniem jest zarządzanie znacznikami w zależności od zakresu kamery, ale przechwytywanie zdarzeń dotyczących interakcji z zakresem kamery (przewijanie oraz przybliżanie i oddalanie) jest dosyć kosztowne i należy o tym pamiętać podczas implementacji. Ostatecznym rozwiązaniem, które wymaga jednak zmiany architektury, jest wstępne renderowanie mapy na serwerze.

## Mapowanie

Przed dodaniem punktów POI do przygotowanej mapy, dobrym pomysłem będzie zdefiniowanie jej układu współrzędnych i oraz granic. W przypadku mapy rzeczywistej przestrzeni, układ współrzędnych geograficznych jest standardowym wyborem. Będziemy operowali tutaj na pomiarach szerokości geograficznej (pozycja północ-południe) i długości (pozycja wschód-zachód). Przyzwoity silnik pomoże ci płynnie przetransformować współrzędne świata rzeczywistego do pozycji na twojej mapie (obrazie) i na odwrót. Chociaż jeśli nie używasz współrzędnych rzeczywistych i nie planujesz integracji z GPS-em, równie dobrze możesz pominąć ten temat.

W przypadku własnego podejścia konieczne byłoby nie tylko przełożenie współrzędne na pozycje w jednostkach pikseli, ale także pamiętanie o skali (poziomie powiększenia). Chociaż jeszcze nie wszystko zostało powiedziane tutaj powiedziane. Część odpowiadająca za przekształcenie jest najtrudniejsza. To bardzo szeroki temat. Istnieje bowiem wiele punktów odniesienia (modeli Ziemi), rzutowań map i zawsze występuje pewne [zniekształcenia](https://en.wikipedia.org/wiki/Theorema_Egregium) podczas rzutowania powierzchni kuli na płaszczyznę.

Z laickiego punktu widzenia istotną wzmianką byłoby to, że większość aplikacji do mapowania sieci korzysta z projekcji *Web Mercator*. Ten układ odniesienia jest dość zbliżony do *WGS84*, który jest z kolei wykorzystywany przez system GPS ([sprawdź różnice](https://lyzidiamond.com/posts/4326-vs-3857)). Silnik mapy może nie udostępniać funkcji odpowiadającej transformacji współrzędnych do oczekiwanego układu, ale zazwyczaj zapewnia interfejs do własnych obliczeń. Jeśli jednak mapa nie obejmuje zbyt wielkiego terenu, standardowa interpolacja liniowa powinna sprawdzić się idealnie.

## Wyznaczanie ścieżki

Moim zdaniem jest to jeden z najbardziej satysfakcjonujących tematów pod względem mapowania. Bierzesz algorytm, który poznałeś na uczelni — *Dijkstra* (graf ważony) lub *BFS* (graf bez wag), implementujesz go i działa. Wisienka na torcie to dodanie wyświetlania ścieżki w warstwie widokowej. Sama lokalizacja za pomocą GPS nie zawsze będzie dawać idealne rezultaty, szczególnie wewnątrz budynków, jest to jednak wartościowa funkcjonalność. Nie zapomnij także o wyświetleniu odległości do celu!

Biorąc pod uwagę mapy wewnętrzne budynków, potrzebna może być nieco niestandardowa logika do wyświetlania tras obejmujących wiele pięter. Jest to również miejsce, w którym konieczne jest wprowadzenie trzeciego wymiaru — wysokości. Najprostszą implementacją jest ukrycie na widoku krawędzi o wysokości innej niż ta zdefiniowana na mapie piętra. Warto również zastanowić się nad sposobem pomiaru wysokości.

<figure>
<a href="https://play.google.com/store/apps/details?id=io.github.t3r1jj.pbmap"><img src="/img/hq/PBMap-routing.png" alt="MapaPB — trasa" title="MapaPB — trasa"></a>
</figure>

## Przygotowanie danych

Podsumowując — trzy rzeczy, potrzebne do realizacji aplikacji mobilnej z natywną mapą to kafelki oraz dane o punktach POI i trasach. Wymieniłem je kolejno względem rozmiaru danych, od największego do najmniejszego. Z mojego doświadczenia wynika, że kafelki zajmują co najmniej 10 razy więcej niż pozostałe dwa typy danych. Biorąc pod uwagę mapowanie wewnętrzne, jeśli chcesz zapewnić wsparcie dla kilku (10-20) budynków, najpewniej zmieścisz się w zakresie 5-10 MB. Dla takiego zastosowania rozsądną opcją wydaje się przechowywanie wszystkich danych offline, wewnątrz aplikacji. W przypadku wielu klientów lepiej rozważyć rozbicie aplikacji na dedykowane wersje podczas kompilacji bądź umieszczenie zasobów na serwerze.

Jeśli chodzi o moją aplikację (MapaPB), dane przechowuję offline, w plikach XML. Nie zaimplementowałem jeszcze, sposobu modyfikowania POI za pomocą interfejsu użytkownika, więc ta struktura jest dla mnie bardzo wygodna podczas przygotowywania danych. Idealnie byłoby przechowywać te informacje w bazie danych, aby uzyskać lepszą wydajność, jednak aplikacje działa płynnie na budżetowych urządzeniach oraz zadowalająco podczas emulowanych testów interfejsu wykonywanych dzięki Travisowi.

Przykładowa struktura danych mapy może wyglądać następująco:
```xml
<map height="3072" id="PB_campus" route_path="routes/pb_campus.xml" url="http://pb.edu.pl/"
    width="5120">
    <tiles_configs>
        <tiles_config height="256" path="tiles/pb_campus/1000/tile-%d_%d.png" width="256"
            zoom="1" />
        <tiles_config height="256" path="tiles/pb_campus/500/tile-%d_%d.png" width="256"
            zoom="0.5" />
        <tiles_config height="256" path="tiles/pb_campus/250/tile-%d_%d.png" width="256"
            zoom="0.25" />
    </tiles_configs>
    <coordinates>
        <coordinate alt="150" lat="53.120405" lng="23.142700" />
        <coordinate alt="150" lat="53.115460" lng="23.156433" />
    </coordinates>
    <space id="PB_WI" reference_map_path="data/pb_wi.xml" url="https://wi.pb.edu.pl">
        <coordinates>
            <coordinate alt="150" lat="53.11696" lng="23.14564" />
            <coordinate alt="150" lat="53.11726" lng="23.14709" />
            <coordinate alt="150" lat="53.11641" lng="23.14759" />
            <coordinate alt="150" lat="53.11611" lng="23.14614" />
        </coordinates>
    </space>

    <spot id="bkm_529">
        <coordinates>
            <coordinate alt="150" lat="53.1162607" lng="23.1451221" />
        </coordinates>
    </spot>
    <!--...-->
</map>
```

W moim przypadku każda mapa jest również powiązana z trasą składającą się z dwukierunkowych krawędzi:
```xml
<route id="pb_campus">
    <edges>
        <!--CAMPUS BEGIN-->
        <edge>
            <start alt="150" lat="53.11653" lng="23.14490" />
            <end alt="150" lat="53.11669" lng="23.14553" />
        </edge>
        <edge>
            <start alt="150" lat="53.11669" lng="23.14553" />
            <end alt="150" lat="53.11697" lng="23.14536" />
        </edge>
        <edge>
            <start alt="150" lat="53.11697" lng="23.14536" />
            <end alt="150" lat="53.11701" lng="23.14551" />
        </edge>
        <!--...-->
    </edges>
</route>
```

Jeśli chodzi o same kafelki, możesz wykorzystać otwartoźródłowe dane np. z OpenStreetMap. Największą wartość mają jednak własnoręcznie przygotowane mapy. Mając obraz, kafelki mogą być wygenerowane przez dowolny program do generowania kafelków :) O ile pamiętam, sam używałem programu [ImageMagick](https://imagemagick.org/index.php) polecanego przez autora [TileView](https://github.com/moagrius/TileView/wiki/Creating-Tiles) — biblioteki stanowiącej rdzeń MapyPB:

```bash
convert image.png -crop 256x256 -set filename:tile "%%[fx:page.x/256]_%%[fx:page.y/256]" +repage +adjoin "tiles/tile-%%[filename:tile].png"
```
<img src="/img/hq/PBMap-tiles.png" alt="MapaPB — tiles" title="MapaPB — kafelki">

# Podsumowanie

Tworzenie własnych map mobilnych o natywnym wyglądzie jest naprawdę ciekawym procesem. Nie tylko pozwala dowiedzieć się, jak działają silniki map oraz zapoznać się z różnymi modelami projekcji map, ale także poznać różne aspekty systemu mobilnego wybranego implementacji aplikacji. Kolejnym krokiem, po wdrożeniu podstawowej wersji mapy to implementacja zachowywania stanu mapy i aplikacji. Inne ciekawe elementy do rozważenia to przeszukiwanie punktów POI i wdrożenie pełnej nawigacji. W tym obszarze istnieje również szeroki temat lokalizacji w pomieszczeniach, który stale [zyskuje na popularności](https://www.reuters.com/brandfeatures/venture-capital/article?id=45257).
