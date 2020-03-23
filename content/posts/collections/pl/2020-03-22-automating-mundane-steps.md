---
title: Automatyzacja powtarzalnych kroków – Git/GitLab/Jira
url: automatyzacja-powtarzalnych-kroków
id: 26
tags:
  - git
  - jira
  - automatyzacja
  - web services
  - linux
  - shell
  - skrypty
author: Damian Terlecki
date: 2020-03-22T20:00:00
---

Utrzymanie repozytorium gitowego i synchronizacja z systemami zgłoszeniowymi z czasem może stać się całkiem monotonnym zadaniem. Zwłaszcza jeśli aktualizujemy znaczną liczbę zgłoszeń dziennie. W niektórych fazach projektu kroki mogą stać się dosyć powtarzalne. Nawet jeśli aktualizacja statusu zajmuje chwilkę, prędzej czy później, umysłowo zaczyna męczyć. Sprawdźmy więc, jak możemy zautomatyzować ten proces podczas pracy z systemami Git, GitLab i Jira.

Przed tym, warto również wspomnieć, że istnieje wiele rozwiązań integracji GitLaba z Jirą. Zwykle odbywa się to albo poprzez instalację addonu w Jirze, albo na poprzez integracje w GitLabie. Wymaga to pewnych uprawnień administracyjnych, a samo rozwiązanie całkiem dobrze sprawdzi się w przypadku ogólnego zastosowania. Z drugiej jednak strony być może potrzebowalibyśmy czegoś konkretnego, dostosowanego do naszego specyficznego przypadku.

## Przykład

Do automatyzacji posłuży nam uproszczony przypadek użycia, który będzie polegał na zaciągnięciu dodatkowych informacji z merge requesta oraz aktualizacji informacji na Jirze. Zakładając, że merge request został zaakceptowany, jako osoba odpowiedzialna za złączenie kodu (maintainer), będziemy najprawdopodobniej chcieli:
1. Zmergować gałąź, najlepiej z dodatkowym opisem pochodzącym z merge requesta (tytuł/opis) tak, aby dodatkowe informacje były indeksowane podczas używania Gita.
2. Zaktualizować numer wersji kodu na Jirze.
3. Zaktualizować status zgłoszenia.
4. Zmienić osobę przypisaną na Jirze.

Początkowo te cztery kroki nie będą kojarzone z czymś męczącym, a wręcz przeciwnie – z poczuciem postępu i realizacji. Z czasem jednak zmieni się to w **chińską torturę wodną**, przy powtarzaniu ich kilka razy dziennie, codziennie przez kilka miesięcy. Dlaczego więc nie pomóc sobie? Te cztery kroki można zautomatyzować z pomocą API GitLaba i Jiry. Wykorzystamy do tego podstawowe narzędzie cURL, a na sam koniec wszystko ładnie opakujemy w aliasy Gitowe.

## Wymagania i informacje wstępne

Na początek omówmy rzeczy, których będziemy potrzebowali do automatyzacji naszego procesu. Skrypty zostaną napisane w Bashu, ale będą one dość proste, więc nie martw się, jeśli nie znasz zbyt dobrze tej powłoki.

#### cURL

Do komunikacji z API po HTTP/HTTPS użyjemy cURLa. Podstawowa wiedza o tym narzędziu przydaje się w wielu sytuacjach. Jest to jeden z bazowych programów linii poleceń do tego zadania. Jest to jeden z podstawowych programów wiersza polecenia, który pasuje do realizacji tego zadania. Jednocześnie jest to świetne narzędzie do uruchamiania na środowiskach typu *headless* (bez interfejsu graficznego) oraz takich, w których instalowanie zewnętrznych aplikacji wymaga dodatkowych uprawnień.

