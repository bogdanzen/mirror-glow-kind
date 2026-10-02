# V2 pe pagina principală

## Rezultat
- Experiența actuală de la `/v2` devine pagina principală la `/`.
- Adresa `/v2` rămâne funcțională și afișează aceeași experiență, pentru compatibilitate.
- Versiunea veche și grea de pe `/` nu mai este încărcată pe pagina principală.

## Implementare
- Mut experiența V2 într-o componentă comună, fără să-i schimb fluxul, aspectul sau setările.
- Conectez atât `/`, cât și `/v2` la aceeași componentă tablet-safe.
- Actualizez titlul și descrierea paginii principale pentru campania Vertical Freedom.

## Verificare
- Deschid `/` și `/v2` și confirm că ambele afișează același ecran V2.
- Verific accesul la panoul de administrare și lipsa erorilor de compilare sau afișare.
