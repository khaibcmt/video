/**
 * Pure logic module for translating Vietnamese narration & specialized entities
 * into English motion-video search queries, scoring video candidates,
 * and providing topic-matched open CDN MP4/WebM video pools.
 */

export interface VideoQueryTranslationResult {
  primaryQueryEn: string;
  fallbackQueriesEn: string[];
  matchedEntityCategory: string;
  curatedVideoUrls: string[];
}

export interface RawVideoSearchItem {
  url: string;
  mime: string;
  title: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Specialized Vietnamese-to-English Motion Video Dictionary
 * Maps specific creatures, equipment, landscapes, science, and classroom actions
 * to exact English motion video queries.
 */
export const SPECIALIZED_VI_TO_VIDEO_QUERY_MAP: Array<{
  viPatterns: string[];
  queryEn: string;
  secondaryQueryEn: string;
  category: string;
}> = [
  // Aquaculture, Marine & Fish (Thủy sản, cá tra, ao tôm, đại dương)
  {
    viPatterns: ['cá tra', 'cá basa', 'cá da trơn', 'cá bơi dưới nước', 'đàn cá bơi', 'cá bơi'],
    queryEn: 'swimming catfish underwater',
    secondaryQueryEn: 'fish swimming underwater aquarium',
    category: 'aquaculture_fish',
  },
  {
    viPatterns: ['quạt nước', 'ao tôm', 'nuôi tôm', 'sục khí ao', 'tôm sú', 'tôm thẻ'],
    queryEn: 'shrimp pond aerator splashing',
    secondaryQueryEn: 'shrimp underwater aquaculture water splashing',
    category: 'aquaculture_shrimp',
  },
  {
    viPatterns: ['cá heo', 'đàn cá heo'],
    queryEn: 'dolphin swimming ocean waves',
    secondaryQueryEn: 'dolphins jumping sea water',
    category: 'marine_life',
  },
  {
    viPatterns: ['cá voi', 'cá voi xanh'],
    queryEn: 'whale swimming deep blue ocean',
    secondaryQueryEn: 'humpback whale underwater ocean',
    category: 'marine_life',
  },
  {
    viPatterns: ['rạn san hô', 'san hô', 'đáy biển', 'đại dương sâu'],
    queryEn: 'coral reef fish swimming underwater',
    secondaryQueryEn: 'underwater ocean marine life',
    category: 'marine_life',
  },
  {
    viPatterns: ['rùa biển', 'vích'],
    queryEn: 'sea turtle swimming coral reef',
    secondaryQueryEn: 'green sea turtle underwater',
    category: 'turtle',
  },
  {
    viPatterns: ['con rùa', 'chú rùa', 'rùa bò', 'rùa'],
    queryEn: 'tortoise walking forest nature',
    secondaryQueryEn: 'turtle walking green grass',
    category: 'turtle',
  },
  {
    viPatterns: ['con thỏ', 'chú thỏ', 'thỏ trắng', 'thỏ chạy', 'thỏ'],
    queryEn: 'wild rabbit running green meadow',
    secondaryQueryEn: 'rabbit hare eating grass nature',
    category: 'rabbit',
  },

  // Education, Classroom & Science Lab (Giáo dục, lớp học, phòng thí nghiệm)
  {
    viPatterns: ['thảo luận lớp học', 'học sinh thảo luận', 'lớp học hiện đại', 'lớp học', 'giảng đường', 'học sinh', 'sinh viên'],
    queryEn: 'modern high school classroom discussion',
    secondaryQueryEn: 'students studying classroom teacher',
    category: 'classroom',
  },
  {
    viPatterns: ['phòng thí nghiệm', 'kính hiển vi', 'nghiên cứu khoa học', 'xét nghiệm', 'y tế', 'bác sĩ'],
    queryEn: 'scientist laboratory microscope research',
    secondaryQueryEn: 'medical science laboratory experiment',
    category: 'science_lab',
  },
  {
    viPatterns: ['trí tuệ nhân tạo', 'robot', 'máy tính', 'vi mạch', 'công nghệ số', 'lập trình'],
    queryEn: 'robotics artificial intelligence technology',
    secondaryQueryEn: 'modern computer data center circuit',
    category: 'technology',
  },

  // Vietnam Heritage & Landscapes (Vịnh Hạ Long, Hang động, Làng chài)
  {
    viPatterns: ['vịnh hạ long', 'hạ long', 'đảo đá vôi'],
    queryEn: 'Ha Long Bay Vietnam aerial boat',
    secondaryQueryEn: 'limestone islands emerald bay boat',
    category: 'halong_bay',
  },
  {
    viPatterns: ['hang sửng sốt', 'động thiên cung', 'sửng sốt', 'thiên cung', 'thạch nhũ', 'hang động', 'sơn đoòng', 'phong nha'],
    queryEn: 'cave stalactites cavern underground',
    secondaryQueryEn: 'limestone cave interior nature',
    category: 'cave',
  },
  {
    viPatterns: ['làng chài', 'thuyền đánh cá', 'ngư dân', 'chợ nổi', 'miền tây', 'sông mê kông'],
    queryEn: 'fishing village boats emerald water',
    secondaryQueryEn: 'wooden boats river water Vietnam',
    category: 'boats_water',
  },

  // Silk Road & Desert (Con đường tơ lụa, sa mạc, lạc đà)
  {
    viPatterns: ['con đường tơ lụa', 'tơ lụa', 'lạc đà', 'đoàn thương buôn', 'sa mạc'],
    queryEn: 'camel caravan desert sand dunes',
    secondaryQueryEn: 'desert sand dunes sunset wind',
    category: 'desert_silkroad',
  },

  // Space, Black Holes & Astronomy (Vũ trụ, Hố đen, Dải Ngân Hà)
  {
    viPatterns: ['hố đen', 'chân trời sự kiện', 'lực hấp dẫn', 'không thời gian'],
    queryEn: 'black hole accretion disk space',
    secondaryQueryEn: 'black hole gravitational lensing cosmos',
    category: 'space_cosmos',
  },
  {
    viPatterns: ['dải ngân hà', 'ngân hà', 'vũ trụ', 'thiên hà', 'ngôi sao', 'hệ mặt trời', 'mặt trời', 'trái đất'],
    queryEn: 'Milky Way galaxy night sky stars',
    secondaryQueryEn: 'Planet Earth rotating from space cosmos',
    category: 'space_cosmos',
  },

  // Coffee & Agriculture (Cà phê, Tây Nguyên, Nông nghiệp, Đồng lúa)
  {
    viPatterns: ['cà phê', 'robusta', 'buôn ma thuột', 'tây nguyên', 'phin cà phê'],
    queryEn: 'coffee beans roasting pouring cup',
    secondaryQueryEn: 'coffee plantation harvest nature',
    category: 'coffee_agriculture',
  },
  {
    viPatterns: ['cánh đồng lúa', 'ruộng bậc thang', 'sapa', 'mù cang chải', 'nông nghiệp', 'lúa chín'],
    queryEn: 'green rice paddy field wind nature',
    secondaryQueryEn: 'terraced rice fields mountains',
    category: 'rice_nature',
  },

  // Terrestrial Wildlife & Nature (Động vật hoang dã, rừng, thác nước)
  {
    viPatterns: ['sư tử', 'hổ', 'báo', 'chúa sơn lâm'],
    queryEn: 'lion tiger wildlife savanna jungle',
    secondaryQueryEn: 'wild big cat nature',
    category: 'wildlife',
  },
  {
    viPatterns: ['đàn voi', 'con voi', 'voi'],
    queryEn: 'elephant herd walking nature',
    secondaryQueryEn: 'wild elephant forest',
    category: 'wildlife',
  },
  {
    viPatterns: ['chim đại bàng', 'đại bàng', 'đàn chim', 'chim bay', 'chim'],
    queryEn: 'bird flying sky nature tree',
    secondaryQueryEn: 'eagle soaring mountain sky',
    category: 'birds',
  },
  {
    viPatterns: ['ong mật', 'đàn ong', 'bướm', 'hoa nở'],
    queryEn: 'honeybee butterfly flower blooming',
    secondaryQueryEn: 'bee pollinating flower garden',
    category: 'insects_flowers',
  },
  {
    viPatterns: ['thác nước', 'con suối', 'dòng sông', 'khu rừng', 'rừng già', 'núi'],
    queryEn: 'waterfall forest stream flowing nature',
    secondaryQueryEn: 'sunlight green forest trees mountain',
    category: 'forest_waterfall',
  },
];

/**
 * Curated Open Stock HD Video Pool (100% Real Motion MP4 & WebM Video Streams)
 * Combines verified direct Wikimedia Commons upload CDN (.webm/.mp4) & Open Stock CDN (.mp4)
 * so every category has multiple real motion video clips ready for instant playback and switching.
 */
export const CURATED_OPEN_VIDEO_POOL: Record<string, string[]> = {
  aquaculture_fish: [
    'https://assets.mixkit.co/videos/preview/mixkit-fish-swimming-underwater-in-an-aquarium-34565-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-school-of-fish-swimming-underwater-4102-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-colorful-fish-swimming-in-a-coral-reef-4352-large.mp4',
  ],
  aquaculture_shrimp: [
    'https://assets.mixkit.co/videos/preview/mixkit-water-splashing-in-slow-motion-1197-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-bubbles-rising-in-blue-water-1194-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-waves-in-the-water-1164-large.mp4',
  ],
  marine_life: [
    'https://upload.wikimedia.org/wikipedia/commons/1/12/Swimming_with_the_sea_turtle_up_close_in_Moalboal_Cebu.webm',
    'https://upload.wikimedia.org/wikipedia/commons/5/5c/Swimming_with_the_Sea_Turtle_in_Moalboal1.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-colorful-fish-swimming-in-a-coral-reef-4352-large.mp4',
  ],
  turtle: [
    'https://upload.wikimedia.org/wikipedia/commons/1/12/Swimming_with_the_sea_turtle_up_close_in_Moalboal_Cebu.webm',
    'https://upload.wikimedia.org/wikipedia/commons/5/5c/Swimming_with_the_Sea_Turtle_in_Moalboal1.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-sea-turtle-swimming-underwater-4101-large.mp4',
  ],
  rabbit: [
    'https://upload.wikimedia.org/wikipedia/commons/2/2c/Pet_rabbit_eating_grass.webm',
    'https://upload.wikimedia.org/wikipedia/commons/d/d7/Rabbit_bobbing_up_and_down.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-white-rabbit-in-the-grass-4520-large.mp4',
  ],
  classroom: [
    'https://assets.mixkit.co/videos/preview/mixkit-students-working-together-in-a-library-4729-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-woman-studying-and-taking-notes-in-a-notebook-4733-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-teacher-explaining-a-lesson-in-class-4745-large.mp4',
  ],
  science_lab: [
    'https://assets.mixkit.co/videos/preview/mixkit-scientist-looking-through-a-microscope-in-a-laboratory-4753-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-researcher-working-with-test-tubes-in-laboratory-4756-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-chemical-liquid-in-a-flask-in-a-laboratory-4751-large.mp4',
  ],
  technology: [
    'https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-blue-data-waves-1182-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-circuit-board-close-up-1185-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-futuristic-digital-data-network-1180-large.mp4',
  ],
  halong_bay: [
    'https://upload.wikimedia.org/wikipedia/commons/b/be/Ha_Long_Bay%2C_Vietnam_-_Dec_2024.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-islands-in-the-ocean-1091-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-boat-sailing-on-a-calm-sea-at-sunset-1102-large.mp4',
  ],
  cave: [
    'https://assets.mixkit.co/videos/preview/mixkit-sunlight-entering-a-dark-cave-4120-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-rock-formations-in-a-cave-4122-large.mp4',
    'https://upload.wikimedia.org/wikipedia/commons/b/be/Ha_Long_Bay%2C_Vietnam_-_Dec_2024.webm',
  ],
  boats_water: [
    'https://upload.wikimedia.org/wikipedia/commons/b/be/Ha_Long_Bay%2C_Vietnam_-_Dec_2024.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-boat-sailing-on-a-calm-sea-at-sunset-1102-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-river-flowing-through-the-forest-2218-large.mp4',
  ],
  desert_silkroad: [
    'https://upload.wikimedia.org/wikipedia/commons/f/fb/Trekking_with_Nomad.webm',
    'https://upload.wikimedia.org/wikipedia/commons/7/77/Nubra_Valley.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-sand-dunes-in-the-desert-at-sunset-1231-large.mp4',
  ],
  space_cosmos: [
    'https://upload.wikimedia.org/wikipedia/commons/5/59/Galactic_Center_Variable_Stars_%2813149638943%29.webm',
    'https://upload.wikimedia.org/wikipedia/commons/9/9a/Chandra_X-ray_Image_%26_DSS_Optical_Image_of_NGC_galaxies_%282006-galaxies%29.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-1610-large.mp4',
  ],
  coffee_agriculture: [
    'https://upload.wikimedia.org/wikipedia/commons/3/36/Morning_Espresso_Routine_-_Progress%2C_Results%2C_Observations_and_Miscellany.webm',
    'https://upload.wikimedia.org/wikipedia/commons/c/c7/Kaffeemaschine_2.0_Bohnen_r%C3%B6sten_mit_Wirbelschicht_ICEBE_B25.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-pouring-coffee-into-a-cup-in-slow-motion-4812-large.mp4',
  ],
  rice_nature: [
    'https://upload.wikimedia.org/wikipedia/commons/d/d3/Drone_view_of_sagebrush_seeding_in_eastern_Oregon_%2833293399428%29.webm',
    'https://assets.mixkit.co/videos/preview/mixkit-green-meadow-with-wild-flowers-in-spring-4129-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-wheat-field-moving-in-the-wind-4125-large.mp4',
  ],
  wildlife: [
    'https://assets.mixkit.co/videos/preview/mixkit-lion-resting-in-the-savanna-4142-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-elephants-walking-in-the-savanna-4145-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-deer-in-a-green-forest-4138-large.mp4',
  ],
  birds: [
    'https://assets.mixkit.co/videos/preview/mixkit-birds-flying-in-the-sky-at-sunset-2262-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-eagle-flying-in-the-sky-4152-large.mp4',
    'https://upload.wikimedia.org/wikipedia/commons/d/d3/Drone_view_of_sagebrush_seeding_in_eastern_Oregon_%2833293399428%29.webm',
  ],
  insects_flowers: [
    'https://assets.mixkit.co/videos/preview/mixkit-bee-on-a-yellow-flower-4161-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-butterfly-on-a-flower-in-nature-4163-large.mp4',
    'https://assets.mixkit.co/videos/preview/mixkit-green-meadow-with-wild-flowers-in-spring-4129-large.mp4',
  ],
  forest_waterfall: [
    'https://upload.wikimedia.org/wikipedia/commons/0/0f/Waterfall-1013190%2C_Dingle_Peninsula%2C_Co._Kerry%2C_Ireland.webm',
    'https://upload.wikimedia.org/wikipedia/commons/b/b1/Waterfall-1013185%2C_Dingle_Peninsula%2C_Co._Kerry%2C_Ireland.webm',
    'https://upload.wikimedia.org/wikipedia/commons/f/fa/Waterfall_on_Falls_Creek%2C_south_of_Augusta%2C_Montana_%2852974925584%29.webm',
  ],
  default_nature: [],
};

/**
 * Cleans and normalizes English video search keywords
 */
export function sanitizeVideoSearchQuery(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\[\]\(\)"'#$*.,;!?/\\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        ![
          'cinematic',
          'photography',
          'photo',
          'picture',
          'image',
          'footage',
          'video',
          'scene',
          'shot',
          'view',
          'high',
          'quality',
          '4k',
          'hd',
          'the',
          'and',
          'with',
          'for',
          'from',
          'into',
          'over',
          'illustration',
          'wide',
          'angle',
          'background',
          'style',
        ].includes(w.toLowerCase())
    )
    .slice(0, 5)
    .join(' ');
}

