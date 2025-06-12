---
title: Prueba de regresión simple de web service con JMeter
url: jmeter-web-service-regression-test
id: 85
category:
  - testing: Pruebas
tags:
  - jmeter
  - servicios web
  # "web services" traducido como "servicios web"
author: Damian Terlecki
date: 2022-05-01T20:00:00
source: https://gist.github.com/t3rmian/293a8933ed0952cb47e22328a5c3ffc0
---

JMeter viene de serie con muchos samplers potentes que nos permiten escribir un plan de pruebas y ejecutarlo en diferentes entornos. Obtener los datos de entrada directamente de la base de datos, que pueden variar entre entornos, simplifica mucho la preparación de los casos de prueba.

Aunque le falta algo de IntelliSense, acostumbrarse a JMeter lleva algo de tiempo. Sin embargo, puedes crear una prueba bastante sencilla que, en muchos casos, te aportará mucho valor. Aquí te muestro cómo preparar una prueba que detecte regresiones en los endpoints de lectura de un web service.

<img src="/img/hq/jmeter-regression-tests/jmeter-regression-test.png" alt="Plan de prueba JMeter" title="Plan de prueba JMeter">

### Regresión en API versionada

En su forma más simple, puedes buscar regresiones comparando las respuestas del web service para el mismo id de recurso. Para esto, necesitarás algunos datos de entrada. Lo más habitual es alimentar estos datos mediante variables de usuario en el Test Plan, un archivo CSV o un sampler JDBC/HTTP.

<figure class="flex">
<img src="/img/hq/jmeter-regression-tests/jmeter-test-plan.png" alt="Variables de usuario en JMeter" title="Variables de usuario en JMeter">
<img src="/img/hq/jmeter-regression-tests/jmeter-jdbc-sampler.png" alt="Sampler JDBC en JMeter" title="Sampler JDBC en JMeter">
</figure>

Teniendo los datos de entrada, simplemente añade el controlador ForEach y dos samplers HTTP para ambas versiones del endpoint de la API. Bajo el primer sampler, añado una Response Assertion que desactiva la comprobación de estado. Esto me permite ignorar el estado de la respuesta y luego confiar en mis propias aserciones. Con un Regular Expression Extractor, extraigo los datos de la respuesta a una variable.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-foreach-controller.png" alt="Controlador ForEach en JMeter" title="Controlador ForEach en JMeter">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-regex.png" alt="Extractor de Expresiones Regulares en JMeter" title="Extractor de Expresiones Regulares en JMeter">
</figure>

En el segundo sampler, reutilizo una Response Assertion y comparo la segunda respuesta con la variable del primer sampler. Esto me ayuda a detectar cualquier cambio en las respuestas entre dos versiones del mismo endpoint. En el View Results Tree, puedo comprobar rápidamente las aserciones fallidas.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-response-assertion.png" alt="Response Assertion en JMeter" title="Response Assertion en JMeter">

No todas las diferencias son regresiones. Esta prueba es válida para optimizaciones de rendimiento. Para cambios funcionales, quizá quieras hacer algunos ajustes para adaptarla a tus necesidades: verifica el código de respuesta en vez de los datos, cambia el alcance del REGEX o usa JSON Extractor para comparar solo las partes relevantes de la respuesta.

### Regresión en API sin versionar

Otro enfoque es comparar los resultados de los samplers guardados en un archivo. Esto es especialmente útil cuando:
- tienes una API sin versionar;
- tus cambios se despliegan tras flags internos;
- o simplemente quieres detectar regresiones aunque no haya cambios externos en el endpoint.

El plan de prueba es muy sencillo si no necesitas postprocesar la respuesta. Usa el View Results Tree para guardar los resultados iniciales en un archivo. Luego, ejecútalo de nuevo tras un despliegue o cambiar el flag y haz un diff entre ambos archivos.

Si quieres la misma lógica de extracción, usa un sampler JSR223 sencillo. En el script muestra la respuesta extraída con la línea `vars["responseV1"]` y añade un View Results Tree bajo este sampler.

<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-save-results-tree.png" alt="View Results Tree en JMeter" title="View Results Tree en JMeter">

Para comparar los contenidos, ejecuta los thread groups consecutivamente (a nivel de Test Plan) para que el archivo se guarde en un grupo y se verifique en otro. Hacer el diff es tan fácil como usar el comando OS Process Sampler `diff` sobre ambos archivos. No olvides configurar el código de retorno esperado. Si prefieres una ruta independiente del sistema operativo, incluye cualquier otro sampler (por ejemplo, un Debug Sampler) con:
- dos preprocessors User Parameters que extraigan el contenido de los archivos a una variable: `${__FileToString(testResults1.xml)}`;
- una Response Assertion que compare ambas variables.

<figure class="flex">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-os-process-sampler.png" alt="OS Process Sampler en JMeter" title="OS Process Sampler en JMeter">
<img loading="lazy" src="/img/hq/jmeter-regression-tests/jmeter-user-parameters.png" alt="User Parameters en JMeter" title="User Parameters en JMeter">
</figure>

El plan descrito se ejecutó en JMeter 5.4.3 con respuestas simuladas por `jwebserver` de Java 18. Puedes encontrar los archivos fuente relevantes al final de la página. Siéntete libre de usarlos como punto de partida para tus propias pruebas de regresión.
