---
title: Cykliczne zapytanie do bazy
url: cykliczne-zapytanie-do-bazy
id: 17
tags:
  - java
  - bazy danych
  - sql
author: Damian Terlecki
date: 2019-11-24T20:00:00
---

Istnieje wiele narzędzi przeznaczonych do monitorowania baz danych i sprawdzania konkretnych warunków. Czasami, programiście (najczęściej w fazie utrzymania), może zajść potrzeba cyklicznego sprawdzania, czy specyficzna sytuacja wystąpiła na bazie. Może to być na przykład wstawienie nowych rekordów, zakończenie długotrwałego zapytania lub po prostu wystąpienie pewnej niespójności w danych, którą należy ręcznie poprawić do czasu wejścia poprawki.

Jeśli nie masz pod ręką żadnego zaawansowanego narzędzia bądź potrzebujesz czegoś prostego i szybkiego, możesz skorzystać z prostego fragmentu kodu napisanego w Javie. Warunkiem wstępnym jego użycia jest dodanie [sterownika bazy danych jako zależności](https://www.mkyong.com/maven/how-to-add-oracle-jdbc-driver-in-your-maven-local-repository/). Prezentowany program łączy się z cyklicznie z bazą danych, wysyłając zapytanie do niej sprawdzające pewien warunek, który jeśli jest spełniony, kończy program wyświetleniem okna dialogowego użytkownikowi:

```java
import javax.swing.*;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class Monitor {
    private static final int REPEAT_TIME_MS = 1000 * 60;

    public static void main(String[] args) {
        String query = "SELECT PENDING FROM TEMP_CLEANUP_STATUS WHERE PENDING = 0";
        String connectionUrl = "jdbc:oracle:&lt;drivertype&gt;:&lt;user&gt;/&lt;password&gt;@&lt;database&gt;";
        try {
            //noinspection InfiniteLoopStatement
            while (true) {
                try (Connection connection = DriverManager.getConnection(connectionUrl);
                     Statement statement = connection.createStatement();
                     ResultSet resultSet = statement.executeQuery(query)) {
                    if (!resultSet.next()) {
                        showDialogAndExit(JOptionPane.INFORMATION_MESSAGE, "The condition has been met");
                    }
                }
                Thread.sleep(REPEAT_TIME_MS);
            }
        } catch (Exception e) {
            e.printStackTrace();
            showDialogAndExit(JOptionPane.ERROR_MESSAGE, e.getMessage());
        }
    }

    private static void showDialogAndExit(int optionPaneMessageType, String message) {
        JOptionPane optionPane = new JOptionPane();
        JDialog dialog = optionPane.createDialog("Monitoring");
        optionPane.setMessageType(optionPaneMessageType);
        optionPane.setMessage(message);
        dialog.setAlwaysOnTop(true);
        dialog.setModal(true);
        dialog.setVisible(true);
        System.exit(0);
    }
}
```

Użyłem tutaj adresu URL właściwego dla sterownika JDBC Oracle, dla innych baz danych (i sterowników) będzie się on nieco różnił. Warto zaznaczyć, że od *Javy 1.6* i *JDBC API v4.0* ręczne wykrywanie sterownika za pomocą `Class.forName('klasa.twojego.sterownika')` nie jest już konieczne. Jeśli jednak nadal nie chcesz instalować sterownika, ale masz już zainstalowanego klienta do swojej bazy danych, działającego w trybie wiersza poleceń, równie dobrze możesz wykonać zapytanie za jego pośrednictwem. Wada tego rozwiązania polega na tym, że konieczne jest przefiltrowanie rezultatu wykonania procesu. W przypadku czegoś prostego może się nadać. To wciąż droga naokoło jednak poniżej zamieszczam przykładowy kod:

```java
import javax.swing.*;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;

public class Monitor {
    private static final int REPEAT_TIME_MS = 1000 * 60;
    private static final String SQL_PLUS_PATH = "~/full/path/to/sqlplus.exe";

    public static void main(String[] args) {
        String query = "SELECT PENDING FROM TEMP_CLEANUP_STATUS WHERE PENDING = 0;";
        String connectionUrl = "&lt;user&gt;/&lt;password&gt;@//&lt;host&gt;:&lt;port&gt;/&lt;database&gt;";
        String command = "echo " + query + " | " + SQL_PLUS_PATH + " -L " + connectionUrl;
        try {
            //noinspection InfiniteLoopStatement
            while (true) {
                String[] cmd = new String[]{"cmd.exe", "/C", command};
                Process process = Runtime.getRuntime().exec(cmd);
                String output = readOutput(process);
                if (output.contains("PENDING")) {
                    showDialogAndExit(JOptionPane.INFORMATION_MESSAGE, "The condition has been met");
                }
                Thread.sleep(REPEAT_TIME_MS);
            }
        } catch (Exception e) {
            e.printStackTrace();
            showDialogAndExit(JOptionPane.ERROR_MESSAGE, e.getMessage());
        }
    }

    private static void showDialogAndExit(int optionPaneMessageType, String message) {
        JOptionPane optionPane = new JOptionPane();
        JDialog dialog = optionPane.createDialog("Monitoring");
        optionPane.setMessageType(optionPaneMessageType);
        optionPane.setMessage(message);
        dialog.setAlwaysOnTop(true);
        dialog.setModal(true);
        dialog.setVisible(true);
        System.exit(0);
    }

    private static String readOutput(Process process) throws Exception {
        try (BufferedReader inputReader = new BufferedReader(new InputStreamReader(process.getInputStream()));
             BufferedReader errorReader = new BufferedReader(new InputStreamReader(process.getErrorStream()))) {
            StringBuilder errorBuilder = readOutput(errorReader);
            if (errorBuilder.length() != 0) {
                throw new Exception(errorBuilder.toString());
            }
            return readOutput(inputReader).toString();
        }
    }

    private static StringBuilder readOutput(BufferedReader reader) throws IOException {
        StringBuilder sb = new StringBuilder();
        String errorLine;
        while ((errorLine = reader.readLine()) != null) {
            System.out.println(errorLine);
            sb.append(errorLine)
                    .append("\n");
        }
        return sb;
    }
}
```