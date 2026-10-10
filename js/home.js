// Home page: the live "try it" calculator, scroll reveals and the share card previews.
(function () {
  const $ = id => document.getElementById(id);
  // an example class's ranges, only for the demo; real subjects start with empty ranges
  const DEMO_RANGES = { S: 84, A: 71, B: 61, C: 51, D: 46, E: 40 };
  const IDS = ['cat1', 'cat2', 'fat', 'quiz', 'lab'];
  const MAX = { cat1: 15, cat2: 15, fat: 40, quiz: 30, lab: 100 };
  const C = 2 * Math.PI * 78;

  function demo() {
    const v = {}, errs = [];
    const NAME = { cat1: 'CAT-1', cat2: 'CAT-2', fat: 'FAT', quiz: 'Quizzes', lab: 'Lab' };
    IDS.forEach(k => {
      const el = $('d-' + k), n = VC.num(el.value);
      const bad = n !== null && (Number.isNaN(n) || n < 0 || n > MAX[k]);
      el.closest('.mark').classList.toggle('bad', bad);
      if (bad) errs.push(NAME[k] + ' is out of ' + MAX[k]);
      v[k] = bad || n === null ? 0 : n;
    });
    $('d-err').textContent = errs.join(' · ');
    const s = { y: 'ETL', cr: 4, l: 3, tu: 0, p: 2, cat1: v.cat1, cat2: v.cat2, fat: v.fat,
      quiz: [{ s: v.quiz, m: 30 }], lab: [{ s: v.lab, m: 100 }], g: DEMO_RANGES };
    const p = VC.parts(s)[0];
    const col = p.grade ? `var(--g-${p.grade})` : 'var(--text-3)';
    const ring = $('d-ring');
    ring.style.setProperty('--ring', col);
    ring.querySelector('.bar').style.strokeDashoffset = (C * (1 - p.value / 100)).toFixed(2);
    $('d-total').textContent = Math.round(p.value * 10) / 10;
    const g = $('d-grade');
    if (g.textContent !== p.grade) { g.textContent = p.grade; g.style.animation = 'none'; void g.offsetWidth; g.style.animation = ''; }
    g.style.setProperty('--gc', col);
    const r1 = n => Math.round(n * 10) / 10;
    $('d-split').textContent = `Theory ${r1(p.thScaled)}/75 · Lab ${r1(p.labScaled)}/25`;
  }

  function reveals() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(list => list.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
    els.forEach(e => io.observe(e));
  }

  // two real share cards, drawn with the same code as the share page
  function fan() {
    if (!window.VCCard) return;
    const rows = [
      { code: 'BACSE105', title: 'Data Structures and Algorithms', mark: 88.5, grade: 'S' },
      { code: 'BAMAT205', title: 'Discrete Mathematics and Linear Algebra', mark: 79, grade: 'A' },
      { code: 'BACSE106', title: 'Operating Systems', mark: 85, grade: 'S' },
      { code: 'BAPHY105', title: 'Engineering Physics', mark: 74.5, grade: 'A' }
    ];
    const data = { sem: 'Fall 2026-27', rows, stats: [{ label: 'GPA', value: '9.50' }, { label: 'CGPA', value: '9.12' }], hideMarks: false };
    VCCard.ready().then(() => {
      try {
        VCCard.draw($('fan1'), data, { size: 'story', design: 'editorial' });
        VCCard.draw($('fan2'), Object.assign({}, data, { stats: [{ label: 'GPA', value: '9.50' }] }), { size: 'story', design: 'glow' });
      } catch (e) { document.querySelector('.fan').hidden = true; }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    IDS.forEach(k => $('d-' + k).addEventListener('input', demo));
    demo(); reveals(); fan();
  });
})();
