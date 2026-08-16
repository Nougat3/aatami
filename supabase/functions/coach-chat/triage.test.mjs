const EMERGENCY_SINGLE = [
  "rintakip", "hengenahdistu", "halvaus", "halvaantu", "aivoinfark", "sydänkohtau",
  "infarkt", "toispuolei", "puhe puuroutu", "tajuttom", "pyörty", "menetin tajun",
  "verioksennu", "veriulost", "anafylak", "kouristu", "elvyt",
];
const EMERGENCY_PAIRS = [
  // rinta + kipu/puristus/paine  (kumpi tahansa järjestys)
  [["rinnas", "rintaan", "rinnan", "rintake", "rinta "], ["kipu", "kive", "purist", "särky", "särke", "paine", "ahdist"]],
  // hengitys + vaikeus
  [["henke", "henge", "hengit", "hapen", "happi"], ["en saa", "vaike", "ei kulje", "loppu", "ahdist", "riitä"]],
  // suupieli / kasvot + roikkuu
  [["suupiel", "kasvo", "käsi", "raaja"], ["roikku", "veltto", "voimato", "tunnoto", "halvaa"]],
  // verenvuoto + runsas
  [["verenvuo", "vuodan ver", "vuotaa ver"], ["runsas", "paljon", "ei lopu", "tyrehdy"]],
  // kurkku + turvotus
  [["kurkku", "kieli", "huule"], ["turpoa", "turvonn", "turvot"]],
];
const CRISIS = [
  "itsemurha", "itsetuhoi", "en halua elää", "en halua ela", "en jaksa elää",
  "en jaksa ela", "tappaa itse", "satuttaa itse", "vahingoittaa itse",
  "lopettaa kaiken", "toivoisin että kuolisin", "olisi parempi jos kuolisin",
  "en halua enää olla", "riistää henke",
];

function triage(text) {
  const t = text.toLowerCase();
  if (CRISIS.some((w) => t.includes(w))) return "crisis";
  if (EMERGENCY_SINGLE.some((w) => t.includes(w))) return "emergency";
  for (const [a, b] of EMERGENCY_PAIRS) {
    if (a.some((w) => t.includes(w)) && b.some((w) => t.includes(w))) return "emergency";
  }
  return null;
}

/* ── LUONNOS: valmentajan rajat (lääkärin tarkistettava) ──────────────────
   Salliva linja: yleinen terveystieto sallittu, henkilökohtainen arvio ei. */
const SYSTEM = `Olet "Aatami-valmentaja", suomalaisen Aatami-terveyspalvelun omahoitovalmentaja.
Keskustelet potilaan kanssa suomeksi, sinuttelet, olet lämmin ja selkeä. Vastaat
lyhyesti — 2–5 virkettä, ellei potilas pyydä enempää.

ET OLE LÄÄKÄRI, etkä esiinny sellaisena. Aatamin lääkärikontakti tapahtuu
erikseen etävastaanotolla (Vastaanotto.fi). Aatamia ei valvota reaaliaikaisesti:
kukaan ei lue tätä keskustelua yöllä.

SAAT:
- Kertoa yleistä terveystietoa (esim. mitä verenpaine tarkoittaa, miksi uni
  vaikuttaa jaksamiseen, miten suola liittyy verenpaineeseen).
- Puhua omahoidosta: liikunta, ravitsemus, uni, stressinhallinta, tavoitteet.
- Kuvata mitä potilaan omissa mittauksissa on tapahtunut (suunta, kehitys).
- Auttaa potilasta valmistautumaan vastaanotolle: mitä kannattaa kysyä lääkäriltä.

ET SAA KOSKAAN:
- Arvioida potilaan omaa tilannetta: et sano onko hänen arvonsa "normaali",
  "hyvä", "huolestuttava" tai "vaarallinen", etkä arvaa mistä oire johtuu.
- Tehdä diagnoosia tai sulkea sairautta pois.
- Antaa lääkeohjeita: et ehdota lääkkeen aloitusta, lopetusta, annosmuutosta,
  vaihtoa etkä kommentoi onko jokin lääke potilaalle sopiva.
- Kertoa onko oire kiireellinen vai ei — et triagee.
- Keksiä mittauksia tai lukuja joita datassa ei ole.

RAJAN YLITTYESSÄ: kerro rehellisesti ettet voi arvioida hänen tilannettaan,
anna halutessasi yleistä tietoa aiheesta, ja ohjaa varaamaan etävastaanotto.
Älä pahoittele monta kertaa — sano se kerran ja selkeästi.

Jos potilas vaikuttaa huolestuneelta oireesta, ohjaa lääkäriin. Jos kyse voi
olla hätätilanteesta, kehota soittamaan 112.`;



const cases=[
 ['Minulla on kova rintakipu','emergency'],['Rinnassa puristaa kun kävelen','emergency'],
 ['Puristaa rinnassa','emergency'],['Kipua rinnassa ja käsivarressa','emergency'],
 ['Rintaan sattuu, paine on kova','emergency'],['En saa henkeä','emergency'],
 ['Hengittäminen on vaikeaa','emergency'],['Hengenahdistusta rasituksessa','emergency'],
 ['Suupieli roikkuu','emergency'],['Käsi on voimaton toiselta puolelta','emergency'],
 ['Pyörtyin eilen','emergency'],['Kurkku turpoaa','emergency'],
 ['Verenvuoto ei lopu','emergency'],['Luulen että minulla on infarkti','emergency'],
 ['Ajattelen itsemurhaa','crisis'],['En jaksa elää enää','crisis'],
 ['Olisi parempi jos kuolisin','crisis'],['Haluan vahingoittaa itseäni','crisis'],
 ['En halua enää olla täällä','crisis'],
 ['Verenpaineeni on 145/90, mitä se tarkoittaa?',null],['Nukuin huonosti ja olen väsynyt',null],
 ['Voinko syödä suolaa?',null],['Kävelin 5 km tänään',null],
 ['Paino ei laske vaikka liikun',null],['Mieliala on ollut matala',null],
 ['Miten uni vaikuttaa verenpaineeseen?',null],['Kuinka paljon pitäisi liikkua?',null],
];
let fail=0;
for(const [t,exp] of cases){const got=triage(t);const ok=got===exp;if(!ok)fail++;
  console.log((ok?'\u2713':'\u2717 VIRHE')+'  '+JSON.stringify(t)+' \u2192 '+got+(ok?'':' (odotettu '+exp+')'));}
console.log(fail?('\n'+fail+' virhettä'):'\nKaikki '+cases.length+' testiä läpi');

