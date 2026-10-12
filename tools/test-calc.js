// Run: node tools/test-calc.js
const VC = require('../js/calc.js');
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };

const quiz = (a, b, c) => [{ s: a, m: 10 }, { s: b, m: 10 }, { s: c, m: 10 }];
const labs = arr => arr.map(s => ({ s, m: 10 }));
const ranges = { S: 84, A: 71, B: 61, C: 51, D: 46, E: 40 };

const etl = { y: 'ETL', cr: 4, l: 3, tu: 0, p: 2, cat1: 12, cat2: 13, fat: 34, quiz: quiz(9, 9, 9), lab: labs([9, 9, 9, 9, 9, 10, 10, 9, 9, 9]), g: ranges };
const p = VC.parts(etl)[0];
eq('ETL theory /100', p.theory.value, 86);
eq('ETL lab /100', p.lab.value, 92);
eq('ETL total = 86*.75 + 92*.25', p.value, 87.5);
eq('ETL grade S', p.grade, 'S');
eq('ETL scaled parts', [p.thScaled, p.labScaled], [64.5, 23]);

const old = VC.parts(Object.assign({}, etl, { sep: true, gl: ranges })); // older saves may say separate
eq('theory + lab is always one combined result', [old.length, old[0].value, old[0].credits], [1, 87.5, 4]);
eq('split L2 P4 -> 2 + 2', VC.splitCredits({ cr: 4, l: 2, tu: 0, p: 4 }), { th: 2, lab: 2 });

eq('no ranges -> no grade', VC.parts(Object.assign({}, etl, { g: {} }))[0].grade, null);
eq('84 is S', VC.gradeOf(84, ranges), 'S');
eq('83.99 is A', VC.gradeOf(83.99, ranges), 'A');
eq('71 is A', VC.gradeOf(71, ranges), 'A');
eq('39 is F', VC.gradeOf(39, ranges), 'F');
eq('ranges must go down', VC.checkRanges({ S: 80, A: 85, B: 60, C: 50, D: 45, E: 40 }).ok, false);
eq('partial ranges', VC.checkRanges({ S: 80 }).err, 'Fill in all six grade cut-offs');

eq('FAT over 40 is an error', VC.theory({ cat1: 10, cat2: 10, fat: 41, quiz: quiz(1, 1, 1) }).value, null);
eq('quiz maxes must total 30', VC.theory({ quiz: [{ s: 5, m: 10 }, { s: 5, m: 10 }] }).errs[0], 'Quiz max marks add up to 20, they should add up to 30');
eq('empty marks count as 0', VC.theory({ quiz: quiz('', '', '') }).value, 0);
eq('lab of 5 x 20 scales to 100', VC.lab({ lab: [20, 20, 10, 20, 20].map(s => ({ s, m: 20 })) }).value, 90);

const th = { y: 'TH', cr: 4, cat1: 15, cat2: 15, fat: 40, quiz: quiz(10, 10, 10), g: ranges };
eq('TH full marks', VC.parts(th)[0].value, 100);
const g = VC.gpa([etl, Object.assign({}, th, { fat: 20 })]); // 87.5 S (4cr) + 80 A (4cr)
eq('GPA (4*10 + 4*9) / 8', g.gpa, 9.5);
eq('OC single', VC.parts({ y: 'OC', cr: 2, oc: 65, g: ranges })[0].grade, 'B');

// ---------- GPA ----------
eq('GPA skips ungraded subjects', VC.gpa([etl, Object.assign({}, th, { g: {} })]).gpa, 10);
eq('GPA still counts their credits in the total', VC.gpa([etl, Object.assign({}, th, { g: {} })]).credits, 8);
const fail = Object.assign({}, th, { c: 'BMAT101', cat1: 5, cat2: 5, fat: 10, quiz: quiz(2, 2, 2) }); // 26 -> F
eq('F subject', VC.parts(fail)[0].grade, 'F');
eq('F counts 0 points but its credits count: (4*10 + 4*0) / 8', VC.gpa([etl, fail]).gpa, 5);
eq('no subjects -> no GPA', VC.gpa([]).gpa, null);

// ---------- courses() ----------
eq('courses keys', VC.courses([Object.assign({ c: 'BCSE101' }, etl), fail]).map(c => c.key), ['BCSE101|all', 'BMAT101|all']);
eq('courses skip ungraded', VC.courses([Object.assign({ c: 'X' }, th, { g: {} })]).length, 0);

// ---------- semester credit rule ----------
eq('credits 24 ok', VC.semCredits(24), 'ok');
eq('credits 20 and 30 ok', [VC.semCredits(20), VC.semCredits(30)], ['ok', 'ok']);
eq('credits 19.5 low', VC.semCredits(19.5), 'low');
eq('credits 31 high', VC.semCredits(31), 'high');
eq('credits 35 high (still allowed)', VC.semCredits(35), 'high');
eq('credits 35.5 refused', VC.semCredits(35.5), 'too-many');
eq('credits 0 / text invalid', [VC.semCredits(0), VC.semCredits('x'), VC.semCredits('')], ['invalid', 'invalid', 'invalid']);
eq('GPA 0..10 ok', [VC.checkGpa('0'), VC.checkGpa('10'), VC.checkGpa('8.73')], ['', '', '']);
eq('GPA out of range', [VC.checkGpa('10.1'), VC.checkGpa('-1'), VC.checkGpa('abc')].every(Boolean), true);

