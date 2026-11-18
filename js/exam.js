/**
 * SWE ENGLISH EXTRA — Closed Final Vocabulary Exam & Anti-Cheat Proctoring Engine
 * Shared by Browser SPA, Node.js HTTP Server (server.js), and Verification Suite (tests/verify.js).
 */
(function (root) {
  'use strict';

  const MAX_WARNINGS = 2;

  function createEmptyFinalExam() {
    return {
      status: 'not_started', // 'not_started' | 'in_progress' | 'completed' | 'cheating_locked'
      lessonScope: 'ALL',
      categoryScope: 'ALL',
      totalQuestions: 0,
      answeredCount: 0,
      correctCount: 0,
      scorePct: null,
      warningsCount: 0,
      cheatingFlags: [],
      questionQueueIds: [],
      answers: [],
      startedAt: null,
      finishedAt: null,
      retakeApprovedAt: null,
      retakeApprovedBy: ''
    };
  }

  function normalizeExamRecord(raw) {
    const base = createEmptyFinalExam();
    if (!raw || typeof raw !== 'object') return base;
    return {
      status: ['not_started', 'in_progress', 'completed', 'cheating_locked'].indexOf(raw.status) !== -1
        ? raw.status
        : 'not_started',
      lessonScope: String(raw.lessonScope || 'ALL'),
      categoryScope: String(raw.categoryScope || 'ALL'),
      totalQuestions: Number(raw.totalQuestions) || 0,
      answeredCount: Number(raw.answeredCount) || 0,
      correctCount: Number(raw.correctCount) || 0,
      scorePct: raw.scorePct !== null && raw.scorePct !== undefined && !isNaN(Number(raw.scorePct))
        ? Number(raw.scorePct)
        : null,
      warningsCount: Number(raw.warningsCount) || 0,
      cheatingFlags: Array.isArray(raw.cheatingFlags) ? raw.cheatingFlags.slice(0, 30) : [],
      questionQueueIds: Array.isArray(raw.questionQueueIds) ? raw.questionQueueIds.slice(0, 500) : [],
      answers: Array.isArray(raw.answers) ? raw.answers.slice(0, 500) : [],
      startedAt: raw.startedAt || null,
      finishedAt: raw.finishedAt || null,
      retakeApprovedAt: raw.retakeApprovedAt || null,
      retakeApprovedBy: String(raw.retakeApprovedBy || '')
    };
  }

  function normalizeUzbekAnswer(str) {
    return String(str === undefined || str === null ? '' : str)
      .toLowerCase()
      .replace(/[\u2018\u2019\u02BB\u02BC\u02B9\u02BD`´]/g, "'")
      .replace(/[.,!?;:"()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripApostrophesAndHyphens(str) {
    return normalizeUzbekAnswer(str).replace(/['\-–—]/g, '').replace(/\s+/g, ' ').trim();
  }

  function extractAcceptedUzbekVariants(expectedTranslation) {
    const raw = String(expectedTranslation || '');
    const variants = [];
    const seen = new Set();

    function pushVariant(candidate) {
      const norm = normalizeUzbekAnswer(candidate);
      if (norm && norm.length >= 2 && !seen.has(norm)) {
        seen.add(norm);
        variants.push(norm);
      }
    }

    pushVariant(raw);
    const noParens = raw.replace(/\([^)]*\)/g, ' ');
    pushVariant(noParens);

    [raw, noParens].forEach(function (src) {
      src.split(/[;,/]+/).forEach(function (part) {
        pushVariant(part);
      });
    });

    return variants;
  }

  function gradeUzbekTranslation(userAnswer, expectedTranslation) {
    const normUser = normalizeUzbekAnswer(userAnswer);
    if (!normUser || normUser.length < 2) {
      return { isCorrect: false, matchedVariant: '' };
    }

    const variants = extractAcceptedUzbekVariants(expectedTranslation);
    for (let i = 0; i < variants.length; i++) {
      if (normUser === variants[i]) {
        return { isCorrect: true, matchedVariant: variants[i] };
      }
    }

    // Fallback: tolerate missing/extra apostrophes or hyphens (e.g. o'zlashtirmoq vs ozlashtirmoq)
    const strippedUser = stripApostrophesAndHyphens(userAnswer);
    if (strippedUser.length >= 4) {
      for (let j = 0; j < variants.length; j++) {
        if (strippedUser === stripApostrophesAndHyphens(variants[j])) {
          return { isCorrect: true, matchedVariant: variants[j] };
        }
      }
    }

    return { isCorrect: false, matchedVariant: '' };
  }

  function shuffleIds(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function buildFinalExamQueue(words, lessonScope, categoryScope) {
    const lScope = String(lessonScope || 'ALL');
    const cScope = String(categoryScope || 'ALL');
    const filtered = (Array.isArray(words) ? words : []).filter(function (w) {
      if (!w || !w.id || !w.word || !w.translation) return false;
      if (lScope !== 'ALL' && (w.lesson || '') !== lScope) return false;
      if (cScope !== 'ALL' && (w.category || '') !== cScope) return false;
      return true;
    });
    return shuffleIds(filtered.map(function (w) { return w.id; }));
  }

  function getDeps() {
    let storageMod = (root && root.SWEStorage) || null;
    let authMod = (root && root.SWEAuth) || null;
    if (!storageMod && typeof require === 'function') {
      storageMod = require('./storage.js');
    }
    if (!authMod && typeof require === 'function') {
      authMod = require('./auth.js');
    }
    return { storageMod: storageMod, authMod: authMod };
  }

  function applyExamAction(state, studentSession, payload, now) {
    if (!studentSession || studentSession.role !== 'student' || !studentSession.userId) {
      const authErr = new Error('Yakuniy test natijasi faqat o‘quvchi sessiyasida yoziladi.');
      authErr.statusCode = 403;
      throw authErr;
    }

    const deps = getDeps();
    const ts = typeof now === 'number' ? now : Date.now();
    const body = payload || {};
    const action = String(body.action || '');
    const studentId = studentSession.userId;

    const nextProgress = deps.storageMod.ensureStudentProgress(state, studentId, ts);
    const curStudentProg = nextProgress[studentId];
    let exam = normalizeExamRecord(curStudentProg.finalExam);
    let logPayload = null;

    if (action === 'start') {
      if (exam.status === 'cheating_locked') {
        const lockErr = new Error('Cheating sababli yakuniy test bloklangan! Qayta topshirish uchun O‘qituvchidan ruxsat oling.');
        lockErr.statusCode = 403;
        lockErr.code = 'CHEATING_LOCKED';
        throw lockErr;
      }
      if (exam.status === 'completed') {
        const doneErr = new Error('Yakuniy yopiq test allaqachon topshirilgan! Qayta topshirish uchun O‘qituvchidan ruxsat oling.');
        doneErr.statusCode = 403;
        doneErr.code = 'EXAM_ALREADY_COMPLETED';
        throw doneErr;
      }
      if (exam.status === 'in_progress' && exam.questionQueueIds.length > 0) {
        // Prevent resetting warnings/answers via reload during an active closed exam
        return { state: state, finalExam: exam };
      }

      const lessonScope = String(body.lessonScope || 'ALL');
      const categoryScope = String(body.categoryScope || 'ALL');
      const queueIds = buildFinalExamQueue(state.words, lessonScope, categoryScope);
      if (queueIds.length === 0) {
        const emptyErr = new Error('Tanlangan darslik/kategoriyada test uchun so‘z topilmadi.');
        emptyErr.statusCode = 400;
        throw emptyErr;
      }

      exam = Object.assign(createEmptyFinalExam(), {
        status: 'in_progress',
        lessonScope: lessonScope,
        categoryScope: categoryScope,
        totalQuestions: queueIds.length,
        answeredCount: 0,
        correctCount: 0,
        scorePct: 0,
        warningsCount: 0,
        cheatingFlags: [],
        questionQueueIds: queueIds,
        answers: [],
        startedAt: ts,
        finishedAt: null,
        retakeApprovedAt: exam.retakeApprovedAt || null,
        retakeApprovedBy: exam.retakeApprovedBy || ''
      });

      logPayload = {
        type: 'EXAM_START',
        view: 'study',
        mode: 'exam',
        lesson: lessonScope !== 'ALL' ? lessonScope : '',
        detail: 'Yakuniy yopiq testni boshladi (' + queueIds.length + ' ta so‘z)'
      };
    } else if (action === 'answer') {
      if (exam.status === 'cheating_locked') {
        const lockErr = new Error('Test CHEATING sababli bloklangan!');
        lockErr.statusCode = 403;
        lockErr.code = 'CHEATING_LOCKED';
        throw lockErr;
      }
      if (exam.status !== 'in_progress') {
        const stateErr = new Error('Faol yakuniy test sessiyasi topilmadi.');
        stateErr.statusCode = 400;
        throw stateErr;
      }

      const wordId = String(body.wordId || '');
      const wordObj = (state.words || []).find(function (w) { return w.id === wordId; });
      if (!wordObj) {
        const missingErr = new Error('So‘z topilmadi.');
        missingErr.statusCode = 404;
        throw missingErr;
      }

      // Prevent duplicate submission for the same question
      const alreadyAnswered = exam.answers.some(function (a) { return a.wordId === wordId; });
      if (!alreadyAnswered) {
        const userAnswer = String(body.userAnswer || '').trim();
        const grade = gradeUzbekTranslation(userAnswer, wordObj.translation);
        exam.answers.push({
          wordId: wordObj.id,
          word: wordObj.word,
          expectedTranslation: wordObj.translation,
          userAnswer: userAnswer,
          isCorrect: grade.isCorrect
        });
        exam.answeredCount = exam.answers.length;
        exam.correctCount = exam.answers.filter(function (a) { return a.isCorrect; }).length;
        exam.scorePct = Math.round((exam.correctCount / Math.max(1, exam.totalQuestions)) * 100);

        const completedNow = exam.answeredCount >= exam.totalQuestions;
        if (completedNow) {
          exam.status = 'completed';
          exam.finishedAt = ts;
        }

        logPayload = {
          type: completedNow ? 'EXAM_COMPLETE' : 'EXAM_ANSWER',
          view: 'study',
          mode: 'exam',
          word: wordObj.word,
          isCorrect: grade.isCorrect,
          writingCorrectDelta: grade.isCorrect ? 1 : 0,
          writingTotalDelta: 1,
          writingFinished: completedNow,
          countAsStudyActivity: true,
          detail: completedNow
            ? ('Yakuniy yopiq testni yakunladi: ' + exam.correctCount + '/' + exam.totalQuestions + ' (' + exam.scorePct + '%)')
            : ('Yakuniy test: "' + wordObj.word + '" -> ' + (grade.isCorrect ? 'to‘g‘ri' : 'xato'))
        };
      }
    } else if (action === 'violation') {
      if (exam.status !== 'in_progress') {
        return { state: state, finalExam: exam };
      }

      const reason = String(body.reason || 'Qoidabuzarlik aniqlandi').trim().slice(0, 180);
      exam.warningsCount = Number(exam.warningsCount || 0) + 1;
      exam.cheatingFlags.push({
        warningNumber: exam.warningsCount,
        reason: reason,
        timestamp: ts
      });

      if (exam.warningsCount > MAX_WARNINGS) {
        exam.status = 'cheating_locked';
        exam.finishedAt = ts;
        exam.scorePct = exam.totalQuestions > 0
          ? Math.round((exam.correctCount / exam.totalQuestions) * 100)
          : 0;
        logPayload = {
          type: 'EXAM_CHEATING',
          view: 'study',
          mode: 'exam',
          isCorrect: false,
          detail: 'CHEATING BLOKLANDI (' + exam.warningsCount + ' qoidabuzarlik): ' + reason
        };
      } else {
        logPayload = {
          type: 'EXAM_WARNING',
          view: 'study',
          mode: 'exam',
          isCorrect: false,
          detail: 'Ogohlantirish #' + exam.warningsCount + '/' + MAX_WARNINGS + ': ' + reason
        };
      }
    } else if (action === 'finish') {
      if (exam.status === 'in_progress') {
        exam.status = 'completed';
        exam.finishedAt = ts;
        exam.scorePct = exam.totalQuestions > 0
          ? Math.round((exam.correctCount / exam.totalQuestions) * 100)
          : 0;
        logPayload = {
          type: 'EXAM_COMPLETE',
          view: 'study',
          mode: 'exam',
          writingFinished: true,
          detail: 'Yakuniy yopiq testni yakunladi: ' + exam.correctCount + '/' + exam.totalQuestions + ' (' + exam.scorePct + '%)'
        };
      }
    } else {
      const badActionErr = new Error('Noma’lum yakuniy test amali.');
      badActionErr.statusCode = 400;
      throw badActionErr;
    }

    nextProgress[studentId] = Object.assign({}, curStudentProg, {
      finalExam: exam
    });

    let nextState = Object.assign({}, state, {
      studentProgress: nextProgress
    });

    if (logPayload) {
      nextState = deps.storageMod.recordStudentEvent(nextState, studentSession, logPayload, ts);
    }

    return {
      state: nextState,
      finalExam: exam
    };
  }

  function approveExamRetake(state, actorRole, studentId, now) {
    const deps = getDeps();
    if (!deps.authMod || !deps.authMod.canManageStudents(actorRole)) {
      const err = new Error('Qayta topshirishga ruxsat faqat Teacher yoki IT Manager tomonidan beriladi.');
      err.statusCode = 403;
      throw err;
    }

    const students = Array.isArray(state && state.students) ? state.students : [];
    const targetStudent = students.find(function (s) { return s.id === studentId; });
    if (!targetStudent) {
      const notFoundErr = new Error('O‘quvchi topilmadi.');
      notFoundErr.statusCode = 404;
      throw notFoundErr;
    }

    const ts = typeof now === 'number' ? now : Date.now();
    const nextProgress = deps.storageMod.ensureStudentProgress(state, studentId, ts);
    const curProg = nextProgress[studentId];

    const resetExam = Object.assign(createEmptyFinalExam(), {
      status: 'not_started',
      retakeApprovedAt: ts,
      retakeApprovedBy: String(actorRole || 'teacher')
    });

    nextProgress[studentId] = Object.assign({}, curProg, {
      finalExam: resetExam
    });

    const nextAudit = deps.authMod.appendAuditLog(
      state.auditLog,
      actorRole,
      'EXAM_RETAKE_APPROVED',
      'Yakuniy testni qayta topshirishga ruxsat berildi: ' + targetStudent.fullName + ' (@' + targetStudent.username + ')',
      ts
    );

    const logList = Array.isArray(state.studentActivityLog) ? state.studentActivityLog.slice() : [];
    logList.unshift({
      id: 'act-' + ts + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: ts,
      studentId: targetStudent.id,
      username: targetStudent.username,
      fullName: targetStudent.fullName,
      group: targetStudent.group || 'General',
      type: 'EXAM_RETAKE_APPROVED',
      view: 'study',
      mode: 'exam',
      lesson: '',
      word: '',
      isCorrect: true,
      detail: 'Ustoz (' + ((deps.authMod.ROLE_META[actorRole] && deps.authMod.ROLE_META[actorRole].label) || actorRole) + ') qayta topshirishga ruxsat berdi'
    });

    const nextState = Object.assign({}, state, {
      studentProgress: nextProgress,
      auditLog: nextAudit,
      studentActivityLog: logList.slice(0, 300)
    });

    return {
      state: nextState,
      finalExam: resetExam,
      student: targetStudent
    };
  }

  const api = {
    MAX_WARNINGS: MAX_WARNINGS,
    createEmptyFinalExam: createEmptyFinalExam,
    normalizeExamRecord: normalizeExamRecord,
    normalizeUzbekAnswer: normalizeUzbekAnswer,
    extractAcceptedUzbekVariants: extractAcceptedUzbekVariants,
    gradeUzbekTranslation: gradeUzbekTranslation,
    buildFinalExamQueue: buildFinalExamQueue,
    applyExamAction: applyExamAction,
    approveExamRetake: approveExamRetake
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SWEExam = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
