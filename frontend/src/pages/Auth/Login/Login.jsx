import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/services/config'
import { AlertCircle, Mail, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AuthLayout } from '../common/AuthLayout'
import { LoadingSpinner } from '@/components/common'

const Login = () => {
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [needsOtp, setNeedsOtp] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [credentials, setCredentials] = useState({ emailOrPhoneOrUsername: '', password: '' })
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const otpInputRefs = useRef([])

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      navigate('/')
    }
  }, [navigate])

  // Handle OTP input with auto-focus
  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return // Only allow digits

    const newOtp = [...otp]
    newOtp[index] = value.slice(-1) // Only take last digit
    setOtp(newOtp)

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('')
    if (pastedData.every(char => /^\d$/.test(char))) {
      setOtp(pastedData.concat(Array(6 - pastedData.length).fill('')))
      otpInputRefs.current[Math.min(pastedData.length, 5)]?.focus()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.target)
    const emailOrPhoneOrUsername = formData.get('email')?.trim()
    const password = formData.get('password')

    setCredentials({ emailOrPhoneOrUsername, password })

    try {
      // Get guest sessionId for cart merging
      const sessionId = localStorage.getItem('guestSessionId')
      
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        credentials: 'include',  // Send/receive cookies
        headers: { 
          "Content-Type": "application/json",
          // Send sessionId so backend can merge guest cart
          ...(sessionId && { "X-Session-Id": sessionId })
        },
        body: JSON.stringify({ emailOrPhoneOrUsername, password })
      })

      const data = await res.json()

      // Check if OTP is needed (5 failed attempts)
      if (data.needOtp) {
        setNeedsOtp(true)
        toast.warning(data.message || "OTP verification required", {
          position: "top-center",
          duration: 5000,
        })
        setLoading(false)
        return
      }

      if (!res.ok) {
        // Handle unverified email (403 status)
        if (res.status === 403) {
          toast.error(
            <div className="flex items-start gap-2">
              <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Email Not Verified</p>
                <p className="text-xs mt-1">{data.message || "Please verify your email before logging in."}</p>
              </div>
            </div>,
            { position: "top-center", duration: 6000 }
          )
        } else {
          throw new Error(data.message || "Login failed")
        }
        setLoading(false)
        return
      }

      // Successful login
      if (data.data?.user) {
        // Store user data and token
        localStorage.setItem('user', JSON.stringify(data.data.user))
        if (data.data.token) {
          localStorage.setItem('authToken', data.data.token)
        }
        
        // Update auth context with token
        authLogin(data.data.user, data.data.token)
        
        // Clear guest sessionId AFTER successful login (cart has been merged by backend)
        localStorage.removeItem('guestSessionId')

        // Dispatch event to update navbar
        window.dispatchEvent(new Event('userLoggedIn'))

        toast.success("Login successful!", {
          position: "top-center",
        })

        // Navigate to home after short delay
        setTimeout(() => navigate("/"), 500)
      } else {
        throw new Error("Invalid response from server")
      }

    } catch (err) {
      toast.error(err.message, {
        position: "top-center",
      })
      setLoading(false)
    }
  }

  const handleOtpVerify = async (e) => {
    e.preventDefault()
    setOtpLoading(true)

    const otpCode = otp.join('')

    if (otpCode.length !== 6) {
      toast.error('Please enter all 6 digits')
      setOtpLoading(false)
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailOrPhoneOrUsername: credentials.emailOrPhoneOrUsername,
          otp: otpCode
        })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.message || "OTP verification failed")

      toast.success(data.message || "OTP verified! Please login again.", {
        position: "top-center",
      })

      // Reset form
      setNeedsOtp(false)
      setCredentials({ emailOrPhoneOrUsername: '', password: '' })
      setOtp(['', '', '', '', '', ''])

    } catch (err) {
      toast.error(err.message, {
        position: "top-center",
      })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setOtpLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhoneOrUsername: credentials.emailOrPhoneOrUsername })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.message || "Failed to resend OTP")

      toast.success("OTP resent to your email!", {
        position: "top-center",
      })

    } catch (err) {
      toast.error(err.message, {
        position: "top-center",
      })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotPasswordLoading(true)

    const formData = new FormData(e.target)
    const emailOrPhoneOrUsername = formData.get('forgotEmail')

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOrPhoneOrUsername })
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.message || "Failed to send reset link")

      toast.success("Password reset link sent to your email!", {
        position: "top-center",
        duration: 5000,
      })

      setShowForgotPassword(false)

    } catch (err) {
      toast.error(err.message, {
        position: "top-center",
      })
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  return (
    <AuthLayout>
      {showForgotPassword ? (
        // Forgot Password Modal
        <Card className="w-full max-w-[480px] mx-auto shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl animate-in fade-in duration-500">
          <CardHeader className="space-y-4 pb-6">
            <button
              onClick={() => setShowForgotPassword(false)}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors w-fit [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
            <div className="flex justify-center">
              <div className="p-4 bg-blue-100 rounded-full">
                <Mail className="w-12 h-12 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-3xl text-center font-bold text-white [text-shadow:_0_2px_8px_rgb(0_0_0_/_40%)]">
              Reset Password
            </CardTitle>
            <CardDescription className="text-center text-white/95 text-base [text-shadow:_0_1px_4px_rgb(0_0_0_/_30%)]">
              Enter your email address and we'll send you a link to reset your password
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className='space-y-2'>
                <Label htmlFor="forgotEmail" className="text-sm font-semibold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]">Email Address</Label>
                <Input
                  id="forgotEmail"
                  name="forgotEmail"
                  type="email"
                  placeholder="john@example.com"
                  className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={forgotPasswordLoading}
                className="w-full h-12 bg-white/90 hover:bg-white text-gray-900 font-semibold shadow-lg border border-white/50 backdrop-blur-sm"
                size="lg"
              >
                {forgotPasswordLoading ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" variant="button" />
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : needsOtp ? (
        // OTP Verification Form
        <Card className="w-full max-w-[500px] mx-auto shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl animate-in fade-in duration-500">
          <CardHeader className="space-y-3 sm:space-y-4 pb-4 sm:pb-6">
            <button
              onClick={() => {
                setNeedsOtp(false)
                setCredentials({ emailOrPhoneOrUsername: '', password: '' })
                setOtp(['', '', '', '', '', ''])
              }}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors w-fit [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500 rounded-full blur-xl opacity-30 animate-pulse"></div>
                <div className="relative p-6 bg-gradient-to-br from-orange-500 to-red-600 rounded-full shadow-lg">
                  <AlertCircle className="w-16 h-16 text-white" />
                </div>
              </div>
            </div>
            <CardTitle className="text-3xl text-center font-bold text-white [text-shadow:_0_2px_8px_rgb(0_0_0_/_40%)]">
              Security Verification
            </CardTitle>
            <CardDescription className="text-center text-white/95 text-base leading-relaxed [text-shadow:_0_1px_4px_rgb(0_0_0_/_30%)]">
              Too many failed login attempts detected.<br />
              Please enter the 6-digit code sent to your email
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleOtpVerify} className="space-y-6">
              <div className='space-y-3'>
                <Label className="text-sm font-semibold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)] text-center block">Enter Verification Code</Label>
                <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, index) => (
                    <Input
                      key={index}
                      ref={(el) => (otpInputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-white/10 border-2 border-white/30 text-white focus:ring-2 focus:ring-white/50 focus:bg-white/20 transition-colors"
                    />
                  ))}
                </div>
                <p className="text-xs text-center text-white/60 flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Code expires in 10 minutes
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  type="submit"
                  disabled={otpLoading || otp.some(d => !d)}
                  className="w-full h-12 bg-white/90 hover:bg-white text-gray-900 font-semibold shadow-lg border border-white/50 backdrop-blur-sm"
                  size="lg"
                >
                  {otpLoading ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" variant="button" />
                      Verifying...
                    </span>
                  ) : (
                    'Verify Code'
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendOtp}
                  disabled={otpLoading}
                  className="w-full h-11 bg-white/5 border-white/40 hover:bg-white/15 text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)] backdrop-blur-sm"
                >
                  Resend Code
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        // Normal Login Form
        <Card className="w-full max-w-[500px] mx-auto shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl animate-in fade-in duration-500">
          <CardHeader className="space-y-2 pb-4 sm:pb-6">
            <CardTitle className="text-3xl text-center font-bold text-white [text-shadow:_0_2px_8px_rgb(0_0_0_/_40%)]">
              Welcome Back
            </CardTitle>
            <CardDescription className="text-center text-white/95 [text-shadow:_0_1px_4px_rgb(0_0_0_/_30%)]">
              Sign in to continue to your account
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className='space-y-2'>
                <Label htmlFor="email" className="text-sm font-semibold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]">Email / Phone / Username</Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  placeholder="john@example.com or username"
                  className="h-11 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20"
                  required
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor="password" className="text-sm font-semibold text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="h-11 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-white/80 hover:text-white hover:underline font-medium [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)] block mt-2 ml-auto"
                >
                  Forgot password?
                </button>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-white/90 hover:bg-white text-gray-900 font-semibold shadow-lg hover:shadow-xl transition-all border border-white/50 backdrop-blur-sm"
                  size="lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" variant="button" />
                      Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </div>

              {/* Divider */}
              <div className="text-center text-xs uppercase my-6">
                <span className="text-white/70 font-medium">Or continue with</span>
              </div>

              {/* OAuth Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 bg-white/5 border-white/40 hover:bg-white/15 text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)] backdrop-blur-sm transition-all"
                  onClick={() => window.location.href = `${API_BASE_URL}/auth/google`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className="ml-2 font-medium">Google</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 bg-white/5 border-white/40 hover:bg-white/15 text-white [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)] backdrop-blur-sm transition-all"
                  onClick={() => window.location.href = `${API_BASE_URL}/auth/facebook`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span className="ml-2 font-medium">Facebook</span>
                </Button>
              </div>

              {/* Trust Badge */}

            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-6 border-t border-white/20">
            <p className="text-sm text-center text-white/80 [text-shadow:_0_1px_2px_rgb(0_0_0_/_40%)]">
              Don't have an account?{" "}
              <Link to="/register" className="font-semibold text-white hover:underline [text-shadow:_0_1px_2px_rgb(0_0_0_/_50%)]">
                Create one now
              </Link>
            </p>
          </CardFooter>
        </Card>
      )}
    </AuthLayout>
  )
}

export default Login
