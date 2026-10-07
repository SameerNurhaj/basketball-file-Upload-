
(function () {
  /* Set this to your endpoint to really upload (POST, multipart field "file").
     Leave empty to simulate the upload in the browser. */
  const UPLOAD_URL = '';

  const stage = document.getElementById('stage');
  const zone = document.getElementById('zone');
  const hoop = document.getElementById('hoop');
  const plus = document.getElementById('plus');
  const pdf = document.getElementById('pdf');
  const fname = document.getElementById('fname');
  const choose = document.getElementById('choose');
  const aim = document.getElementById('aimPath');
  const countEl = document.getElementById('count');
  const toasts = document.getElementById('toasts');
  const picker = document.getElementById('picker');
  const hintdots = document.getElementById('hintdots');
  let count = 0, busy = false;
  const queue = [];                     // PDFs waiting to be shot

  const rel = (r) => { const s = stage.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
  const fmtSize = (b) => b > 1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(b/1024))+' KB';
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

  function flash(msg) {
    const n = document.createElement('div'); n.className = 'flash'; n.textContent = msg;
    stage.appendChild(n); setTimeout(() => n.remove(), 2200);
  }

  /* ---------- home position + queue state ---------- */
  const home = { x: 36, y: 0 };
  function layout() {
    home.y = stage.clientHeight - 210;
    pdf.style.left = home.x + 'px'; pdf.style.top = home.y + 'px';
    choose.style.left = '24px'; choose.style.top = (home.y + 6) + 'px';
    hintdots.style.left = (home.x + 8) + 'px'; hintdots.style.top = (home.y - 120) + 'px';
  }
  function buildHints() {
    hintdots.innerHTML = '';
    [[6,112],[10,96],[14,80],[20,64],[28,50],[36,38],[48,28]].forEach((p, i) => {
      const d = document.createElement('i');
      d.style.left = p[0] + 'px'; d.style.top = p[1] + 'px'; d.style.animationDelay = (i * .12) + 's';
      hintdots.appendChild(d);
    });
  }
  function render() {
    const has = queue.length > 0;
    pdf.style.visibility = has && !busy ? 'visible' : 'hidden';
    hintdots.style.display = has && !busy ? '' : 'none';
    choose.style.display = !has && !busy ? 'flex' : 'none';
    if (has) fname.textContent = queue[0].name + (queue.length > 1 ? `  (+${queue.length - 1})` : '');
  }
  buildHints(); layout(); render();
  addEventListener('resize', layout);

  /* ---------- selecting PDFs ---------- */
  function addFiles(files) {
    const all = [...files], pdfs = all.filter(isPdf);
    if (all.length !== pdfs.length) flash('Only PDF files are allowed');
    if (!pdfs.length) return;
    pdfs.forEach(f => queue.push(f));
    render();
    if (!busy) { pdf.classList.remove('pop'); void pdf.offsetWidth; pdf.classList.add('pop'); setTimeout(() => pdf.classList.remove('pop'), 600); }
  }
  choose.addEventListener('click', () => picker.click());
  zone.addEventListener('click', () => picker.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
  picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });

  /* PDFs dragged in from the OS and dropped on the zone go straight into the basket */
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', (e) => {
    const s = stage.getBoundingClientRect(), all = [...e.dataTransfer.files], pdfs = all.filter(isPdf);
    if (all.length !== pdfs.length) flash('Only PDF files are allowed');
    pdfs.forEach((f, i) => setTimeout(() => shoot({ x: e.clientX - s.left, y: e.clientY - s.top }, f), i * 900));
  });

  /* ---------- trajectory (shared by aim preview and the real shot) ---------- */
  function targets() {
    const hr = rel(hoop.getBoundingClientRect());
    const rimX = hr.x + hr.w / 2, rimY = hr.y + hr.h * (76 / 140);
    return { top: { x: rimX, y: rimY - 70 }, end: { x: rimX + 2, y: rimY + 96 } };
  }
  const ctrlFor = (from, top) => ({ x: lerp(from.x, top.x, .35), y: Math.min(from.y, top.y) - 90 });
  const bez = (a, c, b, t) => { const u = 1 - t; return { x: u*u*a.x + 2*u*t*c.x + t*t*b.x, y: u*u*a.y + 2*u*t*c.y + t*t*b.y }; };
  function drawAim(from) {
    const { top } = targets(), c = ctrlFor(from, top);
    let d = '';
    for (let i = 0; i <= 30; i++) { const p = bez(from, c, top, i / 30); d += (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }
    aim.setAttribute('d', d);
  }

  /* ---------- drag to aim, release to shoot (works from anywhere) ---------- */
  let drag = null;
  const center = () => { const r = rel(pdf.getBoundingClientRect()); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  pdf.addEventListener('pointerdown', (e) => {
    if (busy || !queue.length) return;
    pdf.setPointerCapture(e.pointerId);
    pdf.classList.remove('return'); pdf.classList.add('dragging');
    hintdots.style.display = 'none';
    drag = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0 };
    drawAim(center());
    e.preventDefault();
  });
  pdf.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.sx; drag.dy = e.clientY - drag.sy;
    pdf.style.transform = `translate(${drag.dx}px, ${drag.dy}px) rotate(${Math.max(-18, Math.min(18, drag.dx / 12))}deg)`;
    drawAim(center());
  });
  const release = () => {
    if (!drag) return;
    const from = center();
    pdf.classList.remove('dragging'); pdf.style.transform = '';
    aim.setAttribute('d', ''); drag = null;
    shoot(from, queue.shift());          // always goes in, wherever you let go
  };
  pdf.addEventListener('pointerup', release);
  pdf.addEventListener('pointercancel', release);

  /* ---------- the shot (always lands in the basket) ---------- */
  function shoot(from, file) {
    busy = true; render();
    const { top: topPt, end: endPt } = targets();
    const fly = pdf.cloneNode(true);
    fly.removeAttribute('id'); fly.style.visibility = 'visible'; fly.style.pointerEvents = 'none';
    fly.style.zIndex = 8; fly.classList.remove('return', 'dragging', 'pop');
    const lbl = fly.querySelector('.fname'); if (lbl) lbl.remove();
    stage.appendChild(fly);

    const put = (x, y, rot, sc, op) => {
      fly.style.left = (x - 23) + 'px'; fly.style.top = (y - 29) + 'px';
      fly.style.transform = `rotate(${rot}deg) scale(${sc})`; fly.style.opacity = op;
    };
    const ctrl = ctrlFor(from, topPt);
    const t0 = performance.now(), D1 = 750, D2 = 520;
    let lastDot = 0, swished = false;
    function dot(x, y) {
      const d = document.createElement('i'); d.className = 'trail';
      d.style.left = (x + Math.random()*10 - 5) + 'px'; d.style.top = (y + Math.random()*10 - 5) + 'px';
      stage.appendChild(d); setTimeout(() => d.remove(), 750);
    }
    (function frame(now) {
      const el = now - t0;
      if (el < D1) {
        const t = ease(el / D1), p = bez(from, ctrl, topPt, t);
        put(p.x, p.y, lerp(-12, 340, t), lerp(1, .85, t), 1);
        if (now - lastDot > 35) { dot(p.x, p.y); lastDot = now; }
        requestAnimationFrame(frame);
      } else if (el < D1 + D2) {
        const t = (el - D1) / D2;
        put(lerp(topPt.x, endPt.x, t), lerp(topPt.y, endPt.y, t * t), lerp(340, 360, t), lerp(.85, .7, t), 1);
        if (t > .15 && !swished) { swished = true; swish(); }
        requestAnimationFrame(frame);
      } else {
        fly.style.transition = 'opacity .35s'; fly.style.opacity = 0;
        setTimeout(() => fly.remove(), 400);
        addToast(file);
        setTimeout(() => {
          busy = false; render();
          if (queue.length) { pdf.classList.add('pop'); setTimeout(() => pdf.classList.remove('pop'), 600); }
        }, 1200);
      }
    })(t0);
  }

  function swish() {
    hoop.classList.add('swish');
    plus.classList.remove('go'); void plus.offsetWidth; plus.classList.add('go');
    setTimeout(() => hoop.classList.remove('swish'), 950);
    count++; countEl.textContent = count;
    countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  }

  /* ---------- upload (real if UPLOAD_URL set, otherwise simulated) ---------- */
  function upload(file, onProgress, onDone, onError) {
    if (UPLOAD_URL) {
      const xhr = new XMLHttpRequest(), fd = new FormData();
      fd.append('file', file);
      xhr.open('POST', UPLOAD_URL);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => xhr.status < 300 ? onDone() : onError();
      xhr.onerror = onError;
      xhr.send(fd);
    } else {
      const t0 = performance.now(), D = 1700;
      (function tick(now) {
        const p = Math.min(1, (now - t0) / D);
        onProgress(ease(p));
        p < 1 ? requestAnimationFrame(tick) : onDone();
      })(t0);
    }
  }

  function addToast(file) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `
      <div class="mini"></div>
      <div class="meta"><div class="name"></div><div class="size"></div></div>
      <div class="prog"><div class="state">Uploading…</div><div class="bar"><span></span></div></div>
      <div class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`;
    t.querySelector('.name').textContent = file.name;
    t.querySelector('.size').textContent = fmtSize(file.size);
    toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.removeChild(toasts.firstElementChild);
    const bar = t.querySelector('.bar span'), state = t.querySelector('.state');
    upload(file,
      (p) => { bar.style.width = (p * 100) + '%'; },
      () => { bar.style.width = '100%'; t.classList.add('done'); state.textContent = 'Uploaded'; },
      () => { state.textContent = 'Failed'; state.style.color = '#e5304f'; bar.style.background = '#e5304f'; });
  }
})();