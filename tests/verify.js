'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Data = require('../js/default-data.js');
const SRS = require('../js/srs.js');
const Auth = require('../js/auth.js');
const Storage = require('../js/storage.js');
const AiTxt = require('../js/ai-txt.js');
const Exam = require('../js/exam.js');
const Sync = require('../js/sync.js');
const Speech = require('../js/speech.js');
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

  await testAsync('Final Closed Exam (SWEExam): Uzbek translation grading, 2-warning -> 3rd strike cheating lock, server /api/exam & teacher retake approval', async () => {
    // Unit grading assertions
    assert.equal(Exam.gradeUzbekTranslation("o'zlashtirmoq", "o‘zlashtirmoq, egallamoq").isCorrect, true);
    assert.equal(Exam.gradeUzbekTranslation('ozlashtirmoq', "o‘zlashtirmoq / qo'lga kiritmoq").isCorrect, true);
    assert.equal(Exam.gradeUzbekTranslation('egallamoq', 'o‘zlashtirmoq; egallamoq').isCorrect, true);
    assert.equal(Exam.gradeUzbekTranslation('xato javob', 'o‘zlashtirmoq, egallamoq').isCorrect, false);
    assert.equal(Exam.gradeUzbekTranslation('', 'o‘zlashtirmoq').isCorrect, false);

    const firstLesson = Data.DEFAULT_WORDS[0].lesson;
    const expectedLessonCount = Data.DEFAULT_WORDS.filter((w) => w.lesson === firstLesson).length;
    const scopedQueue = Exam.buildFinalExamQueue(Data.DEFAULT_WORDS, firstLesson, 'ALL');
    assert.equal(scopedQueue.length, expectedLessonCount);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-exam-v5-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'ExamTeach#2026!');
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'it_manager', 'ExamAdmin#2026!');
    const stuCreated = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'examstu',
      fullName: 'Exam Student',
      group: 'ExamGroup',
      password: 'ExamStudent#2026!'
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
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const homeHtml = await (await fetch(`${baseUrl}/`)).text();
      assert.ok(homeHtml.includes('<meta name="google" content="notranslate"'));
      assert.ok(homeHtml.includes('id="mode-exam"'));
      assert.ok(homeHtml.includes('id="monitorCheatingBanner"'));
      assert.ok(homeHtml.includes('id="stuModalApproveRetakeBtn"'));

      const stuLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', username: 'examstu', password: 'ExamStudent#2026!' })
      });
      const stuLogin = await stuLoginRes.json();
      assert.equal(stuLogin.ok, true);

      const teachLoginRes = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'ExamTeach#2026!' })
      });
      const teachLogin = await teachLoginRes.json();
      assert.equal(teachLogin.ok, true);

      // Start scoped Lesson 1 exam
      const startRes = await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuLogin.token}`
        },
        body: JSON.stringify({ action: 'start', lessonScope: firstLesson, categoryScope: 'ALL' })
      });
      assert.equal(startRes.status, 200);
      const startJson = await startRes.json();
      assert.equal(startJson.finalExam.status, 'in_progress');
      assert.equal(startJson.finalExam.totalQuestions, expectedLessonCount);
      const queueIds = startJson.finalExam.questionQueueIds;

      // Answer Q1 correctly using matching default word translation
      const w1 = Data.DEFAULT_WORDS.find((w) => w.id === queueIds[0]);
      const ans1Res = await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuLogin.token}`
        },
        body: JSON.stringify({ action: 'answer', wordId: w1.id, userAnswer: w1.translation })
      });
      assert.equal(ans1Res.status, 200);
      const ans1Json = await ans1Res.json();
      assert.equal(ans1Json.finalExam.answeredCount, 1);
      assert.equal(ans1Json.finalExam.correctCount, 1);

      // Restart attempt while in_progress must preserve queue and existing answers
      const resumeRes = await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${stuLogin.token}`
        },
        body: JSON.stringify({ action: 'start', lessonScope: 'Lesson 2', categoryScope: 'ALL' })
      });
      assert.equal(resumeRes.status, 200);
      const resumeJson = await resumeRes.json();
      assert.equal(resumeJson.finalExam.answeredCount, 1);
      assert.deepEqual(resumeJson.finalExam.questionQueueIds, queueIds);

      // 2 warnings keep status in_progress; 3rd violation triggers cheating_locked
      const v1 = await (await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'violation', reason: 'Tab switched' })
      })).json();
      assert.equal(v1.finalExam.warningsCount, 1);
      assert.equal(v1.finalExam.status, 'in_progress');

      const v2 = await (await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'violation', reason: 'Paste blocked' })
      })).json();
      assert.equal(v2.finalExam.warningsCount, 2);
      assert.equal(v2.finalExam.status, 'in_progress');

      const v3 = await (await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'violation', reason: 'Focus lost' })
      })).json();
      assert.equal(v3.finalExam.warningsCount, 3);
      assert.equal(v3.finalExam.status, 'cheating_locked');
      assert.equal(v3.finalExam.cheatingFlags.length, 3);

      // Locked student is blocked (403) from starting or answering
      const lockedStartRes = await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'start', lessonScope: 'ALL', categoryScope: 'ALL' })
      });
      assert.equal(lockedStartRes.status, 403);

      // Teacher sees cheating_locked + answers + telemetry logs
      const teachState = await (await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${teachLogin.token}` }
      })).json();
      const observedProg = teachState.state.studentProgress[stuCreated.created.id];
      assert.equal(observedProg.finalExam.status, 'cheating_locked');
      assert.equal(observedProg.finalExam.answers.length, 1);
      assert.ok(teachState.state.studentActivityLog.some((l) => l.type === 'EXAM_CHEATING'));
      assert.ok(teachState.state.studentActivityLog.some((l) => l.type === 'EXAM_WARNING'));

      // Teacher approves retake -> unlocks back to not_started
      const approveRes = await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${teachLogin.token}`
        },
        body: JSON.stringify({ action: 'approveExamRetake', studentId: stuCreated.created.id })
      });
      assert.equal(approveRes.status, 200);
      const approveJson = await approveRes.json();
      const unlockedExam = approveJson.state.studentProgress[stuCreated.created.id].finalExam;
      assert.equal(unlockedExam.status, 'not_started');
      assert.equal(unlockedExam.retakeApprovedBy, 'teacher');

      // Student restarts cleanly and finishes all questions -> completed + locked against self-retake
      const retryStart = await (await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'start', lessonScope: firstLesson, categoryScope: 'ALL' })
      })).json();
      assert.equal(retryStart.ok, true);
      let finalExamOut = retryStart.finalExam;
      for (let i = 0; i < retryStart.finalExam.questionQueueIds.length; i++) {
        const w = Data.DEFAULT_WORDS.find((x) => x.id === retryStart.finalExam.questionQueueIds[i]);
        const ansRes = await fetch(`${baseUrl}/api/exam`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
          body: JSON.stringify({ action: 'answer', wordId: w.id, userAnswer: i < (expectedLessonCount - 1) ? w.translation : 'noto‘g‘ri' })
        });
        assert.equal(ansRes.status, 200);
        finalExamOut = (await ansRes.json()).finalExam;
      }
      assert.equal(finalExamOut.status, 'completed');
      assert.equal(finalExamOut.correctCount, expectedLessonCount - 1);
      assert.equal(finalExamOut.scorePct, Math.round(((expectedLessonCount - 1) / expectedLessonCount) * 100));

      // Completed exam also blocks self-restart with 403 until Teacher approves
      const secondTryRes = await fetch(`${baseUrl}/api/exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuLogin.token}` },
        body: JSON.stringify({ action: 'start', lessonScope: firstLesson, categoryScope: 'ALL' })
      });
      assert.equal(secondTryRes.status, 403);
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('Multi-IP access (0.0.0.0), CORS preflight, Sync server URL normalization & mobile paste space tolerance', async () => {
    assert.equal(Sync.normalizeServerBaseUrl('192.168.1.15:4175/'), 'http://192.168.1.15:4175');
    assert.equal(Sync.normalizeServerBaseUrl('https://edu.example.com/app/'), 'https://edu.example.com');
    assert.equal(Sync.normalizeServerBaseUrl('javascript:alert(1)'), '');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-multi-ip-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'MultiTeach#2026!');
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'it_manager', 'MultiAdmin#2026!');
    const stuRes = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'lanstu',
      fullName: 'LAN Student',
      group: 'LAN',
      password: 'LanStudent#2026!'
    }, now);
    seedState.students = stuRes.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuRes.created.id, now);
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath
    });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const addr = server.address();
    assert.equal(addr.address, '0.0.0.0');
    const port = addr.port;

    const nets = os.networkInterfaces();
    const lanIps = [];
    Object.keys(nets).forEach((name) => {
      (nets[name] || []).forEach((info) => {
        if (info && info.family === 'IPv4' && !info.internal) {
          lanIps.push(info.address);
        }
      });
    });

    try {
      // CORS preflight OPTIONS works for cross-IP/cross-port clients
      const optRes = await fetch(`http://127.0.0.1:${port}/api/login`, { method: 'OPTIONS' });
      assert.equal(optRes.status, 204);
      assert.equal(optRes.headers.get('access-control-allow-origin'), '*');
      assert.equal(getSecurityHeaders(true, true)['Cross-Origin-Opener-Policy'], 'same-origin');
      assert.equal(getSecurityHeaders(true, false)['Cross-Origin-Opener-Policy'], undefined);

      // Verify IT Manager password update via 127.0.0.1 and login from alternate origin/IP + mobile paste space
      const itRes = await fetch(`http://127.0.0.1:${port}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'it_manager', password: 'MultiAdmin#2026!' })
      });
      const itJson = await itRes.json();
      assert.equal(itJson.ok, true);

      const chgRes = await fetch(`http://127.0.0.1:${port}/api/security`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${itJson.token}`
        },
        body: JSON.stringify({
          action: 'changeRolePassword',
          targetRole: 'teacher',
          newPassword: 'UpdatedLanTeach#2026!'
        })
      });
      assert.equal(chgRes.status, 200);

      // Login from localhost origin with trailing pasted space
      const teachLocalhostRes = await fetch(`http://localhost:${port}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'UpdatedLanTeach#2026! ' })
      });
      assert.equal(teachLocalhostRes.status, 200);
      assert.equal((await teachLocalhostRes.json()).ok, true);

      // Login from first host LAN IPv4 address if reachable locally
      if (lanIps.length > 0) {
        try {
          const lanRes = await fetch(`http://${lanIps[0]}:${port}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'student', username: 'lanstu', password: 'LanStudent#2026! ' })
          });
          assert.equal(lanRes.status, 200);
          assert.equal((await lanRes.json()).ok, true);
        } catch (_) {
          // Host firewall/loopback routing may restrict local hairpinning in sandboxed environments
        }
      }
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('Perfected Pronunciation: US/UK IPA + syllables, Speech PCM->WAV wrapper & server /api/tts caching', async () => {
    // 1. Default words include US IPA, UK IPA, and syllable stress guide
    Data.DEFAULT_WORDS.forEach((w) => {
      assert.ok(w.phonetic && w.phonetic.startsWith('/'));
      assert.ok(w.phoneticUk && w.phoneticUk.startsWith('/'));
      assert.ok(w.syllables && w.syllables.length >= 3);
    });

    // 2. AiTxt parses compact pUk & syl keys from AI output cleanly
    const norm = AiTxt.normalizeAiEnrichedItems([{
      w: 'schedule',
      p: '/ˈskedʒ.uːl/',
      pUk: '/ˈʃedʒ.uːl/',
      syl: 'SKED·yool',
      pos: 'noun',
      tr: 'jadval',
      d: 'A plan of activities.',
      ex: ['Follow the **schedule**.', 'Check your **schedule**.'],
      syn: ['timetable'],
      ant: ['disorder'],
      m: 'sked-plan',
      lvl: 'B2'
    }], [{ word: 'schedule', lesson: '1-dars: Academic Foundations' }], {});
    assert.equal(norm[0].phonetic, '/ˈskedʒ.uːl/');
    assert.equal(norm[0].phoneticUk, '/ˈʃedʒ.uːl/');
    assert.equal(norm[0].syllables, 'SKED·yool');

    // 3. Speech PCM16->WAV & TTS config resolver
    const samplePcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
    const wav = Speech.pcm16ToWavUint8Array(samplePcm, 'audio/L16;codec=pcm;rate=24000');
    assert.equal(String.fromCharCode(wav[0], wav[1], wav[2], wav[3]), 'RIFF');
    assert.equal(String.fromCharCode(wav[8], wav[9], wav[10], wav[11]), 'WAVE');
    assert.equal(wav.length, 44 + samplePcm.length);

    const effShared = Speech.resolveEffectiveTtsConfig({ provider: 'openai', apiKey: 'sk-ai', ttsProvider: 'auto' }, 'en-GB');
    assert.equal(effShared.provider, 'openai');
    assert.equal(effShared.voice, 'fable');
    assert.equal(effShared.apiKey, 'sk-ai');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-tts-v6-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'TtsTeach#2026!');
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'it_manager', 'TtsAdmin#2026!');
    const stuRes = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'ttsstu',
      fullName: 'TTS Student',
      group: 'TTS',
      password: 'TtsStudent#2026!'
    }, now);
    seedState.students = stuRes.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuRes.created.id, now);
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    let ttsFetchCount = 0;
    let lastTtsReq = null;
    const mockTtsFetch = async (url, init) => {
      ttsFetchCount++;
      lastTtsReq = { url, init };
      if (String(url).includes('generativelanguage.googleapis.com')) {
        const fakePcmB64 = Buffer.from([10, 0, 20, 0, 30, 0, 40, 0, 50, 0, 60, 0, 70, 0, 80, 0, 90, 0, 100, 0, 110, 0, 120, 0, 130, 0, 140, 0, 150, 0, 160, 0]).toString('base64');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: fakePcmB64 } }]
              }
            }]
          })
        };
      }
      const fakeMp3 = Buffer.from('ID3_FAKE_MP3_STREAM_0123456789_0123456789');
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'audio/mpeg' : '') },
        arrayBuffer: async () => fakeMp3.buffer.slice(fakeMp3.byteOffset, fakeMp3.byteOffset + fakeMp3.byteLength)
      };
    };

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath,
      fetchImpl: mockTtsFetch
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      // Unauthenticated /api/tts blocked (401)
      assert.equal((await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'ubiquitous', accent: 'en-US' })
      })).status, 401);

      const itToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'it_manager', password: 'TtsAdmin#2026!' })
      })).json()).token;

      const stuToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', username: 'ttsstu', password: 'TtsStudent#2026!' })
      })).json()).token;

      // Without TTS key configured, returns clean 200 browser-fallback
      const fbRes = await (await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
        body: JSON.stringify({ text: 'ubiquitous', accent: 'en-US' })
      })).json();
      assert.equal(fbRes.mode, 'browser-fallback');

      // SSRF block on ttsCustomUrl
      const ssrfTts = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${itToken}` },
        body: JSON.stringify({
          aiConfig: { provider: 'deepseek', ttsProvider: 'custom', ttsCustomUrl: 'https://127.0.0.1/v1/audio/speech' }
        })
      });
      assert.equal(ssrfTts.status, 400);

      // IT Manager saves DeepSeek primary key + separate OpenAI TTS key
      const saveCfgRes = await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${itToken}` },
        body: JSON.stringify({
          aiConfig: {
            provider: 'deepseek',
            model: 'deepseek-chat',
            apiKey: 'sk-deepseek-secret-1111',
            ttsProvider: 'openai',
            ttsModel: 'gpt-4o-mini-tts',
            ttsApiKey: 'sk-openai-tts-secret-9999'
          }
        })
      });
      assert.equal(saveCfgRes.status, 200);
      const itCfgJson = await saveCfgRes.json();
      assert.equal(itCfgJson.state.aiConfig.hasTtsKey, true);
      assert.equal(itCfgJson.state.aiConfig.ttsApiKeyMasked, 'sk-o••••9999');

      // Student receives hasTtsKey: true but ZERO API keys or masked keys
      const stuState = (await (await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${stuToken}` }
      })).json()).state;
      assert.equal(stuState.aiConfig.hasTtsKey, true);
      assert.equal(stuState.aiConfig.ttsApiKey, '');
      assert.equal(stuState.aiConfig.ttsApiKeyMasked, '');

      // 1st TTS request hits upstream OpenAI TTS once and caches to data/tts-cache/
      const tts1Res = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
        body: JSON.stringify({ text: 'ubiquitous', accent: 'en-US' })
      });
      assert.equal(tts1Res.status, 200);
      assert.equal(tts1Res.headers.get('content-type'), 'audio/mpeg');
      assert.equal(tts1Res.headers.get('x-tts-source'), 'api');
      assert.equal(ttsFetchCount, 1);
      assert.ok(String(lastTtsReq.url).includes('https://api.openai.com/v1/audio/speech'));
      assert.equal(lastTtsReq.init.headers.Authorization, 'Bearer sk-openai-tts-secret-9999');

      // 2nd identical request MUST serve from disk cache with 0 new API calls
      const tts2Res = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
        body: JSON.stringify({ text: 'ubiquitous', accent: 'en-US' })
      });
      assert.equal(tts2Res.status, 200);
      assert.equal(tts2Res.headers.get('x-tts-source'), 'cache');
      assert.equal(ttsFetchCount, 1);

      // IT Manager tests Gemini TTS -> returns valid WAV bytes
      const gemTestRes = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${itToken}` },
        body: JSON.stringify({
          text: 'coherent',
          accent: 'en-GB',
          testConfig: { ttsProvider: 'gemini', ttsApiKey: 'AIzaTestGeminiKey' }
        })
      });
      assert.equal(gemTestRes.status, 200);
      assert.equal(gemTestRes.headers.get('content-type'), 'audio/wav');
      const gemBuf = Buffer.from(await gemTestRes.arrayBuffer());
      assert.equal(gemBuf.slice(0, 4).toString('ascii'), 'RIFF');
      assert.equal(gemBuf.slice(8, 12).toString('ascii'), 'WAVE');
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('Primary AI (DeepSeek first) pronunciation resolution: /api/pronounce batch & auto-first in /api/tts', async () => {
    let unitCalls = 0;
    const unitCache = {};
    const unitFetch = async (url, init) => {
      unitCalls++;
      assert.ok(String(url).includes('https://api.deepseek.com/chat/completions'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify([
                { w: 'ephemeral', p: '/ɪˈfem.ər.əl/', pUk: '/ɪˈfem.ər.əl/', syl: 'i·FEM·er·ul', say: 'i-fem-er-ul' }
              ])
            }
          }]
        })
      };
    };

    const unitRes1 = await AiTxt.resolvePronunciationWithAI(
      [Data.DEFAULT_WORDS[0], { word: 'ephemeral', translation: 'o‘tkinchi' }],
      { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-ds-unit' },
      { existingWords: Data.DEFAULT_WORDS, cache: unitCache, fetchImpl: unitFetch }
    );
    assert.equal(unitCalls, 1, 'Existing DB word must NOT be sent to DeepSeek; only missing word sent');
    assert.equal(unitRes1[1].phonetic, '/ɪˈfem.ər.əl/');
    assert.equal(unitRes1[1].syllables, 'i·FEM·er·ul');
    assert.equal(unitRes1[1].pronunciationNote, 'i-fem-er-ul');

    // Repeat call must use cache with 0 API calls
    await AiTxt.resolvePronunciationWithAI(
      [{ word: 'ephemeral' }],
      { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-ds-unit' },
      { existingWords: Data.DEFAULT_WORDS, cache: unitCache, fetchImpl: unitFetch }
    );
    assert.equal(unitCalls, 1);

    // Full server flow: Teacher batch DeepSeek pronounce + Student TTS auto-DeepSeek-first
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-ds-pron-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    const now = Date.now();
    let seedState = Storage.createDefaultState(now);
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'DsTeach#2026!');
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'it_manager', 'DsAdmin#2026!');
    const stuRes = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'dsstu',
      fullName: 'DS Student',
      group: 'DS',
      password: 'DsStudent#2026!'
    }, now);
    seedState.students = stuRes.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuRes.created.id, now);
    // Add two words with missing IPA/UK/syllables
    seedState = Storage.mergeImportedWords(seedState, [
      { word: 'ephemeral', translation: 'vaqtinchalik', lesson: '1-dars: Academic Foundations' },
      { word: 'ameliorate', translation: 'yaxshilamoq', lesson: '1-dars: Academic Foundations' }
    ], [], now).state;
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    const callOrder = [];
    const mockFetch = async (url, init) => {
      const u = String(url);
      if (u.includes('api.deepseek.com')) {
        callOrder.push('deepseek');
        const body = JSON.parse(init.body);
        const userMsg = body.messages[1].content;
        const results = [];
        if (userMsg.includes('ephemeral')) {
          results.push({ w: 'ephemeral', p: '/ɪˈfem.ər.əl/', pUk: '/ɪˈfem.ər.əl/', syl: 'i·FEM·er·ul', say: 'i-fem-er-ul' });
        }
        if (userMsg.includes('ameliorate')) {
          results.push({ w: 'ameliorate', p: '/əˈmiːl.jə.reɪt/', pUk: '/əˈmiː.li.ə.reɪt/', syl: 'uh·MEEL·yuh·rayt', say: 'uh-meel-yuh-reyt' });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: JSON.stringify(results) } }] })
        };
      }
      if (u.includes('api.openai.com/v1/audio/speech')) {
        callOrder.push('openai-tts');
        const fakeMp3 = Buffer.from('ID3_DS_FIRST_MP3_0123456789_0123456789');
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'audio/mpeg' },
          arrayBuffer: async () => fakeMp3.buffer.slice(fakeMp3.byteOffset, fakeMp3.byteOffset + fakeMp3.byteLength)
        };
      }
      throw new Error('Unexpected URL: ' + u);
    };

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath,
      fetchImpl: mockFetch
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const itToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'it_manager', password: 'DsAdmin#2026!' })
      })).json()).token;

      const teachToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'DsTeach#2026!' })
      })).json()).token;

      const stuToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', username: 'dsstu', password: 'DsStudent#2026!' })
      })).json()).token;

      // IT Manager saves DeepSeek primary key + OpenAI TTS key
      assert.equal((await fetch(`${baseUrl}/api/ai-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${itToken}` },
        body: JSON.stringify({
          aiConfig: {
            provider: 'deepseek',
            model: 'deepseek-chat',
            apiKey: 'sk-deepseek-primary-1111',
            ttsProvider: 'openai',
            ttsApiKey: 'sk-openai-tts-2222'
          }
        })
      })).status, 200);

      // Student bulk pronounce is forbidden (403)
      assert.equal((await fetch(`${baseUrl}/api/pronounce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
        body: JSON.stringify({ words: [{ word: 'ephemeral' }, { word: 'ameliorate' }] })
      })).status, 403);

      // Teacher triggers single-word DeepSeek pronounce on 'ephemeral' (without seeing API key!)
      const pRes = await (await fetch(`${baseUrl}/api/pronounce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teachToken}` },
        body: JSON.stringify({ words: [{ word: 'ephemeral' }] })
      })).json();
      assert.equal(pRes.ok, true);
      assert.equal(pRes.source, 'ai');
      assert.equal(pRes.provider, 'deepseek');
      assert.equal(pRes.updatedCount, 1);
      const updatedEph = pRes.state.words.find((w) => w.word === 'ephemeral');
      assert.equal(updatedEph.phonetic, '/ɪˈfem.ər.əl/');
      assert.equal(updatedEph.pronunciationNote, 'i-fem-er-ul');

      // Second call for 'ephemeral' hits DB (0 DeepSeek API calls)
      const dsBeforeRepeat = callOrder.filter((c) => c === 'deepseek').length;
      const pRes2 = await (await fetch(`${baseUrl}/api/pronounce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teachToken}` },
        body: JSON.stringify({ words: [{ word: 'ephemeral' }] })
      })).json();
      assert.equal(pRes2.source, 'db');
      assert.equal(callOrder.filter((c) => c === 'deepseek').length, dsBeforeRepeat);

      // Student requests audio TTS for 'ameliorate' (missing IPA): DeepSeek MUST run BEFORE OpenAI TTS!
      const orderStart = callOrder.length;
      const ttsRes = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
        body: JSON.stringify({ text: 'ameliorate', accent: 'en-GB' })
      });
      assert.equal(ttsRes.status, 200);
      assert.deepEqual(callOrder.slice(orderStart), ['deepseek', 'openai-tts']);

      // Verify DeepSeek saved 'ameliorate' IPA + syllables permanently in DB
      const stuStateAfter = (await (await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${stuToken}` }
      })).json()).state;
      const updatedAmel = stuStateAfter.words.find((w) => w.word === 'ameliorate');
      assert.equal(updatedAmel.phonetic, '/əˈmiːl.jə.reɪt/');
      assert.equal(updatedAmel.phoneticUk, '/əˈmiː.li.ə.reɪt/');
      assert.equal(updatedAmel.syllables, 'uh·MEEL·yuh·rayt');
      assert.equal(updatedAmel.pronunciationNote, 'uh-meel-yuh-reyt');
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('Open phone/LAN student self-registration (/api/register), /api/network-info & allowOpenSignup toggle', async () => {
    const defState = Storage.createDefaultState(Date.now());
    assert.equal(defState.settings.allowOpenSignup, true);
    assert.ok(getSecurityHeaders(true, true)['Content-Security-Policy'].includes("media-src 'self' blob: data:"));

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-open-reg-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    let seedState = Storage.createDefaultState(Date.now());
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'OpenTeach#2026!');
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath
    });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const health = await (await fetch(`${baseUrl}/api/health`)).json();
      assert.equal(health.ok, true);
      assert.equal(health.allowOpenSignup, true);

      // Any student on a phone can self-register openly
      const regRes = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Dilbek Phone',
          group: 'Mobile Class',
          username: 'dilbek_phone',
          password: 'PhoneUser#2026!'
        })
      });
      assert.equal(regRes.status, 200);
      const regJson = await regRes.json();
      assert.equal(regJson.ok, true);
      assert.equal(regJson.session.username, 'dilbek_phone');
      assert.ok(regJson.token);

      // Duplicate username is rejected cleanly (400)
      const dupRes = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: 'Another User',
          username: 'dilbek_phone',
          password: 'PhoneUser#2026!'
        })
      });
      assert.equal(dupRes.status, 400);

      // Student cannot read /api/network-info (403)
      assert.equal((await fetch(`${baseUrl}/api/network-info`, {
        headers: { 'Authorization': `Bearer ${regJson.token}` }
      })).status, 403);

      // Teacher sees new phone student & network URLs, and can close/reopen registration
      const teachToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'OpenTeach#2026!' })
      })).json()).token;

      const netInfo = await (await fetch(`${baseUrl}/api/network-info`, {
        headers: { 'Authorization': `Bearer ${teachToken}` }
      })).json();
      assert.equal(netInfo.ok, true);
      assert.ok(Array.isArray(netInfo.urls));

      const teachState = (await (await fetch(`${baseUrl}/api/state`, {
        headers: { 'Authorization': `Bearer ${teachToken}` }
      })).json()).state;
      assert.ok(teachState.students.some((s) => s.username === 'dilbek_phone'));

      // Teacher closes open signup -> /api/register blocked with 403
      const closeRes = await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teachToken}` },
        body: JSON.stringify({ action: 'setOpenSignup', allowOpenSignup: false })
      });
      assert.equal(closeRes.status, 200);
      assert.equal((await (await fetch(`${baseUrl}/api/health`)).json()).allowOpenSignup, false);
      assert.equal((await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Late Joiner', username: 'lateuser1', password: 'PhoneUser#2026!' })
      })).status, 403);

      // Reopen -> /api/register works again
      assert.equal((await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teachToken}` },
        body: JSON.stringify({ action: 'setOpenSignup', allowOpenSignup: true })
      })).status, 200);
      assert.equal((await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Late Joiner', username: 'lateuser1', password: 'PhoneUser#2026!' })
      })).status, 200);

      // Admin & Login HTML must not expose Server IP UI controls/cards, while retaining #toggleOpenSignupBtn
      const indexHtml = await (await fetch(`${baseUrl}/`)).text();
      assert.equal(indexHtml.includes('id="toggleServerUrlBtn"'), false);
      assert.equal(indexHtml.includes('id="loginServerConnectForm"'), false);
      assert.equal(indexHtml.includes('id="staffPhoneAccessCard"'), false);
      assert.equal(indexHtml.includes('id="networkUrlsList"'), false);
      assert.equal(indexHtml.includes('id="toggleOpenSignupBtn"'), true);
    } finally {
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  await testAsync('Exercise bugfixes: typing/exam grading, unique quiz/listening distractors, speech stop cleanup & UI markup', async () => {
    // 1. Exam Uzbek translation grading handles leading "...dan" placeholders and hyphen-vs-space variants
    assert.equal(Exam.gradeUzbekTranslation('kelib chiqmoq', '...dan kelib chiqmoq, ildiz otmoq').isCorrect, true);
    assert.equal(Exam.gradeUzbekTranslation('say harakat', 'astoydil harakat qilmoq, intilmoq; sa’y-harakat').isCorrect, true);
    assert.equal(Exam.gradeUzbekTranslation("sa'y harakat", 'astoydil harakat qilmoq; sa’y-harakat').isCorrect, true);

    // 2. Writing & Listening dictation English typing grading
    assert.equal(SRS.gradeEnglishTypingAnswer("o'clock", 'o’clock'), true);
    assert.equal(SRS.gradeEnglishTypingAnswer('a double edged sword', 'a double-edged sword'), true);
    assert.equal(SRS.gradeEnglishTypingAnswer('colour', 'color / colour'), true);
    assert.equal(SRS.gradeEnglishTypingAnswer('depend', 'depend (on)'), true);
    assert.equal(SRS.gradeEnglishTypingAnswer('endeavor.', 'endeavor'), true);
    assert.equal(SRS.gradeEnglishTypingAnswer('endevor', 'endeavor'), false);

    // 3. Quiz & Listening option builder prevents duplicate English words & duplicate translations, prefers primary scope
    const target = { id: 't1', word: 'run', translation: 'yugurmoq' };
    const dupWordSame = { id: 't2', word: 'Run', translation: 'boshqarmoq' };
    const dupTransSame = { id: 't3', word: 'sprint', translation: 'Yugurmoq' };
    const p1 = { id: 't4', word: 'mitigate', translation: 'yumshatmoq' };
    const p2 = { id: 't5', word: 'coherent', translation: 'izchil' };
    const f1 = { id: 't6', word: 'resilient', translation: 'bardoshli' };
    const picked = SRS.selectQuizDistractors(target, [target, dupWordSame, dupTransSame, p1, p2], [f1], 4);
    assert.equal(picked.length, 4);
    const wordsLower = new Set(picked.map((x) => x.word.toLowerCase()));
    const transLower = new Set(picked.map((x) => x.translation.toLowerCase()));
    assert.equal(wordsLower.size, 4);
    assert.equal(transLower.size, 4);
    assert.ok(wordsLower.has('mitigate') && wordsLower.has('coherent') && wordsLower.has('resilient'));

    // 4. Speech.stop cleanly fires pending onEnd once so speak button spinner never sticks
    let endCount = 0;
    Speech.stop();
    Speech.setRemoteTtsHandler(async () => new Promise(() => {}));
    const origAudio = global.Audio;
    global.Audio = function () {};
    try {
      Speech.speak('endeavor', { onEnd: () => { endCount++; } });
      Speech.stop();
      Speech.stop();
      assert.equal(endCount, 1);
    } finally {
      Speech.setRemoteTtsHandler(null);
      global.Audio = origAudio;
    }

    // 5. Exercise HTML & CSS regression markers
    const rootPath = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(rootPath, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(rootPath, 'css', 'styles.css'), 'utf8');
    assert.ok(html.includes('id="quizSummaryTitle"'));
    assert.ok(html.includes('id="writeSummaryTitle"'));
    assert.ok(html.includes('id="listenSummaryTitle"'));
    assert.ok(html.includes('id="writeWrongList"'));
    assert.ok(html.includes('id="listenWrongList"'));
    assert.ok(css.includes('.audio-speaking'));
    assert.ok(css.includes('justify-content: flex-start;'));
  });

  await testAsync('SPA DOM runtime test across all 5 exercise modes (Flashcards Space flip, Quiz preserve/summary, Writing Enter, Listening Dictation Enter, Exam confirm)', async () => {
    const rootPath = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(rootPath, 'index.html'), 'utf8');
    const appCode = fs.readFileSync(path.join(rootPath, 'js', 'app.js'), 'utf8');

    const byId = new Map();
    const allElements = [];

    function makeEl(tag, attrsStr) {
      const classes = new Set();
      const attrs = {};
      if (attrsStr) {
        const attrRe = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
        let m;
        while ((m = attrRe.exec(attrsStr)) !== null) {
          attrs[m[1]] = m[2];
        }
        if (attrs.class) {
          attrs.class.split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        }
      }
      const listeners = {};
      const children = [];
      let _innerHTML = '';
      const el = {
        tagName: String(tag || 'DIV').toUpperCase(),
        id: attrs.id || '',
        type: attrs.type || 'text',
        value: '',
        checked: false,
        disabled: false,
        hidden: false,
        textContent: '',
        style: {},
        scrollTop: 0,
        parentNode: null,
        children,
        get className() {
          return Array.from(classes).join(' ');
        },
        set className(val) {
          classes.clear();
          String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        },
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (x, f) => (typeof f === 'boolean' ? (f ? classes.add(x) : classes.delete(x)) : (classes.has(x) ? classes.delete(x) : classes.add(x))),
          contains: (x) => classes.has(x)
        },
        getAttribute: (k) => (k === 'class' ? Array.from(classes).join(' ') : (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null)),
        setAttribute: (k, v) => { attrs[k] = String(v); },
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        removeEventListener: (ev, fn) => { if (listeners[ev]) listeners[ev] = listeners[ev].filter((f) => f !== fn); },
        appendChild: (ch) => { ch.parentNode = el; children.push(ch); return ch; },
        removeChild: (ch) => { const idx = children.indexOf(ch); if (idx !== -1) children.splice(idx, 1); ch.parentNode = null; },
        focus: () => { doc.activeElement = el; },
        blur: () => { if (doc.activeElement === el) doc.activeElement = doc.body; },
        click: () => el.dispatchEvent({ type: 'click', target: el }),
        dispatchEvent: (rawEvt) => {
          const evt = Object.assign({
            target: el,
            currentTarget: el,
            defaultPrevented: false,
            _stopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this._stopped = true; }
          }, rawEvt || {});
          (listeners[evt.type] || []).slice().forEach((fn) => fn(evt));
          if (!evt._stopped && el !== doc) {
            doc.dispatchEvent(Object.assign({}, evt, { currentTarget: doc }));
          }
          return !evt.defaultPrevented;
        },
        querySelectorAll: (sel) => queryMatch(children, sel),
        querySelector: (sel) => queryMatch(children, sel)[0] || null,
        set innerHTML(val) {
          _innerHTML = String(val || '');
          children.length = 0;
          if (_innerHTML) {
            const subRe = /<(option|button|div|span|p|li|tr)\b([^>]*)>/gi;
            let sm;
            while ((sm = subRe.exec(_innerHTML)) !== null) {
              const child = makeEl(sm[1], sm[2]);
              children.push(child);
            }
          }
        },
        get innerHTML() { return _innerHTML; },
        reset: () => {}
      };
      if (el.id && !byId.has(el.id)) byId.set(el.id, el);
      allElements.push(el);
      return el;
    }

    function queryMatch(pool, selector) {
      const list = [];
      const seen = new Set();
      function walk(arr) {
        arr.forEach((node) => {
          if (!node || seen.has(node)) return;
          let matched = false;
          if (selector.startsWith('.')) {
            matched = node.classList.contains(selector.slice(1));
          } else if (selector.startsWith('[') && selector.endsWith(']')) {
            const inner = selector.slice(1, -1);
            const eqIdx = inner.indexOf('=');
            if (eqIdx === -1) matched = node.getAttribute(inner) !== null;
            else {
              const k = inner.slice(0, eqIdx);
              const v = inner.slice(eqIdx + 1).replace(/^"|"$/g, '');
              matched = node.getAttribute(k) === v;
            }
          } else {
            matched = node.tagName.toLowerCase() === selector.toLowerCase();
          }
          if (matched) {
            seen.add(node);
            list.push(node);
          }
          if (node.children && node.children.length) walk(node.children);
        });
      }
      walk(pool);
      return list;
    }

    const docListeners = {};
    const doc = {
      readyState: 'complete',
      hidden: false,
      fullscreenElement: null,
      documentElement: makeEl('html', ''),
      body: makeEl('body', ''),
      activeElement: null,
      getElementById: (id) => byId.get(id) || null,
      createElement: (tag) => makeEl(tag, ''),
      querySelectorAll: (sel) => queryMatch(allElements, sel),
      querySelector: (sel) => queryMatch(allElements, sel)[0] || null,
      hasFocus: () => true,
      addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
      removeEventListener: (ev, fn) => { if (docListeners[ev]) docListeners[ev] = docListeners[ev].filter((f) => f !== fn); },
      dispatchEvent: (rawEvt) => {
        const evt = Object.assign({
          target: doc.body,
          currentTarget: doc,
          defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {}
        }, rawEvt || {});
        (docListeners[evt.type] || []).slice().forEach((fn) => fn(evt));
        return !evt.defaultPrevented;
      }
    };

    const tagRe = /<(section|header|main|div|span|p|h1|h2|h3|h4|button|input|select|textarea|form|label|ul|tbody|kbd|i)\b([^>]*)>/gi;
    let tm;
    while ((tm = tagRe.exec(html)) !== null) {
      makeEl(tm[1], tm[2]);
    }

    const mockLS = createMockLocalStorage();
    const mockSS = createMockLocalStorage();
    let seedState = Storage.createDefaultState(Date.now());
    const stuCreated = Auth.createStudentAccount(seedState.students, 'it_manager', {
      username: 'domqa01',
      fullName: 'DOM QA Student',
      group: 'B2',
      password: 'DomQaPass#2026!'
    }, Date.now());
    seedState.students = stuCreated.students;
    seedState.studentProgress = Storage.ensureStudentProgress(seedState, stuCreated.created.id, Date.now());
    mockLS.setItem(Storage.STORAGE_KEY, JSON.stringify(seedState));

    const winListeners = {};
    const activeIntervals = new Set();
    const activeTimeouts = new Set();

    const sandboxWin = {
      SWESpeech: Object.assign({}, Speech, {
        speak: () => true,
        stop: () => {}
      }),
      SWESync: {
        isServerMode: () => false,
        isOpenSignupAllowed: () => true,
        startLocalListeners: () => {},
        notifyLocalTabs: () => {},
        detectServer: async () => false,
        onSyncUpdate: () => () => {}
      },
      document: doc,
      localStorage: mockLS,
      sessionStorage: mockSS,
      location: { protocol: 'http:', search: '' },
      getSelection: () => ({ toString: () => '' }),
      addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); },
      removeEventListener: (ev, fn) => { if (winListeners[ev]) winListeners[ev] = winListeners[ev].filter((f) => f !== fn); },
      setTimeout: (fn, ms) => { const t = setTimeout(() => { activeTimeouts.delete(t); fn(); }, Math.min(Number(ms) || 0, 10)); activeTimeouts.add(t); return t; },
      clearTimeout: (t) => { activeTimeouts.delete(t); clearTimeout(t); },
      setInterval: (fn, ms) => { const i = setInterval(fn, ms); activeIntervals.add(i); return i; },
      clearInterval: (i) => { activeIntervals.delete(i); clearInterval(i); },
      requestAnimationFrame: (fn) => fn(),
      Date, Math, Array, Object, String, Number, Boolean, Set, Map, JSON, Promise, RegExp, URL, Error, Blob,
      console
    };
    sandboxWin.window = sandboxWin;
    sandboxWin.globalThis = sandboxWin;

    try {
      ['default-data.js', 'srs.js', 'auth.js', 'exam.js', 'storage.js', 'ai-txt.js'].forEach((fname) => {
        vm.runInNewContext(fs.readFileSync(path.join(rootPath, 'js', fname), 'utf8'), sandboxWin);
      });
      vm.runInNewContext(appCode, sandboxWin);
      await new Promise((r) => setTimeout(r, 30));

      // Login as student domqa01
      byId.get('loginUsernameInput').value = 'domqa01';
      byId.get('loginPasswordInput').value = 'DomQaPass#2026!';
      byId.get('loginForm').dispatchEvent({ type: 'submit' });
      await new Promise((r) => setTimeout(r, 30));

      assert.equal(byId.get('view-login').classList.contains('hidden'), true);
      assert.equal(byId.get('view-dashboard').classList.contains('hidden'), false);

      // Navigate to Study (Mashqlar)
      const studyNav = doc.querySelector('[data-nav-view="study"]');
      studyNav.click();
      assert.equal(byId.get('view-study').classList.contains('hidden'), false);

      // 1. Flashcards: Space key on focused fcCardInner flips ONCE (no double-flip!)
      const fcCardInner = byId.get('fcCardInner');
      assert.equal(fcCardInner.classList.contains('is-flipped'), false);
      fcCardInner.dispatchEvent({ type: 'keydown', key: ' ', code: 'Space' });
      assert.equal(fcCardInner.classList.contains('is-flipped'), true, 'Space on fcCardInner must stay flipped');
      doc.querySelector('[data-srs-rate="good"]').click();
      assert.equal(fcCardInner.classList.contains('is-flipped'), false);

      // 2. Quiz: Answer Q1, press Enter -> advances to Savol 2/10, switch tab & return -> preserves Savol 2/10, summary ArrowRight does NOT inflate stats
      doc.querySelector('[data-study-mode="quiz"]').click();
      assert.equal(byId.get('quizProgressText').textContent, 'Savol 1 / 10');
      byId.get('quizOptionsGrid').children[0].click();
      doc.dispatchEvent({ type: 'keydown', key: 'Enter', target: doc.body });
      assert.equal(byId.get('quizProgressText').textContent, 'Savol 2 / 10');

      doc.querySelector('[data-nav-view="vocabulary"]').click();
      studyNav.click();
      assert.equal(byId.get('quizProgressText').textContent, 'Savol 2 / 10', 'Returning to Mashqlar must preserve unfinished Quiz');

      for (let qi = 1; qi < 10; qi++) {
        byId.get('quizOptionsGrid').children[0].click();
        doc.dispatchEvent({ type: 'keydown', key: 'Enter', target: doc.body });
      }
      assert.equal(byId.get('quizSummaryBox').classList.contains('hidden'), false);
      // Pressing ArrowRight on Summary must NOT re-emit QUIZ_FINISH
      doc.dispatchEvent({ type: 'keydown', key: 'ArrowRight', target: doc.body });
      doc.dispatchEvent({ type: 'keydown', key: 'ArrowRight', target: doc.body });
      const savedAfterQuiz = JSON.parse(mockLS.getItem(Storage.STORAGE_KEY));
      assert.equal(savedAfterQuiz.studentProgress[stuCreated.created.id].modeStats.quizCompleted, 1);

      // 3. Writing: Wrong answer + Enter to advance + wrongWords list populated
      doc.querySelector('[data-study-mode="writing"]').click();
      assert.equal(byId.get('writeProgressText').textContent, 'Mashq 1 / 10');
      byId.get('writeInput').value = 'wrongwordxyz';
      byId.get('writeForm').dispatchEvent({ type: 'submit' });
      assert.equal(byId.get('writeInput').disabled, true);
      doc.dispatchEvent({ type: 'keydown', key: 'Enter', target: doc.body });
      assert.equal(byId.get('writeProgressText').textContent, 'Mashq 2 / 10');
      for (let wi = 1; wi < 10; wi++) {
        byId.get('writeInput').value = 'wrongwordxyz';
        byId.get('writeForm').dispatchEvent({ type: 'submit' });
        doc.dispatchEvent({ type: 'keydown', key: 'ArrowRight', target: doc.body });
      }
      assert.equal(byId.get('writeSummaryBox').classList.contains('hidden'), false);
      assert.ok(byId.get('writeWrongList').children.length > 0);

      // 4. Listening Dictation: submit -> Enter advances to Audio 2 / 10
      doc.querySelector('[data-study-mode="listening"]').click();
      doc.querySelector('[data-listen-type="dictation"]').click();
      assert.equal(byId.get('listenProgressText').textContent, 'Audio 1 / 10');
      byId.get('listenDictationInput').value = 'testword';
      byId.get('listenDictationForm').dispatchEvent({ type: 'submit' });
      assert.equal(byId.get('listenDictationInput').disabled, true);
      doc.dispatchEvent({ type: 'keydown', key: 'Enter', target: doc.body });
      assert.equal(byId.get('listenProgressText').textContent, 'Audio 2 / 10');

      // 5. Final Closed Exam: Finish early button opens confirmation modal rather than abruptly terminating
      doc.querySelector('[data-study-mode="exam"]').click();
      byId.get('examAgreeCheck').checked = true;
      byId.get('examAgreeCheck').dispatchEvent({ type: 'change' });
      byId.get('examStartBtn').click();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(byId.get('examActiveCard').classList.contains('hidden'), false);
      byId.get('examFinishEarlyBtn').click();
      assert.equal(byId.get('confirmModal').classList.contains('hidden'), false, 'Finish early must open confirmation modal');
      const midExamState = JSON.parse(mockLS.getItem(Storage.STORAGE_KEY));
      assert.equal(midExamState.studentProgress[stuCreated.created.id].finalExam.status, 'in_progress');
      byId.get('confirmOkBtn').click();
      await new Promise((r) => setTimeout(r, 20));
      const endedExamState = JSON.parse(mockLS.getItem(Storage.STORAGE_KEY));
      assert.equal(endedExamState.studentProgress[stuCreated.created.id].finalExam.status, 'completed');

      byId.get('headerLogoutBtn').click();
      await new Promise((r) => setTimeout(r, 15));
    } finally {
      activeIntervals.forEach((id) => clearInterval(id));
      activeTimeouts.forEach((id) => clearTimeout(id));
    }
  });

  await testAsync('v5 Mobile Classroom Architecture: Cyrillic/Uzbek 1-step /api/student-join, optional PIN upgrade, /api/public-link & static protection', async () => {
    assert.equal(Auth.normalizeUsername('Азизбек Алиев'), 'azizbek_aliyev');
    assert.equal(Auth.normalizeUsername("O‘ktam G‘aniyev"), 'oktam_ganiyev');
    assert.equal(Auth.validateStudentPassword('2026', false).ok, true);
    assert.equal(Auth.validateStudentPassword('', true).ok, true);
    assert.equal(Auth.validateStudentPassword('12', false).ok, false);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swe-v5-mobile-'));
    const dataFilePath = path.join(tmpDir, 'db.json');
    const secretFilePath = path.join(tmpDir, '.secret');

    let seedState = Storage.createDefaultState(Date.now());
    seedState.auth = Auth.changeRolePassword(seedState.auth, 'it_manager', 'teacher', 'MobTeach#2026!');
    fs.writeFileSync(dataFilePath, JSON.stringify(seedState, null, 2), 'utf8');

    const server = createAppServer({
      rootDir: path.resolve(__dirname, '..'),
      dataFilePath,
      secretFilePath
    });
    server.setPublicUrl('https://classroom-demo.app.lhr.life', 'ready');
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const health = await (await fetch(`${baseUrl}/api/health`)).json();
      assert.equal(health.version, 5);
      assert.equal(health.publicUrl, 'https://classroom-demo.app.lhr.life');

      // Deployment files blocked from static exposure
      for (const blockedFile of ['/package.json', '/Dockerfile', '/render.yaml', '/start-server.bat']) {
        assert.equal((await fetch(`${baseUrl}${blockedFile}`)).status, 403);
      }

      // 1. Phone student enters in 1 tap using Cyrillic name & ZERO password
      const join1 = await (await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '84.54.70.11', 'Host': 'classroom-demo.app.lhr.life' },
        body: JSON.stringify({ username: 'Шоҳруҳ Каримов', password: '' })
      })).json();
      assert.equal(join1.ok, true);
      assert.equal(join1.mode, 'created');
      assert.equal(join1.session.username, 'shohruh_karimov');
      assert.ok(join1.token);

      // 2. Re-entering from phone resumes exact same account
      const join2 = await (await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shohruh_karimov', password: '' })
      })).json();
      assert.equal(join2.ok, true);
      assert.equal(join2.mode, 'login');
      assert.equal(join2.session.userId, join1.session.userId);

      // 3. Student sets a 4-digit PIN ('2026') -> locks profile against passwordless hijack
      const pinUpgrade = await (await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shohruh_karimov', password: '2026' })
      })).json();
      assert.equal(pinUpgrade.ok, true);

      const hijackAttempt = await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shohruh_karimov', password: '' })
      });
      assert.equal(hijackAttempt.status, 401);
      assert.equal((await hijackAttempt.json()).needsPassword, true);

      const validPinLogin = await (await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shohruh_karimov', password: '2026' })
      })).json();
      assert.equal(validPinLogin.ok, true);

      // 4. Student blocked from /api/public-link (403); Teacher gets publicUrl (200)
      assert.equal((await fetch(`${baseUrl}/api/public-link`, {
        headers: { 'Authorization': `Bearer ${validPinLogin.token}` }
      })).status, 403);

      const teachToken = (await (await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'teacher', password: 'MobTeach#2026!' })
      })).json()).token;

      const pubLink = await (await fetch(`${baseUrl}/api/public-link`, {
        headers: { 'Authorization': `Bearer ${teachToken}` }
      })).json();
      assert.equal(pubLink.ok, true);
      assert.equal(pubLink.publicUrl, 'https://classroom-demo.app.lhr.life');

      // 5. Closing open signup blocks new unknown students (403) while existing students still enter (200)
      await fetch(`${baseUrl}/api/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teachToken}` },
        body: JSON.stringify({ action: 'setOpenSignup', allowOpenSignup: false })
      });
      assert.equal((await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Yangi Talaba', password: '' })
      })).status, 403);
      assert.equal((await fetch(`${baseUrl}/api/student-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'shohruh_karimov', password: '2026' })
      })).status, 200);
    } finally {
      server.closeAllSse();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  console.log(`\nAll ${passed} test suites passed!`);
}

runAsyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
