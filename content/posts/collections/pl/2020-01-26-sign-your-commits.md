---
title: Podpisywanie commitów
url: podpisywanie-commitów
id: 22
tags:
  - git
  - bezpieczeństwo
author: Damian Terlecki
date: 2020-01-26T20:00:00
---

Hasła to tylko jedna z wielu metod uwierzytelniania. Kolejny poziom, jakim jest autentykacja przy użyciu klucza SSH zwykle nie jest niezbędny, gdy mamy do czynienia z bezpiecznym połączeniem. W przeciwnej sytuacji właściwe jego wykorzystanie zapewnia dodatkowy poziom bezpieczeństwa. Na przykład w przypadku ataków [man-in-the-middle](https://en.wikipedia.org/wiki/Man-in-the-middle_attack) (przy wycieku klucza prywatnego hosta) [uniemożliwia oszustowi uwierzytelnioną komunikację z serwerem](https://www.gremwell.com/ssh-mitm-public-key-authentication).

Korzystając z systemu kontroli wersji Git, możesz wybrać uwierzytelnianie za pomocą hasła lub uwierzytelnianie za pomocą klucza publicznego SSH. Najpopularniejsze produkty hostingowe Git, takie jak GitHub, Gitlab i Bitbucket, wszystkie obsługują klucze SSH nie tylko na poziomie konta, ale także na poziomie projektu (klucze wdrożeniowe/deployment keys). Jednak w przypadku Gita zarówno hasło (konto), jak i klucz SSH definiują jedynie poziomy dostępu do zdalnego repozytorium oraz jego gałęzi. Obie te metody same w sobie **nie dowodzą autentyczności i autorstwa** zmian wypychanych na daną gałąź.

<h2 id="git-config-user-email">git config user.email "zaufany-programista@example.com"</h2>

Za pomocą tego prostego polecenia możesz przypisać adres e-mail innej osoby do swoich przyszłych commitów. Następnie na podstawie tego e-maila zmiana zostanie połączona z odpowiednim użytkownikiem na serwerze zdalnym. Mamy również inne polecenia, które umożliwiają zmianę adresu e-mail powiązanego z zatwierdzeniem:

- `git commit --amend --no-edit --author="Just an Imposter <trusted-developer@example.com>"` – zmienia nazwisko autora i adres e-mail przypisany do ostatniego commita;
- `git commit --amend --no-edit --reset-author -c user.email=trusted-developer@example.com` – zmienia adres e-mail autora i osoby zatwierdzającej ostatniego commita;
- `git filter-branch` ze [specjalnym filtrem](https://help.github.com/en/github/using-git/changing-author-info) `--env-filter` – pozwala na zmianę całej historii.

Jeśli podaliśmy nieprawidłowy adres e-mail lub imię i nazwisko, jest to również sposób na wprowadzenie poprawek. Z `git --interactive rebase` możemy wychwycić tylko wybrane komentarze. Pamiętaj jedynie, że zmieni to historię git i może być konieczne wypchanie zmian z parametrem `--force` (weź pod uwagę skutki uboczne).

## OpenPGP / GPG

Sposobem na udowodnienie, że zmiany (commity) wyszły faktycznie od nas, jest podpisanie ich kluczem GPG. GPG lub GnuPGP (GNU Privacy Guard) to implementacja standardu OpenPGP (IETF [RFC 4880](https://tools.ietf.org/html/rfc4880)) pozwalajaca, między innymi, na stworzenie podpisu cyfrowego. Mechanizm ten działa podobnie co w przypadku SSH, jednak, zamiast używać kluczy do zainicjowania uwierzytelnionego połączenia, służy (w przypadku Gita) do podpisywania i weryfikacji określonego commita lub tagu.

Stworzenie pierwszego klucza GPG jest dosyć proste. Istnieją dwa przewodniki – [GitHubowy](https://help.github.com/en/github/authenticating-to-github/telling-git-about-your-signing-key) i [GitLabowy](https://help.github.com/en/github/authenticating-to-github/telling-git-about-your-signing-key) – dosyć przystępnie wyjaśniają użycie programu _gpg_. Jeśli z jakiegoś powodu nie możesz użyć _gpg_, spróbuj szczęścia z [Kleopatrą](https://www.openpgp.org/software/kleopatra/). Po dodaniu klucza do konta i podpisaniu nasz nowy commit powinien pojawić się jako **zweryfikowany**.

<img src="/img/hq/github-gpg.png" alt="Zweryfikowany commit w GitHubie" title="Zweryfikowany commit w GitHubie">

Wszystko fajnie, ale co z commitami i mergami dokonanymi przy użyciu webowego interfejsu użytkownika? To prawda, że podczas ustawiania klucza podajemy jedynie publiczną jego wersję, dlatego też usługa zdalna nie może podpisać naszych zmian. Przykładowo jednek w serwisie GitHub zatwierdzenia możemy dokonać jedynie jako my (i nie ma sposobu, aby to zmienić), GitHub automatycznie podpisuje zmiany własnym kluczem prywatnym, potwierdzając, że commit był naszego autorstwa. W przypadku GitLaba podobna funkcja [nie została jeszcze wdrożona](https://gitlab.com/gitlab-org/gitlab/issues/19185).

## Git

Istnieją co najmniej dwa przypadki użycia, do których może nam się przydać podpis cyfrowy. Przed tym sprawdźmy jednak, co tak właściwie dzieje się przy generowaniu takiej sygnatury. Jeśli wyświetlimy podpisany plik commita z ostatniego zatwierdzenia za pomocą `git cat-file commit HEAD`, zobaczymy coś takiego:

> tree 1fd22093352139a01931f26ba9eea0bd2e7a24ff  
> parent f837bd3da44873a9fc97ab04f87d32870988bd3d  
> author t3rmian <terlecki@termian.dev> 1579424378 +0100  
> committer t3rmian <terlecki@termian.dev> 1579424378 +0100  
> gpgsig -----BEGIN PGP SIGNATURE-----  
> (...)  
> -----END PGP SIGNATURE-----  
> Signed commit message

W tym pliku możemy zobaczyć, co tak właściwie podpisaliśmy wraz z dołączoną sygnaturą. Sygnaturę potwierdzić możemy [niskopoziomowo przy pomocy gpg](https://gist.github.com/stackdump/846c1358f9b8576173f95216abb04c88) lub samym Gitem poprzez `git log --show-signature` / `git show HEAD --show-signature`. W przypadku podpisanego tagu `git tag -s` **tego samego rodzica** (zwróć uwagę na zgodność hashu obiektu) otrzymamy coś takiego:

> object f837bd3da44873a9fc97ab04f87d32870988bd3d  
> type commit  
> tag my-signed-tag  
> tagger t3rmian <terlecki@termian.dev> 1579427008 +0100
>
> my-signed-tag  
> -----BEGIN PGP SIGNATURE-----  
> (...)  
> -----END PGP SIGNATURE-----

Na podstawie opisu [modelu obiektowego Gita](https://shafiul.github.io/gitbook/1_the_git_object_model.html), możemy wnioskować, że zmiana jakiegokolwiek commita w historii spowoduje unieważnienie podpisów od tego momentu aż do najnowszego commita.

## Przypadki użycia

Wiedząc już, co tak naprawdę dzieje się podczas podpisywania commitów i tagów, możemy zgodzić się, że jest to bardzo przydatna funkcja w projektach zespołowych. Dwa problemy, jakie możemy rozwiązać poprzez wykorzystanie podpisów to:

- udowodnienie, że nie było żadnych nieznanych modyfikacji aż do podpisanego tagu;
- udowodnienie autorstwa danego commita.

To daje nam pewien poziom wiarygodności. Możemy sprawdzić, czy kod pochodzi od zaufanego programisty bądź czy nikt nie manipulował kodu w międzyczasie. Gdybyśmy chcieli pójść o jeden poziom wyżej, moglibyśmy wymusić [podpisywanie commitów na chronionych gałęziach](https://help.github.com/en/github/administering-a-repository/about-required-commit-signing). Taka forma zabezpieczenia pomaga również w ochronie przed bakdoorami (które właściwie powinny być wyłapane podczas code-review). Dowód autorstwa może być również pomocny w przypadku pracy twórczej (np. ewidencjonowanie).

## Podsumowanie

Powinniśmy teraz mieć podstawową wiedzę na temat podpisywania naszych commitów kluczem GPG, a także różnicy między kluczem SSH. Jeśli chcesz poszerzyć wiedzę na ten temat, zachęcam do dalszego przeczytania:

- [Linus Torvalds tego nie zcommitował](https://github.com/amoffat/masquerade/commit/9b0562595cc479ac8696110cb0a2d33f8f2b7d29);
- [Linus Torvalds na temat modelu "git tag -s"](http://git.661346.n2.nabble.com/GPG-signing-for-git-commit-tp2582986p2583316.html);
- [Aktualizowanie wygasłego klucza GPG](https://help.github.com/en/github/authenticating-to-github/updating-an-expired-gpg-key);
- [Unieważnienie klucza GPG w GitLab](https://docs.gitlab.com/ee/user/project/repository/gpg_signed_commits/#revoking-a-gpg-key) – ten sam efekt co usunięcie na GitHubie;
- [Czy wygasanie klucza OpenPGP zwiększa bezpieczeństwo?](https://security.stackexchange.com/questions/14718/does-openpgp-key-expiration-add-to-security) – na temat daty wygaśnięcia;
- [Ochrona integralności kodu za pomocą PGP](https://github.com/lfit/itpol/blob/master/protecting-code-integrity.md) – szczegółowy artykuł na temat **najlepszych praktyk** z zakresu PGP (master key i podklucze).

Wymuszenie podpisów GPG w repozytorium może sprawić, że niektóre funkcje, takie jak przepisywanie historii i squashowanie, staną się niewygodne w użyciu. Jest to jednak _quid pro quo_ w kwestii zapewnienia autentyczności i integralności kodu.
