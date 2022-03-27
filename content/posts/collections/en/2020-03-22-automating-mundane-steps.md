---
title: Automating mundane steps in Git/GitLab/Jira
url: automating-mundane-steps
id: 26
category:
  - other: Misc
tags:
  - git
  - jira
  - automation
  - web services
  - linux
  - shell
author: Damian Terlecki
date: 2020-03-22T20:00:00
---

Maintaining a git repository and keeping it in sync with issue tracking and project management systems can become a mundane task. Especially if you're processing a considerable amount of tickets per day. In some phases of the project, your steps might become quite repetitive. Even if they take a minute to do, sooner or later, it will mentally wear you down. Let's take a look at how could we automate this process when working with Git, GitLab and Jira systems.

Of course, there are multiple solutions for integrating GitLab with Jira. It's usually done either through Jira add-on or [GitLab Integrations](https://docs.gitlab.com/ee/user/project/integrations/jira.html) page. You would need to have some administrative rights to set it up, and the solution will be feasible for a general use case. On the other hand, maybe you would want something specific, tailored to your needs.


## Example

The simplified use case that we will consider for automation will consist of merging a pull request and updating the information in the Jira. Assuming that the pull request has been accepted after the code review, as a maintainer you would probably like to:
1. Merge the branch, preferably with merge request title in the description so that it's the additional info is indexable when using git.
2. Update the Jira ticket with the revision number.
3. Update the status.
4. Change the assignee.

Initially, these four steps do not look like an excessive amount of work, and you might even feel some kind of accomplishment. Over time, however, this will turn into **Chinese water torture** if you have to do them several times a day, every day, for a few months. So why not help yourself? These four steps can be automated with GitLab and Jira API with the use of tools like cURL, nicely wrapped in a Git aliases.

## Prerequisites

Let's go over some things we would need for automating our process. The scripts will be written in Bash, but they will be quite simple, so don't worry if you're not too familiar with this shell.

#### cURL

To communicate with API over HTTP/HTTPS we will use cURL. The basic knowledge of this tool comes handy in many situations. It is one of the basic command-line programs that suit this task. It is also the go-to tool for operating from headless systems or other environments where installing sophisticated applications require additional permissions.

