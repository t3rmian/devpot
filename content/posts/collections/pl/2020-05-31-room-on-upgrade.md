---
title: Room onUpgrade callback
url: room-on-upgrade
id: 31
category:
- mobile: Mobile
tags:
  - kotlin
  - android
author: Damian Terlecki
date: 2020-05-31T20:00:00
source: https://gist.github.com/t3rmian/8ffe844882d4c009abd730cb98f75dac
---

Room to całkiem użyteczna biblioteka, która oferuje pewną abstrakcję dostępu do bazy danych SQLite w Androidzie.
Jednym z głównych elementów pozwalających na zainicjalizowanie takiego interfejsu jest konstruktory bazy danych [RoomDatabase.java](https://android.googlesource.com/platform/frameworks/support/+/androidx-master-dev/room/runtime/src/main/java/androidx/room/RoomDatabase.java). Udostępnia on kilka przydanych metod. W przypadku, gdy chcielibyśmy podpiąć pod zdarzenia związane z otwieraniem bazy danych, możemy skorzystać z metody `addCallback()`, która pozwala na nasłuchiwanie następujących zdarzeń:

```java
/* ... */
package androidx.room;
/* ... */
public abstract class RoomDatabase {
    /* ... */
    /**
     * Callback for {@link RoomDatabase}.
     */
    public abstract static class Callback {

        /**
         * Called when the database is created for the first time. This is called after all the
         * tables are created.
         *
         * @param db The database.
         */
        public void onCreate(@NonNull SupportSQLiteDatabase db) {
        }

        /**
         * Called when the database has been opened.
         *
         * @param db The database.
         */
        public void onOpen(@NonNull SupportSQLiteDatabase db) {
        }

        /**
         * Called after the database was destructively migrated
         *
         * @param db The database.
         */
        public void onDestructiveMigration(@NonNull SupportSQLiteDatabase db){
        }
    }
}
```

Niestety nie są to wszystkie zdarzenia mające miejsce podczas otwierania bazy danych. Jeśli potrzebujemy bardziej szczegółowej listy zdarzeń, będziemy musieli skorzystać z `SupportSQLiteOpenHelper.Callback` z paczki `androidx.sqlite.db`, która wyodrębnia następujące metody:
- ***onDowngrade*** – metoda wywoływana w ramach transakcji, gdy wersja bazy danych jest nowsza niż żądana (niż wersja zdefiniowana w adnotacji `@Database`);
- ***onCreate*** – inicjuje bazę danych;
- ***onOpen*** – otwiera bazę danych zaraz po utworzeniu/upgradzie/downgradzie;
- ***onConfigure*** – wywoływana run before onCreate/onUpdate/onDowngrade;
- ***onCorruption*** – wykonywana w przypadku uszkodzenia bazy danych SQLite, standardowa implementacja usuwa plik bazy danych;
- ***onUpgrade*** – metoda podobna do *onDowngrade*, specyficzna dla przypadku gdy wersja bazy danych jest niższa niż żądana.

Właściwa implementacja tej klasy wywołuje wcześniej wspomniany `RoomDatabase.Callback` poprzez delegację do klasy `RoomOpenHelper.Delegate` z pakietu `androidx.room`. Przechodząc do konkretnej implementacji `RoomDatabase`, można zauważyć, że zapewnia ona automatycznie wygenerowaną implementację `RoomOpenHelper.Delegate` udostępniającą z kolei poniższe metody:
- ***dropAllTables*** – wywoływana przez *SupportSQLiteOpenHelper.onUpgrade/onDowngrade*, z kolei odpala *onDestructiveMigration* na sam koniec;
- ***createAllTables*** – wywoływana przez *onCreate/onUpgrade/onDowngrade*;
- ***onOpen*** – wywoływana (standardowo) przez *onOpen*;
- ***onCreate*** – wywoływana przez *onCreate* po *createAllTables* oraz po *onValidateSchema*;
- ***validateMigration*** – wywoływana przez *onValidateSchema*;
- ***onValidateSchema*** – wywoływana przez *onCreate/onUpgrade*, a także w przypadku wykorzystania wstępnie wypełnionej danymi bazy danych;
- ***onPreMigrate*** – przed migracją w trakcie *onUpgrade*;
- ***onPostMigrate*** – przed migracją w trakcie *onUpgrade*;

Ponieważ natknęliśmy się na trzeci interfejs z prawie identycznymi metodami, spróbujmy zwizualizować hierarchię klas uczesniczących w dostępie do bazy danych. Ogólny obraz wygląda następująco:

<img src="/img/hq/room-upgrade-callback.svg" loading="lazy" alt="Android Room – ogólna hierarchia klas" title="Android Room – ogólna hierarchia klas">

Jeśli więc chcemy dobrać się do zdarzeń takich jak *onUpgrade*, `SupportSQLiteOpenHelper.Callback` będzie tu właściwym wyborem. Ponieważ jednak właściwa implementacja poszczególnych metod odpowiada za całą ważną logikę związaną z otwieraniem i uruchamianiem upgradem/downgradem oraz migracjami, będziemy musieli również skorzystać z delegacji.

## Przypadek użycia

Wyobraźmy sobie, że włączyliśmy czyszczenie bazy danych w przypadku niezgodności wersji schematu. Jeśli zaktualizujemy bazę danych, wszystkie nasze dane zostaną utracone. Chcielibyśmy jednak **zapisać** niektóre rekordy, **zanim baza danych zostanie zniszczona**. Może to być przydatne w kilku przypadkach. Na przykład, w fazie prototypowania, nasz schemat często się zmienia, być może dane mogą zostać ponownie pobrane i w pełni uzupełnione z jakiegoś API. W ten sposób nie będziemy musieli tracić czasu na przygotowanie migracji schematów i danych. Zapewnia to nam również sposób, aby w głównej bazie danych nie znajdowały się rekordy z pustymi kolumnami. Będzie to również przydatne, gdy z jakiegoś powodu nie będziemy mogli ustawić wartości domyślnych.

Zobaczmy, jak możemy użyć `SupportSQLiteOpenHelper.Callback` do zaimplementowania backupu do drugiej bazy (migracyjnej), tuż przed reinicjalizacją głównej bazy danych. Prosty interfejs takiej funkcjonalności może wyglądać następująco:

```kotlin
import androidx.sqlite.db.SupportSQLiteDatabase

interface Backup {
    fun backup(database: SupportSQLiteDatabase)
}
```

Najlepiej, gdy kopie zapasowe będą wykonywane przed upgradem/downgradem wersji i być może w przypadku uszkodzenia bazy danych. Dodatkowo musimy również zapewnić, aby domyślna implementacja w postaci delegata, również została wykonana:

```kotlin
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import timber.log.Timber

class BackupCallback(
    private val delegate: SupportSQLiteOpenHelper.Callback,
    private val backups: List<Backup>
) : SupportSQLiteOpenHelper.Callback(delegate.version) {

    override fun onDowngrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {
        backups.forEach { it.backup(db) }
        delegate.onDowngrade(db, oldVersion, newVersion)
    }

    override fun onCreate(db: SupportSQLiteDatabase) {
        delegate.onCreate(db)
    }

    override fun onOpen(db: SupportSQLiteDatabase) {
        delegate.onOpen(db)
    }

    override fun onConfigure(db: SupportSQLiteDatabase) {
        delegate.onConfigure(db)
    }

    override fun onCorruption(db: SupportSQLiteDatabase) {
        try {
            backups.forEach { it.backup(db) }
        } catch (e: Exception) {
            Timber.e(e, "Could not backup the corrupted database")
        }
        delegate.onCorruption(db)
    }

    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {
        backups.forEach { it.backup(db) }
        delegate.onUpgrade(db, oldVersion, newVersion)
    }
}
```

Teraz, aby wstrzyknąć nasz callback, użyjemy metody konstruktora RoomDatabase `openHelperFactory()`. Z Javadoc dowiadujemy się, że domyślną implementacją fabryki jest `FrameworkSQLiteOpenHelperFactory`. Ponieważ klasa ta jest finalna, tak naprawdę nie możemy po niej odziedziczyć. Nie powstrzymuje to nas jednak przed użyciem kompozycji. Czyżby znowu mechanizm delegacji? A jakże:

```kotlin
import androidx.sqlite.db.SupportSQLiteOpenHelper

class BackupOpenHelperFactory(
    private val delegate: SupportSQLiteOpenHelper.Factory,
    private val backups: List<Backup>
) :
    SupportSQLiteOpenHelper.Factory {

    override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper {
        val decoratedConfiguration =
            SupportSQLiteOpenHelper.Configuration.builder(configuration.context)
                .name(configuration.name)
                .callback(BackupCallback(configuration.callback, backups))
                .build()
        return delegate.create(decoratedConfiguration)
    }
}
```

W parametrze do metody tworzącej obiekt klasy `SupportSQLiteOpenHelper` otrzymujemy konfigurację zawierającą kontekst, nazwę i wywołanie zwrotne. Callback jest elementem, którego szukamy. Zamiast przekazać oryginalnej konfiguracji, odtwarzamy ją z wywołaniem zwrotnym udekorowanym naszą własną implementacją. Teraz, aby ustawić naszą fabrykę, wystarczy:

```kotlin
fun provideDatabase(): RoomDatabase {
    return Room
        .databaseBuilder(/* ... */)
        .fallbackToDestructiveMigration()
        .openHelperFactory(
            BackupOpenHelperFactory(
                FrameworkSQLiteOpenHelperFactory(),
                listOf(ProductMigrationBackup(migrationDatabase))
            )
        )
        .build()
}
```

*Voilà!* Teraz kopie zapasowe będą tworzyć się przy każdej reinicjalizacji bazy danych. Podczas ich wywołania możesz zapisać dane w mniej restrykcyjnej bazie danych do dalszego odtworzenia, a następnie ponownie wstawić je do głównej bazy danych w pełnym formacie. Szczegóły takiej implementacji można znaleźć w linku do źródeł na dole artykułu.