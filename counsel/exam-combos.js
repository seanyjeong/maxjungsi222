
  // yearSel / examSel hidden native select 와 시각 콤보 동기화
  (function () {
    document.addEventListener('DOMContentLoaded', () => {
      const yearHidden = document.getElementById('yearSel');
      const examHidden = document.getElementById('examSel');
      const yearComboEl = document.getElementById('yearSelCombo');
      const examComboEl = document.getElementById('examSelCombo');
      if (!yearHidden || !examHidden || !yearComboEl || !examComboEl) return;

      const syncHidden = (hidden, val) => {
        hidden.value = val;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const yearCombo = window.createCombobox(yearComboEl, {
        options: [{ value: '2027', label: '2027학년도' }, { value: '2026', label: '2026학년도' }],
        value: yearHidden.value,
        searchable: false,
        onChange: (v) => syncHidden(yearHidden, v),
      });
      const examCombo = window.createCombobox(examComboEl, {
        options: [
          { value: '3월', label: '3월 학평' },
          { value: '6월', label: '6월 모평' },
          { value: '9월', label: '9월 모평' },
          { value: '수능', label: '수능' },
        ],
        value: examHidden.value,
        searchable: false,
        onChange: (v) => syncHidden(examHidden, v),
      });

      // counsel 의 applyYearChange() 가 hidden.examSel.value = X 로 설정 후 examCombo label 반영
      // 이를 위해 hidden select 의 value 변경을 감지할 방법 필요. setter hook 사용:
      const origExamSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      Object.defineProperty(examHidden, 'value', {
        set(v) {
          origExamSetter.call(this, v);
          if (examCombo && examCombo.value !== v) examCombo.setValue(v);
        },
        get() {
          return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').get.call(this);
        },
        configurable: true,
      });
      Object.defineProperty(yearHidden, 'value', {
        set(v) {
          origExamSetter.call(this, v);  // 같은 setter 사용
          if (yearCombo && yearCombo.value !== v) yearCombo.setValue(v);
        },
        get() {
          return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').get.call(this);
        },
        configurable: true,
      });
    });
  })();
