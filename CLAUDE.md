# Aatami — projektin pohja

Aatami on suomalainen yleislääkäripalvelu: fyysiset toimipisteet reaaliaikaisella
jonotuksella, etävastaanotot (Vastaanotto.fi:n kautta), verkkokauppa
(lisäravinteet + omahoito-ohjelmat) ja potilassovellus (PWA). Tämä tiedosto on
suunnittelun pohja — päivitä sitä kun arkkitehtuuri tai konseptit muuttuvat,
älä anna sen vanhentua hiljaisesti.

**Ylläpito:** tätä tiedostoa päivitetään aina kun jotain tässä kuvattua
muuttuu — uusi konsepti, tietomallin muutos, aukko sulkeutuu tai uusi
ilmestyy, uusi pysyvä rajoite. Päivitys tehdään osana samaa muutosta, ei
erillisenä myöhempänä tehtävänä, jotta tiedosto ei pääse valehtelemaan
nykytilasta.

## Kolme sivustoa, yksi Supabase-projekti

| Tiedosto | Rooli | Kirjautuminen |
|---|---|---|
| `index.html` | Markkinointisivu + jonotuksen liittymismodaali | jaettu istunto app.html:n kanssa |
| `app.html` | Potilaan oma sovellus (PWA, asennettava) | `aatami-patient-auth` |
| `staff.html` | Lääkärin/henkilökunnan konsoli | `aatami-staff-auth` |

Kaikki ovat itsenäisiä, yhden tiedoston HTML-sovelluksia (ei build-vaihetta).
Supabase JS ladataan CDN:stä, asiakas on aina nimeltään `sb` (ei `supabase` —
se törmää CDN:n globaaliin muuttujaan). `index.html` ja `app.html` jakavat
saman auth-istunnon storageKeyn ansiosta, joten kirjautuminen tapahtuu vain
sovelluksessa — nettisivun "Kirjaudu"-linkit vievät suoraan `app.html`:ään.

Supabase-projekti: `ruesbriqeecwyacnfqry`. Deploy: GitHub Pages
(`Nougat3/aatami`, `git push` + `gh api repos/Nougat3/aatami/pages/builds -X
POST` builderin nopeuttamiseksi). Demo-potilas: `toni.demo@aatamiterveys.fi`.

## Juridinen raja: hoitopolku EI ole potilasasiakirja

Tämä on perustavanlaatuinen rajaus, joka määrää mitä Aatamiin saa tallentaa:

| | Potilaskertomus | Aatamin hoitopolku |
|---|---|---|
| Missä | Potilastietojärjestelmä, siirtyy Kantaan | Aatami-sovellus |
| Mitä | Diagnoosi (esim. I10), lääkemääräys, kliininen arvio | Tehtävälista päivämäärineen |
| Sääntely | Potilasasiakirja-asetus | Ei potilasasiakirja |

Lääkäri pitää vastaanoton ja kirjaa **virallisen sisällön normaalisti
potilastietojärjestelmään**. Aatamiin syntyy vain potilaan oma muistilista.
Siksi lääkäri **ei kirjoita hoitopolkua vapaana tekstinä** — hän valitsee
mallipohjan (esim. "Verenpaine v1"), voi poistaa tarpeettomat tehtävät ja
lisätä 1–2 omaa. Molemmissa käyttöliittymissä on tämä rajaus näkyvissä
tekstinä, jottei sitä unohdeta.

**Tehtävät kopioidaan potilaalle määrityshetkellä** (`plan.tasks`), ei
viitata pohjaan elävästi. Näin pohjan myöhempi muokkaus (v1 → v2) ei muuta
takautuvasti jo hoidossa olevan potilaan listaa. Todennettu testillä.

### Palvelukuvaus (virallinen sanamuoto)

Tämä teksti on sekä `index.html`:n hoitopolut-osiossa että `app.html`:n
hoitopolkujen valintaruudussa — pidä ne synkassa:

