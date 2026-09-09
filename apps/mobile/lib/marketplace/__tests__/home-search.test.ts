import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_HEADER_ACTIONS,
  HOME_SEARCH_CATEGORIES,
  HOME_SEARCH_MIN_QUERY,
  HOME_SEARCH_PLACEHOLDER,
  homeSearchMode,
  isValidHomeSearchCategory,
  matchesAllTokens,
  filterClassesLocally,
  filterVenuesLocally,
  filterTrainersLocally,
  filterHomeSearchResults,
  homeSearchResultRoute,
} from '../home-search.ts';

describe('Home header actions — order and labels (spec §1/§2/§10)', () => {
  test('exactly three actions, in the order Check-in | Search | Notifications', () => {
    assert.deepEqual(HOME_HEADER_ACTIONS.map(a => a.key), ['check-in', 'search', 'notifications']);
  });

  test('Search sits between Check-in and Notifications', () => {
    const keys = HOME_HEADER_ACTIONS.map(a => a.key);
    assert.equal(keys.indexOf('search'), keys.indexOf('check-in') + 1);
    assert.equal(keys.indexOf('search'), keys.indexOf('notifications') - 1);
  });

  test('the Search action has the required accessibility label', () => {
    const search = HOME_HEADER_ACTIONS.find(a => a.key === 'search')!;
    assert.equal(search.accessibilityLabel, 'Search classes, venues and trainers');
  });

  test('every action uses an Ionicons "-outline" glyph, matching the existing header icons', () => {
    for (const a of HOME_HEADER_ACTIONS) assert.match(a.icon, /-outline$/);
  });
});

describe('Search marketplace types + section order', () => {
  test('exactly Classes, Venues, Personal Trainers — in that section order', () => {
    assert.deepEqual(HOME_SEARCH_CATEGORIES.map(c => c.key), ['classes', 'venues', 'trainers']);
    assert.deepEqual(HOME_SEARCH_CATEGORIES.map(c => c.label), ['Classes', 'Venues', 'Personal Trainers']);
  });

  test('placeholder wording', () => {
    assert.equal(HOME_SEARCH_PLACEHOLDER, 'Search activities, venues or trainers');
  });

  test('isValidHomeSearchCategory guards route params / persisted values', () => {
    assert.equal(isValidHomeSearchCategory('venues'), true);
    assert.equal(isValidHomeSearchCategory('experiences'), false);
    assert.equal(isValidHomeSearchCategory(undefined), false);
    assert.equal(isValidHomeSearchCategory(null), false);
  });
});

describe('homeSearchMode — browse vs typing vs search (spec §4)', () => {
  test('empty or whitespace-only query → browse (tap a category, no query, browse that type)', () => {
    assert.equal(homeSearchMode(''), 'browse');
    assert.equal(homeSearchMode('   '), 'browse');
  });

  test('a single character → typing (no fetch, keep the current list)', () => {
    assert.equal(homeSearchMode('a'), 'typing');
    assert.equal(homeSearchMode('  y  '), 'typing');
  });

  test('two or more characters → search', () => {
    assert.equal(homeSearchMode('yo'), 'search');
    assert.equal(homeSearchMode('yoga'), 'search');
    assert.equal(HOME_SEARCH_MIN_QUERY, 2);
  });
});

describe('matchesAllTokens', () => {
  test('empty query matches everything (browse)', () => {
    assert.equal(matchesAllTokens('', ['anything']), true);
    assert.equal(matchesAllTokens('   ', [null, undefined]), true);
  });

  test('all tokens must be present, order-independent, case-insensitive', () => {
    assert.equal(matchesAllTokens('sunrise yoga', ['Sunrise Yoga Flow', 'Jane']), true);
    assert.equal(matchesAllTokens('yoga sunrise', ['Sunrise Yoga Flow']), true);
    assert.equal(matchesAllTokens('sunrise pilates', ['Sunrise Yoga Flow']), false);
  });

  test('tokens may match across different fields', () => {
    assert.equal(matchesAllTokens('jane karen', ['Yoga', 'Jane Doe', 'Karen Studio']), true);
  });
});

