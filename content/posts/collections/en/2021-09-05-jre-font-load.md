---
title: JRE font loading
url: jre-font-loading
id: 74
category:
- java: Java
tags:
  - jvm
  - native
  - fonts
author: Damian Terlecki
date: 2021-09-05T20:00:00
---

The main place in Java where fonts are used is undoubtedly Java 2D.
Primarily, these are the classes of the *java.awt.\** package,
referenced not only by Swing (a graphical interface building library)
but also many external components for building diagrams or generating images.

When it comes to the fonts, the part where most calls converge is the *drawString* method of the *Graphics2D* class.
This is where characters are converted to glyphs of the selected font and where drawing takes place.
The font itself can be registered using the *registerFont* method of the *GraphicsEnvironment* type object obtained by
calling `GraphicsEnvironment.getLocalGraphicsEnvironment()`. By default, however, most fonts come from the operating system.

## Fonts in the JRE


The system-specific implementation of the *sun.font.FontManager* interface is responsible for font loading. In the JSE the following are the default implementations:
- Windows – *sun.awt.Win32FontManager*;
- MacOS – *sun.font.CFontManager*;
- Linux – *sun.awt.X11FontManager*.

By specifying the name of a class implementing said interface through the `sun.font.fontmanager` system parameter, we can set up our own font loading mechanism.

The basic thing you should know is the separation of fonts into logical and physical ones.
In Java, we have 5 logical fonts and 4 different styles within each one, that map to physical fonts. These are (logical fonts):

- Serif;
- SansSerif;
- Monospaced;
- Dialog;
- DialogInput;

and styles:

- plain;
- bold;
- italic;
- bolditalic.

At the same time, not all physical fonts have to belong to any group.
When a logical font is chosen, the physical fonts will be searched for character glyphs in a specific order.
This way, all special characters can be supported without the user having to select a specific font.
Finally, 20 such font-style combinations are otherwise called composite fonts.

<img src="/img/hq/composite-font.png" alt="Serif Plain font in Java" title="Serif Plain font in Java">

## sun.awt.X11FontManager

Loading fonts is a rather complex process that heavily depends on the operating system.
To see how this mechanism looks like, let's limit the review to Java on a Linux system.

