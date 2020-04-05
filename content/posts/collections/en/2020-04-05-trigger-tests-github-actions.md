---
title: Trigger smoke tests using GitHub actions
url: trigger-tests-github-actions
id: 27
tags:
  - git
  - automation
  - web services
  - graphql
  - ci
  - testing
author: Damian Terlecki
date: 2020-04-05T20:00:00
source: https://github.com/t3rmian/devpot/blob/3702a2424b9db457ceec31a29645a32f621ec257/.github/workflows/smoke-tests.yml
---

Recently, after accidentally breaking a search feature on my blog, I've started adding automated tests for my Jamstack website. Since from time to time I like to develop directly through GitHub, I've taken a liking to the Netlify deploy previews. I figured out that it would be really witty to run automated tests against such preview, so that I could quickly assess the situation and verify errors remotely, without having to spin up my own environment.

The following diagram shows what we will try to achieve:

<img src="/img/hq/github-actions-netlify.svg" alt="Automating workflow" title="Automating workflow">

## Netlify checks

One of the major strengths of Netlify is that it provides a way to preview how our site will look like before the changes are merged into the master branch. We can enable such previews in the project deployment configuration. For each pull request and any added commits, we will get a preview URL for verification. The site will have the indexing disabled so that if any bot/crawler somehow finds the preview website, it won't influence the search ranking.

<img src="/img/hq/netlify-deploy-previews.png" alt="Netlify deploy previews" title="Netlify deploy previews"/>

By default Netlify also runs some checks (headers, redirections, mixed content validation) and posts updates back to GitHub through its API.
The key point we are interested in is the commit status updates.

There will be generally two such calls per updated pull request. The first one is information about the pending deployment, and the second will be the result of the deployment (success or failure). This is a very good place to start a GitHub action which will initiate the smoke/E2E tests.

<img src="/img/hq/netlify-notifications.png" alt="Netlify commit notifications" title="Netlify commit notifications"/>

## GitHub actions

Creating a GitHub action is quite easy. You can do so either through the UI on the website (provides formatting validation) or just by creating a file in the repository, e.g.: `.github/workflows/smoke-tests.yml`.

### Trigger

Since Netlify posts a status update for our commit, we will listen on status events:

```yml
name: Smoke tests

on:
  status
```

This is however quirky, because:
> Note: This event will only trigger a workflow run if the workflow file is on the master or default branch.

What's more, the `$GITHUB_SHA` will refer to the last commit on the default branch. That's not quite what we expect. We will need a reference to the head commit of the pull request to add our own status for the tests, as well as a reference to the test merge of the pull request to checkout the merged code.
We will come back to that later on.

At this point, you might have one question in mind. If we will update the status with an action that is triggered by a status change, won't that create a recursive workflow? Fortunately, this case has been [covered](https://help.github.com/en/actions/reference/events-that-trigger-workflows#triggering-new-workflows-using-a-personal-access-token) by the GitHub team and we can sleep soundly.

### Selenium service

It's rather a no wonder we will use Selenium for running our tests. To simplify this, we will set up a standalone Selenium server as a service to not worry about installing the browser and other dependencies.

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

Do mind to use `-v /dev/shm:/dev/shm`, otherwise, it's highly probable that the browser will be crashing. Since our main job will not be run in the container, we also need to map the container port to the host runner machine. _4444_ is the default port for the Selenium server.

### Create PENDING status

The first step starts with creating a pending status for the head commit of the pull request. It will be triggered also by the `status` event, though, created by Netlify. You can refer to the [API documentation](https://developer.github.com/v3/repos/statuses/) for more details.

```yml
    steps:
    - name: Create PENDING status
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

In the target URL we will set a link to the GitHub actions with the relevant workflow.

### Reference to the pull request

Because our action is triggered in the context of the status event, we do not have access to the pull request information. Nevertheless, we can retrieve such information using the GitHub API. The easiest way is to use the GraphQL API. To make it easier, there is an `octokit/graphql-action@v2.x` that takes care of calling the endpoint and saving the data to an output variable.

Fiddling around with [the GitHub GraphQL API Explorer](https://developer.github.com/v4/explorer/) it's quite easy to create a desired query returning the number for the pull request.

From now on, we will also run the steps only on the 'success' event state, as we expect the deployment to be finished to run the tests.

```yaml
    - name: Get PR number
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

All that's left is to extract this number from the JSON data using `jq`. We can refer to the output set by a previous step using `${{ steps.&lt;step_id&gt;.outputs.&lt;variable&gt; }}` syntax:

```yaml
    - name: Extract PR number
      if: ${{ github.event.state == 'success' }}
      id: extract_data
      env:
        JSON_DATA: ${{ steps.get_pr_number.outputs.data }}
      run: |
        PR_NUMBER=$(echo "${JSON_DATA}" | jq '.repository.commit.associatedPullRequests.edges[].node.number')
        echo "::set-output name=pr_number::${PR_NUMBER}"
```

Similarly, we use `echo &quot;::set-output name=&lt;variable_name&gt;::&lt;value&gt;"` to set such variable.

### Checkout and run tests

With pull request number we can create a reference to the pull request merge commit. This commit is just a test commit and is in a detached state.
This again can be simplified through `actions/checkout@v2` action:

```yml
    - name: Checkout
      uses: actions/checkout@v2
      if: ${{ github.event.state == 'success' }}
      with:
        ref: refs/pull/${{ steps.extract_data.outputs.pr_number }}/merge
```

And the remaining part is to install (check for cache) repository dependencies and run the tests. Netlify saves the deployment URL at the `target_url` variable of the status event.

```yml
    - run: yarn install
      if: ${{ github.event.state == 'success' && steps.yarn-cache.outputs.cache-hit != 'true' }}
    - run: yarn test-ci
      if: ${{ github.event.state == 'success' }}
      env:
        SITE_URL: ${{ github.event.target_url }}
```

For reference, I'm using WebDriverIO and Cucumber frameworks for my tests. During initialization, I'm retrieving the site URL using environment variable: `process.env.SITE_URL`.

### Create FINISHED status

Finally, to update the commit status, so that we can see it at the pull request page, we will again call the GitHub status API. Under the same context, we set the state to success or failure, depending on our job status.

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

Now we can enjoy our automated new notification:

<img src="/img/hq/github-commit-status.png" alt="Custom commit status" title="Custom commit status"/>

## Tips

If you need information about software installed on virtual environments of GitHub actions, you can find it in [this repository under the "Included Software" column](https://github.com/actions/virtual-environments).

With `actions/setup-node@v1` action you can set up a specific version of NodeJS and with `peter-evans/commit-comment@v1` you can switch from status to comment updates:

```yml
    - name: Create smoke tests PENDING status commit comment
      uses: peter-evans/commit-comment@v1
      with:
        sha: ${{ github.event.commit.sha }}
        body: Preview deploy started, waiting for completion to start the smoke tests...
    - name: Use Node.js 10.x
      uses: actions/setup-node@v1
      with:
        node-version: 10.x
```

To display the GitHub variables use:

```yml
    - name: Dump GitHub context
      env:
        GITHUB_CONTEXT: ${{ toJson(github) }}
      run: echo "$GITHUB_CONTEXT"
```

Lastly, you can test the APIs in the Postman by just switching from the Bearer Token authorization to Basic Auth.