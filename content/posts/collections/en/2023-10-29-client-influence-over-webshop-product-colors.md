---
title: Client-forced colors and web shop products
url: client-forced-colors-web-shop-products
id: 119
category:
  - javascript: JS
tags:
  - stylesheets
  - browsers
  - firefox
  - chrome
  - opera
  - safari
author: Damian Terlecki
date: 2023-11-05T20:00:00
---

Recently, I was going through a web shop on my mobile, looking for a replacement of my autumn jacket.
I found a really nice design in a camel color and just before finishing my order I switched to my PC for some reason.
Much to my surprise, the color displayed on the PC bowser changed to a red one! It took me several minutes until I
found out that some time ago I enabled a (forced) night mode in my mobile browser, and so I needed to go over the catalog once again.

<figure class="flex">
<img src="/img/hq/filtered-dark-mode.png" alt="Night mode (Brave Browser iOS)" title="Night mode (Brave Browser iOS)">
<img src="/img/hq/standard-dark-mode.png" alt="Standard colors" title="Standard colors">
<center>
  <figcaption><small>Screenshots of RGB model image rendered in browsers with/without night mode enabled<br/>on <a href="https://en.wikipedia.org/wiki/RGB_color_model">https://en.wikipedia.org/wiki/RGB_color_model</a>, image created by user Immanuelle, licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/#">CC BY-SA 4.0</a>.</small></figcaption>
</center>
</figure>

## Standard, forced, and user-defined dark modes

Turns out there are different implementations of the dark mode and there is a W3C draft named (CSS Color Adjustment Module Level 1)[https://www.w3.org/TR/css-color-adjust-1/]
that tries to standardize some of these (and is supported by many browsers).
1. It describes preferred colors schemes and CSS media query `@media (prefers-color-scheme: dark)`.
2. Explains the possibility for the browser to override the color scheme and how to work with/around it.
3. Finally, it describes the integration with the browser/user style sheets, which you can usually adjust through plugins.

You might then ask which browsers currently (2023) support the theming based on the forced color shift:

| Browser        | Name of the feature                                                                                            | Implementation principle             |
|----------------|----------------------------------------------------------------------------------------------------------------|--------------------------------------|
| Chromium-based | \<browser\>://flags/</br>Auto Dark Mode for Web Contents                                                       | Browser-based                        |
| Firefox        | Dark Mode (WebExtension);</br>about:config</br>– toolkit<wbr>.legacyUserProfileCustomizations<wbr>.stylesheets | Stylesheet-based                     |
| *              | Night Eye (extension)                                                                                          | Stylesheet-based                     |
| Safari mobile  | Nitefall (extension)                                                                                           | Stylesheet-based                     |
| Opera GX       | Force dark pages                                                                                               | Browser-based                        |
| Opera GX       | Web modding                                                                                                    | Stylesheet-based                     |
| Brave  mobile  | Night mode (not to be confused with dark mode)                                                                 | Browser-based</br>+ stylesheet-based |


Getting a different color than the perceived one during the order is for sure the customer's problem, and somewhat self-resolvable if there are
online return policies like in the EU. But can it be prevented at an early stage reducing unnecessary costs?

## To detect or overwrite forced dark mode?

Sometimes, some elements are too critical for business to allow the browser to change their colors.
You can try to override this behavior or notify the user about the color difference.

<img src="/img/hq/problem-ciemnego-motywu.svg" alt="A diagram showing possible solutions to the problem of a dark theme overwriting critical page element colors. Ways to disable this behavior and detect it and notify the user." title="Potential solutions to the problem of a dark theme overriding the colors of critical page elements">

Based on above diagram, you will come to the conclusion that the best approach
is to disable forced colors and notify the user when they have some custom 
stylesheets. It's hard to detect whether specific elements (e.g., only images) changed the colors at the browser level.
At the same time overriding the user's stylesheets is unreliable
– even the highest specificity selector can be overridden through the plugin JS.
Other times it may be even undesirable if the user uses it for color deficiency.