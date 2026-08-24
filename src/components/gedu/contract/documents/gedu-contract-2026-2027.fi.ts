import type { GeduContractDocument } from "../contract-document";

/**
 * Pelikasvattajan sopimusehdot (Gedu-sopimus), version 2026-2027 — the binding
 * Finnish text, transcribed verbatim from the signed-off source document.
 *
 * **This file is a legal instrument, not copy.** Every sentence, clause number,
 * figure and defined term is the source document's own; nothing here is
 * paraphrased, shortened, reordered or modernised, and the en dashes, the
 * spacing inside "17 €:n" and the literal "(1)"/"1)" list markers are the
 * source's. Fixing a typo means agreeing the fix with the counterparty and
 * publishing a new version, not editing this file.
 *
 * Clause numbers are written into the text rather than generated: the document
 * cross-references them (kohta 2.3, 4.7, 5.2, 7.2, 7.4, 1.2, 1.4, 9, 10,
 * Liite A), so a number produced by list position would break a reference the
 * moment a block moved. The source expresses them as nested markdown ordered
 * lists, which is the same numbering rendered a different way.
 */
export const geduContract20262027Fi: GeduContractDocument = {
  version: "2026-2027",
  language: "fi",
  title: "PELIKASVATTAJAN SOPIMUSEHDOT (GEDU-SOPIMUS)",
  blocks: [
    {
      kind: "paragraph",
      text: "**School of Gaming Galactic Oy:n ja Pelikasvattajan välillä**",
    },
    {
      kind: "paragraph",
      text: "Versio 2026–2027 (1.8.2026). Nämä ehdot voivat päivittyä kohdan 9 mukaisesti.",
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "NÄIN SOPIMUS SYNTYY" },
    {
      kind: "paragraph",
      text: "Nämä sopimusehdot muodostavat yhden asiakirjan, joka sisältää puitesopimuksen ehdot (kohdat 1–9), salassapitoehdot (kohta 10) sekä laadunvarmistuksen ja toimeksiantojen tarjoamisen edellytykset (Liite A). Tuottaja hyväksyy koko asiakirjan yhdellä hyväksynnällä Sogverse-alustalla tiliä luodessaan. Erillisiä allekirjoitettuja liitteitä ei tehdä.",
    },
    {
      kind: "bullets",
      items: [
        '**Yksi hyväksyntä.** Hyväksymällä nämä ehdot Sogverse-alustalla Tuottaja hyväksyy samalla kohdat 1–10 ja Liitteen A kokonaisuudessaan ja voi tämän jälkeen ottaa vastaan toimeksiantoja ja toimia pelikasvattajana ("Gedu").',
        "**Sähköinen hyväksyntä.** Hyväksyntä tehdään sähköisesti Sogverse-alustalla, eikä erillistä allekirjoitettua kappaletta edellytetä. Sähköinen hyväksyntä vastaa oikeusvaikutuksiltaan allekirjoitusta. Alusta tallentaa hyväksynnän ajankohdan, hyväksytyn ehtoversion sekä Tuottajan tunnistetiedot, ja tämä muodostaa osapuolten välisen todisteen Sopimuksen syntymisestä.",
        "**Rikostaustaote erillisenä vaiheena.** Ennen ensimmäisen toimeksiannon alkamista Tuottaja esittää lisäksi rikostaustaotteen Tilaajalle tarkastettavaksi kohdan 8 mukaisesti. Tätä ei tehdä yhdellä klikkauksella, koska ote on lain mukaan näytettävä eikä sitä saa tallentaa; se on siksi oma erillinen vaiheensa.",
      ],
    },
    {
      kind: "paragraph",
      text: 'Jäljempänä näistä ehdoista käytetään nimitystä "**Sopimus**".',
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "OSAPUOLET" },
    {
      kind: "table",
      rows: [
        [
          "(1)",
          '**Tuottaja** ("**Tuottaja**" tai "**Gedu**"), joka on hyväksynyt nämä ehdot Sogverse-alustalla luomallaan tilillä. Tuottaja yksilöidään Sogverse-tilin tietojen perusteella.',
          "Tuottajan nimi, Y-tunnus tai syntymäaika, osoite, sähköposti ja puhelinnumero Sogverse-tilin mukaisesti.",
        ],
        [
          "(2)",
          '**School of Gaming Galactic Oy,** jonka y-tunnus on 3110461-1 ja osoitteena on Isokatu 56, 90100 Oulu ("**Tilaaja**").',
          // The source's cell runs the three lines together, an artefact of the
          // document export; they are the contact block's own lines.
          "**Yhteyshenkilö**\nMikko Perälä, 040 7453749\nmikko@sog.gg",
        ],
      ],
    },
    {
      kind: "paragraph",
      text: "Tätä asiakirjaa ei täydennetä eikä muuteta Tuottajakohtaisesti, vaan se hyväksytään vakiomuotoisena sellaisenaan. Tuottajan yksilöinti- ja yhteystiedot määräytyvät Tuottajan Sogverse-tilille ilmoittamien ja ylläpitämien tietojen mukaisesti, ja Sogverse-alustan tallentama hyväksyntämerkintä yhdistää tilin haltijan hyväksyttyyn ehtoversioon. Tuottaja vastaa siitä, että hänen tietonsa ovat ajantasaiset.",
    },
    {
      kind: "paragraph",
      text: '(Tilaaja ja Tuottaja yhdessä "**Osapuolet**" ja yksin "**Osapuoli**")',
    },

    { kind: "heading", level: 2, text: "TAUSTAA" },
    {
      kind: "paragraph",
      text: "1) Tilaaja on tunnustettu pelikasvatuksen, digitaalisen nuorisotyön ja e-urheiluvalmennuksen palvelu- ja asiantuntijayritys, joka tarjoaa kasvatuksellisia ja opetuksellisia palvelutuotteita lapsille ja nuorille, sekä myös koulutusta nuoriso-ohjaajille, opettajille ja muille pelikasvatuksesta ja digitaalisesta nuorisotyöstä kiinnostuneille tahoille.",
    },
    {
      kind: "paragraph",
      text: "2) Tuottaja on itsenäinen elinkeinonharjoittaja ja Tilaajan hyväksymä pelikasvatuksen asiantuntija, joka järjestää lapsille ja nuorille Tilaajan toimeksiannosta pelikasvatusta verkossa tai lähiohjauksena.",
    },

    { kind: "heading", level: 2, text: "1. SOPIMUKSEN KOHDE JA KUVAUS" },
    {
      kind: "paragraph",
      text: "1.1 Sopimuksen kohteena on kohdassa 1.2 määritelty lasten ja nuorten verkossa ja lähiohjauksena tapahtuva pelikasvatustoiminta.",
    },
    {
      kind: "paragraph",
      text: "1.2 Tilaaja järjestää pelikasvatustoimintaa kerhojen, aamu- ja iltapäiväharrastustoiminnan, loma-ajan leirien sekä erilaisten verkkotapahtumien, kuten turnausten ja kilpailujen, muodossa.",
    },
    {
      kind: "paragraph",
      text: "1.3 Pelikasvatus koostuu erilaisista sisältöteemoista (Pelikasvatusteema), joita toteutetaan kohdassa 1.2 määritellyn toiminnan mukaisesti.",
    },
    {
      kind: "paragraph",
      text: "1.4 Tilaaja tarjoaa Tuottajalle pelikasvatustoiminnan ohjausta yksittäisinä toimeksiantoina Sogverse-alustan kautta. Kukin toimeksianto syntyy vasta, kun Tuottaja ottaa sen vastaan alustalla. Tuottajalla ei ole velvollisuutta ottaa vastaan mitään yksittäistä toimeksiantoa, eikä Tilaaja sitoudu tarjoamaan Tuottajalle tiettyä määrää toimeksiantoja.",
    },
    {
      kind: "paragraph",
      text: "1.5 Toimeksiannosta maksettava toimeksiantopalkkio määräytyy toimeksiannon pituudesta, tyypistä, Tuottajan kokemuksesta ja Tilaajan loppuasiakkaan kanssa sopimasta hinnasta. Eli jokaisen toimeksiannon toimeksiantopalkkio voi olla eri suuruinen.",
    },
    {
      kind: "paragraph",
      text: "1.6 Tuottaja toteuttaa pelikasvatustoiminnan ohjauksen lähtökohtaisesti omilla laitteilla ja verkkoyhteydellä omista toimitiloistaan käsin. Mikäli kyseessä on lähiohjauksena tapahtuva pelikasvatustoiminta, Tuottaja toteuttaa sen Tilaajan tai tämän loppuasiakkaan osoittamissa tiloissa.",
    },
    {
      kind: "paragraph",
      text: "1.7 Tuottaja sitoutuu aktiivisesti käyttämään Tilaajan osoittamia ohjelmistoja ja viestintäkanavia pelikasvatustoiminnan ohjauksessa, viestinnässä ja hallinnoimisessa siltä osin kuin se on tarpeen palvelun yhteensopivuuden, turvallisuuden ja laadun varmistamiseksi.",
    },

    { kind: "heading", level: 2, text: "2. TUOTTAJAN VELVOLLISUUDET" },
    { kind: "heading", level: 3, text: "2.1 Yleiset" },
    {
      kind: "bullets",
      items: [
        "Pelikasvatustoiminnan ja -ryhmien ohjaaminen Tilaajan pelikasvatussuunnitelman ja -tavan mukaisesti. Kerhokohtainen sisältö on kuvattu Kerho-ohjeessa.",
        "Toimeksiannon mukaisten aikojen noudattaminen ja ajoissa paikalla oleminen.",
        "Jokaisen osallistujan huomioiminen jokaisella pelikasvatuskerralla.",
        "Laadukkaan pelikasvatuskokemuksen tuottaminen osallistujille.",
        "Antaa Tilaajalle luvan julkaista Tilaajan verkkosivuilla ja Sogverse-alustalla yleisiä tietoja Tuottajasta, kuten Tuottajan kuvan, nimen sekä henkilö- ja osaamiskuvauksen.",
        "Ei käytöksellään tai viestinnällään tuota mainehaittaa Tilaajalle.",
        "Noudattaa Tilaajan laatimia yleisiä ohjeita ja prosesseja, jotka koskevat palvelun laatua, turvallisuutta ja lasten ja nuorten suojelua.",
      ],
    },
    { kind: "heading", level: 3, text: "2.2 Viestintä ja raportointi" },
    {
      kind: "bullets",
      items: [
        "Kirjata ylös osallistujien läsnäolo ja pelikasvatuskerran toteutunut sisältö sekä kirjoittaa lyhyt kotiviesti (raportti pelikasvatuskerran kulusta osallistujille tai heidän huoltajilleen) jokaisella pelikasvatuskerralla Tilaajan määrittämiin järjestelmiin. Raportointi ja kotiviesti tehdään viimeistään 24 tunnin kuluessa pelikasvatuskerran päättymisestä, mieluiten kuitenkin heti kerran päätyttyä.",
        "Merkitä pelikasvatuskerrat pidetyksi myös kolmannen osapuolen raportointijärjestelmiin (esimerkiksi Hellewi, Lyyti, Suomisport) Tilaajan niin ohjeistaessa.",
        "Pitää Tilaajan yhteyshenkilö tarvittaessa ajan tasalla pelikasvatuksen edistymisestä ja kerhon yleisestä tilanteesta.",
      ],
    },
    {
      kind: "heading",
      level: 3,
      text: "2.3 Sijaistaminen ja toimeksiannon peruuntuminen",
    },
    {
      kind: "bullets",
      items: [
        "Estyneenä ollessaan Tuottaja järjestää itselleen sijaisen Tilaajan hyväksymien pelikasvattajien joukosta ja noudattaa Tilaajan laatimaa prosessia sijaisen järjestämiseksi. Kuluttajakerhojen sijaistamisessa Discord-tikettijärjestelmän käyttö on pakollista.",
        "Tuottaja käy sijaisen kanssa läpi tulevan session suunnitelman ja tavoitteet. Sijaisen tulee kyetä yhtä laadukkaaseen pelikasvatustyöhön kuin sijaistettava.",
        "**Äkillinen sairastuminen tai tapaturma:** Tuottaja ilmoittaa esteestä Tilaajan ohjeistamalla tavalla niin pian kuin mahdollista, viimeistään 24 tuntia ennen pelikasvatustoiminnan ohjauksen alkamista, kun se on olosuhteet huomioiden mahdollista. Tilaaja voi pyytää sairauden osalta lääkärintodistuksen.",
        "**Muut kuin sairausperusteiset esteet:** Tuottaja ilmoittaa esteestä vähintään yhtä (1) kalenteriviikkoa ennen pelikasvatustoiminnan ohjauksen alkamista.",
        "Mikäli Tuottaja ei noudata edellä mainittuja ilmoitusaikoja, ei löydä toimeksiannolle sijaista ja pelikasvatuskerta tämän vuoksi peruuntuu, Tilaajalla on oikeus periä Tuottajalta kohdan 7.2 mukainen korvaus.",
      ],
    },

    { kind: "heading", level: 2, text: "3. TILAAJAN VELVOLLISUUDET" },
    {
      kind: "bullets",
      items: [
        "Tuottaa tarvittava koulutusaineisto ja pelikasvatuksen sisältö (Kerho-ohjeet), jota Tuottaja hyödyntää pelikasvatuskerroilla.",
        "Säilyttää Tuottajan tiedot tietosuojalainsäädännön mukaisesti.",
        "Käsitellä ja maksaa Tuottajan lähettämät, oikeelliseksi tarkastetut ja todetut laskut ajallaan.",
        "Ylläpitää Sogverse-alustaa, jonka kautta toimeksiannot, palkkiotiedot ja raportointi ovat Tuottajan saatavilla.",
      ],
    },

    { kind: "heading", level: 2, text: "4. HINNAT JA LASKUTUS" },
    {
      kind: "paragraph",
      text: "4.1 Tilaaja tarjoaa Tuottajalle toimeksiantoja (esim. harrastuskertojen vetämistä, leiriohjausta, tapahtumaan osallistumista).",
    },
    {
      kind: "paragraph",
      text: "4.2 Tuottaja saa laskuttaa Tilaajaa toteutuneiden toimeksiantojen perusteella. Toimeksiannosta maksettava toimeksiantopalkkio sisältää pelikasvatuksen, ryhmän ohjaamisen, pelikasvatuskerran suunnittelun, kommunikaation huoltajien kanssa ja kaiken muun laadukkaaseen pelikasvatustyöhön liittyvän toiminnan.",
    },
    {
      kind: "paragraph",
      text: "4.3 Pelikasvatustyöstä maksettavan toimeksiantopalkkion suuruus riippuu toimeksiannon pituudesta (esim. 60min vai 90min), tyypistä (esim. harrastuskerta tai leiri), Tuottajan kokemuksesta ja Tilaajan loppuasiakkaan kanssa sopimasta hinnasta. Eli toimeksiantojen toimeksiantopalkkiot voivat vaihdella. Määritellyt toimeksiantopalkkiot ovat näkyvillä Sogverse-alustalla jokaisen toimeksiannon kohdalla.",
    },
    {
      kind: "paragraph",
      text: "4.4 Esimerkinomaisesti todettakoon, että viikoittain järjestettävän toiminnan harrastuskertakohtaiset toimeksiantopalkkiot vaihtelevat 17 €:n (minimi) ja 40 €:n välillä pelikasvatuskerran pituudesta ja Tilaajan ja loppuasiakkaan välisestä sopimuksesta riippuen.",
    },
    {
      kind: "paragraph",
      text: "4.5 Ottamalla vastaan toimeksiannon pelikasvatuskertoineen Tuottaja hyväksyy sille Sogverse-alustalla määritellyn palkkion.",
    },
    {
      kind: "paragraph",
      text: "4.6 Muusta kuin toimeksiantoina tarjottavasta toiminnasta maksettava korvaus sovitaan aina erikseen kirjallisesti Tilaajan kanssa etukäteen.",
    },
    {
      kind: "paragraph",
      text: "4.7 Tuottaja laskuttaa toteutuneet ja hyväksymänsä toimeksiannot toteuman mukaan kuukausittain. Toimeksiantokuukauden aikana tehdyt toimeksiannot on laskutettava viimeistään toimeksiantokuukautta seuraavan kalenterikuukauden aikana. Tämän määräajan jälkeen saapuvia laskuja ei lähtökohtaisesti käsitellä. Erityisestä ja perustellusta syystä Tilaaja voi käsitellä myöhässä saapuneen laskun.",
    },
    {
      kind: "paragraph",
      text: "4.8 Hintoihin lisätään kulloinkin voimassa oleva arvonlisävero, sopimushetkellä 25,5 %.",
    },
    {
      kind: "paragraph",
      text: "4.9 Tuottajan laskutustapa ja kaikki laskutukseen liittyvä on Tuottajan vastuulla. Tilaaja ei vastaa mahdollisista laskutuksen lisäkustannuksista.",
    },
    { kind: "heading", level: 3, text: "4.10 Laskutustiedot" },
    {
      kind: "bullets",
      items: [
        "Maksajan nimi: School of Gaming Galactic Oy (y-tunnus: 3110461-1)",
        "Verkkolaskuosoite: 003731104611",
        "Operaattori: 003708599126 (Liaison Technologies Oy)",
        "Laskutusehto: 14 päivää netto",
      ],
    },

    {
      kind: "heading",
      level: 2,
      text: "5. SOPIMUKSEN VOIMASSAOLO JA IRTISANOMINEN",
    },
    {
      kind: "paragraph",
      text: "5.1 Sopimus tulee voimaan, kun Tuottaja on hyväksynyt nämä ehdot Sogverse-alustalla, ja on voimassa 31.7.2027 asti.",
    },
    {
      kind: "paragraph",
      text: "5.2 Osapuolet voivat irtisanoa Sopimuksen yhden (1) kuukauden irtisanomisajalla tai välittömästi, mikäli toinen osapuoli rikkoo velvollisuuksiaan toistuvasti tai olennaisesti.",
    },
    {
      kind: "paragraph",
      text: "5.3 Tuottaja voi irtisanoa yksittäistä toimeksiantoa koskevan sitoumuksensa kohdan 2.3 mukaisesti, mikäli Tuottajalla on osoittaa toimeksiannolle korvaava ja vähintään yhtä osaava Tilaajan hyväksymä pelikasvattaja.",
    },
    {
      kind: "paragraph",
      text: "5.4 Sopimuksen päättyminen ei vaikuta ennen päättymistä toteutuneiden toimeksiantojen laskutukseen kohdan 4.7 mukaisesti eikä salassapitovelvoitteisiin (kohta 10), jotka jäävät voimaan.",
    },

    { kind: "heading", level: 2, text: "6. OSAPUOLTEN ASEMA JA MUUT EHDOT" },
    {
      kind: "paragraph",
      text: "6.1 **Osapuolten asema.** Tuottaja toimii itsenäisenä elinkeinonharjoittajana omaan lukuunsa, eikä Tuottajan ja Tilaajan välille synny tämän Sopimuksen tai yksittäisten toimeksiantojen perusteella työsuhdetta. Tuottaja vastaa itse veroistaan, lakisääteisistä vakuutuksistaan (kuten YEL) ja muista yrittäjän velvoitteistaan. Tuottaja päättää itsenäisesti työvälineistään, työskentelytavoistaan ja toimintansa järjestämisestä toimeksiannon tavoitteiden ja laatuvaatimusten puitteissa, ja Tuottajalla on oikeus tarjota vastaavia palveluita myös muille toimeksiantajille. Tilaajan tässä Sopimuksessa määrittelemät ohjeet, sisällöt ja laatuvaatimukset koskevat palvelun lopputulosta ja lasten ja nuorten turvallisuutta, eivät Tuottajan henkilökohtaista työnjohdollista alaisuutta.",
    },
    {
      kind: "paragraph",
      text: "6.2 Tämä Sopimus kumoaa aikaisemmat Osapuolten väliset pelikasvattajan puitesopimukset.",
    },
    {
      kind: "paragraph",
      text: "6.3 Tilaaja ottaa vastaan ja maksaa ainoastaan sähköisiä laskuja.",
    },
    {
      kind: "paragraph",
      text: "6.4 Sopimukseen sovelletaan Suomen lakia. Sopimusta koskevat erimielisyydet pyritään ratkaisemaan ensisijaisesti neuvottelemalla. Mikäli neuvotteluissa ei päästä ratkaisuun, riita ratkaistaan Tilaajan kotipaikan käräjäoikeudessa.",
    },

    {
      kind: "heading",
      level: 2,
      text: "7. SOPIMUKSEN RIKKOMINEN JA SEURAAMUKSET",
    },
    {
      kind: "paragraph",
      text: "7.1 Jos Tuottaja aiheuttaa tahallista vahinkoa Tilaajan maineelle käyttäytymisellään tai tietoisella toiminnallaan, hän on korvausvelvollinen Tilaajalle aiheutetuista vahingoista.",
    },
    {
      kind: "paragraph",
      text: "7.2 Mikäli Tuottaja ei ilmoita riittävän ajoissa (kohta 2.3) esteestään järjestää toimeksiannon mukaista pelikasvatustoimintaa tai jättää pelikasvatustoiminnan hoitamatta ilman pätevää syytä eikä toimeksiannolle löydy sijaista, voi Tilaaja halutessaan periä Tuottajalta korvauksen menetetyistä tuloista. Korvauksen suuruus on 50 € per hoitamatta jätetty ohjaustunti.",
    },
    {
      kind: "paragraph",
      text: "7.3 Sopimus voidaan purkaa, mikäli sopijapuoli toistuvasti rikkoo Sopimuksen ehtoja korjauskehotuksista huolimatta.",
    },
    {
      kind: "paragraph",
      text: "7.4 Tilaaja voi lopettaa toimeksiantojen tarjoamisen Tuottajalle ja purkaa Sopimuksen välittömästi, jos Tuottajan käytös, toimet tai suoritus rikkovat olennaisesti Tilaajan toimintatapoja tai vaarantavat lasten ja nuorten turvallisuuden. Syitä välittömään purkamiseen ovat muun muassa:",
    },
    {
      kind: "bullets",
      items: [
        "Toimintaan osallistuvien asiakkaiden kutsuminen tai ohjaaminen muille kuin Tilaajan hallinnoimille ja hyväksymille pelipalvelimille, sosiaalisen median alustoille, viestintäkanaviin tai yhteisöihin ilman Tilaajan etukäteen antamaa suostumusta.",
        "Väkivalta tai väkivallan uhka kohdistettuna mihin tahansa henkilöön.",
        "Rikostuomio, jolla on merkitystä lasten ja nuorten parissa toimimisen kannalta.",
        "Vahvistetun, Tilaajan määrittämän toimintatavan tai säännön tahallinen rikkominen tai kieltäytyminen käyttämästä määriteltyjä sisältöjä, työkaluja tai ohjausmetodeja.",
        "Tilaajan tietojen väärentäminen.",
        "Törkeä huolimattomuus.",
        "Epärehellisyys tai luottamuksen rikkominen.",
        "Häirinnän ja seksuaalisen häirinnän nollatoleranssikäytännön rikkominen.",
        "Varastaminen.",
        "Tilaajan tai Tilaajan asiakkaan tilan tai omaisuuden luvaton käyttö.",
        "Jatkuva poissaolo tai myöhästely.",
        "Toimeksiannon suorittaminen alkoholin tai huumausaineiden vaikutuksen alaisena.",
        "Liitteen A mukaisen menettelyn mukaisesti annettu ilmoitus tilanteessa, jossa Tuottaja ei korjaa toimintaansa.",
      ],
    },

    { kind: "heading", level: 2, text: "8. RIKOSTAUSTAN SELVITTÄMINEN" },
    {
      kind: "paragraph",
      text: "8.1 Tilaaja on velvollinen selvittämään lasten kanssa työskentelevien rikostaustan lain edellyttämällä tavalla (laki lasten kanssa työskentelevien rikostaustan selvittämisestä 504/2002, 3 §).",
    },
    {
      kind: "paragraph",
      text: "8.2 Ennen ensimmäisen toimeksiannon alkamista Tuottaja hankkii omalla kustannuksellaan itseään koskevan rikosrekisterin otteen (rikostaustaote) ja esittää sen Tilaajalle tarkastettavaksi Tilaajan ohjeistamalla tavalla.",
    },
    {
      kind: "paragraph",
      text: "8.3 Tilaaja ainoastaan tarkastaa otteen. Tilaaja merkitsee Tuottajan Sogverse-profiiliin ainoastaan tiedon siitä, että ote on esitetty ja tarkastettu (sekä tarkastuspäivän). Tilaaja ei ota otteesta jäljennöstä, ei kirjaa sen sisältöä eikä tallenna otetta, eikä otetta ladata Sogverse-alustalle.",
    },
    {
      kind: "paragraph",
      text: "8.4 Osapuolet toteavat, ettei Tilaajalla ole oikeutta velvoittaa Tuottajaa esittämään rikostaustaotetta. Tuottaja esittää otteen vapaaehtoisesti ja suostumuksensa perusteella. Mikäli Tuottaja ei esitä rikostaustaotetta, Tilaaja varaa oikeuden olla tarjoamatta Tuottajalle toimeksiantoja.",
    },

    { kind: "heading", level: 2, text: "9. EHTOJEN PÄIVITTÄMINEN" },
    {
      kind: "paragraph",
      text: "9.1 Tilaajalla on oikeus päivittää näitä ehtoja esimerkiksi lainsäädännön, viranomaisohjeiden, palvelun tai Sogverse-alustan kehittymisen vuoksi.",
    },
    {
      kind: "paragraph",
      text: "9.2 Olennaisista muutoksista ilmoitetaan Tuottajalle Sogverse-alustan kautta tai sähköpostitse kohtuullisessa ajassa, vähintään kolmekymmentä (30) vuorokautta ennen muutosten voimaantuloa. Vähäisistä tai teknisluonteisista muutoksista voidaan ilmoittaa lyhyemmässä ajassa.",
    },
    {
      kind: "paragraph",
      text: "9.3 Muutokset tulevat Tuottajaa sitoviksi, kun Tuottaja hyväksyy päivitetyt ehdot Sogverse-alustalla tai ottaa vastaan toimeksiannon muutosten voimaantulon jälkeen. Mikäli Tuottaja ei hyväksy olennaista muutosta, Tuottajalla on oikeus irtisanoa Sopimus kohdan 5.2 mukaisesti. Jo vastaanotettuihin toimeksiantoihin sovelletaan niitä ehtoja, jotka olivat voimassa toimeksiantoa vastaanotettaessa.",
    },

    { kind: "heading", level: 2, text: "10. SALASSAPITO" },
    {
      kind: "paragraph",
      text: "10.1 **Taustaa.** Tuottaja suorittaa Tilaajalle toimeksiantoja, joiden aikana Tuottaja saa mahdollisesti tietoonsa Tilaajan ja sen asiakkaiden sekä yhteistyökumppaneiden liike- ja ammattisalaisuuksia, kuten asiakkaiden nimiä ja yhteystietoja, sopimuksia, pöytäkirjoja, kirjeenvaihtoa, liiketoiminta-, markkinointi- ja muita suunnitelmia, tietoja Tilaajan taloudesta sekä Tilaajan yhteistyökumppaneiden tai asiakkaiden tietoja. Tuottaja voi saada näitä tietoja missä tahansa muodossa, esimerkiksi kirjallisesti, suullisesti, sähköisesti tai omin silmin havainnoimalla. Tuottaja ymmärtää, että nämä tiedot ovat ehdottoman salassa pidettäviä ja niillä on erityistä merkitystä Tilaajalle, sen asiakkaille ja yhteistyökumppaneille.",
    },
    {
      kind: "paragraph",
      text: "10.2 Tuottaja sitoutuu toimeksiantojen tarjoamisen aikana ja sen päättymisen jälkeen pitämään salassa ja luottamuksellisena kaiken saamansa salassa pidettävän tiedon. Tuottaja ei saa kertoa tai muutoin ilmaista tai luovuttaa salassa pidettäviä tietoja kenellekään, mukaan lukien toiset pelikasvattajat. Tämä ei koske tilanteita, joissa toisen pelikasvattajan tarvitsee tietää tietoja esimerkiksi kerhon sijaistamista varten.",
    },
    {
      kind: "paragraph",
      text: "10.3 Tuottaja ei saa käyttää tietoonsa saamiaan salassa pidettäviä tietoja mihinkään muuhun kuin sovittujen tehtäviensä hoitamiseen. Tämä koskee myös kaikkea sellaista tietoa, jonka asiakas kertoo asiakkuutensa aikana.",
    },
    {
      kind: "paragraph",
      text: "10.4 Tuottaja ymmärtää, että tietojen paljastamisesta tai tämän Sopimuksen vastaisesta käytöstä voi seurata rangaistus tai vahingonkorvausvelvollisuus.",
    },
    {
      kind: "paragraph",
      text: "10.5 Tuottajan salassapitovelvollisuus jatkuu myös sen jälkeen, kun palveluiden tuottaminen lopetetaan, ja on voimassa pysyvästi.",
    },
    {
      kind: "paragraph",
      text: "10.6 Tuottaja sitoutuu yhteistyön päättyessä palauttamaan tai Tilaajan pyynnöstä tai luvalla tuhoamaan kaiken salassa pidettävää tietoa sisältävän aineiston omilta laitteiltaan, kuten esimerkiksi asiakirjat tai tietokoneella luodut tiedostot.",
    },
    {
      kind: "paragraph",
      text: "10.7 Tuottajan toimeksiantojen yhteydessä ottamat kuvat ja videot sekä muu luotu opetuksellinen ja kasvatuksellinen sisältömateriaali kuuluu lähtökohtaisesti Tilaajalle ja on tämän Sopimuksen alaista, ellei toisin sovita.",
    },
    { kind: "separator" },

    { kind: "heading", level: 2, text: "HYVÄKSYNTÄ" },
    {
      kind: "paragraph",
      text: "Tuottaja hyväksyy nämä sopimusehdot kokonaisuudessaan (kohdat 1–10 ja Liite A) sähköisesti Sogverse-alustalla. Alusta tallentaa hyväksynnän ajankohdan, hyväksytyn ehtoversion sekä Tuottajan tunnistetiedot. Erillistä allekirjoitettua paperikappaletta ei tehdä.",
    },
    {
      kind: "paragraph",
      text: "Tilaajan puolesta ehdot on vahvistanut:\nMikko Perälä, Reksi\nSchool of Gaming Galactic Oy",
    },
    { kind: "separator" },

    {
      kind: "heading",
      level: 2,
      text: "LIITE A: LAADUNVARMISTUS JA TOIMEKSIANTOJEN TARJOAMISEN EDELLYTYKSET",
    },
    {
      kind: "paragraph",
      text: "Tämä liite kuvaa, miten Tilaaja seuraa toimeksiantojen laatua ja päättää uusien toimeksiantojen tarjoamisesta. Menettelyn tarkoituksena on turvata pelikasvatuksen laatu sekä lasten ja nuorten (loppuasiakkaiden) etu ja turvallisuus.",
    },
    {
      kind: "paragraph",
      text: "Selvyyden vuoksi todetaan, että tämä menettely ei muuta Osapuolten välistä suhdetta työsuhteeksi. Kyse ei ole työnjohdollisesta kurinpidosta eivätkä tässä liitteessä tarkoitetut ilmoitukset ole työoikeudellisia varoituksia. Kyse on Tilaajan tekemästä toimeksiantojen laadun arvioinnista ja siihen perustuvasta liiketoiminnallisesta päätöksestä siitä, tarjoaako Tilaaja Tuottajalle uusia toimeksiantoja. Kuten kohdassa 1.4 on todettu, Tilaajalla ei ole velvollisuutta tarjota Tuottajalle toimeksiantoja.",
    },
    {
      kind: "paragraph",
      text: "Kaikki tässä liitteessä tarkoitetut laatuilmoitukset annetaan kirjallisesti, jotta sekä Tilaajalle että Tuottajalle jää aikaleimattu jälki käydystä laatukeskustelusta.",
    },
    {
      kind: "paragraph",
      text: "**Laatuilmoituksen aiheita ovat esimerkiksi:**",
    },
    {
      kind: "bullets",
      items: [
        "Raportoinnin laiminlyönti muistutuksista huolimatta",
        "Kotiviestinnän laiminlyönti muistutuksista huolimatta",
        "Jatkuva myöhästely",
        "Myöhästyminen, josta ei ilmoiteta",
        "Loppuasiakkaan kanssa muutoksista sopiminen ilman Tilaajan hyväksyntää",
        "Virheellinen ja harhaanjohtava viestintä",
        "Toistuva viime hetken peruminen ilman asianmukaista todistusta",
        "Kerhosisältöjen muuttaminen tai toteuttamatta jättäminen ilman Tilaajan hyväksyntää",
        "Asiaton käytös (mikäli riittävän räikeää, voi olla kohdan 7.4 mukainen välittömän purkamisen peruste)",
        "Havaituista puutteista vaikeneminen",
        "Asiakastilanteiden epäasiallinen hoito tai hoidon laiminlyönti",
        "Muu Tilaajan toimintaperiaatteiden vastainen toiminta",
      ],
    },
    {
      kind: "heading",
      level: 3,
      text: "Ensimmäinen laatuilmoitus ja korjaaminen",
    },
    {
      kind: "paragraph",
      text: "Tuottajalle kerrotaan kirjallisesti ja selkeästi, miltä osin toiminta on poikennut näistä sopimusehdoista ja Tilaajan periaatteista. Tuottajan kanssa keskustellaan tarvittaessa siitä, miten tilanne korjataan, ja Tilaajan yhteyshenkilö tarjoaa tukea ja mahdollisesti lisäperehdytystä.",
    },
    { kind: "heading", level: 3, text: "Toinen laatuilmoitus" },
    {
      kind: "paragraph",
      text: "Tuottajalle kerrotaan kirjallisesti ja selkeästi, miltä osin toiminta on poikennut näistä sopimusehdoista ja Tilaajan periaatteista. Tilaajan yhteyshenkilö keskustelee Tuottajan kanssa ja yhdessä käydään läpi toiminnan vaikutus loppuasiakkaaseen. Yhteyshenkilö viestii Tilaajan johdolle käydyistä keskusteluista.",
    },
    {
      kind: "heading",
      level: 3,
      text: "Kolmas laatuilmoitus ja toimeksiantojen rajaaminen",
    },
    {
      kind: "paragraph",
      text: "Tuottajalle kerrotaan kirjallisesti ja selkeästi, miltä osin toiminta on poikennut näistä sopimusehdoista ja Tilaajan periaatteista. Mikäli kolmas laatuilmoitus joudutaan antamaan alle kuukauden kuluessa kahdesta ensimmäisestä, Tilaaja voi lopettaa toimeksiantojen tarjoamisen ja päättää Sopimuksen kohdan 5.2 mukaisesti. Mikäli kolmas laatuilmoitus annetaan kolmen (3) kuukauden kuluessa aiemmista, Tilaaja voi rajata Tuottajalle tarjottavia uusia toimeksiantoja, kunnes Tuottaja on korjannut ilmoitusten taustalla olevat toimintatavat ja suoriutunut toimeksiannoistaan ilman uusia laatuilmoituksia kolmen (3) kuukauden ajan.",
    },
    {
      kind: "heading",
      level: 3,
      text: "Toimeksiantojen tarjoamisen keskeyttäminen",
    },
    {
      kind: "paragraph",
      text: "Mikäli kolmas laatuilmoitus annetaan kuukauden sisällä aiemmasta, Tilaaja voi katsoa, ettei toimintatapa ole korjautumassa, ja keskeyttää toimeksiantojen tarjoamisen. Päätöksissä käytetään tilannekohtaista harkintaa käytyjen keskustelujen perusteella.",
    },
    {
      kind: "heading",
      level: 3,
      text: "Yhteistyön jatkoedellytysten arviointi",
    },
    {
      kind: "paragraph",
      text: "Mikäli Tuottajalta joudutaan toistuvien laatuilmoitusten takia keskeyttämään useampia toimeksiantoja, Tuottaja ja Tilaajan johto käyvät keskustelun yhteistyön jatkosta. Tilaajan johto arvioi keskustelun pohjalta, onko Tuottajalla edellytyksiä jatkaa pelikasvatuspalveluiden tuottajana. Mikäli yhteistyötä jatketaan, sovelletaan edellä kuvattua toimeksiantojen rajaamista: rajaus uusien toimeksiantojen osalta poistuu, mikäli Tuottaja toimii ilman uusia laatuilmoituksia kolmen (3) kuukauden ajan.",
    },
    { kind: "heading", level: 3, text: "Yhteistyön uudelleen aloittaminen" },
    {
      kind: "paragraph",
      text: "Mikäli yhteistyö on päättynyt, Tuottaja voi hakeutua uudelleen pelikasvatuspalveluiden tuottajaksi kolmen (3) kuukauden kuluttua. Ennen uudelleen aloittamista Tuottaja haastatellaan. Mikäli haastattelun perusteella katsotaan, että Tuottajalla on edellytykset palata, hän käy Tilaajan peruskoulutukset uudelleen läpi. Aloittaessaan uudelleen Tuottaja voi ottaa rajatusti vastaan uusia toimeksiantoja (enintään 3 kerhoa). Mikäli Tuottaja toimii ilman uusia laatuilmoituksia kolmen (3) kuukauden ajan, rajaus uusien toimeksiantojen osalta poistuu.",
    },
  ],
};