// ── row fixtures ──
const CLASSES = [
  { id: 's1', name: 'Sunrise Yoga', instructor: 'Jane', gyms: { name: 'Karen Studio' } },
  { id: 's2', name: 'HIIT Blast', instructor: 'Mo', gyms: { name: 'CBD Gym' } },
  { id: 's3', name: 'Power Pilates', instructor: null, gyms: null },
];
const VENUES = [
  { id: 'g1', name: 'Karen Studio', location: 'Karen' },
  { id: 'g2', name: 'Westlands Fitness', location: 'Westlands' },
];
const TRAINERS = [
  { id: 't1', full_name: 'Jane Doe', professional_name: 'Coach Jane', specialisations: ['Yoga', 'Mobility'], service_areas: ['Karen'] },
  { id: 't2', full_name: 'Mo Ali', professional_name: null, specialisations: ['HIIT'], service_areas: ['CBD'] },
];

describe('per-category local filters mirror the dedicated tab screens (spec §5)', () => {
  test('classes: matches name / instructor / gym name', () => {
    assert.deepEqual(filterClassesLocally(CLASSES, 'jane').map(r => r.id), ['s1']);
    assert.deepEqual(filterClassesLocally(CLASSES, 'karen').map(r => r.id), ['s1']); // gym name
    assert.deepEqual(filterClassesLocally(CLASSES, 'pilates').map(r => r.id), ['s3']);
    assert.equal(filterClassesLocally(CLASSES, '').length, 3); // browse
  });

  test('venues: matches name / location', () => {
    assert.deepEqual(filterVenuesLocally(VENUES, 'westlands').map(r => r.id), ['g2']);
    assert.deepEqual(filterVenuesLocally(VENUES, 'karen').map(r => r.id), ['g1']);
    assert.equal(filterVenuesLocally(VENUES, '').length, 2);
  });

  test('trainers: matches display name / real name / specialisation / service area', () => {
    assert.deepEqual(filterTrainersLocally(TRAINERS, 'coach jane').map(r => r.id), ['t1']);
    assert.deepEqual(filterTrainersLocally(TRAINERS, 'hiit').map(r => r.id), ['t2']); // specialisation
    assert.deepEqual(filterTrainersLocally(TRAINERS, 'cbd').map(r => r.id), ['t2']); // service area
    assert.equal(filterTrainersLocally(TRAINERS, '').length, 2);
  });

  test('filterHomeSearchResults dispatches by category', () => {
    assert.deepEqual(filterHomeSearchResults('classes', CLASSES as any, 'hiit').map(r => r.id), ['s2']);
    assert.deepEqual(filterHomeSearchResults('venues', VENUES as any, 'karen').map(r => r.id), ['g1']);
    assert.deepEqual(filterHomeSearchResults('trainers', TRAINERS as any, 'yoga').map(r => r.id), ['t1']);
  });

  test('filters are pure — same input, same output, input not mutated', () => {
    const copy = JSON.parse(JSON.stringify(CLASSES));
    filterClassesLocally(CLASSES, 'yoga');
    assert.deepEqual(CLASSES, copy);
  });
});

describe('homeSearchResultRoute — canonical detail pages (spec §7/§11)', () => {
  test('a class routes to /session-details with sessionId + gymName', () => {
    assert.deepEqual(
      homeSearchResultRoute('classes', { id: 's1', gyms: { name: 'Karen Studio' } }),
      { pathname: '/session-details', params: { sessionId: 's1', gymName: 'Karen Studio' } },
    );
  });

  test('a class with no gym falls back to a safe gymName', () => {
    assert.deepEqual(
      homeSearchResultRoute('classes', { id: 's3' }),
      { pathname: '/session-details', params: { sessionId: 's3', gymName: 'Gym' } },
    );
  });

  test('a venue routes to /gym-details with gymId', () => {
    assert.deepEqual(
      homeSearchResultRoute('venues', { id: 'g1' }),
      { pathname: '/gym-details', params: { gymId: 'g1' } },
    );
  });

  test('a trainer routes to /trainer-profile with id', () => {
    assert.deepEqual(
      homeSearchResultRoute('trainers', { id: 't1' }),
      { pathname: '/trainer-profile', params: { id: 't1' } },
    );
  });
});
