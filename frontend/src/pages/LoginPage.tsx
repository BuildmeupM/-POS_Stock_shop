import { useState } from 'react'
import { TextInput, PasswordInput, Button, Stack } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import api from '../services/api'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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
      notifications.show({
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        message: err.response?.data?.message || 'เกิดข้อผิดพลาด',
        color: 'red',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="sidebar-logo" style={{ width: 56, height: 56, fontSize: 24, margin: '0 auto 16px' }}>B</div>
          <div className="login-title">Bookdee POS</div>
          <div className="login-subtitle">ระบบจัดการร้านค้าอัจฉริยะ</div>
        </div>
        <Stack gap="md">
          <TextInput
            label="Username" placeholder="กรอก username"
            value={username} onChange={(e) => setUsername(e.target.value)}
            required size="md"
          />
          <PasswordInput
            label="Password" placeholder="กรอก password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            required size="md"
          />
          <Button type="submit" loading={loading} fullWidth size="md"
            style={{ background: 'linear-gradient(135deg, var(--app-primary), var(--app-primary-dark))' }}>
            เข้าสู่ระบบ
          </Button>
        </Stack>
      </form>
    </div>
  )
}
