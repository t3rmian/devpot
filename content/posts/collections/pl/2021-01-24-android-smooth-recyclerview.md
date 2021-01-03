---
title: Płynne przewijanie widoku RecyclerView w Androidzie
url: android-recyclerview-smooth-scroll
id: 48
tags:
  - android
  - kotlin
author: Damian Terlecki
date: 2021-01-24T20:00:00
---

RecyclerView to typ widoku w Androidzie przeznaczony do wyświetlania wielu podobnych elementów. Dzięki wykorzystaniu puli ViewHolderów różnych typów, które
reprezentują poszczególne elementy na liście, komponent ten jest w stanie bez większych problemów wydajnościowych wyświetlać setki, a nawet tysiące elementów.

Mimo tych cech, nasza implementacja, szczególnie pierwsza jej iteracja, może jednak nie być optymalna i powodować różne niepożądane efekty takie jak
brak płynności podczas przewijania.

<figure>
<a href="https://play.google.com/store/apps/details?id=dev.termian.nutrieval">
<img src="/img/hq/bottomappbar-onhide-listener.gif" alt="Zrzut ekranu z aplikacji wykorzystującej widok typu RecyclerView" title="RecyclerView">
</a>
</figure>

W przypadku napotkania problemów wydajnościowych podstawowym krokiem, jaki możemy wykonać, jest analiza,
ile czasu wątek UI spędza w dwóch głównych metodach naszej implementacji klasy
`androidx.recyclerview.widget.RecyclerView.Adapter`. Mowa tu o metodach *onCreateViewHolder()* i *onBindViewHolder()*.

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

Pierwsza z nich służy do zbudowania widoku, najczęściej z layoutu w postaci pliku XML, natomiast druga do uzupełnienia widoku wartościami dynamicznymi.
Zbyt duży czas, jaki wątek UI spędza w jednej z tych metod, będzie oznaczał problemy z płynnym wyświetlaniem kolejnych elementów widoku. Standardowo 
czas większy niż 16ms będzie indykatorem problemów z utrzymaniem 60 klatek na sekundę.

## Uproszczenie hierarchii layoutu

