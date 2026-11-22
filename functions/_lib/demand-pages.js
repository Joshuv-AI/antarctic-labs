// Demand pages for the Tower of Babel (2026-11-21, traffic program
// Wave 1): author pages and study guides, plus the cross-link map the
// entry pages use for their "Related reading" sections.
//
// Routes served from this module (see functions/tower-of-babel/authors*
// and guides*): /tower-of-babel/authors, /tower-of-babel/authors/<slug>,
// /tower-of-babel/guides, /tower-of-babel/guides/<slug>. They are
// server-rendered for every visitor, following the collections landing
// pattern (functions/_lib/collections.js): same shell, same typography,
// same nav/footer furniture, JSON-LD graph, edge-cached for a day.
//
// Every work linked from these pages, and every link in WORK_LINKS, was
// verified against the published catalog before this module was written
// (record present in the entry-record buckets, hosted text present and
// sampled clean). The Emancipation Proclamation record was deliberately
// left out of Wave 1: its hosted text is a Wikisource index page, not
// the proclamation — see the lane report. No page here links to it.
//
// Introductions and biographies are original editorial text written for
// this library (2026-11-21); the same introductions are published as the
// entries' description overrides in public/tower-descriptions/.
//
// This is a NEW path, deliberately not /tower-of-babel/hubs: the old hub
// pages were deleted 2026-10-24 by user order and stay deleted.

import { SITE, escapeHtml } from "./tower-catalog.js";

export const AUTHORS_BASE = "/tower-of-babel/authors";
export const GUIDES_BASE = "/tower-of-babel/guides";
export const DEMAND_LASTMOD = "2026-11-21";

export const AUTHORS = {
 "jane-austen": {
  "name": "Jane Austen",
  "dates": "1775–1817",
  "bio": "Jane Austen was born in 1775 at Steventon in Hampshire, the seventh of eight children of a country clergyman, and she lived almost her whole life inside the small world she wrote about: gentry families, country visits, assemblies, clergy, naval officers home on leave. She began writing as a girl — the juvenilia are wild, funny parodies — and drafted the novels that became Sense and Sensibility and Pride and Prejudice in her early twenties. A decade of silence followed: a move to Bath, her father's death, years of dependence on brothers. Then, settled at Chawton in 1809, she revised, wrote Mansfield Park, Emma and Persuasion in a final blaze, and published four novels before dying at forty-one in 1817, her name on none of them in her lifetime.\n\nHer subject is narrow by design: three or four families in a country village, as she described it, worked on a little piece of ivory two inches wide. Within that frame she built the most exact moral machinery in English fiction. Her novels run on conversation, and her subject under the conversation is money — who has it, who needs it, what it does to love, judgement and manners. She is also, page for page, one of the funniest writers in the language.\n\nThis library holds all six of her major novels, and they reward reading in the order she published them: Sense and Sensibility (1811), Pride and Prejudice (1813), Mansfield Park (1814), Emma (1815), and the posthumous Northanger Abbey and Persuasion (1817). New readers should start with Pride and Prejudice; readers who know it should go on to Emma and Persuasion, where her art reached its height.",
  "works": [
   [
    "austen-pride-and-prejudice-1813",
    "Pride and Prejudice (1813)",
    "Elizabeth Bennet and Mr Darcy: the most famous courtship in English fiction, and the novel to start with."
   ],
   [
    "austen-sense-and-sensibility-1811",
    "Sense and Sensibility (1811)",
    "Two sisters, two temperaments, one hard lesson in love and money. Her first published novel."
   ],
   [
    "austen-emma-1815",
    "Emma (1815)",
    "The matchmaker who cannot read anyone, least of all herself. Austen's most perfectly engineered plot."
   ],
   [
    "austen-persuasion-1817",
    "Persuasion (1817)",
    "A second chance at first love, eight years on. Her last and most tender novel."
   ],
   [
    "austen-mansfield-park-1814",
    "Mansfield Park (1814)",
    "Her most serious novel: a quiet heroine, a great house, and the money beneath it."
   ],
   [
    "austen-northanger-abbey-1817",
    "Northanger Abbey (1817)",
    "A girl raised on Gothic novels meets the real world. Austen's funniest book."
   ]
  ]
 },
 "charles-dickens": {
  "name": "Charles Dickens",
  "dates": "1812–1870",
  "bio": "Charles Dickens was born in 1812 and had his childhood broken at twelve, when his father went to debtors' prison and the boy was sent to work in a blacking factory — the wound under everything he wrote. He clawed his way up as a shorthand reporter, in Parliament and the courts, and then, in 1836, The Pickwick Papers made him the most famous writer in England at twenty-four. He stayed that famous for the rest of his life, inventing the modern serial novel as he went: monthly numbers, cliffhangers, crowds waiting at the docks in New York for the next instalment from London.\n\nHe wrote fifteen major novels, edited journals, campaigned against every cruelty his age practised on the poor, and performed his own work on stage until it helped kill him. He died in 1870, mid-sentence in The Mystery of Edwin Drood, and was buried in Westminster Abbey against his wishes for a quiet grave.\n\nHis range is the whole of Victorian life: workhouses and counting-houses, schools, prisons, fog, law, railways, slums and Christmas. No other novelist in English is at once so funny and so angry, or so populated — the census of his characters runs to the thousands, and a remarkable number of them are unforgettable.\n\nThis library holds fifteen of Dickens's works. The best doors in are A Christmas Carol for an evening, Great Expectations for the perfect plot, A Tale of Two Cities for the storm of the French Revolution, David Copperfield for the life that most resembles his own, and Oliver Twist for the anger at its source.",
  "works": [
   [
    "dickens-great-expectations-1861",
    "Great Expectations (1861)",
    "Pip, Miss Havisham and the convict on the marshes: his most perfectly plotted novel."
   ],
   [
    "dickens-christmas-carol-1843",
    "A Christmas Carol (1843)",
    "Scrooge's haunted night. The Christmas story that fixed the modern Christmas."
   ],
   [
    "dickens-tale-of-two-cities-1859",
    "A Tale of Two Cities (1859)",
    "London and Paris in the French Revolution — his bestselling novel in his lifetime."
   ],
   [
    "dickens-oliver-twist-1838",
    "Oliver Twist (1838)",
    "The workhouse boy who asked for more: the novel that attacked the New Poor Law."
   ],
   [
    "dickens-david-copperfield-1850",
    "David Copperfield (1850)",
    "His most autobiographical novel, and his own favourite of his children."
   ]
  ]
 },
 "mark-twain": {
  "name": "Mark Twain",
  "dates": "1835–1910",
  "bio": "Samuel Langhorne Clemens was born in Missouri in 1835, two weeks after Halley's Comet passed, and grew up in Hannibal, on the Mississippi River — the town he would rebuild as St Petersburg in his books. He was a printer's apprentice, a riverboat pilot (the pen name Mark Twain is a leadsman's call, meaning two fathoms, safe water), a deserter from a two-week Confederate militia, a failed miner and a successful journalist in Nevada and California, before The Celebrated Jumping Frog of Calaveras County made his name in 1865.\n\nThe river gave him his material and America gave him his voice: a written language built from the spoken one, in several dialects, against the genteel book-English of his day. The Innocents Abroad made him rich; Tom Sawyer made him beloved; Adventures of Huckleberry Finn made him immortal, and remains the book American literature is measured by. He was also a businessman of genius and folly — a publisher, an investor in a typesetting machine that ate his fortune — and he wrote his way out of bankruptcy in his sixties on a world lecture tour, paying every creditor.\n\nHis later work darkens: the satire sharpens, the jokes turn on cruelty, empire and human self-deception. He died in 1910, as the comet returned, having become the first American writer who was also a worldwide celebrity in the modern sense.\n\nThis library holds twenty-five of Twain's works. Start with Huckleberry Finn, then Tom Sawyer; then try The Prince and the Pauper, A Connecticut Yankee in King Arthur's Court, and the travel books for the voice at large in the world.",
  "works": [
   [
    "twain-huckleberry-finn-1884",
    "Adventures of Huckleberry Finn (1884)",
    "Huck and Jim on the raft: the great American novel, and the place to start."
   ],
   [
    "twain-tom-sawyer-1876",
    "The Adventures of Tom Sawyer (1876)",
    "The boyhood idyll — whitewashed fences, caves and a murder in the graveyard."
   ]
  ]
 }
};

