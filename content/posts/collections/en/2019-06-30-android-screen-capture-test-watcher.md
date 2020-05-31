---
title: Android test watcher with screen capture
url: android-screen-capture-test-watcher
id: 7
tags:
  - android
  - testing
author: Damian Terlecki
date: 2019-06-30T20:00:00
source: https://github.com/t3rmian/travis-android-demo
---

Debugging failed tests on Android, especially those which are run on remote servers (hello CI) is often a matter of some guessing. In some situations, the application can become a resource hungry monster and you will keep wondering why is that view not visible (!!) when it actually is on your HAXM powered top-end local machine. I certainly encountered such a situation, not to mention welcome dialogs which sometimes clogged the tests and other shenanigans. A simple solution for analysis of these issues is to capture the screen in case of test failure.

Let's then jump straight into it.
First, add *INTERNET* permissions in manifest element in `AndroidManifest.xml`. We need this permission to be able to send a captured screenshot to some online hosting service.
You could, of course, implement a solution involving external storage instead and I will hint you later the code would differ.

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

We will use the *Retrofit2* library to implement a REST interface on the client side. If you're not familiar with this library, it significantly simplifies communication with REST services. Add AndroidX test libraries which including core, runner, rules, and integration with JUnit.

```Gradle
implementation 'com.squareup.retrofit2:retrofit:2.5.0'
androidTestImplementation 'androidx.test:runner:1.2.0'
androidTestImplementation 'androidx.test:core:1.2.0'
androidTestImplementation 'androidx.test.ext:junit:1.1.1'
androidTestImplementation 'androidx.test:rules:1.2.0'
```

Create a simple test. I've used one of the starters available when creating a new project in Android Studio and created a test for the generated `ItemListActivity`.
In this test, we will use AndroidX test rule. For functional testing, an `ActivityTestRule` is usually used. It provides a way to automatically launch and terminate the activity before and after the test is complete. What we additionally want to achieve is to take a screenshot in case when such test fails. Of course, we could implement this in each test but, an even better solution is to use a `TestWatcher` wchich implements a `TestRule` interface.

For now, combine those two rules (`ActivityTestRule` and our `TestWatcher` to-be-implemented screenshot capture rule) using `RuleChain`. By setting the first one as an outer rule and second one as "around" rule we will ensure, that the `ScreenshotOnTestFailedRule` (an implementation of `TestWatcher`) will be applied first and `ActivityTestRule` will be applied last.

Note that we will use `@JvmField` annotation together with `@Rule` so that the compiler won't complain about the rule not being public field (Kotlin). You could reach a similar result using `@get:Rule`. More info on [proandroiddev.com](https://proandroiddev.com/fix-kotlin-and-new-activitytestrule-the-rule-must-be-public-f0c5c583a865).

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

Let's now move to a more juicy part which is an implementation of `ScreenshotOnTestFailedRule`. `TestWatcher` superclass provides many useful methods which are invoked when appropriate situation occurs in our test. Among others, there are `succeeded` and `failed` methods. In our case, we are interested in the latter. `protected void failed(Throwable e, Description description)` is invoked when a test fails and we can extend it to add our logic to capture a screenshot. This way we will know how the view looked when the test failed. Probably you could also dump the UI hierarchy with UIAutomator at this point to get even more debugging info.

In the capture logic, we will use a `Screenshot` and `ScreenCaptureProcessor` interfaces from AndroidX test runner library. Mind that this API is currently in beta phase.
The name of the test and method can be easily extracted from the `Description`, as well as an exception object which is passed to the `failed()` method. You could also log an exception name which I imagine might come handy in many cases. Select the desired format of the image and pass the captured screenshot to the processor.

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

The `ScreenCaptureProcessor` interface has just one method `public String process(ScreenCapture capture) throws IOException` to implement. We will use this interface to upload the image to some external file hosting. You might as well try saving it on external storage and later retrieve it automatically with *adb*, however, I haven't had too much luck with getting write permissions (maybe because of [this bug](https://issuetracker.google.com/issues/64389280)) at the time.

Going back to our upload processor — the implementation is quite straightforward. Send the image data synchronously using a multipart body and log the response or error if such happens. Use tags like in the previous class to easily filter the logs. You can do so using *logcat* built-in Android Studio or running `adb logcat` later. In the response, there should be a link to the image, and from previous logs, you will be able to connect it to the correct test method (or you can add additional log info here).

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

We will use https://file.io which is an awesome solution for personal projects. The service offers an ephemeral hosting — after first download, the file gets deleted. There is a free plan, which is sufficient for small projects (100 uploads per day). Though, you can use any other service or host your own private. For creating the service implementation we will use *Retrofit2*:

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

Now if some test fails, you can check the error in logs (using Android Studio or terminal) and take a peek at the view.

> adb logcat -dv time *:V | grep "TestRunner\\|ScreenshotOnTestFailedRule\\|UploadScreenCaptureProcessor"

Look for "link" property with *UploadScreenCaptureProcessor* tag:

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

![Android — screen captured on failed test](/img/hq/android-screen-capture-demo.jpg "Captured screen")