Pierwszym elementem, nad którym warto się pochylić jest hierarchia widoków w naszym layoucie. Jednym z problemów wynikających z głębokiej hierarchii widoków
jest niemożliwość wyliczenia pozycji i rozmiarów elementów w jednej iteracji. Szerzej problem i narzędzia używane do jego rozwiązania opisuje
[oficjalna dokumentacja](https://developer.android.com/topic/performance/rendering/optimizing-view-hierarchies)
skierowana do deweloperów aplikacji Androidowych.

## Wyświetlanie obrazków
   Drugim dosyć częstym źródłem spowolnienia aplikacji jest ładowanie i wyświetlanie obrazów. Bez wykorzystania bibliotek ułatwiających ten proces (Glide/Picasso),
   warto przynajmniej zaimplementować proces wyświetlania obrazu w jakości dopasowanej (nieco gorszej od oryginalnej) do rozmiaru widoku. Pozwoli to znacznie
   zaoszczędzić zasoby urządzenia mobilnego.
   
Metoda opisana jest w [dokumentacji dla deweloperów](https://developer.android.com/topic/performance/graphics/load-bitmap)
   i można ją zastosować zarówno do obrazów ładowanych z zasobów aplikacji, jak i z tablic bajtowych. Przykładowo wyświetlenie obrazu o rozdzielczości
   1024 × 1024 px w widoku o rozmiarze 72 × 72 px to różnica między 4 MB a 0,02 MB w wykorzystaniu pamięci, a także czasu procesora.
   
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

   Alternatywnie, wykorzystanie biblioteki przeznaczonej do celów ładowania obrazów znacznie ułatwia całą implementację. Downsampling jest zazwyczaj wbudowany, dodatkowo
   w prezencie dostajemy implementację cache'a, a wisienką na jest wbudowany interfejs do animacji. 

## ViewStub

Gdy w naszym layoucie mamy do czynienia z taką funkcjonalność jak rozwijanie widoku (np. w celu wyświetlenia szczegółów), rozwiązaniem szczególnie adekwatnym
   może być wykorzystanie widoku [ViewStub](https://developer.android.com/reference/android/view/ViewStub). Ten typ widoku charakteryzuje się tym, że początkowo nie zajmuje żadnego miejsca w UI, podobnie do atrybutu View.GONE.
   
W przypadku atrybutu *View.GONE*, podczas inflacji widoku następuje inicjalizacja widoków podrzędnych (jeśli jest to kontener/grupa widoków np. LinearLayout).
   ViewStub natomiast pozwala ten proces opóźnić, aż do czasu, gdy będziemy potrzebować wyświetlić (*View.VISIBLE*) nasz widok.

<img src="/img/hq/android-viewstub.gif" alt="Zrzut ekranu przedstawiający widok rozwijany" title="Layout rozwijany przy użyciu widoku ViewStub">

   Jeśli standardowo wyświetlamy zwinięte widoki, wykorzystanie ViewStub pozwoli nam na zaoszczędzenie cennych milisekund podczas tworzenia *ViewHoldera*
   (metoda *onCreateViewHolder()*) w zamian za nieco dłuższe rozwijanie widoku. Inflacja layoutu docelowego określonego przez `android:inflatedId` następuje przy programowym wywołaniu metody 
   *inflate()* bądź ustawieniu widoczności na *View.VISIBLE* bądź *View.INVISIBLE*.

## AsyncLayoutInflater

Jeśli nasz *ViewHolder* jest jednak dosyć złożony i zawsze wyświetlany w pełnej postaci, to deską ratunkową może być użycie AsyncLayoutInflater. W zamyśle
   możemy początkowo stworzyć pewien prosty widok (placeholder), który wymaga minimalną ilość czasu do zbudowania, a w tle oddelegować budowę właściwego widoku do asynchronicznego
   procesu. Ostatecznie, przy zakończeniu budowy, wywołując metodę z logiką, którą normalnie umieścilibyśmy w *onBindViewHolder()*, podmieniamy zawartość widoku pierwotnego.

O ile zamysł brzmi zbawiennie, to w praktyce nie zawsze jest tak wesoło. Proces wiąże się z kilkoma [warunkami](https://developer.android.com/reference/androidx/asynclayoutinflater/view/AsyncLayoutInflater):
   > For a layout to be inflated asynchronously it needs to have a parent whose generateLayoutParams(AttributeSet) is thread-safe and all the Views being constructed as part of inflation must not create any Handlers or otherwise call myLooper(). If the layout that is trying to be inflated cannot be constructed asynchronously for whatever reason, AsyncLayoutInflater will automatically fall back to inflating on the UI thread.
 
   Osobiście przy wykorzystaniu asynchronicznej inflacji miałem problem z poprawną aplikacją atrybutów stylów (motywu). W szczególności, zamiast przycisków
   w formie ikon wyświetlały mi się puste przestrzenie.

<img src="/img/hq/android-asynclayoutinflater.jpg" alt="Zrzut ekranu przedstawiający widok zbudowany przy użyciu AsyncLayoutInflatera" title="AsyncLayoutInflater – rezultat z nienarysowanymi przyciskami">

   Przykładowa implementacja:

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

Po dodaniu logowania czasów do metody *onCreateViewHolder()* zapewne zauważysz, że przy przewijaniu listy tworzone są dodatkowe *ViewHoldery*. Szczególnie przy szybszym
przewijaniu często nie uzyskamy płynności, gdyż wątek UI będzie zajęty budową dodatkowych widoków. Proces ten jesteśmy w stanie nieco oszukać.
   
Jednym ze sposobów na rozwiązanie problemów z przycinającym się wątkiem UI podczas przewijania jest zbudowanie większej liczby *ViewHolderów* podczas
   początkowej inicjalizacji całego layoutu.
   Klasa zarządzająca delegacją tworzenia *ViewHolderów *na podstawie pomiarów ekranu i przewijania ustawiana jest w polu *layoutManager*
   (*RecyclerView.LayoutManager*) klasy *RecyclerView*.
   
Standardową implementacją tej klasy jest *LinearLayoutManager*. Nadpisanie metody *getExtraLayoutSpace()*, daje nam możliwość zdefiniowania, ile dodatkowej
   przestrzenni poza ekranem będzie wykorzystane do zbudowania dodatkowych widoków.
   
Warto zaznaczyć, że metoda ta jest oznaczona jako *deprecated* i właściwie powinniśmy nadpisać
   metodę *calculateExtraLayoutSpace()*. Część nowej metody bazuje jednak na prywatnej implementacji klasy i ciężko jest ją ładnie się do niej podpiąć.
   Na szczęście, nowa metoda ze względu na wsteczną kompatybilność nadal wywołuje *getExtraLayoutSpace()*, więc do czasu jej usunięcia nie powinniśmy
   się tym zbytnio zamartwiać.
   
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

Bez nadpisania, dodatkowa przestrzeń jest zwracana tylko przy przewijaniu do zdefiniowanego miejsca (zakładając,
że flaga *isSmoothScrollbarEnabled()* jest standardowo ustawiona na *true*), więc przy normalnym
przewijaniu palcem po ekranie metoda zwraca wartość 0.

Do obliczenia dodatkowej przestrzeni wykorzystywany jest prywatny stan wewnętrzny obiektu,
co ogranicza jego wykorzystanie podczas nadpisywania.
Zazwyczaj nie potrzebujemy jednak dokładnych wartości i wystarczy, że dodatkową przestrzeń powiążemy z rozmiarem ekranu.

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

Po zainicjalizowaniu widoku powinniśmy zresetować wartość dodatkowej przestrzeni. W ten sposób zbudowane *ViewHoldery* pozostaną w cache'u i podczas
przewijania zostaną wykorzystane ponownie już bez przycinania głównego wątku wynikającego z *onCreateViewHolder()*.

Jeśli korzystamy z animacji, które obejmują
zwijanie/rozszerzanie elementów, bądź zaciąganie obrazków, warto pozostawić tu pewną przestrzeń tak jak w przykładzie, aby animacja zaczynała się nieco
poza ramami widoku *RecyclerViewera*.

## Programowe budowanie widoku

Ostatnim elementem, z którego możemy wyciągnąć cenne milisekundy, jest sam proces budowania widoku. Na początku zapewne będziemy używać inflacji layoutu
z pliku zasobów XML. Mimo tego, że framework implementuje pewne preprocesowanie definicji layoutów (dlatego też ciężko jest zbudować layout z własnego
pliku XML), to ciągle nie jest to najszybsza metoda.

Inflacja za pomocą *LayoutInflatera* wiąże się z użyciem mechanizmu refleksji. Czas budowania
jesteśmy w stanie zredukować, tworząc widok programowo zamiast z pliku XML. W tym przypadku powinniśmy jednak rozważyć, czy taka zmiana jest dla nas
opłacalna. Moim zdaniem późniejsze utrzymanie jest łatwiejsze w przypadku layoutu w formacie XML.

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

Z doświadczenia mogę powiedzieć, że możemy zaoszczędzić średnio 2-4 ms na konstrukcji prostego layoutu złożonego z grupy 4 widoków tekstowych
korzystając z konstrukcji programowej. Jest to oczywiście subiektywna obserwacja, poprzednio wymienione rozwiązania powinny dać lepsze rezultaty.

## Podsumowanie

Przy problemach z płynnym przewijaniem widoku *RecyclerView* warto pochylić się nad: uproszczeniem hierarchii layoutu *ViewHoldera*, asynchronicznym
ładowaniem obrazków i ich cache'owaniem, wykorzystaniem widoku ViewStub bądź asynchronicznej konstrukcji layoutu przy pomocy *AsyncLayoutInflater*, a
ostatecznie zastanowić się nad przejściem do konstrukcji programowej. Jeśli po wykorzystaniu tych wskazówek problemy nie zostaną rozwiązane, to 
kolejnym krokiem może być analiza aplikacji przy użyciu profilera CPU/GPU.