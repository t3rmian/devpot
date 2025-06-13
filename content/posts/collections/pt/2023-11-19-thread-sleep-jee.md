---
title: Usando Thread.sleep em JEE
url: usando-thread-sleep-em-jee
id: 120
category:
- jee: JEE
tags:
- threads
author: Damian Terlecki
date: 2023-11-19T20:00:00
---

O método `Thread.sleep()`, embora pareça uma maneira simples de introduzir um atraso artificial, seu uso é [geralmente desaconselhado em ambientes JEE](https://www.oracle.com/java/technologies/restriction.html#threads).
Ele gerencia diretamente o agendamento de threads, uma tarefa que deveria ser tratada pelo contêiner do servidor de aplicação. Essa interferência pode
atrapalhar a capacidade do contêiner de otimizar a alocação de recursos e o gerenciamento de threads, levando à degradação
do desempenho e a potenciais gargalos. Em cenários de alto tráfego, o contêiner pode ficar sem threads livres, resultando em
atrasos ou falhas no recebimento de uma requisição.

## Timer Service

Uma alternativa compatível com JEE para o `Thread.sleep` é o `TimerService`.
É um conjunto de APIs que permite aos desenvolvedores agendar tarefas para serem executadas
em horários, atrasos ou intervalos específicos.

<img src="/img/hq/thread-sleep-jee.png" alt="Resultados da execução do TimerService de exemplo como alternativa ao Thread.sleep() em JEE" title="Saída do console ao executar o TimerService de exemplo">

Para usar os serviços de timer, você deve injetar o recurso da interface `TimerService` em seu enterprise bean. Em seguida, use o
método `createTimer()` para criar um timer e especificar o tempo de execução ou agendamento desejado. Finalmente, um método anotado com
`@Timeout` implementará o trabalho que deve ser executado após um atraso específico.

Ao chamar o método `createTimer()`, você pode fornecer um parâmetro `Serializable` para ser recuperado do
parâmetro `Timer` no método anotado com `@Timeout` invocando `getInfo()`. Desta forma, você pode passar o progresso do seu trabalho.

Aqui está um exemplo de um método `foo()` e `bar()` com um atraso de 5 segundos entre eles:

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

    public void foo() {/***/} // Isso poderia retornar um ID de rastreamento
    public void bar(MyTimerInfo workProgress) {/***/}
}
```

Além de `createTimer()`, existem métodos mais autodescritivos como `createSingleActionTimer()`, `createIntervalTimer()` e `createCalendarTimer()`.
Sua API espera um parâmetro `Serializable` opcionalmente envolvido em um objeto `TimerConfig` que fornece uma maneira de
alterar a opção `persistent` (verdadeiro por padrão). É uma forma de estender a vida útil de um timer para além da instância atual da JVM.

Observe que para os métodos anotados com `@Timeout`, existem duas restrições significativas:
> A especificação EJB permite apenas que os atributos de transação `RequiresNew` (padrão) ou `NotSupported` sejam especificados para este método.

> O método de timeout não deve lançar exceções de aplicação.

Além disso, descobri que o contêiner pode não invocar os interceptadores na chamada do método `@Timeout` no WebLogic.
Fique atento a isso e a outras características semelhantes do contêiner do seu provedor.

## Resumo

A alternativa compatível com JEE para o `Thread.sleep` pode ser o recurso `TimerService` injetado e um método `@Timeout`.
Fundamentalmente, requer a divisão do código em pelo menos duas partes, o que é menos trivial quanto mais fundo você está na
hierarquia de chamadas e mais atômico seu processo precisa ser.

A natureza assíncrona também pode exigir um fluxo de comunicação diferente. Se for um usuário que aguarda o resultado de tal operação, você deve
pensar no mecanismo de feedback (por exemplo, fornecer um identificador de rastreamento imediato e consultável).

Devido à complexidade (da mudança), muitas vezes é ideal equilibrar
a possibilidade do `Thread.sleep` atrapalhar o gerenciamento de recursos do contêiner em cenários de alto tráfego contra o
trabalho adicional e a manutenção exigidos por um modelo assíncrono.
No final das contas, o melhor é implementar um bom framework para esse tipo de processo para reduzir a complexidade cognitiva e separar responsabilidades.
