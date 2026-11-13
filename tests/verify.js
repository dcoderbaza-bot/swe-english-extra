'use strict';

const assert = require('node:assert/strict');
const Data = require('../js/default-data.js');
const SRS = require('../js/srs.js');
const Storage = require('../js/storage.js');

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

test('Default dataset has 5 built-in categories and 15 rich B2/C1 words', () => {
  assert.equal(Data.DEFAULT_CATEGORIES.length, 5);
  assert.deepEqual(
    Data.DEFAULT_CATEGORIES.map((c) => c.name),
    ['IELTS', 'General English', 'Business', 'Phrasal Verbs', 'Idioms']
  );

  assert.equal(Data.DEFAULT_WORDS.length, 15);
  Data.DEFAULT_WORDS.forEach((w) => {
    assert.ok(w.word.length > 0, 'word missing');
    assert.ok(w.phonetic.startsWith('/'), `phonetic missing for ${w.word}`);
    assert.ok(w.partOfSpeech.length > 0, `POS missing for ${w.word}`);
    assert.ok(w.translation.length > 0, `translation missing for ${w.word}`);
    assert.ok(w.definition.length > 0, `definition missing for ${w.word}`);
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
  assert.equal(parsedRows[0].examples.length, 2);
  assert.ok(parsedRows[0].synonyms.includes('strive'));

  const customCsv = [
    'word,phonetic,partOfSpeech,translation,definition,example1,example2,synonyms,antonyms,mnemonic,category,level',
    '"meticulous","/məˈtɪk.jə.ləs/","adjective","juda sinchkov, puxta","Showing great attention to detail","She kept **meticulous** notes, even under pressure.","A **meticulous** audit caught the bug.","thorough; careful","careless; sloppy","Met + tick: har bir detalga belgi (tick) qo‘yish.","Academic","C1"',
    '"invalid-no-translation","","","","","","","","","","IELTS","B2"'
  ].join('\n');

  const imported = Storage.parseCSV(customCsv);
  const merged = Storage.mergeImportedWords(state, imported, null, now);
  assert.equal(merged.summary.added, 1);
  assert.equal(merged.summary.skipped, 1);
  assert.equal(merged.state.words.length, 16);
  assert.ok(merged.state.categories.some((c) => c.name === 'Academic'));

  const meticulous = merged.state.words.find((w) => w.word === 'meticulous');
  assert.equal(meticulous.translation, 'juda sinchkov, puxta');
  assert.equal(meticulous.examples[0], 'She kept **meticulous** notes, even under pressure.');

  const jsonBackup = JSON.parse(Storage.exportToJSON(merged.state));
  assert.equal(jsonBackup.app, 'SWE ENGLISH EXTRA');
  assert.equal(jsonBackup.words.length, 16);
});

console.log(`\nAll ${passed} test suites passed!`);