Najprawdopodobniej masz już zainstalowanego cURLa, ponieważ jest on standardowo dołączany w najnowszych wersjach systemów (np. w systemie Windows 10 od wersji 1803). Jeśli nie, po prostu pobierz go z [curl.haxx.se](https://curl.haxx.se/download.html) lub za pośrednictwem swojego ulubionego menedżera pakietów.

#### Jq

Ponieważ będziemy używać interfejsu REST-owego, którego odpowiedzi zwracane będą nam w formacie JSON, warto wspomnieć o `jq`. Wyodrębnianie wartości szukanego pola z odpowiedzi w formacie JSON, przy użyciu narzędzi takich jak na przykład Grep, jest uciążliwe i podatne na błędy. Jq znacznie upraszcza ten proces, dzięki czemu staje się on (proces) dziecinnie prosty. Narzędzie to możesz zainstalować na:
- Windowsie używający ChocolateY NuGet: `chocolatey install jq`;
- Debianie/Ubuntu poprzez: `sudo apt-get install jq`;
- OS X za pomocą Homebrew: `brew install jq`.

#### GitLab API

GitLab ma bardzo potężne API, które pasuje do wielu przypadków użycia. Do naszego zadania użyjemy punktu końcowego [v4 GET /merge_requests](https://docs.gitlab.com/ee/api/merge_requests.html), w celu pobrania dodatkowego opisu, aby dodać go następnie przy lokalnym mergowaniu gałęzi. Przed tym jednak będziemy musieli utworzyć osobisty token dostępu, który posłuży nam uwierzytelnieniu podczas komunikacji z API GitLabowym.

#### Jira API

Również Jira ma swój własny interfejs, którego użyjemy do aktualizacji informacji o zgłoszeniu. W tym celu skorzystamy z następujących metod:
1. *Add comment* [POST /rest/api/2/issue/{issueIdOrKey}/comment](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-addComment) – aby dodać komentarz z numerem wersji kodu.
2. *Do transition* [POST /rest/api/2/issue/{issueIdOrKey}/transitions](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-doTransition) – w celu zmiany statusu.
  * Get transitions [GET /rest/api/2/issue/{issueIdOrKey}/transitions](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-getTransitions) – uprzednio, aby uzyskać identyfikator docelowego statusu.
3. *Get issue* [GET /rest/api/2/issue/{issueIdOrKey}](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-getIssue) – do uzyskania informacje o osobie zgłaszającej.
4. *Assign* [PUT /rest/api/2/issue/{issueIdOrKey}/assignee](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-assign) – aby przypisać problem z powrotem do autora.

Podobnie będziemy musieli uwierzytelnić się podczas połączenia z API. Możemy to zrobić poprzez *Basic Auth*, podając wartość *nazwa_użytkownika=hasło* zakodowane w formacie **Base64** w nagłówku autoryzacji. Dane można zakodować prz pomocy konsoli w przeglądarce: `btoa('nazwa_użytkownika=hasło')`.

#### Aliasy Git

Aliasy w Gicie to sprytne rozwiązanie upraszczające wywoływanie dowolnych polecenie, szczególnie tych z długą listą parametrów. Aliasy są przechowywane w pliku `.gitconfig`. Plik ten można skonfigurować dla poszczególnego repozytorium bądź też globalnie w katalogu domowym użytkownika (`~/`).

Przykładowo możemy sobie utworzyć skrót do wyświetlenia commitów w niestandardowym formacie `git config --global alias.logf 'log --pretty="format:%H | Author: %an, %aD | Committer: %cn, %cD | %s"''. Dzięki temu, polecenie można wykonać, wywołując alias `git logf`. Dodając przed poleceniem wykrzyknik, możemy stworzyć alias polecenia zewnętrznego (innego niż Gitowe) np.: `git config --global alias.date '!date"''.

Daje nam to szerokie pole do popisu i otwiera drogę do [zaawansowanych aliasów git](https://www.atlassian.com/blog/git/advanced-git-aliases). Możemy to wykorzystać do parametryzacji naszych poleceń w następujący sposób: `!f() { date --date="$1"; }; f'` i wywoływania ich z parametrem np.: `git rdate tomorrow`. W przypadku niektórych dłuższych poleceń konieczne będzie pocięcie uch na linie za pomocą `\` w celu łatwiejszego ich odczytania. Jeśli mamy jednak do czynienia z dość długim skryptem, warto go zapisać w oddzielnym pliku i wykonać przekazując go do powłoki.

## Implementacja

Mając powyższą wiedzę pozostało możemy przejść do implementacji.

#### Dodanie opisu merge requesta z GitLaba

```bash
#!/bin/bash
# Użyj tego skryptu po zmergowaniu, aby dodać dodatkowy opis do merga (tytuł i opis z MR z GitLaba) 
GITLAB_PRIVATE_TOKEN=&lt;your_token&gt;
GITLAB_HOST=https://gitlab.com/ # Or your own host

# Pobranie poprzedniej wiadomości z commita, tj. "Merge remote-tracking branch 'origin/feature'"
MESSAGE="$(git log -1 --pretty=%B)"

# Wydobycie nazwy gałęzi np. "feature"
ISSUE="$(echo $MESSAGE | head -n 1 | cut -d"'" -f 2 | cut -d"/" -f2-)"

# Pobranie tytułu i opisu z pasującego MR na GitLabie, który jest przypisane do Ciebie
DESCRIPTION=$(curl --silent -H "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
${GITLAB_HOST}/api/v4/merge_requests?scope=assigned_to_me&state=opened&source_branch=${ISSUE} | \
jq -r ".[] | (.title + \"\n\" + .description)")

# Pobranie tylko tytułu do następnego skryptu, tytuł powinien zawierać jedneo lub więcej zgłoszeń z Jiry
TITLE=$(curl --silent -H "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
${GITLAB_HOST}/api/v4/merge_requests?scope=assigned_to_me&state=opened&source_branch=${ISSUE} | \
jq -r ".[] | (.title)" | cut -d" " -f1)

# Modyfikacja merge commita ze starą wiadomością i nowym opisem z GitLab
git commit --amend --no-edit -m "${MESSAGE}" -m "${DESCRIPTION}" 

# Wyodrębnienie wersji z poma w korzeniu repozytorium
VERSION=$(grep version "pom.xml" | head -n 2 | tail -n 1 | cut -d">" -f2 | cut -d"<" -f1 )

# Potwierdzenie wywołanie kolejnego polecenia - aktualizacji zgłoszenia na Jirze
read -p "Push and update tracking with git jira-update $VERSION $TITLE? &lt;y/N&gt; " prompt
if [[ $prompt =~ [yY](es)* ]]; then
  git push && git jira-update $VERSION $TITLE
fi
```

#### Aktualizacja informacje na Jirze

```bash
#!/bin/bash
# Ten skrypt doda komentarz do z wersja kodu, zaktualizuje status i przepisze zgłoszenie na autora
if [ "$#" -ne 2 ]; then
	echo "Usage: ./script.sh VERSION SLASH_SEPARATED_ISSUES"
	exit 1
fi

CREDENTIALS=&lt;login_i_haslo_base_64&gt;
JIRA_HOST=&lt;url_do_twojej_jiry&gt;
VERSION=$1
ISSUES=$2

oldIFS=$IFS
export IFS="/"
for ISSUE in $ISSUES; do # Oczekujemy issue-1/issue-2/issue-3

  curl --write-out '%{http_code}' --silent --output /dev/null \
    -H "Authorization: Basic ${CREDENTIALS}" \
    -H "Content-type: application/json" \
    -X POST -d "{\"body\": \"Post review, merged in v${VERSION}\"}" \
    ${JIRA_HOST}/rest/api/2/issue/${ISSUE}/comment

  echo " ${ISSUE} added comment with version ${VERSION}"

  # Sprawdź uprzednio identyfikator statusu docelowego lub zautomatyzuj, w tym przypadku identyfikator to 3
  # curl -H "Authorization: Basic ${CREDENTIALS}" ${JIRA_HOST}/rest/api/2/issue/${ISSUE}/transitions?expand=transitions.fields
  curl --write-out '%{http_code}' --silent --output /dev/null \
    -H "Authorization: Basic ${CREDENTIALS}" \
    -H "Content-Type: application/json" \
    -X POST -d "{\"transition\":{\"id\":\"3\"}}" \
    ${JIRA_HOST}/rest/api/2/issue/${ISSUE}/transitions?expand=transitions.fields

  echo " ${ISSUE} status updated"

  REPORTER=$(curl -s -H "Authorization: Basic ${CREDENTIALS}" \
    ${JIRA_HOST}/rest/api/2/issue/${ISSUE}?fields=reporter | \
    jq -r ".fields.reporter.name")

  curl --write-out '%{http_code}' --silent --output /dev/null \
    -H "Authorization: Basic ${CREDENTIALS}" \
    -H 'Content-Type: application/json' \
    -X PUT -d '{"name": "'${REPORTER}'"}' \
    ${JIRA_HOST}/rest/api/2/issue/${ISSUE}/assignee

  echo " ${ISSUE} reporter changed assignee to ${REPORTER}"

done

export IFS=$oldIFS
```

#### Opakowanie w aliasy Gitowe

Pozostało już tylko zarejestrować aliasy wywołania naszych skryptów w Gicie. Można to zrobić, edytując plik `~/.gitconfig`:
```bash
[alias]
	merge-origin = "!f() { \
		git merge --no-ff origin/$1; \
	}; f"
	merge-update = "!f() { \
	  bash "/sciezka/do/pierwszego/skryptu.sh"; \
	}; f"
	jira-update = "!f() { \
		bash "/sciezka/do/drugiego/skryptu.sh $1 $2"; \
	}; f"
```

Teraz, po zaakceptowaniu merge requesta, możesz wywołać `git merge-origin <gałąź>` (rozwiązać ewentualne konflikty) i `git merge-update`. Spowoduje to scalenie gałęzi z dodatkowymi informacjami z merge requesta **oraz** zostanie zaktualizowany status zgłoszenia na Jirze. Merge request zostanie również automatycznie zamknięty po wypchnięciu zmian do zdalnego repozytorium.

## Podsumowanie

Nawet jeśli podany przykład nie odpowiada przepływowi prac w Twoim przypadku, to ukazuje on ogólne podejście do automatyzacji i posługiwania się cURLem, Jq, Gitem i komunikacją z API GitLaba/Jiru. Być może lektura tego rozwiązania zainspiruje cię do automatyzacji własnych procesów. Kolejnym ciekawym mechanizmem, nad którym warto się pochylić, jest [Git hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks).