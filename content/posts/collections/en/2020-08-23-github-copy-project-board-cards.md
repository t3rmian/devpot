---
title: How to copy project cards on GitHub
url: project-cards-copy-github
id: 37
tags:
  - shell
  - automatyzacja
author: Damian Terlecki
date: 2020-08-23T20:00:00
---

Projects on GitHub (not to be confused with repositories) is a feature that, despite its simplicity, helps users to manage and organize work. The main tool, in this case, is the board on which we define certain task groups (e.g. to-do, in-progress, completed), the status of which can then be tracked and updated with a sprinkle of automation within GitHub.

GitHub provides 3 types of projects, at the level of:
- repository;
- user;
- organization.

We can assign projects within the organization to specific repositories. Unfortunately at the repository level, this option is not available and
we're left with a manual chore.
There is indeed a copy feature, but it is limited to initializing and restoring groups of tasks with the exclusion of cards (tasks).

If the project is quite big, one of the options is to hit the support. The second solution is to implement automated card migration between projects. It is not too difficult as we can use the GitHub API for this.

## Implementation

First, it will be necessary to initiate the target project. For this we will use the copy feature:

<img src="/img/hq/github-copy-project.png" alt="GitHub – project copy" title="GitHub – project copy">

Then we need to create a token to authorize communication with the API. For this, a standard range is enough https://github.com/settings/tokens/new?scopes=repo.
We will then use it, by specifying its value in the header `Authorization: token ${GITHUB_AUTH_TOKEN}`.

After reviewing the [GitHub API](https://docs.github.com/en/rest/reference/projects), we can define what the card migration will look like:
1. Discovering the id of the source and target projects:
  - *GET /orgs/{org}/projects*
  - *GET /users/{username}/projects*
  - *GET /repos/{owner}/{repo}/projects*
2. Finding the column ids of both projects:
  - *GET /projects/${project_id}/columns*
3. Listing cards of a given column:
  - *GET /projects/columns/{column_id}/cards*
4. Migrate the card to the target project column:
  - *POST /projects/columns/{column_id}/cards*
5. Card archiving (optional):
  - *PATCH /projects/columns/cards/{card_id}*

With *bash* and *jq* tools at hand, we can automate points 2-5:

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

The script is more or less self-explainatory. *Curl* is used to call the GitHub API, *jq* to extract the required data (ids, card contents) from the JSON format. It is worth noting that we invert the returned list of cards to obtain the chronological order in the target board.

<img src="/img/hq/github-copy-project-cards.gif" alt="GitHub – project cards copy" title="GitHub – project cards copy">

Point 5 has been omitted in this case – I encourage you to try your own implementation if you need such a feature. Just extract the `archived` status and call the endpoint from point 5 if the value is `true`.