> Aatami on digitaalinen hoitopolku- ja seurantapalvelu, jossa
> terveydenhuollon ammattihenkilö suunnittelee potilaan hoitopolun. Palvelu
> auttaa potilasta toteuttamaan lääkärin antamia ohjeita, seuraamaan
> omahoitoa ja muistamaan sovitut tehtävät. Kaikki diagnoosit,
> lääkemääräykset ja hoitopäätökset tehdään erillisessä
> potilastietojärjestelmässä terveydenhuollon ammattihenkilön toimesta.

### Tavoiteltu työnkulku

1. Potilas varaa etävastaanoton (Vastaanotto.fi)
2. Etävastaanotto pidetään
3. Lääkäri kirjaa potilaskertomuksen ja reseptit **omassa
   potilastietojärjestelmässään**
4. Lääkäri avaa Aatamin ja valitsee potilaalle sopivan hoitopolun
5. Potilas saa tehtävälistan ja muistutukset

**Vaihe 4 ratkaistu kertakoodilla.** Potilas luo profiilissaan 8-merkkisen
koodin (`create_access_code`, voimassa 30 min) ja kertoo sen lääkärille.
Lääkäri lunastaa sen staff.html:ssä (`staff_claim_access_code`) ja saa
`grant_id`:n, jolla toimii. Lunastettu oikeus on **pysyvä kunnes potilas
peruu sen** (`revoke_access_grant`) — kontrolli tapahtuu vasta viikkojen
päästä, joten lyhyt vanheneminen katkaisisi hoidon. Potilas näkee ja peruu
myönnöt profiilissaan.

Kaikki lääkärin RPC:t ottavat joko `p_queue_entry_id`:n tai `p_grant_id`:n;
oikeustarkistus on yhdessä paikassa (`staff_resolve_patient`). Todennettu:
potilas ei voi lunastaa koodia, toinen lääkäri ei voi käyttää toisen
myöntöä, ja perumisen jälkeen pääsy katkeaa välittömästi.

**Sovelluksessa ei ole enää demodataa.** Vastaanotot, Viestit ja Profiili
näyttivät aiemmin kovakoodattua valedataa (keksitty vastaanottoaika,
valeviestit, "Ikä 42 v"). Kaikille käyttäjille näkyvä keksitty
vastaanottoaika on terveyspalvelussa vakava — potilas voi luulla, että
hänellä on oikea aika. Nämä on korvattu oikealla datalla tai rehellisellä
tyhjällä tilalla. **Älä lisää demodataa käyttöliittymään** — käytä tyhjää
tilaa tai oikeaa dataa.

**Viestit = keskustelu AI-valmentajan kanssa**, ei lääkärin ketju. Lääkäriin
otetaan yhteys erikseen etävastaanotolla (Vastaanotto.fi). Potilaan ja lääkärin
viestintä `care_messages`-taulussa on **purettu käyttöliittymistä** (app.html ja
staff.html); taulu ja `staff_*_care_message*`-RPC:t ovat yhä kannassa mutta
kytkemättä mihinkään — älä lisää niitä takaisin ilman että lääkärille syntyy
oikea tapa huomata viesti, muuten potilaan viesti katoaa mustaan aukkoon.

Ajanvarausta Aatamissa ei ole (se on Vastaanotto.fi:ssä).

### Aatami-valmentaja (AI) — `supabase/functions/coach-chat`

Viestit-näkymä on keskustelu Claudella toteutetun valmentajan kanssa
(`claude-opus-4-8`). Periaatteet:

- **Hätäohje ei ole mallin vastuulla.** Potilaan viesti tarkistetaan
  deterministisellä sanastolla *ennen* mallia (`triage()`), ja osuma pakottaa
  112- tai kriisikortin näkyviin **riippumatta mallin vastauksesta**. Malli voi
  epäonnistua, sanasto ei. Sama periaate kuin kyselyn `crisis_if`-listassa.
  Sanasto on testattu: `supabase/functions/coach-chat/triage.test.mjs`.
- **Suomen sanajärjestys on vapaa** — monisanaisia fraaseja ei saa käyttää
  sanastossa ("puristaa rinnassa" ei osu tekstiin "rinnassa puristaa"). Käytä
  vartalopareja: molempien ryhmien sanan on esiinnyttävä, järjestyksellä ei väliä.
