---
title: Ładowanie czcionek przez JRE
url: ładowanie-czcionek-jre
id: 74
category:
- java: Java
tags:
  - jvm
  - native
  - fonts
author: Damian Terlecki
date: 2021-09-05T20:00:00
---

Głównym miejscem w Javie, gdzie wykorzystywane są czcionki, jest niewątpliwie Java 2D. Są to przede wszystkim klasy pakietu *java.awt.\**,
na których bazuje nie tylko Swing – biblioteka to tworzenia graficznego interfejsu, ale również wiele zewnętrznych bibliotek do budowania diagramów
czy generowania obrazów.

Z punktu widzenia czcionek, częścią w której zbiega się najwięcej wywołań jest metoda *drawString* klasy *Graphics2D*. To właśnie tutaj
następuje konwersja znaków na glify wybranej czcionki oraz rysowanie. Samą czcionkę możemy zarejestrować przy użyciu metody *registerFont*
obiektu *GraphicsEnvironment* uzyskiwanego przez `GraphicsEnvironment.getLocalGraphicsEnvironment()`. Standardowo jednak większość czcionek pochodzi z
systemu operacyjnego.

## Czcionki w JRE

Za standardowe ładowanie czcionek odpowiada interfejs *sun.font.FontManager* z implementacją właściwą dla danego systemu:
- Windows – *sun.awt.Win32FontManager*;
- MacOS – *sun.font.CFontManager*;
- Linux – *sun.awt.X11FontManager*.

Podając w parametrze systemowym `sun.font.fontmanager` nazwę klasy implementującej podany interfejs, jesteśmy w stanie podpiąć
własny mechanizm ładowania czcionek.
  
Podstawową rzeczą, jaką warto znać, jest podział czcionek na logiczne i fizyczne. W Javie do dyspozycji mamy 5 logicznych czcionek i 4 różne style,
w ramach których grupowane są czcionki fizyczne. Są to (czcionki):
- Serif;
- SansSerif;
- Monospaced;
- Dialog;
- DialogInput;

i style:
- plain;
- bold;
- italic;
- bolditalic.

Jednocześnie nie wszystkie czcionki fizyczne muszą należeć do którejkolwiek grupy. Wybierając czcionkę logiczną, glify danych znaków
będą wyszukiwane w pewnej zdefiniowanej kolejności, dzięki czemu realizowane może być wsparcie dla wszystkich znaków specjalnych bez
konieczności dostarczania czcionki zawierającej wszystkie możliwe glify. 20 takich kombinacji to tzw. czcionki złożone (composite).

<img src="/img/hq/composite-font.png" alt="Czcionka Serif Plain w Javie" title="Czcionka Serif Plain w Javie">

## sun.awt.X11FontManager

