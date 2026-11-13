/**
 * SWE ENGLISH EXTRA — Default Categories, Lessons & 15 Starter B2/C1 Academic / IELTS Words
 */
(function (root) {
  'use strict';

  const DEFAULT_CATEGORIES = [
    { id: 'IELTS', name: 'IELTS', icon: 'graduation-cap', color: 'indigo', builtIn: true },
    { id: 'General English', name: 'General English', icon: 'book-open', color: 'sky', builtIn: true },
    { id: 'Business', name: 'Business', icon: 'briefcase', color: 'amber', builtIn: true },
    { id: 'Phrasal Verbs', name: 'Phrasal Verbs', icon: 'git-branch', color: 'emerald', builtIn: true },
    { id: 'Idioms', name: 'Idioms', icon: 'sparkles', color: 'rose', builtIn: true }
  ];

  const DEFAULT_LESSONS = [
    {
      id: 'lesson-1',
      name: '1-dars: Academic Foundations',
      description: 'Akademik yozuv va IELTS Reading/Writing uchun asosiy C1 fe’llar va sifatlar',
      order: 1
    },
    {
      id: 'lesson-2',
      name: '2-dars: Society & Analysis',
      description: 'Tahliliy fikrlash, muammolarni bayon qilish va ilmiy baholash lug‘ati',
      order: 2
    },
    {
      id: 'lesson-3',
      name: '3-dars: Business & Expressions',
      description: 'Biznes qarorlar, frazali fe’llar va yuqori darajadagi idiomalar',
      order: 3
    }
  ];

  const DEFAULT_WORDS = [
    {
      id: 'w-endeavor',
      word: 'endeavor',
      phonetic: '/ɪnˈdev.ər/',
      partOfSpeech: 'verb / noun',
      translation: 'astoydil harakat qilmoq, intilmoq; sa’y-harakat',
      definition: 'To try very hard to do or achieve something important, often requiring sustained effort.',
      examples: [
        'Engineers continuously **endeavor** to design software systems that remain resilient under heavy load.',
        'Improving urban air quality is a long-term scientific **endeavor** requiring global cooperation.'
      ],
      synonyms: ['strive', 'attempt', 'undertake', 'venture'],
      antonyms: ['neglect', 'abandon', 'idle'],
      mnemonic: 'End + ever: oxirigacha ("end") doim ("ever") to‘xtamasdan harakat qilib intilish.',
      category: 'IELTS',
      lesson: '1-dars: Academic Foundations',
      level: 'C1'
    },
    {
      id: 'w-ubiquitous',
      word: 'ubiquitous',
      phonetic: '/juːˈbɪk.wɪ.təs/',
      partOfSpeech: 'adjective',
      translation: 'hamma joyda mavjud, keng tarqalgan',
      definition: 'Present, appearing, or found everywhere at the same time.',
      examples: [
        'Smartphones have become **ubiquitous** tools in modern university classrooms and workplaces.',
        'The **ubiquitous** presence of single-use plastics poses a severe threat to marine ecosystems.'
      ],
      synonyms: ['omnipresent', 'pervasive', 'universal', 'widespread'],
      antonyms: ['rare', 'scarce', 'uncommon'],
      mnemonic: '"Ubi" (lotincha — qayerda) + "quit": hamma joyda uchraydigan, hech qayerdan ketmaydigan (quit qilmaydigan) narsa.',
      category: 'IELTS',
      lesson: '1-dars: Academic Foundations',
      level: 'C1'
    },
    {
      id: 'w-mitigate',
      word: 'mitigate',
      phonetic: '/ˈmɪt.ɪ.ɡeɪt/',
      partOfSpeech: 'verb',
      translation: 'yumshatmoq, zararni kamaytirmoq',
      definition: 'To make something harmful, unpleasant, or severe less intense or damaging.',
      examples: [
        'Expanding green spaces in major cities helps **mitigate** the urban heat island effect.',
        'Early flood-warning systems were introduced to **mitigate** the economic impact on rural farmers.'
      ],
      synonyms: ['alleviate', 'lessen', 'reduce', 'ease'],
      antonyms: ['aggravate', 'intensify', 'worsen'],
      mnemonic: 'Mini + gate: muammo darvozasini kichraytirib ("mini"), ta’sirini yumshatish.',
      category: 'IELTS',
      lesson: '1-dars: Academic Foundations',
      level: 'C1'
    },
    {
      id: 'w-exacerbate',
      word: 'exacerbate',
      phonetic: '/ɪɡˈzæs.ə.beɪt/',
      partOfSpeech: 'verb',
      translation: 'yanada og‘irlashtirmoq, keskinlashtirmoq',
      definition: 'To make an existing problem, bad situation, or negative feeling worse.',
      examples: [
        'Unregulated traffic congestion continues to **exacerbate** respiratory illnesses in megacities.',
        'Cutting public transport funding could **exacerbate** inequality for low-income commuters.'
      ],
      synonyms: ['worsen', 'aggravate', 'compound', 'escalate'],
      antonyms: ['mitigate', 'alleviate', 'improve'],
      mnemonic: 'Ex + "zahar" (asab): vaziyatni yanada achchiq va asabiy holatga keltirib og‘irlashtirish.',
      category: 'IELTS',
      lesson: '1-dars: Academic Foundations',
      level: 'C1'
    },
    {
      id: 'w-unprecedented',
      word: 'unprecedented',
      phonetic: '/ʌnˈpres.ɪ.den.tɪd/',
      partOfSpeech: 'adjective',
      translation: 'misli ko‘rilmagan, ilgari kuzatilmagan',
      definition: 'Never having happened, been done, or been known before in history.',
      examples: [
        'Remote work platforms experienced **unprecedented** growth during the global shift to digital offices.',
        'Scientists recorded an **unprecedented** rise in ocean surface temperatures last summer.'
      ],
      synonyms: ['unparalleled', 'unheard-of', 'novel', 'extraordinary'],
      antonyms: ['ordinary', 'familiar', 'conventional'],
      mnemonic: 'Un (yo‘q) + precedent (oldingi namuna): avval hech qanday namunasi bo‘lmagan holat.',
      category: 'IELTS',
      lesson: '1-dars: Academic Foundations',
      level: 'C1'
    },
    {
      id: 'w-proliferate',
      word: 'proliferate',
      phonetic: '/prəˈlɪf.ə.reɪt/',
      partOfSpeech: 'verb',
      translation: 'tez ko‘paymoq, keng yoyilmoq',
      definition: 'To increase rapidly in numbers or multiply swiftly across an area.',
      examples: [
        'AI-assisted learning applications have begun to **proliferate** across secondary schools worldwide.',
        'Without clear fact-checking standards, misleading headlines can **proliferate** on social media.'
      ],
      synonyms: ['multiply', 'mushroom', 'expand', 'surge'],
      antonyms: ['dwindle', 'decline', 'shrink'],
      mnemonic: 'Pro (ko‘payish) + life: hayot tez sur’atda ko‘payib tarqalayotganini tasavvur qiling.',
      category: 'IELTS',
      lesson: '2-dars: Society & Analysis',
      level: 'C1'
    },
    {
      id: 'w-discrepancy',
      word: 'discrepancy',
      phonetic: '/dɪˈskrep.ən.si/',
      partOfSpeech: 'noun',
      translation: 'tafovut, nomuvofiqlik, farq',
      definition: 'An unexpected difference between two figures, facts, or accounts that should match.',
      examples: [
        'Auditors discovered a significant **discrepancy** between the reported revenue and actual bank deposits.',
        'Researchers investigated the **discrepancy** in test scores between morning and afternoon cohorts.'
      ],
      synonyms: ['inconsistency', 'divergence', 'gap', 'mismatch'],
      antonyms: ['consistency', 'harmony', 'agreement'],
      mnemonic: 'Dis (yo‘q) + "skrepka": ikki hujjat bir-biriga skrepka bilan mos tushmay, orasida farq chiqishi.',
      category: 'IELTS',
      lesson: '2-dars: Society & Analysis',
      level: 'C1'
    },
    {
      id: 'w-resilient',
      word: 'resilient',
      phonetic: '/rɪˈzɪl.i.ənt/',
      partOfSpeech: 'adjective',
      translation: 'bardoshli, qiyinchilikdan tez tiklanuvchan',
      definition: 'Able to withstand or recover quickly from difficult conditions, setbacks, or shocks.',
      examples: [
        'A **resilient** healthcare infrastructure can absorb seasonal surges without compromising patient care.',
        'Students who treat mistakes as feedback become far more **resilient** language learners.'
      ],
      synonyms: ['adaptable', 'tough', 'hardy', 'buoyant'],
      antonyms: ['fragile', 'vulnerable', 'brittle'],
      mnemonic: 'Re (qayta) + silent/spring: egilsa ham sinmaydigan, yana o‘z holiga qaytadigan prujina.',
      category: 'General English',
      lesson: '2-dars: Society & Analysis',
      level: 'B2'
    },
    {
      id: 'w-ambiguous',
      word: 'ambiguous',
      phonetic: '/æmˈbɪɡ.ju.əs/',
      partOfSpeech: 'adjective',
      translation: 'noaniq, ikki xil talqin qilinadigan',
      definition: 'Open to more than one interpretation; not having one clear or obvious meaning.',
      examples: [
        'Because the contract clause was **ambiguous**, both parties requested legal clarification.',
        'In academic essays, writers should replace **ambiguous** claims with precise statistical evidence.'
      ],
      synonyms: ['vague', 'equivocal', 'unclear', 'cryptic'],
      antonyms: ['explicit', 'unambiguous', 'clear'],
      mnemonic: 'Ambi- (ikkala tomon, masalan ambidextrous) — ikki yoqlama ma’no berib, noaniqlik tug‘diruvchi.',
      category: 'General English',
      lesson: '2-dars: Society & Analysis',
      level: 'B2'
    },
    {
      id: 'w-coherent',
      word: 'coherent',
      phonetic: '/kəʊˈhɪə.rənt/',
      partOfSpeech: 'adjective',
      translation: 'izchil, mantiqan bog‘langan',
      definition: 'Logical, consistent, and easy to understand because all parts fit together smoothly.',
      examples: [
        'To achieve a high IELTS Writing score, your paragraphs must present a **coherent** argument.',
        'The committee outlined a **coherent** strategy linking renewable energy with job creation.'
      ],
      synonyms: ['logical', 'consistent', 'articulate', 'cohesive'],
      antonyms: ['incoherent', 'disjointed', 'muddled'],
      mnemonic: 'Co- (birga) + adhere (yopishmoq): fikrlar bir-biriga mahkam yopishib, mantiqiy zanjir hosil qilishi.',
      category: 'General English',
      lesson: '2-dars: Society & Analysis',
      level: 'B2'
    },
    {
      id: 'w-pragmatic',
      word: 'pragmatic',
      phonetic: '/præɡˈmæt.ɪk/',
      partOfSpeech: 'adjective',
      translation: 'amaliyotga asoslangan, realistik, pragmatik',
      definition: 'Dealing with things sensibly and realistically based on practical outcomes rather than pure theory.',
      examples: [
        'Instead of waiting for a perfect redesign, the product lead took a **pragmatic** step-by-step approach.',
        'Governments need **pragmatic** policies that balance industrial productivity with emissions targets.'
      ],
      synonyms: ['practical', 'realistic', 'sensible', 'matter-of-fact'],
      antonyms: ['idealistic', 'impractical', 'utopian'],
      mnemonic: '"Praktika" so‘ziga o‘xshash: faqat nazariya emas, amaliy natijaga qarab ish tutadigan.',
      category: 'Business',
      lesson: '3-dars: Business & Expressions',
      level: 'C1'
    },
    {
      id: 'w-lucrative',
      word: 'lucrative',
      phonetic: '/ˈluː.krə.tɪv/',
      partOfSpeech: 'adjective',
      translation: 'serdaromad, katta foyda keltiradigan',
      definition: 'Producing a great deal of profit or financial reward.',
      examples: [
        'Cloud cybersecurity has emerged as one of the most **lucrative** fields in modern software engineering.',
        'She turned down a **lucrative** corporate offer to launch an educational non-profit.'
      ],
      synonyms: ['profitable', 'remunerative', 'gainful', 'rewarding'],
      antonyms: ['unprofitable', 'loss-making', 'worthless'],
      mnemonic: 'Lukr (lotincha — foyda/daromad) + -ative: ko‘p daromad olib keluvchi biznes.',
      category: 'Business',
      lesson: '3-dars: Business & Expressions',
      level: 'C1'
    },
    {
      id: 'w-bring-about',
      word: 'bring about',
      phonetic: '/brɪŋ əˈbaʊt/',
      partOfSpeech: 'phrasal verb',
      translation: 'sabab bo‘lmoq, yuzaga keltirmoq, o‘zgarish yasamoq',
      definition: 'To cause something to happen, especially a noticeable change or major result.',
      examples: [
        'Consistent daily reading can **bring about** a remarkable improvement in academic vocabulary.',
        'Investment in high-speed rail helped **bring about** faster regional trade.'
      ],
      synonyms: ['cause', 'trigger', 'generate', 'lead to'],
      antonyms: ['prevent', 'halt', 'suppress'],
      mnemonic: 'Bring (olib kelmoq) + about (atrofga): yangi natija yoki o‘zgarishni hayotga olib kelish.',
      category: 'Phrasal Verbs',
      lesson: '3-dars: Business & Expressions',
      level: 'B2'
    },
    {
      id: 'w-stem-from',
      word: 'stem from',
      phonetic: '/stem frɒm/',
      partOfSpeech: 'phrasal verb',
      translation: '...dan kelib chiqmoq, ildiz otmoq',
      definition: 'To originate from or be caused by a particular source or factor.',
      examples: [
        'Many pronunciation errors **stem from** differences between English and native vowel systems.',
        'Their confidence in technical interviews seems to **stem from** months of deliberate practice.'
      ],
      synonyms: ['arise from', 'originate in', 'result from', 'derive from'],
      antonyms: ['result in', 'give rise to'],
      mnemonic: 'Stem (o‘simlik poyasi) + from (...dan): poya ildizdan o‘sib chiqqani kabi muammoning asl manbadan chiqishi.',
      category: 'Phrasal Verbs',
      lesson: '3-dars: Business & Expressions',
      level: 'C1'
    },
    {
      id: 'w-double-edged-sword',
      word: 'a double-edged sword',
      phonetic: '/ə ˌdʌb.əl.edʒd ˈsɔːd/',
      partOfSpeech: 'idiom',
      translation: 'ikki qirrali qilich (ham foydali, ham zararli narsa)',
      definition: 'Something that offers clear advantages while simultaneously carrying significant risks or drawbacks.',
      examples: [
        'Generative AI is **a double-edged sword**: it accelerates research yet demands strict verification.',
        'Constant connectivity can act as **a double-edged sword** for employees trying to protect personal rest.'
      ],
      synonyms: ['mixed blessing', 'two-sided coin'],
      antonyms: ['pure advantage', 'unmixed blessing'],
      mnemonic: 'Ikkala tomoni ham o‘tkir qilich — ehtiyotsiz ishlatsangiz ham foyda, ham zarar keltirishi mumkin.',
      category: 'Idioms',
      lesson: '3-dars: Business & Expressions',
      level: 'C1'
    }
  ];

  const payload = {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    DEFAULT_LESSONS: DEFAULT_LESSONS,
    DEFAULT_WORDS: DEFAULT_WORDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = payload;
  }
  if (root) {
    root.SWEData = payload;
  }
})(typeof window !== 'undefined' ? window : globalThis);
