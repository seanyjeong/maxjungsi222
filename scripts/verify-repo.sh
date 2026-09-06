#!/usr/bin/env bash
set -euo pipefail

python3 -m pytest -q \
  tests/test_september_exam_node.py \
  tests/test_september_exam_playwright.py
node scripts/september-grade-cuts.js
node --test \
  tests/migrate_high2_september_scores.test.js \
  tests/recompute_september_scores.test.js

files=(
  cut_editor.html
  cut_editor.js
  silgi-editor.html
  silgi-editor.js
  silgi-editor.css
  assets/js/pages/cutoff-save.js
  assets/js/pages/practical-save.js
  assets/js/pages/practical-editor-table.js
  tests/cutoff_save.test.js
  tests/practical_save.test.js
  tests/test_cut_editor_playwright.py
  tests/test_practical_editor_playwright.py
  .et/project.json
  .et/quality-execution.json
  _vultr_backend/grade_distribution_by_exam.js
  _vultr_backend/student_cohort.js
  _vultr_backend/student_list_by_branch.js
  add_student.js
  gachaejeom.js
  grade_distribution.js
  gradecut_editor.js
  scripts/apply-september-data.js
  scripts/migrate-high2-september-scores.js
  scripts/recompute-september-scores.js
  scripts/september-grade-cuts.js
  tests/september_exam_support.test.js
  tests/gacha_cohort.test.js
  tests/migrate_high2_september_scores.test.js
  tests/recompute_september_scores.test.js
  tests/test_september_exam_node.py
  tests/test_september_exam_playwright.py
  topmax_editor.js
  utils/examProfiles.js
  utils/gachaCohort.js
  utils/examSchedule.js
)

for editor_file in cut_editor.js silgi-editor.js assets/js/pages/cutoff-save.js assets/js/pages/practical-save.js assets/js/pages/practical-editor-table.js; do
  node --check "$editor_file"
done

oversized="$(wc -l "${files[@]}" | awk '$2 != "total" && $1 > 500 {print $0}')"
if [[ -n "$oversized" ]]; then
  echo "500줄을 초과한 변경 파일이 있습니다."
  echo "$oversized"
  exit 1
fi

# 8천 줄 레거시 서버에서는 수정 라우트를 모듈로 추출했고 본문이 줄었는지 확인한다.
if ! git diff --quiet -- _vultr_backend/jungsi.js; then
  before_lines="$(git show HEAD:_vultr_backend/jungsi.js | wc -l | tr -d ' ')"
  after_lines="$(wc -l < _vultr_backend/jungsi.js | tr -d ' ')"
  if (( after_lines >= before_lines )); then
    echo "레거시 서버 파일의 모듈 추출 결과가 줄어들지 않았습니다."
    exit 1
  fi
fi

git diff --check -- \
  .et .gitignore _vultr_backend/jungsi.js \
  _vultr_backend/grade_distribution_by_exam.js \
  _vultr_backend/student_cohort.js _vultr_backend/student_list_by_branch.js \
  add_student.js gachaejeom.html gachaejeom.js \
  grade_distribution.html grade_distribution.js \
  gradecut_editor.html gradecut_editor.js \
  scripts/apply-september-data.js scripts/etoos-september-grade-cuts.json \
  scripts/migrate-high2-september-scores.js scripts/september-grade-cuts.js \
  scripts/recompute-september-scores.js \
  tests/september_exam_support.test.js tests/gacha_cohort.test.js \
  tests/migrate_high2_september_scores.test.js \
  tests/recompute_september_scores.test.js \
  tests/test_september_exam_node.py tests/test_september_exam_playwright.py \
  topmax_editor.html topmax_editor.js utils/examProfiles.js \
  utils/gachaCohort.js utils/examSchedule.js

echo "9월 가채점 테스트·자료 무결성·문법·변경 파일 크기 검사를 통과했습니다."
