/* ============ Storage keys ============ */
const STORAGE_KEYS = {
  decks: 'so_study_decks',
  apiKey: 'so_study_api_key',
  provider: 'so_study_api_provider',
};

/* Model IDs — edit here if a provider retires a model. */
const GEMINI_MODEL = 'gemini-2.0-flash';
const GROQ_MODEL = 'openai/gpt-oss-20b';

/* ============ Prompts ============ */
const PRESENTATION_CONTEXT = `The pasted text comes from a full Google Slides presentation for a middle-school Social Studies (Samhällsorientering) student. It usually has two parts:
1. An early/middle section of FACTS and explanations — this is the study content.
2. A final section of TEST QUESTIONS the teacher wrote to quiz the class on this material. These are often near the end and may already look like multiple-choice questions, or may be open questions without answer choices.

The text may contain slide numbers, repeated headers, stray line breaks, and other clutter from copy-pasting — ignore that noise.`;

const LANGUAGE_RULE = `CRITICAL RULE: First detect the language the source text is written in. Every part of your output — reasoning, flashcard fronts and backs, quiz questions, and quiz options — must be written in that EXACT same language. Never translate or switch to English (or any other language) unless the source text itself is in English.`;

const ANALYZE_PROMPT = `You are a study-planning assistant. ${PRESENTATION_CONTEXT}

${LANGUAGE_RULE}

Do not write any flashcards or quiz questions yet. Read the material and recommend how much study content it supports.

Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"reasoning":"one or two short sentences naming roughly what the material covers and why you recommend these counts","recommendedFlashcards":number,"recommendedQuiz":number}

Recommend enough flashcards to cover every distinct fact without repeating itself (typically 8-25), and a quiz count based on how many test questions actually appear in the text, or a reasonable number if none are explicit (typically 5-15).`;

const DIFFICULTY_NOTES = {
  easy: 'Difficulty level: EASY. Use simple, direct language a struggling student can follow. Flashcard answers should be short and unambiguous. Quiz questions should be straightforward recall questions with wrong options that are clearly, obviously distinct from the right one.',
  medium: 'Difficulty level: MEDIUM. Use standard middle-school test language and question difficulty, similar to what a teacher would normally ask.',
  hard: 'Difficulty level: HARD. Favor questions that require connecting two facts or explaining why/how something happened, not just recalling one isolated fact. Wrong options should be plausible and easy to confuse with the correct answer — tricky, but never unfair.',
};

function getGenerationPrompt(difficulty, flashcardCount, quizCount) {
  const note = DIFFICULTY_NOTES[difficulty] || DIFFICULTY_NOTES.medium;
  return `You are a study assistant that converts messy, copy-pasted text from a Google Slides presentation into study material for a middle-school Social Studies (Samhällsorientering) student. ${PRESENTATION_CONTEXT}

${LANGUAGE_RULE}

Your job:
1. From the FACTS section, write clear FLASHCARDS. Each has a short "front" (a question or term) and a concise "back" (the answer or fact). Do not copy full sentences verbatim — turn each fact into a testable question-and-answer pair. Write EXACTLY ${flashcardCount} flashcards.
2. From the TEST QUESTIONS section, write multiple-choice QUIZ questions. Each needs exactly 4 "options" and one "correctIndex" (0-3). If the source already gives answer choices, clean them up and use them. If it doesn't, write 3 plausible wrong answers alongside the correct one. If there is no clear test-question section, generate reasonable quiz questions from the facts instead. Write EXACTLY ${quizCount} quiz questions.
3. ${note}
4. Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"flashcards":[{"front":"string","back":"string"}],"quiz":[{"question":"string","options":["string","string","string","string"],"correctIndex":0}]}`;
}

/* ============ State ============ */
let state = {
  decks: [],
  flashcardSession: null,
  quizSession: null,
};
let deckPendingDelete = null;
let pendingGeneration = null; // { deckName, sourceText }
let currentDifficulty = 'medium';
let editDraft = null; // { id, name, flashcards: [...], quiz: [...] }

/* ============ DOM refs ============ */
const mainHeader = document.getElementById('mainHeader');
const settingsBtn = document.getElementById('settingsBtn');
const newDeckBtn = document.getElementById('newDeckBtn');
const deckList = document.getElementById('deckList');
const emptyState = document.getElementById('emptyState');

