/* ============ Storage keys ============ */
const STORAGE_KEYS = {
  decks: 'so_study_decks',
  apiKey: 'so_study_api_key',
  provider: 'so_study_api_provider',
};

/* Model IDs — edit here if a provider retires a model. */
const GEMINI_MODEL = 'gemini-2.0-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a study assistant that converts messy, copy-pasted text from a Google Slides presentation into study material for a middle-school Social Studies (Samhällsorientering) student.

The pasted text comes from a full presentation. It usually has two parts:
1. An early/middle section of FACTS and explanations — this is the study content.
2. A final section of TEST QUESTIONS the teacher wrote to quiz the class on this material. These are often near the end and may already look like multiple-choice questions, or may be open questions without answer choices.

The text may contain slide numbers, repeated headers, stray line breaks, and other clutter from copy-pasting — ignore that noise.

Your job:
1. From the FACTS section, write clear FLASHCARDS. Each has a short "front" (a question or term) and a concise "back" (the answer or fact). Do not copy full sentences verbatim — turn each fact into a testable question-and-answer pair. Create as many as the material supports, typically 10-25.
2. From the TEST QUESTIONS section, write multiple-choice QUIZ questions. Each needs exactly 4 "options" and one "correctIndex" (0-3). If the source already gives answer choices, clean them up and use them. If it doesn't, write 3 plausible, reasonable wrong answers alongside the correct one — not silly or obviously wrong. If there is no clear test-question section, generate reasonable quiz questions from the facts instead.
3. Write flashcards and quiz questions in the same language as the source text.
4. Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{"flashcards":[{"front":"string","back":"string"}],"quiz":[{"question":"string","options":["string","string","string","string"],"correctIndex":0}]}`;

/* ============ State ============ */
let state = {
  decks: [],
  flashcardSession: null,
  quizSession: null,
};
let deckPendingDelete = null;

/* ============ DOM refs ============ */
const mainHeader = document.getElementById('mainHeader');
const settingsBtn = document.getElementById('settingsBtn');
const newDeckBtn = document.getElementById('newDeckBtn');
const deckList = document.getElementById('deckList');
const emptyState = document.getElementById('emptyState');

const generatorBackBtn = document.getElementById('generatorBackBtn');
const deckNameInput = document.getElementById('deckNameInput');
const pasteArea = document.getElementById('pasteArea');
const generateBtn = document.getElementById('generateBtn');
const generatorStatus = document.getElementById('generatorStatus');

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
        <button class="btn btn-small btn-secondary" data-action="delete">Delete</button>
      </div>
    `;
    row.querySelector('[data-action="flashcards"]').addEventListener('click', () => startFlashcards(deck.id));
    row.querySelector('[data-action="quiz"]').addEventListener('click', () => startQuiz(deck.id));
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

/* ============ Generator ============ */
newDeckBtn.addEventListener('click', () => {
  generatorStatus.hidden = true;
  showView('generatorView');
});
generatorBackBtn.addEventListener('click', () => showView('libraryView'));

function setGeneratorStatus(msg, type) {
  generatorStatus.textContent = msg;
  generatorStatus.className = `generator-status ${type}`;
  generatorStatus.hidden = false;
}

function parseAIResponse(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('The AI response did not contain JSON.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed.flashcards) || !Array.isArray(parsed.quiz)) {
    throw new Error('The AI response was missing flashcards or quiz data.');
  }
  return parsed;
}

async function callGemini(apiKey, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

async function callGroq(apiKey, userText) {
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
        { role: 'system', content: SYSTEM_PROMPT },
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

async function generateDeck() {
  const name = deckNameInput.value.trim();
  const text = pasteArea.value.trim();
  const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  const provider = localStorage.getItem(STORAGE_KEYS.provider) || 'gemini';

  if (!apiKey) { setGeneratorStatus('Add an API key in Settings first.', 'error'); openSettings(); return; }
  if (!name) { setGeneratorStatus('Give the deck a name first.', 'error'); return; }
  if (!text) { setGeneratorStatus('Paste some presentation text first.', 'error'); return; }

  setGeneratorStatus('Generating your deck — this can take up to 30 seconds…', 'loading');
  generateBtn.disabled = true;

  try {
    const raw = provider === 'groq' ? await callGroq(apiKey, text) : await callGemini(apiKey, text);
    const parsed = parseAIResponse(raw);

    const deck = {
      id: uid(),
      name,
      createdAt: Date.now(),
      flashcards: parsed.flashcards.map(f => ({ id: uid(), front: f.front, back: f.back })),
      quiz: parsed.quiz.map(q => ({ id: uid(), question: q.question, options: q.options, correctIndex: q.correctIndex })),
    };

    state.decks.push(deck);
    saveDecks();
    setGeneratorStatus(`Created ${deck.flashcards.length} flashcards and ${deck.quiz.length} quiz questions.`, 'success');
    deckNameInput.value = '';
    pasteArea.value = '';
    renderLibrary();
    setTimeout(() => showView('libraryView'), 1000);
  } catch (err) {
    console.error(err);
    setGeneratorStatus(`Something went wrong: ${err.message}`, 'error');
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

/* ============ Init ============ */
loadDecks();
renderLibrary();
showView('libraryView');
