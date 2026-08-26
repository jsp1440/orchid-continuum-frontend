/**
 * Orchids on screen — recovered from the retired Hollywood Orchids widget.
 *
 * WHAT CROSSED, AND WHAT COULD NOT
 *
 * The legacy widget (`hollywood_orchids_widget.py` in the retired
 * Orchid_Continuum_Online application) held twenty entries written by the
 * Fivefold Path / FCOS article collection. The writing is the valuable part:
 * original criticism about how films use orchids, which nothing else in the
 * Continuum covers.
 *
 * Every entry also carried `poster_drive_id` and `poster_alt_drive_id` — film
 * posters re-hosted on Google Drive — and fourteen carried `full_movie_url`,
 * several pointing at YouTube embeds of complete feature films. Those are other
 * people's copyrighted works, republished without any evidence of a licence.
 * The retired application having done it is not a reason to keep doing it.
 *
 * So this type has NO field for a poster, a still, a trailer or a film link.
 * The omission is structural rather than a matter of remembering: there is
 * nowhere for such a URL to go, and a later contributor cannot add one to the
 * data without first changing the type and confronting this comment.
 *
 * What remains is what the Continuum may freely publish — factual credits
 * (title, year, director, cast, genre, all uncopyrightable facts) and the
 * FCOS authors' own prose.
 */

export type ScreenOrchidEntry = {
  slug: string;
  title: string;
  year?: number;
  director?: string;
  stars?: string;
  genre?: string;
  /** The theme the article draws out — its editorial angle. */
  orchidFocus?: string;
  /** Original FCOS prose about the film. */
  description?: string;
  /** Original FCOS prose about what the orchids are doing in it. */
  orchidSignificance?: string;
  /**
   * How the film treats orchids as subject matter.
   *
   * The source field was named `scientific_accuracy`, which overstates it —
   * these are a critic's remarks about a film's imagery, not an assessment
   * against any botanical record.
   */
  portrayalNote?: string;
  contributedBy?: string;
};

/** Provenance, carried with the data so the writing is never presented as anonymous. */
export const SCREEN_ORCHIDS_PROVENANCE = {
  source: 'Orchid_Continuum_Online · hollywood_orchids_widget.py',
  authorship: 'Fivefold Path / FCOS article collection',
  statement:
    'Editorial writing by the FCOS article collection, with factual film credits. No posters, stills, trailers or film links are reproduced: the retired widget re-hosted copyrighted posters and linked full features, and this recovery deliberately carries neither.',
} as const;