Most likely you already have the cURL installed as it comes preinstalled on the most modern systems (e.g. with Windows 10 since version 1803). If not, just get it from [curl.haxx.se](https://curl.haxx.se/download.html) or through your favorite package manager.

#### Jq

Since we will be using some RESTful API that responds in JSON format it's crucial to mention the `jq`. Extracting values from JSON properties using tools like Grep is cumbersome and error-prone. Jq greatly simplifies this process making it a child's play. You can install it on:
- Windows using ChocolateY NuGet: `chocolatey install jq`;
- Debian/Ubuntu: `sudo apt-get install jq`;
- OS X using Homebrew: `brew install jq`.

#### GitLab API

GitLab has a very powerful API that will suit multiple use cases. We will use [v4 GET /merge_requests](https://docs.gitlab.com/ee/api/merge_requests.html) endpoint to fetch additional description to add it when merging the branch locally. But before that, we will need to create a [personal access token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#creating-a-personal-access-token) to authenticate with GitLab API.

#### Jira API

Jira also has its own API and we will use it to update the ticket information. For this, we will use multiple endpoints:
1. Add comment [POST /rest/api/2/issue/{issueIdOrKey}/comment](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-addComment) – to provide the version number for testing.
2. Do transition [POST /rest/api/2/issue/{issueIdOrKey}/transitions](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-doTransition) – to change the status.
  * Get transitions [GET /rest/api/2/issue/{issueIdOrKey}/transitions](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-getTransitions) – beforehand to get the id of the target status.
3. Get issue [GET /rest/api/2/issue/{issueIdOrKey}](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-getIssue) – to get the reporter information.
4. Assign [PUT /rest/api/2/issue/{issueIdOrKey}/assignee](https://docs.atlassian.com/software/jira/docs/api/REST/7.6.1/#api/2/issue-assign) – to assign the issue back to the reporter.

Likewise, we will need to authenticate when making the call to the API. We can do so through Basic Auth, by providing a **Base64** encoded *username=password* value in the authorization header. You can encode your credentials using browser console: `btoa('username=password')`.

#### Git alias

Git aliasing is a nifty solution for simplifying any command with a long list of parameters, that is called very frequently. Aliases are stored in a `.gitconfig` file. This file can be configured per repository or globally in a user's home (`~/`).

For example, you might want to create a shorthand for custom log formatting `git config --global alias.logf 'log --pretty="format:%H | Author: %an, %aD | Committer: %cn, %cD | %s"'` so that it can be executed by calling `git logf`. By prepending the command with an exclamation mark, we can alias an external to Git command: `git config --global alias.date '!date"'`.

This gives us the possibility to create [advanced git aliases](https://www.atlassian.com/blog/git/advanced-git-aliases). We can use this to parametrize our alias like so: `git config --global alias.rdate '!f() { date --date="$1"; }; f'` and call it with `git rdate tomorrow`. For some longer commands, you
can break them using `\` and if you have a multiline script I suggest storing and executing it as a script file.

## The essentials

With the above knowledge, all that's left is the implementation.

#### Append GitLab merge request title and description

```bash
#!/bin/bash
# Use this script after a merge to amend the merge commit with an additional description from GitLab MR title
GITLAB_PRIVATE_TOKEN=<your_token>
GITLAB_HOST=https://gitlab.com/ # Or your own host

# Get the previous merge commit message i.e. "Merge remote-tracking branch 'origin/feature'"
MESSAGE="$(git log -1 --pretty=%B)"

# Extract "feature" i.e. branch name
ISSUE="$(echo $MESSAGE | head -n 1 | cut -d"'" -f 2 | cut -d"/" -f2-)"

# Fetch GitLab title and description from a matching merge request that is assigned to yourself
DESCRIPTION=$(curl --silent -H "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
${GITLAB_HOST}/api/v4/merge_requests?scope=assigned_to_me&state=opened&source_branch=${ISSUE} | \
jq -r ".[] | (.title + \"\n\" + .description)")

# Fetch only the title for the next script which will match one or more issues on Jira
TITLE=$(curl --silent -H "PRIVATE-TOKEN: ${GITLAB_PRIVATE_TOKEN}" \
${GITLAB_HOST}/api/v4/merge_requests?scope=assigned_to_me&state=opened&source_branch=${ISSUE} | \
jq -r ".[] | (.title)" | cut -d" " -f1)

# Amend the merge commit with the old message, appending description from GitLab
git commit --amend --no-edit -m "${MESSAGE}" -m "${DESCRIPTION}" 

# Extract the version from the pom, relative to the root of the Git repository
VERSION=$(grep version "pom.xml" | head -n 2 | tail -n 1 | cut -d">" -f2 | cut -d"<" -f1 )

# Ask whether to update Jira ticket - you might stop here and continue with additional merges
read -p "Push and update tracking with git jira-update $VERSION $TITLE? <y/N> " prompt
if [[ $prompt =~ [yY](es)* ]]; then
  git push && git jira-update $VERSION $TITLE
figit s
```

#### Update Jira tracking information

```bash
#!/bin/bash
# This script will add merge version comment, update the status and re-assign the Jira issue back to the reporter
if [ "$#" -ne 2 ]; then
	echo "Usage: ./script.sh VERSION SLASH_SEPARATED_ISSUES"
	exit 1
fi

CREDENTIALS=<base_64_credentials>
JIRA_HOST=<your_jira_url>
VERSION=$1
ISSUES=$2

oldIFS=$IFS
export IFS="/"
for ISSUE in $ISSUES; do # We expect issue-1/issue-2/issue-3

  curl --write-out '%{http_code}' --silent --output /dev/null \
    -H "Authorization: Basic ${CREDENTIALS}" \
    -H "Content-type: application/json" \
    -X POST -d "{\"body\": \"Post review, merged in v${VERSION}\"}" \
    ${JIRA_HOST}/rest/api/2/issue/${ISSUE}/comment

  echo " ${ISSUE} added comment with version ${VERSION}"

  # Look up the target status id beforehand, or further automate it, in this case, the id is 3
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

#### Wrap in Git alias

All that's left now is to register aliases for our scripts with Git. This can be done by editing the `~/.gitconfig` file:
```bash
[alias]
	merge-origin = "!f() { \
		git merge --no-ff origin/$1; \
	}; f"
	merge-update = "!f() { \
	  bash "/path/to/the/first/script.sh"; \
	}; f"
	jira-update = "!f() { \
		bash "/path/to/the/second/script.sh $1 $2"; \
	}; f"
```

Now, after the merge request is accepted, you can do `git merge-origin <branch>` (resolve any conflicts) and `git merge-update`. This will merge the branch with additional information from the merge request **and** update the Jira ticket status. The merge request will also get closed after the push.

## Summary

Even if the provided example does not suit your workflow and configuration, I believe it will give you some basic overview of cURL, Jq, Git and GitLab/Jira API. Maybe you will come up with a clever way to automate your own processes. Another mechanism that might interest you is [Git hooks](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks).