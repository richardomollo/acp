process.env.TZ = 'Europe/Amsterdam'; // UTC+1/+2 with DST — the western counter-case

import { runFitnessTabDateChecks } from './fitness-tab-cases.ts';

runFitnessTabDateChecks('Europe/Amsterdam');