- **Potilas ei voi kirjoittaa `coach_messages`-tauluun** (RLS: vain select ja
  delete). Kaikki rivit syntyvät Edge Functionin kautta, joten valmentajan
  vastausta ei voi väärentää eikä hätätarkistusta ohittaa.
- **Client ei lähetä dataa** — funktio lukee mittaukset ja tavoitteet itse
  JWT:llä RLS:n läpi. Mallille ei mene nimeä, sähköpostia eikä lääkelistaa.
- **Raja: yleinen terveystieto sallittu, henkilökohtainen arvio ei.** Malli ei
  saa arvioida potilaan omia arvoja, tehdä diagnoosia, antaa lääkeohjeita eikä
  triagea. Raja on liukas — älä löysennä sitä ilman kliinistä harkintaa.
- **Kustannuskatto:** 40 viestiä/vrk/potilas ja historiasta viimeiset 20 viestiä.
  Endpoint on autentikoitu, mutta ilman rajaa kuka tahansa rekisteröitynyt voisi
  käyttää sitä ilmaisena mallikutsuna.

Vaatii Supabase-salaisuuden `ANTHROPIC_API_KEY`.

### Kyselyt: kertaluonteinen vs. toistuva

Kaksi eri asiaa, eri tauluissa — älä sekoita niitä:

| | Hoitopolun terveyskysely | Pisteytetty seurantakysely |
|---|---|---|
| Missä | `patient_profiles.care_paths[slug].answers` | `survey_responses` (rivi per täyttökerta) |
| Milloin | Kerran polun alussa | Toistuvasti |
| Sisältö | Sanoja ("Kyllä", "3-4 kertaa viikossa") | Pisteitä (0-3 per kysymys) |
| Kehitys-sivulla | Vastauslista | **Käyrä** |

Kertaluonteisesta kyselystä **ei voi piirtää käyrää** — siitä ei synny aikasarjaa
eivätkä vastaukset ole lukuja. Älä yritä; se tarkoittaisi datan keksimistä.

**PHQ-9 (`survey_templates.slug='phq9'`)**: kysymykset ovat dataa, ei koodia —
lääkäri muokkaa niitä ilman koodimuutosta. Huomioitavaa:

- **Kysymys 9 on itsetuhoisuuskysymys.** `crisis_item='q9'`: nollaa suurempi
  vastaus pakottaa kriisiohjeen näkyviin **heti täytön aikana**, johdettuna
  vastauksesta — ei pistesummasta eikä mallista. Kortti vieritetään näkyviin,
  koska kysymys 9 on lomakkeen alimpana.
- **Potilaalle ei näytetä tulkintaa.** Pistemäärä ja suunta näkyvät, mutta ei
  vaikeusastetta ("keskivaikea masennus") — se on kliininen arvio ja kuuluu
  lääkärille. Sama raja kuin verenpaineessa: luku näytetään, tulkinta ei.
- **Sanamuodot ovat LUONNOS.** Ne on tarkistettava virallista suomenkielistä
  PHQ-9-lomaketta vasten ennen potilaskäyttöä: löyhästi käännetyn validoidun
  mittarin pisteitä ei voi verrata validoituihin raja-arvoihin.

**HUOM koodin rakenne:** `app.html`:ssä on tasan yksi `<style>`- ja yksi
`<script>`-lohko. Kun lisäät JS:ää skriptillä, varmista että ankkuri on
`<script>`-lohkon puolella — JS on kerran vahingossa päätynyt
`<style>`-lohkoon, jolloin se ei suoriudu lainkaan eikä mikään ilmoita
virheestä.

**Vaihe 5:n muistutukset puuttuvat:** tehtävillä on eräpäivät ja
myöhässä-merkintä, mutta mikään ei muistuta potilasta (ei push-ilmoituksia
eikä sähköpostia).

## Aloitus: etäpalvelu ensin

Aatami käynnistyy **etäpalveluna**. Etähoitopolut alussa: Verenpaine ja
kolesteroli, Mieliala ja jaksaminen, Painonhallinta. Toimipisteet ja
reaaliaikainen jonotus **säilyvät koodissa** ja otetaan käyttöön myöhemmin
— niitä ei poisteta. Jonoon pääsee yhä toimipistesivun kautta
(`ldJoinBtn`), mutta se ei ole enää etusivun pääkehotus.

