---
title: Angular compilation overhead of i18n
url: angular-i18n-compilation-overhead
id: 94
category:
  - javascript: JS
tags:
  - angular
  - nodejs
  - performance
author: Damian Terlecki
date: 2022-09-04T20:00:00
---

When building an Angular application begins to affect the comfort of your work, it's worth taking a look at which parts
of the compilation take the most time. Until recently, profiling was built into the `angular-cli`. You could enable it using environment variables.
- `NG_BUILD_PROFILING=1`:
  - Prior to version 12, it allowed you to measure the time spent by each Webpack (a tool used to build an application) plugin through the `speed-measure-webpack-plugin`;
  - Before version 14 it would also spit out an `events.json` file to be loaded in the Chrome Performance tab using the built-in` ProfilePlugin` plugin;
- `NG_CLI_PROFILING=profile_name`:
  - Up till version 12, it provided a `profile_name.cpuprofile` file, generated with the `v8-profiler-node8` package, for display in the browser DevTools.

The built-in profiling has been removed starting from version 14, and Angular developers now recommend using the Node.js `--cpu-prof` flag. We can do this by providing this parameter directly to
the `node` runtime. Specify the launch of the `ng` script with the build target: `node --cpu-prof node_modules/.bin/ng build`.

This invocation will generate files in the `CPU.${yyyymmdd}.${hhmmss}.${pid}.${tid}.${seq}.cpuprofile` naming format.
These can be loaded in the browser's DevTools (JavaScript Profiler).

<img src="/img/hq/node-cpuprof-angular-i18n-build.png" alt="NodeJS CPU profile for the internationalization of Angular application" title="NodeJS CPU profile for the internationalization of Angular applications">

Drawing correct conclusions may not be very intuitive at first. However, when you compare the results obtained in the previous iterations, you will surely find some clues
about potential reasons for increased build times. Take look at the highest total/self times of respective functions, their names, and source locations.
With some manual lookup, you can map them to the actual process of a given build step.

## I18n by Angular DevKit

Using the standard build-time i18n, you can expect several profiling results that differ in the sequence name of the file.
The particular files are, among others, the result of the [workers pool](https://github.com/angular/angular-cli/blob/14.2.x/packages/angular_devkit/build_angular/src/utils/action-executor.ts)
used for inlining translations (e.g. from XLF files) into the resulting JS files.

If you don't need a specific locale at the moment, you
can [disable the localization](https://github.com/angular/angular-cli/blob/14.2.x/packages/angular_devkit/build_angular/src/utils/i18n-options.ts#L175)
and save tens of seconds on building the application (*project/angular.json*):

```json
{
  "targets": {
    "build": {
      "configurations": {
        "development": {
          "localize": false
        }
      }
    }
  }
}
```

Thanks to this option, I was able to achieve an average of 30% shorter build times for a smaller (25 pages, Angular 14) application.
The text source, in this case, comes from the standard placeholder defined in the HTML template:

```html
<h2 i18n="@@register.register">
  Registration
</h2>
```