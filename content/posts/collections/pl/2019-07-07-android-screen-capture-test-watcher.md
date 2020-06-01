---
title: Android test watcher i zrzut ekranu
url: android-test-watcher-zrzut-ekranu
id: 7
tags:
  - android
  - testy
author: Damian Terlecki
date: 2019-07-07T20:00:00
source: https://github.com/t3rmian/travis-android-demo
---

Debugowanie nieudanych testów na Androidzie, szczególnie tych, które uruchamiane są na zdalnym serwerze (CI), to często kwestia zgadywania
Nie jest to jakiś wyjątek, że aplikacja momentami może stać się głodnym zasobów potworem. W takiej sytuacji trudno nie zastanowić się, dlaczego ten nieszczęsny element nie jest widoczny (!!), skoro testy na twojej super szybkiej maszynie lokalnej z włączonym HAXM działają bez zarzutu. Przynajmniej mnie spotkała już taka sytuacja, nie wspominając już o oknach powitalnych, które czasem zatykały testy oraz inne cuda wianki. Prostym rozwiązaniem przy analizie takich problemów jest stworzenie zrzutu ekranu w przypadku niepowodzenia testu.

Przejdźmy więc do konkretów.
Na początku dodamy uprawnienie dla aplikacji na korzystanie z internetu wewnątrz elementu manifest w pliku `AndroidManifest.xml`. Będziemy tego potrzebowali w celu wysłania zrzutu ekranu na jakikolwiek serwer. Można oczywiście zaimplementować rozwiązanie w oparciu o zewnętrzną pamięć masową, dlatego też w dalszej części zasygnalizuję miejsce, w którym nasz kod nieco by się różnił.

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Skorzystamy z biblioteki *Retrofit2* w celu implementacji interfejsu po stronie klienta. Pozwala ona na znaczne uproszczenie komunikacji z serwisami REST-owymi. Nie zapomnij również dodać paczek — AndroidX — na bazie których zbudujemy nasze testy (core, runner, rules oraz integracja z JUnitem).

```Gradle
implementation 'com.squareup.retrofit2:retrofit:2.5.0'
androidTestImplementation 'androidx.test:runner:1.2.0'
androidTestImplementation 'androidx.test:core:1.2.0'
androidTestImplementation 'androidx.test.ext:junit:1.1.1'
androidTestImplementation 'androidx.test:rules:1.2.0'
```

Stwórzmy prosty test. Do tego celu wygenerowałem jeden z początkowych projektów w Android Studio i stworzyłem test dla klasy `ItemListActivity`. W teście tym użyjemy reguł z biblioteki AndroidX. Do testów funkcjonalnych aktywności najlepiej pasuje już zaimplementowana reguła `ActivityTestRule`. Ułatwia ona tworzenie (startowanie) aktywności oraz jej kończenie. To, co chcemy dodatkowo osiągnąć to utworzenie zrzutu ekranu w przypadku gdy taki test się nie powiedzie. Oczywiście moglibyśmy zaimplementować takie rozwiązanie w każdym pojedynczym teście, jednak znacznie lepszą solucją będzie rozszerzenie abstrakcyjnej klasy `TestWatcher`, która implementuje już interfejs `TestRule` i przy okazji dostarcza nam ciekawych funkcjonalności.

Na razie połącz obie reguły (`ActivityTestRule` oraz nasze nowe rozszerzenie klasy `TestWatcher`, w którym zaimplementujemy tworzenie zrzutu ekranu) za pomocą `RuleChain`. Ustawienie tej pierwszej jako reguła zewnętrzna, a drugiej jako reguła "wokół", poskutkuje tym, że `ScreenshotOnTestFailedRule` (implementacja TestWatchera) zostanie zaaplikowana (uruchomiona) jako pierwsza, a `ActivityTestRule` jako ostatnia.

