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

const sep = VC.parts(Object.assign({}, etl, { sep: true, gl: ranges }));
eq('separate credits 3 + 1', sep.map(x => x.credits), [3, 1]);
eq('separate grades', sep.map(x => x.grade), ['S', 'S']);
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

console.log(fails ? fails + ' failed' : 'all passed');
process.exit(fails ? 1 : 0);
