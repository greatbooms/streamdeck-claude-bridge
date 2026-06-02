const qEl = document.getElementById('questions');
const statusEl = document.getElementById('status');
const pending = new Map();
let ws;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { statusEl.textContent = '연결됨'; };
  ws.onclose = () => { statusEl.textContent = '끊김 — 재연결 중…'; setTimeout(connect, 1000); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
}

function handle(msg) {
  if (msg.type === 'sync') {
    pending.clear();
    msg.questions.forEach(q => pending.set(q.session, q));
  } else if (msg.type === 'question_added') {
    pending.set(msg.question.session, msg.question);
    notify(msg.question);
  } else if (msg.type === 'question_resolved') {
    pending.delete(msg.session);
  } else if (msg.type === 'error') {
    statusEl.textContent = '오류: ' + msg.message;
  }
  render();
}

function notify(q) {
  if (window.Notification && Notification.permission === 'granted') {
    new Notification('Claude 질문', { body: `[${q.header}] ${q.question}` });
  }
}

function render() {
  qEl.innerHTML = '';
  if (pending.size === 0) {
    const d = document.createElement('div'); d.className = 'empty';
    d.textContent = '대기 중인 질문이 없습니다.';
    qEl.appendChild(d); return;
  }
  for (const q of pending.values()) {
    const card = document.createElement('div'); card.className = 'card';
    const h = document.createElement('div'); h.className = 'q';
    h.textContent = `[${q.header}] ${q.question}`;
    card.appendChild(h);
    if (q.multiSelect) {
      const note = document.createElement('div'); note.className = 'note';
      note.textContent = '다중선택 — 터미널에서 직접 선택하세요';
      card.appendChild(note);
      q.options.forEach((o, i) => {
        const b = document.createElement('div'); b.className = 'opt ro';
        b.textContent = `${i + 1}. ${o.label}`; card.appendChild(b);
      });
    } else {
      q.options.forEach((o, i) => {
        const b = document.createElement('button'); b.className = 'opt';
        b.textContent = `${i + 1}. ${o.label}`;
        b.onclick = () => ws.send(JSON.stringify({ type: 'answer', session: q.session, index: i + 1 }));
        card.appendChild(b);
      });
    }
    qEl.appendChild(card);
  }
}

if (window.Notification && Notification.permission === 'default') {
  Notification.requestPermission();
}
connect();