const generatorBackBtn = document.getElementById('generatorBackBtn');
const generatorStep1 = document.getElementById('generatorStep1');
const generatorStep2 = document.getElementById('generatorStep2');
const deckNameInput = document.getElementById('deckNameInput');
const pasteArea = document.getElementById('pasteArea');
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzeStatus = document.getElementById('analyzeStatus');

const reasoningBox = document.getElementById('reasoningBox');
const difficultyPills = document.getElementById('difficultyPills');
const flashcardCountInput = document.getElementById('flashcardCountInput');
const quizCountInput = document.getElementById('quizCountInput');
const generateBtn = document.getElementById('generateBtn');
const generateStatus = document.getElementById('generateStatus');

const flashcard = document.getElementById('flashcard');
const flashcardFront = document.getElementById('flashcardFront');
const flashcardBack = document.getElementById('flashcardBack');
const flashcardProgressFill = document.getElementById('flashcardProgressFill');
const flashcardProgressLabel = document.getElementById('flashcardProgressLabel');
const flashcardExitBtn = document.getElementById('flashcardExitBtn');
const wrongBtn = document.getElementById('wrongBtn');
const skipBtn = document.getElementById('skipBtn');
const rightBtn = document.getElementById('rightBtn');

const flashcardResultsStats = document.getElementById('flashcardResultsStats');
const flashcardRetryMissedBtn = document.getElementById('flashcardRetryMissedBtn');
const flashcardBackToLibraryBtn = document.getElementById('flashcardBackToLibraryBtn');

const quizExitBtn = document.getElementById('quizExitBtn');
const quizProgressFill = document.getElementById('quizProgressFill');
const quizProgressLabel = document.getElementById('quizProgressLabel');
const quizQuestion = document.getElementById('quizQuestion');
const quizOptions = document.getElementById('quizOptions');
const quizNextBtn = document.getElementById('quizNextBtn');

const quizResultsStats = document.getElementById('quizResultsStats');
const quizRetryBtn = document.getElementById('quizRetryBtn');
const quizBackToLibraryBtn = document.getElementById('quizBackToLibraryBtn');

const settingsModal = document.getElementById('settingsModal');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyHint = document.getElementById('apiKeyHint');
const settingsCancelBtn = document.getElementById('settingsCancelBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');

const deleteModal = document.getElementById('deleteModal');
const deleteModalText = document.getElementById('deleteModalText');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

const editModal = document.getElementById('editModal');
const editModalCloseBtn = document.getElementById('editModalCloseBtn');
const editDeckName = document.getElementById('editDeckName');
const editFlashcardList = document.getElementById('editFlashcardList');
const editQuizList = document.getElementById('editQuizList');
const addFlashcardBtn = document.getElementById('addFlashcardBtn');
const addQuizBtn = document.getElementById('addQuizBtn');
const editCancelBtn = document.getElementById('editCancelBtn');
const editSaveBtn = document.getElementById('editSaveBtn');

/* ============ View switching ============ */
const VIEWS = ['libraryView', 'generatorView', 'flashcardView', 'flashcardResultsView', 'quizView', 'quizResultsView'];
const STUDY_VIEWS = ['flashcardView', 'flashcardResultsView', 'quizView', 'quizResultsView'];

function showView(id) {
  VIEWS.forEach(v => { document.getElementById(v).hidden = v !== id; });
  mainHeader.hidden = STUDY_VIEWS.includes(id);
}

/* ============ Persistence ============ */
function loadDecks() {
  try {
    state.decks = JSON.parse(localStorage.getItem(STORAGE_KEYS.decks)) || [];
  } catch {
    state.decks = [];
  }
}

function saveDecks() {
  localStorage.setItem(STORAGE_KEYS.decks, JSON.stringify(state.decks));
}

/* ============ Helpers ============ */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

