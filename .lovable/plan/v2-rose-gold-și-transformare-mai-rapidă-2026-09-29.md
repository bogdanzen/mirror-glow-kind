# V2 rose-gold și transformare mai rapidă

## Rezultat
- Înlocuim pe `/v2` ambele logo-uri actuale cu logo-urile atașate: Vertical Freedom din PDF și Lions din imagine.
- Păstrăm varianta V2 sigură pentru tableta Android: o singură cameră și o singură generare finală, fără WebRTC, RunPod sau bucle continue.
- Transformarea începe chiar la apăsarea butonului de continuare, înainte de primul tic al countdown-ului. Afișăm primul preview chel disponibil și îl înlocuim discret cu rezultatul final clar.
- Restilizăm exclusiv `/v2` în negru și rose gold: titluri Cinzel, text modern lizibil, cadrane elegante rotunjite, contururi luminoase fine, QR rose gold și animații lente ale textelor.

## Implementare
- Pregătim variante transparente ale celor două logo-uri și le servim prin sistemul de asset-uri al proiectului; actualizăm și favicon-ul cu noul logo Vertical Freedom.
- Încălzim camera pe ecranul de consimțământ și pornim cererea AI direct din acțiunea „Continuă”. Activăm răspunsurile parțiale ale generatorului pentru un prim rezultat vizibil mai devreme, păstrând rezultatul final ca imagine definitivă.
- Adăugăm stiluri V2 izolate pentru paleta rose-gold, rame duble cu colțuri rotunjite, mișcare bazată doar pe opacitate și transformare, plus respectarea preferinței de mișcare redusă.
- QR-ul preia culorile V2 din zona în care este afișat, fără să schimbe celelalte pagini.

## Verificare
- Parcurgem `/v2` în format tabletă portret, cu cameră simulată, și confirmăm că procesarea pornește odată cu countdown-ul.
- Verificăm logo-urile, lizibilitatea, animațiile, QR-ul rose gold și lipsa suprapunerilor pe toate ecranele V2.
- Confirmăm că build-ul rămâne fără erori și că versiunea `/` nu este modificată vizual sau funcțional.
