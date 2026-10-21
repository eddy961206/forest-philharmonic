// Each building has its own evening: the pieces are shared out between them,
// none plays in both. The hall keeps the intimate concert - recitals, string
// quartets, chorales in a real room - opening with the Ode to Joy and closing
// with Pomp and Circumstance; the Sphere keeps the pieces its dome paints
// best, from a chorale under an opening roof to the fireworks of Bach's
// Christmas Oratorio. Order = concert order (the interval falls in the middle).

export const HALL_SETLIST = [
  'beethoven-ode-to-joy', 'beethoven-fur-elise', 'beethoven-moonlight', 'handel-lascia', 'mozart-k545',
  'haydn-op74-1-andantino', 'beethoven-pathetique-adagio', 'schubert-lindenbaum', 'chopin-mazurka-7-1', 'corelli-op3-1-grave',
  'grieg-morning-arietta', 'mozart-k458-adagio', 'scarlatti-k1', 'bach-o-haupt', 'joplin-solace',
  'chopin-prelude-6', 'beethoven-op49-2', 'schumann-foreign-lands', 'mozart-k80-adagio', 'chopin-prelude-7',
  'joplin-maple-leaf', 'bach-brich-an', 'chopin-mazurka-68-2', 'beethoven-tempest-3', 'beethoven-op59-2-molto-adagio',
  'elgar-pomp-and-circumstance',
];

export const SPHERE_SETLIST = [
  'bach-wachet-auf', 'debussy-clair-de-lune', 'bach-prelude-c', 'chopin-raindrop', 'mozart-turkish-march',
  'tchaikovsky-june', 'joplin-entertainer', 'greensleeves', 'schumann-traumerei', 'grieg-march-of-trolls',
  'debussy-prelude', 'liliuokalani-aloha-oe', 'chopin-prelude-4', 'grieg-to-spring', 'verdi-la-donna',
  'tchaikovsky-october', 'grieg-butterfly', 'weber-clarinet-concertino', 'grieg-notturno', 'debussy-passepied',
  'bach-wir-singen', 'tchaikovsky-troika', 'amazing-grace', 'chopin-prelude-20', 'grieg-wedding-day',
  'bach-nun-seid-ihr',
];

export const SETLISTS = { hall: HALL_SETLIST, sphere: SPHERE_SETLIST };
