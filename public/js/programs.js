// Each venue has an exclusive programme: 41 hall, 41 Sphere and 24 outdoor.
// Order is concert order; the interval falls in the middle.

export const HALL_SETLIST = [
  'beethoven-ode-to-joy', 'beethoven-fur-elise', 'beethoven-moonlight',
  'beethoven-symphony-5', 'mozart-eine-kleine', 'vivaldi-spring', 'handel-lascia', 'mozart-k545',
  'haydn-op74-1-andantino', 'beethoven-pathetique-adagio', 'schubert-lindenbaum',
  'pachelbel-canon', 'grieg-morning-mood', 'chopin-mazurka-7-1', 'corelli-op3-1-grave',
  'grieg-morning-arietta', 'mozart-k458-adagio',
  'strauss-blue-danube', 'brahms-hungarian-dance-5', 'scarlatti-k1', 'bach-o-haupt', 'joplin-solace',
  'chopin-minute-waltz', 'mendelssohn-wedding-march',
  'chopin-prelude-6', 'beethoven-op49-2',
  'tchaikovsky-piano-concerto-1', 'chopin-nocturne-9-2', 'schumann-foreign-lands', 'mozart-k80-adagio', 'chopin-prelude-7',
  'joplin-maple-leaf',
  'mozart-lacrimosa', 'dvorak-new-world-4', 'bach-brich-an', 'chopin-mazurka-68-2', 'beethoven-tempest-3', 'beethoven-op59-2-molto-adagio',
  'strauss-radetzky-march', 'handel-hallelujah',
  'elgar-pomp-and-circumstance',
];

export const SPHERE_SETLIST = [
  'bach-wachet-auf', 'debussy-clair-de-lune',
  'strauss-zarathustra', 'tchaikovsky-swan-lake', 'bach-prelude-c', 'chopin-raindrop', 'mozart-turkish-march',
  'tchaikovsky-sugar-plum', 'tchaikovsky-waltz-flowers',
  'tchaikovsky-june', 'joplin-entertainer', 'greensleeves',
  'grieg-mountain-king', 'prokofiev-dance-knights', 'schumann-traumerei', 'grieg-march-of-trolls',
  'debussy-prelude',
  'rossini-william-tell', 'wagner-valkyries', 'liliuokalani-aloha-oe', 'chopin-prelude-4', 'grieg-to-spring', 'verdi-la-donna',
  'bizet-toreador', 'bizet-habanera',
  'tchaikovsky-october', 'grieg-butterfly',
  'rimsky-bumblebee', 'khachaturian-sabre-dance', 'weber-clarinet-concertino', 'grieg-notturno', 'debussy-passepied',
  'ravel-bolero',
  'bach-wir-singen', 'tchaikovsky-troika', 'amazing-grace', 'chopin-prelude-20', 'grieg-wedding-day',
  'offenbach-can-can', 'tchaikovsky-1812',
  'bach-nun-seid-ihr',
];

// Piano, chamber music and familiar orchestral pieces for the park recital.
export const OUTDOOR_SETLIST = [
  'elgar-salut-damour', 'dvorak-humoresque-7', 'saint-saens-the-swan',
  'bach-air', 'mozart-symphony-40', 'liszt-liebestraum-3',
  'bach-badinerie', 'boccherini-minuet', 'massenet-thais-meditation',
  'chopin-etude-10-3', 'vivaldi-winter-1', 'mozart-figaro-overture',
  'satie-gymnopedie-1', 'schubert-serenade', 'handel-sarabande',
  'gounod-ave-maria', 'mozart-queen-night', 'chopin-fantaisie-impromptu',
  'delibes-flower-duet', 'schubert-military-march', 'brahms-lullaby',
  'bach-jesu-joy', 'bach-toccata-fugue', 'rossini-barber-overture',
];

export const SETLISTS = { hall: HALL_SETLIST, sphere: SPHERE_SETLIST, outdoor: OUTDOOR_SETLIST };