/* ============ Library ============ */
function renderLibrary() {
  deckList.innerHTML = '';
  emptyState.hidden = state.decks.length > 0;

  state.decks.forEach(deck => {
    const row = document.createElement('div');
    row.className = 'deck-card';
    row.innerHTML = `
      <div>
        <h3>${escapeHtml(deck.name)}</h3>
        <p class="deck-meta">${deck.flashcards.length} flashcards &middot; ${deck.quiz.length} quiz questions</p>
      </div>
      <div class="deck-actions">
        <button class="btn btn-small btn-primary" data-action="flashcards">Flashcards</button>
        <button class="btn btn-small btn-secondary" data-action="quiz">Quiz</button>
        <button class="btn btn-small btn-secondary" data-action="edit">Edit</button>
        <button class="btn btn-small btn-secondary" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="flashcards"]').addEventListener('click', () => startFlashcards(deck.id));
    row.querySelector('[data-action="quiz"]').addEventListener('click', () => startQuiz(deck.id));
    row.querySelector('[data-action="edit"]').addEventListener('click', () => openEditModal(deck.id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => confirmDelete(deck.id));
    deckList.appendChild(row);
  });
}

function confirmDelete(deckId) {
  const deck = state.decks.find(d => d.id === deckId);
  if (!deck) return;
  deckPendingDelete = deckId;
  deleteModalText.textContent = `This permanently deletes "${deck.name}" and everything in it.`;
  deleteModal.hidden = false;
}

deleteCancelBtn.addEventListener('click', () => { deleteModal.hidden = true; });
deleteConfirmBtn.addEventListener('click', () => {
  state.decks = state.decks.filter(d => d.id !== deckPendingDelete);
  saveDecks();
  renderLibrary();
  deleteModal.hidden = true;
});

/* ============ Shared JSON helpers ============ */
function extractJsonObject(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI response did not contain JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function findStudySet(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  if (Array.isArray(obj.flashcards) && Array.isArray(obj.quiz)) return obj;
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findStudySet(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function parseGenerateResponse(rawText) {
  const found = findStudySet(extractJsonObject(rawText));
  if (!found) throw new Error('The AI response was missing flashcards or quiz data.');
  return found;
}

function parseAnalyzeResponse(rawText) {
  const root = extractJsonObject(rawText);
  const reasoning = root.reasoning || root.analysis?.reasoning || '';
  const recommendedFlashcards = Math.round(Number(root.recommendedFlashcards ?? root.flashcards ?? 12)) || 12;
  const recommendedQuiz = Math.round(Number(root.recommendedQuiz ?? root.quiz ?? 6)) || 6;
  if (!reasoning) throw new Error('The AI response was missing a recommendation.');
  return { reasoning, recommendedFlashcards, recommendedQuiz };
}

/* ============ AI calls ============ */
async function callGemini(apiKey, systemPrompt, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

async function callGroq(apiKey, systemPrompt, userText) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('Groq returned an empty response.');
  return text;
}

async function callAI(systemPrompt, userText) {
  const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  const provider = localStorage.getItem(STORAGE_KEYS.provider) || 'gemini';
  if (!apiKey) throw new Error('Add an API key in Settings first.');
  return provider === 'groq' ? callGroq(apiKey, systemPrompt, userText) : callGemini(apiKey, systemPrompt, userText);
}

/* ============ Generator: navigation ============ */
newDeckBtn.addEventListener('click', () => {
  generatorStep1.hidden = false;
  generatorStep2.hidden = true;
  analyzeStatus.hidden = true;
  showView('generatorView');
});

generatorBackBtn.addEventListener('click', () => {
  if (!generatorStep2.hidden) {
    generatorStep2.hidden = true;
    generatorStep1.hidden = false;
  } else {
    showView('libraryView');
  }
});

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `generator-status ${type}`;
  el.hidden = false;
}

/* ============ Generator: step 1 -> analyze ============ */
async function analyzeContent() {
  const name = deckNameInput.value.trim();
  const text = pasteArea.value.trim();

  if (!localStorage.getItem(STORAGE_KEYS.apiKey)) { setStatus(analyzeStatus, 'Add an API key in Settings first.', 'error'); openSettings(); return; }
  if (!name) { setStatus(analyzeStatus, 'Give the deck a name first.', 'error'); return; }
  if (!text) { setStatus(analyzeStatus, 'Paste some presentation text first.', 'error'); return; }

  setStatus(analyzeStatus, 'Reading your material…', 'loading');
  analyzeBtn.disabled = true;

  try {
    const raw = await callAI(ANALYZE_PROMPT, text);
    const { reasoning, recommendedFlashcards, recommendedQuiz } = parseAnalyzeResponse(raw);

    pendingGeneration = { deckName: name, sourceText: text };
    reasoningBox.textContent = reasoning;
    flashcardCountInput.value = recommendedFlashcards;
    quizCountInput.value = recommendedQuiz;
    resetDifficultyPills();
    generateStatus.hidden = true;

    generatorStep1.hidden = true;
    generatorStep2.hidden = false;
  } catch (err) {
    console.error(err);
    setStatus(analyzeStatus, `Something went wrong: ${err.message}`, 'error');
  } finally {
    analyzeBtn.disabled = false;
  }
}

analyzeBtn.addEventListener('click', analyzeContent);

/* ============ Generator: step 2 -> difficulty pills ============ */
function resetDifficultyPills() {
  currentDifficulty = 'medium';
  [...difficultyPills.children].forEach(btn => btn.classList.toggle('pill-active', btn.dataset.diff === 'medium'));
}

difficultyPills.addEventListener('click', e => {
  const btn = e.target.closest('.pill-btn');
  if (!btn) return;
  currentDifficulty = btn.dataset.diff;
  [...difficultyPills.children].forEach(b => b.classList.toggle('pill-active', b === btn));
});

/* ============ Generator: step 3 -> generate ============ */
async function generateDeck() {
  if (!pendingGeneration) return;

  const flashcardCount = Math.min(50, Math.max(1, Math.round(Number(flashcardCountInput.value)) || 1));
  const quizCount = Math.min(30, Math.max(1, Math.round(Number(quizCountInput.value)) || 1));
  flashcardCountInput.value = flashcardCount;
  quizCountInput.value = quizCount;

  setStatus(generateStatus, 'Generating your deck — this can take up to 30 seconds…', 'loading');
  generateBtn.disabled = true;

  try {
    const prompt = getGenerationPrompt(currentDifficulty, flashcardCount, quizCount);
    const raw = await callAI(prompt, pendingGeneration.sourceText);
    const parsed = parseGenerateResponse(raw);

    const deck = {
      id: uid(),
      name: pendingGeneration.deckName,
      createdAt: Date.now(),
      flashcards: parsed.flashcards.map(f => ({ id: uid(), front: f.front, back: f.back })),
      quiz: parsed.quiz.map(q => ({ id: uid(), question: q.question, options: q.options, correctIndex: q.correctIndex })),
    };

    state.decks.push(deck);
    saveDecks();
    setStatus(generateStatus, `Created ${deck.flashcards.length} flashcards and ${deck.quiz.length} quiz questions.`, 'success');
    deckNameInput.value = '';
    pasteArea.value = '';
    pendingGeneration = null;
    renderLibrary();
    setTimeout(() => showView('libraryView'), 1000);
  } catch (err) {
    console.error(err);
    setStatus(generateStatus, `Something went wrong: ${err.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateDeck);

/* ============ Flashcard mode ============ */
function startFlashcards(deckId) {
  const deck = state.decks.find(d => d.id === deckId);
  if (!deck || deck.flashcards.length === 0) return;
  state.flashcardSession = {
    deckId,
    queue: shuffle([...deck.flashcards]),
    index: 0,
    correct: 0,
    wrong: 0,
    skipped: 0,
    missed: [],
  };
  showView('flashcardView');
  renderFlashcard();
}

function renderFlashcard() {
  const s = state.flashcardSession;
  const card = s.queue[s.index];
  flashcard.classList.remove('flipped');
  flashcardFront.textContent = card.front;
  flashcardBack.textContent = card.back;
  flashcardProgressLabel.textContent = `${s.index + 1} / ${s.queue.length}`;
  flashcardProgressFill.style.width = `${(s.index / s.queue.length) * 100}%`;
}

function flipFlashcard() { flashcard.classList.toggle('flipped'); }
flashcard.addEventListener('click', flipFlashcard);
flashcard.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipFlashcard(); } });

