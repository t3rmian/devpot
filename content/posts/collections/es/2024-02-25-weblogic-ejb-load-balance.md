---
title: WebLogic EJB y balanceo de carga
url: weblogic-ejb-load-balance
id: 125
category:
  - jee: JEE
tags:
  - weblogic
  - performance
author: Damian Terlecki
date: 2024-02-25T20:00:00
---

Recientemente me preguntaron sobre el balanceo de carga de interfaces `@Remote` `@EJB` en WebLogic. ¿Se balancean las interfaces remotas? ¿Depende del contexto? ¿El balanceo ocurre en la invocación o solo en el lookup? ¿Desde el cliente se puede saber qué nodo del clúster procesó la petición? Entender estos conceptos es clave para implementar procesos escalables y eficientes.

## Características de balanceo de carga para EJB stateless remotos

Para responder, primero consultemos [la documentación de WebLogic 14.1.1.0](https://docs.oracle.com/en/middleware/standalone/weblogic-server/14.1.1.0/clust/load_balancing.html#GUID-2470EEE9-F6F9-44EF-BA54-671728E93DE6) (aunque en versiones anteriores es similar). Describe el balanceo de carga para EJB stateless remotos. En resumen, hay dos tipos de conexión:
1. cliente-servidor;
2. servidor-servidor.

Las conexiones e invocaciones cliente-servidor se balancean usando una de tres estrategias: round-robin (por defecto), basada en peso o aleatoria. También se puede desactivar el balanceo en favor de la afinidad de servidor. Con afinidad, sigues sujeto a balanceo solo si usas un URI de clúster en vez de un managed server, y solo al crear un nuevo contexto inicial. Todas estas opciones soportan failover.

Para conexiones servidor-servidor, la afinidad no afecta el balanceo entre servidores. Además, dentro de un clúster, WLS siempre usará el EJB que reside en el mismo nodo que recibió la petición, ya que es más eficiente. Esta "colocación de objetos" hace que usar interfaces `@Remote` dentro de `@EJB` sea subóptimo (serialización innecesaria). Algo similar ocurre con `UserTransaction` y opcionalmente con XA.

<img src="/img/hq/weblogic-cluster-load-balancing.svg" title="WebLogic Remote EJB Load Balancing (simplificado)" alt="WebLogic Remote EJB Load Balancing Chart (simplificado)">

No hay colocación (al contrario: sí hay balanceo) entre clústeres separados, por ejemplo en una configuración multi-tier. Si no quieres colocación, puedes procesar usando destinos JMS balanceados. Otra opción sería hacer proxy del lookup con un classloader personalizado actuando como cliente WLS, pero no es algo probado ni recomendado.

## Saber qué servidor procesó mi petición (cliente)

A veces quieres saber qué servidores procesan ciertas peticiones. Una vez me encontré con un despliegue desincronizado de una nueva versión en un clúster, lo que resultó en respuestas distintas en round-robin. Saber cómo vincular la respuesta con un servidor concreto me permitió resolverlo sin redeploy ni apagar todo el clúster.

Una forma es implementar logs identificables de request/response. ¿Hay algo ad-hoc? Si has trabajado con WLS, sabrás que esa información puede estar en los objetos de la [librería `wlthint3client.jar`](https://docs.oracle.com/en/middleware/fusion-middleware/weblogic-server/12.2.1.4/saclt/wlthint3client.html#GUID-4EB44FDC-51E6-43B0-8963-D1101238CAD9), usada para conectar a WLS y que contiene la lógica de balanceo para el protocolo `t3`.

Pero hay más. Para el balanceo, hay un logger específico que puedes usar. Sin él, tendrías que crear un wrapper personalizado alrededor de las llamadas EJB stub que acceda al estado interno del balanceador.

<img src="/img/hq/weblogic-remote-ejb-stub-cluster-ref.png" title='Evaluación en IntelliJ del nombre WLS que procesó recientemente la invocación "myRemoteRef"' alt="Captura de IntelliJ evaluando el nombre WLS que procesó la invocación EJB">

El logging de *Wlthint3client* usa JUL (Java Util Logging). Para integrarlo con otros frameworks, busca un bridge como `jul-to-slf4j`. Para activarlo, arranca la app con la propiedad JVM `-Dweblogic.debug.DebugLoadBalancing` o hazlo por código para el logger compartido:

<img src="/img/hq/weblogic-debug-load-balancing.png" title="WebLogic DebugLoadBalancing debugger" alt="WebLogic DebugLoadBalancing debugger">

```java
weblogic.diagnostics.debug.DebugLogger
        .getDebugLogger("DebugLoadBalancing")
        .setDebugEnabled(false);
```

Luego configura el nivel de logging y el appender según tu framework. Aquí, el `displayName` es el nombre del logger sin el prefijo `Debug`, es decir, el logger JUL se llama `LoadBalancing`. Así verás logs como:

```plaintext
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1 to 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 6654312976543210890S:10.90.0.5:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls2 to 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3
JUL|FINE|my-exampl-earmy-ejb_jarcom_example_MyBean_MyRemoteBean request routing from 7890564123879561234S:10.90.0.6:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls3 to 8754691235748961325S:10.90.0.4:[7001,7001,-1,-1,-1,-1,-1]:mydomain:wls1
```

Combinado con el nombre del thread y la hora (formato de logging), o cualquier otro contexto, puedes vincular cada request con un proceso de negocio y nodo EJB concreto. Otro logger útil es `DebugFailOver` y, en menor medida, `DebugMessaging`. Este último suele funcionar tras añadir `-Dweblogic.kernel.debug=true` y saca mensajes en consola en formato byte-pretty.
