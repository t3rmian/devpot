---
title: Achieving smooth scrolling with RecyclerView in Android
url: android-recyclerview-smooth-scroll
id: 48
tags:
  - android
  - kotlin
author: Damian Terlecki
date: 2021-01-24T20:00:00
---

RecyclerView is an Android type of view designed to display many similar items. By using a pool of ViewHolders of different types that
hold references to individual views on the list, the component is able to display hundreds and thousands of items without performance problems.

Despite these features, our implementation, especially its first iteration, may not be optimal and cause various undesirable effects such as
slight freezes during the view scrolling.

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/bottomappbar-onhide-listener.gif" alt="Screenshot from the application using the RecyclerView" title="RecyclerView">
</a>
</figure>

If performance issues are encountered, the first step we can take is the time analysis. What interests us is how much time the UI thread spends in two 
main methods of our own implementation of the `androidx.recyclerview.widget.RecyclerView.Adapter`. Namely, in the *onCreateViewHolder()* and *onBindViewHolder()*.

```kotlin
abstract class MyAdapter : RecyclerView.Adapter<MyAdapter.ViewHolder>() {
    /***/
    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): ViewHolder {
        val start = System.currentTimeMillis()
        val view = LayoutInflater.from(parent.context).inflate(layoutId, parent, false)
        Timber.wtf("onCreateViewHolder took %d ms", System.currentTimeMillis() - start)
        return ViewHolder(view)
    }
}
```

While the first one is used to build a view, most often from a layout in the form of an XML file, the second one is used to fill the view with dynamic values.
The more time the UI thread spends in one of these methods, the worse the scrolling smoothness will be. We can assume that
anything greater than 16ms will be an indicator of problems with maintaining 60 FPS.

## Flattening the layout hierarchy