Zauważ użycie adnotacji `@JvmField` wraz z `@Rule`. Dzięki temu kompilator nie będzie narzekał na to, że pole z regułą nie jest publiczne (język Kotlin).
Rownie dobrze można tutaj użyć adnotacji `@get:Rule`. Więcej informacji na ten temat znajdziesz na [proandroiddev.com](https://proandroiddev.com/fix-kotlin-and-new-activitytestrule-the-rule-must-be-public-f0c5c583a865).

```Kotlin
@RunWith(AndroidJUnit4::class)
class ItemListActivityTest {

    @Rule
    @JvmField
    val testRule: RuleChain = RuleChain
        .outerRule(ActivityTestRule(ItemListActivity::class.java, true, true))
        .around(ScreenshotOnTestFailedRule())

    @Test
    fun testOnCreate() {
      /**/
    }
}
```

Przejdźmy teraz do bardziej interesującej części — implementacji `ScreenshotOnTestFailedRule`. Klasa bazowa `TestWatcher` dostarcza wielu użytecznych metod, które podpięte są do odpowiedniego zdarzenia w teście. Mamy tu między innymi metody `succeeded` oraz `failed`. W tym przypadku najbardziej zainteresuje nas ta druga.
Metoda `protected void failed(Throwable e, Description description)` wywoływana jest w przypadku, gdy test się nie powiedzie. Zazwyczaj w takim przypadku wyrzucany jest wyjątek. Tutaj właśnie dodamy naszą logikę przechwytującą ekran. W ten sposób dowiemy się, jak wyglądał widok w momencie, gdy dana asercja nie została spełniona. Swoją drogą może to być również dobry moment na stworzenie zrzutu hierarchii widoku (UIAutomator), gdybyśmy potrzebowali jeszcze więcej informacji.

Przy implementacji tworzenia zrzutu ekranu wykorzystamy interfejsy `Screenshot` oraz `ScreenCaptureProcessor` pochodzące biblioteki AndroidX (paczka `runner`). Należy jednak mieć na uwadze, że API to jest obecnie w fazie beta. Nazwę testu w łatwy sposób można otrzymać z obiektu `Description`. Dodatkowe informacje dostępne są w obiekcie wyjątku — mogą się przydać przy tworzeniu bardziej złożonego logowania do powiązania ze zrzutem. Ostatecznie należy wybrać format zrzutu i przekazać go do procesora. Ten zajmie się docelowym zapisem obrazu.

```Java
public class ScreenshotOnTestFailedRule extends TestWatcher {
    private static final String TAG = ScreenshotOnTestFailedRule.class.getSimpleName();

    @Override
    protected void failed(Throwable e, Description description) {
        super.failed(e, description);
        takeScreenshot(description);
    }

    private void takeScreenshot(Description description) {
        Log.i(TAG, "Taking a screenshot of failed test");

        String testName = description.getTestClass().getSimpleName() + "-" + description.getMethodName();
        Bitmap.CompressFormat format = Bitmap.CompressFormat.JPEG;
        String filename = testName + "." + format;
        ScreenCapture capture = Screenshot.capture();
        capture.setName(filename);
        capture.setFormat(format);

        HashSet<ScreenCaptureProcessor> processors = new HashSet<>();
        UploadScreenCaptureProcessor captureProcessor = new UploadScreenCaptureProcessor();
        processors.add(captureProcessor);

        Log.i(TAG, String.format("Processing the screenshot (%s)", testName));
        try {
            capture.process(processors);
        } catch (IOException e) {
            Log.e(TAG, String.format("Failed to process the screenshot (%s)", testName), e);
        }
    }
}
```

Interfejs `ScreenCaptureProcessor` posiada tylko jedną metodę `public String process(ScreenCapture capture) throws IOException`. To w niej zaimplementujemy wysłanie obrazu na serwer. W tym właśnie miejscu można równie dobrze zapisać zrzut w zewnętrznej pamięci masowej, który następnie można wydobyć np. za pomocą *adb*. Sam jednak nie miałem zbyt wiele szczęścia z uzyskaniem uprawnień do zapisu (być może z powodu [tego błędu](https://issuetracker.google.com/issues/64389280)).

Wracając do naszego procesora — implementacja wysyłania pliku jest dosyć prosta. Polega na synchronicznym wysłaniu obrazu jako *multipart body* oraz zalogowaniu odpowiedzi zwrotnej (pozytywnej bądź błędu). Polecam użycie tagów jak poprzednio w celu łatwego przefiltrowania logów. Można to zrobić przy użyciu wbudowanego w Android Studio *logcata* bądź wywołać `adb logcat` w połączeniu z *grepem*. W odpowiedzi powinniśmy otrzymać link do zrzutu (jeśli skorzystamy z tego samego serwisu), a poprzedzające logi pozwolą na powiązanie obrazu z wyrzuconym wyjątkiem.

```Java
public class UploadScreenCaptureProcessor implements ScreenCaptureProcessor {
    private static final String TAG = UploadScreenCaptureProcessor.class.getSimpleName();

    @Override
    public String process(ScreenCapture capture) throws IOException {
        byte[] imageData = getImageData(capture);
        Call<ResponseBody> call = uploadImageData(capture, imageData);
        Response<ResponseBody> response = call.execute();
        ResponseBody body = response.isSuccessful() ? response.body() : response.errorBody();
        String result = getResult(response, body);
        Log.println(response.isSuccessful() ? Log.INFO : Log.ERROR, TAG, result);
        return result;
    }

    private String getResult(Response<ResponseBody> response, ResponseBody body) throws IOException {
        return body == null ? response.message() : body.string();
    }

    private Call<ResponseBody> uploadImageData(ScreenCapture capture, byte[] data) {
        UploadService service = ServiceGenerator.createService(UploadService.class);
        RequestBody requestFile = RequestBody.create(MediaType.parse("image"), data);
        MultipartBody.Part body = MultipartBody.Part.createFormData("file", capture.getName(), requestFile);
        return service.upload(body);
    }

    private byte[] getImageData(ScreenCapture capture) throws IOException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        capture.getBitmap().compress(capture.getFormat(), 100, outputStream);
        outputStream.close();
        return outputStream.toByteArray();
    }
}
```

```Java
interface UploadService {
    @Multipart
    @POST("/")
    Call<ResponseBody> upload(@Part MultipartBody.Part file);
}
```

W naszym przypadku skorzystamy z serwisu https://file.io, który świetnie sprawdza się w przypadku prywatnych projektów. Oferuje on efemeryczny hosting — po pierwszym pobraniu plik zostaje usunięty. Co ważne, serwis ten oferuje darmowy plan, który jest wystarczający dla małych projektów (limit 100 wrzutek dziennie). Chociaż, możesz skorzystać z każdej innej usługi lub postawić własny serwer. Do implementacji usługi po stronie klienta posłużymy się biblioteką *Retrofit2*:


```Java
class ServiceGenerator {

    private static final String BASE_URL = "https://file.io";

    private static Retrofit.Builder builder = new Retrofit.Builder().baseUrl(BASE_URL);

    private static OkHttpClient.Builder httpClient =
            new OkHttpClient.Builder();

    private static Retrofit retrofit = builder.client(httpClient.build()).build();

    @SuppressWarnings("SameParameterValue")
    static <S> S createService(Class<S> serviceClass) {
        return retrofit.create(serviceClass);
    }
}
```

Teraz, jeśli jakiś test się nie powiedzie, będziesz miał możliwość łatwego sprawdzenia błędu w logach (Android Studio lub poprzez terminal) i porównania go ze zrzutem ekranu.

> adb logcat -dv time *:V | grep "TestRunner\\|ScreenshotOnTestFailedRule\\|UploadScreenCaptureProcessor"

Szukaj pola o nazwie "link" z tagiem *UploadScreenCaptureProcessor*:

```plaintext
06-23 17:58:28.969 I/TestRunner( 7860): run started: 1 tests
06-23 17:58:28.997 I/TestRunner( 7860): started: testOnCreate(t3rmian.github.io.travis_android_demo.ItemListActivityTest)
06-23 17:58:39.186 I/ScreenshotOnTestFailedRule( 7860): Taking a screenshot of failed test
06-23 17:58:39.379 I/ScreenshotOnTestFailedRule( 7860): Processing the screenshot (ItemListActivityTest-testOnCreate)
06-23 17:58:41.695 I/UploadScreenCaptureProcessor( 7860): {"success":true,"key":"X4kHFK","link":"https://file.io/X4kHFK","expiry":"14 days"}
06-23 17:58:41.698 E/TestRunner( 7860): failed: testOnCreate(t3rmian.github.io.travis_android_demo.ItemListActivityTest)
06-23 17:58:41.698 E/TestRunner( 7860): ----- begin exception -----
06-23 17:58:41.707 E/TestRunner( 7860): java.lang.IllegalStateException: Assert 'Item 2' exists
06-23 17:58:41.707 E/TestRunner( 7860):         at t3rmian.github.io.travis_android_demo.ItemListActivityTest.testOnCreate(ItemListActivityTest.kt:52)
06-23 17:58:41.707 E/TestRunner( 7860):         at java.lang.reflect.Method.invoke(Native Method)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.model.FrameworkMethod$1.runReflectiveCall(FrameworkMethod.java:50)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.internal.runners.model.ReflectiveCallable.run(ReflectiveCallable.java:12)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.model.FrameworkMethod.invokeExplosively(FrameworkMethod.java:47)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.internal.runners.statements.InvokeMethod.evaluate(InvokeMethod.java:17)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.rules.TestWatcher$1.evaluate(TestWatcher.java:55)
06-23 17:58:41.707 E/TestRunner( 7860):         at androidx.test.rule.ActivityTestRule$ActivityStatement.evaluate(ActivityTestRule.java:531)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.rules.RunRules.evaluate(RunRules.java:20)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.runLeaf(ParentRunner.java:325)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:78)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.BlockJUnit4ClassRunner.runChild(BlockJUnit4ClassRunner.java:57)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
06-23 17:58:41.707 E/TestRunner( 7860):         at androidx.test.ext.junit.runners.AndroidJUnit4.run(AndroidJUnit4.java:104)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.Suite.runChild(Suite.java:128)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.Suite.runChild(Suite.java:27)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$3.run(ParentRunner.java:290)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$1.schedule(ParentRunner.java:71)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.runChildren(ParentRunner.java:288)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.access$000(ParentRunner.java:58)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner$2.evaluate(ParentRunner.java:268)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runners.ParentRunner.run(ParentRunner.java:363)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runner.JUnitCore.run(JUnitCore.java:137)
06-23 17:58:41.707 E/TestRunner( 7860):         at org.junit.runner.JUnitCore.run(JUnitCore.java:115)
06-23 17:58:41.707 E/TestRunner( 7860):         at androidx.test.internal.runner.TestExecutor.execute(TestExecutor.java:56)
06-23 17:58:41.707 E/TestRunner( 7860):         at androidx.test.runner.AndroidJUnitRunner.onStart(AndroidJUnitRunner.java:392)
06-23 17:58:41.707 E/TestRunner( 7860):         at android.app.Instrumentation$InstrumentationThread.run(Instrumentation.java:2189)
06-23 17:58:41.707 E/TestRunner( 7860): ----- end exception -----
06-23 17:58:41.725 I/TestRunner( 7860): finished: testOnCreate(t3rmian.github.io.travis_android_demo.ItemListActivityTest)
06-23 17:58:42.433 I/TestRunner( 7860): run finished: 1 tests, 1 failed, 0 ignored
```

![Android — zrzut ekranu spowodowany nieudanym testem](/img/hq/android-screen-capture-demo.jpg "Zrzut ekranu")