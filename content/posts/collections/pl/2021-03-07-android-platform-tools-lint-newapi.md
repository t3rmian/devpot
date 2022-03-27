---
title: Jak Android Lint weryfikuje dostępność metod API SDK?
url: android-lint-newapi
id: 61
category:
- mobile: Mobile
tags:
  - android
author: Damian Terlecki
date: 2021-03-07T20:00:00
---

Tworząc aplikację na platformę Android, podstawową czynnością, jaką musimy wykonać, jest wybranie wspieranej wersji API Androida. Odpowiadają za to
trzy parametry ustawiane w pliku `build.gradle`:
- `compileSdkVersion` jest to wersja SDK (API), przy wykorzystaniu której będziemy kompilować aplikację;
- `targetSdkVersion` to maksymalna wersja API, na której nasza aplikacja została przetestowana i powinna działać – niższa bądź równa
wersji `compileSdkVersion`;
- `minSdkVersion` minimalna wersja API, która zawiera wszystkie wymagane metody potrzebne do prawidłowej pracy aplikacji.

W celu zbadania, czy daną metodę możemy wykorzystać w wybranym zakresie API (od `minSdkVersion` do `compileSdkVersion`), Android Studio
wykonuje statyczną analizę naszego kodu. Służy do tego narzędzie Lint (`$ANDROID_HOME/tools/bin/lint[.bat]`) i jego reguła **NewApi** zdefiniowana w
klasie `com.android.tools.lint.checks.ApiDetector`. Równocześnie, możemy je wywołać za pomocą nakładki do Gradle i specjalnego zadania: `./gradlew :app:lint`.

<img src="/img/hq/android-lint-newapi.png" alt="Android Lint – NewApi check" title="Reguła NewApi">

# Android Lint NewApi

To dzięki niej wiemy na przykład, że metoda z API Androida, z której korzystamy,
nie jest dostępna we wszystkich wersjach API, poczynając od `minSdkVersion`. W ten sposób dostajemy informacje o tym, że daną funkcjonalność
musimy zaimplementować w inny sposób dla starszych urządzeń. Narzędzie rozumie takie wydzielenie części kodu, dla poszczególnych
wersji API dzięki przyrównaniu do wersji uruchomieniowej API `Build.VERSION.SDK_INT`.

```kotlin
private fun getDisplayHeight() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
    activity?.windowManager?.currentWindowMetrics?.bounds?.height() ?: 0
} else {
    val dm = DisplayMetrics()
    activity?.windowManager?.defaultDisplay?.getMetrics(dm)
    dm.heightPixels
}
```

Metody wykorzystywane przez twoją aplikację są porównywane z bazą metod i klas oraz wersji, w których zostały wprowadzone.
Dla wersji API SDK mniejszej niż 26 (Oreo), baza ta zaczytywana jest z pakietu Platform-Tools `$ANDROID_HOME/platform-tools/api/api-versions.xml`.
W przypadku nowszych wersji SDK (i również nowszej wersji biblioteki *lint-checks*), baza ta jest już inicjalizowana z takiego samego pliku,
ale w pakiecie samej platformy `$ANDROID_HOME/platforms/adroid-*/data/api-versions.xml`.

Gdy z jakiegoś powodu reguła ta nie chce nam działać, a specjalnie jej nie wyłączaliśmy, warto po pierwsze wyczyścić cache w Android Studio, gdyż
po zainicjalizowaniu z pliku XML, tworzony jest on (cache) w formacie binarnym. Ostatecznie możemy również zainstalować dostępne aktualizacje i
ewentualnie przeinstalować SDK.

Sam odkryłem taki problem u siebie dopiero w fazie testów wewnętrznych na podstawie raportu w konsoli Google: 
```java
    --------- beginning of crash
03-06 11:03:53.207 3588-3588/dev.termian.nutrieval E/AndroidRuntime: FATAL EXCEPTION: main
    Process: dev.termian.nutrieval, PID: 3588
    java.lang.NoSuchMethodError: No virtual method getDisplay()Landroid/view/Display; in class Landroid/content/Context; or its super classes (declaration of 'android.content.Context' appears in /system/framework/framework.jar)
        at dev.termian.nutrieval.ui.home.HomeFragment.c2()
        at dev.termian.nutrieval.ui.home.HomeFragment.V1()
        at dev.termian.nutrieval.ui.home.HomeFragment$i$d.run()
        at android.os.Handler.handleCallback(Handler.java:739)
        at android.os.Handler.dispatchMessage(Handler.java:95)
        at android.os.Looper.loop(Looper.java:135)
        at android.app.ActivityThread.main(ActivityThread.java:5221)
        at java.lang.reflect.Method.invoke(Native Method)
        at java.lang.reflect.Method.invoke(Method.java:372)
        at com.android.internal.os.ZygoteInit$MethodAndArgsCaller.run(ZygoteInit.java:899)
        at com.android.internal.os.ZygoteInit.main(ZygoteInit.java:694)
```