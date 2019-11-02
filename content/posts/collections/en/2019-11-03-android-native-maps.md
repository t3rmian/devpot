---
title: On the working of native maps on mobiles
url: mobile-native-maps
id: 16
tags:
  - mobile
  - android
  - geo-mapping
author: Damian Terlecki
date: 2019-11-03T20:00:00
source: https://github.com/t3rmian/PBMap
---

Creating your own maps in Android might come as hard at first, but after learning how they work, it can become a starting point of a pretty fun project. If you've yet to discover how such maps are implemented, and what problems might arise during the development — fear not. Today I will try to briefly explain some aspects of map engine, resource preparation, mapping and routing. This will be based on my own experience of creating apps connected with mapping, with the most recently updated one — PBMap (interactive map of the Bialystok University of Technology for mobile devices).

# Map engine

One of the limiting factors of mobile devices is resources. The problem which arises in our case is the map image itself. Ideally, we would like to have a very high-quality map. This is usually connected with a high-resolution image, which in addition increases with the area size. Let's take a 4000px x 4000px map as an example. It is a reasonable size for displaying a detailed map of a university campus. The size of the loaded image which represents this map in *ARGB8888* format will take over **60MB** of memory! It will take some time to load, but the worst part is that the interaction with it will be terrible. Your application will start skipping frames. Freezing on zoom will be inevitable, and dragging will become a hell. Of course, if you don't run out of memory at some point.

So what to do here? As you would expect, there are a lot of different resolutions like progressive loading or subsampling, but let's pick a correct tool for our problem and see how map engines handle this.

<figure>
<a href="https://play.google.com/store/apps/details?id=io.github.t3r1jj.pbmap"><img src="/img/hq/PBMap-loading.png" alt="PBMap — tiles loading" title="PBMap — tiles loading"></a>
</figure>

## Tiles

Instead of loading one big image, the map is divided into tiles. This greatly increases user experience as each tile is much smaller in size and does not have to be loaded until needed. The engine will load only a few tiles off the screen trying to keep smooth scrolling. If you swipe very quickly, you will certainly see how the loading can't keep up with the user action. This is an accepted give-and-take to achieve a good user experience. But this resolves only half of the problem. If we zoom out we will basically go back to our initial problem...

How map engines cope with this problem is that for each zoom threshold, different assets are loaded. With a maximum zoom, we want a pretty detailed map, but when zooming out, the details become less important. It's ideal to load images with a much worse resolution, as the details won't be visible anyway. What this means is that if you want to have a heavily zoomable map, it's recommended to prepare map images with various resolutions that correspond to the zoom level and chop them into tiles. The engine can also take care of caching and reusing bitmaps to improve resource usage.

<figure>
  <figcaption><center><b>GPL-3.0 MapView by 'peterLaurence'</b></center></figcaption>
  <a href="https://github.com/peterLaurence/MapView"><img src="/img/hq/MapView.png" alt="Deep-zoom map" title="Deep-zoom map"></a>
</figure>

## Layers

Managing tiles is only a part of the map engine. What's a good map without a collection of POIs (Point Of Interest)? You would usually require a map to display useful places like stations, shops, hospitals, police, etc. To achieve this, various overlay layers are used. From a simple text placement, through markers and images ending on interactible shapes - this concedes a basic list of features offered by a decent map engine.

A problem with overlays you might encounter is that you have to manage them by yourself. Usually, the engine will only take care of the tiles. If you create a few hundred or thousand of markers, your app might start freezing or go out of memory. Keeping them as simplest as possible may increase the performance. A preferred solution is a viewport marker management, but hooking to scroll events is sometimes expensive. A last resort requiring a change in architecture is to pre-render the map on a server.

## Mapping

Assuming you want to add some POIs to a prepared map, you will need to define its coordinate system and the map bounds. For a map of a real space, the geographic coordinate system is a no wonder with latitude (north-south position) and longitude (east-west position) measurements. A decent engine will help you seamlessly translate real-world coordinates into a position on your map (image) and the other way around. Though, if you're not using such coordinates and not integrating GPS, you might as well skip this topic.

If you had to do it by yourself, you would not only need to translate the coordinates into pixel positions but also keep in mind the scale (zoom level). Though, it hasn't all been said yet. The translation part is the trickiest one. This is a very pretty broad topic. There are multiple datums (models of Earth), map projections and there is always some [distortion](https://en.wikipedia.org/wiki/Theorema_Egregium) when representing a sphere's surface on a plane.

