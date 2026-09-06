import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveServiceCapability,
  isForbiddenServiceOption,
  assertNoForbiddenOptions,
  FORBIDDEN_SERVICE_WORDS,
  type ServiceCapabilityInput,
} from '../service-taxonomy.ts';

const base: ServiceCapabilityInput = {
  isIndependentPro: false,
  professionalFlavour: 'general',
  ownsVenue: false,
  venueTypes: [],
  employsTeam: false,
};

const ids = (input: ServiceCapabilityInput) => deriveServiceCapability(input).options.map((o) => o.id);

describe('deriveServiceCapability — provider-appropriate options', () => {
  test('solo PT → appointment options only, no gym/class/access', () => {
    const caps = deriveServiceCapability({ ...base, isIndependentPro: true, professionalFlavour: 'training' });
    assert.deepEqual(caps.categories, ['appointment']);
    assert.deepEqual(ids({ ...base, isIndependentPro: true, professionalFlavour: 'training' }), [
      'personal_training', 'consultation', 'assessment', 'online_session', 'other_appointment',
    ]);
    assert.equal(caps.options.some((o) => o.category === 'access'), false);
    assert.equal(caps.options.some((o) => o.category === 'class'), false);
  });

  test('nutritionist → consultation terminology', () => {
    const got = ids({ ...base, isIndependentPro: true, professionalFlavour: 'nutrition' });
    assert.deepEqual(got, ['initial_consultation', 'follow_up', 'online_consultation', 'assessment', 'other_appointment']);
  });

  test('pilates / yoga studio → group class + private session', () => {
    const caps = deriveServiceCapability({ ...base, ownsVenue: true, venueTypes: ['pilates studio'] });
    assert.deepEqual(ids({ ...base, ownsVenue: true, venueTypes: ['pilates studio'] }), ['group_class', 'private_session']);
    assert.equal(caps.categories.includes('class'), true);
    assert.equal(caps.categories.includes('access'), false);
    assert.equal(caps.singleVenueImplicit, true); // one venue, no independent profile
  });

  test('spa → appointment + facility access', () => {
    const caps = deriveServiceCapability({ ...base, ownsVenue: true, venueTypes: ['spa & wellness'] });
    const got = caps.options.map((o) => o.id);
    assert.ok(got.includes('appointment'));
    assert.ok(got.includes('facility_access'));
    assert.deepEqual(caps.categories.sort(), ['access', 'appointment']);
  });

  test('gym → access + classes; + team PT only when it employs a team', () => {
    const noTeam = deriveServiceCapability({ ...base, ownsVenue: true, venueTypes: ['gym'], employsTeam: false });
    assert.deepEqual(noTeam.options.map((o) => o.id), ['gym_access', 'group_class']);
    const withTeam = deriveServiceCapability({ ...base, ownsVenue: true, venueTypes: ['gym'], employsTeam: true });
    assert.deepEqual(withTeam.options.map((o) => o.id), ['gym_access', 'group_class', 'team_personal_training']);
    const teamOpt = withTeam.options.find((o) => o.id === 'team_personal_training')!;
    assert.equal(teamOpt.teamDelivered, true);
    assert.equal(teamOpt.category, 'appointment');
  });

  test('hybrid (independent PT + gym) → union, deduped', () => {
    const caps = deriveServiceCapability({
      ...base, isIndependentPro: true, professionalFlavour: 'training',
      ownsVenue: true, venueTypes: ['gym'], employsTeam: true,
    });
    assert.deepEqual(caps.categories.sort(), ['access', 'appointment', 'class']);
    // dedupe: only one id each
    assert.equal(new Set(caps.options.map((o) => o.id)).size, caps.options.length);
    assert.equal(caps.singleVenueImplicit, false); // has an independent profile too
  });

  test('multi-venue business does not get singleVenueImplicit', () => {
    const caps = deriveServiceCapability({ ...base, ownsVenue: true, venueTypes: ['gym', 'gym'] });
    assert.equal(caps.singleVenueImplicit, false);
  });
});

describe('programmes / experiences / communities can NEVER be service types', () => {
  const everyInput: ServiceCapabilityInput[] = [
    { ...base, isIndependentPro: true, professionalFlavour: 'training' },
    { ...base, isIndependentPro: true, professionalFlavour: 'nutrition' },
    { ...base, isIndependentPro: true, professionalFlavour: 'therapy' },
    { ...base, ownsVenue: true, venueTypes: ['pilates'] },
    { ...base, ownsVenue: true, venueTypes: ['yoga studio'] },
    { ...base, ownsVenue: true, venueTypes: ['spa'] },
    { ...base, ownsVenue: true, venueTypes: ['gym'], employsTeam: true },
    { ...base, isIndependentPro: true, professionalFlavour: 'training', ownsVenue: true, venueTypes: ['gym'], employsTeam: true },
  ];

  test('no options list contains a forbidden word', () => {
    for (const input of everyInput) {
      const caps = deriveServiceCapability(input);
      assert.doesNotThrow(() => assertNoForbiddenOptions(caps.options));
      for (const o of caps.options) assert.equal(isForbiddenServiceOption(o), false, `${o.id}`);
    }
  });

  test('the guard actually catches a forbidden option', () => {
    assert.equal(isForbiddenServiceOption({ id: 'x', label: '12-week Programme' }), true);
    assert.equal(isForbiddenServiceOption({ id: 'experience_day', label: 'Retreat' }), true);
    assert.equal(isForbiddenServiceOption({ id: 'x', label: 'Community membership' }), true);
    assert.throws(() => assertNoForbiddenOptions([{ id: 'p', label: 'Program' }]));
  });

  test('forbidden word list is what we expect', () => {
    assert.deepEqual([...FORBIDDEN_SERVICE_WORDS], ['programme', 'program', 'experience', 'community']);
  });
});
