---
title: Snippet for a periodic DB query
url: periodic-db-query-snippet
id: 17
tags:
  - java
  - database
  - sql
author: Damian Terlecki
date: 2019-11-17T20:00:00
---

There are multiple tools well suited for monitoring databases and checking if a specific situation occurred. Sometimes, as a developer or maintainer, you might be interested in whether some conditions have been met, it could be for example insertion of new records, an end of a long-running query or just state of data inconsistency, which you need to manually tend to until a hotfix is delivered.

If you don't have any advanced tooling at hand but have a JDK set-up you could get by reusing some simple snippet written in Java. A prerequisite for this is that you need to add your [database driver as a dependency](https://www.mkyong.com/maven/how-to-add-oracle-jdbc-driver-in-your-maven-local-repository/). The program connects to the database, queries it for some condition and if it's met, finishes displaying a dialog to the user:

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

Here I've used an Oracle JDBC URL, it will differ a bit for other database drivers. Since *Java 1.6* and *JDBC 4.0 API* you no longer need to manage driver discovery using `Class.forName('your.driver.class')`. Though, if you still don't want to install the driver but already have some kind of **command-line client** for your database, you could as well execute the query through the client. The flaw of this is that you will have to filter out the process output, but for something small, it might be ideal. It's still a big roundabout, but here you go:

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