From a layman point of view, an important mention would be that most web mapping applications use the web Mercator projection. This projection is pretty close to WGS84 utilized by the GPS system ([check the differences](https://lyzidiamond.com/posts/4326-vs-3857)). The engine may not provide the implementation to translate coordinates to the desired projection, but it usually gives some interface for your own calculations. If you have a small scale map, a default linear will usually yield a negligible error on the positioning.

## Routing

In my opinion, this is one of the most satisfactory topics in mapping. You take the algorithm you learned in uni - Dijkstra (weighted graph) or BFS (unweighted), implement it and it works. Top it with graphical route overlay and it starts looking gorgeous. Integration with a GPS can be a bit quirky in some cases but brings a lot of value. Also, don't forget to display the distance to the target!

If you consider an indoor map, you might need some custom logic for displaying routes spanning over multiple floors. This is the place where you might need the third dimension — altitude. The simplest implementation is to hide the edges with heigh different than the one defined in the map. For outdoor ones, a color gradient might be meaningful.

<figure>
<a href="https://play.google.com/store/apps/details?id=io.github.t3r1jj.pbmap"><img src="/img/hq/PBMap-routing.png" alt="PBMap — routing" title="PBMap — routing"></a>
</figure>

## Resource preparation

Summing up — three things you would need for a decent custom map application are the tiles, data about POIs and routes. I enumerated them based on size, from biggest to the lowest. From my experience, the tiles are at least 10 times bigger in size than the rest two. Considering indoor mapping, if you want to support a few (10-20) buildings, you would end up with tiles of 5-10MB size. A fully offline mobile map application seems to be reasonable up to this point. However, if multiple clients are considered, it might be better to consider a separate build-packs or a backend server.

As for keeping the data, in my own applications, I usually prefer to keep it in the XML files. I've yet to implement a live way of modifying POIs so this structure is very feasible for me to prepare mapped data. Ideally, I would keep this information in the database for better performance, though, the apps load smoothly on modern devices, and they work decently on low resource emulators in Travis.

A sample map data structure might look like this:
```xml
&lt;map height=&quot;3072&quot; id=&quot;PB_campus&quot; route_path=&quot;routes/pb_campus.xml&quot; url=&quot;http://pb.edu.pl/&quot;
    width=&quot;5120&quot;&gt;
    &lt;tiles_configs&gt;
        &lt;tiles_config height=&quot;256&quot; path=&quot;tiles/pb_campus/1000/tile-%d_%d.png&quot; width=&quot;256&quot;
            zoom=&quot;1&quot; /&gt;
        &lt;tiles_config height=&quot;256&quot; path=&quot;tiles/pb_campus/500/tile-%d_%d.png&quot; width=&quot;256&quot;
            zoom=&quot;0.5&quot; /&gt;
        &lt;tiles_config height=&quot;256&quot; path=&quot;tiles/pb_campus/250/tile-%d_%d.png&quot; width=&quot;256&quot;
            zoom=&quot;0.25&quot; /&gt;
    &lt;/tiles_configs&gt;
    &lt;coordinates&gt;
        &lt;coordinate alt=&quot;150&quot; lat=&quot;53.120405&quot; lng=&quot;23.142700&quot; /&gt;
        &lt;coordinate alt=&quot;150&quot; lat=&quot;53.115460&quot; lng=&quot;23.156433&quot; /&gt;
    &lt;/coordinates&gt;
    &lt;space id=&quot;PB_WI&quot; reference_map_path=&quot;data/pb_wi.xml&quot; url=&quot;https://wi.pb.edu.pl&quot;&gt;
        &lt;coordinates&gt;
            &lt;coordinate alt=&quot;150&quot; lat=&quot;53.11696&quot; lng=&quot;23.14564&quot; /&gt;
            &lt;coordinate alt=&quot;150&quot; lat=&quot;53.11726&quot; lng=&quot;23.14709&quot; /&gt;
            &lt;coordinate alt=&quot;150&quot; lat=&quot;53.11641&quot; lng=&quot;23.14759&quot; /&gt;
            &lt;coordinate alt=&quot;150&quot; lat=&quot;53.11611&quot; lng=&quot;23.14614&quot; /&gt;
        &lt;/coordinates&gt;
    &lt;/space&gt;

    &lt;spot id=&quot;bkm_529&quot;&gt;
        &lt;coordinates&gt;
            &lt;coordinate alt=&quot;150&quot; lat=&quot;53.1162607&quot; lng=&quot;23.1451221&quot; /&gt;
        &lt;/coordinates&gt;
    &lt;/spot&gt;
    &lt;!--...--&gt;
&lt;/map&gt;
```

In my case, each map is also bound to a route consisting of bidirectional edges:
```xml
&lt;route id=&quot;pb_campus&quot;&gt;
    &lt;edges&gt;
        &lt;!--CAMPUS BEGIN--&gt;
        &lt;edge&gt;
            &lt;start alt=&quot;150&quot; lat=&quot;53.11653&quot; lng=&quot;23.14490&quot; /&gt;
            &lt;end alt=&quot;150&quot; lat=&quot;53.11669&quot; lng=&quot;23.14553&quot; /&gt;
        &lt;/edge&gt;
        &lt;edge&gt;
            &lt;start alt=&quot;150&quot; lat=&quot;53.11669&quot; lng=&quot;23.14553&quot; /&gt;
            &lt;end alt=&quot;150&quot; lat=&quot;53.11697&quot; lng=&quot;23.14536&quot; /&gt;
        &lt;/edge&gt;
        &lt;edge&gt;
            &lt;start alt=&quot;150&quot; lat=&quot;53.11697&quot; lng=&quot;23.14536&quot; /&gt;
            &lt;end alt=&quot;150&quot; lat=&quot;53.11701&quot; lng=&quot;23.14551&quot; /&gt;
        &lt;/edge&gt;
        &lt;!--...--&gt;
    &lt;/edges&gt;
&lt;/route&gt;
```

As for tiles, I've reused some open-source snapshots and made my own basic indoor maps. The tiles can be generated by any program for generating tiles :) As far as I remember I used [ImageMagick](https://imagemagick.org/index.php) recommended by the author of [TileView](https://github.com/moagrius/TileView/wiki/Creating-Tiles) library which is at the core of PBMap:

```bash
convert image.png -crop 256x256 -set filename:tile "%%[fx:page.x/256]_%%[fx:page.y/256]" +repage +adjoin "tiles/tile-%%[filename:tile].png"
```
<img src="/img/hq/PBMap-tiles.png" alt="PBMap - tiles" title="PBMap - tiles">

# Summary

Creating your custom map with a mobile, native look and feel is a really fun process. Not only you can learn about how map engines work and take a peek at different map projection models, but also learn different aspects of your mobile system chosen for development. After implementing the basic map, it's a good time to find out how to save the map state together with your application state. Some other fun parts to consider are searching the POIs and implementing full navigation. There is also a broad topic of indoor localization which slowly, but steadily is [gaining popularity](https://www.reuters.com/brandfeatures/venture-capital/article?id=45257).
