---
title: Dostęp do wewnętrznego API przy pomocy Proxy HTTP – konfiguracja
url: konfiguracja-proxy-http-api-sieci-wewnetrznej
id: 76
tags:
  - api
  - rest
  - android
  - testy
author: Damian Terlecki
date: 2021-11-07T20:00:00
---

Skonfigurowanie serwera proxy HTTP może często być przydatne, w celu uzyskania dostępu do serwisów wewnętrznych z innego urządzenia lub komputera, który nie
ma bezpośredniego dostęp do docelowej sieci.
Przykładem może być problem testowania API dostępnego w sieci wewnętrznej z poziomu urządzenia mobilnego, które korzysta z tej samej sieci Wi-Fi, co komputer podłączony do docelowej sieci VPN.
Oto kilka prostych kroków, aby skonfigurować serwer proxy HTTP, który pozwoli na takie połączenie.

1. Zainstaluj wersję [Squid Proxy](https://wiki.squid-cache.org/SquidFaq/BinaryPackages) (Proxy HTTP) odpowiednią dla Twojego systemu.
2. Skonfiguruj proxy za pomocą pliku *squid.conf* w katalogu instalacyjnym (bądź poprzez ikonę na pasku zadań):
  - Konfiguracja sieci lokalnej powinna być domyślnie zainicjalizowana w pliku konfiguracyjnym, np.:
```bash
acl localnet src 192.168.0.0/16	# RFC1918 possible internal network
# (...)
# Example rule allowing access from your local networks.
# Adapt localnet in the ACL section to list your (internal) IP networks
# from where browsing should be allowed
http_access allow localnet
# Squid normally listens to port 3128
http_port 3128
```
  - Dodaj wewnętrzne serwery DNS do listy konfiguracyjnej, aby umożliwić odnajdywanie adresu IP nazw domen docelowej sieci wewnętrznej (opcjonalnie):
```bash
dns_nameservers 8.8.8.8 208.67.222.222 <insert_your_dns_server_ip>
```
Aby odkryć nazwę serwera DNS sieci wewnętrznej, uruchom `ipconfig /all` w systemie Windows, bądź `cat /etc/resolv.conf` w systemie Linux.
  - W celu odnalezienia statycznych nazw domen, które dodaliśmy w pliku *hosts* musimy dodatkowo podać lokalizację tegoż pliku (opcjonalnie):
```bash
# Windows 10: hosts_file C:/Windows/System32/drivers/etc/hosts
# Linux: hosts_file /etc/hosts
hosts_file C:/Windows/System32/drivers/etc/hosts
```
Uruchom ponownie Squid Proxy za pomocą ikony na pasku zadań lub wiersza poleceń (`/etc/init.d/squid restart` lub `service squid<TAB> restart` w systemie Linux).
3. Upewnij się, że Squid Proxy jest osiągalny w Twojej sieci lokalnej. Możesz wrócić do tego kroku, jeśli proxy nie działa po kroku 4, tj. nie jest dostępne z poziomu klienta za pomocą polecenia `telnet <IP> <PORT>`.
Konieczne może być dodanie portu w zaporze. Na przykład w systemie Windows można to zrobić w Panelu sterowania > System i zabezpieczenia > Zapora systemu Windows > Ustawienia zaawansowane > Reguły ruchu przychodzącego > Nowa reguła.
4. Skonfiguruj klienta do korzystania z proxy HTTP:
  - Firefox: Ustawienia > Ustawienia sieciowe > Ustawienia połączenia, bądź wyszukaj pod frazą "Proxy";
    <img src="/img/hq/http-proxy.jpg" alt="Konfiguracja Proxy HTTP w Firefoksie" title="Konfiguracja Proxy HTTP w Firefoksie">
  - Chrome: Ustawienia > Zaawansowane > System > Zmień ustawienia serwera proxy lub przez linię poleceń `google-chrome --proxy-server="http://proxy-ip:proxy-port"`;
  - Android/iOS: Ustawienia > Wi-Fi > dłuższe przyciśnięcie (Android) bądź dotknięcie (iOS) na nazwę sieci Wi-Fi > Modyfikuj sieć (Android) > Server Proxy > Własny / Ręczna
  - Windows: Ustawienia > Sieć i Internet > Serwer proxy > Ręczna konfiguracja;
  - Ubuntu: Ustawienia systemowe > Sieć > Proxy sieciowe > Ręczna konfiguracja;

Adresem IP serwera proxy będzie lokalny adres komputera, na którym działa serwer proxy. Zwykle będzie to coś w rodzaju 192.168.x.x (adres IPV4 po uruchomieniu komendy `ipconfig` w linii poleceń systemu Windows bądź `hostname -I` w systemie Linux). Jeśli chodzi o port, domyślnie jest to 3128.

Zazwyczaj po wykonaniu tych czterech kroków powinniśmy być w stanie połączyć się z wewnętrznym interfejsem API HTTP przy użyciu wewnętrznego adresu IP, jak również wewnętrznych nazw domen.