'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Data = require('../js/default-data.js');
const SRS = require('../js/srs.js');
const Auth = require('../js/auth.js');
const Storage = require('../js/storage.js');
const AiTxt = require('../js/ai-txt.js');
const { createAppServer, signSessionToken, verifySessionToken, getSecurityHeaders, maskApiKey } = require('../server.js');

function createMockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('PASS:', name);
}

async function testAsync(name, fn) {
  await fn();
  passed++;
  console.log('PASS:', name);
}

test('Default dataset has 5 built-in categories, 3 lessons, and 15 rich B2/C1 words', () => {
  assert.equal(Data.DEFAULT_CATEGORIES.length, 5);
  assert.deepEqual(
    Data.DEFAULT_CATEGORIES.map((c) => c.name),
    ['IELTS', 'General English', 'Business', 'Phrasal Verbs', 'Idioms']
  );

  assert.equal(Data.DEFAULT_LESSONS.length, 3);
  assert.equal(Data.DEFAULT_WORDS.length, 15);
  Data.DEFAULT_WORDS.forEach((w) => {
    assert.ok(w.word.length > 0, 'word missing');
    assert.ok(w.phonetic.startsWith('/'), `phonetic missing for ${w.word}`);
    assert.ok(w.partOfSpeech.length > 0, `POS missing for ${w.word}`);
    assert.ok(w.translation.length > 0, `translation missing for ${w.word}`);
    assert.ok(w.definition.length > 0, `definition missing for ${w.word}`);
    assert.ok(w.lesson && w.lesson.length > 0, `lesson missing for ${w.word}`);
    assert.equal(w.examples.length, 2, `2 examples required for ${w.word}`);
    w.examples.forEach((ex) => {
      assert.match(ex, /\*\*[^*]+\*\*/, `bolded word marker missing in example for ${w.word}`);
    });
    assert.ok(w.synonyms.length >= 2, `synonyms missing for ${w.word}`);
    assert.ok(w.antonyms.length >= 2, `antonyms missing for ${w.word}`);
    assert.ok(w.mnemonic.length > 5, `mnemonic missing for ${w.word}`);
    assert.ok(['B2', 'C1'].includes(w.level), `expected B2/C1 for ${w.word}`);
  });
});

test('SRS intervals follow Again(1m), Hard(1d), Good(3d), Easy(7d + Mastered)', () => {
  const baseTime = 1_700_000_000_000;
  const initial = Object.assign({ id: 'w-1', word: 'endeavor' }, SRS.createInitialSrsState(baseTime));

  assert.equal(SRS.isCardDue(initial, baseTime), true);

  const againCard = SRS.applyReviewRating(initial, 'again', baseTime);
  assert.equal(againCard.nextReviewAt, baseTime + 60 * 1000);
  assert.equal(againCard.status, 'learning');
  assert.equal(againCard.mastered, false);
  assert.equal(againCard.lapses, 1);
  assert.equal(SRS.isCardDue(againCard, baseTime + 30 * 1000), false);
  assert.equal(SRS.isCardDue(againCard, baseTime + 60 * 1000), true);

  const hardCard = SRS.applyReviewRating(initial, 'hard', baseTime);
  assert.equal(hardCard.nextReviewAt, baseTime + SRS.DAY_MS);
  assert.equal(hardCard.status, 'learning');
  assert.equal(hardCard.mastered, false);

  const goodCard = SRS.applyReviewRating(initial, 'good', baseTime);
  assert.equal(goodCard.nextReviewAt, baseTime + 3 * SRS.DAY_MS);
  assert.equal(goodCard.status, 'review');
  assert.equal(goodCard.mastered, false);

  const easyCard = SRS.applyReviewRating(initial, 'easy', baseTime);
  assert.equal(easyCard.nextReviewAt, baseTime + 7 * SRS.DAY_MS);
  assert.equal(easyCard.status, 'mastered');
  assert.equal(easyCard.mastered, true);
});

test('LocalStorage persistence and Daily Streak progression work across days', () => {
  const mockStore = createMockLocalStorage();
  const day1 = new Date(2026, 10, 10, 10, 0, 0).getTime();
  const day1Later = new Date(2026, 10, 10, 21, 0, 0).getTime();
  const day2 = new Date(2026, 10, 11, 9, 0, 0).getTime();
  const day4 = new Date(2026, 10, 13, 9, 0, 0).getTime();

  let state = Storage.loadState(mockStore, day1);
  assert.equal(state.words.length, 15);
  assert.equal(Storage.getActiveStreak(state.stats, day1), 0);

  state = Storage.recordStudyActivity(state, day1);
  assert.equal(state.stats.streakCount, 1);
  assert.equal(state.stats.todayReviewed, 1);

  state = Storage.recordStudyActivity(state, day1Later);
  assert.equal(state.stats.streakCount, 1);
  assert.equal(state.stats.todayReviewed, 2);

  state = Storage.recordStudyActivity(state, day2);
  assert.equal(state.stats.streakCount, 2);
  assert.equal(state.stats.todayReviewed, 1);
  assert.equal(state.stats.longestStreak, 2);

  Storage.saveState(state, mockStore);
  const reloaded = Storage.loadState(mockStore, day2);
  assert.equal(reloaded.stats.streakCount, 2);
  assert.equal(reloaded.words.length, 15);

  // Missed day 3 -> active streak drops to 0 before study, restarts at 1 on study
  assert.equal(Storage.getActiveStreak(reloaded.stats, day4), 0);
  const day4State = Storage.recordStudyActivity(reloaded, day4);
  assert.equal(day4State.stats.streakCount, 1);
  assert.equal(day4State.stats.longestStreak, 2);
});

