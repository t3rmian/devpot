---
title: Command line access to FTP(S) (IBARD)
url: ibard-ftp-cli
id: 49
tags:
  - shell
  - scripts
author: Damian Terlecki
date: 2021-02-07T20:00:00
---

IBARD is a Comarch solution that facilitates, among other things, data storage, backups, and file sharing.
After creating an account, we can log in to IBARD via the web application, download the desktop application and even connect via
mobile application.

Interestingly, we can also connect to IBARD from the command line using the FTP/FTPS protocol. This allows us to painlessly automate 
tasks that require moving and storing files, especially in headless systems. So let's check out how to use simple Linux tools
we are able to manage files on the FTP servers.

## IBARD FTP(S)

To try out FTP access, we can set up a trial account at https://www.ibard.com/en/. By creating a cloud account and email verification,
we gain free access to the IBARD for 60 days. In the application, all you need to do is create a new directory (1), enable FTP access (2, 3),
configure the permissions for the generated users (4, 5), and enforce the FTPS (6).

<img src="/img/lazy/ibard-ftps.jpg" data-src="/img/hq/ibard-ftps.jpg" alt="Screenshot from the IBARD application showing the configuration of the FTP sharing" title="IBARD FTP(S)">

## Tools

On Linux based systems, depending on the distribution and installed packages, we will have a few basic tools to choose from
for data transfer over the network. The three possibly most popular out-of-the-box solutions in this area are:
- *curl*;
- *wget*;
- *ftp*.


On the Windows, as you might expect, it's not that colorful. Considering standard tools,
we will have access to the *ftp* program. Unfortunately, in the case of SSL connections, we will have to use *PowerShell*.

Of course, we could also use a wide range of external tools (e.g. WinSCP, Total Commander, *lftp*). However, sometimes
we will not have the permissions to install them in a given environment. For this reason, it is worth getting acquainted with the basic solutions.

### curl
In addition to standard HTTP communication, *curl* also supports FTP(S) transfer:
- `curl --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/` – listing files in a given directory;
- `curl --ftp-ssl -u "<username>:<password>" -T <file> ftp://ftp.ibard.com/<your_ftp_directory>/<file>` – sending the file to the server;
- `curl -s --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/<file> >> <file>` – downloading the file from the server;
- `curl --ftp-ssl -u "<username>:<password>" ftp://ftp.ibard.com/<your_ftp_directory>/ -Q "DELE /<your_ftp_directory>/<file>"` – deleting the file from the server.

If we connect using the FTPSecure account then the `--ftp-ssl` parameter is mandatory. Otherwise, we can omit it,
but it is not recommended due to an unencrypted connection. In case
we have a proxy set up on the environment, we can bypass it through the `--noproxy` parameter.
For testing purposes, you can also omit the certificate validation with the `--insecure` parameter.
Lastly `-vvv` is good to troubleshoot any problems with communication.

### wget
The commands for communicating with the FTP server using *wget* allow only listing and downloading.
In order to upload the file to the server or delete it, you will need some other tools.
If you have the permissions, you could install *wget* equivalents *wput* and *wdel*:
- `wget -S --user="<username>" --password="<password>" ftps://ftp.ibard.com/<your_ftp_directory>/` – listing files in a given directory;
- `wput -u <file> ftp://<user>:<password>@ftp.ibard.com/<your_ftp_directory>/<file>` – sending the file to the server;
- `wget --user="<username>" --password="<password>" ftps://ftp.ibard.com/<your_ftp_directory>/<file>` – downloading the file from the server;
- `wdel ftp://<user>:<password>@ftp.ibard.com/<your_ftp_directory>/<file>` – deleting the file from the server.

As with *curl*, the `--no-proxy` parameter can be also applied here, and, in a slightly different form `--no-check-certificate`.

### ftp
This is a basic tool you'll find on Windows as well.
During the connection, you will need to enter your login and password. Unfortunately, the standard *ftp* does not support
FTPS connections. For accounts with forced FTPSecure we will get the following error:

