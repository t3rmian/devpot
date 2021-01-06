---
title: Dostęp FTP(S) poprzez wiersz poleceń na przykładzie IBARDa
url: ibard-ftp-cli
id: 49
tags:
  - shell
  - skrypty
author: Damian Terlecki
date: 2021-02-07T20:00:00
---

IBARD to rozwiązanie firmy Comarch ułatwiające między innymi przechowywanie danych, tworzenie kopii zapasowych oraz współdzielenie plików.
Po utworzeniu konta, do IBARDa możemy zalogować się poprzez aplikację internetową, ściągnąć aplikację desktopową, a nawet połączyć się za pomocą
aplikacji mobilnej.

Co ciekawe z IBARDem połączymy się również z poziomu wiersza poleceń za pomocą protokołu FTP/FTPS. Pozwala nam to na bezbolesną automatyzację
zadań wymagających przerzucania i przechowywania plików, szczególnie w systemach typu headless. Sprawdźmy więc, jak za pomocą prostych narzędzi linuksowych
jesteśmy w stanie zarządzać plikami na serwerach FTP.


## IBARD FTP(S)

Do wypróbowania dostępu FTP możemy założyć konto testowe na stronie https://www.ibard.com/pl/. Po założeniu konta w chmurze i potwierdzeniu
maila otrzymujemy darmowy dostęp do IBARDa na 60 dni. Po przejściu do aplikacji wystarczy, że dla nowego folderu (1), włączymy dostęp FTP (2, 3),
skonfigurujemy poziom dostępu wygenerowanych użytkownikóœ (4, 5) i ustawimy wymuszenie połączenia FTPS (6).

<img src="/img/lazy/ibard-ftps.jpg" data-src="/img/hq/ibard-ftps.jpg" alt="Zrzut ekranu z aplikacji IBARD przedstawiający konfigurację foldera FTP" title="IBARD FTP(S)">

> Aplikacja dostępna jest również w języku polskim.

## Narzędzia

W systemach opartych na jądrze Linux, w zależności od dystrybucji i zainstalowanych pakietów, do wyboru będziemy mieli kilka podstawowych narzędzi
do transferu danych poprzez sieć. Trzy prawdopodobnie najpopularniejsze rozwiązania w tym przypadku to:
- *curl*;
- *wget*;
- *ftp*.

Na Windowsie jak można się spodziewać, nie jest tak kolorowo. Biorąc pod uwagę standardowe narzędzia, 
zawyczaj będziemy mieli dostęp do programu *ftp*, a w przypadku połączeń SSL konieczne będzie wykorzystanie *PowerShella*.

Oczywiście moglibyśmy również skorzystać z szerokiej gamy narzędzi zewnętrznych (np. WinSCP, Total Commander, *lftp*), jednak nie zawsze
będziemy mieli uprawnienia do ich instalacji na danym środowisku. Z tego powodu warto zapoznać się z podstawowymi rozwiązaniami.



### curl
Oprócz standardowej komunikacji za pomocą protokołu HTTP, *curl* dodatkowo oferuje transfer FTP(S): 
- `curl --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/` – wypisanie listy plików w podanym katalogu;
- `curl --ftp-ssl -u "<username>:<password>" -T <file> ftp://ftp.ibard.com/<your_ftp_directory>/<file>` – wysłanie wskazanego pliku na serwer;
- `curl -s --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/<file> >> <file>` – pobranie wskazanego pliku z serwera;
- `curl --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/ -Q "DELE /<your_ftp_directory>/<file>"` – usunięcie pliku na serwerze.

Jeśli łączymy się przy użyciu konta FTPSecure to parametr `--ftp-ssl` jest obowiązkowy. W przeciwnym wypadku możemy go pominąć,
ale nie jest to zalecane (połączenie nieszyfrowane). W przypadku, gdy w zmiennych środowiskowych
mamy ustawione proxy i chcemy je pominąć, przyda nam się parametr `--noproxy`. Dla celów testowych możemy pominąć walidację certyfikatu
parametrem `--insecure`. Ostatecznie przyda się parametr `-vvv` w celu prześledzenia jakichkolwiek błędów.

