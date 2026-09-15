'use strict';
(function () {
  window.finalApplyCardTemplate = function (gun, guns) {
    return `
      <div class="gun-card" data-gun="${gun}">
        <div class="gun-head">
          <div class="gun-title">
            <span class="gun-badge">${gun}</span>
            <span>${gun}군 최종 지원</span>
            <span class="label-en">GROUP ${['A','B','C'][guns.indexOf(gun)]}</span>
          </div>
          <button class="btn btn-sm btn-danger-ghost reset-btn" type="button">
            <i class="ph ph-arrow-counter-clockwise"></i> 초기화
          </button>
        </div>
        <div class="gun-body">
          <div class="field"><label>대학</label><div class="uni-cb"></div></div>
          <div class="field"><label>학과</label><div class="dept-cb"></div></div>

          <div class="womens-warning hidden">
            <i class="ph-fill ph-warning"></i>
            <span>남학생은 이 대학에 지원할 수 없습니다.</span>
          </div>

          <div class="dept-dependent hidden">
            <div class="score-hud empty">
              <div class="row suneung"><div class="label"><span class="dot"></span>수능 점수</div><div class="value suneung-v mono">0.00</div></div>
              <div class="row naeshin hidden"><div class="label"><span class="dot"></span>내신 점수</div><div class="value naeshin-v mono">0.00</div></div>
              <div class="row silgi"><div class="label"><span class="dot"></span>실기 점수</div><div class="value silgi-v mono">0.00<span class="deduction"></span></div></div>
              <div class="divider"></div>
              <div class="total"><div class="label">총점</div><div class="value total-v mono">0.00<span class="unit">/1000</span></div></div>
              <div class="bar"><div class="fill"></div></div>
              <div class="bar-label"><span class="bar-cur">0</span><span class="bar-max">0</span></div>
            </div>

            <div class="input-block naeshin-block hidden" style="margin-top:12px;">
              <div class="block-label">내신 점수 <span class="naeshin-hint" style="color:var(--text-3); font-size:11px;">(입력값 그대로 총점에 반영)</span></div>
              <input type="number" class="naeshin-input" step="0.01" placeholder="내신 점수 입력" />
            </div>

            <div class="input-block silgi-block" style="margin-top:12px;">
              <div class="block-label">실기 기록</div>
              <div class="silgi-rows"></div>
            </div>

            <div class="result-grid" style="margin-top:14px;">
              <div class="field">
                <label>1단계 결과</label>
                <div class="stage1-cb"></div>
              </div>
              <div class="field">
                <label>최초 결과</label>
                <div class="reserve-group">
                  <div class="initial-cb" style="flex:1;"></div>
                  <input type="number" class="reserve-number-input hidden" placeholder="번호" />
                </div>
              </div>
              <div class="field">
                <label>최종 결과</label>
                <div class="final-cb"></div>
              </div>
              <div class="field">
                <label>최종 등록</label>
                <div class="register-cb"></div>
              </div>
            </div>

            <div class="input-block" style="margin-top:12px;">
              <div class="block-label">메모</div>
              <textarea class="memo-input" rows="2" placeholder="상담 메모를 입력하세요…"></textarea>
            </div>
          </div>

          <div class="card-placeholder placeholder-block">
            <i class="ph ph-cursor-click"></i>
            <div>대학·학과를 선택하면<br/>환산 점수 및 입력 칸이 표시됩니다.</div>
          </div>
        </div>
      </div>`;
  };
})();
