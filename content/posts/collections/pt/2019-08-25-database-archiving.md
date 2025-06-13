---
title: Arquivamento de banco de dados
url: arquivamento-banco-de-dados
id: 11
category:
- databases: Bancos de Dados
tags:
- oracle
author: Damian Terlecki
date: 2019-08-25T20:00:00
---

Sistemas grandes com alta atividade são propensos a perder desempenho ao longo do tempo. Este é o caso na maioria dos projetos legados, especialmente nos de longa duração com uma grande base de usuários. Não é uma grande descoberta — os dados dos usuários aumentam, o tablespace se expande, o número de entidades infla de alguns milhões para alguns bilhões e o tamanho dos índices cresce. As consultas ao banco de dados (se devidamente indexadas) não demoram tanto para terminar, mas também não é o tempo de seu esplendor. Você poderia até dizer que o sistema se comporta normalmente, mas então chega um dia, os usuários inundam o serviço devido a algum evento chique e... ele engasga.

O arquivamento de banco de dados não é um processo simples. Não é feito da noite para o dia. É uma boa ideia considerá-lo durante a análise do projeto para alcançar um desempenho estável mais tarde. Você também pode querer manter o custo de funcionamento do banco de dados em um nível mais ou menos estável. Se você levar os usuários em consideração, também é melhor minimizar as alterações ou introduzi-las o mais cedo possível. No entanto, quando você está em uma situação em que o aumento de desempenho é necessário para ontem, você tem que escolher entre algumas opções:
- otimizar o código da aplicação;
- otimizar as consultas do banco de dados;
- otimizar a estrutura do banco de dados (índices, partições, tabelas);
- arquivar dados;
- redefinir casos de uso.

Se você considerar o arquivamento de dados, tem ainda duas opções:
- mover dados para fontes e armazenamentos de dados externos;
- arquivamento no banco de dados.
  Note que o arquivamento de banco de dados deve estar altamente conectado com a otimização das estruturas, caso contrário, o ganho de desempenho pode ser mínimo ou até mesmo nulo.

### Movendo dados para outro destino

A opção mais fácil para melhorar o desempenho ou diminuir o tamanho do banco de dados é mover os dados para um lugar diferente. Geralmente, você poderia usar uma tabela de arquivamento que poderia ser posteriormente comprimida para reduzir o tamanho do banco de dados. No entanto, a opção mais popular é movê-lo para um armazenamento diferente ou data warehouse em um estado desnormalizado. Além disso, uma opção válida é remover alguns dados que foram criados por engano.

Tenha em mente, no entanto, que se você já tem alguns índices configurados para sua tabela, a remoção dos registros aumentará efetivamente a fragmentação. Para verificar a fragmentação, você pode consultar o `sys.dm_db_index_physical_stats`. Dependendo do nível de fragmentação, você pode usar um dos dois métodos para corrigi-la:
- fragmentação <5%-10%; 30%) — reorganizar `ALTER INDEX nome_do_indice REORGANIZE;` (sempre online, não disponível com Oracle);
- fragmentação <30%; 100%) — reconstruir `ALTER INDEX REBUILD [ONLINE];`.
  Se você tiver um índice particionado espacial, terá que usar a consulta `ALTER INDEX nome_do_indice REBUILD PARTITION nome_da_particao;`. Para exibir os índices da tabela, chame `SELECT * FROM all_indexes;`, e para verificar os nomes das partições `SELECT * FROM ALL_TAB_PARTITIONS;`.

### Arquivamento no banco de dados Oracle

O Oracle é um dos bancos de dados mais populares. No 12c, o Oracle introduziu um recurso chamado arquivamento no banco de dados. Este é um recurso bastante interessante. Basicamente, você o aplica a uma tabela escolhida e o Oracle cria uma coluna adicional `ora_archive_state` inicializada com o valor 0. Este valor significa que a linha não está arquivada. Definir esta coluna para qualquer outro valor marcará efetivamente a linha como arquivada. A linha arquivada é essencialmente:
- não visível por padrão `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ACTIVE;`
- visível após definir o atributo de sessão `ALTER SESSION SET ROW ARCHIVAL VISIBILITY = ALL;`
- a coluna `ora_archive_state` é adicionada automaticamente às consultas com valor dependendo do valor de visibilidade.

A ativação e desativação do arquivamento no banco de dados é feita usando dois comandos:
```sql
ALTER TABLE nome_da_tabela ROW ARCHIVAL;
ALTER TABLE nome_da_tabela NO ROW ARCHIVAL;
```
Note que a ativação do arquivamento é bem rápida, no entanto, a desativação (que remove a coluna de estado de arquivamento) pode levar até uma hora para tabelas com algumas centenas de milhões de registros. Deixe-me contar outra coisa assustadora. O arquivamento no banco de dados do Oracle ignora quaisquer restrições de chave estrangeira. Na verdade, os registros não estão sendo excluídos, então é um resultado lógico. No entanto, por padrão, os dados arquivados não serão visíveis em sua aplicação e se você tiver quaisquer relações com os registros, poderá se surpreender quando começar a ver **erros internos**.