### wget
Polecenia do komunikacji z serwerem FTP przy użyciu *wget* obejmują jedynie listowanie i pobieranie.
W celu wysłania pliku na serwer bądź jego usunięcia, konieczne będzie
skorzystanie z alternatywnych narzędzi. Jeśli mamy do tego uprawnienia odpowiednikami *wget* będą *wput* i *wdel*:
- `wget -S --user="<username>" --password="<password>" ftps://ftp.ibard.com/<your_ftp_directory>/` – wypisanie listy plików w podanym katalogu;
- `wput -u <file> ftp://<user>:<password>@ftp.ibard.com/<your_ftp_directory>/<file>` – wysłanie wskazanego pliku na serwer;
- `wget --user="<username>" --password="<password>" ftps://ftp.ibard.com/<your_ftp_directory>/<file>` – pobranie wskazanego pliku z serwera;
- `wdel ftp://<user>:<password>@ftp.ibard.com/<your_ftp_directory>/<file>` – usunięcie pliku na serwerze.

Podobnie jak w przypadku *curla*, ma tu również zastosowanie parametr `--no-proxy` oraz drugi, analogiczny, w nieco innej formie
`--no-check-certificate`.

### ftp
Jest to podstawowe narzędzie, które zapewne znajdziesz również na Windowsie.
Podczas połączenia konieczne będzie podanie loginu i hasła. Niestety standardowe *ftp* nie wspiera
połączeń FTPS, dlatego dla kont z wymuszonym FTPSecure otrzymamy błąd:

> 500 Explicit SSL required for user <username>

Sposób wykorzystania:

- `ftp -p ftp.ibard.com` – połączenie się z serwerem FTP w trybie pasywnym – pozwalającym na obejście zapór sieciowych (otwarcie portów)
podczas przesyłaniu plików; 
- `ftp > ls` – wypisanie listy plików w podanym katalogu;
- `ftp > cd <directory>` – przejście do katalogu;
- `ftp > get <file>` – pobranie pliku;
- `ftp > put <file>` – wysłanie pliku lokalnego;
- `ftp > delete <file>` – usunięcie pliku.

Inne użyteczne polecenia są dosyć standardowe i analogiczne do programów systemu operacyjnego: `mkdir`, `rmdir`, `pwd`, `quit`.
Dodatkowo możemy użyć: 
- `mget` w celu pobrania kilku plików;
- `mput` do wysłania wielu plików;
- `lcd` do zmiany ścieżki lokalnej;
- `ascii` w celu zmiany trybu przesyłania na pliki tekstowe;
- `binary` – tryb przesyłania plików binarnych.

Za pomocą "jednej linii", jesteśmy w stanie wyłączyć interakcję i zautomatyzować mechanizm przekierowując listę poleceń do narzędzia:
```sh
ftp -nivp ftp.ibard.com <<EOF
user <username> <password>
ls
quit
EOF
```

W przypadku Linuksa i połączeń SSL możesz spróbować nieco bardziej rozwiniętego narzędzia *lftp* (zazwyczaj konieczna będzie jego instalacja):
`lftp <username>:<password>@ftp.ibard.com`.