Initialization of the font manager occurs as soon as the text drawing is invoked. The most general list of steps for the fonts to load is as follows:
1. The `FontManagerFactory.getInstance()` is invoked and the appropriate implementation is initialized, i.e. sun.<wbr>awt.<wbr>X11FontManager;
2. The fonts under the JRE folder `${java.home}/lib/fonts` are registered;
3. An attempt is made to load the JRE `${java.home}/lib/fontconfig.*.properties` font configuration file:
  - the correct configuration is searched for based on Linux distribution name and version;
  - most often this step is skipped in favor of step 4 due to lack of a matching configuration file;
  - the [format](https://docs.oracle.com/javase/8/docs/technotes/guides/intl/fontconfig.html) is quite complex,
  allowing for a reference to the system fonts (xlfd), a definition to a custom font with file reference, as well as the
  specification of the search order including locale;
4. Loading configuration from the native system *fontconfig*:
  - this step is performed if the fonts in step 3 were not loaded successfully (verified by checking the plain serif font);
  - before loading the system configuration, the configuration file cached from the previous run is checked – `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`;
  - a simpler format that maps physical fonts to logical fonts along with their order;
5. Registration of the JRE reserve fonts `${java.home}/lib/fonts/fallback` under the logical fonts as last;
6. Registration of the system fonts and additional fonts indicated by `-Dsun.java2d.fontpath=<prepend:|append:>`.

To debug the loading mechanism, use the `-Dsun.java2d.debugfonts=true` flag to enable logging of information about what fonts were loaded,
from where along with any errors that happened during the config read. The `fc-list` command will list the system fonts (*fontconfig* system) and `cat /etc/lsb-release` will return
the name and version of the Linux distribution needed to eventually create configuration files.

<img src="/img/hq/jre-fonts.png" alt="The result of setting the -Dsun.java2d.debugfonts=true" title="The result of setting the -Dsun.java2d.debugfonts=true">

## JRE font configuration properties

Currently, this method is rarely used in favor of native loading from the *fontconfig* system.
Nevertheless, we are able to create our own file with selected fonts, that will be
loaded instead of the *fontconfig*. The simplest file for Ubuntu 20
(located, for example, in `/usr/lib/jvm/adopt-openjdk-16/lib/fontconfig.Ubuntu.properties`) might look like this:

```properties
version=1
serif.plain.latin-1=-b&h-lucidabright-demibold-r-normal--*-%d-*-*-p-*-iso8859-1
sequence.allfonts=latin-1
filename.-b&h-lucidabright-demibold-r-normal--*-%d-*-*-p-*-iso8859-1=$JRE_LIB_FONTS/LucidaBrightItalic.ttf
```

The recommended *xlfd* syntax adopted here allows the system to identify the correct font, especially when the file path is not provided.
Additionally, depending on the distribution, in the `${java.home}/lib` we can sometimes find advanced configurations for different systems.
With additional help from the documentation, creating such a configuration only requires permissions to write the configuration in the JRE directory.

## The fcinfo configuration properties

The second interesting configuration file related to the *fontconfig* system is the `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`.
This file is created for caching when the native configuration is initially processed. The simplest configuration might look like this:

```properties
#JDK Font Configuration Generated File: *Do Not Edit*
#Sat Sep 04 09:16:27 CEST 2021

# fc-list --version
fcversion=21301
# always 1
version=1

monospaced.0.0.family=DejaVu Sans Mono
monospaced.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf
monospaced.1.0.family=DejaVu Sans Mono
monospaced.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf
monospaced.2.0.family=DejaVu Sans Mono
monospaced.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Oblique.ttf
monospaced.3.0.family=DejaVu Sans Mono
monospaced.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-BoldOblique.ttf
sansserif.0.0.family=DejaVu Sans
sansserif.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
sansserif.1.0.family=DejaVu Sans
sansserif.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
sansserif.2.0.family=DejaVu Sans
sansserif.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf
sansserif.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf
sansserif.3.0.family=DejaVu Sans
serif.0.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf
serif.0.0.family=DejaVu Serif
serif.1.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf
serif.1.0.family=DejaVu Serif
serif.2.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf
serif.2.0.family=DejaVu Serif
serif.3.0.file=/usr/share/fonts/truetype/dejavu/DejaVuSerif-BoldItalic.ttf
serif.3.0.family=DejaVu Serif

# Must exist at leas one entry for each logical font and style
monospaced.0.length=1
monospaced.1.length=1
monospaced.2.length=1
monospaced.3.length=1
sansserif.0.length=1
sansserif.1.length=1
sansserif.2.length=1
sansserif.3.length=1
serif.0.length=1
serif.1.length=1
serif.2.length=1
serif.3.length=1

# If (optional) below dirs have been modified after this file modification date then the file is recreated from fontconfig
cachedir.2=/home/t3r/.fontconfig
cachedir.1=/home/t3r/.cache/fontconfig
cachedir.0=/var/cache/fontconfig
```

As you may notice, in the header, there is an auto-generated comment that indicates not to edit the file.
The reason for this is that the file is recreated if there is an update to the system
*fontconfig* indicated by the `fcversion` field mismatch.
Moreover, it will also be recreated if the modification date of the `cachedir` happens to be more recent than the configuration file.

With these aspects in mind, we can still edit this file for our own purposes. With these aspects in mind, we can still edit this file for our purposes.
It can be handy when you do not have the permissions to install system fonts or add files to the JRE installation directory.

The fields in the file are self-describing except for the indexes. In the case of *family* and *file*, the first index is a pointer to the font style in the order listed previously.
The second index, on the other hand, defines the order in which these fonts are searched for glyphs when the logical font is referenced.

## Summary

The knowledge of the font loading mechanism may come in handy, especially when you deploy your application on a system
without the permissions to install fonts. Usually, fonts are not packaged together with the application, and the loading is delegated
to the operating system. In general, if you encounter any problems with squares or question marks in place of language-specific characters, your best bet is a missing font.

Thus, on Linux systems, if we want to load additional fonts, we can approach it in several ways:

|Method|Pros/cons|
|---|---|
| Standardized loading using the operating system. | Requires permissions to install and configure system fonts. |
| Include fonts in the application package and load them in code. | Limited to physical fonts. |
| Adding fonts to `${java.home}/lib/fonts`. | Restricted to physical fonts. |
| Using `-Dsun.java2d.fontpath=<prepend:\|append:>`. | Same as above but without the necessity of permissions to the JRE directory. |
| Adding fonts to `${java.home}/lib/fonts/fallback`. | Allows you to plug into all logical fonts as a last resort. |
| Configuring `${java.home}/lib/fontconfig.*.properties`. | Enables the configuration of the order of loading and logical grouping. |
| Editing `${user.home}/.java/fonts/${java.version}/fcinfo-1-${hostname}-${osname}-${osversion}-${user.language}.properties`. | Same as above, without the permissions requirement, but at the risk of having the original configuration recreated as a result of a system update. |

Some of the options include the `${java.home}` path, so it's worth keeping a check whether you applied the changes in the right place in case of
multiple JREs. Also, since Java 9, according to new recommendations, configuration files should be placed in `${java.home}/conf/fonts/` instead of `${java.home}/lib/`.
