import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Check, X, Loader2, Lock, Shield } from 'lucide-react';

// Password strength checker
const checkPasswordStrength = (password) => {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const strength = (passed / 4) * 100;

  return { checks, strength, passed };
};

const SecuritySection = ({ onChangePassword, loading }) => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [touchedFields, setTouchedFields] = useState({});

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    return checkPasswordStrength(formData.newPassword);
  }, [formData.newPassword]);

  // Validation errors
  const validationErrors = useMemo(() => {
    const errors = {};

    if (touchedFields.currentPassword && !formData.currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    if (touchedFields.newPassword) {
      if (!formData.newPassword) {
        errors.newPassword = 'New password is required';
      } else if (formData.newPassword.length < 12) {
        errors.newPassword = 'Password must be at least 12 characters';
      } else if (formData.newPassword.length > 32) {
        errors.newPassword = 'Password must not exceed 32 characters';
      } else if (passwordStrength.strength < 100) {
        errors.newPassword = 'Password must meet all requirements';
      }
    }

    if (touchedFields.confirmPassword) {
      if (!formData.confirmPassword) {
        errors.confirmPassword = 'Please confirm your new password';
      } else if (formData.newPassword !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
    }

    return errors;
  }, [formData, touchedFields, passwordStrength]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouchedFields((prev) => ({
      ...prev,
      [name]: true,
    }));
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Touch all fields to show errors
    setTouchedFields({
      currentPassword: true,
      newPassword: true,
      confirmPassword: true,
    });

    // Check for errors
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (formData.newPassword.length < 12) {
      toast.error('Password must be at least 12 characters long');
      return;
    }

    if (formData.newPassword.length > 32) {
      toast.error('Password must not exceed 32 characters');
      return;
    }

    if (passwordStrength.strength < 100) {
      toast.error('Password must meet all requirements (uppercase, lowercase, number)');
      return;
    }

    // Call password change with full error isolation
    let success = false;
    try {
      success = await onChangePassword(formData.currentPassword, formData.newPassword);
    } catch {
      // Completely absorb any error
      success = false;
    }

    if (success) {
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTouchedFields({});
    }
  };

  const isFormValid =
    formData.currentPassword &&
    formData.newPassword &&
    formData.confirmPassword &&
    formData.newPassword === formData.confirmPassword &&
    passwordStrength.strength === 100;

  // Render password field inline instead of separate component
  const renderPasswordField = (name, label, field) => {
    const hasError = touchedFields[name] && validationErrors[name];
    const isValid = touchedFields[name] && !validationErrors[name] && formData[name];

    return (
      <div className="form-group">
        <Label htmlFor={name} className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Lock size={14} className="text-gray-500" />
          {label}
        </Label>
        <div className="relative">
          <Input
            id={name}
            name={name}
            type={showPasswords[field] ? 'text' : 'password'}
            value={formData[name]}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={loading}
            placeholder="••••••••"
            maxLength={32}
            className={`pr-20 transition-all ${
              hasError
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20'
                : isValid
                ? 'border-green-400 focus:border-green-400 focus:ring-green-400/20'
                : ''
            }`}
            required
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => togglePasswordVisibility(field)}
            >
              {showPasswords[field] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {hasError && (
          <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
            <X className="w-3 h-3" />
            {validationErrors[name]}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="profile-section">
      <div className="section-header">
        <h3>
          Change Password
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="security-form max-w-md mx-auto">
        <div className="space-y-6">
          {renderPasswordField('currentPassword', 'Current Password', 'current')}

          <div className="form-group">
            {renderPasswordField('newPassword', 'New Password', 'new')}

          {/* Password Strength Meter */}
          {formData.newPassword && (
            <div className="mt-3 space-y-2 animate-in slide-in-from-top-2">
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      i < passwordStrength.passed
                        ? passwordStrength.strength < 40
                          ? 'bg-red-500'
                          : passwordStrength.strength < 80
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p
                className={`text-xs font-semibold ${
                  passwordStrength.strength < 40
                    ? 'text-red-500'
                    : passwordStrength.strength < 80
                    ? 'text-orange-500'
                    : 'text-green-500'
                }`}
              >
                {passwordStrength.strength < 40
                  ? 'Weak password'
                  : passwordStrength.strength < 80
                  ? 'Medium password'
                  : 'Strong password'}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`flex items-center gap-1 ${passwordStrength.checks.length ? 'text-green-600' : 'text-gray-400'}`}>
                  {passwordStrength.checks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  12+ characters
                </div>
                <div className={`flex items-center gap-1 ${passwordStrength.checks.uppercase ? 'text-green-600' : 'text-gray-400'}`}>
                  {passwordStrength.checks.uppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  Uppercase letter
                </div>
                <div className={`flex items-center gap-1 ${passwordStrength.checks.lowercase ? 'text-green-600' : 'text-gray-400'}`}>
                  {passwordStrength.checks.lowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  Lowercase letter
                </div>
                <div className={`flex items-center gap-1 ${passwordStrength.checks.number ? 'text-green-600' : 'text-gray-400'}`}>
                  {passwordStrength.checks.number ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  Number
                </div>
              </div>
            </div>
          )}
        </div>

        {renderPasswordField('confirmPassword', 'Confirm New Password', 'confirm')}

        {/* Password match indicator */}
        {touchedFields.confirmPassword && formData.confirmPassword && !validationErrors.confirmPassword && (
          <p className="text-xs text-green-500 flex items-center gap-1 -mt-3 mb-4">
            <Check className="w-3 h-3" />
            Passwords match
          </p>
        )}

        <div className="form-actions mt-6">
          <Button type="submit" disabled={loading || !isFormValid} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Changing Password...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Change Password
              </>
            )}
          </Button>
        </div>
        </div>
      </form>
    </div>
  );
};

export default SecuritySection;
