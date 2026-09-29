# V2 tablet-first pe `/v2`

## Rezultat
O experiență separată, ușoară pentru tableta Android, disponibilă numai la `/v2`. Păstrează scenariul campaniei pas cu pas, folosește camera pe tot ecranul și afișează un portret generat al aceleiași persoane cu cap complet chel, fără să încarce infrastructura WebRTC/RunPod sau panoul complex din versiunea actuală.

## Flux 1-la-1
1. **TE VEZI?** — camera este deja vizibilă pe fundal, logo-urile și particulele roz rămân discrete.
2. **Consimțământ** — același acord GDPR și aceeași legătură către nota de confidențialitate.
3. **Privește-te 5 secunde** — countdown peste camera live; cadrul bun este capturat și generarea capului chel începe în timpul numărătorii.
4. **DACĂ MÂINE TOTUL S-AR SCHIMBA?** — camera rămâne vizibilă până când portretul final este gata, apoi portretul complet, fotorealist și chel intră lent. Nu afișăm rezultate parțiale și nu lipim un „sticker” peste față.
5. **ÎNCĂ POȚI ALEGE.** — revenire lentă la camera reală, cu textul în stânga sus și fără generarea unui al doilea portret.
6. **PREVENȚIA ÎNCEPE ÎNAINTE SĂ DOARĂ.** — camera reală și mesajele de prevenție.
7. **VERTICAL FREEDOM** — ecran final cu logo-uri, mesaj, QR și donație, urmat de resetare automată.

## Implementare
- Adăugăm o rută nouă și autonomă `src/routes/v2.tsx`; versiunea `/` rămâne neatinsă.
- V2 solicită camera o singură dată, preferă 1080p și reutilizează același flux pe toate ecranele, fără buffer video, MediaPipe, canvas 4K continuu, WebRTC, Scope, RunPod sau bucle la 1 FPS.
- În countdown capturăm un singur cadru JPEG optimizat și îl trimitem la generatorul server-side existent cu promptul fix de alopecie completă. Păstrăm doar rezultatul final și anulăm cererea la resetare.
- Dacă generarea întârzie sau eșuează, experiența nu devine neagră: camera reală continuă, apare un mesaj sigur, iar scenariul merge mai departe.
- Folosim animații numai pe `opacity` și `transform`, o textură CSS statică și un număr mic de particule CSS; fără video decorativ sau animații SVG grele.
- Refolosim mesajele și setările esențiale deja salvate: countdown, durata portretului, numele totemului și linkul de donații.
- Păstrăm măsurarea anonimă a pașilor și QR-ul existent. Nu adăugăm stocare nouă.

## Verificare
- Verificăm `/v2` la dimensiune portret de tabletă și desktop, cu cameră simulată.
- Parcurgem toate ecranele în ordinea exactă și confirmăm că generarea începe înainte de terminarea countdown-ului.
- Confirmăm că ecranul nu devine negru în procesare sau la eroare și că rezultatul final este portretul generat complet, nu o suprapunere locală.
- Verificăm resetarea automată, QR-ul, linkul de donații, metadatele paginii și lipsa erorilor de compilare/runtime.
