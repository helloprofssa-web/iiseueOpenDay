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
4. Esegui un nuovo deploy. La tabella delle prenotazioni viene creata automaticamente.

## Sviluppo locale

Richiede Node.js 22.5 o successivo.

```powershell
npm install
$env:OPEN_DAY_ADMIN_KEY = "una-chiave-di-prova"
npm start
```

Apri `http://localhost:3000` per il modulo e `http://localhost:3000/admin` per l'area
organizzatori. Senza `DATABASE_URL` in locale viene usato un database Postgres
incorporato, salvato in `data/pglite` (escluso da git). Impostando `DATABASE_URL` viene
invece usato quel database. `npm test` esegue i test, anche sulla capienza.

I turni sono chiamati “Primo turno” e “Secondo turno”; orari e date non sono
configurati perché non specificati.
