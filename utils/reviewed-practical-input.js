'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../config/reviewed-practical-2027'));
  else root.ReviewedPracticalInput = factory(root.ReviewedPracticalConfig);
})(typeof window === 'undefined' ? globalThis : window, function(config) {
  function profile(formula) {
    let settings = formula?.기타설정;
    if (typeof settings === 'string') { try { settings = JSON.parse(settings); } catch { return null; } }
    return Number(formula?.학년도) === config.year && settings?.[config.feature] === true ? config.profiles[Number(formula.U_ID)] : null;
  }
  function truncate(value, digits) {
    const [whole, decimal = ''] = value.split('.');
    return digits === undefined ? value : digits && decimal ? (whole || '0') + '.' + decimal.slice(0, digits) : whole || '0';
  }
  function prepare(formula, gender, practicals) {
    const policy = profile(formula);
    if (!policy) return null;
    const rows = Array.isArray(practicals) ? practicals : [], names = policy.events;
    const records = rows.map(row => ({event: row?.event, value: String(row?.value ?? row?.record ?? '').trim()}));
    let reason = !['남', '여'].includes(gender) || records.some(row => !names.includes(row.event)) ||
      new Set(records.map(row => row.event)).size !== records.length ? 'invalid' : '';
    const normalized = names.map(event => {
      const row = records.find(item => item.event === event), value = row?.value || '';
      if (!value) { reason ||= 'incomplete'; return {event, value}; }
      if (value === '미응시') { reason = 'absent'; return {event, value}; }
      if ((policy.eventFinalCodes?.[event] || policy.finalCodes || config.finalCodes).includes(value.toUpperCase())) return {event, value: value.toUpperCase()};
      const numeric = Number(value), isTime = config.timeEvents.includes(event);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(numeric) || numeric < 0 ||
          isTime && numeric <= 0 || policy.counts?.includes(event) && !Number.isInteger(numeric)) reason ||= 'invalid';
      if (isTime && policy.timeDigits !== undefined && /[1-9]/.test((value.split('.')[1] || '').slice(policy.timeDigits))) reason ||= 'precision';
      return {event, value: truncate(value, policy.digits?.[event])};
    });
    return {ready: !reason, reason, records: normalized, names, profiled: true, message: config.messages[reason] || ''};
  }
  function notices(formula, gender, events) {
    if (!profile(formula)) return [];
    const uid = Number(formula.U_ID), notes = new Set();
    for (const row of events || []) {
      const value = Number(row.normalized_record ?? row.record), numeric = String(row.record ?? '').trim() !== '' && Number.isFinite(value);
      if (!numeric) continue;
      for (const rule of config.conditionalRules) {
        const limit = name => typeof rule[name] === 'object' ? rule[name][gender] : rule[name];
        if (!rule.ids.includes(uid) || rule.event && rule.event !== row.event || rule.gender && rule.gender !== gender ||
            rule.time && !config.timeEvents.includes(row.event)) continue;
        if (rule.minimum !== undefined && value < limit('minimum') || rule.below !== undefined && value >= limit('below') ||
            rule.above !== undefined && value <= limit('above') || rule.equal !== undefined && value !== limit('equal') ||
            rule.scoreBelow !== undefined && (row.score == null || row.score >= rule.scoreBelow)) continue;
        notes.add(rule.key);
      }
    }
    return [...notes];
  }
  function resultNotice(result) {
    const keys = result?.breakdown?.counseling_policy_notes;
    return Array.isArray(keys) ? keys.map(key => config.notices[key]).filter(Boolean).join(' · ') : '';
  }
  return {profile, prepare, notices, resultNotice};
});