The first thing worth considering is the hierarchy of views in our layout. A deep hierarchy of views will often prevent
the measurements from finishing calculations in a single iteration. This problem is described in more detail in
[the official documentation](https://developer.android.com/topic/performance/rendering/optimizing-view-hierarchies)
for developers of Android applications. The concept is quite simple and you will also find some useful tools there to cope with the problem.

## Loading the images
The second fairly common cause of UI freezes is the image loading and display. Without the use of proper libraries that facilitate this process (Glide/Picasso),
you should at least consider the downsampling. You should display the image in a quality that matches the size of the view (usually lower quality). 
This will allow you to reduce the resource use of the mobile device.

The method is described in [the documentation](https://developer.android.com/topic/performance/graphics/load-bitmap)
and it can be applied both to images loaded from application resources and byte arrays. For example, displaying an image with resolution
1024 × 1024 px in a 72 × 72 px view can result in a reduction of the memory usage from 4 MB to 0.02 MB, as well as CPU time.

```kotlin
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.ImageView

class BitmapLoader {
    companion object {
        fun decodeSampledBitmapFromByteArray(
            data: ByteArray,
            reqWidth: Int,
            reqHeight: Int
        ): Bitmap {
            return BitmapFactory.Options().run {
                inJustDecodeBounds = true
                BitmapFactory.decodeByteArray(data, 0, data.size, this)
                inSampleSize = calculateInSampleSize(this, reqWidth, reqHeight)
                inJustDecodeBounds = false
                BitmapFactory.decodeByteArray(data, 0, data.size, this)
            }
        }


        fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
            val (height: Int, width: Int) = options.run { outHeight to outWidth }
            var inSampleSize = 1
            if (height > reqHeight || width > reqWidth) {
                val halfHeight: Int = height / 2
                val halfWidth: Int = width / 2
                while (halfHeight / inSampleSize >= reqHeight && halfWidth / inSampleSize >= reqWidth) {
                    inSampleSize *= 2
                }
            }
            return inSampleSize
        }

    }
}

@JvmSynthetic
fun ImageView.loadByteArray(
    data: ByteArray,
    width: Int,
    height: Int = width
) {
    val bitmap = BitmapLoader.decodeSampledBitmapFromByteArray(data, width, height)
    setImageBitmap(bitmap)
}

/***/

abstract class MyAdapter : RecyclerView.Adapter<MyAdapter.ViewHolder>() {
   /***/    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val product = products[position]
        holder.view.also { view ->
            product.image?.let {
                val size = view.resources.getDimensionPixelSize(R.dimen.product_thumbnail_size)
                view.image_view.loadByteArray(it, size)
            }
        }
    }
}
```

What's more, using a dedicated library greatly simplifies the implementation. Downsampling is usually built-in. Additionally,
we get a cache implementation, and the icing on the cake is the often built-in animation interface.

## ViewStub

When our layout provides a view expand feature (e.g. to display details), a particularly adequate solution is the
[ViewStub](https://developer.android.com/reference/android/view/ViewStub) choice.
This type of view is characterized by the fact that initially, it does not take up any space in the UI, quite similar to the attribute View.GONE.

In the case of the *View.GONE* attribute, when the view is inflated, child views are as well (if it is a ViewGroup with children).
ViewStub, on the other hand, allows this process to be delayed until we need to display (*View.VISIBLE*) the view.

<img src="/img/hq/android-viewstub.gif" alt="Screenshot of an expandable view" title="Layout expanded through the ViewStub inflation">

This is ideal if we display the views in a collapsed state by default. Using ViewStub will save us valuable milliseconds during the *onCreateViewHolder()* method.
In exchange, we trade this for a slightly longer view expansion time.
Inflation of the target layout specified by `android: inflatedId` occurs when we call the *inflate()* method 
or when we set the visibility to *View.VISIBLE* or *View.INVISIBLE*.

## AsyncLayoutInflater

In other cases, when our *ViewHolder* is quite complex and always displayed in full form, using AsyncLayoutInflater might be a lifeline.
The idea is to initially create some simple view (a placeholder) that requires a minimal amount of time to inflate, potentially reuse it,
and in the background delegate the construction of the complex layout to an asynchronous process.
Finally, upon completion of the build, by calling a method with the logic we normally put in *onBindViewHolder()*,
we replace the contents of the original view.

While it sounds salutary, in practice it is not so straightforward. The process has several [conditions](https://developer.android.com/reference/androidx/asynclayoutinflater/view/AsyncLayoutInflater):
   > For a layout to be inflated asynchronously it needs to have a parent whose generateLayoutParams(AttributeSet) is thread-safe and all the Views being constructed as part of inflation must not create any Handlers or otherwise call myLooper(). If the layout that is trying to be inflated cannot be constructed asynchronously for whatever reason, AsyncLayoutInflater will automatically fall back to inflating on the UI thread.

Personally, when using asynchronous inflation, I had experienced problems with the correct application of attribute styles.
In particular, instead of image buttons empty spaces were displayed to me in place of icons.

<img src="/img/hq/android-asynclayoutinflater.jpg" alt="Screenshot of a view inflated by a AsyncLayoutInflater" title="AsyncLayoutInflater – the result with undrawn buttons">

A sample implementation:

```kotlin
abstract class MyAdapter : RecyclerView.Adapter<MyAdapter.ViewHolder>() {

    class ViewHolder(val view: View) : RecyclerView.ViewHolder(view) {
        var onInflateViewHolder: (() -> Unit)? = null
            set(value) {
                field = value
                if (inflated) {
                    field?.invoke()
                }
            }
        private var inflated = false
        fun markInflated() {
            inflated = true
            onInflateViewHolder?.invoke()
        }
    }
    
    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.product_empty_card, parent, false)
        val viewHolder = ViewHolder(view)
        AsyncLayoutInflater(parent.context).inflate(R.layout.product_simple_card, parent) { view, resid, parent ->
            parent?.removeAllViews()
            parent?.addView(view)
            viewHolder.markInflated()
        }
        return viewHolder
    }
    
    override fun onViewRecycled(holder: ViewHolder) {
        super.onViewRecycled(holder)
        holder.onInflateViewHolder = null
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.onInflateViewHolder = {
            onInflateViewHolder(holder, position)
        }
    }

    private fun onInflateViewHolder(holder: ViewHolder, position: Int) {
        // usual logic from onBindViewHolder
    }
```

## LinearLayoutManager

After adding time logs to the *onCreateViewHolder()* method, you will surely notice that additional *ViewHolders* are created as you scroll through the list.
Often during faster scrolling, you will encounter some freezes as the UI thread will be busy building additional holders.
Fortunately, we are able to adjust this process slightly.

One way to improve the scrolling smoothness is to pre-inflate more *ViewHolders* that we initially need during the initialization of the layout.
The delegation of *ViewHolders* inflation based on the screen measurements and scrolling is managed by the *layoutManager* property
(*RecyclerView.LayoutManager*) of the *RecyclerView* class.

The default implementation of this class is the *LinearLayoutManager*. Overriding the *getExtraLayoutSpace()* method, allows us to define how much additional,
off-screen space will be used to inflate the views.

It's worth noting that this method is marked *deprecated* and we should actually override the
*calculateExtraLayoutSpace()* method.
Some parts of the new method, however, are based on a private state of the class, and it's hard to cleanly reproduce the logic.
Fortunately, the new method still calls the *getExtraLayoutSpace()* thanks to backward compatibility, so we shouldn't
worry too much about it as long as it's not removed.

```kotlin
import android.content.Context
import android.util.AttributeSet
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

class PreCachingLinearLayoutManager : LinearLayoutManager {
    var extraLayoutSpace = 0

    constructor(context: Context?) : super(context)
    constructor(context: Context?, orientation: Int, reverseLayout: Boolean) : super(
        context,
        orientation,
        reverseLayout
    )

    constructor(
        context: Context?,
        attrs: AttributeSet?,
        defStyleAttr: Int,
        defStyleRes: Int
    ) : super(context, attrs, defStyleAttr, defStyleRes)


    override fun getExtraLayoutSpace(state: RecyclerView.State): Int {
        return if (extraLayoutSpace > 0) {
            extraLayoutSpace
        } else super.getExtraLayoutSpace(state)
    }
}
```

Without overwriting, extra space is only returned when scrolling to a defined place (assuming
that the *isSmoothScrollbarEnabled()* flag is set to *true*, which is the default). When scrolling by hand, the method returns 0.

The private internal state of the object is used to calculate the additional space,
which limits its use when overwriting.
Usually, however, we do not need the exact values. It is enough to bind the additional space to some screen size formula.

```kotlin
// Activity/Fragment

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        products_recycler_view.apply {
            setHasFixedSize(true)
            adapter = vm.viewAdapter.value
            val preCachingLinearLayoutManager = PreCachingLinearLayoutManager(context)
            val dm = DisplayMetrics()
            activity?.windowManager?.defaultDisplay?.getMetrics(dm)
            val extraPixels = dm.heightPixels * 2
            preCachingLinearLayoutManager.extraLayoutSpace = extraPixels
            layoutManager = preCachingLinearLayoutManager
            val layoutManagerReference = WeakReference(preCachingLinearLayoutManager)
            products_recycler_view.postDelayed({
                layoutManagerReference.get()?.extraLayoutSpace = dm.heightPixels / 2
            }, 2000L)
        }
    }
```

Sometime after the initialization, we should reset the value of the extra space. The *ViewHolders* built in this way will remain in the cache and during
scrolling will be reused without freezing the main thread resulting from *onCreateViewHolder()*.

If we use animations that include
collapsing and expanding views, or drawing pictures, it is worth leaving some space here, as in the example. You might find this fixing some unwanted behavior
caused by view boundaries.

## Programmatic view inflation

The last thing from which we can gain valuable milliseconds is the view-building process itself. In the beginning, we will probably use layout inflation
from an XML resource file. Despite the fact that the framework implements some preprocessing of layout definitions (which is why it's hard to build a layout from your own
XML file), it is still not the most performant method.

Inflation through the *LayoutInflater* involves the use of a reflection. As you may already know, the reflection adds quite a bit of overhead.
We are able to reduce it by creating a view programmatically. In this case, however, we should consider whether its pros and cons.
In my opinion, future maintenance is easier with an XML layout.

```kotlin
class ProductCardView : MaterialCardView {/***/}

/***/

abstract class MyAdapter : RecyclerView.Adapter<MyAdapter.ViewHolder>() {
    override fun onCreateViewHolder(
        parent: ViewGroup,
        viewType: Int
    ): ViewHolder {
        return ViewHolder(ProductCardView(parent.context))
    }
    /***/
}
```

From experience, I can say that we can save an average of 2-4 ms on the construction of a simple layout consisting of a group of 4 text views
using the software structure. This is, of course, a subjective observation, just to get a general feeling. The previously mentioned solutions should give better results.

## Summary

In case of problems with smooth scrolling of the *RecyclerView* view, it is worth focusing on several aspects:
simplification of the layout hierarchy, asynchronous loading of the images and caching,
using the ViewStub or asynchronous inflation using *AsyncLayoutInflater*, and
lastly, you may consider moving to programmatic inflation.
If the problems are not resolved after applying all these tips,
the next step may be to analyze the application using the CPU/GPU profiler.