**Toimipisteet eivät ole vielä auki.** `index.html` sanoo tämän suoraan
(`.coming-note`) — sivu ei saa väittää niiden toimivan. Aiempi teksti
"Tampere, Oulu ja Seinäjoki jo nyt" oli väärä väite ja on poistettu.
Samoin App Store-/Google Play -painikkeet: sovellus on PWA, eikä
kauppalistauksia ole.

**Nettisivu myy alussa vain hoitopolkuja.** Navigaatiossa aktiivisia ovat
`Hoitopolut`, `Etävastaanotot` ja `Aatami`. Palvelut, Toimipisteet ja
Verkkokauppa näkyvät `.nav-soon`-tyylillä ("Tulossa") mutta eivät ole
klikattavia — sivut ja koodi jäävät paikalleen myöhempää käyttöönottoa
varten, ja niihin pääsee yhä suoralla hash-osoitteella. Ostoskorin nappi
on poistettu navigaatiosta (kauppa ei ole käytössä); `openCart`-koodi jää,
mutta kytkentä on null-suojattu.

**Hinnoittelu:** hoitopolku ja seuranta ovat maksuttomia. Raha tulee
etävastaanotoista Vastaanotto.fi:n kautta. Hoitopolulle ei siis rakenneta
ostoa. Omahoito on erikseen maksullinen (moduulihinnat).

### Kriisiturva mielialapolussa

`care_path_templates.crisis_note` + kysymyksen `crisis_if`-lista: jos
potilas valitsee merkityn vastauksen (esim. itsetuhoiset ajatukset),
sovellus näyttää **heti** kriisiohjeen (112, kriisipuhelin 09 2525 0111) ja
kertoo ettei Aatamia valvota reaaliaikaisesti. Tila johdetaan vastauksista,
ei DOM:ista — muuten uudelleenrenderöinti pyyhkisi ilmoituksen.

Tämä on pakollinen aina kun kyselyssä on kriisiin viittaava kysymys:
hiljainen kirjaus ei riitä, koska kukaan ei lue vastausta yöllä.

## Ydinkonsepti: Hoitopolku vs. Omahoito — kaksi eri asiaa

Tämä jako on perustavanlaatuinen eikä pelkkä UI-yksityiskohta:

- **Hoitopolku** = 9-vaiheinen kliininen polku kyselystä kontrolliin.
  Potilas voi **astua polkuun itse** (vaiheet 1–5: valinta,
  tunnistautuminen, terveyskysely, kotimittaukset, etävastaanotto), mutta
  **kliinisen päätöksen tekee aina lääkäri** vaiheessa 6
  (hoitosuunnitelma) sekä vaiheissa 8–9 (kontrolli, päätös). Palvelin
  pakottaa tämän rajan: `advance_care_path` heittää virheen jos potilas
  yrittää edetä vaiheesta 5 eteenpäin.
- **Omahoito** = potilaan itse ostama ja etenevä ohjelma: liikunta,
  ravitsemus, stressinhallinta, uni — ja **päätöksellä 2026-08-17** myös
  potilaan oma raportointi käytössä olevasta lääkkeestä ja sen koetusta
  vaikutuksesta (esim. "erektiolääke tuntui auttavan tänään": kyllä/ei/
  jonkin verran). Raja ei ole "lääkkeetön" vaan **ei kliinistä
  päätöksentekoa**: potilas voi *kirjata* lääkkeen ja oman kokemuksensa
  siitä, mutta omahoito ei koskaan **aloita, lopeta, vaihda tai annostele**
  lääkitystä — se on aina hoitopolku ja lääkärin päätös. Sama raja kuin
  `patient_profiles.medications`-listalla: potilas listaa, lääkäri päättää.

Sama potilas voi olla yhtä aikaa sekä aktiivisessa hoitopolussa (esim.
Verenpaine: lääkäri seuraa verikokeita ja lääkitystä) että vastaavassa
omahoito-tavoitteessa (elämäntapamuutos) — nämä ovat rinnakkaisia, toisiaan
täydentäviä, eivät korvaavia.

### Omahoito on YKSI henkilökohtainen suunnitelma, ei valikko ohjelmia