function markCard(result) {
  const s = state.flashcardSession;
  const card = s.queue[s.index];
  if (result === 'right') s.correct++;
  else if (result === 'wrong') { s.wrong++; s.missed.push(card); }
  else s.skipped++;

  if (s.index + 1 < s.queue.length) {
    s.index++;
    renderFlashcard();
  } else {
    flashcardProgressFill.style.width = '100%';
    showFlashcardResults();
  }
}

wrongBtn.addEventListener('click', () => markCard('wrong'));
skipBtn.addEventListener('click', () => markCard('skip'));
rightBtn.addEventListener('click', () => markCard('right'));

function showFlashcardResults() {
  const s = state.flashcardSession;
  flashcardResultsStats.innerHTML = `
    <div class="stat right">${s.correct} right</div>
    <div class="stat wrong">${s.wrong} wrong</div>
    <div class="stat">${s.skipped} skipped</div>
  `;
  flashcardRetryMissedBtn.hidden = s.missed.length === 0;
  showView('flashcardResultsView');
}

flashcardRetryMissedBtn.addEventListener('click', () => {
  const missed = state.flashcardSession.missed;
  state.flashcardSession = {
    deckId: state.flashcardSession.deckId,
    queue: shuffle([...missed]),
    index: 0, correct: 0, wrong: 0, skipped: 0, missed: [],
  };
  showView('flashcardView');
  renderFlashcard();
});

