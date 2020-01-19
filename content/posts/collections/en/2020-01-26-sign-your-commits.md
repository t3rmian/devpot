---
title: Signing your commits
url: sign-your-commits
id: 22
tags:
  - git
  - security
author: Damian Terlecki
date: 2020-01-26T20:00:00
---

Passwords are only one of many methods for authentication. On the secure network, it's usually not critical to enable the SSH public key authentication, though. Nevertheless, if used correctly, it provides an additional level of security. For example, it prevents [man-in-the-middle](https://en.wikipedia.org/wiki/Man-in-the-middle_attack) attacks by requesting a client confirmation of the host key during initial connection; as well as [preventing the imposter from authenticated communication](https://www.gremwell.com/ssh-mitm-public-key-authentication) (in case the host private key is leaked).

When using Git you have a choice to either use the password authentication or SSH public key authentication. The most popular Git hosting products like GitHub, Gitlab, and Bitbucket all support the SSH keys not only on the account level but also on the project level (also known as deploy keys). However, in the case of Git, both the password and SSH key can only prove that you have access to the remote repository and whether you have permissions like a push to a specific branch. Yet, the sole use of these two methods **cannot prove that you were the author** of the pushed commits.

<h2 id="git-config-user-email">git config user.email "trusted-developer@example.com"</h2>

With this simple command, you can set up someone else's email to be assigned to your commits. Next, based on the email the commit will get matched with the correct user on the remote service. There are also other commands which make it possible to change the email associated with the commit:

- `git commit --amend --no-edit --author="Just an Imposter <trusted-developer@example.com>"` – changes author's name and email for the commit at the current tip;
- `git commit --amend --no-edit --reset-author -c user.email=trusted-developer@example.com` – changes author's as well as committer's email for the commit at the current tip;
- `git filter-branch` with [custom](https://help.github.com/en/github/using-git/changing-author-info) `--env-filter`.

If you've found yourself having entered a wrong email or name, this is also a way to make amendments. With `git --interactive rebase` you will be able to pick up only the selected comments, though keep in mind this will change the git history and you might need a force push to the remote (consider the effects).

## OpenPGP / GPG

The way to prove that the changes (commit) come from a trusted source is to use a GPG key. GPG or GnuPGP (GNU Privacy Guard) is an implementation of the OpenPGP standard (IETF [RFC 4880](https://tools.ietf.org/html/rfc4880)) and provides, among many other things, a way to create digital signatures. It works similarly to the SSH keys, though, instead of using the keys for initiating an authenticated connection, it is used (in case of Git) to sign and verify a specific commit or tag (encryption vs signatures).

Setting up your first GPG is really easy. There are [GitHub](https://help.github.com/en/github/authenticating-to-github/telling-git-about-your-signing-key) and [GitLab](https://help.github.com/en/github/authenticating-to-github/telling-git-about-your-signing-key) guides on that which explain the usage of the *gpg* program. If for some reason you can't use the *gpg* try your luck with [Kleopatra](https://www.openpgp.org/software/kleopatra/). After adding the key to the account and signing your commit you should achieve the **verified** entry.

<img src="/img/hq/github-gpg.png" alt="GitHub verified commit" title="GitHub verified commit">

What about the commits and merges made using the web UI, you might ask. It's true that you only share the public key so there is no way the remote service could sign it. However, since for example GitHub already commits under your account (and there is no way to change it) it can sign your commit with its own private key. In the case of GitLab, this feature is [yet to be implemented](https://gitlab.com/gitlab-org/gitlab/issues/19185).

## Internals

There are at least two use cases for signing your commits using a GPG key. But before that, let's go a little bit deeper to understand what exactly is being signed so that everything will become clear. If we display the signed commit file from the last commit using `git cat-file commit HEAD` we will see something like:

> tree 1fd22093352139a01931f26ba9eea0bd2e7a24ff  
> parent f837bd3da44873a9fc97ab04f87d32870988bd3d  
> author t3rmian <terlecki@termian.dev> 1579424378 +0100  
> committer t3rmian <terlecki@termian.dev> 1579424378 +0100  
> gpgsig -----BEGIN PGP SIGNATURE-----  
> (...)  
> -----END PGP SIGNATURE-----  
> Signed commit message

In this file, we can see what's being signed. You can verify the commit [using gpg](https://gist.github.com/stackdump/846c1358f9b8576173f95216abb04c88) or much easier with `git log --show-signature` / `git show HEAD --show-signature`. For a signed tag on a **parent commit** (see the matching object with parent) we will get something like this:

> object f837bd3da44873a9fc97ab04f87d32870988bd3d  
> type commit  
> tag my-signed-tag  
> tagger t3rmian <terlecki@termian.dev> 1579427008 +0100
>
> my-signed-tag  
> -----BEGIN PGP SIGNATURE-----  
> (...)  
> -----END PGP SIGNATURE-----

From the way [the Git object model](https://shafiul.github.io/gitbook/1_the_git_object_model.html) works, we can define that any change to any commit in the tree will invalidate the signatures from that point up to the HEAD.

## Use cases

Now that we understand the internals of signing commits and tags we can agree that this is a very useful feature for some use-cases in multi-person. I can think of a few valid use-cases like:

- proving that there were no unknown modifications up to a signed tag;
- proving the authorship of a commit.

This gives us some level of trustworthiness. We can validate that the code comes from a trusted developer and no one tampered with the code. If we wanted to go one level higher, we could enforce [signed commits on protected branches](https://help.github.com/en/github/administering-a-repository/about-required-commit-signing). It also helps protect against back-doors (which should ideally be picked out during code review) and untrustworthy developers. Proving the authorship of a commit might also be helpful in terms of creative work (e.g: for country-specific tax deduction).

## Summary

We should now have some basic understanding of signing our commits with the GPG key and its difference from the SSH key. If you want to read more about this topic, I suggest further reading:

- [Linus Torvalds did not commit this](https://github.com/amoffat/masquerade/commit/9b0562595cc479ac8696110cb0a2d33f8f2b7d29);
- [Linus Torvalds on "git tag -s" model](http://git.661346.n2.nabble.com/GPG-signing-for-git-commit-tp2582986p2583316.html);
- [updating an expired GPG key](https://help.github.com/en/github/authenticating-to-github/updating-an-expired-gpg-key);
- [revoking a GPG key on GitLab](https://docs.gitlab.com/ee/user/project/repository/gpg_signed_commits/#revoking-a-gpg-key) – similar to removal on GitHub;
- [Does OpenPGP key expiration add to security?](https://security.stackexchange.com/questions/14718/does-openpgp-key-expiration-add-to-security) – on the expiry date;
- [Protecting code integrity with PGP](https://github.com/lfit/itpol/blob/master/protecting-code-integrity.md) – a detailed article on PGP with **best practices** (master and subkeys).

Forcing GPG signing in a repository might make some features like history rewriting and squashing unfeasible, but it is a *quid pro quo* in terms of providing authenticity.
