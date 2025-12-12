import React, { useState } from 'react';
import { useMockBackend } from '../contexts/MockBackendContext';

interface AuthModalProps {
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { login, register } = useMockBackend();
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        if (!name || !email || !phone || !password) {
          setError('All fields are required');
          setLoading(false);
          return;
        }
        const success = await register(name, email, phone, password);
        if (success) {
          onClose();
        } else {
          setError('User already exists');
        }
      } else {
        if (!phone || !password) {
          setError('Phone/Email and Password are required');
          setLoading(false);
          return;
        }
        // Allow login with phone or email
        const success = await login(phone, password);
        if (success) {
          onClose();
        } else {
          setError('Invalid credentials');
        }
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden relative">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <i className="fas fa-times text-xl"></i>
        </button>

        <div className="bg-red-600 p-6 text-center text-white">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 text-red-600 text-2xl font-bold shadow">
            <i className="fas fa-user"></i>
          </div>
          <h2 className="text-2xl font-bold">{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
          <p className="opacity-90 text-sm">Access your Ena Coach history</p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegistering && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Full Name</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                {isRegistering ? 'Phone Number' : 'Phone or Email'}
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                placeholder={isRegistering ? "0712345678" : "Enter email or phone"}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Password</label>
              <input
                type="password"
                className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-red-500"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded text-white font-bold shadow-md transition ${
                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Processing...' : (isRegistering ? 'Sign Up' : 'Log In')}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600">
            {isRegistering ? "Already have an account? " : "Don't have an account? "}
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-red-600 font-bold hover:underline"
            >
              {isRegistering ? 'Log In' : 'Register'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
