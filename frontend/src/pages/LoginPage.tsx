import { useState } from 'react'
import { TextInput, PasswordInput, Button, Checkbox, Modal } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../services/api'
import {
  IconUser,
  IconLock,
  IconArrowRight,
  IconAlertTriangle,
} from '@tabler/icons-react'

/* ===== Inline SVG Illustrations ===== */

const HeroIllustration = () => (
  <svg viewBox="0 0 480 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="login-hero-svg">
    {/* Tablet / POS screen */}
    <rect x="100" y="60" width="280" height="200" rx="18" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
    <rect x="112" y="76" width="256" height="168" rx="10" fill="rgba(255,255,255,0.06)" />

    {/* Dashboard bars */}
    <rect x="132" y="180" width="28" height="48" rx="4" fill="#818cf8" opacity="0.9">
      <animate attributeName="height" values="20;48;20" dur="3s" repeatCount="indefinite" />
      <animate attributeName="y" values="208;180;208" dur="3s" repeatCount="indefinite" />
    </rect>
    <rect x="170" y="160" width="28" height="68" rx="4" fill="#06b6d4" opacity="0.8">
      <animate attributeName="height" values="40;68;40" dur="3.5s" repeatCount="indefinite" />
      <animate attributeName="y" values="188;160;188" dur="3.5s" repeatCount="indefinite" />
    </rect>
    <rect x="208" y="140" width="28" height="88" rx="4" fill="#818cf8" opacity="0.9">
      <animate attributeName="height" values="50;88;50" dur="2.8s" repeatCount="indefinite" />
      <animate attributeName="y" values="178;140;178" dur="2.8s" repeatCount="indefinite" />
    </rect>
    <rect x="246" y="150" width="28" height="78" rx="4" fill="#22d3ee" opacity="0.7">
      <animate attributeName="height" values="30;78;30" dur="3.2s" repeatCount="indefinite" />
      <animate attributeName="y" values="198;150;198" dur="3.2s" repeatCount="indefinite" />
    </rect>
    <rect x="284" y="130" width="28" height="98" rx="4" fill="#818cf8" opacity="0.85">
      <animate attributeName="height" values="55;98;55" dur="3.8s" repeatCount="indefinite" />
      <animate attributeName="y" values="173;130;173" dur="3.8s" repeatCount="indefinite" />
    </rect>
    <rect x="322" y="155" width="28" height="73" rx="4" fill="#06b6d4" opacity="0.75">
      <animate attributeName="height" values="35;73;35" dur="2.5s" repeatCount="indefinite" />
      <animate attributeName="y" values="193;155;193" dur="2.5s" repeatCount="indefinite" />
    </rect>

    {/* Mini stat cards on screen */}
    <rect x="132" y="92" width="100" height="36" rx="8" fill="rgba(129,140,248,0.25)" />
    <rect x="142" y="100" width="44" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
    <rect x="142" y="112" width="28" height="8" rx="3" fill="rgba(255,255,255,0.8)" />

    <rect x="248" y="92" width="100" height="36" rx="8" fill="rgba(6,182,212,0.25)" />
    <rect x="258" y="100" width="44" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
    <rect x="258" y="112" width="28" height="8" rx="3" fill="rgba(255,255,255,0.8)" />

    {/* Floating shopping bag */}
    <g transform="translate(60, 280)" opacity="0.9">
      <animate attributeName="transform" values="translate(60,280);translate(60,270);translate(60,280)" dur="4s" repeatCount="indefinite" />
      <rect x="0" y="12" width="52" height="44" rx="6" fill="rgba(129,140,248,0.3)" stroke="rgba(129,140,248,0.5)" strokeWidth="1.5" />
      <path d="M14 12V8a12 12 0 0124 0v4" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="34" r="6" fill="rgba(255,255,255,0.2)" />
      <path d="M23 34l2 2 4-4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* Floating receipt */}
    <g transform="translate(370, 100)" opacity="0.85">
      <animate attributeName="transform" values="translate(370,100);translate(370,88);translate(370,100)" dur="5s" repeatCount="indefinite" />
      <rect x="0" y="0" width="46" height="62" rx="6" fill="rgba(6,182,212,0.25)" stroke="rgba(6,182,212,0.4)" strokeWidth="1.5" />
      <rect x="8" y="10" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.4)" />
      <rect x="8" y="18" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="8" y="26" width="28" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="8" y="38" width="30" height="1" rx="0.5" fill="rgba(255,255,255,0.15)" />
      <rect x="8" y="44" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="26" y="44" width="12" height="3" rx="1.5" fill="rgba(129,140,248,0.5)" />
      <rect x="8" y="52" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.25)" />
    </g>

    {/* Floating coins / money */}
    <g transform="translate(80, 140)" opacity="0.8">
      <animate attributeName="transform" values="translate(80,140);translate(80,130);translate(80,140)" dur="3.5s" repeatCount="indefinite" />
      <circle cx="16" cy="16" r="16" fill="rgba(250,204,21,0.3)" stroke="rgba(250,204,21,0.5)" strokeWidth="1.5" />
      <text x="16" y="21" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="14" fontWeight="800">$</text>
    </g>

    {/* Floating box / package */}
    <g transform="translate(360, 280)" opacity="0.8">
      <animate attributeName="transform" values="translate(360,280);translate(360,268);translate(360,280)" dur="4.5s" repeatCount="indefinite" />
      <rect x="0" y="8" width="48" height="40" rx="5" fill="rgba(168,85,247,0.25)" stroke="rgba(168,85,247,0.4)" strokeWidth="1.5" />
      <path d="M0 20h48" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      <path d="M24 8v40" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <path d="M8 8l16-8 16 8" stroke="rgba(168,85,247,0.4)" strokeWidth="1.5" fill="rgba(168,85,247,0.15)" strokeLinejoin="round" />
    </g>

    {/* Trend line */}
    <path d="M130 260 Q180 250, 210 230 T300 200 T380 180" stroke="rgba(34,211,238,0.4)" strokeWidth="2" fill="none" strokeLinecap="round">
      <animate attributeName="d" values="M130 260 Q180 250,210 230 T300 200 T380 180;M130 255 Q180 240,210 220 T300 210 T380 175;M130 260 Q180 250,210 230 T300 200 T380 180" dur="4s" repeatCount="indefinite" />
    </path>
    <circle cx="380" cy="180" r="4" fill="#22d3ee" opacity="0.8">
      <animate attributeName="cy" values="180;175;180" dur="4s" repeatCount="indefinite" />
    </circle>

    {/* Barcode floating element */}
    <g transform="translate(170, 290)" opacity="0.7">
      <animate attributeName="transform" values="translate(170,290);translate(170,282);translate(170,290)" dur="3s" repeatCount="indefinite" />
      <rect x="0" y="0" width="3" height="20" rx="1" fill="rgba(255,255,255,0.3)" />
      <rect x="5" y="0" width="5" height="20" rx="1" fill="rgba(255,255,255,0.4)" />
      <rect x="12" y="0" width="2" height="20" rx="1" fill="rgba(255,255,255,0.3)" />
      <rect x="16" y="0" width="6" height="20" rx="1" fill="rgba(255,255,255,0.4)" />
      <rect x="24" y="0" width="3" height="20" rx="1" fill="rgba(255,255,255,0.3)" />
      <rect x="29" y="0" width="4" height="20" rx="1" fill="rgba(255,255,255,0.35)" />
      <rect x="35" y="0" width="2" height="20" rx="1" fill="rgba(255,255,255,0.3)" />
      <rect x="39" y="0" width="5" height="20" rx="1" fill="rgba(255,255,255,0.4)" />
      <rect x="46" y="0" width="3" height="20" rx="1" fill="rgba(255,255,255,0.3)" />
    </g>
  </svg>
)