export const GUIDES = {
 "constitution": {
  "title": "The Constitution: A Study Guide",
  "kicker": "Tower of Babel · Guides",
  "intro": "Everything on this page is a real text held in full by this library — the founding document itself, the arguments for and against it, the amendments that remade it, and the classic books that interpreted it. It is arranged as a course of reading: start with the Constitution, argue about it with the men who fought over it in 1787 and 1788, then follow the text as later generations amended it, and finish with the interpreters.\n\nThe Constitution of 1787 is a short document with a long wake. The Federalist Papers explain its machinery from inside the campaign to ratify it; the Anti-Federalist essays state the fears it had to answer, and the Bill of Rights was the price of those fears. Joseph Story's Commentaries of 1833 are the first great treatise on it, written by a sitting Supreme Court justice who had known the founding generation. Charles Beard's Economic Interpretation of 1913 asked the uncomfortable question — whose property did the frame protect? — and constitutional scholarship has argued with him ever since.\n\nRead in this order, the shelf tells one continuous story: a design, a debate, a settlement, and two centuries of Americans re-reading the same seven articles. Each entry below carries its own introduction on its library page.",
  "curator": "Antarctic Labs — Tower of Babel editors",
  "sections": [
   {
    "h": "The text itself",
    "items": [
     [
      "us-constitution-bill-of-rights",
      "The Constitution with the Bill of Rights",
      "The frame of 1787 with its first ten amendments — read it whole, at a sitting."
     ],
     [
      "us-amendment-13",
      "Thirteenth Amendment (1865)",
      "Abolishes slavery and involuntary servitude, closing the question the war had opened."
     ],
     [
      "us-amendment-14",
      "Fourteenth Amendment (1868)",
      "Citizenship, due process and equal protection — the hinge of the modern Constitution."
     ],
     [
      "us-amendment-15",
      "Fifteenth Amendment (1870)",
      "The vote shall not be denied on account of race, colour or previous servitude."
     ],
     [
      "us-amendment-19",
      "Nineteenth Amendment (1920)",
      "Women's suffrage, after a seventy-year campaign from Seneca Falls."
     ]
    ]
   },
   {
    "h": "The argument over it, 1787–88",
    "items": [
     [
      "federalist-papers",
      "The Federalist Papers",
      "Hamilton, Madison and Jay as Publius: the case for the Constitution, essay by essay."
     ],
     [
      "anti-federalist-papers-brutus",
      "The Anti-Federalist Papers (Brutus)",
      "The case against — the essays that lost the vote and won the Bill of Rights."
     ]
    ]
   },
   {
    "h": "The interpreters",
    "items": [
     [
      "story-commentaries-constitution-1833-vol1",
      "Story's Commentaries, Vol. I (1833)",
      "Justice Joseph Story's great treatise: the Constitution explained by the founding's heirs."
     ],
     [
      "story-commentaries-constitution-1833-vol2",
      "Story's Commentaries, Vol. II (1833)",
      "The second volume: the legislature, the executive and the powers of the Union."
     ],
     [
      "story-commentaries-constitution-1833-vol3",
      "Story's Commentaries, Vol. III (1833)",
      "The third volume: the judiciary, the states, and amendments."
     ],
     [
      "beard-economic-interpretation-1913",
      "Beard's Economic Interpretation (1913)",
      "The famous challenge: the Constitution read as an economic document."
     ]
    ]
   }
  ]
 },
 "founding-documents": {
  "title": "Founding Documents of the United States",
  "kicker": "Tower of Babel · Guides",
  "intro": "The American founding was done in writing: a pamphlet that made independence thinkable, a declaration that announced it, a failed first frame, a constitution that worked, and the arguments that sold and resisted it. This page gathers the founding shelf of the library in the order the documents appeared, each held in full text and each with its own introduction on its library page.\n\nBegin with Thomas Paine, whose Common Sense (1776) turned a colonial quarrel into a revolution in fifty pages of plain prose. The Declaration of Independence followed that July — Jefferson's draft, Congress's edits, the signers' pledge. The Articles of Confederation (1777) were the first frame of union, and their weakness is the Constitution's best explanation: the Northwest Ordinance of 1787, the Confederation's one great achievement, governed the territories and barred slavery from them. Then the Constitution itself, the Federalist and Anti-Federalist essays that argued over it, Washington's Farewell Address as the first president handed over power, and Frederick Douglass's Fourth of July oration of 1852 and the Seneca Falls Declaration of 1848 — the founding's promises quoted back to it by the people they had left out.\n\nThat last pair belongs here deliberately: the founding documents did not stop being written in 1791, and their second authors were the excluded. The Constitution study guide, linked below, takes the constitutional thread further, into the amendments and the great commentaries.",
  "curator": "Antarctic Labs — Tower of Babel editors",
  "sections": [
   {
    "h": "The founding shelf, in order",
    "items": [
     [
      "common-sense-thomas-paine",
      "Common Sense (1776)",
      "Paine's pamphlet: the case for independence, in plain words, that outsold everything."
     ],
     [
      "us-declaration-of-independence",
      "Declaration of Independence (1776)",
      "The announcement and the argument: preamble, grievances and the signers' pledge."
     ],
     [
      "articles-of-confederation-1777",
      "Articles of Confederation (1777)",
      "The first frame of union — and the lesson in what it could not do."
     ],
     [
      "northwest-ordinance-1787",
      "Northwest Ordinance (1787)",
      "How the territories would become states, with slavery barred from them."
     ],
     [
      "us-constitution-bill-of-rights",
      "The Constitution and Bill of Rights (1787–91)",
      "The frame that worked, with the first ten amendments."
     ],
     [
      "federalist-papers",
      "The Federalist Papers (1787–88)",
      "The case for ratification, by Hamilton, Madison and Jay."
     ],
     [
      "anti-federalist-papers-brutus",
      "The Anti-Federalist Papers (1787–88)",
      "The case against, by Brutus and others — answered by the Bill of Rights."
     ],
     [
      "washington-farewell-address-1796",
      "Washington's Farewell Address (1796)",
      "The first president's warnings: parties, factions and foreign entanglements."
     ],
     [
      "seneca-falls-declaration-1848",
      "Declaration of Sentiments (1848)",
      "Seneca Falls restates the Declaration for women: 'all men and women are created equal.'"
     ],
     [
      "douglass-fourth-of-july-1852",
      "What to the Slave Is the Fourth of July? (1852)",
      "Douglass's great oration: the founding's promise quoted back to it."
     ]
    ]
   },
   {
    "h": "Go deeper",
    "items": [
     [
      "gettysburg-address",
      "The Gettysburg Address (1863)",
      "Lincoln re-founds the nation on the Declaration's proposition, in 272 words."
     ],
     [
      "paine-rights-of-man",
      "Rights of Man (1791)",
      "Paine's answer to Burke: the founding's principles defended for the French Revolution."
     ]
    ]
   }
  ]
 }
};

