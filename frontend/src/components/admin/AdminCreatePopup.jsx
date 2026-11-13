import { useState, useEffect } from "react";
import { X, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { verifyAdminCreatePassword, createAdminMember } from "../../services/memberService";
import "../form/FormPopup.css";
import "./AdminCreatePopup.css";

/**
 * 관리자 계정 생성 팝업 (3단계)
 *  1) warn : 관리자 남발 주의 안내
 *  2) gate : 관리자 생성 비밀번호 확인 (서버 검증)
 *  3) form : 관리자 정보 입력 → 생성 (서버에서 생성 비밀번호 재검증)
 */
const EMPTY_FORM = { login_id: "", password: "", passwordConfirm: "", name: "", dept: "", phone: "" };

// 비밀번호 입력칸 + 눈 아이콘(보기/숨기기 토글)
const PasswordInput = ({ ...props }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="admin-create-pw-wrap">
      <input {...props} type={visible ? "text" : "password"} className="admin-create-input" />
      <button
        type="button"
        className="admin-create-pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        title={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

const AdminCreatePopup = ({ isOpen, onClose, onCreated }) => {
  const [step, setStep] = useState("warn");
  const [createPassword, setCreatePassword] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 열릴 때마다 처음 단계부터, 입력값 초기화 (생성 비밀번호를 메모리에 남기지 않음)
  useEffect(() => {
    if (isOpen) {
      setStep("warn");
      setCreatePassword("");
      setForm(EMPTY_FORM);
      setError("");
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setCreatePassword("");
    setForm(EMPTY_FORM);
    onClose();
  };

  const handleGateSubmit = async (e) => {
    e.preventDefault();
    if (!createPassword) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyAdminCreatePassword(createPassword);
      setStep("form");
    } catch (err) {
      setError(err.message || "비밀번호 확인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // 아이디는 사번(숫자)만 입력되도록 숫자 외 문자는 걸러냄
    const next = name === "login_id" ? value.replace(/\D/g, "").slice(0, 20) : value;
    setForm((prev) => ({ ...prev, [name]: next }));
  };

  const validateForm = () => {
    if (!form.login_id.trim() || !form.password || !form.name.trim()) return "아이디, 비밀번호, 이름은 필수입니다.";
    if (!/^\d{1,20}$/.test(form.login_id)) return "아이디는 사번(숫자)만 입력 가능합니다.";
    if (!/[a-z]/.test(form.password) || !/[0-9]/.test(form.password) || form.password.length < 10) {
      return "비밀번호는 영어 소문자 및 숫자를 포함하여 10자 이상이어야 합니다.";
    }
    if (form.password !== form.passwordConfirm) return "비밀번호가 일치하지 않습니다.";
    return "";
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const msg = validateForm();
    if (msg) {
      setError(msg);
      return;
    }
    if (!window.confirm(`'${form.name.trim()}'(${form.login_id}) 관리자 계정을 생성하시겠습니까?`)) return;

    setLoading(true);
    setError("");
    try {
      await createAdminMember({
        create_password: createPassword,
        login_id: form.login_id.trim(),
        password: form.password,
        name: form.name.trim(),
        dept: form.dept.trim(),
        phone: form.phone.trim(),
      });
      alert("관리자 계정이 생성되었습니다.");
      onCreated?.();
      handleClose();
    } catch (err) {
      setError(err.message || "관리자 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const titles = { warn: "관리자 추가", gate: "관리자 생성 비밀번호", form: "관리자 계정 생성" };

  return (
    <div className="form-overlay" onClick={handleClose}>
      <div className="admin-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="form-top-bar">
          <h2 className="admin-create-title">{titles[step]}</h2>
          <button className="form-close-btn" onClick={handleClose} aria-label="닫기">
            <X size={22} />
          </button>
        </div>
        <hr className="form-divider" />

        {step === "warn" && (
          <div className="admin-create-body">
            <div className="admin-create-warning">
              <AlertTriangle size={22} />
              <p>
                관리자를 많이 만들면 관리하는 데 좋지 않습니다.
                <br />
                관리자 계정 생성 시 주의해주세요.
              </p>
            </div>
            <div className="admin-create-actions">
              <button type="button" className="admin-create-btn secondary" onClick={handleClose}>취소</button>
              <button type="button" className="admin-create-btn primary" onClick={() => { setError(""); setStep("gate"); }}>확인</button>
            </div>
          </div>
        )}

        {step === "gate" && (
          <form className="admin-create-body" onSubmit={handleGateSubmit}>
            <p className="admin-create-desc">관리자 생성 비밀번호를 입력해주세요.</p>
            <PasswordInput
              placeholder="관리자 생성 비밀번호"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              autoFocus
              autoComplete="off"
              disabled={loading}
            />
            {error && <p className="admin-create-error">{error}</p>}
            <div className="admin-create-actions">
              <button type="button" className="admin-create-btn secondary" onClick={handleClose} disabled={loading}>취소</button>
              <button type="submit" className="admin-create-btn primary" disabled={loading}>
                {loading ? "확인 중..." : "확인"}
              </button>
            </div>
          </form>
        )}

        {step === "form" && (
          <form className="admin-create-body" onSubmit={handleFormSubmit} autoComplete="off">
            <label className="admin-create-label">아이디 *</label>
            <input name="login_id" className="admin-create-input" placeholder="사번" inputMode="numeric" value={form.login_id} onChange={handleChange} disabled={loading} autoFocus />
            <p className="admin-create-hint">※ 사번(숫자)만 입력</p>

            <label className="admin-create-label">비밀번호 *</label>
            <PasswordInput name="password" placeholder="영어 소문자 및 숫자 포함 10자 이상" value={form.password} onChange={handleChange} disabled={loading} autoComplete="new-password" />
            <PasswordInput name="passwordConfirm" placeholder="비밀번호 확인" value={form.passwordConfirm} onChange={handleChange} disabled={loading} autoComplete="new-password" />
            {form.passwordConfirm && (
              <p className="admin-create-hint" style={{ color: form.password === form.passwordConfirm ? "#2e7d32" : "#e53935" }}>
                {form.password === form.passwordConfirm ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
              </p>
            )}

            <label className="admin-create-label">이름 *</label>
            <input name="name" className="admin-create-input" placeholder="이름" value={form.name} onChange={handleChange} disabled={loading} />

            <label className="admin-create-label">부서</label>
            <input name="dept" className="admin-create-input" placeholder="부서" value={form.dept} onChange={handleChange} disabled={loading} />

            <label className="admin-create-label">내선번호</label>
            <input type="tel" name="phone" className="admin-create-input" placeholder="내선번호" value={form.phone} onChange={handleChange} disabled={loading} />

            <p className="admin-create-note">※ 생성된 계정은 승인 절차 없이 바로 로그인할 수 있습니다.</p>
            {error && <p className="admin-create-error">{error}</p>}
            <div className="admin-create-actions">
              <button type="button" className="admin-create-btn secondary" onClick={handleClose} disabled={loading}>취소</button>
              <button type="submit" className="admin-create-btn primary" disabled={loading}>
                {loading ? "생성 중..." : "생성"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AdminCreatePopup;
