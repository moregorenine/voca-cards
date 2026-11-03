const KEY = "dwq_v1";
const INTERVAL = [0, 1, 3, 7, 14]; // 박스 1~4: 복습 간격(일). 박스 0 = 새 단어
const BOOKS = ["phonics1", "phonics2"];
let words = [],
  state = load(),
  mode = "card",
  queue = [],
  total = 0,
  cur = null,
  flipped = false;
const $ = (s) => document.querySelector(s);
const today = () =>
  Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);

function load() {
  try {
    return (
      JSON.parse(localStorage.getItem(KEY)) || {
        cards: {},
        streak: { last: 0, count: 0 },
      }
    );
  } catch (e) {
    return { cards: {}, streak: { last: 0, count: 0 } };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

const cs = (id) => state.cards[id] || { box: 0, due: 0, right: 0, wrong: 0 };

function grade(id, good) {
  const c = cs(id);
  if (good) {
    c.box = Math.min(4, c.box + 1);
    c.right++;
  } else {
    c.box = 1;
    c.wrong++;
  }
  c.due = today() + (good ? INTERVAL[c.box] : 0);
  if (!good) c.due = today() + 1;
  state.cards[id] = c;
  // 연속 학습: 하루 쉬어도 이어짐
  const s = state.streak,
    t = today();
  if (s.last !== t) {
    s.count = t - s.last <= 2 && s.last ? s.count + 1 : 1;
    s.last = t;
  }
  save();
  header();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  const v =
    speechSynthesis.getVoices().find((v) => v.lang.startsWith("en-US")) ||
    speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

const dueWords = (list) => list.filter((w) => cs(w.id).due <= today());
const unitWords = () => words.filter((w) => w.unit === $("#unit").value);

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function header() {
  $("#streak").textContent = `🔥 ${state.streak.count}일`;
  const reviewN = dueWords(words.filter((w) => cs(w.id).box > 0)).length;
  $("#due").textContent = `복습 ${reviewN}개`;
  $("#prog").style.width = total
    ? ((total - queue.length) / total) * 100 + "%"
    : "0";
  const known = words.filter((w) => cs(w.id).box >= 3).length;
  $("#report").textContent =
    `외운 단어(박스 3 이상): ${known} / ${words.length}개 · 오늘 복습 대기: ${reviewN}개`;
}

function start() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  let list;
  if (mode === "review") list = dueWords(words.filter((w) => cs(w.id).box > 0));
  else list = dueWords(unitWords());
  queue = shuffle(list);
  total = queue.length;
  header();
  next();
}

function done() {
  const text =
    mode === "review"
      ? "오늘 복습할 단어를 모두 끝냈어요! 🎉"
      : "이 단원의 오늘 학습을 마쳤어요! 🎉";
  $("#stage").innerHTML =
    `<div class="card empty"><div class="emoji">🏆</div><div class="meaning">${text}</div><div class="hint">다른 단원이나 퀴즈에도 도전해 보세요.</div></div>`;
  header();
}

function next() {
  if (!queue.length) return done();
  cur = queue[0];
  flipped = false;
  if (mode === "quiz") return quiz();
  flash();
}

function renderVisual(w) {
  const src =
    w.image || `words/${w.book}/images/${encodeURIComponent(w.word)}.jpg`;
  const emoji = w.emoji || "";
  return `<div class="visual"><img class="word-img" src="${src}" alt="${w.word}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div class="emoji" style="display:none">${emoji}</div></div>`;
}

function flash() {
  const w = cur;
  $("#stage").innerHTML = `
  <div class="card flip" id="fc">
    ${renderVisual(w)}
    <div class="word">${w.word}</div>
    <div class="syl">${w.syllables}</div>
    <button class="speak" id="sp" aria-label="발음 듣기">🔊</button>
    <div id="back" class="hint">카드를 탭하면 뜻이 나와요</div>
  </div>
  <div class="row" id="acts" style="visibility:hidden">
    <button class="btn no" id="hard">❌ 아직 어려워요</button>
    <button class="btn ok" id="easy">⭕ 다 외웠어요!</button>
  </div>`;
  $("#sp").onclick = (e) => {
    e.stopPropagation();
    speak(w.word);
  };
  $("#fc").onclick = () => {
    if (flipped) return;
    flipped = true;
    speak(w.word); // 탭(사용자 동작) 이후라 자동 재생이 막히지 않음
    $("#back").outerHTML =
      `<div class="meaning">${w.meaning}</div><div class="ex">${w.example_en}<br>${w.example_ko}</div>`;
    $("#acts").style.visibility = "visible";
  };
  $("#hard").onclick = () => answer(false);
  $("#easy").onclick = () => answer(true);
}

function answer(good) {
  grade(cur.id, good);
  queue.shift();
  if (!good) queue.splice(Math.min(queue.length, 3), 0, cur); // 몇 장 뒤에 다시 등장
  next();
}

function distractors(w) {
  const same = shuffle(words.filter((x) => x.id !== w.id && x.pos === w.pos));
  const rest = shuffle(words.filter((x) => x.id !== w.id && x.pos !== w.pos));
  return same.concat(rest).slice(0, 3);
}

let qType = 0;
function quiz() {
  qType = (qType + 1) % 2;
  qType ? choiceQ() : spellQ();
}

function choiceQ() {
  const w = cur,
    opts = shuffle([w].concat(distractors(w)));
  $("#stage").innerHTML = `
  <div class="card">
    ${renderVisual(w)}
    <div class="meaning">${w.meaning}</div>
    <div class="hint">알맞은 영어 단어를 고르세요</div>
    <div class="opts">${opts.map((o) => `<button class="btn" data-id="${o.id}">${o.word}</button>`).join("")}</div>
    <div class="msg" id="msg"></div>
  </div>`;
  document.querySelectorAll(".opts .btn").forEach(
    (b) =>
      (b.onclick = () => {
        const ok = b.dataset.id === String(w.id);
        document.querySelectorAll(".opts .btn").forEach((x) => {
          x.disabled = true;
          if (x.dataset.id === String(w.id)) x.classList.add("right");
        });
        if (!ok) b.classList.add("wrong");
        speak(w.word);
        finish(ok);
      }),
  );
}

function spellQ() {
  const w = cur,
    word = w.word,
    n = word.length >= 7 ? 2 : 1;
  const idx = shuffle([...Array(word.length).keys()])
    .slice(0, n)
    .sort((a, b) => a - b);
  let filled = {},
    pos = 0;
  const alpha = "abcdefghijklmnopqrstuvwxyz";
  const need = idx.map((i) => word[i]);
  let pool = need.slice();
  while (pool.length < 6) {
    const c = alpha[(Math.random() * 26) | 0];
    if (!pool.includes(c)) pool.push(c);
  }
  pool = shuffle(pool);
  const show = () =>
    [...word].map((c, i) => (idx.includes(i) ? filled[i] || "_" : c)).join(" ");
  $("#stage").innerHTML = `
  <div class="card">
    ${renderVisual(w)}
    <div class="meaning">${w.meaning}</div>
    <div class="blank" id="bl">${show()}</div>
    <div class="letters">${pool.map((c) => `<button class="btn">${c}</button>`).join("")}</div>
    <div class="msg" id="msg"></div>
  </div>`;
  document.querySelectorAll(".letters .btn").forEach(
    (b) =>
      (b.onclick = () => {
        if (pos >= idx.length) return;
        filled[idx[pos]] = b.textContent;
        pos++;
        b.disabled = true;
        $("#bl").textContent = show();
        if (pos === idx.length) {
          const ok = idx.every((i) => filled[i] === word[i]);
          $("#bl").textContent = ok ? word.split("").join(" ") : show();
          document
            .querySelectorAll(".letters .btn")
            .forEach((x) => (x.disabled = true));
          speak(word);
          finish(ok, word);
        }
      }),
  );
}

function finish(ok, word) {
  grade(cur.id, ok);
  $("#msg").textContent = ok
    ? "정답! 👏"
    : `아쉬워요! 정답: ${word || cur.word}`;
  $("#msg").style.color = ok ? "var(--ok)" : "var(--no)";
  queue.shift();
  if (!ok) queue.splice(Math.min(queue.length, 3), 0, cur);
  setTimeout(next, ok ? 900 : 1800);
}

// 초기화
document.querySelectorAll("#tabs button").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("#tabs button")
        .forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      mode = b.dataset.m;
      start();
    }),
);

