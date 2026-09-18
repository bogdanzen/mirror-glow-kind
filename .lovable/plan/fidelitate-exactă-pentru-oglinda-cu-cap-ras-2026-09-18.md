# Fidelitate exactă pentru oglinda cu cap ras

## Rezultat
Fața afișată rămâne pixel cu pixel din cadrul real al camerei. SDXL Lightning furnizează numai scalpul ras și zonele exterioare unde exista păr; nu mai înlocuiește ochii, nasul, gura sau forma feței.

## Implementare
1. Păstrăm dreptunghiul feței detectate în coordonatele decupajului de cap.
2. În compunerea finală, înlocuim masca ovală integrală cu o mască anatomică: scalp sus, tâmple și laterale; centrul feței rămâne transparent și arată filmarea originală.
3. Estompăm numai îmbinarea scalpului și a tâmplelor, apoi păstrăm tranziția existentă între generații.
4. Întărim promptul SDXL ca să nu modifice identitatea, expresia, trăsăturile sau perspectiva.

## Verificare
- Testăm calculul măștii pentru o față detectată și pentru zona de rezervă.
- Rulăm verificarea de tipuri.
- Rulăm fluxul oglinzii întârziate și confirmăm că cererile reușesc, fața reală rămâne vizibilă, iar numai scalpul generat este compus peste video.
