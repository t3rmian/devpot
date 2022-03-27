---
title: Jak zmigrować karty projektu na GitHubie
url: migracja-kart-projektu-github
id: 37
category:
- other: Inne
tags:
  - shell
  - automatyzacja
author: Damian Terlecki
date: 2020-08-23T20:00:00
---

Projekty na GitHubie (nie mylić z repozytoriami), to funkcjonalność, która mimo swej prostoty, pomaga użytkownikom w zarządzaniu i organizacją pracy nad projektami. Głównym narzędziem w tym przypadku jest tablica, na której definiujemy pewne grupy (np. do zrobienia, w trakcie wykonywania, zakończone) zadań, których status następnie możemy śledzić i aktualizować z możliwością uproszczonej automatyzacji w obrębie GitHuba.

GitHub udostępnia 3 typy projektów, na poziomie:
- repozytorium;
- użytkownika;
- organizacji.

Projekty w obrębie organizacji możemy przypisywać do konkretnych repozytoriów. Niestety na poziomie samego repozytorium, opcja ta już nie jest dostępna i 
musimy zdać się na ręczne odtwarzanie.
Co prawda, istnieje funkcja kopiowania projektu, ale ogranicza się ona jedynie do inicjalizacji i odtworzenia grup zadań bez właściwych kart (zadań).

Jeśli projekt jest dosyć pokaźny, to jedną z opcji jest zdanie się na łaskę supportu. Drugim rozwiązaniem jest zaimplementowanie zautomatyzowanej migracji kart pomiędzy projektami. Nie jest to zbyt trudne, gdyż możemy do tego wykorzystać API GitHuba.

## Implementacja

Po pierwsze, konieczne będzie zainicjalizowanie projektu docelowego. Do tego wykorzystamy funkcjonalność kopiowania projektów:

<img src="/img/hq/github-copy-project.png" alt="GitHub – kopiowanie projektu" title="GitHub – kopiowanie projektu">

Następnie musimy stworzyć sobie token do autoryzacji komunikacji z API. Wystarczy standardowy zakres https://github.com/settings/tokens/new?scopes=repo.
Użyjemy go następie przy komunikacji, podając jego wartość w headerze `Authorization: token ${GITHUB_AUTH_TOKEN}`.

Po przejrzeniu [API GitHuba](https://docs.github.com/en/rest/reference/projects) możemy zdefiniować, jak będzie wyglądać migracja kart:
1. Poznanie id projektu źródłowego i docelowego:
  - *GET /orgs/{org}/projects*
  - *GET /users/{username}/projects*
  - *GET /repos/{owner}/{repo}/projects*
2. Znalezienie id kolumn obu projektów:
  - *GET /projects/${project_id}/columns*
3. Wylistowanie kart danej kolumny:
  - *GET /projects/columns/{column_id}/cards*
4. Migracja karty do kolumny projektu docelowego:
  - *POST /projects/columns/{column_id}/cards*
5. Archiwizacja karty (opcjonalnie):
  - *PATCH /projects/columns/cards/{card_id}*

Mając pod ręką narzędzia *bash* i *jq* jesteśmy w stanie zautomatyzować punkty 2-5:

```bash
#!/bin/bash
# A sample script to migrate cards from one project board to another
#  
# 1. The script requires Github auth token for API communication
# https://github.com/settings/tokens/new?scopes=repo
#
# 2. To discover the board ids, you can call the following endpoints with 
# the Authorization and Accept headers used throughout this script:
# GET /orgs/{org}/projects
# GET /users/{username}/projects
# GET /repos/{owner}/{repo}/projects
#
# Bear in mind that the Accept header application/vnd.github.inertia-preview+json
# indicates that the API is in preview period and may be subject to change
# https://docs.github.com/en/rest/reference/projects

GITHUB_AUTH_TOKEN=<YOUR_TOKEN>
SOURCE_PROJECT_ID=<TO_FILL>
TARGET_PROJECT_ID=<TO_FILL>

sourceColumnIds=( $(curl \
  -H "Authorization: token ${GITHUB_AUTH_TOKEN}" \
  -H "Accept: application/vnd.github.inertia-preview+json" \
  https://api.github.com/projects/${SOURCE_PROJECT_ID}/columns | jq .[].id) )
  
targetColumnIds=( $(curl \
  -H "Authorization: token ${GITHUB_AUTH_TOKEN}" \
  -H "Accept: application/vnd.github.inertia-preview+json" \
  https://api.github.com/projects/${TARGET_PROJECT_ID}/columns | jq .[].id) )
  
echo "Source project column ids:"; printf '%s\n' "${sourceColumnIds[@]}"
echo "Target project column ids:"; printf '%s\n' "${targetColumnIds[@]}"

if [ "${#videos[@]}" -ne "${#subtitles[@]}" ]; then
	echo "Different number of columns in between projects"
	exit -1
fi
	
for sourceColumnIndex in "${!sourceColumnIds[@]}"
do
	sourceColumnId=${sourceColumnIds[$sourceColumnIndex]}
	sourceColumnId=${sourceColumnId//[^a-zA-Z0-9_]/}
	targetColumnId=${targetColumnIds[$sourceColumnIndex]}
	targetColumnId=${targetColumnId//[^a-zA-Z0-9_]/}
	curl \
	  -H "Authorization: token ${GITHUB_AUTH_TOKEN}" \
	  -H "Accept: application/vnd.github.inertia-preview+json" \
	  https://api.github.com/projects/columns/${sourceColumnId}/cards \
	  | jq reverse \
	  | jq -c '.[]' \
	  | while read card; do
		note=$(jq '.note' <<< "$card")
		data='{"note":'${note}'}'
		curl \
		  -w 'HTTP Status: %{http_code}' --silent --output /dev/null \
		  -X POST \
	    -H "Authorization: token ${GITHUB_AUTH_TOKEN}" \
		  -H "Accept: application/vnd.github.inertia-preview+json" \
		  -d "${data}" \
		  https://api.github.com/projects/columns/${targetColumnId}/cards
		echo " for card migration: ${note}"
	done
done
```

Skrypt nie wymaga większego wytłumaczenia. *Curla* używamy do wywołania API GitHubowego, *jq* do wyodrębnienia wymaganych danych (id, zawartości karty) z formatu JSON. Warto zwrócić uwagę na odwrócenie zwróconej listy kart, aby uzyskać kolejność chronologiczną w docelowym projekcie.

<img src="/img/hq/github-copy-project-cards.gif" alt="GitHub – migracja kart" title="GitHub – migracja kart">

W tym przypadku punkt 5 został pominięty – jeśli potrzebujesz takiej funkcjonalności to zachęcam do wypróbowania własnej implementacji. Wystarczy wyodrębnić status `archived` i wywołać endpoint z punktu 5. jeśli wartość to `true`.