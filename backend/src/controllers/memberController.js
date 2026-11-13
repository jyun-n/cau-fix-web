const bcrypt = require('bcrypt');
const memberModel = require('../models/memberModel');
const memberLogModel = require('../models/memberLogModel');
const categoryModel = require('../models/categoryModel');
const accountSwitchModel = require('../models/accountSwitchModel');

// 관리자 계정 생성용 2차 비밀번호는 .env의 ADMIN_CREATE_PASSWORD_HASH(bcrypt 해시)로만 설정한다.
// 리포가 공개 저장소이므로 평문은 물론 해시도 코드에 두지 않는다.
// 미설정 시 관리자 생성 기능은 비활성(503) — 다른 기능과 서버 기동에는 영향 없음.
// 해시 생성(backend 폴더에서): node -e "console.log(require('bcrypt').hashSync(process.argv[1], 12))" '비밀번호'
// .env에는 작은따옴표로 감싸서 넣는다: ADMIN_CREATE_PASSWORD_HASH='$2b$12$...'
const getAdminCreatePasswordHash = () => process.env.ADMIN_CREATE_PASSWORD_HASH || '';

const ADMIN_CREATE_DISABLED_MESSAGE = '관리자 생성 비밀번호가 서버에 설정되지 않았습니다. 시스템 담당자에게 문의해주세요.';

const verifyAdminCreatePassword = async (input) => {
  const hash = getAdminCreatePasswordHash();
  if (!hash || !input || typeof input !== 'string') return false;
  return bcrypt.compare(input, hash);
};

