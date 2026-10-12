# Open Day

Applicazione web per raccogliere e gestire le prenotazioni dell'open day scolastico.
Ogni turno ammette al massimo 100 persone: nel conteggio rientrano lo studente e gli
eventuali accompagnatori.

## Avvio

Richiede Node.js 22.5 o successivo. Non sono necessarie dipendenze npm.

```powershell
$env:OPEN_DAY_ADMIN_KEY = "imposta-una-chiave-lunga-e-casuale"
npm start
```

Apri `http://localhost:3000` per il modulo pubblico e `http://localhost:3000/admin`
per l'area organizzatori. La chiave è richiesta solo nell'area amministrativa.

## Dati e pubblicazione

Le prenotazioni sono conservate in SQLite in `data/reservations.sqlite`. Per
spostare il database, imposta `OPEN_DAY_DB_PATH` a un percorso persistente e
scrivibile. `PORT` può essere impostata dal servizio di hosting. In produzione,
configura `OPEN_DAY_ADMIN_KEY`, usa HTTPS e scegli un hosting Node.js che conservi
i file del database tra i riavvii.

I turni sono chiamati “Primo turno” e “Secondo turno”; orari e date non sono
configurati perché non specificati.