test('CSV export/parse and JSON/CSV merge import handle quotes, commas, and deduplication', () => {
  const mockStore = createMockLocalStorage();
  const now = Date.now();
  const state = Storage.loadState(mockStore, now);

  const csv = Storage.exportToCSV(state.words);
  const parsedRows = Storage.parseCSV('\uFEFF' + csv);
  assert.equal(parsedRows.length, 15);
  assert.equal(parsedRows[0].word, 'endeavor');
  assert.ok(parsedRows[0].lesson.length > 0);
  assert.equal(parsedRows[0].examples.length, 2);
  assert.ok(parsedRows[0].synonyms.includes('strive'));

  const customCsv = [
    'word,phonetic,partOfSpeech,translation,definition,example1,example2,synonyms,antonyms,mnemonic,category,lesson,level',
    '"meticulous","/məˈtɪk.jə.ləs/","adjective","juda sinchkov, puxta","Showing great attention to detail","She kept **meticulous** notes, even under pressure.","A **meticulous** audit caught the bug.","thorough; careful","careless; sloppy","Met + tick: har bir detalga belgi (tick) qo‘yish.","Academic","4-dars: Research Skills","C1"',
    '"invalid-no-translation","","","","","","","","","","IELTS","4-dars: Research Skills","B2"'
  ].join('\n');

  const imported = Storage.parseCSV(customCsv);
  const merged = Storage.mergeImportedWords(
    state,
    imported,
    null,
    now,
    [{ name: '4-dars: Research Skills', description: 'Tadqiqot so‘zlari' }]
  );
  assert.equal(merged.summary.added, 1);
  assert.equal(merged.summary.skipped, 1);
  assert.equal(merged.state.words.length, 16);
  assert.ok(merged.state.categories.some((c) => c.name === 'Academic'));
  assert.ok(merged.state.lessons.some((l) => l.name === '4-dars: Research Skills'));

  const meticulous = merged.state.words.find((w) => w.word === 'meticulous');
  assert.equal(meticulous.translation, 'juda sinchkov, puxta');
  assert.equal(meticulous.lesson, '4-dars: Research Skills');
  assert.equal(meticulous.examples[0], 'She kept **meticulous** notes, even under pressure.');

  const jsonBackup = JSON.parse(Storage.exportToJSON(merged.state));
  assert.equal(jsonBackup.app, 'SWE ENGLISH EXTRA');
  assert.equal(jsonBackup.version, 3);
  assert.equal(jsonBackup.words.length, 16);
  assert.ok(Array.isArray(jsonBackup.lessons));
});

test('LocalStorage v1 state migrates cleanly to v3 schema with students, lessons, auth, and DeepSeek default aiConfig', () => {
  const mockStore = createMockLocalStorage();
  const now = Date.now();
  const v1State = {
    version: 1,
    words: [
      { id: 'w-v1', word: 'legacy', translation: 'meros', category: 'IELTS', level: 'B2' }
    ],
    categories: Data.DEFAULT_CATEGORIES,
    stats: { dailyGoal: 10, streakCount: 3 },
    settings: { theme: 'dark', accent: 'en-GB' }
  };
  mockStore.setItem(Storage.STORAGE_KEY, JSON.stringify(v1State));

  const loaded = Storage.loadState(mockStore, now);
  assert.equal(loaded.version, 3);
  assert.equal(loaded.lessons.length, 3);
  assert.equal(loaded.words[0].lesson, '1-dars: Academic Foundations');
  assert.equal(loaded.settings.theme, 'dark');
  assert.equal(loaded.settings.accent, 'en-GB');
  assert.ok(loaded.auth && loaded.auth.hashes && loaded.auth.hashes.it_manager);
  assert.ok(Array.isArray(loaded.students) && loaded.students.length >= 3);
  assert.ok(loaded.studentProgress && loaded.studentProgress[loaded.students[0].id]);
  assert.ok(loaded.aiConfig && loaded.aiConfig.provider === 'deepseek');
  assert.equal(loaded.aiConfig.model, 'deepseek-chat');
});

