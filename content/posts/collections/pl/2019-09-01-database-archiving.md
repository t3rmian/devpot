---
title: Archiwizacja bazy danych
url: archiwizacja-bazy-danych
id: 11
tags:
  - oracle
  - bazy danych
author: Damian Terlecki
date: 2019-09-01T20:00:00
---

Złożone systemy wykazujące się dużą aktywnością mają tendencję do utraty wydajności w miarę upływu czasu. Dzieje się tak w przypadku większości starszych projektów, zwłaszcza tych długoterminowych z wysoką bazą użytkowników. Nie jest to oczywiście żadne wielkie odkrycie — dane użytkowników rosną, przestrzeń tabel się powiększa, liczba encji wzrasta z kilku milionów do kilku miliardów, a rozmiary indeksów rosną. Zapytania do bazy danych (jeśli są właściwie indeksowane) nie zajmują tak dużo czasu, ale nie jest to także czas ich świetności. Można nawet powiedzieć, że system zachowuje się normalnie, ale przychodzi pewien dzień, użytkownicy zalewają usługę z powodu jakiegoś fantastycznego wydarzenia i system... zaczyna się dławić.

Archiwizacja bazy danych nie jest procesem prostym. Nie jest robiona z dnia na dzień. Warto wziąć ją pod uwagę podczas analizy projektu, aby później uzyskać stabilną wydajność. Możemy również chcieć utrzymać koszt działania bazy danych na mniej więcej stabilnym poziomie. Biorąc pod uwagę użytkowników, najlepiej jest też zminimalizować zmiany lub wprowadzić je możliwie najwcześniej. Niemniej jednak, gdy znajdziesz się w momencie, gdzie wzrost wydajności potrzebny jest na wczoraj, konieczny będzie wybór przynajmniej jednej z opcji:
- optymalizacja kodu aplikacji;
- optymalizacja zapytań do bazy danych;
- optymalizacja struktury bazy danych (indeksy, partycje, tabele);
- archiwizacja danych;
- redefinicja przypadków użycia.

Pod względem archiwizacji, mamy do wyboru dwie możliwości:
- przeniesienie danych do innego miejsca / zewnętrznych magazynów danych;
- archiwizacja w bazie danych (ang. in-database archiving).
Należy pamiętać, że archiwizacja bazy danych musi być ściśle powiązana z optymalizacją struktur, w przeciwnym razie wzrost wydajności może być minimalny lub nawet żaden.

### Przeniesienie danych do innego miejsca

Najłatwiejszą opcją mającą na celu poprawę wydajności lub zmniejszenie rozmiaru bazy danych jest przeniesienie danych w inne miejsce. Zasadniczo można użyć tabeli archiwalnej, którą można później skompresować w celu zmniejszenia rozmiaru bazy danych. Najbardziej popularną opcją jest jednak przeniesienie danych do innego magazynu lub hurtowni danych w stanie zdenormalizowanym. Warto również rozważyć usunięcie niektórych danych, które zostały utworzone z powodu błędu (np. podczas rozwijania aplikacji bądź niepoprawnego jej wykorzystania).

Pamiętaj jednak, że jeśli masz już potworzone indeksy dla swojej tabeli, usunięcie rekordów efektywnie zwiększy jej fragmentację. Aby sprawdzić fragmentację, możesz odpytać `sys.dm_db_index_physical_stats`. W zależności od poziomu fragmentacji możesz ją zmniejszyć za pomocą jednej z dwóch metod:
- fragmentacja <5%-10%; 30%) — reorganizacja za pomocą `ALTER INDEX nazwa_indeksu REORGANIZE;` (zawsze w trybie online, polecenie niedostępne w Oracle'u);
- fragmentacja <30%; 100%) — przebudowanie za pomocą `ALTER INDEX REBUILD [ONLINE];`.
W przypadku przestrzennego indeksu partycjonowanego (ang. spatial partitioned index), konieczne jest użycie polecenia `ALTER INDEX nazwa_indeksu REBUILD PARTITION partition_name;`. W celu wyświetlenia indeksów tabel możemy wywołać `SELECT * FROM all_indexes`, a do sprawdzenia nazw partycji posłużyć może `SELECT * FROM ALL_TAB_PARTITIONS;`.