const memberController = {
  // 관리자 생성 비밀번호 확인 (관리자) — 생성 폼을 열기 전 단계
  verifyAdminCreatePassword: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }
      if (!getAdminCreatePasswordHash()) {
        return res.status(503).json({ message: ADMIN_CREATE_DISABLED_MESSAGE });
      }
      const ok = await verifyAdminCreatePassword(req.body.create_password);
      if (!ok) {
        return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
      }
      return res.status(200).json({ message: '확인되었습니다.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 관리자 계정 생성 (관리자) — 생성 비밀번호를 서버에서 다시 검증한다
  createAdmin: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { create_password, login_id, password, name, dept, phone } = req.body;

      if (!getAdminCreatePasswordHash()) {
        return res.status(503).json({ message: ADMIN_CREATE_DISABLED_MESSAGE });
      }
      const ok = await verifyAdminCreatePassword(create_password);
      if (!ok) {
        return res.status(401).json({ message: '관리자 생성 비밀번호가 일치하지 않습니다.' });
      }

      if (!login_id || !password || !name || !name.trim()) {
        return res.status(400).json({ message: '필수 항목을 입력해주세요.' });
      }
      if (!/^\d{1,20}$/.test(login_id)) {
        return res.status(400).json({ message: '아이디는 사번(숫자)만 입력 가능합니다.' });
      }

      // 비밀번호 정책: 회원가입과 동일 (영어 소문자 및 숫자 포함 10자 이상)
      if (!/[a-z]/.test(password) || !/[0-9]/.test(password) || password.length < 10) {
        return res.status(400).json({ message: '비밀번호는 영어 소문자 및 숫자를 포함하여 10자 이상이어야 합니다.' });
      }

      const existing = await memberModel.findByLoginId(login_id);
      if (existing) {
        return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const member = await memberModel.createAdmin({
        login_id,
        password: hashedPassword,
        name: name.trim(),
        dept: (dept || '').trim() || null,
        phone: (phone || '').trim() || null,
      });

      // 승인 로그(A)로 생성자 기록 → 회원 상세의 "승인자"에 표시됨
      await memberLogModel.create({
        member_id: member.member_id,
        action: 'A',
        done_by: req.user.login_id || 'admin',
        detail: '관리자 계정 생성',
      });

      return res.status(201).json({ message: '관리자 계정이 생성되었습니다.', member });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 회원 목록 조회 (관리자)
  getAll: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }
      const members = await memberModel.findAll();
      return res.status(200).json({ members });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 회원 승인 (관리자)
  approve: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { id } = req.params;
      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }
      if (member.is_approved) {
        return res.status(409).json({ message: '이미 승인된 회원입니다.' });
      }

      const adminName = req.user.login_id || 'admin';
      const updated = await memberModel.approve(id);
      await memberLogModel.create({ member_id: id, action: 'A', done_by: adminName });
      return res.status(200).json({ message: '승인이 완료되었습니다.', member: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 권한 변경 (관리자)
  updateRole: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { id } = req.params;
      const { role } = req.body;

      if (!['C', 'E', 'A'].includes(role)) {
        return res.status(400).json({ message: '유효하지 않은 권한입니다.' });
      }

      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      const updated = await memberModel.updateRole(id, role);
      await memberLogModel.create({ member_id: id, action: 'R', done_by: req.user.login_id || 'admin', detail: `${member.role} → ${role}` });
      return res.status(200).json({ message: '권한이 변경되었습니다.', member: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 담당 카테고리 변경 (관리자)
  updateDept: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { id } = req.params;
      const { dept } = req.body;

      // DB에서 유효한 카테고리 목록 조회
      const categories = await categoryModel.findAll();
      const validDepts = ['전체', ...categories.map((c) => c.category_name)];

      if (!dept || !validDepts.includes(dept)) {
        return res.status(400).json({
          message: '유효하지 않은 카테고리입니다.',
          valid: validDepts,
        });
      }

      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      if (member.role !== 'E') {
        return res.status(400).json({ message: '처리자만 담당 카테고리를 변경할 수 있습니다.' });
      }

      const updated = await memberModel.updateDept(id, dept);
      return res.status(200).json({ message: '담당 카테고리가 변경되었습니다.', member: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 내 정보 수정 (본인)
  updateProfile: async (req, res) => {
    try {
      const { password, phone, dept } = req.body;
      const member_id = req.user.member_id;

      // 하나도 입력 안 했으면 에러
      if (!password && !phone && !dept) {
        return res.status(400).json({ message: '수정할 항목을 입력해주세요.' });
      }

      const member = await memberModel.findById(member_id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      let hashedPassword;
      if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
      }

      const updated = await memberModel.updateProfile(member_id, {
        password: hashedPassword,
        phone: phone || member.phone,
        dept: dept || member.dept,
      });

      // 비밀번호 변경 시 본인 아이디로 로그 기록 (초기화 상태 해제용)
      if (password) {
        await memberLogModel.create({ member_id, action: 'P', done_by: req.user.login_id });
        // 저장된 전환 계정 무효화 → 다음 전환 시 재등록 유도
        // (계정전환 부가기능 오류가 비밀번호 변경 자체를 실패시키지 않도록 격리)
        try {
          await accountSwitchModel.revokeByMember(member_id);
        } catch (e) {
          console.error('account_link revoke skip:', e.message);
        }
      }

      return res.status(200).json({ message: '내 정보가 수정되었습니다.', member: updated });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 비밀번호 초기화 (관리자)
  resetPassword: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { id } = req.params;
      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      // 비밀번호를 아이디로 초기화
      const hashedPassword = await bcrypt.hash(member.login_id, 10);
      await memberModel.resetPassword(id, hashedPassword);
      await memberLogModel.create({ member_id: id, action: 'P', done_by: req.user.login_id || 'admin' });
      // 저장된 전환 계정 무효화 → 다음 전환 시 재등록 유도
      // (계정전환 부가기능 오류가 비밀번호 초기화 자체를 실패시키지 않도록 격리)
      try {
        await accountSwitchModel.revokeByMember(id);
      } catch (e) {
        console.error('account_link revoke skip:', e.message);
      }
      //비밀번호 초기화 => db 데이터 
      return res.status(200).json({ message: '비밀번호가 초기화되었습니다.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 회원 탈퇴 (관리자만)
  delete: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const { id } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: '비밀번호를 입력해주세요.' });
      }

      // 관리자 본인 비밀번호 확인
      const admin = await memberModel.findByLoginId(req.user.login_id);
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
      }

      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      await memberModel.softDelete(id);
      await memberLogModel.create({ member_id: id, action: 'D', done_by: req.user.login_id || 'admin' });
      return res.status(200).json({ message: '탈퇴 처리가 완료되었습니다.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 프로필 조회 (처리자/신고자 정보 - 민원 상세에서 사용)
  getProfile: async (req, res) => {
    try {
      const { id } = req.params;
      const { role, member_id } = req.user;

      const member = await memberModel.findById(id);
      if (!member) {
        return res.status(404).json({ message: '회원을 찾을 수 없습니다.' });
      }

      // 일반 사용자(C)는 본인 또는 담당 처리자/관리자(E/A) 프로필만 조회 가능
      // (다른 일반 사용자의 개인 연락처 무단 수집 방지)
      if (role === 'C' && member.member_id !== member_id && !['E', 'A'].includes(member.role)) {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      return res.status(200).json({
        profile: {
          name: member.name,
          dept: member.dept,
          phone: member.phone,
        },
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },

  // 회원 로그 조회 (관리자)
  getLogs: async (req, res) => {
    try {
      if (req.user.role !== 'A') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }
      const { id } = req.params;
      const logs = await memberLogModel.findByMemberId(id);
      return res.status(200).json({ logs });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: '서버 오류가 발생했습니다.' });
    }
  },
};

module.exports = memberController;