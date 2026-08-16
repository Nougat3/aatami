/**
 * Aatami-valmentajan chat — Supabase Edge Function
 *
 * Potilas keskustelee AI-valmentajan kanssa. EI lääkärin ketju: lääkärikontakti
 * tapahtuu Vastaanotto.fi:n kautta.
 *
 * TURVALLISUUDEN PERIAATE: hätäohje EI ole mallin vastuulla. Potilaan viesti
 * tarkistetaan deterministisellä sanalistalla ENNEN mallia, ja osuma pakottaa
 * hätäkortin näkyviin riippumatta siitä mitä malli vastaa. Malli voi
 * epäonnistua; sanalista ei. Sama periaate kuin mielialakyselyn crisis_if.
 *
 * Rivit kirjoittaa aina tämä funktio (RLS: potilaalla ei ole insert-oikeutta),
 * jotta potilas ei voi väärentää valmentajan vastausta eikä ohittaa tarkistusta.
 *
 * Vaatii salaisuuden: ANTHROPIC_API_KEY
 */
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* ── Rajat ──────────────────────────────────────────────────────────────── */
const MAX_MSG_LEN = 2000;      // yksittäisen viestin pituus
const MAX_PER_DAY = 40;        // viestiä / potilas / 24 h (väärinkäytön esto)
const HISTORY_LIMIT = 20;      // montako viestiä mallille (kustannuskatto)

/* ── LUONNOS: hätäsanasto (lääkärin tarkistettava) ───────────────────────
   Katkaistut vartalot, jotta suomen taivutus osuu ("rintakip" → rintakipu,
   rintakipua, rintakivut).

   HUOM sanajärjestys: suomessa se on vapaa, joten monisanaisia fraaseja EI saa
   käyttää — "puristaa rinnassa" ja "rinnassa puristaa" ovat sama oire. Siksi
   PAIRS: molempien ryhmien sanan on esiinnyttävä, järjestyksellä ei ole väliä.

   Väärä positiivinen on halpa (näytetään 112-ohje turhaan), väärä negatiivinen
   voi olla kohtalokas — lista saa siis olla herkkä. */
const EMERGENCY_SINGLE = [
  "rintakip", "hengenahdistu", "halvaus", "halvaantu", "aivoinfark", "sydänkohtau",
  "infarkt", "toispuolei", "puhe puuroutu", "tajuttom", "pyörty", "menetin tajun",
  "verioksennu", "veriulost", "anafylak", "kouristu", "elvyt",
];
const EMERGENCY_PAIRS: [string[], string[]][] = [
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

function triage(text: string): "emergency" | "crisis" | null {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "missing_api_key" }, 503);

  const auth = req.headers.get("Authorization") || "";
  if (!auth) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  // Käyttäjän token → henkilöllisyys ja RLS-rajattu luku.
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: u, error: uErr } = await asUser.auth.getUser();
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);
  const uid = u.user.id;

  let payload: any = {};
  try { payload = await req.json(); } catch { /* tyhjä = avausviesti */ }
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (message.length > MAX_MSG_LEN) return json({ error: "message_too_long" }, 400);

  // Kirjoitusoikeus vain palvelimella; uid tulee todennetusta tokenista, ei clientilta.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asService = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Väärinkäytön esto: endpoint on autentikoitu, mutta kuka tahansa rekisteröitynyt
  // voisi muuten käyttää sitä ilmaisena mallikutsuna.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await asService
    .from("coach_messages")
    .select("id", { count: "exact", head: true })
    .eq("patient_user_id", uid).eq("role", "patient").gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_DAY) return json({ error: "rate_limited" }, 429);

  // Deterministinen hätätarkistus ENNEN mallia.
  const flag = message ? triage(message) : null;

  const { data: profile } = await asUser
    .from("patient_profiles").select("measurements, omahoito, care_paths")
    .eq("user_id", uid).maybeSingle();

  const { data: history } = await asService
    .from("coach_messages").select("role, body")
    .eq("patient_user_id", uid).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
  const prior = (history || []).reverse();

  const measurements = ((profile?.measurements as any[]) || []).slice(-30);
  const omahoito = (profile?.omahoito as any) || {};
  // Mallille vain mittaukset ja tavoitteet — ei nimeä, sähköpostia eikä lääkelistaa.
  const context = {
    tavoitteet: (omahoito.goals || []).map((g: any) => ({
      mittari: g.metric, tavoite: g.target, lahtoarvo: g.start, otsikko: g.label })),
    mittaukset: measurements.map((m: any) => ({ tyyppi: m.type, arvo: m.value, pvm: m.date })),
    paivamaara: new Date().toISOString().slice(0, 10),
  };

  const messages: any[] = [];
  messages.push({
    role: "user",
    content: `[Järjestelmä: potilaan omat tiedot Aatami-sovelluksesta]\n${JSON.stringify(context)}`,
  });
  messages.push({ role: "assistant", content: "Selvä, otan tiedot huomioon." });
  for (const m of prior) {
    messages.push({ role: m.role === "patient" ? "user" : "assistant", content: m.body });
  }
  if (message) {
    let text = message;
    if (flag === "emergency") {
      text += `\n\n[Järjestelmä: viesti osui hätäoiresanastoon. Käyttöliittymä näyttää
potilaalle jo 112-ohjeen. Älä arvioi oiretta äläkä sano onko se kiireellinen —
suhtaudu rauhallisesti, kehota soittamaan 112 tai ottamaan yhteys päivystykseen.]`;
    } else if (flag === "crisis") {
      text += `\n\n[Järjestelmä: viesti osui itsetuhoisuussanastoon. Käyttöliittymä näyttää
jo kriisiohjeen. Vastaa lämpimästi ja lyhyesti, älä arvioi tilannetta, ohjaa
kriisipuhelimeen 09 2525 0111 ja hätätilanteessa 112.]`;
    }
    messages.push({ role: "user", content: text });
  } else if (!prior.length) {
    messages.push({
      role: "user",
      content: "Aloita keskustelu: kirjoita lyhyt tervehdys ja yksi huomio omista " +
        "mittauksistani, ja kysy mistä haluaisin puhua. Jos mittauksia ei ole, " +
        "pyydä kirjaamaan ensimmäinen mittaus.",
    });
  } else {
    return json({ error: "empty_message" }, 400);
  }

  const anthropic = new Anthropic({ apiKey });
  let reply = "";
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 800,
      system: SYSTEM,
      messages,
    } as any);
    if (msg.stop_reason === "refusal") throw new Error("refusal");
    reply = (msg.content.find((b: any) => b.type === "text") as any)?.text || "";
  } catch (e) {
    console.error("anthropic_failed", e);
    return json({ error: "coach_unavailable" }, 502);
  }
  if (!reply) return json({ error: "coach_unavailable" }, 502);

  const rows: any[] = [];
  if (message) rows.push({ patient_user_id: uid, role: "patient", body: message, flag });
  rows.push({ patient_user_id: uid, role: "coach", body: reply });
  const { error: insErr } = await asService.from("coach_messages").insert(rows);
  if (insErr) console.error("insert_failed", insErr);

  return json({ reply, flag });
});
