---
title: Wywoływanie smoke testów za pomocą akcji GitHub
url: testy-github-akcje
id: 27
tags:
  - git
  - automatyzacja
  - web services
  - graphql
  - ci
  - testy
author: Damian Terlecki
date: 2020-04-05T20:00:00
source: https://github.com/t3rmian/devpot/blob/3702a2424b9db457ceec31a29645a32f621ec257/.github/workflows/smoke-tests.yml
---

Ostatnio, po przypadkowym uszkodzeniu funkcji wyszukiwania na moim blogu, postanowiłem zacząć dodawać automatyczne testy dla mojej strony. Od czasu do czasu lubię dodawać zmiany bezpośrednio za przez GitHuba. Z tego też powodu bardzo polubiłem podglądy wdrożeń Netlify. Doszedłem do wniosku, że idealnym rozwiązaniem byłoby, uruchamianie testów automatycznych na takim środowisku w celu szybkiej oceny sytuacji i zdalnej weryfikacji błędów, bez konieczności uruchamiania własnego środowiska.

Poniższy schemat pokazuje, co dokładnie mam na myśli:

<img src="/img/hq/github-akcje-netlify.svg" alt="Automatyzacja przepływu pracy" title="Automatyzacja przepływu pracy">

## Statusy i notyfikacje Netlify

Jedną z głównych zalet Netlify jest to, że zapewnia funkcjonalność podglądów naszej strony, zanim zmiany zostaną scalone z główną gałęzią. Możemy włączyć takie podglądy w konfiguracji projektu. Dla każdego pull requesta (bądź jego aktualizacji) otrzymamy URL do "testowego środowiska". Nasza strona będzie miała wyłączone indeksowanie, więc jeśli jakiś robot jakimś cudem zawita na testową stronę, nie wpłynie to na ranking wyszukiwania.

<img src="/img/hq/netlify-deploy-previews.png" alt="Podglądy wdrożeniowe Netlify" title="Podglądy wdrożeniowe Netlify"/>

Domyślnie Netlify przy okazji weryfikuje kilka rzeczy (nagłówki, przekierowania, sprawdzanie poprawności zawartości mieszanej http/https) i wysyła aktualizacje z powrotem do GitHuba za pomocą API.
Najważniejsza rzecz, jaka nas interesuje, to aktualizacje statusu commitów.

Na każdą aktualizację pull requesta przypadać będą najczęściej dwie takie aktualizacje statusu. Pierwsza to informacja o wystartowaniu wdrożenia, a druga to natomiast rezultat wdrożenia (powodzenie lub niepowodzenie). Jest to bardzo dobre miejsce do rozpoczęcia akcji GitHubowej, która zainicjuje nam smoke testy / testy końcowe.


<img src="/img/hq/netlify-notifications.png" alt="Powiadomienia Netlify" title="Powiadomienia Netlify"/>

## Akcje GitHub

Stworzenie akcji GitHub jest dosyć proste. Możemy to zrobić albo poprzez interfejs użytkownika na stronie (pozwala na weryfikację poprawności formatowania) bądź po prostu tworząc plik w repozytorium, np.: `.github/workflows/smoke-tests.yml`.

### Wyzwalanie

Ponieważ Netlify publikuje aktualizację statusu dla naszego commita, będziemy nasłuchiwać na zdarzeniu `status`:

```yml
name: Smoke testy

on:
  status
```

Jest to jednak kłopotliwe, ponieważ:
> Note: This event will only trigger a workflow run if the workflow file is on the master or default branch.

Co więcej, `$GITHUB_SHA` będzie odnośnikiem do ostatniego commita w domyślnej gałęzi. Nie do końca tego oczekujemy. Będziemy potrzebować odniesienia do ostatniego commita z powiązanego pull requesta, aby dodać własny status do testów, a także odniesienia do testowego scalenia obu gałęzi do pobrania scalonego kodu. Wrócimy do tego nieco później.