Ładowanie czcionek to dość złożony proces zależny od systemu operacyjnego. Żeby zobaczyć, jak wygląda ten mechanizm, weźmy na tapet Javę w systemie Linuks.
Inicjalizacja managera czcionek następuje już przy pierwszym wywołaniu rysowania tekstu. Najogólniejsza lista kroków przedstawia się następująco:
1. Wywołanie `FontManagerFactory.getInstance()` i inicjalizacja właściwej implementacji tj. sun.<wbr>awt.<wbr>X11FontManager;
2. Zarejestrowanie czcionek z folderu JRE `${java.home}/lib/fonts`;
3. Próba załadowania konfiguracji czcionek JRE `${java.home}/lib/fontconfig.*.properties`:
  - właściwa konfiguracja wyszukiwana jest na podstawie nazwy dystrybucji i wersji;
  - najczęściej krok ten jest pomijany na rzecz kroku 4. ze względu na brak właściwego pliku konfiguracyjnego;
  - [format](https://docs.oracle.com/javase/8/docs/technotes/guides/intl/fontconfig.html) jest dosyć złożony, jednocześnie umożliwia referencję na czcionki systemowe (xlfd), podanie własnej czcionki z namiarami na plik, a także
definicję kolejności wyszukiwania z uwzględnieniem locale;
4. Załadowanie konfiguracji z natywnego systemu *fontconfig*:
  - krok wykonywany, gdy w wyniku kroku 3. czcionki finalnie nie zostały załadowane (sprawdzane poprzez wykrycie czcionki *plain serif*);
  - przed załadowaniem konfiguracji systemowej sprawdzany jest plik konfiguracyjny z poprzedniego uruchomienia – `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`;
  - prostszy format mapujący czcionki fizyczne na logiczne wraz z ich kolejnością;
5. Zarejestrowanie czcionek rezerwowych JRE `${java.home}/lib/fonts/fallback` i podpięcie ich pod wszystkie czcionki logiczne jako ostatnie;
6. Zarejestrowanie czcionek systemowych oraz dodatkowych wskazanych przez `-Dsun.java2d.fontpath=<prepend:|append:>`.

Do debugowania mechanizmu ładowania przydaje się flaga `-Dsun.java2d.debugfonts=true` włączająca logowanie informacji, jakie czcionki zostały załadowane
z jakiego miejsca wraz z ewentualnymi błędami. Poleceniem `fc-list` wylistujemy czcionki systemowe (system *fontconfig*) a `cat /etc/lsb-release` zwróci
nam nazwę i wersję dystrybucji Linuksa, potrzebną do ewentualnego stworzenia plików konfiguracyjnych.

<img src="/img/hq/jre-fonts.png" alt="Rezultat ustawienia -Dsun.java2d.debugfonts=true" title="Rezultat ustawienia -Dsun.java2d.debugfonts=true">

## Właściwości konfiguracyjne czcionek JRE

Obecnie metoda ta jest rzadko stosowana na rzecz natywnego ładowania z systemu *fontconfig*. Mimo tego jesteśmy w stanie stworzyć własny plik z wybranymi czcionkami, który zostanie
załadowany zamiast konfiguracji *fontconfig*. Najprostszy plik dla systemu Ubuntu 20 (umieszczony np. w `/usr/lib/jvm/adopt-openjdk-16/lib/fontconfig.Ubuntu.properties`) może wyglądać następująco:

```properties
version=1
serif.plain.latin-1=-b&h-lucidabright-demibold-r-normal--*-%d-*-*-p-*-iso8859-1
sequence.allfonts=latin-1
filename.-b&h-lucidabright-demibold-r-normal--*-%d-*-*-p-*-iso8859-1=$JRE_LIB_FONTS/LucidaBrightItalic.ttf
```

Przyjęta tutaj (rekomendowana) składnia *xlfd* pozwala na identyfikację właściwej czcionki systemowej w razie niezdefiniowania ścieżki do pliku. 
Dodatkowo w zależności od dystrybucji w `${java.home}/lib` możemy czasami znaleźć kompleksowe konfiguracje dla różnych systemów.
Posiłkując się dokumentacją, stworzenie takiej konfiguracji wymaga jedynie uprawnień do zapisu konfiguracji w katalogu JRE.

## Właściwości konfiguracyjne fcinfo

Drugim ciekawym plikiem konfiguracyjnym związanym już z systemem *fontconfig* jest `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`.
Plik ten tworzy się po pierwszym przetworzeniu konfiguracji na potrzeby cache'owania. Najprostsza konfiguracja może wyglądać następująco:

```properties
#JDK Font Configuration Generated File: *Do Not Edit*
#Sat Sep 04 09:16:27 CEST 2021

# fc-list --version
fcversion=21301
# always 1
version=1

monospaced.0.0.family=DejaVu Sans Mono
monospaced.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf
monospaced.1.0.family=DejaVu Sans Mono
monospaced.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
monospaced.2.0.family=DejaVu Sans Mono
monospaced.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Oblique.ttf
monospaced.3.0.family=DejaVu Sans Mono
monospaced.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-BoldOblique.ttf
sansserif.0.0.family=DejaVu Sans
sansserif.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
sansserif.1.0.family=DejaVu Sans
sansserif.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
sansserif.2.0.family=DejaVu Sans
sansserif.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf
sansserif.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf
sansserif.3.0.family=DejaVu Sans
serif.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf
serif.0.0.family=DejaVu Serif
serif.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf
serif.1.0.family=DejaVu Serif
serif.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf
serif.2.0.family=DejaVu Serif
serif.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf
serif.3.0.family=DejaVu Serif

# Must exist at leas one entry for each logical font and style
monospaced.0.length=1
monospaced.1.length=1
monospaced.2.length=1
monospaced.3.length=1
sansserif.0.length=1
sansserif.1.length=1
sansserif.2.length=1
sansserif.3.length=1
serif.0.length=1
serif.1.length=1
serif.2.length=1
serif.3.length=1

# If (optional) below dirs have been modified after this file modification date then the file is recreated from fontconfig
cachedir.2=/home/t3r/.fontconfig
cachedir.1=/home/t3r/.cache/fontconfig
cachedir.0=/var/cache/fontconfig
```

Jak możesz zauważyć, na pierwszym miejscu mamy komentarz zaznaczający, aby nie edytować pliku.
Przyczyną tego jest fakt, że plik zostanie odtworzony na nowo w przypadku gdy nastąpi aktualizacja systemu
*fontconfig* wskazywanego przez pole `fcversion`, bądź data modyfikacji katalogów `cachedir` będzie późniejsza niż pliku konfiguracyjnego.

Mając na uwadze te aspekty, ciągle możemy edytować ten plik na własne potrzeby. Szczególnie gdy nie mamy
uprawnień do instalowania czcionek systemowych ani dodawania plików w katalogu instalacyjnym JRE.

Pola w pliku są samoopisujące się z wyjątkiem indeksów. W przypadku *family* oraz *file* pierwszy indeks to wskazanie na styl czcionki w wyżej wymienionej kolejności.
Drugi indeks definiuje natomiast kolejność wyszukiwania glifów po zbudowaniu czcionki logicznej.

## Podsumowanie

Znajomość mechanizmu ładowania czcionek może przydać się szczególnie w sytuacji, gdy potrzebujemy wdrożyć naszą aplikację na systemie,
gdzie nie mamy wymaganych uprawnień do instalacji czcionek. Zazwyczaj czcionek nie pakuje się razem z aplikacją, oddelegowując ładowanie
do systemu operacyjnego. Kwadraty i znaki zapytania w miejscach znaków językowych są właściwie najpopularniejszą oznaką brakujących czcionek. 

Na systemach Linux, w celu załadowania dodatkowych czcionek możemy podejść na kilka sposobów:

|Metoda|Wady/zalety|
|---|---|
| Standardowe ładowanie przy użyciu systemu operacyjnego. | Wymaga uprawnień do instalacji i konfiguracji systemowych czcionek. |
| Dołączenie czcionek do paczki z aplikacją i załadowanie ich w kodzie. | Ograniczenie do czcionek fizycznych. |
| Dodanie czcionek do `${java.home}/lib/fonts`. | Ograniczenie do czcionek fizycznych. |
| Wykorzystanie `-Dsun.java2d.fontpath=<prepend:\|append:>`. | J.w., bez wymaganych uprawnień do katalogu JRE. |
| Dorzucenie do `${java.home}/lib/fonts/fallback`. | Pozwala na podpięcie do wszystkich czcionek logicznych. |
| Skonfigurowanie `${java.home}/lib/fontconfig.*.properties`. | Umożliwia skonfigurowanie kolejności ładowania i grupowania pod warunkiem uprawnień do katalogu. |
| Edytowanie `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`. | J.w. bez wymaganych uprawnień, ale zagrożeniem odtworzenia oryginalnej konfiguracji w wyniku aktualizacji systemu. |

Część opcji uwzględnia ścieżkę `${java.home}` przy której warto zwrócić uwagę na to, czy zaaplikowaliśmy konfigurację we właściwym miejscu w przypadku
obecności wielu wersji JRE. Również od wersji Java 9, zgodnie z nowymi zaleceniami pliki konfiguracyjne zamiast w `${java.home}/lib/` powinniśmy umieszczać w `${java.home}/conf/fonts/`.