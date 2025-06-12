---
title: Pruebas de carga con JMeter
url: load-testing-with-jmeter
id: 12
category:
  - testing: Pruebas
tags:
  - jmeter
  - performance
author: Damian Terlecki
date: 2019-09-08T20:00:00
source: https://github.com/t3rmian/jmeter-samples
---

JMeter es una excelente herramienta de pruebas, especialmente para pruebas de carga. No solo puedes probar el rendimiento de una aplicación o base de datos usando diferentes interfaces, sino que también puedes generar distintos niveles de carga simulando la llegada de usuarios en paralelo. Según el caso, podrías querer probar diferentes situaciones, por ejemplo:
* la carga máxima que el sistema puede soportar;
* cuál componente es el cuello de botella:
    - la base de datos;
    - el backend;
    - un nodo específico en microservicios;
    - el frontend;
* si el sistema es escalable (vertical/horizontalmente);
* si el balanceo de carga funciona correctamente;
* si el sistema está configurado y dimensionado de forma óptima entre los distintos componentes.

### Análisis

Antes de preparar las pruebas, deberías analizar cómo se usa tu sistema y cuáles son los casos de uso más comunes. Es importante recordar las tareas en segundo plano y cualquier método específico que, aunque se use poco, podría hacer que el sistema se atasque bajo carga. El siguiente paso, tras definir qué interfaces probar y su proporción de uso, es planificar la secuencia de ejecución y la duración. Considera elegir un tiempo suficiente para que el recolector de basura se ejecute varias veces. También puede ser útil cierta diversidad para lograr un caso peor para la base de datos o la capa de caché. Por último, el número de hilos (usuarios) en paralelo que golpearán el sistema debe planificarse junto con el incremento de carga.

Algunos temas secundarios a considerar:
* en qué entorno se ejecutarán las pruebas:
    - conexión;
    - hardware;
    - software;
    - configuración;
    - comparación con producción;
* si se necesita un backup;
* si un solo PC podrá generar suficiente carga;
* si todos los involucrados están entrenados y tienen los accesos necesarios;
* qué otras herramientas se necesitan para monitorizar (por ejemplo, Zipkin/Kibana/Nagios);
* cómo se cargará la información de entrada:
    - desde la base de datos durante las pruebas;
    - desde la base de datos al iniciar la prueba;
    - desde un archivo de entrada;
* cuál es el objetivo real;
* cómo analizar los resultados y qué informes crear.

Como ves, hay muchos puntos abiertos que deben aclararse durante el análisis. Un buen plan es esencial para obtener resultados significativos que permitan comparar con pruebas futuras.

### Implementación de ejemplo

Una implementación básica de pruebas de carga incluye los siguientes pasos y elementos:
1. Configurar (opcionalmente parametrizar) la conexión a las interfaces [*Test Plan/User Variables Config/Config Defaults*].
2. Cargar los datos de entrada [*setUp Thread Group*]:
    - desde base de datos [*JDBC Config/Sampler*];
    - desde archivo CSV [*CSV Config*].
3. Preparar los casos de prueba que llaman a las interfaces [*Thread Group*]:
    - aleatorizar los datos de entrada para cada ejecución [*CSV Config/JSR223 Pre Processor*];
    - aleatorizar proporcionalmente qué interfaz llamar [*Controllers*];
    - definir requisitos adicionales:
        - número de hilos para picos cortos [*Timers*];
        - llamadas adicionales esperadas en el escenario [*Samplers*].
4. Añadir una vista agregada para monitorizar la prueba [*Listeners*].

<img src="/img/lazy/jmeter/jmeter-load-tests.jpg" data-src="/img/hq/jmeter/jmeter-load-tests.png" alt="Plan de prueba de carga" title="Plan de prueba de carga">