// artifact_id -> [[href, anchor], ...] for entry "Related reading".
export const WORK_LINKS = {
 "frankenstein-1818": [
  [
   "/tower-of-babel/library/frankenstein-1831",
   "Frankenstein — the revised text of 1831"
  ],
  [
   "/tower-of-babel/library/mathilda",
   "Mathilda, by Mary Shelley"
  ],
  [
   "/tower-of-babel/library/the-last-man",
   "The Last Man, by Mary Shelley"
  ]
 ],
 "frankenstein-1831": [
  [
   "/tower-of-babel/library/frankenstein-1818",
   "Frankenstein — the original text of 1818"
  ],
  [
   "/tower-of-babel/library/mathilda",
   "Mathilda, by Mary Shelley"
  ]
 ],
 "mathilda": [
  [
   "/tower-of-babel/library/frankenstein-1818",
   "Frankenstein (1818), by Mary Shelley"
  ]
 ],
 "the-last-man": [
  [
   "/tower-of-babel/library/frankenstein-1818",
   "Frankenstein (1818), by Mary Shelley"
  ]
 ],
 "austen-pride-and-prejudice-1813": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ],
  [
   "/tower-of-babel/library/austen-emma-1815",
   "Emma, by Jane Austen"
  ],
  [
   "/tower-of-babel/library/austen-persuasion-1817",
   "Persuasion, by Jane Austen"
  ]
 ],
 "austen-emma-1815": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ]
 ],
 "austen-persuasion-1817": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ]
 ],
 "austen-sense-and-sensibility-1811": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ]
 ],
 "austen-mansfield-park-1814": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ]
 ],
 "austen-northanger-abbey-1817": [
  [
   "/tower-of-babel/authors/jane-austen",
   "Jane Austen — all six novels in this library"
  ]
 ],
 "dracula": [
  [
   "/tower-of-babel/library/draculas-guest",
   "Dracula's Guest and Other Weird Stories, by Bram Stoker"
  ]
 ],
 "draculas-guest": [
  [
   "/tower-of-babel/library/dracula",
   "Dracula, by Bram Stoker"
  ]
 ],
 "bronte-jane-eyre-1847": [
  [
   "/tower-of-babel/library/bronte-wuthering-heights-1847",
   "Wuthering Heights, by Emily Brontë"
  ]
 ],
 "us-declaration-of-independence": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States — the full shelf"
  ],
  [
   "/tower-of-babel/library/common-sense-thomas-paine",
   "Common Sense, by Thomas Paine"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/library/douglass-fourth-of-july-1852",
   "What to the Slave Is the Fourth of July?, by Frederick Douglass"
  ]
 ],
 "us-constitution-bill-of-rights": [
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ],
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States"
  ],
  [
   "/tower-of-babel/library/federalist-papers",
   "The Federalist Papers"
  ],
  [
   "/tower-of-babel/library/anti-federalist-papers-brutus",
   "The Anti-Federalist Papers (Brutus)"
  ],
  [
   "/tower-of-babel/library/us-amendment-14",
   "The Fourteenth Amendment"
  ]
 ],
 "us-amendment-13": [
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "us-amendment-14": [
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "us-amendment-15": [
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "us-amendment-19": [
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/library/seneca-falls-declaration-1848",
   "Declaration of Sentiments (Seneca Falls, 1848)"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "gettysburg-address": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States"
  ],
  [
   "/tower-of-babel/library/us-declaration-of-independence",
   "The Declaration of Independence"
  ]
 ],
 "federalist-papers": [
  [
   "/tower-of-babel/library/anti-federalist-papers-brutus",
   "The Anti-Federalist Papers (Brutus) — the other side"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "anti-federalist-papers-brutus": [
  [
   "/tower-of-babel/library/federalist-papers",
   "The Federalist Papers"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ],
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ]
 ],
 "common-sense-thomas-paine": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States"
  ],
  [
   "/tower-of-babel/library/paine-rights-of-man",
   "Rights of Man, by Thomas Paine"
  ],
  [
   "/tower-of-babel/library/us-declaration-of-independence",
   "The Declaration of Independence"
  ]
 ],
 "paine-rights-of-man": [
  [
   "/tower-of-babel/library/common-sense-thomas-paine",
   "Common Sense, by Thomas Paine"
  ],
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States"
  ]
 ],
 "seneca-falls-declaration-1848": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States — the full shelf"
  ]
 ],
 "washington-farewell-address-1796": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States — the full shelf"
  ]
 ],
 "articles-of-confederation-1777": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States — the full shelf"
  ]
 ],
 "northwest-ordinance-1787": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States — the full shelf"
  ]
 ],
 "douglass-fourth-of-july-1852": [
  [
   "/tower-of-babel/guides/founding-documents",
   "Founding Documents of the United States"
  ],
  [
   "/tower-of-babel/library/gettysburg-address",
   "The Gettysburg Address"
  ]
 ],
 "story-commentaries-constitution-1833-vol1": [
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ]
 ],
 "story-commentaries-constitution-1833-vol2": [
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ]
 ],
 "story-commentaries-constitution-1833-vol3": [
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ]
 ],
 "beard-economic-interpretation-1913": [
  [
   "/tower-of-babel/guides/constitution",
   "The Constitution: A Study Guide"
  ],
  [
   "/tower-of-babel/library/us-constitution-bill-of-rights",
   "The Constitution and Bill of Rights"
  ]
 ],
 "art-of-war-giles-1910": [
  [
   "/tower-of-babel/library/tob-4002",
   "The Prince, by Niccolò Machiavelli"
  ]
 ],
 "tob-4002": [
  [
   "/tower-of-babel/library/art-of-war-giles-1910",
   "The Art of War (Giles translation)"
  ]
 ],
 "marcus-aurelius-meditations-long": [
  [
   "/tower-of-babel/library/marcus-aurelius-meditations-casaubon-1634",
   "Meditations — the Casaubon translation of 1634"
  ]
 ],
 "marcus-aurelius-meditations-casaubon-1634": [
  [
   "/tower-of-babel/library/marcus-aurelius-meditations-long",
   "Meditations — the Long translation of 1862"
  ]
 ],
 "tob-0005": [
  [
   "/tower-of-babel/library/tao-te-ching-legge-1891",
   "Tao Te Ching — the Legge translation of 1891"
  ],
  [
   "/tower-of-babel/library/tob-10415",
   "The Analects of Confucius (Legge translation)"
  ],
  [
   "/tower-of-babel/library/judge-bhagavad-gita-1890",
   "The Bhagavad Gita (Judge translation)"
  ],
  [
   "/tower-of-babel/library/tob-0191",
   "The Upanishads (Müller translation)"
  ]
 ],
 "tao-te-ching-legge-1891": [
  [
   "/tower-of-babel/library/tob-0005",
   "Tao Te Ching — the library's reading text"
  ],
  [
   "/tower-of-babel/library/tob-10415",
   "The Analects of Confucius (Legge translation)"
  ]
 ],
 "hugo-les-miserables-hapgood-1887": [
  [
   "/tower-of-babel/library/hugo-hunchback-of-notre-dame-hapgood-1888",
   "Notre-Dame de Paris, by Victor Hugo"
  ]
 ],
 "dumas-count-of-monte-cristo-1844": [
  [
   "/tower-of-babel/library/dumas-three-musketeers-1844",
   "The Three Musketeers, by Alexandre Dumas"
  ]
 ],
 "tolstoy-war-and-peace-maude-1922": [
  [
   "/tower-of-babel/library/tolstoy-anna-karenina-garnett-1901",
   "Anna Karenina, by Leo Tolstoy (Garnett translation)"
  ]
 ],
 "milton-paradise-lost-1667": [
  [
   "/tower-of-babel/library/bunyan-pilgrims-progress-1678",
   "The Pilgrim's Progress, by John Bunyan"
  ]
 ],
 "bunyan-pilgrims-progress-1678": [
  [
   "/tower-of-babel/library/milton-paradise-lost-1667",
   "Paradise Lost, by John Milton"
  ]
 ],
 "homer-iliad-pope-1715": [
  [
   "/tower-of-babel/library/homer-iliad-chapman-1616",
   "The Iliad in Chapman's translation (1611)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-iliad-1791",
   "The Iliad in Cowper's blank verse (1791)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-butler",
   "The Iliad in Butler's prose (1898)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-pope-1725",
   "The Odyssey in Pope's couplets"
  ]
 ],
 "homer-iliad-chapman-1616": [
  [
   "/tower-of-babel/library/homer-iliad-pope-1715",
   "The Iliad in Pope's couplets (1715)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-iliad-1791",
   "The Iliad in Cowper's blank verse (1791)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-butler",
   "The Iliad in Butler's prose (1898)"
  ]
 ],
 "cowper-homer-iliad-1791": [
  [
   "/tower-of-babel/library/homer-iliad-pope-1715",
   "The Iliad in Pope's couplets (1715)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-chapman-1616",
   "The Iliad in Chapman's translation (1611)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-butler",
   "The Iliad in Butler's prose (1898)"
  ]
 ],
 "homer-iliad-butler": [
  [
   "/tower-of-babel/library/homer-iliad-pope-1715",
   "The Iliad in Pope's couplets (1715)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-chapman-1616",
   "The Iliad in Chapman's translation (1611)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-iliad-1791",
   "The Iliad in Cowper's blank verse (1791)"
  ]
 ],
 "homer-odyssey-pope-1725": [
  [
   "/tower-of-babel/library/homer-odyssey-chapman-1615",
   "The Odyssey in Chapman's translation (1615)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-odyssey-1791",
   "The Odyssey in Cowper's blank verse (1791)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-butler",
   "The Odyssey in Butler's prose (1900)"
  ],
  [
   "/tower-of-babel/library/homer-iliad-pope-1715",
   "The Iliad in Pope's couplets"
  ]
 ],
 "homer-odyssey-chapman-1615": [
  [
   "/tower-of-babel/library/homer-odyssey-pope-1725",
   "The Odyssey in Pope's couplets (1725)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-odyssey-1791",
   "The Odyssey in Cowper's blank verse (1791)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-butler",
   "The Odyssey in Butler's prose (1900)"
  ]
 ],
 "cowper-homer-odyssey-1791": [
  [
   "/tower-of-babel/library/homer-odyssey-pope-1725",
   "The Odyssey in Pope's couplets (1725)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-chapman-1615",
   "The Odyssey in Chapman's translation (1615)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-butler",
   "The Odyssey in Butler's prose (1900)"
  ]
 ],
 "homer-odyssey-butler": [
  [
   "/tower-of-babel/library/homer-odyssey-pope-1725",
   "The Odyssey in Pope's couplets (1725)"
  ],
  [
   "/tower-of-babel/library/homer-odyssey-chapman-1615",
   "The Odyssey in Chapman's translation (1615)"
  ],
  [
   "/tower-of-babel/library/cowper-homer-odyssey-1791",
   "The Odyssey in Cowper's blank verse (1791)"
  ]
 ],
 "tob-4030": [
  [
   "/tower-of-babel/library/cervantes-don-quixote-shelton-1612",
   "Don Quixote — the Shelton translation of 1612"
  ]
 ],
 "cervantes-don-quixote-shelton-1612": [
  [
   "/tower-of-babel/library/tob-4030",
   "Don Quixote — the Ormsby translation of 1885"
  ]
 ],
 "darwin-origin-of-species-1st-ed-1859": [
  [
   "/tower-of-babel/library/tob-10200-d1",
   "On the Origin of Species — the revised later text"
  ],
  [
   "/tower-of-babel/library/darwin-descent-of-man-2nd-ed-1874",
   "The Descent of Man, by Charles Darwin"
  ]
 ],
 "tob-10200-d1": [
  [
   "/tower-of-babel/library/darwin-origin-of-species-1st-ed-1859",
   "On the Origin of Species — the first edition of 1859"
  ],
  [
   "/tower-of-babel/library/darwin-descent-of-man-2nd-ed-1874",
   "The Descent of Man, by Charles Darwin"
  ]
 ],
 "tob-12911-d1": [
  [
   "/tower-of-babel/library/darwin-origin-of-species-1st-ed-1859",
   "On the Origin of Species — the first edition of 1859"
  ]
 ],
 "dorian-gray-1891": [
  [
   "/tower-of-babel/library/dorian-gray-1890",
   "The Picture of Dorian Gray — the magazine text of 1890"
  ]
 ],
 "dorian-gray-1890": [
  [
   "/tower-of-babel/library/dorian-gray-1891",
   "The Picture of Dorian Gray — the book text of 1891"
  ]
 ],
 "stevenson-treasure-island-1883": [
  [
   "/tower-of-babel/library/jekyll-and-hyde",
   "Strange Case of Dr Jekyll and Mr Hyde"
  ],
  [
   "/tower-of-babel/library/stevenson-kidnapped-1886",
   "Kidnapped, by Robert Louis Stevenson"
  ]
 ],
 "jekyll-and-hyde": [
  [
   "/tower-of-babel/library/stevenson-jekyll-hyde-1886",
   "Dr Jekyll and Mr Hyde — the same text under its dated record"
  ],
  [
   "/tower-of-babel/library/stevenson-treasure-island-1883",
   "Treasure Island, by Robert Louis Stevenson"
  ]
 ],
 "stevenson-jekyll-hyde-1886": [
  [
   "/tower-of-babel/library/jekyll-and-hyde",
   "Strange Case of Dr Jekyll and Mr Hyde"
  ],
  [
   "/tower-of-babel/library/stevenson-treasure-island-1883",
   "Treasure Island, by Robert Louis Stevenson"
  ]
 ],
 "wells-war-worlds-1898": [
  [
   "/tower-of-babel/library/wells-invisible-man-1897",
   "The Invisible Man, by H. G. Wells"
  ],
  [
   "/tower-of-babel/library/wells-first-men-in-the-moon-1901",
   "The First Men in the Moon, by H. G. Wells"
  ]
 ],
 "conrad-heart-of-darkness-1899": [
  [
   "/tower-of-babel/library/conrad-lord-jim-1900",
   "Lord Jim, by Joseph Conrad"
  ]
 ],
 "twain-huckleberry-finn-1884": [
  [
   "/tower-of-babel/authors/mark-twain",
   "Mark Twain — the works in this library"
  ],
  [
   "/tower-of-babel/library/twain-tom-sawyer-1876",
   "The Adventures of Tom Sawyer"
  ]
 ],
 "twain-tom-sawyer-1876": [
  [
   "/tower-of-babel/authors/mark-twain",
   "Mark Twain — the works in this library"
  ],
  [
   "/tower-of-babel/library/twain-huckleberry-finn-1884",
   "Adventures of Huckleberry Finn"
  ]
 ],
 "dickens-great-expectations-1861": [
  [
   "/tower-of-babel/authors/charles-dickens",
   "Charles Dickens — the works in this library"
  ],
  [
   "/tower-of-babel/library/dickens-christmas-carol-1843",
   "A Christmas Carol, by Charles Dickens"
  ]
 ],
 "dickens-christmas-carol-1843": [
  [
   "/tower-of-babel/authors/charles-dickens",
   "Charles Dickens — the works in this library"
  ],
  [
   "/tower-of-babel/library/dickens-great-expectations-1861",
   "Great Expectations, by Charles Dickens"
  ]
 ],
 "dickens-tale-of-two-cities-1859": [
  [
   "/tower-of-babel/authors/charles-dickens",
   "Charles Dickens — the works in this library"
  ]
 ],
 "dickens-oliver-twist-1838": [
  [
   "/tower-of-babel/authors/charles-dickens",
   "Charles Dickens — the works in this library"
  ]
 ],
 "dickens-david-copperfield-1850": [
  [
   "/tower-of-babel/authors/charles-dickens",
   "Charles Dickens — the works in this library"
  ]
 ]
};

