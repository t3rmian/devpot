---
title: Espresso — problemy z animacjami
url: espresso-problemy-z-animacjami
id: 19
category:
- testing: Testy
tags:
  - android
author: Damian Terlecki
date: 2019-12-22T20:00:00
---

> V/InstrumentationResultParser: androidx.test.espresso.PerformException: Error performing 'single click - At Coordinates: 383, 1177 and precision: 16, 16' on view 'Animations or transitions are enabled on the target device.

Praktycznie każdy programista zaczynający swoją przygodę z biblioteką Espresso — wspomagającą testowanie interfejsu użytkownika spotkał się chociaż raz z powyższym błędem. Pierwszym krokiem w takiej sytuacji jest właśnie odwiedzenie dokumentacji na temat [konfiguracji](https://developer.android.com/training/testing/espresso/setup#set-up-environment) środowiska. Najczęstszym powodem tego błędu są działające w tle animacje. Ich wyłączenie zazwyczaj rozwiązuje problem, ale są też inne przypadki, w których błąd ten może się ujawniać mimo zastosowania się do instrukcji. Przyjrzyjmy się więc różnym sposobom radzenia sobie z tym problemem. Animacje można wyłączyć ręcznie, poprzez opcje urządzenia / emulatora:

> Przejdź do Ustawienia > Opcje programisty i wyłącz następujące opcje:  
> Skala animacji okna
> Skala animacji przejścia
> Skala animacji trwania animatora 

Protip, jeśli nie widzisz „Opcji programisty”, możesz je włączyć, przechodząc do (w zależności od urządzenia) *Ustawienia > System > Informacje o telefonie*, a następnie odszukując „Numer kompilacji” i przyciskając go kilkukrotnie.

> Jesteś teraz X kroków od bycia programistą.

### adb & Gradle

Biorąc pod uwagę środowisko CI, dostęp do ustawień jest równie prosty. Animacje możemy wyłączyć przy pomocy wiersza poleceń i narzędzia *adb* (tylko w przypadku API 17+):

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

Jeśli biegle władasz Gradlem, możesz równie dobrze utworzyć specjalne do tego zadanie i powiązać je przed fazą testowania:

```gradle
task disableAnimations(type: Exec) {
    def adb = "$System.env.ANDROID_HOME/platform-tools/adb"
    commandLine "$adb", 'shell', 'settings', 'put', 'global', 'window_animation_scale', '0'
    commandLine "$adb", 'shell', 'settings', 'put', 'global', 'transition_animation_scale', '0'
    commandLine "$adb", 'shell', 'settings', 'put', 'global', 'animator_duration_scale', '0'
}

project.gradle.taskGraph.whenReady {
    connectedDebugAndroidTest.dependsOn disableAnimations
}
```

Istnieje także specjalny parametr, który można ustawić w `build.gradle` (parametr działa w przypadku uruchamiania z poziomu Gradle'a):

```gradle
android {
  testOptions {
    animationsDisabled = true
  }
}
```

[Ghostbuster91](https://github.com/ghostbuster91/espresso-animations-disabled-test) wykonał pewne testy (z powodu słabej dokumentacji) i wygląda na to, że działa on na większości API, ale niestety <u>nie jest to złote rozwiązanie</u>.

### Java

Jeśli chcesz wyłączyć animacje tylko dla wybranych testów, możesz to zrobić, implementując [własną regułę testową](https://proandroiddev.com/one-rule-to-disable-them-all-d387da440318) lub po prostu zaimportować ją z [tej biblioteki (API 21+)](https://github.com/blipinsk/disable-animations-rule) na licencji Apache 2.0. Istnieją również [inne rozwiązania (API 21+)](https://product.reverb.com/disabling-animations-in-espresso-for-android-testing-de17f7cf236f), które wymagają uprawnień `SET_ANIMATION_SCALE`. Ostatecznie mamy również do dyspozycji specjalną bibliotekę [TestButler (API 14+)](https://github.com/linkedin/test-butler), która specjalizuje się w tej tematyce. Niestety sama w sobie wymaga czystego emulatora (np. bez Google API).

Powyższe rozwiązania mogą być ciągle zawodne, np. możemy mieć problem w przypadku niestandardowych animacji:
```Java
View.startAnimation(AnimationUtils.loadAnimation(this, R.anim.blink));
```

W takim przypadku możemy ratować się stworzeniem niestandardowego wariantu testowego bez animacji, z podmienionymi zasobami lub warunkując wykonanie naszego kodu od zmiennych ustawianych w fazie kompilacji. Nie jest to jednak zbyt eleganckie i w takim momencie nasze testy zaczynają budzić wątpliwości.

### Ostatnia deska ratunku

> Caused by: androidx.test.espresso.AppNotIdleException: Looped for 1218 iterations over 60 SECONDS. The following Idle Conditions failed .

W zależności od sposobu implementacji animacji (`android.animation`/`android.view.animation`/zewnętrzne biblioteki animacji) wyeliminowanie komunikatu "Animacje lub przejścia są włączone na urządzeniu docelowym", niekoniecznie będzie skutkować rozwiązaniem powyższego problemu. Animacje mogą nadal [utrzymywać wątek UI w stanie pracy](https://stackoverflow.com/a/29662747) i w takim wypadku Espresso będzie czekać w nieskończoność, a właściwie przez określony czas, co zakończy się niepowodzeniem testu.

Tonący brzytwy się chwyta, jednak w tym przypadku rozwiązanie nie jest aż tak bolesne. Aby nasze testy przeszły z powodzeniem, wystarczy przełączyć się z biblioteki Espresso na bibliotekę [UIAutomator (API 18+)](https://alexilyenko.github.io/uiautomator-basics/) i ręcznie ustalić okres oczekiwania na załadowanie się widoku:

```Java
//onView(withId(R.id.action_search)).perform(click())
UiDevice device = UiDevice.getInstance(getInstrumentation());
device.wait(By.res("io.github.t3r1jj.pbmap:id/action_search"), TIMEOUT_MS).click();
```

UIAutomator jest bardziej liberalny pod względem blokowania się przez animacje, ale jednocześnie wymaga wyraźnej [synchronizacji](https://alexilyenko.github.io/uiautomator-waiting/) od programisty. W porównaniu do Espresso otrzymujemy większą kontrolę w zamian za większą odpowiedzialność przy tworzeniu poprawnych testów.