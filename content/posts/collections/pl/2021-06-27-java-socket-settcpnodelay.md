---
title: Java Socket i tcpNoDelay
url: java-socket-tcpnodelay
id: 69
category:
- java: Java
tags:
  - native
author: Damian Terlecki
date: 2021-06-27T20:00:00
---

Standardowy interfejs socketów w Javie oferuje podstawowe API do obsługi aplikacji bazujących na komunikacji TCP/UDP.
Wśród dostępnych opcji konfiguracyjnych socketu nie znajdziemy niskopoziomowych flag
specyficznych dla poszczególnych systemów operacyjnych (np. [IP_DONTFRAG/IP_MTU_DISCOVER](https://bugs.openjdk.java.net/browse/JDK-8238725?focusedCommentId=14316471&page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel#comment-14316471)). 
Niemniej jednak nowe flagi (np. TCP_QUICKACK – Java 10) dodawane są do JDK i dają nam możliwość
konfiguracji na poziomie interfejsu *NetworkChannel*, z której to klasy możemy wyłuskać sam socket.

Z punktu widzenia standardowych opcji, ciekawą flagą jest TCP_NODELAY. Flaga ta odpowiada za możliwość wyłączenie algorytmu Nagle'a.
W uproszczeniu algorytm ten buforuje dane do momentu nadejścia potwierdzenia doręczenia (ACK) poprzedniego pakietu danych bądź osiągnięcia
limitu danych w buforze (MSS/MTU).

<img src="/img/hq/wireshark-tcpnodelay.png" alt="Wireshark – analiza pakietów TCP" title="Wireshark – analiza pakietów TCP">

# TCP_NODELAY

Aby przetestować zachowanie systemu przy użyciu flagi TCP_NODELAY przyda nam się prosty serwer oraz klient obsługujący komunikację TCP.
Serwer w tym przypadku posłuży jedynie do akceptacji połączenia i odczytania przesłąnych danych. Dobrym pomysłem będzie postawienie
go gdzieś w internecie, bądź w oddzielnej sieci, bez korzystania z interfejsu pętli zwrotnej. Loopback jest bowiem interfejsem emulowanym
i może nie oddawać w pełni warunków produkcyjnych (chyba że komunikację planujemy oprzeć na tym samym hoście).

```java
public class Server {
    public static void main(String[] args) throws IOException {
        String envPort = System.getenv("PORT");
        int port = Integer.parseInt(envPort == null ? "14321" : envPort);
        ServerSocket serverSocket = new ServerSocket(port);
        System.out.printf("Starting socket server on port %d%n", port);
        while (true) {
            Socket socket = serverSocket.accept();
            InputStream inputStream = socket.getInputStream();
            int read = inputStream.read();
            while (read >= 0) {
                System.out.print(read);
                read = inputStream.read();
            }
            System.out.println();
        }
    }
}
```

Sama komunikacja będzie ciekawa głównie z poziomu klienta. Zakładając wyłączenie buforowanie, możemy spodziewać się, że wysyłane pakiety będą
w granicach bufora zdefiniowanego po stronie aplikacji, a nie rozmiaru MSS. A więc do przetestowania na standardowym interfejsie internetowym o
MTU 1500, spróbujemy wysyłać pakiety o wielkości 1200 bajtów.

```java
public class Client {
    private static final String HOST = "54.156.x.x";
    private static final int PORT = 1432;

    private static final byte[] PAYLOAD = new byte[1200];
    private static final int CONSECUTIVE_CONNECTIONS = 1000;
    private static final int CONSECUTIVE_REQUESTS_PER_CONNECTION = 10;
    private static final int FORCED_DELAY_MS = 15;

    public static void main(String[] args) throws IOException, InterruptedException {
        for (int j = 0; j < CONSECUTIVE_CONNECTIONS; j++) {
            System.out.printf("Starting iteration %d/%d%n", j, CONSECUTIVE_CONNECTIONS);
            Socket socket = new Socket(HOST, PORT);
            socket.setTcpNoDelay(true);
            OutputStream outputStream = socket.getOutputStream();
            for (int i = 0; i < CONSECUTIVE_REQUESTS_PER_CONNECTION; i++) {
                outputStream.write(PAYLOAD);
                Thread.sleep(FORCED_DELAY_MS);
            }
            socket.close();
        }
    }
}
```

Oprócz ustawienia flagi TCP_NODELAY, pomiędzy każdym wysłanym pakietem dodamy (bądź nie) pewne niewielkie opóźnienie na poziomie milisekund.
Komunikacja TCP odbywa się strumieniowo, nie ma tu właściwego polecenia opróżniającego bufor, a właściwą obsługą procesu zajmuje się system operacyjny.

## Wyniki

Jak się okazuje to, czy pakiet zostanie wysłany w momencie zapisu do strumienia socketa, zależy w dużej mierze od systemu.
To w gestii zaimplementowanych algorytmów leży rezultat naszego testu:

<table class="rwd">
   <thead>
      <tr>
         <th>System</th>
         <th>tcpNoDelay</th>
         <th>Wymuszone opóźnienie</th>
         <th>Liczba pakietów wysłanych bez buforowania</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="System">
            Windows 10.0.19042
         </td>
         <td data-label="tcpNoDelay">
            false
         </td>
         <td data-label="Wymuszone opóźnienie">
            0 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            33.33%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Windows 10.0.19042
         </td>
         <td data-label="tcpNoDelay">
            true
         </td>
         <td data-label="Wymuszone opóźnienie">
            0 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            100%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            false
         </td>
         <td data-label="Wymuszone opóźnienie">
            0 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            22.22%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            false
         </td>
         <td data-label="Wymuszone opóźnienie">
            15 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            22.22%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            true
         </td>
         <td data-label="Wymuszone opóźnienie">
            0 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            33.33%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            true
         </td>
         <td data-label="Wymuszone opóźnienie">
            5 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            98%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            true
         </td>
         <td data-label="Wymuszone opóźnienie">
            10 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            99.7%
         </td>
      </tr>
      <tr>
         <td data-label="System">
            Linux 5.8.0-55-generic
         </td>
         <td data-label="tcpNoDelay">
            true
         </td>
         <td data-label="Wymuszone opóźnienie">
            15 ms
         </td>
         <td data-label="Liczba pakietów wysłanych bez buforowania">
            99.9%
         </td>
      </tr>
</tbody>
</table>

Windows 10 zachowuje się w tym przypadku tak jak można by się tego spodziewać po opisie flagi TCP_NODELAY.
W standardowej konfiguracji pierwszy (zgodnie z algorytmem) i ostatni (przy zakmięciu połączenia) pakiety są wysyłane natychmiastowo.
Przy wyłączeniu algorytmu Nagle'a wszystkie pakiety wysyłane są z maksymalnym rozmiarem 1200 bajtów (nie licząc rozmiaru nagłówków).

W przypadku Linuksa sprawa jest nieco bardziej skomplikowana. Potrzebne jest wymuszenie opóźnienia pomiędzy kolejnymi pakietami, aby system mimo
wyłączonego algorytmu nie zbuforował nam danych wyjściowych. Jest to wynikiem kilku składowych. Wpływ na to ma między innymi:
- [Algorytm unikania przeciążania](https://www.cdnplanet.com/blog/tune-tcp-initcwnd-for-optimum-performance/) (ang. congestation), który powoduje
buforowanie w wyniku dużej ilości niepotwierdzonych jeszcze pakietów, szczególnie w początkowej fazie połączenia;
- Standardowo włączona flaga [net.ipv4.tcp_autocorking=1](https://knowledgebase.progress.com/articles/Article/network-related-performance-issue-after-linux-distribution-upgrade) pomijająca wysyłanie pakietu w określonych przypadkach;
- Inne algorytmy, np. [TSQ](https://github.com/torvalds/linux/blob/v5.8/net/ipv4/tcp_output.c#L2316) minimalizujący agregację danych.

Podsumowując, flaga TCP_NODELAY możliwa do ustawienia na sockecie w Javie nie jest jedynie wskazówką dla systemu (jak można by się spodziewać po jej podobnych), a faktycznie działa.
Mimo obecności na większości współczesnych systemów, rezultaty jej wykorzystania mogą nieco różnić się w zależności od systemu operacyjnego.
Przed skorzystaniem warto więc przeanalizować, czy pasuje ona do naszego rozwiązania i środowiska uruchomieniowego.