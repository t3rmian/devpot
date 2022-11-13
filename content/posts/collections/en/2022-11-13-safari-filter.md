---
title: Target color using CSS filter
url: target-color-css-filter
id: 99
category:
  - other: Other
tags:
  - css
  - safari
  - chrome
author: Damian Terlecki
date: 2022-11-13T20:00:00
---

A popular use case for the CSS filter is to change the icon tint without interfering with the image source.
Currently, two popular tools demonstrating the mechanism of obtaining any color using a filter are:
- [Hex Color To CSS Filter Converter](https://isotropic.co/tool/hex-color-to-css-filter/);
- [css-color-filter-generator](https://angel-rs.github.io/css-color-filter-generator/).

## Changing the tint with a filter

The algorithm in both cases is similar and can be categorized as a heuristic search.
For this purpose, various arguments of a CSS filter rewritten in JS (a potential source of differences) are tested.
After many iterations, a color most similar (RGB/HSV) to the declared one is chosen.
Said filter consists of the following functions:
- brightness;
- saturate;
- invert;
- sepia;
- hue-rotation;
- contrast.

An assumption is that we should be able to get a color close to the declared one when starting with the black-colored `brightness(0) saturate(100%)` image.
It seems to be true in the majority of cases. However, the final color may vary depending on the selected color profile and browser.

### Chrome 107.0.0.0 (Blink 537.36) Mac OS X Intel 10.15.7

Without [enforcing the sRGB color profile](brave://flags/#force-color-profile) in this version of the Chrome browser, the final color seems to be oversaturated.
It looks peculiar, like the non-filtered color (second icon in the image below) seems to be from the sRGB color space, and the filtered one is not. 

<figure class="flex">
  <img src="/img/hq/filter-color-saturated.png" alt="Saturation (sRGB profile)" title="Saturation (sRGB profile)">
  <img src="/img/hq/filter-color-oversaturated.png" alt="Saturation/oversaturation (default profile)" title="Saturation/oversaturation (default profile)">
  <figcaption><center>First row: subsequent saturation values (sRGB profile);<br/>second row: slight oversaturation (default profile) visible for the last two icons.</center></figcaption>
</figure>
<center>
  <iframe width="640" scrolling="no" height="110" src="/resources/filter-color.html" ></iframe>
  <figcaption>Above is a color test for your browser (iframe)</figcaption>
</center>
<br/>

### Safari 15.6 (WebKit 605.1.15) Mac OS X Intel 10.15.7
When combined with `transform: translate3d(0, 0, 0)`, sometimes used to force the hardware acceleration, the filter results in some unexpected colors on the Safari browser. 

<figure class="flex">
  <img src="/img/hq/filter-color-transformed.png" alt="Tinted icons without/with the transformation" title="Tinted icons without/with the transformation">
  <figcaption><center>First row: filter with different saturation levels without the transformation;<br/>second row: with the transformation visible differences starting from the third icon.</center></figcaption>
</figure>
<center>
<iframe width="640" scrolling="no" height="220" src="/resources/filter-color-3d.html" ></iframe>
  <figcaption>Above is a color test for your browser (iframe)</figcaption>
</center>

Interestingly, in the DOM tree, the transformation may apply to another element unrelated to the parent-child relationship.
For reproduction, it is sufficient that the filtered element is displayed over the transformed element.

When using the above mechanism, it is worth verifying whether we get the correct colors under different configurations.
Do this, especially for more complex filters.
You can see the specific filters applied above in the browser's DevTools.
