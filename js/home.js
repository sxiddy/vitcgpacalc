// Home page: scroll reveals and the share card previews.
(function () {
  const $ = id => document.getElementById(id);
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
    reveals(); fan();
  });
})();
