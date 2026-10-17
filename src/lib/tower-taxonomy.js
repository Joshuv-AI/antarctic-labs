// Tower of Babel — two-level browse taxonomy (filter revamp 2026-10-17).
//
// Top level = the catalog `collection` lanes (unchanged). Second level =
// subcategories derived DETERMINISTICALLY from the artifact_id prefix
// (which encodes the source lane — verified 99.9%+ agreement with the
// `source` field at the subcategory level on 133,509 entries, 2026-10-17;
// mismatches fall inside the same subcategory).
//
// Why artifact_id and not `source`: the library list view reads the compact
// catalog-index.json projection, which does not carry `source`. Deriving
// client-side from artifact_id means zero catalog changes and the taxonomy
// works on bootstrap, full index, and any future sharded catalog.
//
// Rules for extending: add a regex or prefix-table entry below. Unknown
// future prefixes fall into the collection's catch-all ("other") bucket —
// never unclassified, never dropped. Every entry in a collection belongs to
// exactly one subcategory of that collection (verified by
// parity-test.mjs against the live catalog).

// Display names for the top-level lanes.
export const TOWER_TOP_LABELS = {
  PAPERS: "Papers",
  DECLASSIFIED: "Declassified",
  BOOKS: "Books",
  REFERENCE: "Reference",
  DOCUMENTS: "Documents",
  PODCASTS: "Podcasts",
};

// Subcategory definitions per collection. `id` is collection-scoped and
// stable (used in filter state as "COLLECTION:sub"). Order = display order
// (largest first, like Internet Archive's top-N facet ordering).
export const TOWER_SUBS = {
  PAPERS: [
    { id: "bio", label: "Biomedical & Life Sciences" },
    { id: "cs", label: "Physics, Math & Computing" },
    { id: "plos", label: "PLOS Journals" },
    { id: "energy", label: "Energy Research" },
    { id: "space", label: "Space & Aeronautics" },
    { id: "other", label: "Other Papers" },
  ],
  DECLASSIFIED: [
    { id: "congress", label: "Congressional Records" },
    { id: "cia", label: "CIA" },
    { id: "state", label: "State Department & Diplomacy" },
    { id: "un", label: "United Nations" },
    { id: "nsa", label: "National Security Archive" },
    { id: "fbi", label: "FBI" },
    { id: "other", label: "Other Releases" },
  ],
  BOOKS: [
    { id: "lit", label: "Literature & Classics" },
    { id: "sacred", label: "Sacred & Religious Texts" },
    { id: "philo", label: "Philosophy & Esoteric" },
  ],
  REFERENCE: [],
  DOCUMENTS: [
    { id: "founding", label: "Laws & Founding Documents" },
    { id: "trials", label: "Trials & Investigations" },
    { id: "patents", label: "Patents & Inventions" },
    { id: "other", label: "Other Documents" },
  ],
  PODCASTS: [],
};

// --- prefix helpers -------------------------------------------------------
function idPrefix(artifactId) {
  const m = /^([a-z0-9]+(?:-[a-z0-9]+)?)/.exec(artifactId || "");
  return m ? m[1] : "";
}