test('SWEAuth validates salted SHA-256 hashing, student CRUD, unified authenticate, and audit log', () => {
  const mockSession = createMockLocalStorage();
  assert.equal(
    Auth.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );

  let authState = Auth.createDefaultAuthState();
  assert.match(authState.hashes.it_manager, /^[a-f0-9]{64}$/);
  assert.match(authState.hashes.teacher, /^[a-f0-9]{64}$/);
  assert.notEqual(authState.hashes.it_manager, authState.hashes.teacher);
  assert.equal(Auth.verifyRolePassword(authState, 'it_manager', 'wrong'), false);
  assert.equal(Auth.verifyRolePassword(authState, 'teacher', 'wrong'), false);
  assert.equal(Auth.canManageSecurity('it_manager'), true);
  assert.equal(Auth.canManageSecurity('teacher'), false);
  assert.equal(Auth.canManageLessons('teacher'), true);
  assert.equal(Auth.canMonitorStudents('teacher'), true);
  assert.equal(Auth.canManageStudents('teacher'), true);
  assert.equal(Auth.canMonitorStudents('student'), false);

  assert.throws(() => Auth.changeRolePassword(authState, 'teacher', 'it_manager', 'NewPass123'));
  assert.throws(() => Auth.changeRolePassword(authState, 'it_manager', 'teacher', '123'));

  authState = Auth.changeRolePassword(authState, 'it_manager', 'teacher', 'TeacherSample#2026');
  authState = Auth.changeRolePassword(authState, 'it_manager', 'it_manager', 'ManagerSample#2026');
  assert.equal(Auth.verifyRolePassword(authState, 'teacher', 'TeacherSample#2026'), true);
  assert.equal(Auth.verifyRolePassword(authState, 'it_manager', 'ManagerSample#2026'), true);
  assert.equal(Auth.verifyRolePassword(authState, 'it_manager', 'TeacherSample#2026'), false);

  // Student CRUD & Login
  let students = Auth.createDefaultStudents();
  assert.throws(() => Auth.createStudentAccount(students, 'student', {
    username: 'badstu',
    fullName: 'Bad',
    password: 'Pass#123'
  }));
  const createdRes = Auth.createStudentAccount(students, 'teacher', {
    username: 'nodira',
    fullName: 'Nodira Tursunova',
    group: 'IELTS B2',
    password: 'NodiraSample#2026'
  }, 1_700_000_000_000);
  students = createdRes.students;
  assert.equal(createdRes.created.username, 'nodira');

  const okLogin = Auth.authenticate({
    authState,
    students,
    role: 'student',
    username: 'Nodira',
    password: 'NodiraSample#2026'
  });
  assert.equal(okLogin.ok, true);
  assert.equal(okLogin.session.role, 'student');
  assert.equal(okLogin.session.username, 'nodira');

  const badLogin = Auth.authenticate({
    authState,
    students,
    role: 'student',
    username: 'nodira',
    password: 'wrong'
  });
  assert.equal(badLogin.ok, false);

  students = Auth.resetStudentPassword(students, 'teacher', createdRes.created.id, 'ResetSample#2026');
  const resetLogin = Auth.authenticate({
    authState,
    students,
    role: 'student',
    username: 'nodira',
    password: 'ResetSample#2026'
  });
  assert.equal(resetLogin.ok, true);

  students = Auth.toggleStudentActive(students, 'teacher', createdRes.created.id);
  const blockedLogin = Auth.authenticate({
    authState,
    students,
    role: 'student',
    username: 'nodira',
    password: 'ResetSample#2026'
  });
  assert.equal(blockedLogin.ok, false);

  assert.equal(Auth.getSession(mockSession), null);
  Auth.setSession(okLogin.session, mockSession);
  assert.equal(Auth.getSession(mockSession).username, 'nodira');
  Auth.setSession(null, mockSession);
  assert.equal(Auth.getSession(mockSession), null);

  const logs = Auth.appendAuditLog([], 'it_manager', 'PASSWORD_CHANGE', 'Teacher updated', 123456);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actorRole, 'it_manager');
});

test('Multi-student SRS progress, quiz/writing telemetry, and getStudentSummary isolate students cleanly', () => {
  const now = 1_700_000_000_000;
  let state = Storage.createDefaultState(now);
  const stuA = state.students[0];
  const stuB = state.students[1];
  const sessA = { role: 'student', userId: stuA.id, username: stuA.username, fullName: stuA.fullName, group: stuA.group };
  const sessB = { role: 'student', userId: stuB.id, username: stuB.username, fullName: stuB.fullName, group: stuB.group };

  const targetWord = state.words[0];
  const reviewRes = Storage.applyWordReviewForSession(state, sessA, targetWord.id, 'easy', SRS, now);
  state = reviewRes.state;
  assert.equal(reviewRes.updatedCard.mastered, true);

  // Student B still sees targetWord as 'new' / not mastered
  const wordsA = Storage.getWordsForSession(state, sessA, now);
  const wordsB = Storage.getWordsForSession(state, sessB, now);
  assert.equal(wordsA[0].mastered, true);
  assert.equal(wordsB[0].mastered, false);

  // Telemetry events update Student A summary & live feed
  state = Storage.recordStudentEvent(state, sessA, {
    type: 'QUIZ_ANSWER',
    view: 'study',
    mode: 'quiz',
    lesson: targetWord.lesson,
    word: targetWord.word,
    isCorrect: true,
    quizCorrectDelta: 1,
    quizTotalDelta: 1,
    countAsStudyActivity: true,
    detail: 'Test: "' + targetWord.word + '" — to‘g‘ri javob'
  }, now + 5000);

  const summaryA = Storage.getStudentSummary(state, stuA, now + 10_000);
  const summaryB = Storage.getStudentSummary(state, stuB, now + 10_000);
  assert.equal(summaryA.presence, 'online');
  assert.equal(summaryA.masteredCount, 1);
  assert.equal(summaryA.accuracyPct, 100);
  assert.equal(summaryA.todayReviewed, 2);
  assert.equal(summaryB.presence, 'offline');
  assert.equal(summaryB.masteredCount, 0);
  assert.ok(state.studentActivityLog.some((e) => e.studentId === stuA.id && e.type === 'FLASHCARD_RATE'));
});

