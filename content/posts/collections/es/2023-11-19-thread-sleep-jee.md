---
title: Thread sleep en JEE
url: thread-sleep-jee
id: 120
category:
  - jee: JEE
tags:
  - threads
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

El método `Thread.sleep()`, aunque parece una forma sencilla de introducir una demora artificial, su uso está [generalmente desaconsejado en entornos JEE](https://www.oracle.com/java/technologies/restriction.html#threads).
Gestiona directamente la planificación de hilos, una tarea que debería manejar el contenedor del servidor de aplicaciones. Esta interferencia puede
dificultar la capacidad del contenedor para optimizar la asignación de recursos y la gestión de hilos, lo que lleva a degradación del rendimiento y posibles cuellos de botella. En escenarios de alto tráfico, el contenedor puede quedarse sin hilos libres, resultando en
demoras o fallos al recibir peticiones.

## Timer Service

Una alternativa compatible con JEE a `Thread.sleep` es el `TimerService`.
Es un conjunto de APIs que permite programar tareas para que se ejecuten
en momentos, demoras o intervalos específicos.

<img src="/img/hq/thread-sleep-jee.png" alt="Resultados de ejecutar un TimerService como alternativa a Thread.sleep() en JEE" title="Resultados de la consola al ejecutar un TimerService de ejemplo">

Para usar los servicios de temporizador, debes inyectar el recurso de la interfaz `TimerService` en tu EJB. Luego usa el
método `createTimer()` para crear un temporizador y especificar el tiempo o la programación deseada. Finalmente, un método anotado con
`@Timeout` implementará el trabajo que debe ejecutarse tras la demora.

Al llamar a `createTimer()`, puedes proporcionar un parámetro `Serializable` que se recupera desde el parámetro `Timer`
en el método anotado con `@Timeout` usando `getInfo()`. Así puedes pasar el progreso de tu trabajo.

Aquí tienes un ejemplo de métodos `foo()` y `bar()` con una demora de 5 segundos entre ellos:

```java
import javax.annotation.Resource;
import javax.ejb.Stateless;
import javax.ejb.Timeout;
import javax.ejb.Timer;
import javax.ejb.TimerService;
import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

@Stateless
public class MyEJB {
    public static class MyTimerInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private final LocalDateTime startDateTime;
        private final LocalDateTime fooEndDateTime;

        public MyTimerInfo(LocalDateTime startDateTime, LocalDateTime fooEndDate) {
            this.startDateTime = startDateTime;
            this.fooEndDateTime = fooEndDate;
        }
    }

    @Resource
    private TimerService timerService;

    public void runFooBar() {
        LocalDateTime workStartDate = LocalDateTime.now();
        System.out.println("Starting foo() at " + workStartDate);
        foo();
        LocalDateTime fooEndDate = LocalDateTime.now();
        System.out.println("Ended foo() at " + fooEndDate);
        long delay = TimeUnit.SECONDS.toMillis(5);
        timerService.createTimer(delay, new MyTimerInfo(workStartDate, fooEndDate));
    }

    @Timeout
    public void onTimeout(Timer timer) {
        if (timer.getInfo() instanceof MyTimerInfo) {
            MyTimerInfo myTimerInfo = (MyTimerInfo) timer.getInfo();
            LocalDateTime barStartDateTime = LocalDateTime.now();
            System.out.println("Starting bar() at " + barStartDateTime);
            bar(myTimerInfo);
            LocalDateTime workEndDateTime = LocalDateTime.now();
            System.out.println("Ended bar() at " + workEndDateTime);
            System.out.printf("Total time for foo[%sms] + delay[%sms] + bar[%sms] = %sms%n",
                    Duration.between(myTimerInfo.startDateTime, myTimerInfo.fooEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.fooEndDateTime, barStartDateTime).toMillis(),
                    Duration.between(barStartDateTime, workEndDateTime).toMillis(),
                    Duration.between(myTimerInfo.startDateTime, workEndDateTime).toMillis());
        } else {
            System.err.println("Unknown timer config");
        }
    }

    public void foo() {/***/} // Esto podría devolver un id de seguimiento
    public void bar(MyTimerInfo workProgress) {/***/}
}
```

Además de `createTimer()`, existen métodos como `createSingleActionTimer()`, `createIntervalTimer()` y `createCalendarTimer()`.
Su API espera un parámetro `Serializable` opcionalmente envuelto en un objeto `TimerConfig` que permite cambiar la opción `persistent` (por defecto true). Así puedes extender la vida del temporizador más allá de la instancia actual de la JVM.

Ten en cuenta que para los métodos anotados con `@Timeout` hay dos restricciones importantes:
> La especificación EJB solo permite los atributos de transacción `RequiresNew` (por defecto) o `NotSupported` para este método.

> El método timeout no debe lanzar excepciones de aplicación.

Además, encontré que el contenedor puede no invocar los interceptores en la invocación del método `@Timeout` en WebLogic.
Ten cuidado con esto y otras características similares de tu proveedor.

## Resumen

La alternativa compatible con JEE para `Thread.sleep` puede ser el recurso inyectado `TimerService` y un método `@Timeout`.
Fundamentalmente, requiere dividir el código en al menos dos partes, lo que es menos trivial cuanto más profundo estés en la jerarquía de llamadas y más atómico deba ser tu proceso.

La naturaleza asíncrona también puede requerir un flujo de comunicación diferente. Si es un usuario quien espera el resultado de la operación, debes
pensar en el mecanismo de feedback (por ejemplo, proporcionar un identificador de seguimiento consultable).

Por la complejidad del cambio, a menudo es óptimo equilibrar
la posibilidad de que `Thread.sleep` afecte la gestión de recursos del contenedor en escenarios de alto tráfico frente al
trabajo y mantenimiento adicional que requiere un modelo asíncrono.
En última instancia, lo mejor es implementar un buen framework para este tipo de procesos y así reducir la complejidad cognitiva y separar responsabilidades.