### Archiwizacja w bazie danych Oracle

Oracle jest jedną z bardziej popularnych baz danych. W 12c Oracle wprowadziło funkcję zwaną *archiwizacją w bazie danych* (in-database archiving). To całkiem interesująca funkcja. Zasadniczo, po zaaplikowaniu jej do wybranej tabeli, Oracle utworzy dodatkową kolumnę `ora_archive_state` zainicjowaną wartością 0. Wartość ta oznacza, że ​rekord nie jest zarchiwizowany. Ustawienie tej kolumny na dowolną inną wartość skutecznie oznaczy wiersz jako zarchiwizowany. Zarchiwizowany wiersz w zasadzie jest:
- standardowo niewidoczny `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ACTIVE;`
- widoczny jedynie po ustawieniu odpowiedniego atrybutu sesji `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ALL;`
- kolumna `ora_archive_state` jest automatycznie dodawana do zapytań z wartością powiązaną z ustawioną widocznością.

Włączanie i wyłączanie archiwizacji danej tabeli w bazie danych odbywa się za pomocą odpowiednio:
```sql
ALTER TABLE nazwa_tabeli ROW ARCHIVAL;
ALTER TABLE nazwa_tabeli NO ROW ARCHIVAL;
```
Miej na uwadze, że włączenie archiwizacji jest dość szybkie (dzięki meta-danym dotyczącym standardowej wartości), natomiast wyłączenie, które usuwa kolumnę stanu archiwizacji, może zająć nawet godzinę w przypadku tabel zawierających kilkaset milionów rekordów. Jest jeszcze jedna dosyć przerażającą rzecz. Archiwizacja w bazie danych Oracle nie uwzględnia ograniczeń klucza obcego. W rzeczywistości rekordy nie są usuwane, więc jest to logiczny rezultat. Jednak domyślnie zarchiwizowane dane nie będą widoczne w Twojej aplikacji i jeśli masz jakiekolwiek powiązania z rekordami, możesz być zaskoczony, gdy w aplikacji zaczną pojawiać się różnego rodzaju błędy. Najczęściej będzie to *NullPointerException*, gdyż zazwyczaj przyjmujemy za domyślne istnienie rekordu-rodzica w przypadku gdy mamy rekord-dziecko (JPA).

Jest to moment, wymagający nie tylko analizy bazy danych, ale również całej aplikacji. Konieczne będzie sprawdzenie, w jaki sposób połączone są tabele, jak te połączenia są wykorzystywane (bądź nie) w aplikacji, w jakich sytuacjach i być może zarchiwizować je razem. Jeśli jest to jakaś główna tabela, może okazać się, że jest ona połączona z każdą inną tabelą. Dlatego też proces ten może wydawać się łatwy, ale w rzeczywistości jest dość złożony. Na szczęście istnieje możliwość dostępu do tych zarchiwizowanych danych z atrybutem sesji. W ten sposób można zachować widoczność zarchiwizowanych danych w wybranych miejscach bądź procesach.

Należy jednak pamiętać, że przy korzystaniu z puli połączeń, po zamknięciu połączenia wraca ono do puli do ponownego wykorzystania ze zmienioną sesją, skutecznie eliminując sens archiwizacji. Tak więc bezpiecznym podejściem byłaby zmiana sesji przed jej zamknięciem (o ile połączenie JDBC nie jest współdzielone pomiędzy wątki, co powinno być ogólną praktyką) lub bezpieczniej — przygotowanie osobnego źródła danych z własną pulą połączeń w celu wykorzystania widoczności zarchiwizowanych rekordów.

