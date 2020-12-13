---
title: BottomAppBar onHide listener
url: bottomappbar-onhide-listener
id: 45
tags:
  - java
  - kotlin
  - android
author: Damian Terlecki
date: 2020-12-13T20:00:00
---

*BottomAppBar* z biblioteki `com.google.android.material:material` to bardzo przystępny komponent pozwalający na stworzenie dodatkowego paska u dołu ekranu w Androidzie. Jest to świetna opcja z punktu widzenia UX, gdyż użytkownikowi dużo łatwiej jest sięgnąć przycisku niż w przypadku standardowego menu na samej górze.

<img src="/img/hq/bottomappbar.png" alt="Zrzut ekranu z aplikacji wykorzystującej BottomAppBar" title="BottomAppBar">

Bardzo ciekawym parametrem komponentu *BottomAppBar* jest *hideOnScroll*. Ustawienie tej wartości na `true` powoduje, że pasek chowa się przy przewijaniu kontenera w dół i pojawia się przy przewijaniu w górę. Takie zachowanie pozwala nieco zwiększyć obszar wyświetlany przez kontener. Oczywiście pod warunkiem, że z punktu widzenia użytkownika, nie potrzebujemy w takim momencie dostępu do przycisków na pasku dolnym.

## Podstawowa konfiguracja

Przykładowa konfiguracja layoutu wykorzystującego *BottomAppBar* wygląda następująco (konieczne będzie dopasowanie do własnych potrzeb):

```xml
<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <androidx.recyclerview.widget.RecyclerView
        android:id="@+id/products_recycler_view"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        app:layoutManager="androidx.recyclerview.widget.LinearLayoutManager" />

    <com.google.android.material.bottomappbar.BottomAppBar
        android:id="@+id/bottom_app_bar"
        android:layout_width="match_parent"
        android:layout_height="?attr/actionBarSize"
        android:layout_gravity="bottom"
        app:contentInsetStart="0dp"
        app:fabAlignmentMode="center"
        app:fabCradleMargin="8dp"
        app:fabCradleRoundedCornerRadius="32dp"
        app:hideOnScroll="true">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="match_parent">

            <ImageButton
                android:id="@+id/sort_button"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:layout_weight="1"
                android:background="?android:selectableItemBackground"
                android:contentDescription="@string/sort"
                android:enabled="false"
                android:src="@drawable/ic_sort" />

            <ImageButton
                android:id="@+id/add_button"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:layout_weight="1"
                android:background="?android:selectableItemBackground"
                android:contentDescription="@string/add_manual"
                android:enabled="false"
                android:src="@drawable/ic_add_manual" />

            <View
                android:layout_width="0dp"
                android:layout_height="0dp"
                android:layout_weight="2" />

            <ImageButton
                android:id="@+id/search_button"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:layout_weight="1"
                android:background="?android:selectableItemBackground"
                android:contentDescription="@string/search"
                android:enabled="false"
                android:src="@drawable/ic_search" />

            <ImageButton
                android:id="@+id/help_button"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:layout_weight="1"
                android:background="?android:selectableItemBackground"
                android:contentDescription="@string/switch_view"
                android:enabled="false"
                android:src="@drawable/ic_help_outline" />

        </LinearLayout>

    </com.google.android.material.bottomappbar.BottomAppBar>

    <com.google.android.material.floatingactionbutton.FloatingActionButton
        android:id="@+id/scan_button"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:contentDescription="@string/scan"
        android:enabled="false"
        android:src="@drawable/ic_add_on_secondary"
        app:fabSize="normal"
        app:layout_anchor="@+id/bottom_app_bar" />

</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

Podstawowym kontenerem jest tutaj *CoordinatorLayout*, wewnątrz mamy przykładową listę na bazie *RecyclerView*, którą możemy przewijać.
Następnie *BottomAppBar* z czterema przyciskami i ostatecznie przycisk FAB osadzony na środku paska dolnego.

## Implementacja onHide listenera

Czasami możemy potrzebować dodatkowego nasłuchiwania stanu paska dolnego. Taki listener przyda się w przypadku, gdybyśmy chcieli przykładowo zmienić ikonę i zachowanie przycisku FAB.

Za ukrywanie i wyświetlanie paska dolnego odpowiedzialna jest klasa *CoordinatorLayout.Behavior* a właściwie subklasa `com.google.android.material.bottomappbar.BottomAppBar.Behavior`. Generalnie, hierarchia klas wygląda następująco:

<img src="/img/hq/bottomappbar-onhide-listener-pl.svg" alt="Diagram UML przedstawiający hierarchię klas BottomAppBar + Behavior" title="Diagram UML">

Bez wchodzenia w szczegóły, dwie metody, którymi jesteśmy zainteresowani to:
- *HideBottomViewOnScrollBehavior#slideUp()*;
- *HideBottomViewOnScrollBehavior#slideDown()*.

To właśnie one odpowiadają za stan oraz chowanie i pokazywanie się paska.
Co więcej, bez większego problemu jesteśmy w stanie nadpisać te metody. Na podobnej zasadzie co w klasie bazowej, dodamy stan do naszego listenera po to, aby był wywoływany jedynie przy ukryciu bądź pojawieniu się paska dolnego:

```kotlin
import com.google.android.material.bottomappbar.BottomAppBar

