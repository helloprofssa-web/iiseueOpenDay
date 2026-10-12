# Open Day

Applicazione web per raccogliere e gestire le prenotazioni dell'open day scolastico.
Ogni turno ammette al massimo 100 persone: nel conteggio rientrano lo studente e gli
eventuali accompagnatori.

## Pubblicazione su Vercel

1. Importa il repository su Vercel (nessuna impostazione di build particolare).
2. Nel progetto apri **Storage** (o Marketplace) e collega un database **Neon Postgres**:
   Vercel imposta da solo la variabile `DATABASE_URL`.
3. In **Settings → Environment Variables** aggiungi `OPEN_DAY_ADMIN_KEY` con una chiave
   lunga e casuale, usata per accedere a `/admin`.
4. Configura l'invio delle email di conferma aggiungendo queste variabili (qualunque
   servizio SMTP va bene, ad esempio Gmail/Google Workspace con una *password per le app*,
   Brevo o Mailgun):

   | Variabile | Esempio |
   |-----------|---------|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` (oppure `465` per SSL) |
   | `SMTP_USER` / `SMTP_PASS` | utente e password SMTP |
   | `MAIL_FROM` | `Open Day <openday@tuascuola.it>` |
   | `PUBLIC_URL` | `https://nome-progetto.vercel.app` (usato nei link delle email) |

   Senza queste variabili le prenotazioni funzionano ma la mail non viene inviata; il
   visitatore vede comunque codice e link al biglietto a schermo.
5. Esegui un nuovo deploy. Le tabelle vengono create e aggiornate automaticamente.

## Funzioni per i visitatori e per lo staff

- `/cancel`: il visitatore annulla la prenotazione con codice ed email.
- `/ticket?code=…`: biglietto con QR code (il link è nella mail di conferma).
- `/admin` → *Verifica biglietto*: scansione del QR con la fotocamera (Chrome/Android;
  su altri browser si inserisce il codice a mano). Il primo controllo registra l'ingresso,
  un secondo controllo dello stesso biglietto mostra "Già entrato".

## Sviluppo locale

Richiede Node.js 22.5 o successivo.

```powershell
npm install
$env:OPEN_DAY_ADMIN_KEY = "openday26iiseue!"
npm start
```

Apri `http://localhost:3000` per il modulo e `http://localhost:3000/admin` per l'area
organizzatori. Senza `DATABASE_URL` in locale viene usato un database Postgres
incorporato, salvato in `data/pglite` (escluso da git). Impostando `DATABASE_URL` viene
invece usato quel database. `npm test` esegue i test, anche sulla capienza.

I turni sono chiamati “Primo turno” e “Secondo turno”; orari e date non sono
configurati perché non specificati.