Potilas ei valitse nimettyä "ohjelmaa" kaupasta. Hän kertoo tavoitteensa
(esim. "RR alle 125/75") sovelluksessa, ja suunnitelma **kootaan** valmiiksi
kirjoitetuista **moduuleista** (`omahoito_modules`-taulu, yksi rivi per
aihealue: Verenpaine, myöhemmin Paino, Uni, Stressi...). Hinta on näiden
moduulien hintojen summa — ei kiinteä pakettihinta. Lääkäri (tuotteen
omistaja) kirjoittaa moduulien sisällön etukäteen; potilaan ei koskaan
tarvitse valita "ohjelman nimeä", vain tavoite.

Moduulit ovat 12 viikon mittaisia, kertaostoja (esim. Verenpaine 89 €),
koska kiinteä alku ja loppu motivoi muutokseen paremmin kuin jatkuva
kuukausiveloitus. 12 viikon jälkeen moduuli siirtyy "ylläpitoon" — ei uutta
maksua, potilas jatkaa vain olemassa olevalla, ilmaisella
Mittaukset-seurannalla. Jos tavoite ei täyty, sovellus ohjaa varaamaan
etävastaanoton (→ hoitopolku, lääkärin arvioitavaksi).

Nettisivun kauppa (`index.html#verkkokauppa`) ei enää myy omahoitoa
nimettyinä tuotteina — siellä on vain teaser-kortti joka ohjaa
`app.html`:ään, missä varsinainen tavoitteiden valinta ja osto tapahtuu.

## Tietomalli (todennettu suoraan tietokannasta)

`patient_profiles` (RLS: vain omistaja + potilaan oman klinikan lääkäri):
`user_id, full_name, phone, medications jsonb, measurements jsonb,
care_paths jsonb, omahoito jsonb, updated_at`. `omahoito`-kentän muoto:
```
{ purchased, purchased_at, price_paid_eur,
  goals: [{module: "verenpaine", target: "125/75"}],
  modules: { verenpaine: {week, tasks_done: {"1":["t1","t2"]}, completed} } }
```

`care_path_templates` (julkinen luku aktiivisille): `slug, name, full_name,
intro, steps jsonb (9 vaihetta: n, key, title, by=patient|doctor|shared,
body), questionnaire jsonb (terveyskyselyn kysymykset), measurements jsonb
(vaaditut kotimittaukset + target_count), labs jsonb, is_active,
sort_order`. Lääkäri kirjoittaa kyselyn ja ohjeet suoraan tähän — ei
koodimuutosta. `patient_profiles.care_paths`-muoto:
```
{ verenpaine: { started_at, step, answers, plan:{text,target,by,at},
                controls: [], status: "active"|"ended" } }
```
`care_path_templates` sisältää lisäksi `version` ja `tasks jsonb`:
`[{id, day, label, type, meas_type, target_count, optional, help}]`.
`type`: `measurement` (kuittautuu mittausdatasta), `lab`, `med`, `survey`,
`booking`, `custom`. `day` on siirtymä alkupäivästä; `due_date` lasketaan
määrityshetkellä.

RPC:t: `start_care_path(slug)` (potilas aloittaa),
`advance_care_path(slug, answers)` (potilas etenee, estää vaiheen 5 yli),
`staff_assign_care_plan(queue_entry_id, slug, start_date,
excluded_task_ids, extra_tasks, target)` (lääkäri määrittää mallipohjan →
vaihe 7, kopioi tehtävät päivämäärineen),
`complete_care_task(slug, task_id, done)` (potilas kuittaa),
`staff_control_care_path(...)` (kontrolli ja päätös).

Sekä vaihe 4 että `measurement`-tyyppiset tehtävät kuittautuvat **oikeasta
mittausdatasta** (lasketaan `measurements`-listasta), ei potilaan rastista.

`omahoito_modules` (julkinen luku aktiivisille): `slug, name, goal_label,
target_unit, default_target, price_eur, weeks jsonb, is_active,
sort_order`. `weeks` on 12 alkion taulukko: `{week, theme, body,
tasks:[{id,label}]}` per viikko — tähän lääkäri kirjoittaa/muokkaa
sisällön suoraan (SQL tai myöhempi editori), ei koodimuutosta.

