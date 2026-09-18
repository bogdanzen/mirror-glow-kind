import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/gdpr")({
  head: () => ({
    meta: [
      { title: "Notă de confidențialitate — Oglinda" },
      {
        name: "description",
        content:
          "Cum sunt procesate imaginile în instalația Oglinda: procesare live în memorie, fără stocare, fără identificare.",
      },
      { property: "og:title", content: "Notă de confidențialitate — Oglinda" },
      {
        property: "og:description",
        content: "Procesare live în memorie, fără stocare, fără identificare.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Gdpr,
});

function Gdpr() {
  return (
    <main className="h-dvh overflow-y-auto bg-background px-[8vw] py-[8vh] text-foreground">
      <article className="mx-auto max-w-[60ch] space-y-8 text-[clamp(1rem,1.4vw,1.25rem)] leading-relaxed text-muted-foreground">
        <h1 className="text-[clamp(2rem,4vw,3.5rem)] text-foreground">
          Notă de confidențialitate
        </h1>
        <p>
          Această instalație îți arată, live, o versiune modificată a propriei imagini. Vrem să fie
          foarte clar ce se întâmplă cu ea.
        </p>
        <h2 className="text-foreground">Ce se procesează</h2>
        <p>
          Camera transmite imaginea în timp real către instanța privată a instalației, găzduită
          pe un server GPU european, care o transformă cadru cu cadru. Procesarea
          are loc exclusiv în memoria de lucru (RAM). Cadrele nu sunt scrise pe disc și nu sunt
          păstrate după afișare.
        </p>
        <p>
          Când instalația folosește varianta rapidă, doar un decupaj pătrat cu capul tău este
          trimis, prin serverul nostru, către furnizorul de inteligență artificială fal.ai, care
          returnează imaginea transformată. Decupajul este folosit exclusiv pentru această
          transformare și nu este păstrat de noi. Restul cadrului (corp, haine, fundal) rămâne
          înregistrarea reală și nu părăsește dispozitivul.
        </p>
        <h2 className="text-foreground">Ce se stochează</h2>
        <p>
          Nimic, în mod implicit. Singura excepție: dacă apeși explicit „Păstrează imaginea”, acea
          singură imagine este salvată temporar și se șterge automat după 24 de ore. Nu există
          recunoaștere facială, profilare sau asociere cu identitatea ta.
        </p>
        <h2 className="text-foreground">Analiză</h2>
        <p>
          Contorizăm doar numărul anonim de sesiuni pe zi, local pe dispozitiv. Nu folosim
          identificatori de persoană, cookie-uri de urmărire sau instrumente de analiză externe.
        </p>
        <h2 className="text-foreground">Drepturile tale</h2>
        <p>
          Poți pleca oricând — sesiunea se închide și transmisia se oprește. Dacă ai salvat o
          imagine, poți cere ștergerea ei imediată folosind linkul din codul QR sau contactând
          organizatorul campaniei.
        </p>
        <Link to="/" className="inline-block text-primary underline underline-offset-8">
          Înapoi
        </Link>
      </article>
    </main>
  );
}
