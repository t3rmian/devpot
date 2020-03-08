---
title: Uwierzytelnianie na stronie statycznej
url: uwierzytelnianie-strony-statycznej
id: 25
tags:
  - strony statyczne
  - bezpieczeństwo
author: Damian Terlecki
date: 2020-03-08T20:00:00
---

„Statyczna strona internetowa” to dość stary termin, który ogólnie definiuje witrynę zawierającą stałą zawartość w postaci prostych stron HTML. Pierwsza w historii strona była oczywiście statyczna. Główną różnicą między stroną dynamiczną jest to, że zazwyczaj do zarządzania zawartością strony nie jest wymagana baza danych. Za każdym razem, gdy twórca chce edytować treść, będzie musiał zaktualizować poszczególne strony i ponownie wdrożyć witrynę. To oczywiście ogranicza funkcje, które może oferować takie rozwiązanie. Z drugiej strony ograniczenie to jest korzystne. Prosta struktura i funkcjonalności sprawiają, że nie potrzebujemy żadnego specjalnego serwera, aby wdrożyć naszą witrynę, zachowując przy tym dosyć wysoki poziom bezpieczeństwa. Prosty serwer HTTP to zwykle wszystko, czego potrzebujemy.

W przypadku specyficznych projektów, blogów lub dokumentacji strony statyczne są świetnym rozwiązaniem. Zwłaszcza w dzisiejszych czasach mamy szeroki wachlarz generatorów statycznych witryn (Jekyll, Hexo, Gatsby, Hugo, Sphinx, ...) wraz z różnymi "silnikami" szablonów (Pug, Vue, React, Handlebars). Treść w formie artykułów bądź dokumentacji możemy przechowywać w formacie *Markdown* lub *reStructuredText*. Wszystko to sprawia, że stworzenie bloga bądź wizytówki firmy staje się szalenie ciekawym i przyjemnym procesem.

Czasami niektóre z takich dynamicznych funkcji znanych ze standardowych aplikacji mogą być jednak bardzo pożądane. Często możemy je zaimplementować przy pomocy usług trzecich. Na przykład, jeśli chcielibyśmy mieć system komentarzy na naszym blogu, istnieje wiele rozwiązań – moglibyśmy skorzystać z usługi takiej jak Disqus lub wykorzystać infrastrukturę GitHub (repository issues). Ale co na przykład z bezpieczeństwem? Co, jeśli mamy prywatny projekt prowadzony w małym zespole i chcielibyśmy mieć witrynę statyczną chronioną hasłem na potrzeby dokumentacji? Rozważmy kilka stosunkowo tanich rozwiązań *freemium*, które moglibyśmy zastosować na samym początku.

## Basic Auth

<img src="/img/hq/basic-auth.png" alt="Basic Auth" title="Basic Auth">

Jeśli korzystasz z hostingu IAAS (infrastruktura jako usługa), włączenie uwierzytelniania dla danej witryny jest dość proste. Basic Auth jest tutaj podstawowym rozwiązaniem, zwykle wystarczającym, jeśli mamy włączoną komunikację HTTPS. Standardowa konfiguracja składa się z dwóch kroków. Najpierw musimy utworzyć plik hasła, który umieszczamy w miejscu niedostępnym z sieci. Następni konfigurujemy serwer tak, aby żądał hasła dla zdefiniowanych użytkowników i ścieżek. W przypadku konkretnych serwerów warto zapoznać się z dokumentacją:

