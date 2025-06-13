---
title: Dicas sobre o Filtering Classloader do WebLogic
url: weblogic-conflitos-bibliotecas
id: 92
category:
- jee: JEE
tags:
- classloading
- weblogic
author: Damian Terlecki
date: 2022-08-07T20:00:00
---

Se você está procurando uma maneira de fazer o WebLogic carregar uma versão específica de dependências empacotadas com sua aplicação, aqui estão algumas dicas
para manter sua sanidade:
1. O WebLogic, como um servidor de aplicações, vem com muitas bibliotecas que você também pode estar usando em sua aplicação (possivelmente versões diferentes delas).
2. O WebLogic segue a delegação padrão para o pai durante o carregamento de classes. A classe solicitada é primeiro procurada (preferida) pelo sistema, depois pelo
   carregador de classes pai e, por fim, pelo da aplicação.
3. O Filtering Class Loader é um recurso no WebLogic que permite ao implantador influenciar este processo e inverter algumas partes dele. Com isso, você pode alcançar
   um carregamento semelhante ao do Tomcat.

Você pode usar o filtering class loader ao implantar uma aplicação WAR ou uma aplicação EAR. Dois descritores diferentes são usados dependendo do
tipo de arquivo:
- weblogic-application.xml (EAR);
- weblogic.xml (WAR).

## Descritor EAR

Para um descritor EAR, você encontrará uma definição de esquema XML correspondente com base na [lista de versões de esquema](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-application/index.html).
Substitua o mapeamento `xsi:schemaLocation` por uma versão correspondente ao seu WLS. Agora, passando para o descritor,
as configurações importantes são `prefer-application-packages` e `prefer-application-resources`.

A primeira é usada para configurar classes que devem
ser carregadas de sua aplicação em vez dos módulos do WLS. A segunda propriedade pode ser usada para recursos que não são classes, como arquivos de configuração do service loader.

Abaixo você pode ver como sobrescrever o pacote `commons-io:commons-io` que é empacotado com o WLS 12.1.3 (*wlserver/<wbr>modules/<wbr>features/<wbr>weblogic.server.merged.jar*),
bem como uma implementação de provedor para o JAX-RS (WLS 12.2) com os da aplicação:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-application
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-application"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-application http://xmlns.oracle.com/weblogic/weblogic-application/1.8/weblogic-application.xsd">

    <prefer-application-packages>
        <package-name>org.apache.commons.io.*</package-name>
    </prefer-application-packages>
    <prefer-application-resources>
        <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
    </prefer-application-resources>

</weblogic-application>
```

A localização correta para este descritor é `EAR/META-INF/weblogic-application.xml`. Por padrão, se você colocá-lo em `src/main/application/META-INF/weblogic-application.xml`,
o `maven-ear-plugin` o incluirá no diretório mencionado. Caso contrário, a propriedade de configuração `earSourceDirectory` do plugin define o local onde você deve colocar o diretório `META-INF`.

## Descritor WAR

A localização do esquema para o `weblogic.xml` também é [específica para a versão do WLS](https://www.oracle.com/webfolder/technetwork/weblogic/weblogic-web-app/index.html).
Note que desde o WLS 12.1.3, há também um deslocamento de versão em comparação com o descritor EAR.
Embora o esquema seja diferente, a configuração é semelhante à anterior:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-application-packages>
            <package-name>org.apache.commons.io.*</package-name>
        </prefer-application-packages>
        <prefer-application-resources>
            <resource-name>META-INF/services/javax.ws.rs.ext.RuntimeDelegate</resource-name>
        </prefer-application-resources>
    </container-descriptor>
</weblogic-web-app>
```

Desta vez, o descritor deve ir para `WAR/WEB-INF/weblogic.xml`. Com o `maven-war-plugin`, ele será pego por padrão de `src/main/webapp/WEB-INF/weblogic.xml`.

Uma configuração adicional é possível com a implantação WAR. Suponha que você tenha versões de classe conflitantes entre as classes do seu pacote e as dependências.
Nesse caso, você pode forçar o carregador de classes a preferir suas classes em vez das classes das dependências ou do WLS:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<weblogic-web-app
        xmlns="http://xmlns.oracle.com/weblogic/weblogic-web-app"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://xmlns.oracle.com/weblogic/weblogic-web-app http://xmlns.oracle.com/weblogic/weblogic-web-app/1.7/weblogic-web-app.xsd">

    <container-descriptor>
        <prefer-web-inf-classes>true</prefer-web-inf-classes>
    </container-descriptor>
