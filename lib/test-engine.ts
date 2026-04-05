import { runMigrations } from './db/schema';
runMigrations();
import { analyzeMatchup } from './analytics/matchup-intelligence';
import { generateNarrative } from './analytics/narrative';

try {
  const matchup = analyzeMatchup('alcaraz', 'ruud', null, null, {
    surface: 'clay',
    tourneyLevel: 'masters-1000',
    tournament: 'Madrid Masters',
  });
  process.stdout.write('analyzeMatchup OK\n');

  const narrative = generateNarrative({
    p1Name: 'Carlos Alcaraz',
    p2Name: 'Casper Ruud',
    p1Slug: 'alcaraz',
    p2Slug: 'ruud',
    tournament: 'Madrid Masters',
    tourneyLevel: 'masters-1000',
    surface: 'clay',
    winPct1: 68,
    winPct2: 32,
    p1Patterns: null,
    p2Patterns: null,
    matchup,
  });
  process.stdout.write('generateNarrative OK\n');
  process.stdout.write(narrative.narrative.slice(0, 200) + '\n');
} catch(e: unknown) {
  process.stdout.write('ERROR: ' + (e as Error).message + '\n');
  process.stdout.write((e as Error).stack?.slice(0, 500) ?? '' + '\n');
}