flashcardExitBtn.addEventListener('click', () => showView('libraryView'));
flashcardBackToLibraryBtn.addEventListener('click', () => showView('libraryView'));

/* ============ Quiz mode ============ */
function startQuiz(deckId) {
  const deck = state.decks.find(d => d.id === deckId);
  if (!deck || deck.quiz.length === 0) return;
  state.quizSession = {
    deckId,
    questions: shuffle([...deck.quiz]),
    index: 0,
    correct: 0,
    answered: false,
  };
  showView('quizView');
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const s = state.quizSession;
  const q = s.questions[s.index];
  s.answered = false;
  quizQuestion.textContent = q.question;
  quizOptions.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => selectOption(i));
    quizOptions.appendChild(btn);
  });
  quizNextBtn.hidden = true;
  quizProgressLabel.textContent = `${s.index + 1} / ${s.questions.length}`;
  quizProgressFill.style.width = `${(s.index / s.questions.length) * 100}%`;
}

function selectOption(i) {
  const s = state.quizSession;
  if (s.answered) return;
  s.answered = true;
  const q = s.questions[s.index];
  [...quizOptions.children].forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === q.correctIndex) btn.classList.add('correct');
    else if (idx === i) btn.classList.add('incorrect');
  });
  if (i === q.correctIndex) s.correct++;
  quizNextBtn.hidden = false;
}

quizNextBtn.addEventListener('click', () => {
  const s = state.quizSession;
  if (s.index + 1 < s.questions.length) {
    s.index++;
    renderQuizQuestion();
  } else {
    quizProgressFill.style.width = '100%';
    showQuizResults();
  }
});

function showQuizResults() {
  const s = state.quizSession;
  quizResultsStats.innerHTML = `<div class="stat right">${s.correct} / ${s.questions.length} correct</div>`;
  showView('quizResultsView');
}

quizRetryBtn.addEventListener('click', () => startQuiz(state.quizSession.deckId));
quizExitBtn.addEventListener('click', () => showView('libraryView'));
quizBackToLibraryBtn.addEventListener('click', () => showView('libraryView'));

/* ============ Settings ============ */
function updateApiKeyHint() {
  apiKeyHint.textContent = providerSelect.value === 'gemini'
    ? 'Get a free key at aistudio.google.com/apikey'
    : 'Get a free key at console.groq.com/keys';
}

function openSettings() {
  apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  providerSelect.value = localStorage.getItem(STORAGE_KEYS.provider) || 'gemini';
  updateApiKeyHint();
  settingsModal.hidden = false;
}

settingsBtn.addEventListener('click', openSettings);
providerSelect.addEventListener('change', updateApiKeyHint);
settingsCancelBtn.addEventListener('click', () => { settingsModal.hidden = true; });
settingsSaveBtn.addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.provider, providerSelect.value);
  settingsModal.hidden = true;
});

/* ============ Deck editing ============ */
function openEditModal(deckId) {
  const deck = state.decks.find(d => d.id === deckId);
  if (!deck) return;
  editDraft = {
    id: deck.id,
    createdAt: deck.createdAt,
    name: deck.name,
    flashcards: deck.flashcards.map(f => ({ ...f })),
    quiz: deck.quiz.map(q => ({ ...q, options: [...q.options] })),
  };
  editDeckName.value = editDraft.name;
  renderEditFlashcards();
  renderEditQuiz();
  editModal.hidden = false;
}

function closeEditModal() {
  editDraft = null;
  editModal.hidden = true;
}