export const PRIORITY_PATHS = [
 "/tower-of-babel/authors",
 "/tower-of-babel/authors/jane-austen",
 "/tower-of-babel/authors/charles-dickens",
 "/tower-of-babel/authors/mark-twain",
 "/tower-of-babel/guides",
 "/tower-of-babel/guides/constitution",
 "/tower-of-babel/guides/founding-documents",
 "/tower-of-babel/library/frankenstein-1818",
 "/tower-of-babel/library/frankenstein-1831",
 "/tower-of-babel/library/austen-pride-and-prejudice-1813",
 "/tower-of-babel/library/dracula",
 "/tower-of-babel/library/melville-moby-dick-1851",
 "/tower-of-babel/library/bronte-jane-eyre-1847",
 "/tower-of-babel/library/fitzgerald-great-gatsby-1925",
 "/tower-of-babel/library/us-declaration-of-independence",
 "/tower-of-babel/library/us-constitution-bill-of-rights",
 "/tower-of-babel/library/gettysburg-address",
 "/tower-of-babel/library/federalist-papers",
 "/tower-of-babel/library/common-sense-thomas-paine",
 "/tower-of-babel/library/art-of-war-giles-1910",
 "/tower-of-babel/library/marcus-aurelius-meditations-long",
 "/tower-of-babel/library/marcus-aurelius-meditations-casaubon-1634",
 "/tower-of-babel/library/tob-0005",
 "/tower-of-babel/library/hugo-les-miserables-hapgood-1887",
 "/tower-of-babel/library/dumas-count-of-monte-cristo-1844",
 "/tower-of-babel/library/dostoevsky-crime-and-punishment-garnett-1914",
 "/tower-of-babel/library/tolstoy-war-and-peace-maude-1922",
 "/tower-of-babel/library/milton-paradise-lost-1667",
 "/tower-of-babel/library/homer-iliad-pope-1715",
 "/tower-of-babel/library/homer-iliad-cowper-1791",
 "/tower-of-babel/library/homer-odyssey-pope-1725",
 "/tower-of-babel/library/homer-odyssey-chapman-1615",
 "/tower-of-babel/library/cervantes-don-quixote-ormsby-1885",
 "/tower-of-babel/library/cervantes-don-quixote-shelton-1612",
 "/tower-of-babel/library/darwin-origin-of-species-1st-ed-1859",
 "/tower-of-babel/library/homer-iliad-chapman-1616",
 "/tower-of-babel/library/dorian-gray-1891",
 "/tower-of-babel/library/dorian-gray-1890",
 "/tower-of-babel/library/stevenson-treasure-island-1883",
 "/tower-of-babel/library/jekyll-and-hyde",
 "/tower-of-babel/library/stevenson-jekyll-hyde-1886",
 "/tower-of-babel/library/wells-war-worlds-1898",
 "/tower-of-babel/library/conrad-heart-of-darkness-1899",
 "/tower-of-babel/library/twain-huckleberry-finn-1884",
 "/tower-of-babel/library/austen-sense-and-sensibility-1811",
 "/tower-of-babel/library/austen-emma-1815",
 "/tower-of-babel/library/austen-mansfield-park-1814",
 "/tower-of-babel/library/austen-northanger-abbey-1817",
 "/tower-of-babel/library/austen-persuasion-1817",
 "/tower-of-babel/library/dickens-great-expectations-1861",
 "/tower-of-babel/library/dickens-christmas-carol-1843",
 "/tower-of-babel/library/twain-tom-sawyer-1876",
 "/tower-of-babel/library/tao-te-ching-legge-1891",
 "/tower-of-babel/library/tob-10200-d1",
 "/tower-of-babel/library/homer-iliad-butler",
 "/tower-of-babel/library/homer-odyssey-butler",
 "/tower-of-babel/library/cowper-homer-odyssey-1791",
 "/tower-of-babel/library/us-amendment-13",
 "/tower-of-babel/library/us-amendment-14",
 "/tower-of-babel/library/us-amendment-15",
 "/tower-of-babel/library/us-amendment-19",
 "/tower-of-babel/library/anti-federalist-papers-brutus",
 "/tower-of-babel/library/draculas-guest"
];