> 500 Explicit SSL required for user \<username\>

Use:

- `ftp -p ftp.ibard.com` – initiate the connection to the FTP server in passive mode, bypassing some firewalls (opening ports)
  when transferring files;
- `ftp > ls` – list files in the given directory;
- `ftp > cd <directory>` – change directory on the server;
- `ftp > get <file>` – file download;
- `ftp > put <file>` – file upload;
- `ftp > delete <file>` – file removal.

Other useful commands are fairly standard and analogous to operating system counterparts: `mkdir`, `rmdir`, `pwd`, `quit`.
Additionally, we can use:
- `mget` to download multiple files;
- `mput` tto upload multiple files;
- `lcd` to change local directory;
- `ascii` to change the transfer mode to text files;
- `binary` – binary file transfer mode.

With a one-liner, we are able to turn off the interactive mode and automate the execution by redirecting the command list to the tool:
```sh
ftp -nivp ftp.ibard.com <<EOF
user <username> <password>
ls
quit
EOF
```

For Linux and SSL connections, you can try a slightly more advanced *lftp* utility (usually you'll need to install it):
`lftp <username>:<password>@ftp.ibard.com`.

### PowerShell
If we want to automate file transfer on Windows, PowerShell will be the solution.
To connect via FTP(S) we can use the .NET framework classes ([original examples from Thomas Maurer](https://www.thomasmaurer.ch/2010/11/powershell-ftp-upload-and-download/)).
Importantly, for successful transfer, a double slash character is required after the host name:

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

And the upload:
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

> Note: For [.NET Framework 4+](https://docs.microsoft.com/en-US/troubleshoot/dotnet/framework/ftpwebrequest-behavior),
you will need to run the following script ([JamieSee, CC-BY-SA](https://stackoverflow.com/a/23397942)),
which will change the the behavior of missing the *CWD* (change directory) command before sending the file, similarily to the previous versions:

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

We can save the scripts as `.ps1` extension, but it will be necessary to obtain permission to execute them.
With the command `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` we will enable the execution of local unsigned scripts
for the current user. Without this permission, we would have to manually paste the commands into PowerShell.

## HTTP
In the case of IBARD, we can also expose the file/directory as public (icon next to FTP sharing).
This is an interesting option when we can afford public access to files.
In this case, we get an application link `https://www.ibard.com/d/<hash>`, as well as access
via API through the `https://www.ibard.com/api/download/browser/shared/links/<hash>/files` URL.

We can handle the download simply by providing the URL at the end of the *curl*/*wget* command.
Alternatively, we can use the *Content-Disposition* response header:
- `curl -O -J https://www.ibard.com/api/download/browser/shared/links/<hash>/files`; 
- `wget --content-disposition https://www.ibard.com/api/download/browser/shared/links/<hash>/files`;
- ```shell
# PowerShell
$client = new-object System.Net.WebClient
$client.DownloadFile("https://www.ibard.com/api/download/browser/shared/links/<hash>/files", "C:\data\file.txt")
```

The public access can also be secured with a password at the application level, but after such a change, we lose unauthorized access via the HTTP API.
When looking for an alternative, you might consider file encryption.

## Summary

Some of the parameters may differ from version to version. During the tests, I've used the following tool versions:
- *curl 7.29.0 (x86_64-redhat-linux-gnu)*;
- *curl 7.55.1 (Windows)*;
- *curl 7.68.0 (x86_64-pc-linux-gnu)*;
- *GNU Wget 1.14 built on linux-gnu* – no FTPS support, version 1.18+ required;
- *GNU Wget 1.20.3 built on linux-gnu*;
- *wput 0.6.2*;
- *lftp 4.8.4*;
- *PowerShell 5.1*;
- *.NET 4.030319*.

The above access methods to the IBARD are, of course, not everything that the Comarch service offers. First of all, you are free to
choose from specially prepared desktop and mobile applications. Nevertheless, the possibility of automating the transfer using low-level
tools is quite a useful feature.

<style>.content li {text-align: left !important}</style>