editModalCloseBtn.addEventListener('click', closeEditModal);
editCancelBtn.addEventListener('click', closeEditModal);
editDeckName.addEventListener('input', () => { if (editDraft) editDraft.name = editDeckName.value; });

function renderEditFlashcards() {
  editFlashcardList.innerHTML = '';
  editDraft.flashcards.forEach(card => {
    const row = document.createElement('div');
    row.className = 'edit-item';
    row.innerHTML = `
      <div class="edit-item-row">
        <div class="edit-item-fields">
          <textarea rows="2" placeholder="Front (question/term)">${escapeHtml(card.front)}</textarea>
          <textarea rows="2" placeholder="Back (answer)">${escapeHtml(card.back)}</textarea>
        </div>
        <button type="button" class="edit-remove-btn" aria-label="Delete flashcard">&times;</button>
      </div>
    `;
    const [frontInput, backInput] = row.querySelectorAll('textarea');
    frontInput.addEventListener('input', e => { card.front = e.target.value; });
    backInput.addEventListener('input', e => { card.back = e.target.value; });
    row.querySelector('.edit-remove-btn').addEventListener('click', () => {
      editDraft.flashcards = editDraft.flashcards.filter(c => c.id !== card.id);
      renderEditFlashcards();
    });
    editFlashcardList.appendChild(row);
  });
}

addFlashcardBtn.addEventListener('click', () => {
  editDraft.flashcards.push({ id: uid(), front: '', back: '' });
  renderEditFlashcards();
});

function renderEditQuiz() {
  editQuizList.innerHTML = '';
  editDraft.quiz.forEach(q => {
    const row = document.createElement('div');
    row.className = 'edit-item';

    const optionsHtml = q.options.map((opt, i) => `
      <div class="edit-option-row">
        <input type="radio" name="correct-${q.id}" data-index="${i}" ${i === q.correctIndex ? 'checked' : ''}>
        <input type="text" data-index="${i}" value="${escapeHtml(opt)}" placeholder="Option ${i + 1}">
      </div>
    `).join('');

    row.innerHTML = `
      <div class="edit-item-row">
        <div class="edit-item-fields">
          <textarea rows="2" class="edit-question-input" placeholder="Question">${escapeHtml(q.question)}</textarea>
          <div class="edit-options-list">${optionsHtml}</div>
        </div>
        <button type="button" class="edit-remove-btn" aria-label="Delete question">&times;</button>
      </div>
    `;

    row.querySelector('.edit-question-input').addEventListener('input', e => { q.question = e.target.value; });
    row.querySelectorAll('.edit-option-row input[type="text"]').forEach(inp => {
      inp.addEventListener('input', e => { q.options[Number(e.target.dataset.index)] = e.target.value; });
    });
    row.querySelectorAll('.edit-option-row input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', e => { q.correctIndex = Number(e.target.dataset.index); });
    });
    row.querySelector('.edit-remove-btn').addEventListener('click', () => {
      editDraft.quiz = editDraft.quiz.filter(item => item.id !== q.id);
      renderEditQuiz();
    });

    editQuizList.appendChild(row);
  });
}

addQuizBtn.addEventListener('click', () => {
  editDraft.quiz.push({ id: uid(), question: '', options: ['', '', '', ''], correctIndex: 0 });
  renderEditQuiz();
});

editSaveBtn.addEventListener('click', () => {
  if (!editDraft) return;
  const name = editDraft.name.trim();
  if (!name) { editDeckName.focus(); return; }

  const cleanFlashcards = editDraft.flashcards
    .map(c => ({ id: c.id, front: c.front.trim(), back: c.back.trim() }))
    .filter(c => c.front && c.back);

  const cleanQuiz = editDraft.quiz
    .map(q => ({ id: q.id, question: q.question.trim(), options: q.options.map(o => o.trim()), correctIndex: q.correctIndex }))
    .filter(q => q.question && q.options.length === 4 && q.options.every(o => o));

  const idx = state.decks.findIndex(d => d.id === editDraft.id);
  if (idx !== -1) {
    state.decks[idx] = { ...state.decks[idx], name, flashcards: cleanFlashcards, quiz: cleanQuiz };
    saveDecks();
  }
  renderLibrary();
  closeEditModal();
});

/* ============ Init ============ */
loadDecks();
renderLibrary();
showView('libraryView');