const ADS_SCRIPT =
  '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9404729840269984" crossorigin="anonymous"></script>';

const NAV = `<header>
<nav>
<a href="/">Antarctic Labs</a> ·
<a href="/tower-of-babel">Tower of Babel</a> ·
<a href="/tower-of-babel/library">Library</a> ·
<a href="/about">About</a> ·
<a href="/contact">Contact</a> ·
<a href="/privacy">Privacy Policy</a>
</nav>
</header>`;

const FOOT = `<footer>
<p><a href="/">Antarctic Labs</a> · <a href="/tower-of-babel">Tower of Babel</a> · <a href="/tower-of-babel/library">Library</a> · <a href="/about">About</a> · <a href="/contact">Contact</a> · <a href="/government-contracting">Government Contracting</a> · <a href="/tower-of-babel/donate">Donate</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a> · <a href="/rights-and-sources">Rights &amp; Sources</a></p>
<p>Contact: <a href="mailto:hello@antarctic-labs.com">hello@antarctic-labs.com</a></p>
<p><a href="https://www.google.com/preferences/source?q=antarctic-labs.com" target="_blank" rel="noopener">Add Antarctic Labs as a preferred source on Google</a></p>
<p>© 2026 Antarctic Labs. All rights reserved.</p>
</footer>`;

