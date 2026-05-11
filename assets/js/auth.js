/* ============================================================ */
/* auth.js — JWT 토큰 저장/조회 + 인증 오류 핸들링 + JWT 한글 페이로드 디코딩 */
/* ============================================================ */

(function () {
  'use strict';

  window.API_BASE = 'https://supermax.kr';
  var LOGIN_PAGE = 'jungsilogin.html';

  window.getToken = function () {
    return localStorage.getItem('jwt_token');
  };

  window.setToken = function (t) {
    localStorage.setItem('jwt_token', t);
  };

  window.clearToken = function () {
    localStorage.removeItem('jwt_token');
  };

  var _authErrorFired = false;
  window.handleAuthError = function () {
    if (_authErrorFired) return;  // 병렬 API 호출에서 중복 토스트/리다이렉트 방지
    _authErrorFired = true;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('인증 만료. 다시 로그인하세요', 'error');
      }
    } catch (e) { /* toast 미로드 시 무시 */ }
    window.clearToken();
    setTimeout(function () {
      window.location.href = LOGIN_PAGE;
    }, 1200);
  };

  // JWT payload 한글 UTF-8 안전 디코딩 (atob + percent-encoding)
  window.getCounselorFromToken = function () {
    var token = window.getToken();
    if (!token) return { name: '', branch: '' };
    try {
      var payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var json = decodeURIComponent(
        Array.prototype.map.call(atob(payload), function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      var p = JSON.parse(json);
      return { name: p.name || '', branch: p.branch || '', userid: p.userid || '', role: p.role || '' };
    } catch (e) {
      console.warn('[JWT decode]', e);
      return { name: '', branch: '' };
    }
  };
})();