### PowerShell
Jeśli przenoszenie plików chcemy zautomatyzować na systemie Windows, to podstawowym narzędziem będzie PowerShell.
Do połączenia za pomocą FTP(S) możemy skorzystać klas frameworku .NET ([oryginalne przykłady Thomasa Maurera](https://www.thomasmaurer.ch/2010/11/powershell-ftp-upload-and-download/)).
Co ważne do poprawnego działania, po nazwie hosta konieczny jest podwójny znak *slash*:
```shell
# FTP Download
$url = "ftp://ftp.ibard.com//<your_ftp_directory>/<file>"
$filePath = "C:\data\file"
$username = "<username>"
$password = "<password>"

$request = [System.Net.FtpWebRequest]::create($url)
$request.Credentials = New-Object System.Net.NetworkCredential($username, $password)
$request.Method = [System.Net.WebRequestMethods+Ftp]::DownloadFile
$request.UseBinary = $true
$request.KeepAlive = $false
$request.EnableSsl = $true
# $request.Proxy = New-Object System.Net.WebProxy #--noproxy

$ftpResponse = $request.GetResponse()
$responseStream = $ftpResponse.GetResponseStream()

$file = New-Object IO.FileStream($filePath, [IO.FileMode]::Create)
[byte[]]$buffer = New-Object byte[] 1024
do{
    $length = $responseStream.Read($buffer, 0, 1024)
    $file.Write($buffer,0,$length)
}
while ($length -ne 0)

$file.close()
```

I wrzutka na serwer:
```shell
# FTP Upload
$url = "ftp://ftp.ibard.com//<your_ftp_directory>/<file>"
$filePath = "C:\data\file"
$username = "<username>"
$password = "<password>"

$request = [System.Net.FtpWebRequest]::create($url)
$request.Credentials = New-Object System.Net.NetworkCredential($username, $password)
$request.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
$request.UseBinary = $true
$request.KeepAlive = $false
$request.EnableSsl = $true
# $request.Proxy = New-Object System.Net.WebProxy #--noproxy

$content = gc -en byte $filePath
$request.ContentLength = $content.Length

$requestStream = $request.GetRequestStream()
$requestStream.Write($content, 0, $content.Length)
$requestStream.Close()
$requestStream.Dispose()
```

> Uwaga: w przypadku [.NET Framework w wersji 4+](https://docs.microsoft.com/en-US/troubleshoot/dotnet/framework/ftpwebrequest-behavior),
konieczne będzie uruchomienie poniższego skryptu ([JamieSee, CC-BY-SA](https://stackoverflow.com/a/23397942)),
który spowoduje wykonanie brakującego polecenia *CWD* (zmiana katalogu) przed wysłaniem pliku, na wzór
poprzednich wersji:

```shell
[Type] $requestType = [System.Net.FtpWebRequest]
[System.Reflection.FieldInfo] $methodInfoField = $requestType.GetField("m_MethodInfo", [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance)

[Type] $methodInfoType = $methodInfoField.FieldType
[System.Reflection.FieldInfo] $knownMethodsField = $methodInfoType.GetField("KnownMethodInfo", [System.Reflection.BindingFlags]::Static -bor [System.Reflection.BindingFlags]::NonPublic)

[Array] $knownMethodsArray = [Array]$knownMethodsField.GetValue($null);
[System.Reflection.FieldInfo] $flagsField = $methodInfoType.GetField("Flags", [System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Instance)

[int] $MustChangeWorkingDirectoryToPath = 0x100
ForEach ($knownMethod In $knownMethodsArray) {
    [int] $flags = [int]$flagsField.GetValue($knownMethod)
    $flags = $flags -bor $MustChangeWorkingDirectoryToPath
    $flagsField.SetValue($knownMethod, $flags)
}
```

Skrypty możemy zapisać do plików z rozszerzeniem `.ps1`, ale konieczne będzie uzyskanie uprawnień do ich wykonywania.
Poleceniem `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` umożliwimy wykonanie skryptów (niepodpisanych) lokalnie
przez obecnego użytkownika. Bez uprawnień jesteśmy zdani na ręczne wklejanie poleceń do PowerShella.

## HTTP
W przypadku IBARDa, możemy również zmienić dostęp do pliku/folder na publiczny (ikona obok udostępniania FTP).
Jest to ciekawa opcja, gdy możemy sobie pozwolić na publiczny dostęp do plików.
W tym przypadku uzyskujemy link do aplikacji `https://www.ibard.com/d/<hash>`, a także dostęp
do pliku/folderu poprzez API: `https://www.ibard.com/api/download/browser/shared/links/<hash>/files`.

Pobieranie obsłużymy, podając jedynie URL wywołania *curl*/*wget*, ewentualnie korzystając z nagłówka odpowiedzi *Content-Disposition*:
- `curl -O -J https://www.ibard.com/api/download/browser/shared/links/<hash>/files`; 
- `wget --content-disposition https://www.ibard.com/api/download/browser/shared/links/<hash>/files`;
- ```shell
# PowerShell
$client = new-object System.Net.WebClient
$client.DownloadFile("https://www.ibard.com/api/download/browser/shared/links/<hash>/files", "C:\data\file.txt")
```

Publiczny dostęp możemy również zabezpieczyć hasłem na poziomie aplikacji, jednak po takiej zmianie tracimy nieautoryzowany dostęp przez API HTTP.
W poszukiwaniu alternatywy warto rozważyć szyfrowanie plików.

## Podsumowanie

Niektóre z parametrów mogą różnić się pomiędzy wersjami. Przy testowaniu korzystałem z narzędzi w następujących wersjach:
- *curl 7.29.0 (x86_64-redhat-linux-gnu)*;
- *curl 7.55.1 (Windows)*;
- *curl 7.68.0 (x86_64-pc-linux-gnu)*;
- *GNU Wget 1.14 built on linux-gnu* – bez wsparcia dla FTPS, wymagana wersja 1.18+;
- *GNU Wget 1.20.3 built on linux-gnu*;
- *wput 0.6.2*;
- *lftp 4.8.4*;
- *PowerShell 5.1*;
- *.NET 4.030319*.

Przedstawiony sposób dostępu do IBARDa to oczywiście nie wszystko, co oferuje usługa comarchowa. Przede wszystkim do samego połączenia
do wyboru mamy specjalnie przygotowane aplikacje desktopowe i mobilne. Niemniej jednak możliwość automatyzacji transferu za pomocą niskopoziomowych
narzędzi jest całkiem sporą zaletą.

<style>.content li {text-align: left !important}</style>