### Poprawa wydajności po archiwizacji

Dane zostały zarchiwizowane, jednak wydajność się nie zwiększyła? Cóż, jeśli sprawdzisz plan wykonania zapytań dla zarchiwizowanych zapytań przed i po archiwizacji zobaczysz, że nie ma żadnej zbytniej różnicy w koszcie. Dane nie zostały naprawdę usunięte, a zarchiwizowane wiersze są nadal brane pod uwagę podczas pełnego skanowania. Kolumna stanu archiwizacji nie została również dodana do indeksów. W zależności od liczby indeksów i dodatkowych ograniczeń takie rozwiązanie może to być męczące.

Jest jeszcze inny sposób na poprawę wydajności, który szczególnie pasuje do archiwizacji w bazie danych — partycjonowanie tabel. Ta funkcja jest jednak mieczem obosiecznym:
> Maksymalnie co możemy osiągnąć przy partycjonowaniu to nie stracić na wydajności. Wszelkie usprawnienia są jedynie efektem ubocznym i tak powinniśmy je traktować [[pl.seequality.net]](https://pl.seequality.net/partycjonowanie-tabel-wydajnosc-zapytan-sqlserver/)

Zapytania uwzględniające wiele partycji są zwykle wolniejsze niż zapytania wykonywane w jednym obszarze tabel. Jeśli dokonamy partycjonowania po niewłaściwej kolumnie, a typowe przypadki użycia zignorują wybrany klucz, system nieuchronnie straci na wydajności. Przeciwnie do tego, wraz ze wzrostem ilości danych w tabeli, rozmiary indeksów również się zwiększają. Trudniej załadować je do pamięci RAM. W takim przypadku podział na partycje powinien zmniejszyć rozmiar indeksu, aby łatwiej zaalokować go w pamięci.

W przypadku archiwizacji w bazie danych `ora_archive_state` jest potencjalnym kandydatem na klucz partycji. W większości przypadków będziemy szukali aktywnych, niezarchiwizowanych danych. Optymalizator nie powinien przeszukiwać partycji, które nie posiadają szukanych informacji. Elementy systemu wymagające dostępu do zarchiwizowanych danych będą działać nieco wolniej. Poprzez poprawne zaznaczenie (UX) dostępu do starych danych w interfejsie (wydzielenie specjalnego przypadku użycia, zamiast usuwania danych), użytkownicy będą bardziej wyrozumiali mimo konieczności dłuższego oczekiwania. Partycje z zarchiwizowanymi rekordami mogą być dodatkowo skompresowane, jeśli nie zależy nam na wydajności, lecz kierujemy się zasadą "bajt zaoszczędzony to grosz zarobiony".

Aby utworzyć tabelę podzieloną na partycje względem stanu archiwizacji, możesz użyć następującego zapytania (możliwe jest także użycie podpartycji w przypadku gdy mamy już jakąś inną strategię partycjonowania):
```sql
CREATE TABLE nazwa_tabeli (
  --...
)
  ROW ARCHIVAL
  ENABLE ROW MOVEMENT
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  );
```

Jeśli mamy już tabelę, ale nie jest ona jeszcze podzielona na partycje, możemy [ją bez większego problemu podzielić na partycje](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/vldbg/evolve-nopartition-table.html#GUID-5FDB7D59-DD05-40E4-8AB4-AF82EA0D0FE5):
```sql
ALTER TABLE nazwa_tabeli MODIFY
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  ) [ONLINE];
```

Najbardziej złożonym przypadkiem jest sytuacja, gdy tabela jest już podzielona na partycje. Przy takim stanie rzeczy mamy dwie opcje:
1. [Partycjonowanie istniejącej tabeli za pomocą DBMS_REDEFINITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table)
2. [Partycjonowanie istniejącej tabeli za pomocą EXCHANGE PARTITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table-using-exchange-partition)