export const SCREEN_ORCHIDS: ScreenOrchidEntry[] = [
  {
    slug: "no_more_orchids",
    title: "No More Orchids (1932)",
    year: 1932,
    director: "Walter Lang",
    stars: "Carole Lombard, Walter Connolly, Lyle Talbot",
    genre: "Romance/Drama",
    orchidFocus: "Fleeting Beauty and Societal Expectations",
    description: "Carole Lombard plays a rebellious heiress resisting an arranged marriage. The orchids of the title reflect the fleeting nature of youth, beauty, and social status — treasures too delicate to withstand the pressures of expectation.",
    orchidSignificance: "Established cinematic shorthand: orchids as symbols of things precious but ultimately perishable",
    portrayalNote: "Symbolic - pioneered orchids as status symbols in early cinema",
    contributedBy: "FCOS Article",
  },
  {
    slug: "the_big_sleep",
    title: "The Big Sleep (1946)",
    year: 1946,
    director: "Howard Hawks",
    stars: "Humphrey Bogart, Lauren Bacall",
    genre: "Film Noir/Mystery",
    orchidFocus: "Decay Beneath Glamour",
    description: "Howard Hawks' steamy noir classic uses orchids with calculated purpose. General Sternwood's greenhouse is lush, heavy, and rotting under the tropical heat — a metaphor for moral corruption hiding beneath high society's glittering surface.",
    orchidSignificance: "Orchids glistening with humidity echo the film's atmosphere: beautiful, intoxicating, and fatally overripe",
    portrayalNote: "High - uses greenhouse orchids authentically to create oppressive atmosphere",
    contributedBy: "FCOS Article",
  },
  {
    slug: "black_orchid",
    title: "The Black Orchid (1958)",
    year: 1958,
    director: "Martin Ritt",
    stars: "Sophia Loren, Anthony Quinn",
    genre: "Drama/Romance",
    orchidFocus: "Love, Redemption, and Healing",
    description: "Sophia Loren portrays a widow labeled \"The Black Orchid\" for her troubled past. The orchid becomes a symbol of misunderstood beauty — dark, rare, and ultimately redeemable. Available to rent/buy on Amazon Prime Video.",
    orchidSignificance: "Rather than representing corruption, the flower signals hidden worth and renewal through love",
    portrayalNote: "High - accurately portrays black orchids as rare and symbolically meaningful",
    contributedBy: "FCOS Article",
  },
  {
    slug: "orchids_and_my_love",
    title: "Orchids and My Love (1966)",
    year: 1966,
    director: "Tien Feng",
    stars: "Ivy Ling Po",
    genre: "Taiwanese Drama",
    orchidFocus: "Personal Growth and Resilience",
    description: "A quiet gem from Taiwanese cinema. Orchids and My Love draws on the flower's connotations of perseverance and refinement. The orchid mirrors the inner journey of its heroine, whose hardships only make her spirit bloom more brilliantly.",
    orchidSignificance: "Orchids mirror personal transformation and inner strength through adversity",
    portrayalNote: "Cultural - emphasizes orchids' symbolic meaning in Asian cinema",
    contributedBy: "FCOS Article",
  },
  {
    slug: "seven_blood_stained_orchids",
    title: "7 Blood-Stained Orchids (1972)",
    year: 1972,
    director: "Umberto Lenzi",
    stars: "Antonio Sabàto, Uschi Glas, Pier Paolo Capponi",
    genre: "Italian Giallo/Thriller",
    orchidFocus: "Beauty Entwined with Horror",
    description: "In this stylish Italian giallo thriller, a killer leaves a distinctive orchid at every crime scene. The orchid is weaponized — its beauty made chilling through association with death. Available to watch free on Tubi TV.",
    orchidSignificance: "Shows how the flower's fragility can be twisted into something terrifying",
    portrayalNote: "Symbolic - orchids used for psychological horror rather than botanical accuracy",
    contributedBy: "FCOS Article",
  },
  {
    slug: "blood_and_orchids",
    title: "Blood & Orchids (1986)",
    year: 1986,
    director: "Jerry Thorpe",
    stars: "Kris Kristofferson, Jane Alexander, Madeleine Stowe",
    genre: "TV Miniseries/Drama",
    orchidFocus: "Innocence Betrayed and Fragility Amidst Violence",
    description: "Inspired by a true story, this intense miniseries is set against the lush backdrop of 1930s Hawaii. Orchids symbolize the delicate, easily bruised innocence of the story's victims.",
    orchidSignificance: "Their beauty is no protection against brutality, making flowers haunting reminders of lost peace",
    portrayalNote: "High - authentic Hawaiian orchids used as symbolic backdrop",
    contributedBy: "FCOS Article",
  },
  {
    slug: "wild_orchid",
    title: "Wild Orchid (1989)",
    year: 1989,
    director: "Zalman King",
    stars: "Mickey Rourke, Carré Otis",
    genre: "Erotic Drama",
    orchidFocus: "Sensuality, Forbidden Desire, and Emotional Exposure",
    description: "Set in Rio de Janeiro's sultry chaos, Wild Orchid uses the flower's sensual symbolism boldly. Orchids are metaphors for awakening passion — exotic, overwhelming, and dangerous when mishandled.",
    orchidSignificance: "The flower's fragility underscores characters' vulnerability as emotional barriers crumble",
    portrayalNote: "Symbolic - emphasizes orchids' exotic and sensual cultural associations",
    contributedBy: "FCOS Article",
  },
  {
    slug: "dennis_the_menace",
    title: "Dennis the Menace (1993)",
    year: 1993,
    director: "Nick Castle",
    stars: "Walter Matthau, Mason Gamble, Joan Plowright",
    genre: "Family Comedy",
    orchidFocus: "Mischief vs. Precious Beauty (Black Orchid subplot)",
    description: "A surprising orchid appearance in this family comedy, where Mr. Wilson's prize possession is a rare black orchid — lovingly cultivated and fiercely protected.",
    orchidSignificance: "The orchid's destruction offers a humorous metaphor for the clash between uncontrolled youth and fragile order",
    portrayalNote: "Moderate - black orchids portrayed as extremely rare and valuable",
    contributedBy: "FCOS Article",
  },
  {
    slug: "batman_and_robin",
    title: "Batman & Robin (1997)",
    year: 1997,
    director: "Joel Schumacher",
    stars: "George Clooney, Uma Thurman, Arnold Schwarzenegger",
    genre: "Superhero/Action",
    orchidFocus: "Orchids as Genetic Corruption and Environmental Revenge",
    description: "Dr. Pamela Isley (Poison Ivy) uses genetically engineered orchids as part of her deadly experiments, blending plant and animal DNA to create new lifeforms.",
    orchidSignificance: "Orchids become agents of unnatural power and the wrath of nature against human arrogance",
    portrayalNote: "Low - fantastical genetic engineering, but captures orchids' exotic appeal",
    contributedBy: "FCOS Article",
  },
  {
    slug: "adaptation",
    title: "Adaptation (2002)",
    year: 2002,
    director: "Spike Jonze",
    stars: "Nicolas Cage, Meryl Streep, Chris Cooper",
    genre: "Meta-Drama/Comedy",
    orchidFocus: "Obsession, Artistic Frustration, and the Unattainable (Ghost Orchid)",
    description: "Perhaps no film captures orchid obsession more intimately than Adaptation. Based on Susan Orlean's The Orchid Thief, the movie explores the Ghost Orchid — elusive, rare, and nearly mythical.",
    orchidSignificance: "Symbol of everything humans can desire but never fully grasp - beautiful and maddening",
    portrayalNote: "Very High - accurate portrayal of Ghost Orchid biology and conservation",
    contributedBy: "FCOS Article",
  },
  {
    slug: "anacondas_blood_orchid",
    title: "Anacondas: The Hunt for the Blood Orchid (2004)",
    year: 2004,
    director: "Dwight H. Little",
    stars: "Johnny Messner, KaDee Strickland, Matthew Marsden",
    genre: "Adventure Horror",
    orchidFocus: "The Dangerous Pursuit of Immortality",
    description: "This adventure-horror sequel transforms orchids into a deadly treasure. The mythical Blood Orchid, capable of granting extended life, draws explorers deep into the Borneo jungle.",
    orchidSignificance: "The orchid represents humanity's reckless ambition: a beauty so coveted it unleashes monstrous consequences",
    portrayalNote: "Low - fictional Blood Orchid, but emphasizes real orchid rarity",
    contributedBy: "FCOS Article",
  },
  {
    slug: "bernard_and_doris",
    title: "Bernard and Doris (2006)",
    year: 2006,
    director: "Bob Balaban",
    stars: "Susan Sarandon, Ralph Fiennes",
    genre: "Biographical Drama",
    orchidFocus: "Power Dynamics, Transformation, and Unlikely Affection",
    description: "This quietly powerful drama explores the evolving bond between heiress Doris Duke and her butler Bernard Lafferty. Orchids appear subtly, reflecting shifting control and unexpected loyalty.",
    orchidSignificance: "Their delicate presence counters rigid social roles both characters struggle to maintain — and then transcend",
    portrayalNote: "Subtle - orchids as authentic luxury symbols in wealthy household",
    contributedBy: "FCOS Article",
  },
  {
    slug: "orchids_short_film",
    title: "Orchids (2006) - Short Film",
    year: 2006,
    director: "Bryn Pryor",
    stars: "Juliet Landau, James Marsters",
    genre: "Short Film/Drama",
    orchidFocus: "Memory, Connection, and Emotional Legacy",
    description: "In this tender short film, orchids serve as fragile vessels of human memory. Through brief, poetic scenes, characters' relationships are mirrored by the delicate flowers.",
    orchidSignificance: "Orchids as time capsules of longing and forgiveness — easily bruised, easily lost, yet profoundly meaningful",
    portrayalNote: "Poetic - emphasizes orchids' delicate nature and symbolic resonance",
    contributedBy: "FCOS Article",
  },
  {
    slug: "cirque_du_freak",
    title: "Cirque du Freak: The Vampire's Assistant (2009)",
    year: 2009,
    director: "Paul Weitz",
    stars: "Chris Massoglia, John C. Reilly, Salma Hayek",
    genre: "Dark Fantasy",
    orchidFocus: "Illusion and Deception (Phalaenopsis Orchid Lapel Scene)",
    description: "A sly detail emerges: Mr. Tiny wears a white Phalaenopsis orchid in his lapel. He theatrically sniffs it, pretending it is fragrant — despite most white Phalaenopsis being scentless.",
    orchidSignificance: "This false gesture symbolizes his nature: all show, no substance, and a master of beautiful lies",
    portrayalNote: "Very High - accurately portrays Phalaenopsis orchids as typically scentless",
    contributedBy: "FCOS Article",
  },
  {
    slug: "phantom_thread",
    title: "Phantom Thread (2017)",
    year: 2017,
    director: "Paul Thomas Anderson",
    stars: "Daniel Day-Lewis, Vicky Krieps",
    genre: "Period Drama",
    orchidFocus: "Love as Beauty, Control, and Imprisonment",
    description: "Rare orchids subtly weave through the lush, oppressive world of Reynolds Woodcock, a celebrated dressmaker. The orchids serve as delicate, exotic companions to his relentless need for perfection and control.",
    orchidSignificance: "Like his designs, the flowers are rare and breathtaking — but also stifling to those who get too close",
    portrayalNote: "High - authentic period-appropriate orchid cultivation in 1950s London",
    contributedBy: "FCOS Article",
  },
  {
    slug: "annihilation",
    title: "Annihilation (2018)",
    year: 2018,
    director: "Alex Garland",
    stars: "Natalie Portman, Jennifer Jason Leigh, Gina Rodriguez",
    genre: "Sci-Fi Horror",
    orchidFocus: "Transformation, Mutation, and Loss of Self",
    description: "Flowers resembling mutated orchids populate the distorted landscape known as \"The Shimmer.\" These strange hybrids symbolize the terrifying process of transformation within the zone.",
    orchidSignificance: "The orchid becomes not just beauty, but annihilation — life collapsing into something familiar yet alien",
    portrayalNote: "Speculative - mutated orchid-like forms representing biological transformation",
    contributedBy: "FCOS Article",
  },
  {
    slug: "star_trek_picard",
    title: "Star Trek: Picard (2020)",
    year: 2020,
    director: "Akiva Goldsman, Michael Chabon, Alex Kurtzman",
    stars: "Patrick Stewart, Alison Pill, Isa Briones",
    genre: "Sci-Fi TV Series",
    orchidFocus: "Life and Nature as Cosmic Defenders (Space Orchids)",
    description: "In a striking sci-fi twist, Picard introduces gigantic space orchids — colossal, luminous, living beings used to defend a vulnerable planet from invaders.",
    orchidSignificance: "Redefines orchid symbolism: not just delicate beauty, but powerful resilience against technological annihilation",
    portrayalNote: "Speculative - fantastical space orchids, but maintains core orchid characteristics",
    contributedBy: "FCOS Article",
  },
  {
    slug: "wednesday",
    title: "Wednesday (2022)",
    year: 2022,
    director: "Tim Burton",
    stars: "Jenna Ortega, Catherine Zeta-Jones, Gwendoline Christie",
    genre: "Gothic Comedy/Mystery",
    orchidFocus: "Mystery, Gothic Secrets, and Botanical Power",
    description: "Netflix's Wednesday brings orchids into the Gothic tradition. Inside Nevermore Academy's greenhouse, rare orchids grow among carnivorous plants, their spectral beauty mirroring dark secrets.",
    orchidSignificance: "Beauty masking unseen danger, the invisible roots of long-held mysteries",
    portrayalNote: "Mixed - inaccurately calls Ghost Orchid \"carnivorous,\" but maintains Gothic atmosphere",
    contributedBy: "FCOS Article",
  },
  {
    slug: "movie_collection",
    title: "Classic Orchid Cinema Collection",
    year: 2025,
    director: "Various Directors",
    genre: "Documentary Collection",
    orchidFocus: "Comprehensive orchid cinema anthology spanning 1932-2022",
    description: "A curated collection celebrating \"Blooms of Mystery\" - nearly a century of orchids in cinema, from symbols of fleeting beauty to cosmic defenders.",
    orchidSignificance: "Orchids as living metaphors: beauty's dangers, fragility of innocence, consuming fires of obsession",
    portrayalNote: "Educational - showcases orchid symbolism evolution across film eras",
    contributedBy: "FCOS Article Collection",
  },
  {
    slug: "orchids_enduring_spell",
    title: "The Orchid's Enduring Spell",
    year: 2025,
    director: "Article Conclusion",
    stars: "Hollywood's Most Mysterious Flower",
    genre: "Article Conclusion",
    orchidFocus: "Cinematic Legacy and Eternal Mystery",
    description: "Across nearly a century of storytelling, orchids have bloomed onscreen not merely as beautiful props but as living metaphors: of beauty's dangers, of the fragility of innocence, of the consuming fires of obsession, and of the delicate line between life and death.",
    orchidSignificance: "Their rare beauty reminds us of the impermanence of everything we love. Their hidden complexity mirrors the labyrinths of human hearts. Their ghostly allure hints that not all that is beautiful is safe — and not all that is safe is truly alive.",
    portrayalNote: "Poetic - captures the eternal mystique of orchids in cinema",
    contributedBy: "FCOS Article - Final Reflection",
  },
];