// --- BOOKS: sacred-text prefix tables --------------------------------------
// Christian Classics Ethereal Library + sacred-texts.com + SuttaCentral +
// Internet Sacred Text Archive + Early Christian Writings + JPS 1917 Bible.
// (Author-slug id prefixes; verified against the 2026-10-17 catalog.)
const BOOKS_SACRED_PREFIXES = new Set(
  "alexander-of,alphonsus-uniformity,ambrose-of,andrewes-devotions,anguttara-nikaya,aphrahat-the,aristides-the,asterius-the,athanasius-against,athanasius-de,athanasius-defence,athanasius-festal,athanasius-four,athanasius-history,athanasius-on,athanasius-personal,athanasius-synodal,athanasius-the,athanasius-to,athanasius-tomus,athenagoras-the,attar-bird,augustine-of,basil-the,clement-of,clementine-literature,constantine-the,cyprian-the,cyprian-treatises,cyril-of,dionysius-of,enuma-elish,ephraim-the,eusebius-the,gennadius-of,ghazali-mishkat,giles-taoist,gregory-of,gregory-thaumaturgus,gregory-the,hilary-of,hippolytus-against,hippolytus-on,hippolytus-refutation,hippolytus-the,ignatius-of,itivuttaka-sujato,jataka-cowell,jerome-against,jerome-jerome,jerome-lives,jerome-prefaces,jerome-the,jerome-to,john-cassian,john-chrysostom,john-of,julius-africanus,justin-martyr,kalpa-sutra,khuddakapatha-sujato,lactantius-a,lactantius-fragments,lactantius-of,lactantius-on,lactantius-the,leo-the,lockyer-stonehenge,majjhima-nikaya,malchion-epistles,methodius-from,methodius-oration,novatian-on,origen-epistle,origen-origen,pamphilus-an,phileas-fragments,phileas-the,pickthall-meaning,pierius-a,polano-talmud,ptolemy-tetrabiblos,rapaport-tales,rufinus-of,ruysbroeck-adornment,samyutta-nikaya,socrates-scholasticus,sozomen-the,stukeley-stonehenge,sulpitius-severus,suso-eternal,suso-life,tanakh-jps,tatian-the,tauler-following,tauler-inner,tertullian-a,tertullian-ad,tertullian-against,tertullian-an,tertullian-appendix,tertullian-de,tertullian-of,tertullian-on,tertullian-scorpiace,tertullian-the,tertullian-to,the-didache,the-epistle,theodoret-letters,theodoret-the,theognostus-from,theonas-the,theophilus-of,theragatha-sujato,therigatha-sujato,udana-sujato,upanishads-muller,uttaradhyayana-jacobi,various-early,victorinus-commentary,vincent-of,vishnu-purana,way-of".split(
    ","
  )
);
// Sacred material sitting inside Internet Archive-sourced books.
const BOOKS_SACRED_IA = new Set(
  "jesuit-relations,nicene-post,ante-nicene,thomson-bible,saint-simon,psalms-of,saint-martin,churchward-lost,gospel-philip,gospel-truth,aquarian-gospel,shaku-sermons,tauler-sermons,baxter-saints,westcott-gospel,loisy-gospel,geneva-bible,coverdale-bible,bishops-bible,holy-bible,satow-jesuit,bernard-sermons".split(
    ","
  )
);
// Esoteric Archives + Online Library of Liberty + EEBO-TCP.
const BOOKS_PHILO_PREFIXES = new Set(
  "almadel-sloane,ars-paulina,bartholomaeus-batman,blackstone-commentaries,boaistuau-certaine,bruno-de,camerarius-history,chaldean-oracles,cicero-de,clavicle-solomon,grand-grimoire,grimoire-pope,grimorium-verum,heptameron-turner,jonston-description,jonston-history,josselyn-new,pare-workes,petit-albert,sea-monster,solinus-polyhistor,swan-speculum,theurgia-goetia,topsell-historie,vera-clavicola,whitbourne-discovery".split(
    ","
  )
);

