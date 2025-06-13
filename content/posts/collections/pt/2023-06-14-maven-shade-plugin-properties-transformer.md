---
title: PropertiesTransformer do Maven Shade Plugin com exemplos
url: maven-shade-plugin-properties-transformer-exemplos
id: 112
category:
- java: Java
tags:
- maven
- maven-shade-plugin
author: Damian Terlecki
date: 2023-06-14T20:00:00
---

O Maven Shade Plugin é uma extensão que permite combinar dependências durante o processo de construção do projeto. O
propósito deste plugin é criar um único arquivo JAR contendo todas as dependências da aplicação e seu código.

Dentro desse processo, a fusão de arquivos de configuração, como `*.properties`, pode, por vezes, ser problemática. Por padrão, o
último arquivo encontrado prevalecerá no artefato resultante.
O plugin oferece configuração usando os chamados transformadores para resolver tais problemas e influenciar o comportamento da fusão de recursos.

<img src="/img/hq/maven-shade-plugin-properties-transformer.png" title='Maven Shade Plugin reportando sobreposição de recursos' alt='Maven Shade Plugin reportando sobreposição de recursos'>

## Transformador *PropertiesTransformer*

O próprio plugin oferece múltiplos transformadores pré-instalados. Os mais complexos podem ser importados de provedores externos. Desde
a versão 3.2.2, os desenvolvedores também forneceram uma implementação
de `org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer`.
Seu nome pode soar bastante promissor quando você precisa alterar a ordem de combinação de propriedades.
Você pode querer isso para que a aplicação carregue as propriedades preferenciais (geralmente sobrescritas).

Se você der uma olhada no [*PropertiesTransformer*](https://maven.apache.org/plugins/maven-shade-plugin/examples/resource-transformers.html#PropertiesTransformer)
e tentar a configuração de exemplo (referenciada abaixo), pode ter dificuldade para alcançar o resultado esperado.
A explicação das propriedades pode parecer um pouco superficial, por isso é melhor ver o comportamento nos exemplos
([versão 3.4.1](https://github.com/apache/maven-shade-plugin/blob/maven-shade-plugin-3.4.1/src/main/java/org/apache/maven/plugins/shade/resource/properties/PropertiesTransformer.java)).

```xml
<project>
  ...
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-shade-plugin</artifactId>
        <version>3.4.1</version>
        <executions>
          <execution>
            <goals>
              <goal>shade</goal>
            </goals>
            <configuration>
              <transformers>
                <transformer implementation="org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer">
                  <!-- configuração obrigatória -->
                  <resource>configuration/application.properties</resource>
                  <ordinalKey>ordinal</ordinalKey>
                  <!-- configuração opcional -->
                  <alreadyMergedKey>already_merged</alreadyMergedKey>
                  <defaultOrdinal>0</defaultOrdinal>
                  <reverseOrder>false</reverseOrder>
                </transformer>
              </transformers>
            </configuration>
          </execution>
        </executions>
      </plugin>
    </plugins>
  </build>
  ...
</project>
```

Tendo dois arquivos `configuration/application.properties` do módulo A e do módulo B, respectivamente:
```properties
#módulo-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#módulo-b configuration/application.properties
prop2=C
prop3=D
```
o objetivo *shade* do *maven-shade-plugin* com o *PropertiesTransformer* combinando ambas as dependências produzirá o seguinte arquivo `configuration/application.properties` por padrão:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

***


### *ordinalKey* e *defaultOrdinal*

A ordem em que os arquivos serão mesclados é controlada pela `ordinalKey` que aponta para o nome da propriedade
cujo valor é a ordem numérica. Se o arquivo de propriedades não contiver tal chave, sua ordem é definida pela `defaultOrdinal` (0 se ausente).
Ao definir uma ordem maior que a padrão no arquivo do módulo A:

```properties
#módulo-a configuration/application.properties
prop1=A
prop2=B
ordinal=1
```
```properties
#módulo-b configuration/application.properties
prop2=C
prop3=D
```

na saída, você obterá a propriedade `prop2` do módulo A, ou seja, efetivamente alcançando a ordem invertida.
Adicionalmente, o transformador removerá a chave artificial:

```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
prop3=D
```

***

### *alreadyMergedKey*

A `alreadyMergedKey` define um nome de propriedade do tipo `boolean` (por exemplo, uma *String* `true`) que indica a prioridade do arquivo.
Dessa forma, o transformador não mesclará outros arquivos neste.

```properties
#módulo-a configuration/application.properties
prop1=A
prop2=B
already_merged=true
```
```properties
#módulo-b configuration/application.properties
prop2=C
prop3=D
```
Para tais propriedades, você obterá uma cópia das propriedades do módulo A, novamente com a chave sintética `already_merged` removida:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=B
```

A ocorrência de tal chave com um valor `true` em mais de um arquivo não é permitida e resultará em erro.

***


### *reverseOrder*

Você pode usar a opção `reverseOrder` para inverter a ordem de concatenação dos arquivos. Infelizmente, este recurso
não inverte a ordem entre arquivos com o mesmo valor de ordem. Ou seja, para `<reverseOrder>true</reverseOrder>` e dois
arquivos de propriedades:

```properties
#módulo-a configuration/application.properties
prop1=A
prop2=B
```
```properties
#módulo-b configuration/application.properties
prop2=C
prop3=D
```
você ainda obterá (independentemente do valor de `reverseOrder`) o mesmo resultado:
```properties
# Merged by maven-shade-plugin (org.apache.maven.plugins.shade.resource.properties.PropertiesTransformer)
prop1=A
prop2=C
prop3=D
```

A inversão funciona apenas após definir a ordem com `ordinalKey` e apenas entre os arquivos de uma ordem diferente.

***

## Resumo

O `PropertiesTransformer` permite a fusão básica de arquivos de propriedades. Vale a pena saber que os arquivos são inicialmente carregados
usando `java.util.Properties`. Isso significa que duplicatas são sobrescritas com a propriedade mais recente (mais próxima do final) dentro do
mesmo arquivo.

Para determinar a ordem de fusão dos arquivos ou designar um arquivo prioritário entre vários arquivos, você deve incluir uma chave artificial.
Lamentavelmente, inverter a ordem entre arquivos com valores de ordem idênticos ou padrão não é viável.

Portanto, se você precisar de um comportamento de fusão ligeiramente diferente (por exemplo, sem a necessidade de adicionar chaves artificiais), procure por pacotes de add-ons externos com transformadores personalizados.
Você pode facilmente adicionar tal dependência usando a tag `<dependencies></dependencies>` dentro de `<plugin></plugin>`.
Se você simplesmente deseja combinar as propriedades em ordem inversa, dê uma olhada no
[org.kordamp.shade:maven-shade-ext-transformers:1.4.0](https://github.com/kordamp/maven-shade-ext-transformers/tree/v1.4.0).