Este é o momento em que você precisará analisar como suas tabelas estão ligadas e talvez arquivá-las juntas. Esperançosamente, você não está tentando arquivar sua tabela principal, pois elas provavelmente estão ligadas a todas as outras tabelas. É por isso que este processo pode parecer fácil, mas na realidade é bastante complexo. Claro, existe uma opção para acessar esses dados arquivados com o atributo de sessão. Desta forma, é possível manter a visibilidade dos dados arquivados em locais selecionados, alterando a sessão.

Tenha em mente, no entanto, que ao usar qualquer pool de conexões, após fechar a conexão, ela volta para o pool com uma sessão alterada, infectando efetivamente o pool de conexões e tornando o arquivamento sem sentido. Portanto, a abordagem segura seria alterar a sessão de volta antes de fechá-la (desde que a Conexão JDBC não seja compartilhada entre threads, o que geralmente deve ser verdade) ou, ainda mais seguro — preparar uma fonte de dados separada com seu próprio pool de conexões para uso de visibilidade de arquivamento.

### Melhorando o desempenho pós-arquivamento

Você chegou a este ponto? Você arquivou os dados, executou alguns testes de desempenho e viu que não há aumento visível de desempenho? Bem, se você verificar o plano de execução para dados pré e pós-arquivados (arquivo no banco de dados), verá que não há melhoria real. Os dados não foram realmente removidos, e as linhas arquivadas ainda são consideradas durante as varreduras completas. Você também não adicionou a coluna de estado de arquivamento ao índice. Bem, eu não o culpo, dependendo do número de índices e restrições adicionais, pode ser realmente cansativo.

Existe outra maneira de melhorar o desempenho que se adapta especialmente ao arquivamento no banco de dados — particionamento de tabelas. Este recurso é uma faca de dois gumes:
> O particionamento pode melhorar drasticamente o desempenho de uma tabela quando feito corretamente, mas se feito de forma errada ou quando não for necessário, pode piorar o desempenho, até mesmo torná-lo inutilizável. [[severalnines.com]](https://severalnines.com/database-blog/guide-partitioning-data-postgresql)

A razão para isso é que as consultas sobre várias partições tendem a ser mais lentas do que as executadas em um único tablespace. Se você particionar na coluna errada e seus casos de uso típicos ignorarem sua preparação cuidadosa, seu sistema inevitavelmente perderá desempenho. Ao contrário disso, se sua tabela for muito grande em tamanho, os índices também aumentam de tamanho. Será mais difícil carregá-los na RAM. Em tal caso, o particionamento deve diminuir o tamanho do índice para caber mais facilmente na memória.

No caso do arquivamento no banco de dados, `ora_archive_state` é um candidato potencial para uma chave de partição. Na maioria das vezes, você estará consultando dados ativos e não arquivados. O otimizador não deve procurar em partições que não têm informações relevantes. Os componentes do sistema que requerem acesso aos dados arquivados terão um desempenho mais lento. No entanto, indicando corretamente o acesso aos dados antigos na interface, em vez de excluir os dados, os usuários serão mais tolerantes e compreensivos. As partições com registros arquivados poderiam ser ainda mais comprimidas se você não se importar com o desempenho, mas seguir o princípio de que cada byte economizado é um centavo ganho.

Para criar uma tabela particionada na coluna de estado de arquivamento, você pode usar algo como (o uso de subpartições no caso de particionamento por uma coluna diferente também é possível):
```sql
CREATE TABLE nome_da_tabela (
  --...
)
  ROW ARCHIVAL
  ENABLE ROW MOVEMENT
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  );
```

Se você já criou a tabela, mas ela ainda não está particionada, é possível [convertê-la em uma tabela particionada](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/vldbg/evolve-nopartition-table.html#GUID-5FDB7D59-DD05-40E4-8AB4-AF82EA0D0FE5):
```sql
ALTER TABLE nome_da_tabela MODIFY
  PARTITION BY LIST ( ORA_ARCHIVE_STATE )
  (
    PARTITION p0 VALUES ('0'),
    PARTITION p1 VALUES ('1')
  ) [ONLINE];
```

O caso mais complexo é quando a tabela já está particionada. Em tal situação, você tem duas opções:
1. [Particionar uma Tabela Existente usando DBMS_REDEFINITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table)
2. [Particionar uma Tabela Existente usando EXCHANGE PARTITION.](https://oracle-base.com/articles/misc/partitioning-an-existing-table-using-exchange-partition)