function shell({ path, title, description, jsonLd, body }) {
  const canonical = SITE + path;
  const desc = String(description || "").slice(0, 160);
  const ld = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<script type="application/ld+json">
${ld}
</script>
${ADS_SCRIPT}
<style>
body { font-family: Georgia, "Times New Roman", serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.65; color: #191919; }
h1 { line-height: 1.15; } h2 { margin-top: 2rem; }
nav a, footer a { color: #0f5d75; }
</style>
</head>
<body>
${NAV}
<main>
${body}
</main>
${FOOT}
</body>
</html>
`;
}

function breadcrumbJsonLd(crumbs) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: SITE + c.path,
    })),
  };
}

const paras = (text) =>
  String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");

const entryHref = (id) => `/tower-of-babel/library/${id}`;

const RIGHTS_NOTE =
  "<p>Every work listed on this page is a public-domain text held in full by the Tower of Babel library and preserved in clean, searchable text. Each work's own page carries its catalog record — source, rights status and file details — and, where text is present, the complete text to read or download. No sign-up.</p>";
const CURATOR_NOTE =
  "<p>Prepared by the Antarctic Labs — Tower of Babel editors, November 2026.</p>";

// --- Entry cross-links ---------------------------------------------------

export function relatedLinksHtml(artifactId) {
  const links = WORK_LINKS[artifactId];
  if (!links || !links.length) return "";
  const items = links
    .map(
      ([href, anchor]) =>
        `<li><a href="${escapeHtml(href)}">${escapeHtml(anchor)}</a></li>`
    )
    .join("\n");
  return `<section>
<h2>Related reading</h2>
<ul>
${items}
</ul>
</section>
`;
}

// --- Author pages --------------------------------------------------------

export function renderAuthorPage(slug) {
  const a = AUTHORS[slug];
  if (!a) return null;
  const path = `${AUTHORS_BASE}/${slug}`;
  const works = a.works
    .map(
      ([id, label, note]) =>
        `<li><a href="${entryHref(id)}">${escapeHtml(label)}</a> — ${escapeHtml(note)}</li>`
    )
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: a.name,
        url: SITE + path,
        description: `${a.name} (${a.dates}) — works held in full by the Tower of Babel library.`,
      },
      {
        "@type": "ItemList",
        name: `Works by ${a.name} in the Tower of Babel`,
        itemListElement: a.works.map(([id, label], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: label,
          url: SITE + entryHref(id),
        })),
      },
      breadcrumbJsonLd([
        { name: "Antarctic Labs", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Authors", path: AUTHORS_BASE },
        { name: a.name, path },
      ]),
    ],
  };
  const others = Object.entries(AUTHORS)
    .filter(([s]) => s !== slug)
    .map(([s, o]) => `<li><a href="${AUTHORS_BASE}/${s}">${escapeHtml(o.name)}</a> (${escapeHtml(o.dates)})</li>`)
    .join("\n");
  const body = `<h1>${escapeHtml(a.name)}</h1>
<p>${escapeHtml(a.dates)}</p>
${paras(a.bio)}
<h2>Works in this library</h2>
<ul>
${works}
</ul>
${RIGHTS_NOTE}
${CURATOR_NOTE}
<h2>Other authors</h2>
<ul>
${others}
</ul>
<p><a href="${AUTHORS_BASE}">All authors</a> · <a href="/tower-of-babel/library">Browse the full library</a></p>`;
  return shell({
    path,
    title: `${a.name} — Works in the Tower of Babel`,
    description: `${a.name} (${a.dates}): biography and the works held in full, free to read, in the Tower of Babel library.`,
    jsonLd,
    body,
  });
}

export function renderAuthorsIndex() {
  const path = AUTHORS_BASE;
  const items = Object.entries(AUTHORS)
    .map(
      ([s, a]) =>
        `<li><a href="${AUTHORS_BASE}/${s}">${escapeHtml(a.name)}</a> (${escapeHtml(a.dates)}) — ${a.works.length} works held in this library</li>`
    )
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Tower of Babel authors",
        itemListElement: Object.entries(AUTHORS).map(([s, a], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: a.name,
          url: SITE + `${AUTHORS_BASE}/${s}`,
        })),
      },
      breadcrumbJsonLd([
        { name: "Antarctic Labs", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Authors", path },
      ]),
    ],
  };
  const body = `<h1>Authors</h1>
<p>Author pages for the writers whose works anchor this library: an original short biography, and the works of theirs held here in full text, each with its own introduction.</p>
<ul>
${items}
</ul>
<p><a href="/tower-of-babel/library">Browse the full library</a> · <a href="${GUIDES_BASE}">Study guides</a></p>`;
  return shell({
    path,
    title: "Authors — Tower of Babel",
    description: "Author pages in the Tower of Babel library: biographies and the works held in full text.",
    jsonLd,
    body,
  });
}

// --- Guide pages -----------------------------------------------------------

export function renderGuidePage(slug) {
  const g = GUIDES[slug];
  if (!g) return null;
  const path = `${GUIDES_BASE}/${slug}`;
  const sections = g.sections
    .map((s) => {
      const items = s.items
        .map(
          ([id, label, note]) =>
            `<li><a href="${entryHref(id)}">${escapeHtml(label)}</a> — ${escapeHtml(note)}</li>`
        )
        .join("\n");
      return `<h2>${escapeHtml(s.h)}</h2>
<ul>
${items}
</ul>`;
    })
    .join("\n");
  const allItems = g.sections.flatMap((s) => s.items);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: g.title,
        url: SITE + path,
        author: { "@type": "Organization", name: "Antarctic Labs" },
        datePublished: DEMAND_LASTMOD,
      },
      {
        "@type": "ItemList",
        name: g.title,
        itemListElement: allItems.map(([id, label], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: label,
          url: SITE + entryHref(id),
        })),
      },
      breadcrumbJsonLd([
        { name: "Antarctic Labs", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Guides", path: GUIDES_BASE },
        { name: g.title, path },
      ]),
    ],
  };
  const otherSlug = slug === "constitution" ? "founding-documents" : "constitution";
  const other = GUIDES[otherSlug];
  const body = `<h1>${escapeHtml(g.title)}</h1>
${paras(g.intro)}
${sections}
${RIGHTS_NOTE}
${CURATOR_NOTE}
<p>Companion guide: <a href="${GUIDES_BASE}/${otherSlug}">${escapeHtml(other.title)}</a> · <a href="${GUIDES_BASE}">All guides</a> · <a href="/tower-of-babel/library">Browse the full library</a></p>`;
  return shell({
    path,
    title: `${g.title} — Tower of Babel`,
    description: g.intro.split(/\n\s*\n/)[0].slice(0, 300),
    jsonLd,
    body,
  });
}

export function renderGuidesIndex() {
  const path = GUIDES_BASE;
  const items = Object.entries(GUIDES)
    .map(
      ([s, g]) =>
        `<li><a href="${GUIDES_BASE}/${s}">${escapeHtml(g.title)}</a> — ${g.sections.reduce((n, sec) => n + sec.items.length, 0)} texts, annotated and in reading order</li>`
    )
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name: "Tower of Babel study guides",
        itemListElement: Object.entries(GUIDES).map(([s, g], i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: g.title,
          url: SITE + `${GUIDES_BASE}/${s}`,
        })),
      },
      breadcrumbJsonLd([
        { name: "Antarctic Labs", path: "/" },
        { name: "Tower of Babel", path: "/tower-of-babel" },
        { name: "Guides", path },
      ]),
    ],
  };
  const body = `<h1>Study guides</h1>
<p>Reading paths through the library's shelves: an original overview, then the texts themselves — held in full, annotated, and arranged in the order to read them.</p>
<ul>
${items}
</ul>
<p><a href="${AUTHORS_BASE}">Authors</a> · <a href="/tower-of-babel/library">Browse the full library</a></p>`;
  return shell({
    path,
    title: "Study Guides — Tower of Babel",
    description: "Study guides for the Tower of Babel library: annotated reading paths through the founding documents and the Constitution shelf.",
    jsonLd,
    body,
  });
}

// --- Serving ---------------------------------------------------------------

function notFoundPage(what) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Not Found | Tower of Babel</title>
<meta name="robots" content="noindex, follow" />
</head>
<body>
<h1>Not found</h1>
<p>There is no ${escapeHtml(what)} at this address. Try the <a href="/tower-of-babel/library">library</a>, the <a href="${AUTHORS_BASE}">authors</a> or the <a href="${GUIDES_BASE}">guides</a>.</p>
</body>
</html>
`;
}

export async function serveDemandPage(context, render) {
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const html = render();
  if (!html) {
    return new Response(notFoundPage("page"), {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  const res = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
  context.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
}