Cuanto más simples sean las pruebas, más rápido se ejecutarán y mayor carga podrás generar. Además, al simplificarlas, reduces los posibles puntos de fallo. Por ejemplo, en el paso 2, si decides conectar a la base de datos desde las pruebas, aumentas la complejidad y las dependencias. No es recomendable guardar la contraseña de la base de datos en las pruebas, ya que podrías compartirlas para revisión, subirlas al repositorio o dárselas a quienes ejecutarán las pruebas fuera de horario. No todos los que tienen acceso a las pruebas deberían tener acceso a la base de datos. También es posible poner credenciales incorrectas y perder tiempo, especialmente si tienes una ventana limitada para ejecutar las pruebas.

Otro problema puede surgir si quieres generar mucha carga aumentando el número de ejecuciones del plan de pruebas (varias personas/máquinas). Si no sincronizas la consulta a la base de datos para los datos de entrada, la aplicación podría consumir todos los recursos de la base de datos (conexiones). En ese caso, podrías tener timeouts en la fase de set-up, haciendo que los siguientes pasos no sean fiables. Así que, en ese caso, es mejor cargar los datos previamente (por ejemplo, el día anterior). Aunque, si tienes tiempo, puedes probarlo tú mismo.

Para una implementación de ejemplo, revisa las fuentes enlazadas al final. El proyecto tiene una API REST en Spring y algunas pruebas de carga simples. Lee el README para la configuración (el driver de base de datos debe descargarse y ponerse en el classpath de JMeter).

#### Ámbito de variables en JMeter

