/* 정시 라이브·컨설팅 허브 개인정보 마스킹과 원장 비밀번호 재확인 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxApplicantPrivacy = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  const BRANCH_MASK = '○○';
  const NAME_MASK = '○';
  const SCHOOL_MASK = 'X';
  const STORAGE_KEY = 'max_jungsi_privacy_enabled';

  function chars(value) {
    return Array.from(String(value == null ? '' : value).trim());
  }

  function maskName(value) {
    const parts = chars(value);
    if (!parts.length) return '';
    if (parts.length === 1) return NAME_MASK;
    if (parts.length === 2) return parts[0] + NAME_MASK;
    return parts[0] + NAME_MASK.repeat(parts.length - 2) + parts[parts.length - 1];
  }

  function maskBranch(value) {
    return chars(value).length ? BRANCH_MASK : '';
  }

  function maskSchool(value) {
    const school = String(value == null ? '' : value).trim();
    if (!school) return '';
    const suffix = school.endsWith('고등학교') ? '고등학교' : (school.endsWith('고') ? '고' : '');
    const base = chars(suffix ? school.slice(0, -suffix.length) : school);
    if (!base.length) return SCHOOL_MASK + suffix;
    base[Math.floor(base.length / 2)] = SCHOOL_MASK;
    return base.join('') + suffix;
  }

  function maskApplicant(applicant) {
    return Object.assign({}, applicant, {
      name: maskName(applicant && applicant.name),
      branch: maskBranch(applicant && applicant.branch),
      school_name: maskSchool(applicant && applicant.school_name),
    });
  }

  function isEnabled(storage) {
    const target = storage || (root && root.sessionStorage);
    return !!target && target.getItem(STORAGE_KEY) === 'true';
  }

  function setEnabled(enabled, storage) {
    const target = storage || (root && root.sessionStorage);
    if (target) target.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    return !!enabled;
  }

  async function verifyOwnerPassword(options) {
    const opts = options || {};
    const userid = String(opts.userid || '').trim();
    const password = String(opts.password || '');
    if (!userid) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
    if (!password) throw new Error('비밀번호를 입력해 주세요.');

    let response;
    try {
      response = await opts.fetchFn(opts.apiBase + '/susi/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid, password }),
      });
    } catch (_) {
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    const status = Number(response && response.status) || 0;
    if (data && data.success && data.token) return true;
    if (status === 429) throw new Error('확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (status >= 500) throw new Error('비밀번호를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    throw new Error('비밀번호가 올바르지 않습니다.');
  }

  function createController(options) {
    const opts = options || {};

    function updateButton() {
      const button = document.getElementById('btnPrivacy');
      const enabled = isEnabled();
      button.classList.toggle('is-active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('i').className = enabled ? 'ph-light ph-eye' : 'ph-light ph-eye-slash';
      button.querySelector('span').textContent = enabled ? '개인정보 원문 보기' : '개인정보 가리기';
    }

    function setMessage(message, kind) {
      const element = document.getElementById('privacyPasswordMessage');
      element.textContent = message || '';
      element.className = 'privacy-message' + (kind ? ' ' + kind : '');
    }

    function openModal() {
      const enabled = isEnabled();
      document.getElementById('privacyPasswordTitle').textContent = enabled
        ? '개인정보 원문 보기'
        : '개인정보 가리기';
      document.getElementById('privacyPasswordHelp').textContent = enabled
        ? '학생 정보를 원문으로 표시하려면 현재 로그인한 원장님의 비밀번호를 입력해 주세요.'
        : '이름·지점·고교를 가림 처리하려면 현재 로그인한 원장님의 비밀번호를 입력해 주세요.';
      document.getElementById('privacyPassword').value = '';
      setMessage('', '');
      root.openModal('privacyPasswordModal');
      setTimeout(function () { document.getElementById('privacyPassword').focus(); }, 50);
    }

    async function submit(event) {
      event.preventDefault();
      const submitButton = document.getElementById('privacyPasswordSubmit');
      const counselor = (root.getCounselorFromToken && root.getCounselorFromToken()) || {};
      submitButton.disabled = true;
      submitButton.querySelector('span').textContent = '확인 중…';
      setMessage('비밀번호를 확인하고 있습니다.', 'info');
      try {
        await verifyOwnerPassword({
          apiBase: root.API_BASE,
          fetchFn: root.fetch.bind(root),
          password: document.getElementById('privacyPassword').value,
          userid: counselor.userid,
        });
        const enabled = setEnabled(!isEnabled());
        updateButton();
        if (typeof opts.onChange === 'function') opts.onChange(enabled);
        root.closeModal('privacyPasswordModal');
        root.showToast(
          enabled ? '개인정보 가리기가 활성화되었습니다.' : '개인정보 원문 보기가 활성화되었습니다.',
          'success'
        );
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.querySelector('span').textContent = '확인';
      }
    }

    function init() {
      document.getElementById('btnPrivacy').addEventListener('click', openModal);
      document.getElementById('privacyPasswordForm').addEventListener('submit', submit);
      updateButton();
    }

    return {
      init,
      isEnabled,
      visibleApplicant: function (applicant) {
        return isEnabled() ? maskApplicant(applicant) : applicant;
      },
    };
  }

  return {
    STORAGE_KEY,
    createController,
    isEnabled,
    maskApplicant,
    maskBranch,
    maskName,
    maskSchool,
    setEnabled,
    verifyOwnerPassword,
  };
});
