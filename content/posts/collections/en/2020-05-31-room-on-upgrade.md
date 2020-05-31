---
title: How to listen for database upgrade with Room
url: room-on-upgrade
id: 31
tags:
  - kotlin
  - java
  - android
  - database
author: Damian Terlecki
date: 2020-05-31T20:00:00
source: https://gist.github.com/t3rmian/8ffe844882d4c009abd730cb98f75dac
---

Room is a quite nice library that offers a robust abstraction over the SQLite database in Android.
The database builder from [RoomDatabase.java](https://android.googlesource.com/platform/frameworks/support/+/androidx-master-dev/room/runtime/src/main/java/androidx/room/RoomDatabase.java) is one of the main components that initialize the interface to access the database. It provides a way, through the `addCallback()` method, to listen to several useful events:

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

Unfortunately, these are not all events that happen during the database opening. If we want to have a more fine-grained option we need to use
`SupportSQLiteOpenHelper.Callback` from the `androidx.sqlite.db` package which exposes the following events:
- ***onDowngrade*** – executed in a transaction when the database version is newer than the requested one;
- ***onCreate*** – database creation and initial table population;
- ***onOpen*** – executed after creation/upgrade/downgrade is finished;
- ***onConfigure*** – run before onCreate/onUpdate/onDowngrade;
- ***onCorruption*** – invoked on SQLite DB corruption, default implementation deletes the DB file;
- ***onUpgrade*** – similar to *onDowngrade*, when the DB version is lower than the requested one.

The specific implementation of this class executes aforementioned `RoomDatabase.Callback` through the meaning of `RoomOpenHelper.Delegate` from the `androidx.room` package. If you go to the specific implementation of your `RoomDatabase`, you will see that it provides an auto-generated implementation of `RoomOpenHelper.Delegate` exposing the methods below:
- ***dropAllTables*** – invoked by *SupportSQLiteOpenHelper.onUpgrade/onDowngrade*, in turn invokes *onDestructiveMigration* at the end;
- ***createAllTables*** – invoked by *onCreate/onUpgrade/onDowngrade*;
- ***onOpen*** – invoked by *onOpen*;
- ***onCreate*** – invoked by *onCreate* after *createAllTables* and *onValidateSchema* are run;
- ***validateMigration*** – invoked by *onValidateSchema*;
- ***onValidateSchema*** – invoked by *onCreate/onUpgrade* and in case when we are using pre-populated database;
- ***onPreMigrate*** – before migration is run *onUpgrade*;
- ***onPostMigrate*** – after migration is run *onUpgrade*;

Because we've encountered the 3rd interface with almost similar methods, let's help ourselves visualizing the hierarchy. The general overview looks like this:

<img src="/img/hq/room-on-upgrade.svg" loading="lazy" alt="Android Room - general class hierarchy" title="Android Room - general class hierarchy">

For fine-grained listening, we can listen to the events exposed through `SupportSQLiteOpenHelper.Callback`. However, since the effective implementation of this callback is doing all the important work of the opening and running the upgrades/downgrades and migrations, we also want to use the delegate mechanism.

## Use Case

Imagine, we have enabled a fallback to a destructive migration on the database schema version mismatch. If we upgrade the database, all our data will be lost. Though, we might want to **save** some records to a migration database, **before the database is destroyed**. This can be useful in several cases. For example when we are prototyping and our schema changes often, maybe the data could be re-fetched and re-populated from the API. This way we won't have to waste time preparing schema migrations. This also provides us a way to have the main database free of nullable variables when we need such a requirement and can't provide a default values.

Let's see how we can use `SupportSQLiteOpenHelper.Callback` to implement a backup to a secondary database on a destructive migration. A simple interface for such a feature could look like this:

```kotlin
import androidx.sqlite.db.SupportSQLiteDatabase

interface Backup {
    fun backup(database: SupportSQLiteDatabase)
}
```

The backups would be executed before upgrade/downgrade and maybe on database corruption. As mentioned, we also need to provide the default implementation of the callback in the form of a delegate:

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

Now to inject this callback we will use the `openHelperFactory()` RoomDatabase builder method. From the Javadoc, we know that the default implementation of the factory is `FrameworkSQLiteOpenHelperFactory`. Since this class is final, we can't really extend it. Though, nothing stops us from using composition (duh? another delegate?):

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

In the parameter for `SupportSQLiteOpenHelper` creation, we receive the configuration that contains the context, name and callback. The callback is what's we're after. Instead of passing this configuration, we recreate it with a callback decorated with our own implementation. Now we just need to set it:

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

*Voilà!* Now our backups will run on every destructive migration (database upgrade/downgrade). During that time, you can save the data to a more lenient database for further processing and later re-insertion to the main DB. Check the gist source at the top of the article for some more details.