En JMeter, las variables tienen ámbito por hilo. Esto significa que si cargas los datos en el *setUp Thread Group* no estarán accesibles para los *Thread Groups* responsables de llamar a las interfaces. Por supuesto, puedes poner la lógica de carga dentro de ellos, pero a veces no es viable. Quizá no quieras generar carga artificial en la base de datos durante la prueba. En ese caso, puedes usar propiedades de JMeter, que se comparten entre *Thread Groups*. Para guardar la propiedad en el setUp thread usa:
- función [__setProperty](https://jmeter.apache.org/usermanual/functions.html#__setProperty);
- [JSR223 Sampler](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Post Processor y el objeto JMeterProperties *props* con la interfaz `java.util.Properties` — permite guardar variables de JDBC result set.

Leer estas propiedades es tan simple como usar:
- función [__P](https://jmeter.apache.org/usermanual/functions.html#__P) o [__property](https://jmeter.apache.org/usermanual/functions.html#__property);
- [JSR223 Sampler](https://jmeter.apache.org/usermanual/component_reference.html#JSR223_Sampler)/Pre Processor y el objeto *props*.

Las propiedades también se usan para recuperar parámetros pasados por línea de comandos con el prefijo `-J`, por ejemplo `-Jparameter=value`.

#### Aleatorización de datos

Tras compartir los datos de entrada, puedes aleatorizarlos para cada ejecución y guardar la información necesaria en una variable. Luego estará accesible en el mismo Thread Group usando la sintaxis `${variable_name}` y cada hilo tendrá un input diferente.

```groovy
import java.util.Random; 

Random rand = new Random(); 
def index = rand.nextInt(props.get("resultSet").size());
vars.put("id", props.get("resultSet").get(index).get("USER_ID").toString());
```

También puedes comparar otras formas de generar números aleatorios. Hice algunas pruebas de rendimiento generando y registrando un entero aleatorio. Nota: se ejecutaron de forma rápida y solo son de referencia (10 hilos x 100000 repeticiones):

<table class="rwd">
   <thead>
      <tr>
         <th>Randomizer</th>
         <th>Throughput [execs/sec]</th>
         <th>Note</th>
      </tr>
   </thead>
   <tbody>
      <tr>
         <td data-label="Randomizer">
            java.util.Random
         </td>
         <td data-label="Throughput [execs/sec]">
            10900
         </td>
         <td data-label="Note">
            -
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            java.util.concurrent.ThreadLocalRandom
         </td>
         <td data-label="Throughput [execs/sec]">
            11377
         </td>
         <td data-label="Note">
            Rendimiento similar a java.util.Random, lo que indica que la ejecución ya es thread local en el thread group (no hay ejecución explícita en un pool de hilos dentro del script)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            org.apache.commons.lang3.RandomUtils
         </td>
         <td data-label="Throughput [execs/sec]">
            <span class="color-ok">11704</span>
         </td>
         <td data-label="Note">
            El más rápido por un pequeño margen (1%)
         </td>
      </tr>
      <tr>
         <td data-label="Randomizer">
            <a href="https://jmeter.apache.org/usermanual/functions.html#__Random">__Random</a>
         </td>
         <td data-label="Throughput [execs/sec]">
            <span class="err">5065</span>
         </td>
         <td data-label="Note">
            El doble de lento que el resto
         </td>
      </tr>
    </tbody>
</table>

Como ves, cualquiera de los tres primeros métodos es válido. No recomiendo usar *__Random* porque es muy lento. Sin embargo, hay otras funciones útiles como [__RandomString](https://jmeter.apache.org/usermanual/functions.html#__RandomString), [__RandomDate](https://jmeter.apache.org/usermanual/functions.html#__RandomDate), [__time](https://jmeter.apache.org/usermanual/functions.html#__time), [](https://jmeter.apache.org/usermanual/functions.html#__UUID) y [__threadNum](https://jmeter.apache.org/usermanual/functions.html#__threadNum) para generar datos dummy. También puedes inyectar código Groovy usando [__groovy](https://jmeter.apache.org/usermanual/functions.html#__groovy).

### Incrementando la carga

Al parametrizar la carga y la cantidad objetivo de peticiones por segundo, conviene anotar algunas propiedades de configuración de los componentes bajo prueba. En el caso de la base de datos, el número máximo de conexiones. Para los servidores, el número de peticiones en paralelo y el tamaño de la cola. Multiplica eso por el número de nodos y deja un margen de seguridad.

Como se mencionó antes, aumentar la carga es tan simple como aumentar el número de usuarios. Según tu máquina y la implementación de la prueba, podrás configurar unos 5000 hilos en paralelo. Sin embargo, llega un punto en que el overhead de crear más hilos reduce el rendimiento, incluso pudiendo congelar la máquina de pruebas. Si tienes un sistema multinodo de alto rendimiento, puede que no sea suficiente para alcanzar el límite máximo de carga. Además, es difícil estimar el número de ejecuciones por unidad de tiempo según el número de usuarios. Por defecto, cada hilo envía una petición y espera la respuesta.

<img class="uml-bg" src="/img/hq/load-tests-client-server-client.svg" alt="Comunicación cliente-servidor por defecto" title="Comunicación cliente-servidor por defecto">

Si configuras un timeout de respuesta, puedes saltarte la espera y lanzar la siguiente petición más rápido. El problema es que pierdes la posibilidad de monitorizar las respuestas y sus estados. Es válido si tienes otras herramientas para monitorizar la carga. Si pones un timeout muy bajo, te recomiendo dejar un thread group sin configurar para comprobar el estado. Podrías estar bloqueado por un firewall y no darte cuenta, especialmente si las herramientas de monitorización no muestran datos en tiempo real.

<img class="uml-bg" src="/img/hq/load-tests-client-server.svg" alt="Comunicación cliente-servidor con timeout rápido" title="Comunicación cliente-servidor con timeout rápido">

Por último, considera la conexión. En red local, normalmente tendrás tiempos bajos para llegar al servidor. Si el entorno objetivo está en internet o solo accesible por VPN, las pruebas serán más lentas y generarán menos carga. No olvides el ancho de banda, que suele ser el factor limitante.

### Resumen

JMeter es una buena herramienta para pruebas de carga, pero debe combinarse con herramientas de monitorización. Hay muchos aspectos a considerar para que las pruebas sean útiles. Cada punto debe analizarse en la preparación. Tras una ejecución exitosa, toca analizar y preparar los informes. Es esencial para definir los siguientes pasos y el SLA.

No olvides revisar el proyecto de ejemplo. Puedes experimentar con los valores por defecto del thread pool de Tomcat, tamaño de la cola, pool de conexiones H2 y timeouts. Temas como cargar datos desde CSV/base de datos, ámbito de variables e incremento de carga también están cubiertos allí.
