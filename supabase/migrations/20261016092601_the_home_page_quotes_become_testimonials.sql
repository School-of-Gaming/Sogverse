-- The home page's quotes become testimonials.
--
-- The six parent quotes the home page and About showed were message strings.
-- They move into the testimonial store, every locale's text with them, and
-- fill the home spots exactly as the home page placed them: the feature spot
-- under the hero, the two beside the safety facts, and the three in the
-- "What parents tell us" row. `from` is the old attribution.
--
-- The stored quote carries no quotation marks — each locale's own marks were
-- stripped here, and the page adds the reader's. This runs on every
-- environment, production included, because it is the site's content and not
-- a fixture; it records no creator, since a migration has no signed-in caller.

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- highlightOfTheWeek
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Mum, Finland', 'quote', 'The club is the highlight of my son’s week. Every week, my quiet and shy boy transforms into a laughing, loudly chatting child when he gets to interact with like-minded kids. The club’s content and the educators’ expertise have pleasantly surprised me.'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Äiti, Suomi', 'quote', 'Kerho on pojan viikon kohokohta. Hiljaisesta ja arasta pojasta kuoriutuu joka viikko nauravainen ja kovaan ääneen höpöttävä lapsi, kun pääsee samanhenkisten lasten kanssa puuhailemaan. Kerhon sisältö ja kasvattajien osaaminen on yllättänyt minut todella positiivisesti.'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Mamma, Finland', 'quote', 'Klubben är höjdpunkten i min sons vecka. Varje vecka förvandlas min tysta och blyga pojke till ett skrattande barn som pratar högt, när han får umgås med likasinnade barn. Klubbens innehåll och ledarnas kunnande har överraskat mig positivt.'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Maman, Finlande', 'quote', 'Le club est le moment fort de la semaine de mon fils. Chaque semaine, mon garçon calme et timide se transforme en un enfant rieur et bavard quand il retrouve des enfants qui lui ressemblent. Le contenu du club et le savoir-faire des animateurs m’ont agréablement surprise.'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'SoS, Suomi', 'quote', 'Hogh Dun law’ ghom’a’. Hoch Hogh, puqloDwIj tam ’ej ghIjlu’bogh moj puq Hagh ’ej jach, puqpu’ rurbogh ghom. ghom’a’ Dol ’ej ghojmoHwI’pu’ laH, mupIvmoH.')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('feature', 1, v_id);

  -- funAndSupervised
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Mum, Finland', 'quote', 'Gaming is fun and supervised. No bullying, no arguing, or bad vibes.'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Äiti, Suomi', 'quote', 'Pelaaminen on hauskaa ja valvottua. Ei kiusaamista eikä rähjäämistä tai pahaa mieltä.'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Mamma, Finland', 'quote', 'Spelandet är roligt och övervakat. Ingen mobbning, inga gräl och ingen dålig stämning.'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Maman, Finlande', 'quote', 'Le jeu est amusant et encadré. Pas de harcèlement, pas de disputes, pas de mauvaise ambiance.'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'SoS, Suomi', 'quote', 'Quj tlhab ’ej ghoS. qI’be’, ghobe’, ’ej pagh QoQ qab.')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('safety', 1, v_id);

  -- positiveExperience
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Dad, Finland', 'quote', 'School of Gaming has been a really positive experience for both the child and the parents. The children have had great gaming experiences with new friends in a safe gaming environment with experienced instructors – I can recommend it!'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Isä, Suomi', 'quote', 'School of Gaming on ollut todella positiivinen kokemus sekä lapselle että vanhemmille. Lapset ovat saaneet hienoja pelikokemuksia uusien pelikaverien kanssa turvallisessa peliympäristössä kokeneitten ohjaajien kanssa – voin suositella!'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Pappa, Finland', 'quote', 'School of Gaming har varit en riktigt positiv upplevelse för både barnet och föräldrarna. Barnen har fått fina spelupplevelser med nya vänner i en trygg spelmiljö med erfarna ledare – jag kan rekommendera det!'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Papa, Finlande', 'quote', 'School of Gaming a été une expérience vraiment positive, pour l’enfant comme pour les parents. Les enfants ont vécu de super moments de jeu avec de nouveaux amis, dans un environnement de jeu sûr, avec des animateurs expérimentés – je recommande !'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'vav, Suomi', 'quote', 'School of Gaming — puq vav/SoS je QaQ. jup chu’ tlhej Quj QaQ luSuq puqpu’ — QaQ Daq, ghojmoHwI’pu’ Qeq tlhej. vIQuvmoH!')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('safety', 2, v_id);

  -- sighWithHappiness
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Mum, Finland', 'quote', 'Nothing else, no activity or hobby, has made my child sigh with happiness like this.'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Äiti, Suomi', 'quote', 'Mikään toinen asia, harrastus tai juttu ei ole saanut lastani huokailemaan sitä kuinka onnellinen on.'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Mamma, Finland', 'quote', 'Ingenting annat, ingen aktivitet eller hobby, har fått mitt barn att sucka av lycka så här.'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Maman, Finlande', 'quote', 'Rien d’autre, aucune activité ni aucun loisir, n’a jamais fait soupirer mon enfant de bonheur comme ça.'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'SoS, Suomi', 'quote', 'pagh latlh Qu’, pagh latlh Hob — puqwIj Quch neH ’oH ghom’a’.')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('row', 1, v_id);

  -- largeGroups
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Mum, Finland', 'quote', 'Large groups make our child anxious. This is the perfect way for us to engage in a hobby and make new friends.'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Äiti, Suomi', 'quote', 'Isot ryhmät jännittävät lastamme. Tämä on täydellinen tapa meille harrastaa ja tutustua uusiin kavereihin.'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Mamma, Finland', 'quote', 'Stora grupper gör vårt barn oroligt. Det här är det perfekta sättet för oss att ha en hobby och få nya vänner.'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Maman, Finlande', 'quote', 'Les grands groupes rendent notre enfant anxieux. C’est la façon idéale pour nous d’avoir un loisir et de nous faire de nouveaux amis.'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'SoS, Suomi', 'quote', 'ghom’a’mey tIn puqmaj bIt. ghom’a’vam Daq Hob maHoy ’ej jup chu’ maSuq.')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('row', 2, v_id);

  -- finnishImproved
  INSERT INTO public.testimonials DEFAULT VALUES RETURNING id INTO v_id;
  PERFORM public.replace_testimonial_versions(v_id, jsonb_build_array(
      jsonb_build_object('locale', 'en', 'attribution', 'Mum, Norway', 'quote', 'My daughter’s Finnish has improved tremendously in just a month! The gaming educators have been very skilled, friendly, and patient. This really works!'),
      jsonb_build_object('locale', 'fi', 'attribution', 'Äiti, Norja', 'quote', 'Tyttäreni suomen kieli on kehittynyt kuukaudessa valtavasti! Pelikasvattajat ovat olleet tosi taitavia, ystävällisiä ja pitkämielisiä. Tämä teidän juttu todella toimii!'),
      jsonb_build_object('locale', 'sv', 'attribution', 'Mamma, Norge', 'quote', 'Min dotters finska har blivit enormt mycket bättre på bara en månad! Spelfostrarna har varit väldigt skickliga, vänliga och tålmodiga. Det här fungerar verkligen!'),
      jsonb_build_object('locale', 'fr', 'attribution', 'Maman, Norvège', 'quote', 'Le finnois de ma fille a énormément progressé en un mois seulement ! Les animateurs ont été très compétents, bienveillants et patients. Ça marche vraiment !'),
      jsonb_build_object('locale', 'tlh', 'attribution', 'SoS, Norway', 'quote', 'wa’ jar neH — puqbe’wI’ Suomi Hol Dun law’! ghojmoHwI’pu’ val, QaQ, ’ej ghIQ. Qap!')
  ));
  INSERT INTO public.home_testimonials (spot, position, testimonial_id) VALUES ('row', 3, v_id);

  -- Every spot is full and every testimonial has all five versions.
  IF (SELECT count(*) FROM public.home_testimonials) <> 6
     OR (SELECT count(*) FROM public.testimonial_translations t
           JOIN public.home_testimonials h USING (testimonial_id)) <> 30 THEN
    RAISE EXCEPTION 'The home page quotes did not land whole';
  END IF;
END;
$$;