test('AiTxt parses messy mixed .txt formats across lessons and exports both TXT modes', () => {
  const parsed = AiTxt.parseRawTxtVocabulary(AiTxt.SAMPLE_TXT, 'Umumiy');
  assert.deepEqual(parsed.detectedLessons, [
    'Umumiy',
    '4-dars: Technology & Innovation',
    '5-dars: Environment & Policy'
  ]);
  assert.equal(parsed.entries.length, 8);
  assert.equal(parsed.entries[0].word, 'ubiquitous');
  assert.equal(parsed.entries[0].translation, 'hamma joyda uchraydigan');
  assert.equal(parsed.entries[0].lesson, '4-dars: Technology & Innovation');
  assert.equal(parsed.entries[2].word, 'obsolete');
  assert.equal(parsed.entries[2].translation, 'eskirgan, foydalanishdan chiqqan');
  assert.equal(parsed.entries[3].word, 'streamline');
  assert.equal(parsed.entries[3].translation, '');
  assert.equal(parsed.entries[3].needsAi, true);
  assert.equal(parsed.entries[7].word, 'carbon footprint');
  assert.equal(parsed.entries[7].lesson, '5-dars: Environment & Policy');

  const txtDetailed = AiTxt.exportToTXT(Data.DEFAULT_WORDS, Data.DEFAULT_LESSONS, 'detailed');
  assert.match(txtDetailed, /=== 1-dars: Academic Foundations ===/);
  assert.match(txtDetailed, /endeavor/);

  const txtSimple = AiTxt.exportToTXT(Data.DEFAULT_WORDS, Data.DEFAULT_LESSONS, 'simple');
  assert.match(txtSimple, /1\. endeavor/);

  const extracted = AiTxt.extractJsonFromAiResponse('```json\n[{"word":"streamline","translation":"soddalashtirmoq"}]\n```');
  assert.equal(extracted[0].word, 'streamline');
});