/**
 * Translates a Vietnamese narration sentence (`narration_vi`) and optional English hints
 * into specialized English motion-video search queries + strictly matched curated clips.
 * NEVER appends unrelated default_nature clips when a topic doesn't match!
 */
export function translateNarrationToVideoQueries(
  narrationVi: string,
  searchKeywordsEn?: string,
  wikipediaTopicEn?: string
): VideoQueryTranslationResult {
  const lowerVi = (narrationVi || '').toLowerCase();
  const lowerEn = `${searchKeywordsEn || ''} ${wikipediaTopicEn || ''}`.toLowerCase();

  let matchedCategory = 'default_nature';
  const queries: string[] = [];

  // 1. Check Vietnamese specialized patterns in order
  for (const entry of SPECIALIZED_VI_TO_VIDEO_QUERY_MAP) {
    const matched = entry.viPatterns.some((pat) => lowerVi.includes(pat));
    if (matched) {
      if (matchedCategory === 'default_nature') {
        matchedCategory = entry.category;
      }
      if (!queries.includes(entry.queryEn)) {
        queries.push(entry.queryEn);
      }
      if (!queries.includes(entry.secondaryQueryEn)) {
        queries.push(entry.secondaryQueryEn);
      }
    }
  }

  // 2. Also check English keywords if Vietnamese text was generic or already translated
  if (matchedCategory === 'default_nature' && lowerEn) {
    if (lowerEn.includes('catfish') || lowerEn.includes('fish swimming')) {
      matchedCategory = 'aquaculture_fish';
    } else if (lowerEn.includes('shrimp') || lowerEn.includes('aerator') || lowerEn.includes('pond')) {
      matchedCategory = 'aquaculture_shrimp';
    } else if (lowerEn.includes('classroom') || lowerEn.includes('student') || lowerEn.includes('school')) {
      matchedCategory = 'classroom';
    } else if (lowerEn.includes('ha long') || lowerEn.includes('halong') || lowerEn.includes('limestone')) {
      matchedCategory = 'halong_bay';
    } else if (lowerEn.includes('cave') || lowerEn.includes('stalactite') || lowerEn.includes('sung sot')) {
      matchedCategory = 'cave';
    } else if (lowerEn.includes('village') || lowerEn.includes('boat')) {
      matchedCategory = 'boats_water';
    } else if (lowerEn.includes('camel') || lowerEn.includes('desert') || lowerEn.includes('silk road')) {
      matchedCategory = 'desert_silkroad';
    } else if (lowerEn.includes('black hole') || lowerEn.includes('galaxy') || lowerEn.includes('space')) {
      matchedCategory = 'space_cosmos';
    } else if (lowerEn.includes('coffee') || lowerEn.includes('buon ma thuot')) {
      matchedCategory = 'coffee_agriculture';
    } else if (lowerEn.includes('turtle') || lowerEn.includes('tortoise')) {
      matchedCategory = 'turtle';
    } else if (lowerEn.includes('rabbit') || lowerEn.includes('hare')) {
      matchedCategory = 'rabbit';
    }
  }

  // 3. Add sanitized English search keywords & Wikipedia topic
  const cleanSearchEn = sanitizeVideoSearchQuery(searchKeywordsEn || '');
  const cleanWikiEn = sanitizeVideoSearchQuery(wikipediaTopicEn || '');

  if (cleanSearchEn && !queries.includes(cleanSearchEn)) {
    if (queries.length === 0) {
      queries.unshift(cleanSearchEn);
    } else {
      queries.push(cleanSearchEn);
    }
    const words = cleanSearchEn.split(/\s+/);
    if (words.length >= 2) {
      const twoWord = words.slice(0, 2).join(' ');
      if (!queries.includes(twoWord)) {
        queries.push(twoWord);
      }
    }
  }

  if (cleanWikiEn && !queries.includes(cleanWikiEn)) {
    queries.push(cleanWikiEn);
  }

  if (queries.length === 0) {
    queries.push('educational science illustration');
  }

  // ONLY include curated clips if they strictly belong to the matched category (never append unrelated default_nature clips!)
  const curatedVideoUrls = (CURATED_OPEN_VIDEO_POOL[matchedCategory] || []).filter(
    (url, idx, arr) => arr.indexOf(url) === idx
  );

  return {
    primaryQueryEn: queries[0],
    fallbackQueriesEn: queries.slice(1),
    matchedEntityCategory: matchedCategory,
    curatedVideoUrls,
  };
}

