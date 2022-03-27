---
title: Migracja z KAE Synthetics do Android View Binding – wydajność 
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

Kotlin Android Extensions to plugin wydany w 2017, którego cykl życia właśnie dobieg końca. We wrześniowym wydaniu nowej wersji
Kotlina planowane jest już całkowite usunięcie wsparcia dla funkcjonalności oferowanych przez plugin. Jeśli korzystasz jeszcze ze
starej wersji, to zapewne je kojarzysz – jest to generator implementacji interfejsu Parcelable, oraz Kotlin Synthetics – czyli
nieco wygodniejszy sposób na odwołanie do widoku zadeklarowanego w layoucie XML.

Pierwsza funkcjonalność została przeniesiona do oddzielnego pluginu `kotlin-parcelize`. Kotlin Synthetics natomiast, jednogłośnie
postanowiono zastąpić funkcjonalnością View Binding (nie mylić z topornym Data Binding). Na [blogu Google](https://android-developers.googleblog.com/2020/11/the-future-of-kotlin-android-extensions.html)
wśród głównych wad dotychczasowego rozwiązania wymieniono zaśmiecanie głównej przestrzeni nazw (kolizja identyfikatorów), brak
informacji o istnieniu widoku oraz ograniczenie do języka Kotlin.

<img src="/img/hq/android-view-binding.png" alt="Android View Binding" title="Android View Binding">

Personalnie, wymienione powody nie były dla mnie wystarczające, aby spieszyć się z migracją do View Binding w przypadku starych projektów.
Postanowiłem więc sprawdzić, jak wygląda od wewnątrz Kotlin Synthetics, mając na uwadze to, że swego czasu popularna biblioteka
Butterknife również zadeklarowały EOL z wyznaczeniem następcy – View Binding.

# Kotlin Synthetics

Niewątpliwą zaletą, jak i wadą Synthetics jest łatwość w uzyskaniu referencji do widoku. Wewnątrz aktywności czy fragmentu możemy
wywołać metodę danego widoku poprzez jego identyfikator. Co ciekawe, mając obiekt jakiegokolwiek widoku, również z niego, poprzez
identyfikator odwołamy się do szukanego widoku. Magia? Sprawdźmy więc, co kryje się w zdekompilowanym kodzie `app/build/tmp/kotlin-classes`.

```kotlin
import kotlinx.android.synthetic.main.fragment_add.add_button;
/***/

public void onViewCreated(@NotNull final View view, @Nullable Bundle savedInstanceState) {
    super.onViewCreated(view, savedInstanceState);
    add_button.setText(R.string.update)
}
```
Wersja zdekompilowana:
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

W przypadku aktywności i fragmentu nasze odwołanie do widoku zamieniane jest na standardowe wywołanie `findViewById<>()`.
Dodatkowo dochodzi pewna warstwa cache. Dlaczego jest ona potrzebna? Otóż okazuje się, że przy każdym kolejnym odwołaniu
do widoku, wyszukiwany jest on ponownie.

Aby nieco zoptymalizować kod, znaleziony widok zapisywany jest w HashMapie (bądź
w SparseArray – do wyboru w konfiguracji pluginu). Rozwiązanie całkiem rozsądne, ale wciąż wprowadzające dodatkowy nakład
w porównaniu do `findViewById<>()`.

Najgorsze co możemy zrobić, jest odwołanie do naszego widoku poprzez obiekt innego widoku. W pułapkę można wpaść
przy implementacji ViewHolderów. Po co mapować pola ViewHoldera do konkretnych widoków, skoro możemy w prosty sposób
odwołać się do nich przez rozszerzenie klasy View:

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
A no po to:
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

W tej sytuacji rozwiązanie degraduje się do każdorazowego wywoływania `findViewById<>()`. O ile dla prostych layoutów
metoda ta jest bardzo szybka, to przy bardziej złożonym (i powtarzalnym – np. w przypadku RecyclerViewera) procesowaniu
wszystko się sumuje.

Ostatecznie, może zacząć nam brakować cennych milisekund szczególnie na wolniejszych urządzeniach.
Pojedyncze zbindowanie kilkunastu widoków to zwykle kwestia kilkuset mikrosekund.

# View Binding

Następca Kotlin Synthetics jest w tym przypadku bardziej konserwatywny. Powiązanie pól z widokami odbywa się jednorazowo
przy inflacji widoków bądź na żądanie użytkownika przy dostarczeniu już zbudowanego layoutu `app/build/generated/data_binding_base_class_source_out`:

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

Podsumowując, migracja z Kotlin Synthetics (KAE) do View Binding to nie tylko czystszy i bezpieczniejszy kod, ale miejscami
też większa wydajność. Oczywiście powinniśmy się spodziewać
[nieco dłuższych czasów budowania](https://blog.stylingandroid.com/view-binding-performance/), co osobiście jestem w stanie przeżyć,
biorąc pod uwagę to, co zyskujemy w zamian. Polecam również [ten artykuł](https://chetangupta.net/viewbinding/), który rozjaśni Ci
sposób wykorzystania View Binding.