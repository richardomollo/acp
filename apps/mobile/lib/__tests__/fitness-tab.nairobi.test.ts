process.env.TZ = 'Africa/Nairobi'; // UTC+3, no DST — where LH-26's one-day loss appeared

import { runFitnessTabDateChecks } from './fitness-tab-cases.ts';

runFitnessTabDateChecks('Africa/Nairobi');