abstract class HideListenableBottomAppBarBehavior : BottomAppBar.Behavior() {

    private enum class State {
        SCROLLED_DOWN, SCROLLED_UP
    }

    private var currentState: State? = null

    abstract fun onSlideDown()
    abstract fun onSlideUp()

    override fun slideDown(child: BottomAppBar) {
        super.slideDown(child)
        if (currentState == State.SCROLLED_DOWN) return
        currentState = State.SCROLLED_DOWN
        onSlideDown()
    }

    override fun slideUp(child: BottomAppBar) {
        super.slideUp(child)
        if (currentState == State.SCROLLED_UP) return
        currentState = State.SCROLLED_UP
        onSlideUp()
    }

}
```

Teraz wystarczy jedynie zaaplikować nasz nowy listener do layoutu.
Generalnie *BottomAppBar* ma implementuje interfejs *AttachedBehavior* i tym samym metodę `getBehavior()`, która jednocześnie inicjalizuje standardowe zachowanie. Wskazówki dotyczące nadpisania znajdziemy w javadocu interfejsu. Możemy to zrobić za pomocą `LayoutParams#setBehavior()`.


Po zainicjalizowaniu widoku (w przypadku fragmentu), zmieniamy zachowanie paska dolnego (do pozyskania odniesienia do paska używam kotlinx synthetic):

```kotlin
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val params = bottom_app_bar.layoutParams as CoordinatorLayout.LayoutParams
        params.behavior = object : HideListenableBottomAppBarBehavior() {
                override fun onSlideDown() {
                    scan_button.setImageDrawable(ContextCompat.getDrawable(context, R.drawable.ic_top))
                }

                override fun onSlideUp() {
                    scan_button.setImageDrawable(ContextCompat.getDrawable(context, R.drawable.ic_add))
                }
            }
        }
    }
```

Rezultatem tego jest zmiana ikony przycisku FAB:

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/bottomappbar-onhide-listener.gif" alt="Zrzut ekranu z aplikacji wykorzystującej HideListenableBottomAppBarBehavior" title="Zmiana ikony FAV w zależności od stanu wyświetlenia paska dolnego">
</a>
</figure>

## Podsumowanie

Jeśli chcesz mieć większą kontrolę nad stanem layoutu, możesz następnie zainteresować się metodę *onNestedScroll* jednej z klas nadrzędnych, tj. `com.google.android.material.behavior.HideBottomViewOnScrollBehavior`. Nadpisanie jej pozwoli na uzyskanie referencję nie tylko do paska dolnego, ale również do kontenera, który przewijamy i jego kierunku. W ten sposób będziesz również w stanie zdefiniować dodatkowe zdarzenia w zależności od tego jak daleko zawartość kontenera została przewinięta.