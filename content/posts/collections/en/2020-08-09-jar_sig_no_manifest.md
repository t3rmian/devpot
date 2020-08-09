---
title: Fastlane JAR_SIG_NO_MANIFEST
url: jar_sig_no_manifest
id: 36
tags:
  - java
  - android
  - security
author: Damian Terlecki
date: 2020-08-09T20:00:00
---

**JAR_SIG_NO_MANIFEST** is an error that you may come across while preparing and publishing a new version of the application to the Google Play Store.
It is returned by the *apksigner* tool, which is used to sign the application (APK) as well as verify the signature of a signed package.

The <i>**apksigner**</i> works in a similar way to [*jarsigner*](https://docs.oracle.com/javase/8/docs/technotes/tools/windows/jarsigner.html). After signing the application, the following files appear in the *META-INF* directory of the package:
- *MANIFEST.MF* – with a list of package files and the hash for each of them (or actually the hash of the content);
- **.SF* – with a list of files and the hash of the manifest entry as well as the hash of the manifest itself;
- **.(DSA|RSA|EC)* – public key with CA list and the **.SF* file signature.

In the absence of these files (unsigned package, e.g. in the debug flavor), and in particular *MANIFEST.MF*, you will encounter the JAR_SIG_NO_MANIFEST error. The error log might look like this:
> Google Api Error: forbidden: APK signature is invalid or does not exist.<br/>
> Error from apksigner: ERROR: JAR_SIG_NO_MANIFEST: Missing META-INF/MANIFEST.MF

In other cases, you might have the *MANIFEST.MF* file generated but not signed and receive **JAR_SIG_NO_SIGNATURES**. There are also different errors for other issues regarding APK signing, but they are much less prevalent if you're not manually signing your app.

## Troubleshooting

Usually, the problem comes down to the fact that we're using an unsigned package. You should check if you have configured the release build under `buildTypes` in the *build.gradle* of the application module, with the information needed to sign your work linked by `signingConfigs`. The process is described in more detail in the [Android Studio User Guide](https://developer.android.com/studio/publish/app-signing).

Sometimes, however, we can use other tools for the building and publication process that automate the manual upload of a package and meta info into the store.
One of such tools is [*fastlane*](https://fastlane.tools/), which, after a proper configuration, allows you to update the application with one command. If we receive the error despite correctly configured signing – it is worth checking what is actually being sent to the server.

For example, in the case of *fastlane*, one of the reasons may be that although the release was built, the debug version was not removed during the build because it was used by another application (e.g. an emulator). Such a situation might cause an attempt to publish an application of the **debug flavor**. A similar case can happen if you have a multi-module project where you generate more than one application, where one is not meant for publishing.

Usually, it is enough to remove the application with the unwanted flavor (after closing the programs that blocked the file), or not to build it at all (if we take CI into account). The second solution, in the case of *fastlane*, is to manually configure the correct package for the publishing process.

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

In the above code, from the list of packages `SharedValues::GRADLE_ALL_AAB_OUTPUT_PATHS` we exclude the ones with the name *sample* in the path, and then we publish the first one.