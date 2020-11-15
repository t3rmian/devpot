---
title: Fastlane JAR_SIG_NO_MANIFEST
url: jar_sig_no_manifest
id: 36
tags:
  - java
  - android
  - bezpieczeństwo
author: Damian Terlecki
date: 2020-08-09T20:00:00
---

**JAR_SIG_NO_MANIFEST** to błąd, na który natknąć się możesz podczas przygotowywania i publikowania nowej wersji aplikacji do sklepu Google Play.
Jest on zwracany przez narzędzie *apksigner*, które wykorzystywane jest do podpisywania aplikacji (APK), jak również weryfikacji sygnatury podpisanej paczki.

Program <i>**apksigner**</i> działa na podobnej zasadzie co [*jarsigner*](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/jarsigner.html). Po podpisaniu aplikacji, w folderze *META-INF* paczki pojawiają się pliki:
- *MANIFEST.MF* – z listą plików aplikacji i hashem każdego z nich (a właściwie hash zawartości);
- *\*.SF* – z listą plików i hashem zapisu z pliku manifest, a także hashem samego manifestu;
- *\*.(DSA|RSA|EC)* – klucz publiczny z listą CA i sygnaturą pliku *\*.SF*.

W przypadku braku tych plików (niepodpisana paczka, np. w wersji debug), a w szczególności *MANIFEST.MF* spotkamy się z błędem JAR_SIG_NO_MANIFEST. Właściwy opis błędu może wyglądać następująco:
> Google Api Error: forbidden: APK signature is invalid or does not exist.
> Error from apksigner: ERROR: JAR_SIG_NO_MANIFEST: Missing META-INF/MANIFEST.MF

<img src="/img/hq/manifest-signature.png" alt="Plik sygnatury" title="Plik sygnatury">

Czasami plik *MANIFEST.MF* możesz być wygenerowany, ale nie podpisany. W takiej sytuacji możesz spodziewać się błędu **JAR_SIG_NO_SIGNATURES**. Istnieją również różne błędy dotyczące innych problemów związanych z podpisywaniem APK, ale są one znacznie mniej powszechne, jeśli nie podpisujesz aplikacji ręcznie.

## Rozwiązanie

Zazwyczaj problem sprowadza się do tego, że używamy niepodpisanej paczki. Warto więc sprawdzić, czy mamy skonfigurowany *release build* w `buildTypes` modułu aplikacji *build.gradle*, wraz z informacjami potrzebnymi do podpisania naszej pracy – `signingConfigs`. Proces ten jest opisany dogłębnie w [przewodniku użytkownika Android Studio](https://developer.android.com/studio/publish/app-signing).

Czasami jednak do procesu budowania i publikacji możemy korzystać z innych narzędzi, które automatyzują cały proces manualnego wrzucania paczki do sklepu.
Jednym z takich narzędzi jest <i>**fastlane**</i>, które po poprawnej konfiguracji pozwala zaktualizować naszą aplikację za pomocą jednego polecenia. Jeśli błąd otrzymujemy mimo poprawnie skonfigurowanego podpisywania – warto sprawdzić, co tak właściwie jest wysyłane na serwer.

Przykładowo, w przypadku *fastlane* jedną z przyczyn może być to, że mimo zbudowania release'a, wersja debug nie została usunięta podczas budowania ze względu na to, że była wykorzystywana przez inną aplikację (np. emulator). Taka sytuacja powoduje, że bez wskazania konkretnej paczki w konfiguracji *fastlane*, finalnie podjęta zostanie próba publikacji aplikacji o typie **debug**. Podobny przypadek może Ci się przydarzyć, jeśli masz wielomodułowy projekt, w którym generujesz więcej niż jedną aplikację, gdzie tylko jedna z nich powinna zostać opublikowana.

Zazwyczaj wystarczy usunąć aplikację z niechcianą wersją (po zamknięciu programów, które zablokowały plik), bądź w ogóle jej nie budować (jeśli bierzemy pod uwagę CI). Drugim sposobem, w przypadku *fastlane* jest np. ręczne skonfigurowanie właściwej paczki do procesu publikacji.

```bash
lane :deploy_internal do
  gradle(task: "bundleRelease")
  apk = lane_context[SharedValues::GRADLE_ALL_AAB_OUTPUT_PATHS].select do | path |
      !path.to_s.include?("sample")
  end
  supply(
    track: 'internal',
    aab: apk[0]
  )
end
```

W powyższym kodzie, z listy paczek `SharedValues::GRADLE_ALL_AAB_OUTPUT_PATHS` wyrzucamy tą, która ma w ścieżce nazwę *sample* i publikujemy pierwszą z nich.