`purchase_omahoito_plan(p_modules)`-RPC (SECURITY DEFINER) laskee hinnan
palvelimella `omahoito_modules`-taulusta ja kirjoittaa
`patient_profiles.omahoito`:n — sama luottamusperiaate kuin
`place_order`:ssa, client ei koskaan päätä hintaa. Tehtävien
kuittaus/viikon eteneminen sen jälkeen on suora client-side
`patient_profiles`-päivitys (RLS: owner-only update), sama malli kuin
hoitopolun `saveCareState()`.

`products` (julkinen luku): `slug, name, category, description, price_eur,
badge, sort_order, is_active, ingredients jsonb, billing`. Vanha
`Omahoito-ohjelma`-kategoria on `is_active=false` (korvattu
`omahoito_modules`-mallilla) — jäljellä vain lisäravinteet.

`lab_results`, `queue_entries`, `doctors`, `clinics`, `orders`,
`order_items` — ks. koodi tarkkoihin sarakkeisiin tarvittaessa
(`mcp__supabase__list_tables`).

Lääkäri näkee potilaan tiedot `staff_get_patient_profile`-RPC:n kautta
(SECURITY DEFINER, rajattu saman klinikan lääkäriin jonorivin perusteella).

## Tunnetut aukot silmukassa (päivitetty 2026-07-26, todennettu koodista/kannasta)

Näiden sulkeminen tekee "lääkäri näkee kaiken ja voi luoda hoitopolun"
-lupauksesta todellisen pelkän tekstin sijaan:

1. ~~Osto ei aktivoi omahoito-ohjelmaa~~ **Suljettu.** `purchase_omahoito_plan`
   aktivoi suunnitelman suoraan ostohetkellä.
2. ~~Lääkäri ei näe omahoitoa eikä hoitopolkua~~ **Suljettu.**
   `staff_get_patient_profile` palauttaa nyt myös `care_paths, omahoito`.
3. ~~Lääkärillä ei ole työkalua luoda hoitopolkua~~ **Suljettu.**
   `staff.html` näyttää potilaan esitiedot ja hoitopolun vaiheen, ja
   sisältää lomakkeet vaiheelle 6 (`staff_set_care_plan`) sekä
   kontrollille/päätökselle (`staff_control_care_path`). Kesken
   kirjoitettu suunnitelma säilyy `planDrafts`-muuttujassa
   realtime-uudelleenrenderöinnin yli.

**Silmukka on nyt kokonainen**: potilas valitsee polun → kysely →
mittaukset → etävastaanotto → lääkäri kirjoittaa suunnitelman → seuranta
→ kontrolli → polku päättyy tai jatkuu.

## Uudelleenpositiointi: miesten terveys (päätetty 2026-08-17, kesken)

Aatami siirtyy yleislääkäripalvelusta **miesten terveyden** (n. 30–70 v.)
digipalveluksi — "Seuraa. Ymmärrä. Hoida." Päätös on tehty, mutta
**toteutus on kesken**: nettisivun (`index.html`) yleiskuvaus, otsikot ja
palvelukuvaus ovat yhä vanhalla yleislääkäri-sanamuodolla eivätkä ole vielä
päivittyneet tähän. Älä oleta positiointia valmiiksi vain siksi että tämä
rivi on kirjoitettu — tarkista `index.html` erikseen. Positioinnin ja markkinointitekstin lopullinen sanamuoto kuuluu alla olevan
"Sisältöperiaate"-kohdan alle: käyttäjä (lääkäri) kirjoittaa sen itse.

Kuusi pääaluetta ja niiden nykyinen arkkitehtuurikartoitus:

| Alue | Malli | Tila |
|---|---|---|
| Verenpaine | Hoitopolku + Omahoito | Valmis |
| Paino | Omahoito | Valmis (moduuli), lääkitysseuranta puuttuu |
| Jaksaminen | `survey_templates` (slug `jaksaminen`) | Valmis — 5 osa-aluetta, asteikko 1–5, ei kriisitarkistusta |
| Erektio | Uusi omahoito-tyylinen oireseuranta + lääkevaikutuksen itseraportointi | Ei aloitettu |
| Eturauhanen/virtsaaminen | `survey_templates`, validoitu **IPSS**-mittari | Ei aloitettu — IPSS:n kysymykset ja pisteytys on tarkistettava virallisesta lähteestä, ei arvattava |
| Hiustenlähtö | Valokuvaseuranta | Ei aloitettu — vaatii uuden kyvykkyyden (kuvatallennus), ei istu kysely- tai mittausmalliin sellaisenaan |

