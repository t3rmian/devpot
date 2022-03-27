---
title: Espresso — animations troubleshoot
url: espresso-animations-troubleshoot
id: 19
category:
  - testing: Testing
tags:
  - android
author: Damian Terlecki
date: 2019-12-15T20:00:00
---

> V/InstrumentationResultParser: androidx.test.espresso.PerformException: Error performing 'single click - At Coordinates: 383, 1177 and precision: 16, 16' on view 'Animations or transitions are enabled on the target device.

It is an error which gave many Android application developers sleepless nights. Generally, this error occurs when using Espresso as a testing library. So, if you haven't read the [set-up](https://developer.android.com/training/testing/espresso/setup#set-up-environment) instructions and have started writing your tests, this is most likely the cause... but there are also other cases where this error might apply. Let's go over the possible solutions for resolving this problem. The animations can be disabled manually by accessing the device/emulator:

> Go to Settings > Developer options and disable the following 3 settings:  
> Window animation scale  
> Transition animation scale  
> Animator duration scale  

Pro-tip, if you don't see the "Developer options" setting, you can usually enable it by going to "Settings" then "About phone", finding out "Build number" and pressing it few times until you see the toast notification.

> You are now X steps way from being a developer.

### adb & Gradle

If you're on a CI server accessing the settings might still be doable but non-trivial. In such case the easiest option is to disable the animations via command line, using *adb* tool (only for API 17 and above): 

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
```

If you're fluent in Gradle you could create a similar task and bind it before testing:

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

However, there is also a special parameter that can be set in the Gradle build (when run with Gradle):

```gradle
android {
  testOptions {
    animationsDisabled = true
  }
}
```

[Ghostbuster91](https://github.com/ghostbuster91/espresso-animations-disabled-test) did some testing, and it seems to be working on most of the APIs, but clearly, <u>it is not a golden solution</u>.

### Java

If you want to disable the animations only for some selected tests, you could do so implementing a [custom TestRule](https://proandroiddev.com/one-rule-to-disable-them-all-d387da440318) or just importing it from [this library (API 21+)](https://github.com/blipinsk/disable-animations-rule) licensed under Apache 2.0. There are also [solutions (API 21+)](https://product.reverb.com/disabling-animations-in-espresso-for-android-testing-de17f7cf236f) that require `SET_ANIMATION_SCALE` permission. And to put a cherry on the top, there is a powerful [TestButler (API 14+)](https://github.com/linkedin/test-butler) which helps with this problem but requires a stock emulator (e.g. without Google APIs).

Things can still go wrong when if you start using custom animations:
```Java
View.startAnimation(AnimationUtils.loadAnimation(this, R.anim.blink));
```
In such a case you may try creating custom flavors without animations (which I dislike) either with swapped resources or conditionals depending on build variables. Though, at this point, things start to get questionable.

### When everything fails

> Caused by: androidx.test.espresso.AppNotIdleException: Looped for 1218 iterations over 60 SECONDS. The following Idle Conditions failed .

Depending on how the animations are implemented (`android.animation`/`android.view.animation`/external libraries) it's possible that you may eliminate the "Animations or transitions are enabled on the target device" message and the above error will still persist. The animations might still [keep the UI thread not idle](https://stackoverflow.com/a/29662747) and Espresso will wait indefinitely.

The last resort solution is not that painful and actually feasible. For the problematic tests just switch from Espresso to [UIAutomator (API 18+)](https://alexilyenko.github.io/uiautomator-basics/) with a custom timeout:

```Java
//onView(withId(R.id.action_search)).perform(click())
UiDevice device = UiDevice.getInstance(getInstrumentation());
device.wait(By.res("io.github.t3r1jj.pbmap:id/action_search"), TIMEOUT_MS).click();
```

UIAutomator is more liberal in terms of being blocked by animations but at the same time requires explicit [synchronization](https://alexilyenko.github.io/uiautomator-waiting/) from a developer. More responsibilities for more control is the tradeoff visible here.