// ---------- CGPA ----------
const C = (key, credits, grade) => ({ key, credits, grade });
eq('CGPA is credit-weighted, not an average of GPAs', VC.cgpa([{ gpa: 9, credits: 20 }, { gpa: 7, credits: 30 }]).cgpa, 7.8); // (180+210)/50, plain average would be 8
eq('CGPA credits', VC.cgpa([{ gpa: 9, credits: 20 }, { gpa: 7, credits: 30 }]).credits, 50);
eq('quick mode CGPA + one new semester', VC.cgpa([{ gpa: 8.5, credits: 100 }, { gpa: 9.2, credits: 25 }]).cgpa, 8.64); // (850+230)/125
eq('course level: S A F', VC.cgpa([{ courses: [C('a', 4, 'S'), C('b', 3, 'A'), C('c', 2, 'F')] }]).cgpa, 7.44); // 67/9
eq('grade points table', ['S', 'A', 'B', 'C', 'D', 'E', 'F'].map(g => VC.POINTS[g]), [10, 9, 8, 7, 6, 5, 0]);
const retake = VC.cgpa([{ courses: [C('a', 4, 'S'), C('m', 4, 'F')] }, { courses: [C('b', 3, 'B'), C('m', 4, 'C')] }]);
eq('cleared F is replaced by the new grade', retake.cgpa, 8.36); // a S 40 + b B 24 + m C 28 = 92 / 11
eq('replaced course credits counted once', retake.credits, 11);
eq('replaced count', retake.replaced, 1);
eq('F not yet cleared still counts 0', VC.cgpa([{ courses: [C('a', 4, 'S'), C('m', 4, 'F')] }]).cgpa, 5);
eq('cleared F inside a typed-in semester stops counting', VC.cgpa([{ gpa: 7.5, credits: 24 }, { courses: [C('m', 4, 'B')] }], [{ credits: 4 }]).cgpa, 8.83); // (180 + 32) / (24 - 4 + 4)
eq('empty -> no CGPA', VC.cgpa([]).cgpa, null);
eq('blocks with no credits ignored', VC.cgpa([{ gpa: 9, credits: 0 }, { gpa: null, credits: 20 }]).cgpa, null);
eq('calculator semester feeds CGPA', VC.cgpa([{ gpa: 8, credits: 40 }, { courses: VC.courses([Object.assign({ c: 'BCSE101' }, etl), fail]) }]).cgpa, 7.5); // (320 + 40 + 0) / 48
eq('all S is 10', VC.cgpa([{ gpa: 10, credits: 23 }, { courses: [C('a', 4, 'S')] }]).cgpa, 10);

// ---------- CGPA page summary (also used by the share card) ----------
const S1 = Object.assign({ c: 'BCSE101' }, etl), S2 = Object.assign({ c: 'BMAT101' }, fail);
const cs = { sems: { 'FALLSEM2026-27': [S1, S2], 'WINSEM2025-26': [Object.assign({}, S1, { c: 'BCSE100' })] }, locks: { 'FALLSEM2026-27': { confirmed: true }, 'WINSEM2025-26': { confirmed: true } } };
const sum = VC.cgpaSummary({ mode: 'quick', quick: { cgpa: '8', credits: '40' } }, cs);
eq('summary: this semester is the latest confirmed', sum.now.name, 'Fall 2026-27');
eq('summary: CGPA before and after', [sum.before.cgpa, sum.after.cgpa], [8.18, 7.69]); // (320 + 40) / 44, then (360 + 40 + 0) / 52
eq('summary: unconfirmed semester does not count', VC.cgpaSummary({}, { sems: cs.sems, locks: {} }).after, null);
eq('summary: half-filled quick entry is an error', VC.cgpaSummary({ quick: { cgpa: '8', credits: '' } }, {}).past.err, 'Add the credits you have completed too');
eq('summary: semester names', [VC.semName('WINSEM2025-26'), VC.semName('SUMSEM2026-27')], ['Winter 2025-26', 'Summer 2026-27']);

// ---------- QR code ----------
const QR = require('../js/qr.js');
const q = QR.make('https://markscalc.cv');
eq('QR for the site link is version 2 (25 x 25)', [q.version, q.size], [2, 25]);
eq('QR finder corners are dark, timing row alternates', [q.dark(0, 0), q.dark(24, 0), q.dark(0, 24), q.dark(8, 6), q.dark(9, 6), q.dark(6, 9)], [true, true, true, true, false, false]);

console.log(fails ?fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0);