Rakennusjärjestys päätetty: Jaksaminen ensin (valmis), sitten
Eturauhanen/IPSS ja Erektio, Hiustenlähtö erikseen omana, isompana
tehtävänään.

### Kyselymoottori on nyt geneerinen (`survey_templates.options`)

PHQ-9:n kiinteä "kuinka usein" -asteikko ei sovi kaikkiin kyselyihin.
Vastausvaihtoehdot ovat nyt `survey_templates.options`-sarakkeessa (jsonb),
ei koodissa — jokainen kysely voi määritellä oman asteikkonsa. Uusi kysely
(esim. tuleva IPSS) ilmestyy potilaan plus-valikon kyselyvalitsimeen heti
kun rivi lisätään `survey_templates`-tauluun, ei vaadi koodimuutosta.
`crisis_item`/`crisis_note` on edelleen vain PHQ-9:n kaltaisille kyselyille
joissa on itsetuhoisuuskysymys — muut kyselyt jättävät sen tyhjäksi.

## Omahoidon seuraavat laajennukset (kun runko on validoitu)

- Lisää moduuleita `omahoito_modules`-tauluun (Paino, Uni, Stressi...) —
  ei vaadi koodimuutosta app.html:ään, `MODULE_ICON`-kartta app.html:ssä
  pitää päivittää uudella slugilla.
- Tehtävien automaattinen kuittaus mittausdatasta itseraportoinnin sijaan
  (nyt: potilas rastittaa itse, ei kytköstä oikeisiin mittauksiin).
- Lääkärin näkyvyys omahoidon etenemään (aukko #2 yllä).

## Sisältöperiaate: alusta ensin, kliininen sisältö erikseen

Käyttäjä on itse lääkäri ja kirjoittaa viralliset/kliiniset tekstit itse.
Oma roolini on rakentaa **tekninen alusta** jolla sisältöä voi kirjoittaa ja
muokata ilman koodimuutoksia (sisältö dataksi Supabaseen, ei kovakoodattuna
`app.html`:ään) — en kirjoita lopullista kliinistä sisältöä itse.

Omahoito-ohjelman tehtävät kannattaa kytkeä oikeaan mittausdataan
itseraportoinnin (rasti ruutuun) sijaan aina kun mahdollista — muuten
ohjelma mittaa vain klikkausaktiivisuutta, ei oikeaa käyttäytymistä.

## Sovelluksen ulkoasu (app.html)

`app.html` on **yhtenäisen tumma** (Opal-tyylinen: selkeä ja pelkistetty),
toisin kuin `index.html` joka pitää vaalean cream-ilmeensä. Kaikki värit
tulevat `:root`-muuttujista — älä kovakoodaa vaaleita tekstivärejä tai
`#fff`-taustoja, ne jäävät lukukelvottomiksi. Kulta (`--gold*`) on ainoa
korostusväri. Alapalkki (mobiili) on **kelluva pilleri**, irti ruudun
reunoista — ei kiinni pohjassa.

Kontrastisääntö: himmeimmän tekstin (`--muted`) on ylitettävä 4.5:1
korttitaustaa (`--card`) vasten — tarkista jos muutat sävyjä.

## Muut voimassa olevat rajoitteet

- Toimipisteet ja reaaliaikainen jonotus säilytetään aina — ei poisteta
  osana omahoito/hoitopolku-kehitystä.
- Etävastaanotto tapahtuu Vastaanotto.fi:n kautta, ei suoraan Aatamin
  omassa kaupassa.
- Hinnat lasketaan/tarkistetaan aina palvelinpuolella (RPC), ei koskaan
  luoteta clientin lähettämään hintaan.
- Suomen kieli läpi koko käyttöliittymän.
