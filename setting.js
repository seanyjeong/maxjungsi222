/* ============================================================ */
/* setting.new.js — 환경 설정 (정시 선택반영 규칙 편집)         */
/* API:                                                           */
/*   GET  /jungsi/schools/{year}                                  */
/*   POST /jungsi/school-details                                  */
/*   POST /jungsi/calc-method/set                                 */
/*   POST /jungsi/rules/set                                       */
/*   POST /jungsi/bonus-rules/set                                 */
/*   POST /jungsi/score-config/set                                */
/*   POST /jungsi/special-formula/set                             */
/*   POST /jungsi/total/set                                       */
/*   POST /jungsi/other-settings/set                              */
/* ============================================================ */
'use strict';

(function () {
  // DOM 참조
  const yearSelector = document.getElementById('year-selector');
  const schoolIndexEl = document.getElementById('school-index');
  const schoolListEl = document.getElementById('school-list');
  const ruleEditorEl = document.getElementById('rule-editor');
  const welcomeMessageEl = document.getElementById('welcome-message');
  const editorTitleEl = document.getElementById('editor-title');
  const formulaTypeSelect = document.getElementById('formula-type-select');
  const specialFormulaWrapper = document.getElementById('special-formula-wrapper');
  const specialFormulaText = document.getElementById('special-formula-text');
  const defaultRulesWrapper = document.getElementById('default-rules-wrapper');
  const calcMethodButtons = document.getElementById('calc-method-buttons');
  const kmType = document.getElementById('km-type');
  const kmMaxScoreMethod = document.getElementById('km-max-score-method');
  const engType = document.getElementById('eng-type');
  const engMaxScoreButtons = document.getElementById('eng-max-score-buttons');
  const inqType = document.getElementById('inq-type');
  const inqMaxScoreMethod = document.getElementById('inq-max-score-method');
  const ruleGroupsContainerEl = document.getElementById('rule-groups-container');
  const bonusRulesContainerEl = document.getElementById('bonus-rules-container');
  const editorMessageEl = document.getElementById('editor-message');
  const addRuleBtn = document.getElementById('add-rule-btn');
  const setDefaultBtn = document.getElementById('set-default-btn');
  const addBonusRuleBtn = document.getElementById('add-bonus-rule-btn');
  const saveBtn = document.getElementById('save-btn');
  const totalButtons = document.getElementById('total-buttons');
  const totalCustom = document.getElementById('total-custom');
  const chkHistoryFirst = document.getElementById('chk-history-first');
  const gunFilterEl = document.getElementById('gun-filter');

  // 상태
  let allSchools = [];
  let currentSchool = null;
  let currentTotalValue = 1000;
  let currentOtherSettings = {};
  let currentInitial = 'ㄱ';
  let currentGun = '전체';

  const KOREAN_CONSONANTS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('');

  // ── utils ──
  function setStatus(text, kind) {
    editorMessageEl.textContent = text || '';
    editorMessageEl.classList.remove('is-success', 'is-error', 'is-info');
    if (kind) editorMessageEl.classList.add('is-' + kind);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getConsonant(str) {
    if (!str) return null;
    const ch = String(str).trim()[0];
    if (!ch) return null;
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return null;
    return KOREAN_CONSONANTS[Math.floor(code / 588)] || null;
  }

  function normGun(g) {
    if (!g) return '기타';
    const s = String(g).trim();
    if (s.indexOf('가') !== -1) return '가군';
    if (s.indexOf('나') !== -1) return '나군';
    if (s.indexOf('다') !== -1) return '다군';
    return s || '기타';
  }

  // ── 데이터 로드 ──
  async function loadSchools() {
    const selectedYear = yearSelector.value;
    ruleEditorEl.classList.add('hidden');
    welcomeMessageEl.classList.remove('hidden');

    try {
      const data = await window.api('/jungsi/schools/' + encodeURIComponent(selectedYear), { method: 'GET' });
      const rows =
        Array.isArray(data && data.schools) ? data.schools :
        Array.isArray(data && data.list) ? data.list :
        Array.isArray(data) ? data : [];

      allSchools = rows;
      renderSchoolIndex();
      currentInitial = 'ㄱ';
      currentGun = '전체';
      // 군 필터 버튼 active 리셋
      const activeGunBtn = gunFilterEl.querySelector('.chip-btn.active');
      if (activeGunBtn) activeGunBtn.classList.remove('active');
      const defaultGunBtn = gunFilterEl.querySelector('.chip-btn[data-gun="전체"]');
      if (defaultGunBtn) defaultGunBtn.classList.add('active');
      renderSchoolList(currentInitial, currentGun);
    } catch (err) {
      console.error('학교 목록 로딩 실패:', err);
      schoolListEl.innerHTML = '<li class="empty-hint">학교 목록을 불러오지 못했습니다.</li>';
      if (window.showToast) window.showToast('학교 목록 로드 실패', 'error');
    }
  }

  function renderSchoolIndex() {
    schoolIndexEl.innerHTML = '';
    KOREAN_CONSONANTS.forEach(function (c) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-btn';
      btn.textContent = c;
      if (c === currentInitial) btn.classList.add('active');
      btn.addEventListener('click', function () {
        const active = schoolIndexEl.querySelector('.chip-btn.active');
        if (active) active.classList.remove('active');
        btn.classList.add('active');
        currentInitial = c;
        renderSchoolList(currentInitial, currentGun);
      });
      schoolIndexEl.appendChild(btn);
    });
  }

  function renderSchoolList(initial, gunFilter) {
    schoolListEl.innerHTML = '';

    // 1) 초성 필터
    let filtered = (allSchools || []).filter(function (s) {
      const uniName = (s.대학명 || s.university || '').trim();
      return getConsonant(uniName) === initial;
    });

    // 2) 초성으로 0개면 전체로
    if (filtered.length === 0) filtered = allSchools || [];

    // 3) 군 필터
    if (gunFilter && gunFilter !== '전체') {
      filtered = filtered.filter(function (s) { return normGun(s.군) === gunFilter; });
    }

    // 4) 군별 버킷팅
    const orderGun = ['가군', '나군', '다군', '기타'];
    const buckets = { '가군': [], '나군': [], '다군': [], '기타': [] };

    filtered.forEach(function (s) {
      const g = normGun(s.군);
      (buckets[g] || buckets['기타']).push(s);
    });

    function byName(a, b) {
      const aName = (a.대학명 || a.university || '').trim();
      const bName = (b.대학명 || b.university || '').trim();
      const r1 = aName.localeCompare(bName, 'ko');
      if (r1) return r1;
      const aDept = (a.학과명 || a.department || '').trim();
      const bDept = (b.학과명 || b.department || '').trim();
      const r2 = aDept.localeCompare(bDept, 'ko');
      if (r2) return r2;
      return Number(a.U_ID) - Number(b.U_ID);
    }

    let printed = 0;

    orderGun.forEach(function (gun) {
      if (gunFilter !== '전체' && gun !== gunFilter) return;
      const arr = buckets[gun];
      if (!arr || arr.length === 0) return;

      const head = document.createElement('li');
      head.className = 'group-header';
      head.textContent = gun + ' · ' + initial;
      schoolListEl.appendChild(head);

      arr.sort(byName).forEach(function (school) {
        const li = buildSchoolItem(school, gun);
        schoolListEl.appendChild(li);
        printed++;
      });
    });

    // 전혀 없으면 전체 fallback
    if (printed === 0) {
      (allSchools || []).forEach(function (school) {
        const li = buildSchoolItem(school, normGun(school.군));
        schoolListEl.appendChild(li);
      });
    }
  }

  function buildSchoolItem(school, gun) {
    const li = document.createElement('li');
    li.dataset.uid = school.U_ID;
    const uni = (school.대학명 || school.university || '(대학명 없음)').trim();
    const dept = (school.학과명 || school.department || '').trim();
    li.innerHTML = '[' + escapeHtml(uni) + '] ' + escapeHtml(dept) +
      ' <span class="school-pill">' + escapeHtml(gun) + '</span>';

    if (school.selection_rules || school.bonus_rules || school.score_config || school.계산유형 === '특수공식') {
      li.classList.add('saved');
    }
    li.addEventListener('click', function () { handleSchoolClick(school.U_ID, li); });
    return li;
  }

  // 군 필터 클릭
  gunFilterEl.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'BUTTON') return;
    const active = gunFilterEl.querySelector('.chip-btn.active');
    if (active) active.classList.remove('active');
    t.classList.add('active');
    currentGun = t.dataset.gun;
    renderSchoolList(currentInitial, currentGun);
  });

  async function handleSchoolClick(u_id, liElement) {
    const prev = schoolListEl.querySelector('.selected');
    if (prev) prev.classList.remove('selected');
    liElement.classList.add('selected');

    try {
      const data = await window.api('/jungsi/school-details', {
        method: 'POST',
        body: JSON.stringify({ U_ID: u_id, year: yearSelector.value })
      });
      if (data && data.success) {
        currentSchool = data.data;
        renderRuleEditor(currentSchool);
      } else {
        if (window.showToast) window.showToast((data && data.message) || '학과 정보 로드 실패', 'error');
      }
    } catch (err) {
      console.error('학과 정보 로딩 실패:', err);
      if (window.showToast) window.showToast('학과 정보 로드 실패: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  function renderRuleEditor(schoolData) {
    welcomeMessageEl.classList.add('hidden');
    ruleEditorEl.classList.remove('hidden');

    editorTitleEl.textContent = '[' + (schoolData.대학명 || '') + '] ' + (schoolData.학과명 || '') + ' 규칙 설정';

    ruleGroupsContainerEl.innerHTML = '';
    bonusRulesContainerEl.innerHTML = '';
    setStatus('');

    formulaTypeSelect.value = schoolData.계산유형 || '기본비율';
    specialFormulaText.value = schoolData.특수공식 || '';
    toggleDefaultRulesVisibility();

    const calcMethod = schoolData.계산방식 || '환산';
    const activeCalc = calcMethodButtons.querySelector('.active');
    if (activeCalc) activeCalc.classList.remove('active');
    const calcBtn = calcMethodButtons.querySelector('button[data-method="' + calcMethod + '"]');
    if (calcBtn) calcBtn.classList.add('active');

    const savedTotal = Number(schoolData.총점 || 1000);
    currentTotalValue = savedTotal;
    const activeTotal = totalButtons.querySelector('.active');
    if (activeTotal) activeTotal.classList.remove('active');
    const presetBtn = totalButtons.querySelector('button[data-value="' + savedTotal + '"]');
    if (presetBtn) {
      presetBtn.classList.add('active');
      totalCustom.value = '';
    } else {
      const customBtn = totalButtons.querySelector('button[data-value="custom"]');
      if (customBtn) customBtn.classList.add('active');
      totalCustom.value = savedTotal;
    }

    let config = {};
    try {
      config = schoolData.score_config
        ? (typeof schoolData.score_config === 'string' ? JSON.parse(schoolData.score_config) : schoolData.score_config)
        : {};
    } catch (e) { config = {}; }

    kmType.value = (config.korean_math && config.korean_math.type) || '백분위';
    kmMaxScoreMethod.value = (config.korean_math && config.korean_math.max_score_method) || 'fixed_200';
    engType.value = (config.english && config.english.type) || 'grade_conversion';
    const activeEng = engMaxScoreButtons.querySelector('.active');
    if (activeEng) activeEng.classList.remove('active');
    if (config.english && config.english.max_score) {
      const engBtn = engMaxScoreButtons.querySelector('button[data-value="' + config.english.max_score + '"]');
      if (engBtn) engBtn.classList.add('active');
    }
    inqType.value = (config.inquiry && config.inquiry.type) || '백분위';
    inqMaxScoreMethod.value = (config.inquiry && config.inquiry.max_score_method) || 'fixed_100';
    toggleConditionalDropdowns();

    try {
      currentOtherSettings = schoolData.기타설정 ? JSON.parse(schoolData.기타설정) : {};
    } catch (e) {
      currentOtherSettings = {};
    }
    chkHistoryFirst.checked = currentOtherSettings.한국사우선적용 === true;

    // 선택 반영 규칙
    let selectionRules = null;
    try {
      selectionRules = schoolData.selection_rules
        ? (typeof schoolData.selection_rules === 'string' ? JSON.parse(schoolData.selection_rules) : schoolData.selection_rules)
        : null;
    } catch (e) { selectionRules = null; }
    const rulesArray = selectionRules ? (Array.isArray(selectionRules) ? selectionRules : [selectionRules]) : [];
    if (rulesArray.length === 0) {
      ruleGroupsContainerEl.innerHTML = '<p class="empty-hint">현재 "기본 반영 비율"이 적용되어 있습니다.</p>';
    } else {
      rulesArray.forEach(function (rule) { createRuleGroupUI(rule); });
    }

    // 가산점 규칙
    let bonusRules = null;
    try {
      bonusRules = schoolData.bonus_rules
        ? (typeof schoolData.bonus_rules === 'string' ? JSON.parse(schoolData.bonus_rules) : schoolData.bonus_rules)
        : null;
    } catch (e) { bonusRules = null; }
    const bonusRulesArray = bonusRules ? (Array.isArray(bonusRules) ? bonusRules : [bonusRules]) : [];
    if (bonusRulesArray.length === 0) {
      bonusRulesContainerEl.innerHTML = '<p class="empty-hint">설정된 가산점 규칙이 없습니다.</p>';
    } else {
      bonusRulesArray.forEach(function (rule) { createBonusRuleUI(rule); });
    }
  }

  function toggleDefaultRulesVisibility() {
    const isSpecial = formulaTypeSelect.value === '특수공식';
    specialFormulaWrapper.classList.toggle('hidden', !isSpecial);
    defaultRulesWrapper.classList.toggle('hidden', isSpecial);
  }

  function toggleConditionalDropdowns() {
    kmMaxScoreMethod.classList.toggle('hidden', kmType.value !== '표준점수');
    engMaxScoreButtons.classList.toggle('hidden', engType.value !== 'fixed_max_score');
    const inqShowMax = ['표준점수', '변환표준점수'].indexOf(inqType.value) !== -1;
    inqMaxScoreMethod.classList.toggle('hidden', !inqShowMax);
  }

  totalButtons.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'BUTTON') return;
    const active = totalButtons.querySelector('.active');
    if (active) active.classList.remove('active');
    t.classList.add('active');
    const v = t.dataset.value;
    if (v === 'custom') {
      totalCustom.focus();
    } else {
      currentTotalValue = Number(v);
      totalCustom.value = '';
    }
  });

  // 선택 반영 규칙 UI
  function createRuleGroupUI(rule) {
    rule = rule || null;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'rule-group';
    const type = (rule && rule.type) || 'select_n';
    groupDiv.innerHTML =
      '<div class="rule-header">' +
        '<select class="rule-type-select select-native">' +
          '<option value="select_n"' + (type === 'select_n' ? ' selected' : '') + '>N개 선택 (가중치 없음)</option>' +
          '<option value="select_ranked_weights"' + (type === 'select_ranked_weights' ? ' selected' : '') + '>순위별 가중치 (만능 규칙)</option>' +
        '</select>' +
        '<button type="button" class="delete-rule-btn" aria-label="규칙 삭제"><i class="ph-light ph-x"></i></button>' +
      '</div>' +
      '<div class="rule-body"></div>';

    const ruleBody = groupDiv.querySelector('.rule-body');
    const typeSelect = groupDiv.querySelector('.rule-type-select');

    function renderBody(selectedType, currentRule) {
      const subjects = ['국어', '수학', '영어', '탐구', '한국사'];
      const fromSubjects = (currentRule && currentRule.from) || [];
      const subjectHtml = subjects.map(function (s) {
        return '<label><input type="checkbox" value="' + escapeHtml(s) + '"' +
          (fromSubjects.indexOf(s) !== -1 ? ' checked' : '') + '>' + escapeHtml(s) + '</label>';
      }).join('');
      let bodyHtml = '<div><span class="form-label">대상 과목</span></div>' +
        '<div class="subject-checks">' + subjectHtml + '</div>';

      if (selectedType === 'select_n') {
        bodyHtml += '<div class="count-row">' +
          '<span>위 과목 중</span>' +
          '<input type="number" class="rule-count" value="' + ((currentRule && currentRule.count) || 1) + '" min="1">' +
          '<span>개 선택</span></div>';
      } else if (selectedType === 'select_ranked_weights') {
        const weightsStr = (currentRule && currentRule.weights) ? currentRule.weights.join(', ') : '';
        bodyHtml += '<div class="weights-row">' +
          '<span>순위별 가중치</span>' +
          '<input type="text" class="rule-weights" placeholder="예: 0.35, 0.25, 0.2" value="' + escapeHtml(weightsStr) + '">' +
          '</div>' +
          '<p class="hint-text">대상 과목보다 가중치 개수가 적으면, 상위 과목만 선택하여 반영합니다.</p>';
      }
      ruleBody.innerHTML = bodyHtml;
    }

    renderBody(type, rule);

    typeSelect.addEventListener('change', function (e) { renderBody(e.target.value, null); });
    groupDiv.querySelector('.delete-rule-btn').addEventListener('click', function () { groupDiv.remove(); });

    const p = ruleGroupsContainerEl.querySelector('.empty-hint');
    if (p) p.remove();
    ruleGroupsContainerEl.appendChild(groupDiv);
  }

  // 가산점 규칙 UI
  function createBonusRuleUI(rule) {
    rule = rule || null;
    const groupDiv = document.createElement('div');
    groupDiv.className = 'bonus-rule';
    const subjectsVal = (rule && rule.subjects) ? rule.subjects.join(', ') : '';
    const valueVal = (rule && (rule.value !== undefined && rule.value !== null)) ? rule.value : '';
    groupDiv.innerHTML =
      '<div class="bonus-rule-header">' +
        '<label>과목명(콤마 구분) <input type="text" class="bonus-subjects" placeholder="예: 미적분, 기하" value="' + escapeHtml(subjectsVal) + '"></label>' +
        '<label>가산비율(소수) <input type="number" class="bonus-value" step="0.001" placeholder="예: 0.06" value="' + escapeHtml(String(valueVal)) + '"></label>' +
        '<button type="button" class="delete-rule-btn" aria-label="규칙 삭제"><i class="ph-light ph-x"></i></button>' +
      '</div>';
    groupDiv.querySelector('.delete-rule-btn').addEventListener('click', function () { groupDiv.remove(); });
    const p = bonusRulesContainerEl.querySelector('.empty-hint');
    if (p) p.remove();
    bonusRulesContainerEl.appendChild(groupDiv);
  }

  // 저장
  async function handleSaveRules() {
    if (!currentSchool) return;
    const selectedYear = yearSelector.value;
    setStatus('저장 중...', 'info');

    // score config
    const scoreConfig = {
      korean_math: { type: kmType.value },
      english: { type: engType.value },
      inquiry: { type: inqType.value }
    };
    if (kmType.value === '표준점수') {
      scoreConfig.korean_math.max_score_method = kmMaxScoreMethod.value;
    }
    if (engType.value === 'fixed_max_score') {
      const activeBtn = engMaxScoreButtons.querySelector('button.active');
      if (activeBtn) scoreConfig.english.max_score = parseInt(activeBtn.dataset.value, 10);
    }
    if (['표준점수', '변환표준점수'].indexOf(inqType.value) !== -1) {
      scoreConfig.inquiry.max_score_method = inqMaxScoreMethod.value;
    }

    // selection rules
    const ruleGroups = ruleGroupsContainerEl.querySelectorAll('.rule-group');
    const rulesToSave = [];
    ruleGroups.forEach(function (group) {
      const type = group.querySelector('.rule-type-select').value;
      const from = Array.prototype.map.call(
        group.querySelectorAll('.rule-body input[type="checkbox"]:checked'),
        function (cb) { return cb.value; }
      );
      const rule = { type: type, from: from };
      if (type === 'select_n') {
        const cnt = group.querySelector('.rule-count');
        rule.count = parseInt(cnt ? cnt.value : '1', 10) || 1;
      } else if (type === 'select_ranked_weights') {
        const wEl = group.querySelector('.rule-weights');
        const weightsStr = wEl ? wEl.value : '';
        if (weightsStr) {
          rule.weights = weightsStr.split(',').map(function (w) { return parseFloat(w.trim()); });
        }
      }
      rulesToSave.push(rule);
    });
    const finalSelectionRules = rulesToSave.length === 0 ? null : (rulesToSave.length === 1 ? rulesToSave[0] : rulesToSave);

    // bonus rules
    const bonusRuleGroups = bonusRulesContainerEl.querySelectorAll('.bonus-rule');
    const bonusRulesToSave = [];
    bonusRuleGroups.forEach(function (group) {
      const subjects = group.querySelector('.bonus-subjects').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const value = parseFloat(group.querySelector('.bonus-value').value);
      if (subjects.length > 0 && !isNaN(value)) {
        bonusRulesToSave.push({ type: 'percent_bonus', subjects: subjects, value: value });
      }
    });
    const finalBonusRules = bonusRulesToSave.length === 0 ? null : bonusRulesToSave;

    const formulaType = formulaTypeSelect.value;
    const formulaText = specialFormulaText.value;
    const otherSettingsToSave = { 한국사우선적용: chkHistoryFirst.checked };

    // custom 총점 검증
    const customBtn = totalButtons.querySelector('button[data-value="custom"]');
    if (customBtn && customBtn.classList.contains('active')) {
      const val = Number(totalCustom.value);
      if (!isFinite(val) || val <= 0) {
        setStatus('총점 직접입력 값이 올바르지 않습니다.', 'error');
        if (window.showToast) window.showToast('총점 직접입력 값이 올바르지 않습니다', 'error');
        return;
      }
      currentTotalValue = val;
    }

    const activeMethodBtn = calcMethodButtons.querySelector('.active');
    const calcMethod = activeMethodBtn ? activeMethodBtn.dataset.method : '환산';

    try {
      const results = await Promise.all([
        window.api('/jungsi/calc-method/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, method: calcMethod })
        }),
        window.api('/jungsi/rules/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, rules: finalSelectionRules })
        }),
        window.api('/jungsi/bonus-rules/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, rules: finalBonusRules })
        }),
        window.api('/jungsi/score-config/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, config: scoreConfig })
        }),
        window.api('/jungsi/special-formula/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, formula_type: formulaType, formula_text: formulaText })
        }),
        window.api('/jungsi/total/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, total: currentTotalValue })
        }),
        window.api('/jungsi/other-settings/set', {
          method: 'POST',
          body: JSON.stringify({ U_ID: currentSchool.U_ID, year: selectedYear, settings: otherSettingsToSave })
        })
      ]);

      const allOk = results.every(function (r) { return r && r.success; });
      if (allOk) {
        setStatus('모든 규칙이 성공적으로 저장되었습니다.', 'success');
        if (window.showToast) window.showToast('저장 완료', 'success');

        // 목록 saved 토글
        const listItem = schoolListEl.querySelector('li[data-uid="' + currentSchool.U_ID + '"]');
        if (listItem) {
          const isOtherSettingSaved = otherSettingsToSave.한국사우선적용 === true;
          const isSaved = !!finalSelectionRules || !!finalBonusRules ||
            (JSON.stringify(scoreConfig) !== '{}') ||
            formulaType === '특수공식' ||
            calcMethod !== '환산' ||
            currentTotalValue !== 1000 ||
            isOtherSettingSaved;
          listItem.classList.toggle('saved', !!isSaved);
        }

        const schoolInList = allSchools.find(function (s) { return s.U_ID == currentSchool.U_ID; });
        if (schoolInList) {
          schoolInList.selection_rules = finalSelectionRules;
          schoolInList.bonus_rules = finalBonusRules;
          schoolInList.score_config = scoreConfig;
          schoolInList.계산유형 = formulaType;
          schoolInList.총점 = currentTotalValue;
          schoolInList.기타설정 = JSON.stringify(otherSettingsToSave);
        }
      } else {
        setStatus('일부 규칙 저장에 실패했습니다. 서버 로그를 확인하세요.', 'error');
        if (window.showToast) window.showToast('일부 저장 실패', 'error');
      }
    } catch (err) {
      console.error('저장 에러:', err);
      setStatus('서버 통신 오류: ' + (err && err.message ? err.message : ''), 'error');
      if (window.showToast) window.showToast('저장 실패: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  // ── 이벤트 바인딩 ──
  addRuleBtn.addEventListener('click', function () { createRuleGroupUI(null); });
  setDefaultBtn.addEventListener('click', function () {
    ruleGroupsContainerEl.innerHTML = '<p class="empty-hint">현재 "기본 반영 비율"이 적용되어 있습니다.</p>';
  });
  addBonusRuleBtn.addEventListener('click', function () { createBonusRuleUI(null); });
  saveBtn.addEventListener('click', handleSaveRules);
  yearSelector.addEventListener('change', loadSchools);
  formulaTypeSelect.addEventListener('change', toggleDefaultRulesVisibility);
  kmType.addEventListener('change', toggleConditionalDropdowns);
  engType.addEventListener('change', toggleConditionalDropdowns);
  inqType.addEventListener('change', toggleConditionalDropdowns);

  calcMethodButtons.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'BUTTON') return;
    const active = calcMethodButtons.querySelector('.active');
    if (active) active.classList.remove('active');
    t.classList.add('active');
  });
  engMaxScoreButtons.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'BUTTON') return;
    const active = engMaxScoreButtons.querySelector('.active');
    if (active) active.classList.remove('active');
    t.classList.add('active');
  });

  // ── 초기화 ──
  (function init() {
    if (!window.getToken || !window.getToken()) {
      if (window.handleAuthError) window.handleAuthError();
      return;
    }
    loadSchools();
  })();
})();
