'use strict';

const crypto = require('node:crypto');

const LOCK_WAIT_SECONDS = 5;
const VALID_GENDERS = new Set(['남', '여']);
const VALID_GRADES = new Set(['2', '3', 'N']);
const VALID_PHONE_OWNERS = new Set(['학생', '학부모']);

function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/gu, ' ');
}

function encodeKeyPart(value) {
  return `${value.length}:${value}`;
}

function buildStudentIdentityKey(student) {
  return [
    student && student.student_name,
    student && student.school_name,
    student && student.gender,
    student && student.grade,
  ].map(normalizeIdentityText).map(encodeKeyPart).join('|');
}

function buildLockName(branch, year) {
  const scope = `${String(branch)}\0${String(year)}`;
  const digest = crypto.createHash('sha256').update(scope).digest('hex').slice(0, 40);
  return `jungsi-student-bulk:${digest}`;
}

function normalizeStudent(rawStudent) {
  const student = rawStudent && typeof rawStudent === 'object' ? rawStudent : {};
  const normalized = {
    student_name: normalizeIdentityText(student.student_name),
    school_name: normalizeIdentityText(student.school_name) || null,
    phone_number: normalizeIdentityText(student.phone_number) || null,
    phone_owner: normalizeIdentityText(student.phone_owner) || '학생',
    grade: normalizeIdentityText(student.grade),
    gender: normalizeIdentityText(student.gender),
  };

  if (!normalized.student_name) {
    return { error: { name: '이름 없음', reason: '이름을 입력해주세요.' } };
  }
  if (!VALID_GRADES.has(normalized.grade)) {
    return {
      error: { name: normalized.student_name, reason: '학년을 다시 선택해주세요.' },
    };
  }
  if (!VALID_GENDERS.has(normalized.gender)) {
    return {
      error: { name: normalized.student_name, reason: '성별을 다시 선택해주세요.' },
    };
  }
  if (!VALID_PHONE_OWNERS.has(normalized.phone_owner)) {
    return {
      error: { name: normalized.student_name, reason: '전화번호 구분을 다시 선택해주세요.' },
    };
  }
  return { student: normalized };
}

function buildResultMessage(insertedCount, duplicateCount, errorCount) {
  let message = `총 ${insertedCount}명의 학생을 추가했습니다.`;
  const details = [];
  if (duplicateCount > 0) details.push(`중복 ${duplicateCount}명 제외`);
  if (errorCount > 0) details.push(`${errorCount}명 오류`);
  if (details.length > 0) message += ` (${details.join(', ')})`;
  return message;
}

function createStudentBulkAddHandler(db, logger = console) {
  return async function studentBulkAdd(req, res) {
    const branch = normalizeIdentityText(req.user && req.user.branch);
    const year = normalizeIdentityText(req.body && req.body.학년도);
    const students = req.body && req.body.students;

    if (!branch) {
      return res.status(403).json({
        success: false,
        message: '로그인 정보를 다시 확인해주세요.',
      });
    }
    if (!/^\d{4}$/.test(year) || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: '학년도와 학생 정보를 다시 확인해주세요.',
      });
    }

    let connection;
    let lockAcquired = false;
    let transactionStarted = false;
    const lockName = buildLockName(branch, year);

    try {
      connection = await db.getConnection();
      const [lockRows] = await connection.query(
        'SELECT GET_LOCK(?, ?) AS acquired_lock',
        [lockName, LOCK_WAIT_SECONDS],
      );
      lockAcquired = Number(lockRows && lockRows[0] && lockRows[0].acquired_lock) === 1;
      if (!lockAcquired) {
        return res.status(409).json({
          success: false,
          message: '다른 명단을 등록하고 있습니다. 잠시 후 다시 시도해주세요.',
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;
      const [existingStudents] = await connection.query(`
        SELECT student_name, school_name, gender, grade
        FROM 학생기본정보
        WHERE branch_name = ? AND 학년도 = ?
      `, [branch, year]);
      const identityKeys = new Set(existingStudents.map(buildStudentIdentityKey));
      const errors = [];
      let insertedCount = 0;
      let duplicateCount = 0;

      const insertSql = `
        INSERT INTO 학생기본정보
          (학년도, branch_name, student_name, school_name, phone_number, phone_owner, grade, gender)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const rawStudent of students) {
        const normalized = normalizeStudent(rawStudent);
        if (normalized.error) {
          errors.push(normalized.error);
          continue;
        }
        const currentStudent = normalized.student;
        const identityKey = buildStudentIdentityKey(currentStudent);
        if (identityKeys.has(identityKey)) {
          duplicateCount += 1;
          continue;
        }

        const [result] = await connection.query(insertSql, [
          year,
          branch,
          currentStudent.student_name,
          currentStudent.school_name,
          currentStudent.phone_number,
          currentStudent.phone_owner,
          currentStudent.grade,
          currentStudent.gender,
        ]);
        if (result.affectedRows > 0) {
          insertedCount += 1;
          identityKeys.add(identityKey);
        }
      }

      await connection.commit();
      transactionStarted = false;
      return res.status(201).json({
        success: true,
        message: buildResultMessage(insertedCount, duplicateCount, errors.length),
        insertedCount,
        duplicateCount,
        errors,
      });
    } catch (error) {
      if (transactionStarted && connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('[student-bulk-add] rollback failed', rollbackError);
        }
      }
      logger.error('[student-bulk-add] failed', error);
      return res.status(500).json({
        success: false,
        message: '학생 명단을 추가하지 못했습니다. 잠시 후 다시 시도해주세요.',
      });
    } finally {
      if (connection) {
        if (lockAcquired) {
          try {
            await connection.query('SELECT RELEASE_LOCK(?) AS released_lock', [lockName]);
          } catch (releaseError) {
            logger.error('[student-bulk-add] lock release failed', releaseError);
          }
        }
        connection.release();
      }
    }
  };
}

module.exports = {
  buildStudentIdentityKey,
  createStudentBulkAddHandler,
  normalizeIdentityText,
};
