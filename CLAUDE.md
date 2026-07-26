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

## Ydinkonsepti: Hoitopolku vs. Omahoito — kaksi eri asiaa

Tämä jako on perustavanlaatuinen eikä pelkkä UI-yksityiskohta:

- **Hoitopolku** = lääkärin suunnittelema kliininen polku: verikokeet,
  lääkehoito, seuranta. Vaatii aina lääkärin päätöksen — potilas ei voi
  aloittaa sitä itse. Syntyy vastaanotolla.
- **Omahoito** = lääkkeetön, potilaan itse ostama ja etenevä ohjelma:
  liikunta, ravitsemus, stressinhallinta, uni. Turvallista tarjota suoraan
  ilman lääkärin väliintuloa, koska ei sisällä kliinistä päätöksentekoa.

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
2. **Lääkäri ei näe omahoitoa eikä hoitopolkua.**
   `staff_get_patient_profile` palauttaa vain
   `full_name, phone, medications, measurements`.
3. **Lääkärillä ei ole työkalua luoda hoitopolkua.** Ei UI:ta, ei RPC:tä joka
   kirjoittaisi `care_paths`-kenttään — app.html:n teksti ("lääkärisi luo
   sen vastaanotolla") ei vielä toteudu missään.

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

## Muut voimassa olevat rajoitteet

- Toimipisteet ja reaaliaikainen jonotus säilytetään aina — ei poisteta
  osana omahoito/hoitopolku-kehitystä.
- Etävastaanotto tapahtuu Vastaanotto.fi:n kautta, ei suoraan Aatamin
  omassa kaupassa.
- Hinnat lasketaan/tarkistetaan aina palvelinpuolella (RPC), ei koskaan
  luoteta clientin lähettämään hintaan.
- Suomen kieli läpi koko käyttöliittymän.
