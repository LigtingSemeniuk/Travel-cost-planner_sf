Travel Cost Planner (Symfony)

Travel Cost Planner - aplikacja webowa do planowania i analizy kosztów podrozy, wykonana w Symfony z uzyciem Doctrine ORM i SQLite. Projekt pozwala na rejestracje i logowanie uzytkownikow, tworzenie podrozy, wyliczanie kosztow paliwa i calego wyjazdu, zarzadzanie wydatkami oraz korzystanie z mapy (Leaflet + OpenRouteService) do wyznaczania trasy.

Technologie

Projekt zostal wykonany przy uzyciu Symfony, Doctrine ORM, SQLite, Twig, JavaScript (frontend SPA), Leaflet, Nominatim (geocoding) oraz OpenRouteService (routing).

Wymagania

Do uruchomienia projektu potrzebne sa:
•	PHP
•	Composer
•	dostep do internetu (dla mapy i routingu)
•	wlaczone rozszerzenia PHP dla SQLite

Co trzeba odblokowac w php.ini

W pliku php.ini trzeba odkomentowac (usunac ; na poczatku) te linie:

extension=pdo_sqlite
extension=sqlite3

Dodatkowo warto upewnic sie, ze aktywne sa tez:

extension=ctype
extension=iconv

Po zapisaniu zmian w php.ini zamknij i otworz terminal (PowerShell) ponownie.

Konfiguracja .env.local

W glownym folderze projektu (obok .env) utworz plik .env.local i dodaj klucz OpenRouteService:

OPENROUTESERVICE_API_KEY=TWOJ_KLUCZ_API

Bez tego mapa bedzie dzialac, ale wyznaczanie trasy nie bedzie dzialalo.

Jak uruchomic projekt (pierwszy raz)

Otworz PowerShell w folderze projektu i wpisz:

composer install

composer run setup

composer run start

Po uruchomieniu aplikacja bedzie dostepna pod adresem:

http://127.0.0.1:8000

Jak uruchomic projekt po ponownym otwarciu

Jesli projekt byl juz wczesniej uruchamiany, najczesciej wystarczy:

composer run start

Jesli zmieniales kontrolery, routing albo konfiguracje, uruchom:

composer run setup

composer run start

Uruchomienie reczne (bez Composer scripts)

Mozna tez uruchomic projekt recznie komendami:

php .\bin\console cache:clear

php -S 127.0.0.1:8000 -t public

http://127.0.0.1:8000/

Dodanie konta administratora

Aby utworzyc konto administratora, uruchom w terminalu:

php .\bin\console app:create-admin

Po utworzeniu konta zaloguj sie do aplikacji i przejdz do panelu administratora.

Najczestsze problemy

Jesli pojawia sie blad `could not find driver`, oznacza to, ze nie zostaly wlaczone rozszerzenia pdo_sqlite i sqlite3 w php.ini. Jesli mapa dziala, ale trasa sie nie wyznacza, sprawdz czy dodales poprawny OPENROUTESERVICE_API_KEY w pliku .env.local.

Autor

Projekt przygotowany jako aplikacja webowa do planowania kosztow podrozy w architekturze klient-serwer z uzyciem Symfony i Doctrine ORM.
