// Confirmed old-id -> current-id aliases for Tower of Babel entries
// whose artifact_id was re-keyed by a catalog rebuild, stranding URLs
// that search engines had already ranked (2026-11-21 URL-churn audit;
// see FIX-REPORT.md and CHURNED-IDS.md in the growth-program folder
// for the evidence per entry and the systematic re-key rules, which
// live in functions/tower-of-babel/library/[id].js — this table
// holds only confirmed pairs no rule can derive).
//
// An alias here is only ever used after the entry function verifies
// the target record exists (getRecordById), so a stale row degrades
// to the plain 404, never to a redirect loop or a wrong destination.
// Add rows only with audit evidence that the old id existed, the new
// id is the same work, and the old id no longer resolves.
export const ID_ALIASES = {
  // CIA CREST re-key anchor (also covered by the CREST rule in
  // [id].js): GSC-recorded id (10 impressions @ position 6.3, Nov
  // 2026 pull); the document was re-keyed with a cia-crest- prefix.
  "cia-rdp04t00367r000201400001-6": "cia-crest-cia-rdp04t00367r000201400001-6",

  // Book re-keys from the Oct 20 -> Nov 1 2026 catalog rebuild: early
  // bare title slugs were re-keyed to Gutenberg-numbered ids
  // (<gutenberg id>-<slug>). Each pair below is the UNIQUE numbered
  // id carrying that exact slug in the current catalog (audit
  // 2026-11-21). Slugs with two numbered candidates (the-road,
  // the-return-of-the-native) are deliberately absent — the audit
  // cannot prove which edition the old slug served.
  "a-ball-player-s-career-being-the-personal-experiences-and-re": "19652-a-ball-player-s-career-being-the-personal-experiences-and-re",
  "a-girl-in-ten-thousand": "19761-a-girl-in-ten-thousand",
  "a-hero-and-some-other-folks": "19647-a-hero-and-some-other-folks",
  "a-room-with-a-view": "2641-a-room-with-a-view",
  "a-tale-of-a-tub": "4737-a-tale-of-a-tub",
  "atalanta-in-calydon": "15378-atalanta-in-calydon",
  "biographia-literaria": "6081-biographia-literaria",
  "caesar-a-sketch": "8425-caesar-a-sketch",
  "dreams-and-dream-stories": "5651-dreams-and-dream-stories",
  "flappers-and-philosophers": "4368-flappers-and-philosophers",
  "george-borrow-and-his-circle-wherein-may-be-found-many-hithe": "19767-george-borrow-and-his-circle-wherein-may-be-found-many-hithe",
  "hero-and-leander": "18781-hero-and-leander",
  "idylls-of-the-king": "610-idylls-of-the-king",
  "kitchener-s-mob-adventures-of-an-american-in-the-british-arm": "19655-kitchener-s-mob-adventures-of-an-american-in-the-british-arm",
  "lectures-on-modern-history": "18685-lectures-on-modern-history",
  "love-of-life-and-other-stories": "710-love-of-life-and-other-stories",
  "lyrical-ballads-with-a-few-other-poems-1798": "9622-lyrical-ballads-with-a-few-other-poems-1798",
  "maggie-a-girl-of-the-streets": "447-maggie-a-girl-of-the-streets",
  "man-of-many-minds": "19660-man-of-many-minds",
  "new-arabian-nights": "839-new-arabian-nights",
  "night-and-day": "1245-night-and-day",
  "on-heroes-hero-worship-and-the-heroic-in-history": "1091-on-heroes-hero-worship-and-the-heroic-in-history",
  "one-of-ours": "2369-one-of-ours",
  "overland-red-a-romance-of-the-moonstone-can-on-trail": "19763-overland-red-a-romance-of-the-moonstone-can-on-trail",
  "prolegomena-to-the-history-of-israel": "4732-prolegomena-to-the-history-of-israel",
  "ragnarok-the-age-of-fire-and-gravel": "5109-ragnarok-the-age-of-fire-and-gravel",
  "sesame-and-lilies": "1293-sesame-and-lilies",
  "south-sea-tales": "1208-south-sea-tales",
  "tales-of-the-jazz-age": "6695-tales-of-the-jazz-age",
  "tamburlaine-the-great-part-2": "1589-tamburlaine-the-great-part-2",
  "the-ambassadors": "432-the-ambassadors",
  "the-autocrat-of-the-breakfast-table": "751-the-autocrat-of-the-breakfast-table",
  "the-book-of-were-wolves": "5324-the-book-of-were-wolves",
  "the-captain-of-the-kansas": "19649-the-captain-of-the-kansas",
  "the-economic-consequences-of-the-peace": "15776-the-economic-consequences-of-the-peace",
  "the-eighteenth-brumaire-of-louis-bonaparte": "1346-the-eighteenth-brumaire-of-louis-bonaparte",
  "the-garden-party-and-other-stories": "1429-the-garden-party-and-other-stories",
  "the-influence-of-sea-power-upon-history-1660-1783": "13529-the-influence-of-sea-power-upon-history-1660-1783",
  "the-jew-of-malta": "901-the-jew-of-malta",
  "the-judgment-of-eve": "19658-the-judgment-of-eve",
  "the-jungle": "140-the-jungle",
  "the-little-pilgrim-further-experiences-stories-of-the-seen-a": "10051-the-little-pilgrim-further-experiences-stories-of-the-seen-a",
  "the-nether-world": "4301-the-nether-world",
  "the-odd-women": "4313-the-odd-women",
  "the-people-of-the-abyss": "1688-the-people-of-the-abyss",
  "the-romance-of-tristan-and-iseult": "14244-the-romance-of-tristan-and-iseult",
  "the-sketch-book-of-geoffrey-crayon": "2048-the-sketch-book-of-geoffrey-crayon",
  "the-song-of-the-lark": "44-the-song-of-the-lark",
  "the-voyage-out": "144-the-voyage-out",
  "the-way-of-all-flesh": "2084-the-way-of-all-flesh",
  "the-were-wolf": "13131-the-were-wolf",
  "the-woodlanders": "482-the-woodlanders",
  "vikings-of-the-pacific-the-adventures-of-the-explorers-who-c": "19765-vikings-of-the-pacific-the-adventures-of-the-explorers-who-c",
  "adonais": "10119-adonais",
  "herland": "32-herland",
  "typhoon": "1142-typhoon",
};