$("#book").onchange = () => loadBook($("#book").value);
$("#unit").onchange = start;

$("#exp").onclick = () => {
  const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "word-quest-backup.json";
  a.click();
};

$("#imp").onclick = () => {
  const i = document.createElement("input");
  i.type = "file";
  i.accept = ".json";
  i.onchange = () =>
    i.files[0].text().then((t) => {
      try {
        const d = JSON.parse(t);
        if (!d.cards) throw 0;
        state = d;
        save();
        start();
        alert("가져왔어요!");
      } catch (e) {
        alert("올바른 백업 파일이 아니에요.");
      }
    });
  i.click();
};

$("#reset").onclick = () => {
  if (confirm("학습 기록을 모두 지울까요?")) {
    state = { cards: {}, streak: { last: 0, count: 0 } };
    save();
    start();
  }
};

async function getBooks() {
  try {
    const r = await fetch("words/");
    if (r.ok) {
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const dirs = [...doc.querySelectorAll("a")]
        .map((a) => a.getAttribute("href") || "")
        .filter(
          (h) =>
            h &&
            !h.startsWith("?") &&
            !h.startsWith("#") &&
            !h.startsWith(".."),
        )
        .map((h) => decodeURIComponent(h.replace(/\/+$/, "").split("/").pop()))
        .filter(
          (name) =>
            name &&
            name !== "words" &&
            name !== "." &&
            name !== ".." &&
            !name.includes("."),
        );
      if (dirs.length) return [...new Set(dirs)].sort();
    }
  } catch (e) {}
  return BOOKS;
}

async function loadBook(book) {
  try {
    const bookName = book.replace(/\.json$/i, "").replace(/\/+$/, "");
    const r = await fetch(`words/${bookName}/index.json`);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    words = d.map((w) => ({
      ...w,
      book: bookName,
      id: `${bookName}:${w.id}`,
    }));
    const units = [...new Set(words.map((w) => w.unit).filter(Boolean))];
    $("#unit").innerHTML = units
      .map((u) => `<option value="${u}">${u}</option>`)
      .join("");
    if (window.speechSynthesis) speechSynthesis.getVoices();
    start();
  } catch (e) {
    $("#stage").innerHTML =
      '<div class="card empty">단어장 파일을 불러올 수 없어요.<br>파일을 더블클릭하지 말고 GitHub Pages나 로컬 서버(<code>python -m http.server</code>)로 열어 주세요.</div>';
  }
}

getBooks().then((books) => {
  $("#book").innerHTML = books
    .map((b) => {
      const name = b.replace(/\.json$/i, "").replace(/\/+$/, "");
      return `<option value="${name}">${name}</option>`;
    })
    .join("");
  if (books.length) loadBook($("#book").value);
});
