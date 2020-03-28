---
title: Static site auth
url: static-site-auth
id: 25
tags:
  - static site
  - security
author: Damian Terlecki
date: 2020-03-08T20:00:00
---

The "static web site" is a pretty old term that generally defines a site containing fixed code in the form of simple HTML pages. The first-ever website was of course static. The major difference between a dynamic page is that there is usually no database involved in serving the page content. Each time the creator wants to edit the content, they would have to update each page and redeploy the site. This of course limits features that could be implemented on such site. On the other hand, this restriction is advantageous. We don't need any special server to deploy it. A simple HTTP server is usually everything that is required.

For some personal projects, blogs or documentation purposes, a static site might be an ideal choice. Especially nowadays we have a multitude choice of static site generators (Jekyll, Hexo, Gatsby, Hugo, Sphinx, ...) and templating solutions (Pug, Vue, React, Handlebars). The articles or documentation pages can be kept in *Markdown* or *reStructuredText* format. This makes it crazy fun with some minimal coding knowledge to create a site that is easily customizable, does not require any sophisticated features and looks and feels like a dynamic site.

In specific cases, we might want to have some of these dynamic features after all. This can be implemented using third-party services. For example, if we want to have a comment system on our blog, there are multiple solutions –	we could use a service like Disqus or reuse GitHub infrastructure i.e. repository issues. But how about security? What if we have a small-team private project and want to have a password protected static site, that would serve for documentation purposes? Let's consider some relatively cheap and freemium choices for some starting point.

## Basic

<img src="/img/hq/basic-auth.png" alt="Basic Auth" title="Basic Auth">

If you're using IAAS (Infrastructure as a Service) hosting it's quite simple to enable authentication for your site. Basic Auth is the no-think solution here, it's usually sufficient if we have HTTPS enabled. The usual configuration consists of two steps. First, we have to create a password file which we put somewhere not accessible from the web. Second –	we configure the server to request a password for allowed users and paths. For specific servers please refer to the documentation:

