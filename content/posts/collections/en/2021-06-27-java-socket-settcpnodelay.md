---
title: Java Socket with tcpNoDelay
url: java-socket-tcpnodelay
id: 69
category:
- java: Java
tags:
  - native
author: Damian Terlecki
date: 2021-06-27T20:00:00
---

The standard Java socket interface offers a basic API for handling communication TCP/UDP communication between applications.
Among the available socket configuration options generally, there are no low-level flags that target only specific systems (e.g. [IP_DONTFRAG / IP_MTU_DISCOVER](https://bugs.openjdk.java.net/browse/JDK-8238725?focusedCommentId=14316471&page=com.atlassian.jira.plugin.system.issuetabpanels:comment-tabpanel#comment-14316471)).
Nevertheless, new flags (e.g. TCP_QUICKACK added in Java 10) are slowly being added to the JDK, giving us the opportunity of
extended configuration through the *NetworkChannel* interface.

Among the standard options, TCP_NODELAY seems to be the most intriguing flag. This flag is responsible for the possibility of disabling Nagle's algorithm.
In simple terms, this algorithm buffers the data until the delivery confirmation (ACK) of the previous packet is received or until the buffer reaches
the packet/frame limit (MSS/MTU).

<img src="/img/hq/wireshark-tcpnodelay.png" alt="Wireshark – TCP packet analysis" title="Wireshark – TCP packet analysis">

# TCP_NODELAY

To test the system behavior with the TCP_NODELAY flag, we will need a simple server and a client that supports TCP communication.
The server, in this case, will only be used to accept the connection and read the sent data. It's preferred to set up such a server
somewhere on the internet, or a separate network, ignoring the loopback interface. Loopback is an emulated interface
and may not fully reflect the production conditions (unless you plan to implement the communication on the same host).

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

Let's focus on the communication from the client's point of view.
Assuming that the buffering is disabled, we can expect the packets sent
within the size limits of the buffer defined on the application side, regardless of the bigger MSS size.
Using the internet interface with the standard MTU of 1500, we will try to send packets of 1200 bytes size.

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

In addition to setting the TCP_NODELAY flag, we will add (or not) some slight delay of milliseconds between each packet sent to get better results.
Since the TCP communication is in the form of a stream, there is no proper command to flush the buffer.
The operating system is responsible for the actual handling of the communication.

## Results

As it turns out, whether the packet is sent at the time of writing to the socket stream largely depends on the operating system.
It is up to the algorithms implemented by the system that the result of our test is as follows:

<table class="rwd">
   <thead>
      <tr>
         <th>System</th>
         <th>tcpNoDelay</th>
         <th>Forced delay</th>
         <th>Number of packets sent without buffering</th>
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
         <td data-label="Forced delay">
            0 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            0 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            0 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            15 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            0 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            5 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            10 ms
         </td>
         <td data-label="Number of packets sent without buffering">
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
         <td data-label="Forced delay">
            15 ms
         </td>
         <td data-label="Number of packets sent without buffering">
            99.9%
         </td>
      </tr>
</tbody>
</table>

Windows 10, in this case, behaves as you would expect from the TCP_NODELAY flag description.
In the standard configuration, the first (according to the algorithm) and the last (when the connection is closed) packets are sent immediately.
When the Nagle algorithm is disabled, all packets are sent with a maximum of length of 1200 bytes.

In the case of Linux, things are a bit more complicated. It is necessary to introduce some delay between sending consecutive packets so that the system does not
buffer the data regardless of Nagle's algorithm being turned off. It is the result of a combination of several other algorithms, among others:
- [The congestion avoidance algorithm](https://www.cdnplanet.com/blog/tune-tcp-initcwnd-for-optimum-performance/) which causes
  buffering due to a high number of unacknowledged packets, especially during the early phase of the connection;
- The enabled by default [net.ipv4.tcp_autocorking = 1](https://knowledgebase.progress.com/articles/Article/network-related-performance-issue-after-linux-distribution-upgrade) flag that forces skipping the immediate data push in some cases;
- Other algorithms, such as [TSQ](https://github.com/torvalds/linux/blob/v5.8/net/ipv4/tcp_output.c#L2316), that minimize data aggregation up to a certain point.

Concluding, the TCP_NODELAY flag configurable on the Java socket is not just a hint for the operating system (as some other flags). It works quite well.
Although present on most modern systems, the results of its use may differ slightly depending on the OS.
Therefore, before using it, it is worth verifying whether it fits our solution and runtime environment.