async function runAsyncTests() {
  await testAsync('AiTxt enrichEntriesWithAI supports mocked Gemini and OpenAI responses', async () => {
    const entries = [
      { rawLine: 'streamline', word: 'streamline', translation: '', lesson: '4-dars: Tech', phonetic: '' }
    ];

    const geminiFetch = async (url, init) => {
      assert.match(url, /generativelanguage\.googleapis\.com/);
      assert.equal(init.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([{
                  word: 'streamline',
                  phonetic: '/ˈstriːm.laɪn/',
                  partOfSpeech: 'verb',
                  translation: 'tizimlashtirmoq, soddalashtirmoq',
                  definition: 'Make a process simpler and more efficient.',
                  examples: [
                    'We must streamline our workflow.',
                    'New software will **streamline** deployments.'
                  ],
                  synonyms: ['simplify', 'optimize'],
                  antonyms: ['complicate'],
                  mnemonic: 'Stream (oqim) + line (chiziq): suv oqimidek ravon qilish.',
                  category: 'Business',
                  lesson: '4-dars: Tech',
                  level: 'C1'
                }])
              }]
            }
          }]
        })
      };
    };

    const geminiResult = await AiTxt.enrichEntriesWithAI(
      entries,
      { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'AIzaTestKey' },
      { fetchImpl: geminiFetch, batchSize: 10 }
    );
    assert.equal(geminiResult.length, 1);
    assert.equal(geminiResult[0].translation, 'tizimlashtirmoq, soddalashtirmoq');
    assert.match(geminiResult[0].examples[0], /\*\*streamline\*\*/i);
    assert.equal(geminiResult[0].level, 'C1');

    const openaiFetch = async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer sk-test');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '[{"word":"streamline","phonetic":"/ˈstriːm.laɪn/","partOfSpeech":"verb","translation":"soddalashtirmoq","definition":"Simplify","examples":["Streamline the code.","Use CI to **streamline** releases."],"synonyms":["simplify"],"antonyms":[],"mnemonic":"Stream + line","category":"Business","lesson":"4-dars: Tech","level":"B2"}]'
            }
          }]
        })
      };
    };

    const openaiResult = await AiTxt.enrichEntriesWithAI(
      entries,
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test' },
      { fetchImpl: openaiFetch }
    );
    assert.equal(openaiResult[0].translation, 'soddalashtirmoq');

    const deepseekFetch = async (url, init) => {
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer sk-deepseek-test');
      const parsedBody = JSON.parse(init.body);
      assert.equal(parsedBody.model, 'deepseek-chat');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: '<think>reasoning hidden</think>\n[{"word":"streamline","phonetic":"/ˈstriːm.laɪn/","partOfSpeech":"verb","translation":"tizimlashtirmoq","definition":"Make simpler","examples":["They will streamline billing.","CI helps **streamline** QA."],"synonyms":["optimize"],"antonyms":["hinder"],"mnemonic":"Stream line","category":"Business","lesson":"4-dars: Tech","level":"C1"}]'
            }
          }]
        })
      };
    };

    const deepseekResult = await AiTxt.enrichEntriesWithAI(
      entries,
      { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-deepseek-test' },
      { fetchImpl: deepseekFetch }
    );
    assert.equal(deepseekResult.length, 1);
    assert.equal(deepseekResult[0].translation, 'tizimlashtirmoq');
    assert.equal(deepseekResult[0].level, 'C1');
  });

  await testAsync('Real-time Node server syncs student flashcard review + quiz telemetry to teacher monitor', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-extra-qa-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'QaTeach#2026');
    const stuCreated = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'qastudent',
      fullName: 'QA Student',
      group: 'QA Group',
      password: 'QaStudent#2026'
    }, now);
    seedState.students = stuCreated.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuCreated.created.id, now);
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const healthRes = await fetch(`${baseUrl}/api/health`);
      const health = await healthRes.json();
      assert.equal(health.ok, true);
      assert.equal(health.mode, 'server');

      // Block access to server.js / data files
      const secStatic = await fetch(`${baseUrl}/server.js`);
      assert.equal(secStatic.status, 403);

      // Student logs in
      const stuLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', username: 'qastudent', password: 'QaStudent#2026' })
      });
      const stuLogin = await stuLoginRes.json();
      assert.equal(stuLogin.ok, true);
      assert.equal(stuLogin.session.username, 'qastudent');
      const stuToken = stuLogin.token;

      // Student rates a word Easy and completes a quiz question
      const firstWord = stuLogin.state.words[0];
      const reviewRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuToken}`
        },
        body: JSON.stringify({ wordId: firstWord.id, ratingKey: 'easy' })
      });
      const reviewData = await reviewRes.json();
      assert.equal(reviewData.ok, true);

      const telemRes = await fetch(`${baseUrl}/api/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuToken}`
        },
        body: JSON.stringify({
          type: 'QUIZ_ANSWER',
          view: 'study',
          mode: 'quiz',
          word: firstWord.word,
          isCorrect: true,
          quizCorrectDelta: 1,
          quizTotalDelta: 1,
          countAsStudyActivity: true,
          detail: 'QA quiz correct'
        })
      });
      assert.equal((await telemRes.json()).ok, true);

      // Teacher logs in and sees QA Student live telemetry & progress
      const teachLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'QaTeach#2026' })
      });
      const teachLogin = await teachLoginRes.json();
      assert.equal(teachLogin.ok, true);

      const stateRes = await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${teachLogin.token}` }
      });
      const teachState = await stateRes.json();
      const qaStu = teachState.state.students.find((s) => s.username === 'qastudent');
      assert.ok(qaStu);
      const summary = Storage.getStudentSummary(teachState.state, qaStu, Date.now());
      assert.equal(summary.presence, 'online');
      assert.equal(summary.masteredCount, 1);
      assert.equal(summary.accuracyPct, 100);
      assert.ok(teachState.state.studentActivityLog.some((e) => e.studentId === qaStu.id && e.type === 'QUIZ_ANSWER'));
    } finally {
      server.closeAllSse();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('Security hardening v4: stretched swe3 hashes, password strength, lockout, SSRF guard, and CSV formula escape', () => {
    const stretched = Auth.hashRolePassword('teacher', 'StrongKey#2026');
    assert.match(stretched, /^swe3:4000:[a-f0-9]{16,}:[a-f0-9]{64}$/);
    assert.equal(Auth.isStretchedHash(stretched), true);
    assert.equal(Auth.verifyPasswordHash('role:teacher', 'StrongKey#2026', stretched), true);
    assert.equal(Auth.verifyPasswordHash('role:teacher', 'WrongKey#2026', stretched), false);

    // Password strength rules
    assert.equal(Auth.validatePasswordStrength('short').ok, false);
    assert.equal(Auth.validatePasswordStrength('onlyletters').ok, false);
    assert.equal(Auth.validatePasswordStrength('12345678').ok, false);
    assert.equal(Auth.validatePasswordStrength(' Leading#2026').ok, false);
    assert.equal(Auth.validatePasswordStrength('StrongPass#2026').ok, true);

    // Client-side brute-force rate limiting (5 failures -> lockout on 6th)
    const rlStore = createMockLocalStorage();
    let authState = Auth.createDefaultAuthState();
    authState = Auth.changeRolePassword(authState, 'it_manager', 'teacher', 'CleanTeacher#2026');
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      const fail = Auth.authenticate({
        authState,
        students: [],
        role: 'teacher',
        password: 'wrong-' + i,
        enforceRateLimit: true,
        rateLimitStore: rlStore,
        now: t0 + i * 100
      });
      assert.equal(fail.ok, false);
    }
    const lockedOut = Auth.authenticate({
      authState,
      students: [],
      role: 'teacher',
      password: 'CleanTeacher#2026',
      enforceRateLimit: true,
      rateLimitStore: rlStore,
      now: t0 + 1000
    });
    assert.equal(lockedOut.ok, false);
    assert.equal(lockedOut.rateLimited, true);
    assert.ok(lockedOut.retryAfterSec > 0);

    // Lockout expires after window
    const afterCooldown = Auth.authenticate({
      authState,
      students: [],
      role: 'teacher',
      password: 'CleanTeacher#2026',
      enforceRateLimit: true,
      rateLimitStore: rlStore,
      now: t0 + 4 * 60 * 1000
    });
    assert.equal(afterCooldown.ok, true);

    // SSRF & HTTPS endpoint policy
    assert.equal(AiTxt.validateAiEndpoint('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/chat/completions');
    assert.throws(() => AiTxt.validateAiEndpoint('http://api.deepseek.com/chat/completions'));
    assert.throws(() => AiTxt.validateAiEndpoint('https://localhost:8080/v1'));
    assert.throws(() => AiTxt.validateAiEndpoint('https://127.0.0.1/v1'));
    assert.throws(() => AiTxt.validateAiEndpoint('https://169.254.169.254/latest/meta-data'));
    assert.throws(() => AiTxt.validateAiEndpoint('https://192.168.1.10/v1'));

    // CSV formula injection defense (CWE-1236)
    const csvOut = Storage.exportToCSV([
      {
        word: '=cmd|"/C calc"!A0',
        translation: '+SUM(A1:A2)',
        phonetic: '@bad',
        partOfSpeech: '-test',
        lesson: '1-dars',
        category: 'IELTS',
        level: 'B2',
        definition: '\tmacro',
        examples: [],
        synonyms: [],
        antonyms: [],
        mnemonic: '',
        status: 'new',
        interval: 0
      }
    ]);
    assert.match(csvOut, /'=cmd/);
    assert.match(csvOut, /'\+SUM/);
    assert.match(csvOut, /'@bad/);
    assert.match(csvOut, /'-test/);

    // Token exp & revocation helpers
    const tokNow = 1_700_000_000_000;
    const tok = signSessionToken({ role: 'teacher', userId: 'teacher' }, 'test-secret', 60_000, tokNow);
    const decoded = verifySessionToken(tok, 'test-secret', new Set(), tokNow + 10_000);
    assert.equal(decoded.role, 'teacher');
    assert.equal(verifySessionToken(tok, 'test-secret', new Set(), tokNow + 120_000), null);
    assert.equal(verifySessionToken(tok, 'test-secret', new Set([decoded.jti]), tokNow + 10_000), null);
    assert.equal(maskApiKey('sk-1234567890abcdef'), 'sk-1••••cdef');
    assert.ok(getSecurityHeaders(true)['Content-Security-Policy'].includes("script-src 'self'"));
  });

  await testAsync('Server security v4: CSP/headers, TXT-only HTML check, 429 lockout, logout jti revocation, masked API proxy & SSRF block', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-sec-v4-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'SecTeach#2026!');
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'it_manager', 'SecAdmin#2026!');
    const stuCreated = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'secstu',
      fullName: 'Sec Student',
      group: 'SecGroup',
      password: 'SecStudent#2026!'
    }, now);
    seedState.students = stuCreated.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuCreated.created.id, now);
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    let lastProxiedCall = null;
    let proxyFetchCalls = 0;
    const mockProxyFetch = async (url, init) => {
      proxyFetchCalls++;
      lastProxiedCall = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '[{"word":"lucid","translation":"ravshan"}]' } }]
        })
      };
    };

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath,
      maxLoginAttempts: 3,
      lockoutMs: 60_000,
      fetchImpl: mockProxyFetch
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // 1. HTML CSP headers & TXT-only markup audit
      const homeRes = await fetch(`${baseUrl}/`);
      assert.equal(homeRes.status, 200);
      assert.equal(homeRes.headers.get('x-frame-options'), 'DENY');
      assert.equal(homeRes.headers.get('x-content-type-options'), 'nosniff');
      const csp = homeRes.headers.get('content-security-policy') || '';
      const scriptSrcDirective = csp.split(';').find((d) => d.trim().startsWith('script-src')) || '';
      assert.ok(scriptSrcDirective.includes("'self' https://cdn.tailwindcss.com https://unpkg.com"));
      assert.equal(scriptSrcDirective.includes("'unsafe-inline'"), false);

      const htmlBody = await homeRes.text();
      assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(htmlBody), false, 'Expected zero inline <script> blocks');
      assert.equal(htmlBody.includes('id="wordModal"'), false);
      assert.equal(htmlBody.includes('id="categoryModal"'), false);
      assert.equal(htmlBody.includes('id="vocabAddWordBtn"'), false);
      assert.equal(htmlBody.includes('id="vocabImportBtn"'), false);

      // 2. Blocked files & unauthenticated SSE stream
      assert.equal((await fetch(`${baseUrl}/tests/verify.js`)).status, 403);
      assert.equal((await fetch(`${baseUrl}/package.json`)).status, 403);
      assert.equal((await fetch(`${baseUrl}/api/stream`)).status, 401);
      assert.equal((await fetch(`${baseUrl}/api/stream?token=invalid.token`)).status, 401);

      // 3. Server brute-force 429 lockout & role-specific error + IT Manager changeRolePassword unlocks & updates login immediately
      for (let i = 0; i < 3; i++) {
        const failRes = await fetch(`${baseUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'teacher', password: 'bad-' + i })
        });
        assert.equal(failRes.status, i < 2 ? 401 : 429);
        if (i === 0) {
          const failJson = await failRes.json();
          assert.match(failJson.error, /Teacher paroli noto‘g‘ri/);
        }
      }
      const lockedRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'SecTeach#2026!' })
      });
      assert.equal(lockedRes.status, 429);
      assert.ok(Number(lockedRes.headers.get('retry-after')) >= 1);

      const itBadRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'it_manager', password: 'wrong-it' })
      });
      assert.equal(itBadRes.status, 401);
      assert.match((await itBadRes.json()).error, /IT Manager paroli noto‘g‘ri/);

      const itLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'it_manager', password: 'SecAdmin#2026!' })
      });
      const itLogin = await itLoginRes.json();
      assert.equal(itLogin.ok, true);
      assert.ok(itLogin.state.auditLog.some((e) => e.action === 'AUTH_LOCKOUT'));

      // Changing teacher password automatically clears teacher rate-limit and accepts new password immediately
      const chgTeachRes = await fetch(`${baseUrl}/api/security`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itLogin.token}`
        },
        body: JSON.stringify({
          action: 'changeRolePassword',
          targetRole: 'teacher',
          newPassword: 'SecTeachUpdated#2026'
        })
      });
      assert.equal(chgTeachRes.status, 200);

      // Must succeed immediately without waiting for clearRateLimits
      const teachLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'SecTeachUpdated#2026' })
      });
      const teachLogin = await teachLoginRes.json();
      assert.equal(teachLoginRes.status, 200);
      assert.equal(teachLogin.ok, true);

      // Old teacher password must fail with role-specific error
      const oldPwRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'SecTeach#2026!' })
      });
      assert.equal(oldPwRes.status, 401);
      assert.match((await oldPwRes.json()).error, /Teacher paroli noto‘g‘ri/);

      const clearRlRes = await fetch(`${baseUrl}/api/security`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itLogin.token}`
        },
        body: JSON.stringify({ action: 'clearRateLimits' })
      });
      assert.equal(clearRlRes.status, 200);

      // Authenticated SSE opens with 200 and closes cleanly on abort
      const sseController = new AbortController();
      const sseRes = await fetch(`${baseUrl}/api/stream?token=${encodeURIComponent(teachLogin.token)}`, {
        signal: sseController.signal
      });
      assert.equal(sseRes.status, 200);
      sseController.abort();

      // 5. IT Manager-only AI config + SSRF guard + server masking + Teacher uses AI proxy without seeing key
      assert.equal(Auth.canManageAiConfig('it_manager'), true);
      assert.equal(Auth.canManageAiConfig('teacher'), false);
      assert.equal(Auth.canManageAiConfig('student'), false);

      const teachForbiddenAiCfg = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({
          aiConfig: { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-teacher-attempt' }
        })
      });
      assert.equal(teachForbiddenAiCfg.status, 403);

      const ssrfRes = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itLogin.token}`
        },
        body: JSON.stringify({
          aiConfig: {
            provider: 'custom',
            model: 'm',
            customUrl: 'http://127.0.0.1:9000/v1',
            apiKey: 'sk-1234567890abcd'
          }
        })
      });
      assert.equal(ssrfRes.status, 400);

      const saveKeyRes = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itLogin.token}`
        },
        body: JSON.stringify({
          aiConfig: {
            provider: 'deepseek',
            model: 'deepseek-chat',
            customUrl: '',
            apiKey: 'sk-secret-deepseek-9876'
          }
        })
      });
      const savedKeyJson = await saveKeyRes.json();
      assert.equal(saveKeyRes.status, 200);
      assert.equal(savedKeyJson.state.aiConfig.apiKey, '');
      assert.equal(savedKeyJson.state.aiConfig.hasApiKey, true);
      assert.equal(savedKeyJson.state.aiConfig.apiKeyMasked, 'sk-s••••9876');

      // Teacher state reflects readiness (hasApiKey: true) WITHOUT exposing masked key
      const teachStateAfterAi = await (await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${teachLogin.token}` }
      })).json();
      assert.equal(teachStateAfterAi.state.aiConfig.hasApiKey, true);
      assert.equal(teachStateAfterAi.state.aiConfig.apiKeyMasked, '');

      // SSRF blocked at proxy level too
      const proxySsrfRes = await fetch(`${baseUrl}/api/ai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({
          provider: 'custom',
          endpoint: 'https://169.254.169.254/latest/meta-data',
          payload: { messages: [] }
        })
      });
      assert.equal(proxySsrfRes.status, 400);

      // Proxy uses stored secret for Teacher without browser having apiKey
      const proxyRes = await fetch(`${baseUrl}/api/ai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({
          provider: 'deepseek',
          endpoint: 'https://api.deepseek.com/chat/completions',
          payload: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }
        })
      });
      const proxyJson = await proxyRes.json();
      assert.equal(proxyRes.status, 200);
      assert.equal(proxyJson.ok, true);
      assert.equal(proxyJson.cached, false);
      assert.equal(proxyFetchCalls, 1);
      assert.match(proxyJson.content, /lucid/);
      assert.equal(lastProxiedCall.url, 'https://api.deepseek.com/chat/completions');
      assert.equal(lastProxiedCall.init.redirect, 'error');
      assert.equal(lastProxiedCall.init.headers.Authorization, 'Bearer sk-secret-deepseek-9876');

      // Second identical /api/ai-proxy request hits server cache with 0 upstream fetch calls
      const cachedProxyRes = await fetch(`${baseUrl}/api/ai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({
          provider: 'deepseek',
          endpoint: 'https://api.deepseek.com/chat/completions',
          payload: { model: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }
        })
      });
      const cachedProxyJson = await cachedProxyRes.json();
      assert.equal(cachedProxyRes.status, 200);
      assert.equal(cachedProxyJson.cached, true);
      assert.equal(cachedProxyJson.content, proxyJson.content);
      assert.equal(proxyFetchCalls, 1);

      // IT Manager clearing key clears hasApiKey
      const clearKeyRes = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itLogin.token}`
        },
        body: JSON.stringify({
          aiConfig: {
            provider: 'deepseek',
            model: 'deepseek-chat',
            customUrl: '',
            clearKey: true
          }
        })
      });
      const clearedKeyJson = await clearKeyRes.json();
      assert.equal(clearKeyRes.status, 200);
      assert.equal(clearedKeyJson.state.aiConfig.hasApiKey, false);

      // Student login, /api/ai-proxy block (403), then deleteStudentAccount cleanup + immediate 401 token invalidation
      const stuRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', username: 'secstu', password: 'SecStudent#2026!' })
      });
      const stuJson = await stuRes.json();
      const stuProxyRes = await fetch(`${baseUrl}/api/ai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuJson.token}`
        },
        body: JSON.stringify({ body: { messages: [] } })
      });
      assert.equal(stuProxyRes.status, 403);

      const delStuRes = await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({ action: 'delete', studentId: stuJson.session.userId })
      });
      const delStuJson = await delStuRes.json();
      assert.equal(delStuRes.status, 200);
      assert.equal(delStuJson.state.students.some((s) => s.id === stuJson.session.userId), false);
      assert.equal(delStuJson.state.studentProgress[stuJson.session.userId], undefined);
      assert.ok(delStuJson.state.auditLog.some((e) => e.action === 'STUDENT_DELETE'));

      // Deleted student's active token must immediately fail on state, review, and telemetry
      const deletedStuStateRes = await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${stuJson.token}` }
      });
      assert.equal(deletedStuStateRes.status, 401);
      const deletedStuReviewRes = await fetch(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuJson.token}`
        },
        body: JSON.stringify({ wordId: 'w-endeavor', ratingKey: 'easy' })
      });
      assert.equal(deletedStuReviewRes.status, 401);

      // Storage preserves intentionally emptied lessons array after deleting lessons
      const emptyLessonsNormalized = Storage.normalizeState({ version: 3, words: [], lessons: [] }, Date.now());
      assert.deepEqual(emptyLessonsNormalized.lessons, []);

      // Logout revokes token jti immediately
      const logoutRes = await fetch(`${baseUrl}/api/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${teachLogin.token}` }
      });
      assert.equal(logoutRes.status, 200);
      const afterLogoutState = await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${teachLogin.token}` }
      });
      assert.equal(afterLogoutState.status, 401);
    } finally {
      server.closeAllSse();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('AiTxt API minimization: DB reuse, lexicon cache, in-batch deduplication, compact prompt & 40-word batching', async () => {
    assert.equal(AiTxt.DEFAULT_BATCH_SIZE, 40);

    // Compact prompt omits category when forced and omits lesson duplication
    const compactPrompt = AiTxt.buildEnrichPrompt(
      [{ word: 'lucid', translation: 'aniq', lesson: '10-dars' }],
      { forcedCategory: 'IELTS' }
    );
    assert.equal(compactPrompt.includes('10-dars'), false);
    assert.equal(compactPrompt.includes('"cat"'), false);
    assert.ok(compactPrompt.includes('["lucid|aniq"]'));

    const entries = [
      { rawLine: 'endeavor', word: 'endeavor', translation: '', lesson: 'Lesson A', phonetic: '' },
      { rawLine: 'cogent', word: 'cogent', translation: '', lesson: 'Lesson B', phonetic: '' },
      { rawLine: 'serendipity - omadli tasodif', word: 'serendipity', translation: 'omadli tasodif', lesson: 'Lesson C', phonetic: '' },
      { rawLine: 'serendipity', word: 'serendipity', translation: '', lesson: 'Lesson D', phonetic: '' }
    ];

    const cache = {
      cogent: {
        word: 'cogent',
        phonetic: '/ˈkəʊ.dʒənt/',
        partOfSpeech: 'adjective',
        translation: 'ishonarli, asosli',
        definition: 'Clear, logical, and convincing.',
        examples: ['She gave a **cogent** argument.', 'The report lists **cogent** reasons.'],
        synonyms: ['convincing'],
        antonyms: ['weak'],
        mnemonic: 'co-agent -> asosli dalil',
        category: 'IELTS',
        level: 'C1',
        cachedAt: Date.now()
      }
    };

    let fetchCalls = 0;
    let capturedPrompt = '';
    let statsObserved = null;
    const smartFetch = async (url, init) => {
      fetchCalls++;
      const parsed = JSON.parse(init.body);
      capturedPrompt = parsed.messages[1].content;
      // AI returns compact wire keys ONLY for the 1 unique missing word ('serendipity')
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([{
                w: 'serendipity',
                p: '/ˌser.ənˈdɪp.ə.ti/',
                pos: 'noun',
                tr: 'omadli tasodif',
                d: 'Finding good things by chance.',
                ex: ['Meeting her was pure **serendipity**.', 'Science grows via **serendipity**.'],
                syn: ['fortune', 'luck'],
                ant: ['misfortune'],
                m: 'seren + dipity -> yoqimli kutilmagan topilma',
                lvl: 'C1'
              }])
            }
          }]
        })
      };
    };

    const res1 = await AiTxt.enrichEntriesWithAI(
      entries,
      { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-test' },
      {
        existingWords: Data.DEFAULT_WORDS,
        cache: cache,
        forcedCategory: 'IELTS',
        onStats: (st) => { statsObserved = st; },
        fetchImpl: smartFetch
      }
    );

    assert.equal(fetchCalls, 1);
    assert.equal(statsObserved.reusedFromDb, 1);
    assert.equal(statsObserved.reusedFromCache, 1);
    assert.equal(statsObserved.deduplicated, 1);
    assert.equal(statsObserved.sentToAi, 1);
    assert.equal(statsObserved.apiCalls, 1);
    assert.equal(capturedPrompt.includes('endeavor'), false);
    assert.equal(capturedPrompt.includes('cogent'), false);
    assert.equal(res1.length, 4);
    assert.equal(res1[0].lesson, 'Lesson A');
    assert.equal(res1[1].lesson, 'Lesson B');
    assert.equal(res1[2].lesson, 'Lesson C');
    assert.equal(res1[3].lesson, 'Lesson D');
    assert.equal(res1[3].phonetic, '/ˌser.ənˈdɪp.ə.ti/');
    assert.ok(cache.serendipity);

    // Repeat run on ALL 3 words must make ZERO API calls
    const res2 = await AiTxt.enrichEntriesWithAI(
      entries,
      { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-test' },
      { existingWords: Data.DEFAULT_WORDS, cache: cache, fetchImpl: smartFetch }
    );
    assert.equal(fetchCalls, 1, 'Repeat enrichment must hit DB/cache with 0 new API calls');
    assert.equal(res2.length, 4);
  });

  console.log(`\nAll ${passed} test suites passed!`);
}

runAsyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
