/**
 * Aatami-valmentaja — Supabase Edge Function
 *
 * Lukee potilaan OMAT mittaukset ja tavoitteet palvelimella (JWT + RLS) ja
 * pyytää Claudelta lyhyen huomion suomeksi. Client ei lähetä dataa — se
 * lähettää vain oman tokeninsa, joten kukaan ei voi pyytää huomiota toisen
 * potilaan luvuista.
 *
 * JURIDINEN RAJAUS (ks. CLAUDE.md): valmentaja EI ole terveydenhuollon
 * ammattihenkilö eikä sen teksti ole potilasasiakirja. Systeemipromptissa
 * kielletään diagnoosit, lääkeohjeet ja hoitopäätökset — ne kuuluvat
 * lääkärille potilastietojärjestelmässä.
 *
 * Vaatii salaisuuden: ANTHROPIC_API_KEY
 *   supabase secrets set ANTHROPIC_API_KEY=...
 */
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/* Valmentajan rajat. Tätä ei saa löysentää ilman kliinistä harkintaa:
   ilman rajausta malli alkaa tulkita verenpainelukemia ja ehdottaa lääkitystä. */
const SYSTEM = `Olet "Aatami-valmentaja", suomalaisen Aatami-terveyspalvelun omahoitovalmentaja.
Puhut potilaalle suoraan, sinuttelet, olet lämmin ja kannustava mutta et imartele.

MITÄ TEET:
- Kuvaat mitä potilaan omissa mittauksissa on tapahtunut (suunta, kehitys tavoitetta kohti).
- Annat yhden konkreettisen, arkeen sopivan elintapavinkin (liikunta, ravinto, uni, stressi).
- Ehdotat yhden pienen seuraavan askeleen, jonka voi tehdä tällä viikolla.

MITÄ ET KOSKAAN TEE:
- Et tee diagnoosia etkä arvioi onko jokin arvo sairaus, "normaali" tai "hälyttävä".
- Et anna lääkeohjeita: et ehdota lääkkeen aloitusta, lopetusta, annosmuutosta tai vaihtoa.
- Et anna hoito-ohjeita etkä tee hoitopäätöksiä — ne tekee lääkäri.
- Et lupaa tuloksia etkä esitä arvioita ennusteesta.
- Et keksi mittauksia, lukuja tai tapahtumia joita datassa ei ole.

JOS DATA HERÄTTÄÄ HUOLTA (esim. arvot nousevat selvästi, mieliala laskee):
älä arvioi tilannetta itse, vaan kehota olemaan yhteydessä omaan lääkäriin ja
muistuta, että hätätilanteessa soitetaan 112. Aatamia ei valvota reaaliaikaisesti.

TYYLI: suomea, ei lääketieteellistä jargonia, jokainen kenttä 1–2 lyhyttä
virkettä. Puhu vain siitä datasta joka sinulle annetaan.`;

const SCHEMA = {
  type: "object",
  properties: {
    havainto: { type: "string", description: "Mitä potilaan omissa mittauksissa on tapahtunut." },
    vinkki: { type: "string", description: "Yksi konkreettinen elintapavinkki." },
    seuraava_askel: { type: "string", description: "Yksi pieni askel tälle viikolle." },
  },
  required: ["havainto", "vinkki", "seuraava_askel"],
  additionalProperties: false,
};

/** Tiivistää mittaukset: viimeisin, ensimmäinen ja määrä per tyyppi (ei koko historiaa). */
function summarise(measurements: any[]) {
  const byType: Record<string, any[]> = {};
  for (const m of measurements || []) {
    if (!m || !m.type) continue;
    (byType[m.type] = byType[m.type] || []).push(m);
  }
  return Object.entries(byType).map(([type, arr]) => {
    arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const recent = arr.slice(-8).map((m) => ({ pvm: m.date || null, arvo: m.value }));
    return { tyyppi: type, mittauksia: arr.length, viimeisimmat: recent };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "missing_api_key" }, 503);

  const auth = req.headers.get("Authorization") || "";
  if (!auth) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  // RLS rajaa rivin omistajaan — funktio ei voi lukea toisen potilaan profiilia.
  const { data: profile, error: profErr } = await supabase
    .from("patient_profiles")
    .select("measurements, omahoito, care_paths")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (profErr) return json({ error: "profile_read_failed" }, 500);

  const measurements = (profile?.measurements as any[]) || [];
  if (!measurements.length) return json({ error: "no_data" }, 422);

  const omahoito = (profile?.omahoito as any) || {};
  const carePaths = (profile?.care_paths as any) || {};
  const activePath = Object.keys(carePaths).find(
    (k) => (carePaths[k]?.status || "active") === "active",
  ) || null;

  // Vain kliinisesti merkitykselliset signaalit — ei nimeä, ei sähköpostia, ei lääkelistaa.
  const payload = {
    tavoitteet: (omahoito.goals || []).map((g: any) => ({
      mittari: g.metric, tavoite: g.target, lahtoarvo: g.start, otsikko: g.label,
    })),
    aktiivinen_hoitopolku: activePath,
    mittaukset: summarise(measurements),
    paivamaara: new Date().toISOString().slice(0, 10),
  };

  const anthropic = new Anthropic({ apiKey });
  let msg;
  try {
    msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 700,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: "Tässä potilaan omat tiedot Aatami-sovelluksesta. Kirjoita hänelle " +
          "lyhyt huomio, vinkki ja seuraava askel.\n\n" + JSON.stringify(payload, null, 2),
      }],
    } as any);
  } catch (e) {
    console.error("anthropic_failed", e);
    return json({ error: "coach_unavailable" }, 502);
  }

  if (msg.stop_reason === "refusal") return json({ error: "coach_unavailable" }, 502);

  const text = msg.content.find((b: any) => b.type === "text")?.text;
  if (!text) return json({ error: "coach_unavailable" }, 502);

  let parsed;
  try { parsed = JSON.parse(text); } catch { return json({ error: "coach_unavailable" }, 502); }

  return json({
    havainto: String(parsed.havainto || ""),
    vinkki: String(parsed.vinkki || ""),
    seuraava_askel: String(parsed.seuraava_askel || ""),
    luotu: new Date().toISOString(),
  });
});