const ErrorIcon = () => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    {/* Circle background */}
    <circle cx="60" cy="60" r="56" fill="#FEF2F2" stroke="#FECACA" strokeWidth="2" />
    <circle cx="60" cy="60" r="42" fill="#FEE2E2" />
    {/* Shield with X */}
    <path d="M60 28C60 28 42 36 42 52V68C42 78 50 88 60 92C70 88 78 78 78 68V52C78 36 60 28 60 28Z"
      fill="#EF4444" opacity="0.15" stroke="#EF4444" strokeWidth="2.5" strokeLinejoin="round" />
    {/* X mark */}
    <path d="M52 52L68 68M68 52L52 68" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
    {/* Decorative dots */}
    <circle cx="28" cy="40" r="3" fill="#FECACA" />
    <circle cx="92" cy="80" r="3" fill="#FECACA" />
    <circle cx="88" cy="34" r="2" fill="#FCA5A5" />
    <circle cx="32" cy="86" r="2" fill="#FCA5A5" />
  </svg>
)

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errorModal, setErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const setAuth = useAuthStore((s) => s.setAuth)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await api.post('/auth/login', { username, password })
      const { token, user, companies, activeCompany } = res.data
      setAuth(token, user, companies, activeCompany)
      notifications.show({ title: 'เข้าสู่ระบบสำเร็จ', message: `ยินดีต้อนรับ ${user.fullName}`, color: 'green' })
      navigate('/')
    } catch (err: any) {
      const msg = err.response?.data?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
      setErrorMessage(msg)
      setErrorModal(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-container">
        {/* Left - Illustration */}
        <div className="login-brand">
          <div className="login-brand-content">
            <div className="login-brand-logo">
              <div className="login-logo-icon">B</div>
              <div>
                <div className="login-brand-name">Bookdee POS</div>
                <div className="login-brand-tagline">Point of Sale System</div>
              </div>
            </div>

            <div className="login-illustration-wrapper">
              <HeroIllustration />
            </div>

            <h1 className="login-brand-headline">
              ระบบจัดการร้านค้า<br />
              <span>ครบจบในที่เดียว</span>
            </h1>
            <p className="login-brand-desc">
              บริหารงานขาย สต็อกสินค้า รายรับ-รายจ่าย<br />
              และออกเอกสารทางธุรกิจได้อย่างมืออาชีพ
            </p>
          </div>

          <div className="login-brand-footer">
            &copy; 2024 Bookdee POS — All rights reserved
          </div>
        </div>

        {/* Right - Login Form */}
        <div className="login-form-side">
          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-form-header">
              <div className="login-form-logo-mobile">
                <div className="login-logo-icon">B</div>
              </div>
              <h2 className="login-form-title">เข้าสู่ระบบ</h2>
              <p className="login-form-subtitle">กรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
            </div>

            <div className="login-form-fields">
              <TextInput
                label="ชื่อผู้ใช้"
                placeholder="กรอก username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                size="lg"
                leftSection={<IconUser size={18} stroke={1.8} />}
                classNames={{ input: 'login-input' }}
              />
              <PasswordInput
                label="รหัสผ่าน"
                placeholder="กรอก password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                size="lg"
                leftSection={<IconLock size={18} stroke={1.8} />}
                classNames={{ input: 'login-input' }}
              />

              <div className="login-form-options">
                <Checkbox
                  label="จดจำฉัน"
                  size="sm"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.currentTarget.checked)}
                />
              </div>

              <Button
                type="submit"
                loading={loading}
                fullWidth
                size="lg"
                className="login-submit-btn"
                rightSection={!loading && <IconArrowRight size={18} />}
              >
                เข้าสู่ระบบ
              </Button>
            </div>

            <div className="login-form-footer">
              <span>Powered by</span> <strong>Bookdee POS</strong> v1.0
            </div>
          </form>
        </div>
      </div>

      {/* Error Modal */}
      <Modal
        opened={errorModal}
        onClose={() => setErrorModal(false)}
        withCloseButton={false}
        centered
        size="sm"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.4, blur: 6 }}
        classNames={{ content: 'login-error-modal' }}
      >
        <div className="login-error-modal-body">
          <ErrorIcon />
          <h3 className="login-error-title">เข้าสู่ระบบไม่สำเร็จ</h3>
          <p className="login-error-message">{errorMessage}</p>
          <Button
            fullWidth
            size="md"
            color="red"
            variant="filled"
            onClick={() => setErrorModal(false)}
            className="login-error-btn"
            leftSection={<IconAlertTriangle size={18} />}
          >
            ตกลง
          </Button>
        </div>
      </Modal>
    </div>
  )
}
