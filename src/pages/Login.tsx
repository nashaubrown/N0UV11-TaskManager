import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Camera, CheckSquare, Sparkles } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import { useAuth } from '../store/auth'

type Mode = 'login' | 'signup'

export default function Login() {
  const { login, signup, busy, error } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [organizationName, setOrganizationName] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'login') void login(email, password)
    else void signup({ email, password, fullName, organizationName })
  }

  return (
    <div className="min-h-dvh grid desktop:grid-cols-2 bg-canvas">
      {/* brand panel */}
      <div className="hidden desktop:flex flex-col justify-between p-12 nv-gradient text-on-brand">
        <span className="font-display font-bold text-2xl tracking-tight">NOUVII</span>
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-display font-bold text-4xl leading-tight text-balance"
          >
            Every shoot, every task, every approval — in one place.
          </motion.h1>
          <ul className="mt-8 grid gap-3 text-white/85 text-sm">
            <li className="flex items-center gap-2.5"><CheckSquare className="size-4" aria-hidden /> Tasks with due dates, assignees, and threads</li>
            <li className="flex items-center gap-2.5"><Camera className="size-4" aria-hidden /> Photo library organized by merchant</li>
            <li className="flex items-center gap-2.5"><Sparkles className="size-4" aria-hidden /> Multi-step client approvals</li>
          </ul>
        </div>
        <p className="text-white/60 text-xs">NOUVII · Task Manager & Photo Library</p>
      </div>

      {/* form panel */}
      <div className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <span className="desktop:hidden font-display font-bold text-2xl text-transparent bg-clip-text nv-gradient inline-block mb-8">
            NOUVII
          </span>
          <h2 className="font-display font-bold text-2xl text-ink">
            {mode === 'login' ? 'Welcome back' : 'Create your workspace'}
          </h2>
          <p className="text-sm text-ink-muted mt-1 mb-6">
            {mode === 'login' ? 'Log in to your workspace.' : 'An organization for your team — you can invite people later.'}
          </p>

          <form onSubmit={submit} className="grid gap-4">
            {mode === 'signup' && (
              <>
                <Input label="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
                <Input label="Organization name" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
              </>
            )}
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              hint={mode === 'signup' ? 'At least 8 characters' : undefined}
            />
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {mode === 'login' ? 'Log in' : 'Create workspace'}
            </Button>
          </form>

          <p className="text-sm text-ink-muted mt-6 text-center">
            {mode === 'login' ? (
              <>No account?{' '}
                <button className="text-brand-deep dark:text-brand font-medium hover:underline" onClick={() => setMode('signup')}>
                  Create a workspace
                </button>
              </>
            ) : (
              <>Already have one?{' '}
                <button className="text-brand-deep dark:text-brand font-medium hover:underline" onClick={() => setMode('login')}>
                  Log in
                </button>
              </>
            )}
          </p>
        </motion.div>
      </div>
    </div>
  )
}
