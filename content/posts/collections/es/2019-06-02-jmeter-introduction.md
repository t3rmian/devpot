---
title: JMeter — introducción
url: jmeter-introduction
id: 4
category:
  - testing: Pruebas
tags:
  - jmeter
author: Damian Terlecki
date: 2019-06-02T20:00:00
---

JMeter es una herramienta open source en Java que se usa a menudo para pruebas de rendimiento y ver cómo se comporta un sistema bajo carga. Aunque ese es su objetivo principal, en realidad puede usarse para la mayoría de pruebas de sistema como:
- pruebas de funcionalidad;
- pruebas de rendimiento;
- pruebas de carga y estabilidad;
- pruebas de escalabilidad;
- pruebas de regresión.

<img class="uml-bg" src="/img/hq/system-testing.png" alt="Fases de testing" title="Niveles de testing">

El testing de sistema se realiza después de las pruebas unitarias e integración, pero antes de las de aceptación. Suele ser el último paso del equipo de desarrollo/testing. Podrías pensar que no necesitas una herramienta extra para el testing de sistema — y puede que en tu caso sea cierto. Podrías escribir tests durante el desarrollo a nivel de integración con los módulos ya integrados — y también funcionaría. Sin embargo, hay muchos casos donde sería difícil comprobar todos los requisitos sin algún truco.

Aquí es donde JMeter brilla: tienes una herramienta especialmente preparada para este tipo de pruebas. Puedes configurar fácilmente el número de usuarios (hilos) para tus tests. Para hacerlo, haz clic en *Test Plan* con el botón derecho y elige la opción en *Add*. Si necesitas más, puedes definir delays de arranque, ramp-up y qué hacer si un sampler (similar a un test) falla. Para cada hilo puedes elegir varios samplers:
- **HTTP Sampler — simula un usuario visitando un sitio, prueba servicios REST o SOAP;**
- **JDBC Sampler — conecta a una base para verificar datos o ejecutar queries DML (requiere *JDBC Connection Configuration*);**
- JSR223 Sampler — usa scripting (Groovy/BeanShell/JavaScript/…) para la plataforma Java;
- SMTP y Mail Reader Samplers — prueba el servidor SMTP o verifica si llegó el email;
- JMS Samplers;
- TCP Sampler;
- FTP Request;
- JUnit Request;
- …

Para cada sampler puedes añadir (RMB->*Add*) varios tipos de aserciones para verificar los datos:
- Response Assertion — verificación por defecto de la respuesta (headers/body/status) con RegEx;
- JSON Assertion — verifica respuestas JSON usando JSON Path y opcionalmente RegEx;
- JSR223 Assertion — usa scripting para la verificación;
- XPath Assertion — similar a JSON Path pero para XML;
- …

Para casos pequeños, usa las GUI Assertions. Para problemas complejos, si eres dev, seguramente serás más eficiente con *JSR223 Assertion* (aparte de lo tosco de JMeter y el debug limitado). Si no, recomiendo reestructurar los planes de test con *Logic Controllers* (if/while/for) y *Post Processors* (extractores). *Pre* y *Post Processors* pueden usarse en un sampler para ejecutar lógica antes y después de su ejecución.

El resto de cosas que trae JMeter de serie son *Timers, Config Elements y Listener*. Los primeros permiten gestionar el tiempo — parar hilos, pausarlos para agrupar o retrasar para alcanzar el throughput esperado. Los elementos de configuración sirven para definir parámetros, contadores, defaults de requests y conexiones. Los listeners permiten visualizar los resultados.

Por último, algunas cosas que usarás mucho al desarrollar tests:
- Debug Samplers y Debug Post Processors — muestran logs de entrada/salida y valores de variables;
- View Results Tree (*Listener*) — para ver los resultados y logs;
- Summary o Aggregate Report (*Listeners*) — estadísticas de rendimiento;
- User Parameters (*Pre Processor*) o User Defined Variables (*Config Element*) — para definir parámetros (usa `${param_name}` para obtener el valor) o variables.

Además, si necesitas funciones avanzadas, puedes instalar [muchos plugins personalizados](https://jmeter-plugins.org/) o [crear el tuyo](https://jmeter.apache.org/usermanual/jmeter_tutorial.html). Los tests de JMeter pueden ejecutarse manualmente o integrarse en tu CI/automatización y apuntar a varios entornos. Este enfoque da una forma diferente y a veces muy útil de verificar la consistencia de tu sistema entre versiones o configuraciones.
