# Ajustări V2 și resetarea metricilor

## Rezultat
- Metricile vechi vor fi eliminate, iar raportarea va porni de la 1 octombrie 2026.
- În `/v2`, butoanele principale vor fi albe, textele mai mari și controlate fără despărțiri, rânduri orfane sau suprapuneri.
- Captura pentru transformarea cheală va începe după o pauză de 3 secunde de la continuarea după consimțământ.
- Ecranul „ÎNCĂ POȚI ALEGE” va folosi un portret nou al aceleiași persoane, cu zâmbet natural, apoi va reveni la camera reală pentru prevenție.
- Umbrele textelor vor deveni mult mai transparente și maro-rose, fără umbre negre.

## Implementare
- Șterg evenimentele anonime existente din tabela de metrici și păstrez schema neschimbată.
- Separ generarea portretului chel de generarea portretului zâmbitor, secvențial, fără flux video sau procesare grea pe tabletă.
- Aplic reguli V2 de tipografie, wrapping și dimensiuni numai în stilurile `.v2-*`.
- Păstrez toate grupurile de text și acțiunile deasupra jumătății ecranului.

## Verificare
- Parcurg fluxul V2 cu răspunsuri AI simulate la 2160×3840 și verific ordinea capturilor, portretul zâmbitor și lipsa suprapunerilor.
- Confirm că QR-ul și ecranele finale rămân vizibile și că aplicația se compilează fără erori.