1. [Ngnix](https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-http-basic-authentication/);
2. [Apache HTTP Server 2](https://httpd.apache.org/docs/2.4/howto/auth.html);
3. [Node zero-configuration command-line http server `http-server --username admin --password admin`](https://www.npmjs.com/package/http-server).

## GitHub

Since GitHub is probably the biggest hosting service for Git version control, and it's probably the place where you keep your projects, you might be familiar with GitHub Pages. It's often the starting choice for hosting a static site.
Unfortunately, [private GitHub Pages](https://github.com/isaacs/github/issues/699) are not supported yet. In case Microsoft implements it, it's expected to be available under the GitHub Pro plan due to the following requirement:

> Upgrade to GitHub Pro or make this repository public to enable Pages.

You may refer to [other solutions](#other) (specifically hashed directories or encrypted pages) that might suit your case, regardless of the hosting service. Another painless possibility is integration with GitLab.

## GitLab

In October 2019 GitLab.com introduced [GitLab Pages Access Control](https://docs.gitlab.com/ce/user/project/pages/pages_access_control.html). With this feature, you can restrict site access only to the project members authenticated through GitLab. Since GitLab also supports custom domains and SSL/TLS certificates it's a perfect solution for hosting secured static sites. By managing project members you don't have to share passwords to access the website - it's ideal for running internal documentation.

<img src="/img/hq/gitlab-page-settings.png" alt="GitLab Pages Settings" title="GitLab Page Settings">

If you're using the **GitHub** and still would like to have this fancy feature, you could set up a mirror repository od GitLab and define an automatic push from GitHub using an action, e.g. `.github/workflows/documentation-cd.yml`:

```yaml
name: Static site mirror

on:
  push:
    branches:    
      - master  

jobs:
  to_gitlab:
    runs-on: ubuntu-18.04
    steps:
    - uses: actions/checkout@v1
    - uses: pixta-dev/repository-mirroring-action@v1 #t3rmian/repository-mirroring-action@4bbf393 for git-lfs support
      with:
        target_repo_url:
          git@gitlab.com:username/repository.git
        ssh_private_key:
          ${{ secrets.GITLAB_SSH_PRIVATE_KEY }}
```

The next step is to configure the [secrets](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets) for communication between GitLab and GitHub. And then we define the GitLab CI `.gitlab-ci.yml`. If you're using Sphinx for documentation, it could look like this:

```yaml
image: "rappdw/docker-java-python"

before_script:
  - python --version
  - pip install -r documentation/requirements.txt

pages:
  script:
    - cd documentation
    - sphinx-build html source/ build/
    - cp -r build/html ../public
  artifacts:
    paths:
      - public
```

Anytime someone pushes something to the master on GitHub, the mirroring action will push it to the GitLab, the site will get updated through CI. Finally add your team members to the project, set up the domain, and you will have a GitLab backed authentication and authorization.

## Netlify

Netlify is another popular choice for hosting static sites. It's worth noting that besides building and hosting, Netlify offers additional useful features like branch previews, CDN and post-processing (snippet injection, asset optimization, prerendering). If you go to the pricing tab you might find the **"Password protected sites"** feature under the **Pro plan**. However, under per-site add-ons, there is a different feature called **"Identity"**. With Identity, you can create gated content or limit access only to the administrators. At the moment this option allows you to invite **5 users for free** and can be configured on the project level settings.

<img src="/img/hq/netlify-identity.png" alt="Netlify Identity Settings" title="Netlify Identity Settings">

The general use case is that you invite a team member by email. They register using [Netlify Identity](https://github.com/netlify/netlify-identity-widget) and proceed to the secured resource logging in with provided credentials. In some cases, client only routing might satisfy you if you're not worried about having your templates leak into public space. However, most often (e.g. when dealing with project documentation), you would want authorized access to the page. Such verification can be enabled at the server level by adding `_redirects` file specifying matching roles assigned to the invited users.

<img src="/img/hq/netlify-identity-roles.png" alt="Netlify Identity Roles" title="Netlify Identity Roles">

Precisely, this is called [Role-based access control with JWT](https://docs.netlify.com/visitor-access/role-based-access-control/#create-users-and-set-roles). What's more, Netlify also offers external provider authentication thanks to which you can use Google, GitHub, GitLab, or Bitbucket to log in to your website. If you want to fiddle with these features, I recommend [one-click-hugo-cms](https://github.com/netlify-templates/one-click-hugo-cms) as it's very quick to set-up and verify if it suits your case. Other alternatives to Netlify Identify are **Okta** and **Auth0**.

## Other

If you really need something more powerful and want the solution to be relatively cheap (freemium), you could also try Heroku or Firebase. With Heroku, we can slap a `heroku/heroku-buildpack-php` with either Apache2 or Nginx server and then [configure](https://devcenter.heroku.com/articles/custom-php-settings#web-server-settings) it the standard way. The free plan will force your app to sleep after some time of inactivity and the total up-time for each month is limited. Nevertheless, for documentation purposes, it might be an ideal solution. For other cases, you could jump on the paid plan and turn your static site into a full-blown application.

In the case of Firebase, I haven't had much experience but it seems that you could serve pages using [cloud storage authorization](https://firebase.google.com/docs/storage/security/#authorization). Firstly, the application would have to be backed by firebase authentication. Seems quite a lot of work if we want something simple.

### Hashed directory

There is also another very clever way to secure the static site under some circumstances. We can our pages under a hashed directory and put a password form in the front of that. If the hashed password will match the directory hash, the user will be redirected to the 'private' page under the hashed directory. [This solution](https://github.com/matteobrusa/Password-protection-for-static-pages) is somewhat secure:

> If your hosting service offers directory listing, a visitor can bypass the protection.  
> There's no protection against brute force attack. Pick a very long and hard to guess password.  
> The password's hash is part of the URI. Enforce HTTPS to avoid man in the middle attacks.  
> Pasting the link directly to someone will bypass the login.  

The provided sample is a demo of a single page but it could easily be extended to multi-page auth. Though, as you can see it could be easily leaked if the link is shared. If you don't care, but still want to minimize the visibility, slap a *noindex* meta value for robots to disable search engine indexing:
`&lt;meta name=&quot;robots&quot; content=&quot;noindex&quot; /&gt;`. Generally, this might be a valid solution if you're a one-man team under consideration of the above flaws.

### Encrypted HTML page

Going even deeper, you could still have your pages publicly accessible, indexable, yet still private through the means of symmetric cryptography. [StaticCrypt](https://github.com/robinmoisson/staticrypt) is an example of such a solution that is based on **AES-256**. By encrypting the contents of HTML file using a long, unusual passphrase we will receive a file with gibberish content that could be decrypted only using the aforementioned password. This, of course, is also prone to brute force attacks (hence the password requirements), though, it generally takes more computation power than the hashed directory solution.

## Summary

There are a lot of ways to secure a static website with various levels of privacy. It's important to understand each one of them, as even the client-only verification might suit your case. If you're using a freemium hosting service it's always good to check whether it supports the basic auth as it's the simplest form of securing private sites. Fine-grained authorization is usually in the range of price plans or switching from the static website to a full-blown application.