W tym momencie ważne jest zadanie sobie jednego pytania. Jeśli zaktualizujemy status akcją wywoływaną przez zmianę statusu, czy nie stworzymy przez to zapętlenia? Na szczęście sprawa ta została [uwzględniona](https://help.github.com/en/actions/reference/events-that-trigger-workflows#triggering-new-workflows-using-a-personal-access-token) przez zespół GitHub, dzięki czemu możemy spać spokojnie.

### Serwis Selenium

Niczym dziwnym nie będzie to, że wykorzystamy Selenium do przeprowadzenia naszych testów. Aby uprościć konfigurację, serwer Selenium ustawimy jako usługę, dzięki czemu nie będziemy musieli się martwić instalacją przeglądarki i innymi zależnościami.

```yml
jobs:
  test:

    runs-on: ubuntu-latest
    
    services:
      selenium:
        image: selenium/standalone-chrome
        ports:
          - 4444:4444
        options: -v /dev/shm:/dev/shm
```

Koniecznie musimy użyć parametru `-v /dev/shm:/dev/shm`, w przeciwnym przypadku, jest wielce prawdopodobne to, że przeglądarka będzie się zamykać ze względu na problemy z brakiem pamięci. Ponieważ nasze główne zadanie nie będzie uruchamiane w kontenerze, musimy również zmapować port kontenera na port samej maszyny. _4444_ jest w tym przypadku domyślnym portem dla serwera Selenium.

### Utworzenie statusu PENDING

Pierwszy krok rozpoczyna się od utworzenia statusu `pending` dla najnowszego commita z pull requesta. Będzie to wyzwolone również zdarzeniem aktualizacji status utworzonym przez Netlify. Więcej informacji na temat tego interfejsu można znaleźć w [dokumentacji API](https://developer.github.com/v3/repos/statuses/).

```yml
    steps:
    - name: Utworzenie statusu PENDING
      if: ${{ github.event.state == 'pending' }}
      run: >-
        curl --location --request POST
        'https://api.github.com/repos/${{ github.repository }}/statuses/${{ github.event.commit.sha }}'
        --header 'Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}'
        --header 'Content-Type: application/json'
        --data-raw '{
        "state": "pending",
        "target_url": "https://github.com/${{ github.repository }}/actions?query=workflow%253A%22${{ github.workflow }}",
        "context": "${{ github.workflow }}",
        "descrption": "Waiting for deployment."
        }'
```

W docelowym adresie URL ustawimy link do akcji GitHubowych z pasującą nazwą.

### Powiązanie commita z pull requestem

Ponieważ nasza akcja jest uruchamiana w kontekście zdarzenia `status`, nie mamy dostępu do informacji o pull requeście. Niemniej jednak możemy pobrać takie informacje za pomocą API GitHuba. Najprostszym sposobem jest użycie interfejsu GraphQL. Upraszczając nieco – istnieje akcja `octokit/graphql-action@v2.x`, która ułatwia wywołanie punktu końcowego i zapisanie rezultatu w zmiennej wyjściowej.

Bawiąc się [GitHubowym Exploratorem API GraphQL](https://developer.github.com/v4/explorer/), dosyć szybko możemy utworzyć zapytanie zwracające numer pull requesta.

Odtąd, kolejne kroki będziemy również wykonywać w przy założeniu, że status zdarzenia to `succes`, ponieważ oczekujemy, że wdrożenie zakończyło się bez problemów i przygotowujemy się do uruchomienia testów.

```yaml
    - name: Pobierz numeru PR
      uses: octokit/graphql-action@v2.x
      if: ${{ github.event.state == 'success' }}
      id: get_pr_number
      with:
        query: |
          query getPRMergeSha($sha: String, $repo: String!, $owner: String!) {
            repository(name: $repo, owner: $owner) {
              commit: object(expression: $sha) {
                ... on Commit {
                  associatedPullRequests(first:1) {
                    edges {
                      node {
                        number
                      }
                    }
                  }
                }
              }
            }
          }
        owner: ${{ github.event.repository.owner.login }}
        repo: ${{ github.event.repository.name }}
        sha: ${{ github.event.commit.sha }}
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Pozostało jedynie wyodrębnić tę liczbę z danych w formacie JSON przy użyciu narzędzia `jq`. Możemy odwoływać się do danych pobranych w poprzednim kroku, używając składni: `${{ steps.&lt;step_id&gt;.outputs.&lt;variable&gt; }}`:

```yaml
    - name: Wyodrębnij numer PR
      if: ${{ github.event.state == 'success' }}
      id: extract_data
      env:
        JSON_DATA: ${{ steps.get_pr_number.outputs.data }}
      run: |
        PR_NUMBER=$(echo "${JSON_DATA}" | jq '.repository.commit.associatedPullRequests.edges[].node.number')
        echo "::set-output name=pr_number::${PR_NUMBER}"
```

Odwrotnie, użyjemy `echo &quot;::set-output name=&lt;variable_name&gt;::&lt;value&gt;"` do ustawienia takiej zmiennej.

### Zaciągnięcie kodu i wykonanie testów

Mając pod ręką numer pull requesta jesteśmy w stanie utworzyć referencję do merge commita. Taki commit jest tylko zatwierdzeniem testowym i nie znajdziemy go na lokalnej gałęzi. Tu znowu pomożemy sobie akcją `action/cehckout@v2`:

```yml
    - name: Checkout
      uses: actions/checkout@v2
      if: ${{ github.event.state == 'success' }}
      with:
        ref: refs/pull/${{ steps.extract_data.outputs.pr_number }}/merge
```

Pozostała część polega na zainstalowaniu zależności projektowych i uruchomieniu testów. Netlify zapisuje adres URL wdrożenia pod zmienną `target_url` w danych związanych ze zdarzeniem `status`.

```yml
    - run: yarn install
      if: ${{ github.event.state == 'success' && steps.yarn-cache.outputs.cache-hit != 'true' }}
    - run: yarn test-ci
      if: ${{ github.event.state == 'success' }}
      env:
        SITE_URL: ${{ github.event.target_url }}
```

Dla zobrazowania, do swoich testów używam frameworków WebDriverIO i Cucumber. Podczas inicjowania testów pobieram adres URL witryny za pomocą zmiennej środowiskowej: `process.env.SITE_URL`.

### Aktualizacja statusu

Ostatecznie, aby zaktualizować status commita, tak abyśmy mogli go zobaczyć na stronie z pull requestem, ponownie wywołamy API statusowe GitHuba. W tym samym kontekście ustawiamy stan na sukces lub porażkę, w zależności od rezultatu naszych testów.

```yml
    - name: Create FINISHED status
      if: ${{ github.event.state == 'success' || failure() }}
      run: >-
        if [ ${{ job.status }} == Success ]; then echo success; else echo failure; fi | xargs -I{status}
        curl --fail --location --request POST
        'https://api.github.com/repos/${{ github.repository }}/statuses/${{ github.event.commit.sha }}'
        --header 'Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}'
        --header 'Content-Type: application/json'
        --data-raw '{
        "state": "{status}",
        "target_url": "https://github.com/t3rmian/devpot/actions?query=workflow%253A%22${{ github.workflow }}",
        "context": "${{ github.workflow }}",
        "descrption": "Finished smoke tests!"
        }'
```

Teraz możemy cieszyć się zautomatyzowaną notyfikacją:

<img src="/img/hq/github-commit-status.png" alt="Własny status zatwierdzenia" title="Własny status zatwierdzenia"/>

## Wskazówki

Informacje o oprogramowaniu zainstalowanym na GitHubowych środowiskach wirtualnych, można znaleźć w [tym repozytorium w kolumnie "Included Software"](https://github.com/actions/virtual-environments).

Za pomocą akcji `action/setup-node@v1` możemy skonfigurować konkretną wersję NodeJS, a dzięki `peter-evans/commit-comment@v1` jesteśmy w stanie zastąpić status prostym komentarzem:

```yml
    - name: Utworzenie komentarza PENDING
      uses: peter-evans/commit-comment@v1
      with:
        sha: ${{ github.event.commit.sha }}
        body: Wdrożenie podglądowe wystartowało, oczekiwanie na zakończenie w celu rozpoczęcia testów...
    - name: Use Node.js 10.x
      uses: actions/setup-node@v1
      with:
        node-version: 10.x
```

Aby wyświetlić zawartość zmiennych GitHuba, użyj:

```yml
    - name: Wyświetl kontekst GitHubowy
      env:
        GITHUB_CONTEXT: ${{ toJson(github) }}
      run: echo "$GITHUB_CONTEXT"
```

Na potrzeby testowania API np. w Postmanie wystarczy przełączyć się z autoryzacji tokenowej na Basic Auth.