1. [Ngnix](https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-http-basic-authentication/);
2. [Apache HTTP Server 2](https://httpd.apache.org/docs/2.4/howto/auth.html);
3. [Prosty wierszowy serwer http dla środowiska Node, nie wymagający zbytniej konfiguracji: `http-server --username admin --password admin`](https://www.npmjs.com/package/http-server).

## GitHub

Ponieważ GitHub jest prawdopodobnie największą usługą hostingową używaną do celów kontroli wersji Git, prawdopodobnie jest to miejsce, w którym przechowujesz swoje projekty. Być może znane Ci są strony GitHub (GitHub Pages). Często jest to początkowy wybór podczas rozważania opcji hostingu strony statycznej.
Niestety [prywatne strony GitHub](https://github.com/isaacs/github/issues/699) nie są jeszcze obsługiwane na obecną chwilę. W przypadku, gdy Microsoft zaimplementuje taką funkcjonalność, oczekuje się raczej, że będzie ona dostępna w ramach planu GitHub Pro z powodu następujących wymagań:

> Upgrade to GitHub Pro or make this repository public to enable Pages.

Z tego powodu polecam zapoznać się z [innymi rozwiązaniami](#other), w szczególności haszowaniem katalogów i szyfrowaniem stron. Rozwiązania te być może będą pasować do Twoich celów, niezależnie od usługi hostingowej. Inną dosyć bezbolesną opcją jest integracja z GitLabem.

## GitLab

W październiku 2019 GitLab.com wprowadził [kontrolę dostępu do stron projektów](https://docs.gitlab.com/ce/user/project/pages/pages_access_control.html). Dzięki tej funkcjonalności możemy ograniczyć dostęp do witryny tylko do członków projektu uwierzytelnionych za pomocą GitLaba. Ponieważ GitLab obsługuje również niestandardowe domeny i certyfikaty SSL/TLS, jest to idealne rozwiązanie do hostowania prywatnych witryn statycznych. Dzięki zarządzaniu użytkownikami poprzez GitLaba jest to również idealne rozwiązanie do prowadzenia wewnętrznej dokumentacji.

<img src="/img/hq/gitlab-page-settings.png" alt="GitLab Pages Settings" title="GitLab Page Settings">

Jeśli używasz **GitHuba** i nadal chcesz mieć tę funkcjonalność, możesz skonfigurować lustrzaną kopię repozytorium na GitLabie i zdefiniować automatyczne wypychanie zmian z GitHub za pomocą akcji, np. w pliku `.github/workflows/documentation-cd.yml`:

```yml
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

Kolejnym krokiem jest skonfigurowanie [poufnej zmiennej](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets) `GITLAB_SSH_PRIVATE_KEY` do komunikacji między GitLabem i GitHubem. Następnie definiujemy integrację przy pomocy pliku GitLab CI `.gitlab-ci.yml`. Przykładowo zbudowanie i wdrożenie dokumentacji generowanej przez Sphinxa może wyglądać następująco:

```yml
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

Za każdym razem, gdy ktoś wypchnie coś do mastera na GitHubie, zmiany zostaną automatycznie popchnięte również do GitLaba i strona zostanie zaktualizowana przez CI. Na koniec konieczne jest dodanie członków zespołu do projektu i opcjonalnie skonfigurowanie domeny. Dzięki temu będziemy mogli się cieszyć uwierzytelnianiem i autoryzacją przy pomocy GitLaba.

## Netlify

Netlify to kolejne bardzo popularne rozwiązanie w temacie hostowania witryn statycznych. Warto nadmienić, że oprócz budowania i hostingu, Netlify oferuje dodatkowe praktyczne funkcjonalności, takie jak podgląd gałęzi, CDN i dodatkowe opcje przetwarzania (wstrzykiwanie fragmentów kodu, optymalizacja zasobów, wstępne renderowanie). Przechodząc do zakładki cenowej, odnajdziemy funkcję **„witryny chronione hasłem”** w ramach planu **Pro**. Jednak w przypadku dodatków (add-ons) dla poszczególnych witryn istnieje inna funkcja o nazwie „tożsamość” (**Identity**). Funkcjonalność umożliwia autentykację użytkowników. W tej chwili opcja ta pozwala zaprosić wybranych **5 użytkowników za darmo** i można ją skonfigurować w ustawieniach na poziomie projektu.

<img src="/img/hq/netlify-identity.png" alt="Netlify Identity Settings" title="Netlify Identity Settings">

Ogólny przypadek użycia polega na zaproszeniu członka zespołu poprzez e-mail. Rejestracja odbywa się przy użyciu [Netlify Identity](https://github.com/netlify/netlify-identity-widget) i użytkownik po zalogowaniu przenoszony jest do zabezpieczonego zasobu. Jeśli wyciek szablonów do przestrzeni publicznej nie stanowi problemu, routing kliencki może w takiej sytuacji wystarczyć. Jednak najczęściej (np. w przypadku dokumentacji projektowej) możemy wymagać autoryzowany dostęp do samej strony. Taką weryfikację można włączyć na poziomie serwera, dodając plik `_redirects` określający role przypisane zaproszonym użytkownikom, które będą wymagane przy dostępie do danego zasobu (sprawdzane przed jego udostępnieniem).

<img src="/img/hq/netlify-identity-roles.png" alt="Netlify Identity Roles" title="Netlify Identity Roles">

Dokładniej nazywa się to [kontrolą dostępu opartą na rolach JWT](https://docs.netlify.com/visitor-access/role-based-access-control/#create-users-and-set-roles). Co więcej, Netlify oferuje również uwierzytelnianie przy użyciu zewnętrznego dostawcy, dzięki czemu będziemy mogli logować się na stronie za pomocą Google, GitHub, GitLab lub Bitbucket. Jeśli chcesz pobawić się tymi funkcjonalnościami i sprawdzić, czy pasuje do Twojego przypadku, polecam [one-click-hugo-cms](https://github.com/netlify-templates/one-click-hugo-cms) – bardzo szybki do konfiguracji i wdrożenia projekt CMS. Inne alternatywy dla Netlify Identify to **Okta** i **Auth0**.

## Inne rozwiązania


Jeśli naprawdę potrzebujesz czegoś bardziej zaawansowane i chcesz, aby rozwiązanie było stosunkowo tanie na początek (freemium), możesz również wypróbować Heroku lub Firebase. Za pomocą Heroku możemy użyć po prostu `heroku/heroku-buildpack-php` z serwerem Apache2 lub Nginx, a następnie [skonfigurować](https://devcenter.heroku.com/articles/custom-php-settings#web-server-settings) autentykację i autoryzację w standardowy sposób. Bezpłatny plan wiąże się z usypianiem aplikacji po pewnym czasie bezczynności, a całkowity czas działania w danym miesiącu jest ograniczony. Niemniej jednak do celów dokumentacji może to być idealne rozwiązanie. W innych przypadkach możesz wybrać płatny plan i rozważyć zmianę swojej statycznej witryny w pełnowymiarową aplikację.

W przypadku Firebase nie mam dużego doświadczenia, ale wydaje się, że pozwala zarządzać autoryzacją na poziomie [magazynu w chmurze](https://firebase.google.com/docs/storage/security/#authorization). Przed tym użytkownik musiałby zostać uwierzytelniony z Firebasem. Jeśli chcemy czegoś prostego, wydaje się to dosyć pracochłonne.

### Katalog haszowany

Istnieje również inny sprytny sposób zabezpieczenia strony statycznej, który może sprawdzić się w pewnych okolicznościach. Możemy umieścić nasze strony w haszowanym katalogu i umieścić przed nim formularz z hasłem. Jeśli hash hasła będzie pasować do nazwy katalogu, użytkownik zostanie przekierowany na stronę „prywatną” w zahaszowanym katalogu. [To rozwiązanie](https://github.com/matteobrusa/Password-protection-for-static-pages) jest bezpieczne przy założeniu kilku warunków:

> Jeśli twoja usługa hostingowa oferuje listę katalogów, odwiedzający może ominąć ochronę.  
> Nie ma ochrony przed atakiem typu *brute-force*. Preferowane jest więc bardzo długie i trudne do odgadnięcia hasło.  
> Hash hasła jest częścią identyfikatora URI. Konieczne jest wymuszenie komunikacji HTTPS, aby uniknąć ataków typu *man in the middle*.</br>
> Wykorzystanie bezpośredniego linku spowoduje pominięcie loginu.  

Podlinkowane wcześniej demo to wersja demonstracyjna pojedynczej strony. Rozwiązanie można z łatwością rozszerzyć na wiele stron. Jak widać, nasza strona może też łatwo wyciec, jeśli link zostanie udostępniony. Jeśli nie jest to dla Ciebie problem, ale nadal chcesz zminimalizować widoczność, warto dodatkowo umieścić wpis `&lt;meta name=&quot;robots&quot; content=&quot;noindex&quot; /&gt;` na stronie, aby odwiedzające roboty nie indeksowały naszej strony. Zasadniczo może to być całkiem poprawne rozwiązanie, jeśli jesteśmy jednoosobowym zespołem i znamy powyższe konsekwencje.

### Szyfrowanie stron

Idąc dalej, przy użyciu kryptografii symetrycznej, ciągle możemy mieć publicznie dostępne i indeksowane strony, których poza nami, nikt inny nie będzie w stanie odczytać. [StaticCrypt](https://github.com/robinmoisson/staticrypt) jest przykładem takiego rozwiązania opartego na **AES-256**. Szyfrując zawartość pliku HTML za pomocą długiego, nietypowego hasła, otrzymamy plik z bełkotliwą treścią, który ostatecznie można odszyfrować tylko przy użyciu wspomnianego hasła. Opcja ta jest oczywiście również podatne na ataki typu *brute force* (stąd wymagania dotyczące niesłownikowego hasła), jednak ogólnie wymaga większej mocy obliczeniowej niż rozwiązanie z zakodowanym katalogiem.

## Podsumowanie

Istnieje wiele sposobów zabezpieczenia statycznej witryny realizujących różne poziomy prywatności. Ważne jest, aby zrozumieć każdy z nich, ponieważ nawet weryfikacja tylko po stronie klienta może pasować do Twojego przypadku. Jeśli korzystasz z usługi hostingowej freemium, zawsze dobrze jest sprawdzić, czy obsługuje ona podstawowe uwierzytelnianie (Basic Auth), ponieważ jest to najprostsza forma zabezpieczenia prywatnych witryn. Bardziej zaawansowana autoryzacja zwykle obejmuje płatne plany bądź przejście ze statycznej strony internetowej na pełnowymiarową aplikację.