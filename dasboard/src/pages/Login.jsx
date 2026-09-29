import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import stayoneLogo from "../assets/stayonelogo.png";
import { jwtDecode } from "jwt-decode";
import { Mail, Lock, ArrowRight, Loader2, Sparkles, Building2, ShieldCheck, Clock, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.post("/auth/login", { email, password });
      if (response.data && response.data.access_token) {
        localStorage.setItem("token", response.data.access_token);

        try {
          const settingsRes = await api.get("settings/");
          const tzSetting = settingsRes.data.find(s => s.key === "timezone");
          if (tzSetting && tzSetting.value) {
            localStorage.setItem("SYSTEM_TIMEZONE", tzSetting.value);
          }
        } catch (settingsError) {
          console.error("Failed to sync system timezone on login:", settingsError);
        }

        try {
          const decoded = jwtDecode(response.data.access_token);
          const permissions = decoded.permissions || [];
          const role = decoded.role ? decoded.role.toLowerCase() : 'guest';
          const isSuperadmin = decoded.is_superadmin || false;
          const userBranchId = decoded.branch_id;

          localStorage.setItem("user", JSON.stringify({
            role,
            is_superadmin: isSuperadmin,
            permissions
          }));
          localStorage.setItem("permissions", JSON.stringify(permissions));

          if (isSuperadmin) {
            localStorage.setItem("activeBranchId", "all");
            navigate("/superadmin-dashboard", { replace: true });
          } else if (userBranchId) {
            localStorage.setItem("activeBranchId", userBranchId);
            
            if (role === 'admin' || permissions.some(p => p === '/dashboard' || p === 'dashboard:view' || p === 'dashboard')) {
              navigate("/dashboard", { replace: true });
            } else if (permissions.length > 0) {
              const firstPerm = permissions[0];
              const redirectPath = firstPerm.startsWith('/') 
                ? firstPerm 
                : `/${firstPerm.split(':')[0].replace('_', '-')}`;
              navigate(redirectPath, { replace: true });
            } else {
              navigate("/dashboard", { replace: true });
            }
          }
        } catch (error) {
          console.error("Token decode error:", error);
          navigate("/dashboard", { replace: true });
        }
      } else {
        setErrorMessage("Login failed: No authorization token received from server.");
      }
    } catch (err) {
      console.error("Login error:", err);
      const detail = err.response?.data?.detail || err.message || "Login failed. Please check your credentials.";
      const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const isPendingApprovalError = errorMessage && (
    errorMessage.toLowerCase().includes("pending approval") || 
    errorMessage.toLowerCase().includes("pending activation") ||
    errorMessage.toLowerCase().includes("super admin accepts")
  );

  return (
    <div className="min-h-screen w-full flex bg-[#0f172a] font-sans overflow-hidden">
      
      {/* LEFT PANEL - Form Area */}
      <div className="w-full lg:w-[45%] xl:w-[35%] flex flex-col justify-between bg-white relative z-10 shadow-2xl">
        
        {/* Subtle top decoration */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500"></div>

        <div className="flex-1 flex flex-col justify-center px-8 sm:px-12 md:px-16 lg:px-20 py-12">
          
          {/* Logo Section */}
          <div className="mb-10 text-center flex flex-col items-center">
            <div className="relative group mb-6">
              <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-700"></div>
              {/* Enhanced Logo Container */}
              <div className="relative bg-white rounded-3xl p-3 shadow-xl transform transition-transform duration-500 group-hover:scale-105 border border-gray-100 ring-4 ring-gray-50 overflow-hidden">
                <img
                  src={stayoneLogo}
                  alt="Stayone Hospitality Logo"
                  className="h-24 w-auto object-contain"
                />
              </div>
            </div>
            
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Welcome Back
            </h1>
            <p className="text-gray-500 mt-2 font-medium">
              Enter your credentials to access the portal
            </p>
          </div>

          {/* Error / Pending Approval Notification Banner */}
          {errorMessage && (
            <div className={`p-4 rounded-2xl text-xs flex items-start gap-3 mb-6 transition-all ${
              isPendingApprovalError
                ? "bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-sm"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}>
              {isPendingApprovalError ? (
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1.5 flex-1">
                <p className="font-bold text-sm leading-tight">
                  {isPendingApprovalError ? "Property Pending Approval" : "Authentication Failed"}
                </p>
                <p className="leading-relaxed font-medium">{errorMessage}</p>
                {isPendingApprovalError && (
                  <div className="pt-2 mt-2 border-t border-amber-200/70 flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-amber-900">
                      ⚡ Pay at Teqmates &amp; share screenshot for instant activation within minutes!
                    </span>
                    <a
                      href="https://api.whatsapp.com/send?phone=919876543210&text=Hi%20Teqmates%2C%20I%20have%20registered%20my%20property%20and%20need%20it%20activated."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline inline-flex items-center gap-1"
                    >
                      Share Screenshot on WhatsApp (+91 98765 43210) &rarr;
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Section */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700 block ml-1">Email / Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-600 transition-colors">
                  <Mail size={20} />
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                  placeholder="name@stayone.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between ml-1">
                <label className="text-sm font-semibold text-gray-700 block">Password</label>
                <a href="#" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">Forgot password?</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-600 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div className="flex items-center ml-1">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer transition-colors"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600 cursor-pointer select-none">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl shadow-lg shadow-gray-900/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* SaaS Self-Service Registration Callout */}
          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500">
              New property or resort chain?{" "}
              <Link to="/register" className="font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                Register Your Property &rarr;
              </Link>
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Stayone Group</span>
          <div className="flex items-center gap-1.5 font-medium text-gray-500">
            <ShieldCheck size={14} className="text-indigo-500" />
            Secure Login
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Brand Image Area */}
      <div className="hidden lg:flex flex-1 relative bg-slate-900 overflow-hidden">
        {/* Animated Business Growth Image 1 */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat animate-slideshow-1"
          style={{ backgroundImage: `url('${process.env.PUBLIC_URL}/growth-bg1.png')` }}
        />
        {/* Animated Business Growth Image 2 */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat animate-slideshow-2"
          style={{ backgroundImage: `url('${process.env.PUBLIC_URL}/growth-bg2.png')` }}
        />
        
        {/* Modern Abstract Geometric Background overlays */}
        <div className="absolute inset-0 opacity-30">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-blue-500 to-teal-400 blur-[150px]"></div>
        </div>
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50"></div>

        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>

        {/* Content over image */}
        <div className="relative z-10 flex flex-col justify-end p-16 w-full h-full text-white">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-sm font-medium mb-6">
              <Sparkles size={16} className="text-indigo-400" />
              <span className="text-slate-200">Business Growth & Analytics</span>
            </div>
            
            <h2 className="text-5xl font-bold leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">
              Unlock Your <br /> Property's Potential
            </h2>
            
            <p className="text-lg text-slate-300 leading-relaxed font-light border-l-2 border-indigo-500 pl-4 shadow-sm">
              Actionable insights, dynamic reporting, and robust tools to drive revenue, streamline operations, and accelerate business growth.
            </p>

            <div className="flex items-center gap-8 mt-12 pt-12 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                  <Building2 size={24} className="text-indigo-300" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white shadow-sm">Multi-Property</p>
                  <p className="text-xs text-slate-300 shadow-sm">Centralized control</p>
                </div>
              </div>
              <div className="w-px h-10 bg-white/20"></div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg">
                  <ShieldCheck size={24} className="text-indigo-300" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white shadow-sm">Enterprise Grade</p>
                  <p className="text-xs text-slate-300 shadow-sm">Secure & Reliable</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Developer Credit */}
        <div className="absolute bottom-6 right-8 z-20">
          <a 
            href="https://teqmates.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-slate-400/80 hover:text-white text-[11px] font-medium transition-all duration-300 group"
          >
            <span>Powered by</span>
            <span className="text-indigo-400 group-hover:text-indigo-300 font-bold tracking-wider">Teqmates.com</span>
          </a>
        </div>
      </div>
      {/* Tailwind animations */}
      <style>
        {`
          @keyframes kenburns {
            0% { transform: scale(1) translate(0, 0); }
            50% { transform: scale(1.05) translate(-1%, -1%); }
            100% { transform: scale(1) translate(0, 0); }
          }
          @keyframes fade1 {
            0%, 45% { opacity: 0.8; }
            50%, 95% { opacity: 0; }
            100% { opacity: 0.8; }
          }
          @keyframes fade2 {
            0%, 45% { opacity: 0; }
            50%, 95% { opacity: 0.8; }
            100% { opacity: 0; }
          }
          .animate-slideshow-1 {
            animation: kenburns 40s ease-in-out infinite, fade1 40s ease-in-out infinite;
          }
          .animate-slideshow-2 {
            animation: kenburns 40s ease-in-out infinite, fade2 40s ease-in-out infinite;
          }
        `}
      </style>
    </div>
  );
}