// --- DOCUMENTS: explicit prefix tables (verified 2026-10-17) ---------------
// Landmark laws, constitutions, treaties, declarations, speeches, acts.
const DOCS_FOUNDING = new Set(
  "treaty-of,french-constitution,geneva-convention,us-amendment,brazilian-constitution,soviet-constitution,us-declaration,gettysburg-address,us-constitution,magna-carta,english-bill,federalist-papers,anti-federalist,code-napoleon,winthrop-model,douglass-fourth,franklin-commission,washington-farewell,monroe-doctrine,seneca-falls,emancipation-proclamation,fdr-four,fdr-day,atlantic-charter,eisenhower-farewell,kennedy-inaugural,lbj-civil,truman-eo,sherman-antitrust,homestead-act,social-security,gi-bill,civil-rights,voting-rights,dawes-act,chinese-exclusion,olive-branch,declaration-causes,zimmermann-telegram,nuremberg-charter,potsdam-declaration,japanese-instrument,german-instrument,jay-treaty,pinckneys-treaty,louisiana-purchase,congress-of,shufeldt-treaty,hay-bunau,alaska-purchase,hague-conventions,league-covenant,kellogg-briand,un-charter,udhr-1948,nato-treaty,anzus-treaty,warsaw-pact,antarctic-treaty,outer-space,npt-1968,helsinki-final,echr-1950,french-declaration,polish-constitution,haitian-constitution,norwegian-constitution,spanish-constitution,bolivian-constitution,argentine-constitution,meiji-constitution,german-empire,weimar-constitution,irish-free,philippine-constitution,czechoslovak-constitution,gdr-constitution,german-basic,canadian-constitution,australian-constitution,irish-constitution,south-african,articles-of,northwest-ordinance,petition-of,habeas-corpus,english-act,golden-bull,act-of,virginia-charter,mayflower-compact,fundamental-orders,massachusetts-body,pennsylvania-charter,inter-caetera,romanus-pontifex,instrument-of,edict-of,camp-david,estonian-declaration,gitlow-v,irish-declaration,israeli-declaration,locarno-pact,maastricht-treaty,near-v,oslo-accords,philippine-declaration,sacco-vanzetti,texas-declaration,treaty-brest,treaty-paris,treaty-rapallo,treaty-shimonoseki,treaty-tlatelolco,treaty-westphalia,vietnamese-declaration,virginia-declaration,whitney-v,bracton-note,thorpe-ancient".split(
    ","
  )
);
// Trial transcripts, hearings, inquisitions.
const DOCS_TRIALS = new Set(
  "tob-0038,tob-0039,nara-m887,michelet-proces,limborch-liber,douais-documents,penn-trial".split(
    ","
  )
);

// --- the classifier --------------------------------------------------------
// Returns the subcategory id for an artifact (collection-scoped). Always
// returns a valid id — unknown prefixes fall into the "other" catch-all.
export function towerSubId(a) {
  const col = a.collection || "OTHER";
  const p = idPrefix(a.artifact_id);
  switch (col) {
    case "PAPERS":
      if (/^(europmc-|pmc-)/.test(p)) return "bio";
      if (/^arxiv-/.test(p)) return "cs";
      if (/^plos-/.test(p)) return "plos";
      if (/^doe-osti/.test(p)) return "energy";
      if (/^nasa-/.test(p)) return "space";
      return "other";
    case "DECLASSIFIED":
      if (/^cia-/.test(p)) return "cia";
      if (/^frus-/.test(p)) return "state";
      if (/^(gao-|plaw-)/.test(p)) return "congress";
      if (/^un-/.test(p)) return "un";
      if (/^(govdocs-nsarchive|nsa-)/.test(p)) return "nsa";
      if (/^fbi-vault/.test(p)) return "fbi";
      return "other";
    case "BOOKS":
      // The Tower's own curated shelf (tob-*) is sacred/religious/esoteric.
      if (/^tob-/.test(p)) return "sacred";
      if (BOOKS_SACRED_PREFIXES.has(p) || BOOKS_SACRED_IA.has(p)) return "sacred";
      if (BOOKS_PHILO_PREFIXES.has(p)) return "philo";
      return "lit";
    case "DOCUMENTS":
      if (/^constitution-/.test(p)) return "founding";
      if (DOCS_FOUNDING.has(p)) return "founding";
      if (DOCS_TRIALS.has(p)) return "trials";
      if (/^meyer-us/.test(p)) return "patents";
      return "other";
    default:
      return "";
  }
}

// "COLLECTION:sub" compound key used in filter state, or "" for no filter.
export function towerBucketKey(a) {
  const sub = towerSubId(a);
  return sub ? `${a.collection || "OTHER"}:${sub}` : "";
}

export function towerSubLabel(collection, subId) {
  const sub = (TOWER_SUBS[collection] || []).find((s) => s.id === subId);
  return sub ? sub.label : "";
}