/**
 * Scores a raw Wikimedia Commons video candidate against the target query tokens.
 * Returns -1 if the candidate is invalid (not video/mp4 or video/webm, too large, or irrelevant).
 */
export function scoreVideoCandidateForQuery(
  item: RawVideoSearchItem,
  queryStr: string,
  usedUrls?: Set<string>
): number {
  const mime = (item.mime || '').toLowerCase();
  const url = item.url || '';
  const lowerUrl = url.toLowerCase();
  const title = (item.title || '').toLowerCase();

  // Strictly enforce video/mp4 or video/webm (reject static images, audio, PDFs, OGV)
  const isPlayableVideo =
    mime.includes('video/mp4') ||
    mime.includes('video/webm') ||
    lowerUrl.endsWith('.mp4') ||
    lowerUrl.endsWith('.webm');

  if (!isPlayableVideo) return -1;

  // Reject oversized files (> 42MB) or tiny icons
  if (item.size > 42_000_000) return -1;
  if (item.width > 0 && item.height > 0 && (item.width < 320 || item.height < 200)) {
    return -1;
  }

  // Reject talk shows, diagrams, maps, or sign-language recordings
  if (
    title.includes('interview') ||
    title.includes('speech') ||
    title.includes('lecture') ||
    title.includes('screencast') ||
    title.includes('diagram') ||
    title.includes('map') ||
    title.includes('wikimania') ||
    title.includes('pronunciation') ||
    title.includes('sign language')
  ) {
    return -1;
  }

  const queryTokens = queryStr
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTokens.length === 0) return -1;

  let matchedTokens = 0;
  let score = 0;

  for (const token of queryTokens) {
    if (title.includes(token)) {
      matchedTokens++;
      score += 30;
    }
  }

  if (matchedTokens === 0) return -1;

  // Bonus for matching multiple tokens from the specialized query
  if (matchedTokens >= 2) {
    score += 35;
  }

  // Bonus for MP4 container
  if (mime.includes('mp4') || lowerUrl.endsWith('.mp4')) {
    score += 20;
  }

  // Bonus for 16:9 widescreen aspect ratio
  if (item.width > 0 && item.height > 0) {
    const aspect = item.width / item.height;
    if (aspect >= 1.25 && aspect <= 2.2) {
      score += 25;
    }
  }

  // Penalize already-used video URLs so scenes stay distinct
  if (usedUrls && usedUrls.has(url)) {
    score -= 120;
  }

  return score;
}

/**
 * Pure helper to cycle to the next candidate video index when user clicks "🔄 Đổi Video Clip Khác"
 */
export function getNextCandidateVideoIndex(
  currentIndex: number,
  totalCandidates: number
): number {
  if (totalCandidates <= 1) return 0;
  return (currentIndex + 1) % totalCandidates;
}
