---
title: Performance aspect of KAE Synthetics to Android View Binding migration 
url: kae-synthethics-view-binding-performance
id: 60
category:
  - mobile: Mobile
tags:
  - android
  - kotlin
author: Damian Terlecki
date: 2021-02-21T20:00:00
---

Kotlin Android Extensions is a plugin released in 2017 whose life cycle is just about to end.
The support is planned to be completely removed in September during the release of a new Kotlin version.
If you are still using the old version, you probably know its features i.e. Parcelable interface implementation
generator, and Kotlin Synthetics – a more convenient way to do a lookup of a view declared in an XML layout.

The first functionality has been moved to a separate `kotlin-parcelize` plugin.
Kotlin Synthetics, on the other hand, has been unanimously decided to be replaced by the View Binding
(not to be confused with the clunky Data Binding).
The cons of the deprecated solution listed on the [Google blog](https://android-developers.googleblog.com/2020/11/the-future-of-kotlin-android-extensions.html)
were: namespace clutter (identifier collision), lack of information about nullability, and limitation to the Kotlin language.

<img src="/img/hq/android-view-binding.png" alt="Android View Binding" title="Android View Binding">

Personally, the reasons mentioned were not enough for me to rush with the migration to View Binding in my old projects.
However, I decided to check what Kotlin Synthetics looks like from the inside, bearing in mind that once a popular library – 
Butterknife – also declared EOL indicating its successor – View Binding.

# Kotlin Synthetics

The undoubted advantage (and disadvantage) of Synthetics is the ease of obtaining a reference to the view.
Inside an activity or fragment, we can call the method of a view by its identifier.
Interestingly, the View class is also extended to provide convenient access to a given view.
Magic? Let's check what's inside the decompiled `app/build/tmp/kotlin-classes`.

```kotlin
import kotlinx.android.synthetic.main.fragment_add.add_button;
/***/

public void onViewCreated(@NotNull final View view, @Nullable Bundle savedInstanceState) {
    super.onViewCreated(view, savedInstanceState);
    add_button.setText(R.string.update)
}
```
The decompiled counterpart:
```java
import dev.termian.nutrieval.R.id;
/***/

private HashMap _$_findViewCache;

public void onViewCreated(@NotNull final View view, @Nullable Bundle savedInstanceState) {
    super.onViewCreated(view, savedInstanceState);
    ((Button)this._$_findCachedViewById(id.add_button)).setText(2131953625);
}


public View _$_findCachedViewById(int var1) {
    if (this._$_findViewCache == null) {
        this._$_findViewCache = new HashMap();
    }

    View var2 = (View)this._$_findViewCache.get(var1);
    if (var2 == null) {
        var2 = this.findViewById(var1);
        this._$_findViewCache.put(var1, var2);
    }

    return var2;
}
```

Inside activities and fragments, our view reference is converted to the standard `findViewById<>()` call.
Additionally, there is an additional layer of cache. Why is it needed? Well, it turns out that with each subsequent
call of a view method, the lookup is repeated.

To optimize the code, the found view is saved in a HashMap (or in a SparseArray – if so configured).
Quite a reasonable solution, but still adds extra overhead compared to findViewById<>().

The worst thing we can do, however, is to reference our view through a different view object.
You can fall into such a trap when implementing a ViewHolder.
Since the use of Synthetics is so convenient, you might be tempted to skip the implementation
of ViewHolder fields mapping:

```kotlin
import kotlinx.android.synthetic.main.product_card.view.nova_group;
/***/

override fun onBindViewHolder(holder: ViewHolder, position: Int) {
    val product = products[position]
    val view = holder.view
    view.nova_group.visibility = View.VISIBLE
    view.nova_group.text =
        view.context.getString(R.string.nova_group, product.novaGroup)
}
```
which this leads to:
```java
import dev.termian.nutrieval.R.id;
/***/

public void onBindViewHolder(@NotNull ProductAdapter.ViewHolder holder, int position) {
    Product product = (Product)this.products.get(productIndex);
    View view = holder.getView();
    TextView var10000 = (TextView)view.findViewById(id.nova_group);
    Intrinsics.checkNotNullExpressionValue(var10000, "view.nova_group");
    var10000.setVisibility(0);
    var10000 = (TextView)view.findViewById(id.nova_group);
    Intrinsics.checkNotNullExpressionValue(var10000, "view.nova_group");
    var10000.setText((CharSequence)view.getContext().getString(2131953540, new Object[]{product.getNovaGroup()}));
}
```

In this situation, the code degrades to calling `findViewById<>()` each time the view is referenced.
As far as simple layouts go, this method is very fast.
With more complex (and repetitive – e.g. in the case of RecyclerViewer) hierarchies
everything adds up.

Eventually, we may be losing on precious computation time, especially on slower devices.
A single binding of several views is usually a matter of several hundred microseconds up to one millisecond.

# View Binding

The successor to the Kotlin Synthetics is more conservative in this case. Associating fields with views takes place once
usually when the layout is inflated or at the user's request, by providing an already inflated reference.
We can check the generated bindings in the `app/build/generated/data_binding_base_class_source_out`:

```java
// Generated by view binder compiler. Do not edit!
package dev.termian.nutrieval.databinding;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ScrollView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.viewbinding.ViewBinding;
import dev.termian.nutrieval.R;
import java.lang.NullPointerException;
import java.lang.Override;
import java.lang.String;

public final class FragmentAddBinding implements ViewBinding {
  @NonNull
  private final ScrollView rootView;

  @NonNull
  public final Button addButton;

  private FragmentAddBinding(@NonNull ScrollView rootView, @NonNull Button addButton {
    this.rootView = rootView;
    this.addButton = addButton;
  }

  @Override
  @NonNull
  public ScrollView getRoot() {
    return rootView;
  }

  @NonNull
  public static FragmentAddBinding inflate(@NonNull LayoutInflater inflater) {
    return inflate(inflater, null, false);
  }

  @NonNull
  public static FragmentAddBinding inflate(@NonNull LayoutInflater inflater,
      @Nullable ViewGroup parent, boolean attachToParent) {
    View root = inflater.inflate(R.layout.fragment_add, parent, false);
    if (attachToParent) {
      parent.addView(root);
    }
    return bind(root);
  }

  @NonNull
  public static FragmentAddBinding bind(@NonNull View rootView) {
    // The body of this method is generated in a way you would not otherwise write.
    // This is done to optimize the compiled bytecode for size and performance.
    int id;
    missingId: {
      id = R.id.add_button;
      Button addButton = rootView.findViewById(id);
      if (addButton == null) {
        break missingId;
      }
      return new FragmentAddBinding((ScrollView) rootView, addButton);
    }
    String missingId = rootView.getResources().getResourceName(id);
    throw new NullPointerException("Missing required view with ID: ".concat(missingId));
  }
}
```

All in all, migrating from Kotlin Synthetics (KAE) to View Binding does not contribute only to a
cleaner and safer code, but also improves performance in some places. Of course, we should expect
[slightly longer build times](https://blog.stylingandroid.com/view-binding-performance/),
which I would trade any day, considering what we gain in return.
I also recommend [this article](https://chetangupta.net/viewbinding/), which will explain in great detail
how to use View Binding.