</weblogic-web-app>
```

Combinar esta opção com `prefer-application-packages`/`prefer-application-resources` não é válido.

## Solução de problemas

Você pode se perguntar se as classes/recursos corretos estão sendo carregados adequadamente durante a execução.
Muitas vezes, uma indicação clara de conflito é a exceção `java.lang.NoSuchMethodError`.
Ela aparece durante a execução, sinalizando que a classe carregada está sem a assinatura do método referenciado.
Outros erros menos comuns incluem:
- `java.lang.AbstractMethodError`;
- `java.lang.IllegalAccessError`;
- `java.lang.IncompatibleClassChangeError`;
- `java.lang.NoSuchFieldError`;
- `java.lang.NoSuchMethodError`.

Você pode encontrar uma lista completa deles na árvore de exceções que herdam de `java.lang.LinkageError`.

Às vezes, não há um erro claro, mas você pode não ter certeza da origem das classes.
Nesse caso, você pode descobrir rapidamente a origem, por exemplo:
- `Thread.currentThread().getContextClassLoader().loadClass("org.apache.commons.io.IOUtils").getProtectionDomain().getCodeSource().getLocation();`
- `Thread.currentThread().getContextClassLoader().getResource("META-INF/services/javax.ws.rs.ext.RuntimeDelegate").getPath());`

### Compatibilidade e conflitos

Na maioria das vezes, as bibliotecas do WLS virão do diretório `/oracle_common/modules`, onde você pode verificar a versão com base no nome do JAR.
Se não houver sufixo de versão, você pode abrir o arquivo e procurar pelo manifesto META-INF ou metadados do Maven.

Para descobrir a compatibilidade de fonte/binário, existe o JAPICC `japi-compliance-checker` – uma ferramenta popular que você pode instalar com o gerenciador de pacotes do seu sistema
e obter mais informações sobre possíveis problemas de vinculação.

Caso contrário, existe uma ferramenta específica do WLS chamada CAT (Classloader Analysis Tool).
Como uma aplicação web, ela é empacotada com a instalação completa do WLS e, por padrão, implantada sob o contexto `/wls-cat`.

<img src="/img/hq/wls-cat-conflicts.png" alt="WLS CAT – conflitos de classes" title="WLS CAT – conflitos de classes">

Selecione sua aplicação na árvore à esquerda e, em seguida, vá para a guia 'Analyze Conflicts' para verificar pacotes potenciais que estão em conflito,
bem como as soluções sugeridas. Após configurar a filtragem, a lista deve ficar mais curta. Pressione atualizar e vá para a 'Classloader Tree' para verificar a filtragem.
Conflitos nas classes e dependências diretas de EJB/WAR devem ser detectados corretamente.

<img src="/img/hq/wls-cat-classloaders-hierarchy.png" alt="WLS CAT – FilteringClassLoader" title="WLS CAT – FilteringClassLoader">

Embora também pareça haver um carregador de classes de filtragem separado para as implantações de EJB autônomas, não encontrei
uma maneira limpa de configurá-lo. Nem os descritores `weblogic-application.xml` nem `weblogic.xml` se encaixam aqui, nem o '-ejb' tem tal propriedade de configuração.
Assim, sugiro simplesmente envolver o módulo EJB em um EAR neste caso.

### Suporte ao Java 9

Por último, em versões antigas do WLS, você pode encontrar o seguinte erro:

> java.lang.UnsupportedClassVersionError: module-info has been compiled by a more recent version of the Java Runtime (class file version 53.0), this version of the Java Runtime only recognizes class file versions up to 52.0

Algumas bibliotecas adicionaram suporte para o encapsulamento de módulos do Java 9. Mesmo que a biblioteca possa ser executada no Java 8, ela é acompanhada por um `module-info`, geralmente na raiz da biblioteca ou no diretório `META-INF/versions`.
No caso do WLS, isso pode causar erros em tempo de execução, pois o arquivo é compilado para o Java 9:
- causado pela varredura CDI padrão configurável por `beans.xml`;
- impede a varredura do CAT.

A abordagem mais direta é removê-lo da biblioteca, por exemplo, usando o plugin `truezip-maven-plugin` durante uma fase relevante.
Dê uma olhada na seguinte configuração que remove arquivos incompatíveis para o *log4j* empacotado dentro de um WAR rodando em um WLS com Java 8:

```
      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>truezip-maven-plugin</artifactId>
        <version>1.2</version>
        <executions>
          <execution>
            <id>remove-log4j2-java9-meta</id>
            <goals>
              <goal>remove</goal>
            </goals>
            <phase>package</phase>
            <configuration>
              <filesets>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-api-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
                <fileset>
                  <directory>
                    ${basedir}/target/${project.build.finalName}.war/WEB-INF/lib/log4j-core-${log4j.version}.jar
                  </directory>
                  <includes>
                    <include>META-INF/versions</include>
                  </includes>
                </fileset>
              </filesets>
            </configuration>
          </execution>
        </executions>
      </plugin>
```

Se o CAT não mostrar a localização do module-info incompatível no stacktrace, basta usar `grep` em todos os jars no diretório "explodido".
Embora os jars sejam arquivos binários, você geralmente deve obter algumas correspondências válidas. Se não, use a ferramenta Java padrão `jar`: `jar tf <JAR> | grep module-info`.
