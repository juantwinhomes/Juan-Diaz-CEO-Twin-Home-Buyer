'use strict';
// Lessons live as editable JSON files in content/lessons/. Add a file to add a module (see README).
// Answers are never sent to the browser before the learner submits her reasoning.
const fs = require('node:fs');
const path = require('node:path');
const { HttpError } = require('./lib/util');

const DIR = path.join(__dirname, '..', 'content', 'lessons');

function loadLessons() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort().map(f => {
    const m = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    for (const k of ['id', 'title', 'lesson_html', 'quiz', 'scenario', 'task', 'rubric']) {
      if (!m[k]) throw new Error(`Lesson file ${f} is missing "${k}".`);
    }
    m.quiz.forEach((q, i) => { if (!(q.answer >= 0 && q.answer < q.options.length)) throw new Error(`${f} question ${i + 1} has an invalid answer index.`); });
    return m;
  });
}

function getLesson(id) {
  const m = loadLessons().find(x => x.id === id);
  if (!m) throw new HttpError(404, 'Lesson not found.');
  return m;
}

/** Lesson without answers, explanations or scenario solution. */
function publicLesson(m) {
  return {
    ...m,
    quiz: m.quiz.map(({ q, options, policy }) => ({ q, options, policy })),
    scenario: { text_html: m.scenario.text_html, ask: m.scenario.ask },
  };
}

module.exports = { loadLessons, getLesson, publicLesson };
