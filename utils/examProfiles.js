/**
 * 학년도별 가채점 과목 체계.
 * 브라우저와 Node 테스트에서 함께 사용한다.
 */
(function attachExamProfiles(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JungsiExamProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExamProfiles() {
  'use strict';

  const HIGH3_SOCIAL = [
    '생활과윤리', '윤리와사상', '한국지리', '세계지리', '동아시아사',
    '세계사', '정치와법', '경제', '사회문화',
  ];
  const HIGH3_SCIENCE = [
    '물리1', '화학1', '생명과학1', '지구과학1',
    '물리2', '화학2', '생명과학2', '지구과학2',
  ];

  const PROFILES = {
    2027: {
      schoolGrade: '3',
      korean: ['화법과작문', '언어와매체'],
      math: ['확률과통계', '미적분', '기하'],
      inquiryGroups: [
        { label: '사회탐구', subjects: HIGH3_SOCIAL },
        { label: '과학탐구', subjects: HIGH3_SCIENCE },
      ],
      inquiry: [...HIGH3_SOCIAL, ...HIGH3_SCIENCE],
      defaults: {
        korean: '화법과작문',
        math: '확률과통계',
        inquiry1: '',
        inquiry2: '',
      },
    },
    2028: {
      schoolGrade: '2',
      korean: ['국어'],
      math: ['수학'],
      inquiryGroups: [
        { label: '통합탐구', subjects: ['통합사회', '통합과학'] },
      ],
      inquiry: ['통합사회', '통합과학'],
      defaults: {
        korean: '국어',
        math: '수학',
        inquiry1: '통합사회',
        inquiry2: '통합과학',
      },
    },
  };

  function getExamProfile(year) {
    return PROFILES[Number(year)] || PROFILES[2027];
  }

  function getExamProfileForStudent(student, registeredYear) {
    if (Number(registeredYear) === 2027 && String(student && student.grade) === '2') {
      return PROFILES[2028];
    }
    return getExamProfile(registeredYear);
  }

  function getSubjectGroups(year) {
    const profile = getExamProfile(year);
    const groups = [
      { label: '국어', options: profile.korean },
      { label: '수학', options: profile.math },
      ...profile.inquiryGroups.map((group) => ({
        label: group.label,
        options: group.subjects,
      })),
    ];
    if (Number(year) === 2027) {
      groups.push(
        { label: '고2 공통', options: ['국어', '수학'] },
        { label: '고2 통합탐구', options: ['통합사회', '통합과학'] },
      );
    }
    return groups;
  }

  function getAllSubjects(year) {
    return getSubjectGroups(year).flatMap((group) => group.options);
  }

  return { getAllSubjects, getExamProfile, getExamProfileForStudent, getSubjectGroups };
});
