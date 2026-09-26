import { useState, useEffect, useRef, Fragment } from "react"; // HMR Force Update
import { Link, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, motion, m } from "framer-motion";
import {
  Home,
  Users,
  BedDouble,
  CalendarCheck2,
  CalendarCheck,
  ConciergeBell,
  Settings,
  Menu,
  LogOut,
  Package,
  UserCircle,
  Utensils,
  ShieldCheck,
  PiggyBank,
  Grid,
  ChefHat,
  Receipt,
  Globe,
  Briefcase,
  Sun,
  Warehouse,
  Activity,
} from "lucide-react";
import { jwtDecode } from "jwt-decode";
import stayoneLogo from "../assets/stayonelogo.png";
import { NotificationBell } from "../contexts/NotificationContext";
import { useBranch } from "../contexts/BranchContext";
import { Building2, ChevronDown } from "lucide-react";
import { usePermissions } from "../hooks/usePermissions";

import { CreditCard, AlertCircle } from "lucide-react";
import api from "../services/api";

// Define professional, high-end themes with a focus on harmony and readability.
const stayoneThemeConfig = {
  '--bg-primary': '#faf8f5', // Soft cream/ivory background
  '--bg-secondary': '#ffffff',
  '--text-primary': '#2d3748', // Deep charcoal
  '--text-secondary': '#718096', // Medium gray
  '--accent-bg': '#e8f5e9', // Light stayone green
  '--accent-text': '#2d5016', // Deep forest green
  '--bubble-color': 'rgba(139, 195, 74, 0.25)', // Soft stayone green bubbles
  '--primary-button': '#8bc34a', // Fresh stayone green
  '--primary-button-hover': '#7cb342', // Darker stayone green
  '--border-color': '#c5e1a5', // Light stayone green border
};

const themes = {
  'eco-friendly': {
    '--bg-primary': '#f0f7f4', // Soft mint green background
    '--bg-secondary': '#ffffff',
    '--text-primary': '#1a4d3a', // Deep forest green text
    '--text-secondary': '#5a7c6a', // Muted green-gray
    '--accent-bg': '#c8e6d5', // Light sage green accent (slightly more vibrant)
    '--accent-text': '#2d6a4f', // Medium green for active items
    '--bubble-color': 'rgba(76, 175, 80, 0.3)', // Soft green bubbles
    '--primary-button': '#22c55e', // Green for primary actions
    '--primary-button-hover': '#16a34a', // Darker green on hover
    '--border-color': '#a7d4b8', // Light green borders
  },
  'platinum': {
    '--bg-primary': '#f4f7f9',
    '--bg-secondary': '#ffffff',
    '--text-primary': '#2c3e50',
    '--text-secondary': '#7f8c8d',
    '--accent-bg': '#e7edf1', // A light, clean accent
    '--accent-text': '#34495e',
    '--bubble-color': 'rgba(175, 215, 255, 0.4)', // Soft blue bubbles
    '--primary-button': '#6366f1',
    '--primary-button-hover': '#4f46e5',
    '--border-color': '#e2e8f0',
  },
  'onyx': {
    '--bg-primary': '#1c1c1c',
    '--bg-secondary': '#2b2b2b',
    '--text-primary': '#ecf0f1',
    '--text-secondary': '#bdc3c7',
    '--accent-bg': '#34495e', // A deep blue-gray accent
    '--accent-text': '#f1c40f',
    '--bubble-color': 'rgba(255, 223, 186, 0.2)', // Faint gold bubbles
    '--primary-button': '#f1c40f',
    '--primary-button-hover': '#f39c12',
    '--border-color': '#34495e',
  },
  'gilded-age': {
    '--bg-primary': '#fdf8f0', // A warm, off-white
    '--bg-secondary': '#ffffff',
    '--text-primary': '#4a4a4a',
    '--text-secondary': '#8b7c6c',
    '--accent-bg': '#f5ecde',
    '--accent-text': '#4a4a4a',
    '--bubble-color': 'rgba(212, 172, 97, 0.3)',
    '--primary-button': '#d4ac61',
    '--primary-button-hover': '#b8945f',
    '--border-color': '#e8dcc6',
  },
  'stayone-signature': stayoneThemeConfig,
};

// Helper function to apply the theme's CSS variables to the document root
const applyTheme = (themeName) => {
  const selectedTheme = themes[themeName];
  if (selectedTheme) {
    Object.keys(selectedTheme).forEach(key => {
      document.documentElement.style.setProperty(key, selectedTheme[key]);
    });
    // Set data attribute for theme-specific styling
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('dashboard-theme', themeName);
  }
};

// Map routes to internal module IDs
const routeToModuleMap = {
  "/dashboard": "dashboard",
  "/account": ["account", "finance"],
  "/bookings": "bookings",
  "/rooms": "rooms",
  "/services": ["services", "concierge"],
  "/food-orders": "food_orders",
  "/food-orders/orders": "food_orders_list",
  "/food-orders/requests": "food_orders_requests",
  "/food-orders/management": "food_orders_management",
  "/expenses": "expenses",
  "/employee-management": ["employee_management", "employees"],
  "/inventory": ["inventory", "warehouse"],
  "/day-audit": ["day_audit", "settings_group"],
  "/settings": ["settings_group", "settings"],
  "/roles": "roles",
  "/branch-management": ["settings_group", "branches"],
  "/activity-logs": ["settings_group", "activity_logs"],
  "/guestprofiles": ["guest_profiles", "guests"],
  "/billing": "billing",
  "/package": ["packages", "promotions"],
  "/Userfrontend_data": ["web_management", "website"],
  "/report": ["reports_global", "reports"]
};

export const ProtectedRoute = ({ children, requiredPermission, superAdminOnly = false }) => {
  const { isSuperadmin: isSuper, isBranchAdmin, hasModuleAccess, permissions } = usePermissions();

  if (superAdminOnly && !isSuper) {
    return <Navigate to="/dashboard" replace />;
  }

  const hasAccess = isSuper || isBranchAdmin || (requiredPermission ? hasModuleAccess(routeToModuleMap[requiredPermission] || requiredPermission) : true);

  if (!hasAccess) {
    return <div className="flex items-center justify-center h-screen text-red-600 font-bold text-xl">Access Denied: Insufficient Privileges</div>;
  }

  return <>{children}</>;
};

export default function DashboardLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [currentTheme, setCurrentTheme] = useState('stayone-signature'); // Default theme - stayone-signature

  const navRef = useRef(null);

  // Load theme from localStorage on initial render
  useEffect(() => {
    const savedTheme = localStorage.getItem('dashboard-theme');
    if (savedTheme && themes[savedTheme]) {
      setCurrentTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Set stayone-signature as default theme
      setCurrentTheme('stayone-signature');
      applyTheme('stayone-signature');
    }
  }, []);


  // Effect to create and manage the animated bubble background
  useEffect(() => {
    const bubbleContainer = document.getElementById('bubble-background');
    if (!bubbleContainer) return;
    bubbleContainer.innerHTML = ''; // Clear existing bubbles on theme change

    const createBubble = () => {
      const bubble = document.createElement('span');
      const size = Math.random() * 60 + 20; // Bubble size between 20px and 80px
      const animationDuration = Math.random() * 10 + 10; // Duration between 10s and 20s
      const delay = Math.random() * 5; // Start delay up to 5s
      const left = Math.random() * 100; // Horizontal start position

      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.left = `${left}%`;
      bubble.style.animationDuration = `${animationDuration}s`;
      bubble.style.animationDelay = `${delay}s`;
      bubble.style.backgroundColor = `var(--bubble-color)`; // Use theme color

      bubble.classList.add('bubble');
      bubbleContainer.appendChild(bubble);
    };

    for (let i = 0; i < 30; i++) { // Create 30 bubbles
      createBubble();
    }
  }, [currentTheme]);


  const { role, permissions, user, isSuperadmin: isSuper, isBranchAdmin, hasModuleAccess } = usePermissions();
  // Sync activeBranchId for non-superadmins and refresh branches on mount
  const { branches, activeBranchId, switchBranch, activeBranch, refreshBranches } = useBranch();
  
  useEffect(() => {
    refreshBranches(); // Ensure branches are loaded after login
  }, []);

  useEffect(() => {
    if (user && user.branch_id) {
      if (activeBranchId.toString() !== user.branch_id.toString()) {
        switchBranch(user.branch_id);
      }
    }
  }, [user, activeBranchId, switchBranch]);
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Tenant subscription status for pending-approval banner
  const [tenantProfile, setTenantProfile] = useState(null);
  const [billingInfo, setBillingInfo] = useState(null);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [payingBill, setPayingBill] = useState(false);

  useEffect(() => {
    const fetchTenantProfile = async () => {
      try {
        const res = await api.get("/saas/tenant-profile");
        setTenantProfile(res.data);
      } catch (e) {
        // Not a SaaS tenant or not authenticated — ignore
      }
    };
    const fetchBilling = async () => {
      try {
        const res = await api.get("/saas/billing");
        setBillingInfo(res.data);
      } catch (e) { /* ignore */ }
    };
    fetchTenantProfile();
    fetchBilling();
  }, []);

  const isPendingApproval = tenantProfile?.subscription_status === "pending_approval";

  const handlePayBill = async () => {
    setPayingBill(true);
    try {
      await api.post("/saas/pay-bill");
      alert("✅ Payment recorded! Your billing is now up to date.");
      const res = await api.get("/saas/billing");
      setBillingInfo(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Payment failed. Please try again.");
    } finally {
      setPayingBill(false);
    }
  };

  const allMenuItems = [
    ...(isSuper ? [{ label: "Enterprise Dashboard", icon: <Home size={18} />, to: "/superadmin-dashboard" }] : []),
    { label: "Dashboard", icon: <Home size={18} />, to: "/dashboard" },
    { label: "Finance", icon: <UserCircle size={18} />, to: "/account" },
    { label: "Bookings", icon: <CalendarCheck2 size={18} />, to: "/bookings" },
    { label: "Services", icon: <ConciergeBell size={18} />, to: "/services" },
    { label: "Expenses", icon: <PiggyBank size={18} />, to: "/expenses" },
    { label: "Food Management", icon: <Grid size={18} />, to: "/food-orders" },
    { label: "Billing", icon: <Receipt size={18} />, to: "/billing" },
    { label: "WEB Management", icon: <Globe size={18} />, to: "/Userfrontend_data" },
    { label: "Reports", icon: <Sun size={18} />, to: "/report" },
    { label: "GuestProfiles", icon: <Sun size={18} />, to: "/guestprofiles" },
    { label: "Employee Mgt", icon: <Briefcase size={18} />, to: "/employee-management" },
    { label: "Inventory", icon: <Warehouse size={18} />, to: "/inventory" },
    { label: "Day Audit", icon: <CalendarCheck size={18} />, to: "/day-audit" },
    { label: "Settings", icon: <Settings size={18} />, to: "/settings" },
    ...(isSuper ? [{ label: "Branch Mgt", icon: <Building2 size={18} />, to: "/branch-management" }] : []),
    { label: "Activity Logs", icon: <Activity size={18} />, to: "/activity-logs" },
  ];

  const menuItems = allMenuItems.filter((item) => {
    // Both SuperAdmin and Branch Admin get all operational pages
    if (isSuper || isBranchAdmin) return true;
    
    const moduleId = routeToModuleMap[item.to];
    if (!moduleId) return permissions.includes(item.to);
    
    return hasModuleAccess(moduleId);
  });

  return (
    <div
      className="flex h-screen overflow-hidden transition-colors duration-300 font-sans"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}
    >
      {/* Mobile overlay for sidebar */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Bubble animation styles */}
      <style>
        {`
        @keyframes moveBubbles {
          0% { transform: translateY(0) rotate(0deg); opacity: 0; border-radius: 0; }
          50% { opacity: 1; border-radius: 50%; }
          100% { transform: translateY(-100vh) rotate(720deg); opacity: 0; }
        }

        .bubble {
          position: absolute;
          bottom: -150px;
          animation: moveBubbles infinite ease-in;
          filter: blur(2px);
          border-radius: 50%;
        }

        @media (max-width: 1024px) {
          .bubble {
            display: none; /* Hide bubbles on mobile for better performance */
          }
        }
        `}
      </style>

      {/* Bubble container */}
      <div id="bubble-background" className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0"></div>

      <div className="flex h-full w-full relative z-10">

        {/* Sidebar container */}
        <div
          className={`shadow-xl transition-all duration-300 ${collapsed ? "w-16 lg:w-20" : "w-72"
            } flex flex-col flex-shrink-0 z-50 rounded-r-2xl overflow-hidden fixed lg:relative h-full ${collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
            }`}
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          {/* Header section with logo, app name, and menu toggle */}
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--accent-bg)' }}>
            {/* Left side: App Logo and Branch Switcher */}
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="p-0 rounded-xl flex items-center justify-center w-full">
                <img src={stayoneLogo} className="h-32 md:h-40 w-auto object-contain drop-shadow-2xl" alt="Stayone Hospitality Logo" />
              </div>

              {/* Branch name/switcher section */}
              <div className="w-full mt-2">
                {isSuper && !user?.branch_id && branches.length > 1 ? (
                  /* Branch Switcher for universal superadmins only */
                  <div className="relative w-full">
                    <button
                      onClick={() => setShowBranchMenu(!showBranchMenu)}
                      className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-gray-100/80 hover:bg-gray-200 transition-colors text-sm font-semibold border border-gray-200 shadow-sm"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Building2 size={16} className="text-[#2d5016] shrink-0" />
                        <span className="truncate">
                          {activeBranchId === 'all' ? "Enterprise View" : (activeBranch?.name || "Select Property")}
                        </span>
                      </div>
                      <ChevronDown size={14} className={`shrink-0 transition-transform ${showBranchMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {showBranchMenu && (
                      <div className="absolute left-0 mt-2 w-full bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-[100] animate-in zoom-in-95 duration-200 origin-top">
                        <div className="px-4 py-2 text-xs font-semibold text-gray-500 border-b mb-1 uppercase tracking-wider">Switch Property</div>

                        {/* Global View Option */}
                        <button
                          onClick={() => {
                            switchBranch('all');
                            setShowBranchMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${activeBranchId === 'all' ? 'bg-[#e8f5e9] text-[#2d5016] font-bold' : 'text-gray-700'}`}
                        >
                          <div className="flex items-center gap-3">
                            <Globe size={16} className="text-blue-500 shrink-0" />
                            <span className="truncate">All Branches</span>
                          </div>
                          {activeBranchId === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-[#2d5016] shrink-0"></div>}
                        </button>

                        <div className="h-px bg-gray-100 my-1"></div>

                        {branches.map(branch => (
                          <button
                            key={branch.id}
                            onClick={() => {
                              switchBranch(branch.id);
                              setShowBranchMenu(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between hover:bg-[#e8f5e9] transition-colors ${activeBranchId.toString() === branch.id.toString() ? 'bg-[#e8f5e9] text-[#2d5016] font-bold' : 'text-gray-700'}`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span className="w-2 h-2 rounded-full bg-[#8bc34a] shrink-0"></span>
                              <span className="truncate">{branch.name}</span>
                            </div>
                            {activeBranchId.toString() === branch.id.toString() && <div className="w-1.5 h-1.5 rounded-full bg-[#2d5016] shrink-0"></div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fixed Branch Name for managers/employees */
                  <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100/80 text-sm font-semibold border border-gray-200 shadow-sm w-full">
                    <Building2 size={16} className="text-[#2d5016] shrink-0" />
                    <span className="truncate uppercase tracking-wide">
                      {activeBranch?.name || branches.find(b => b.id.toString() === user?.branch_id?.toString())?.name || "My Branch"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Right side: Notification Bell and Menu Toggle */}
            <div className="flex items-center gap-4 ml-auto">
              {!collapsed && <NotificationBell />}
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="p-2 rounded-full transition-colors duration-200"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Menu size={20} />
              </button>
            </div>
          </div>

          {/* Theme Switcher UI with image previews */}
          <div className={`p-4 transition-all duration-300 flex justify-center gap-2 border-b`} style={{ borderColor: 'var(--accent-bg)' }}>
            <motion.button
              animate={{ scale: currentTheme === 'stayone-signature' ? 1.15 : 1, y: currentTheme === 'stayone-signature' ? -2 : 0 }}
              whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
              className={`w-8 h-8 rounded-full overflow-hidden ${currentTheme === 'stayone-signature' ? 'shadow-lg border-2 border-[#8bc34a]' : ''}`}
              onClick={() => { setCurrentTheme('stayone-signature'); applyTheme('stayone-signature'); }}
              title="Stayone Signature"
            >
              <img src={stayoneLogo} alt="Stayone Theme" className="w-full h-full object-cover" />
            </motion.button>
            <motion.button
              animate={{ scale: currentTheme === 'eco-friendly' ? 1.15 : 1, y: currentTheme === 'eco-friendly' ? -2 : 0 }}
              whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
              className={`w-8 h-8 rounded-full overflow-hidden ${currentTheme === 'eco-friendly' ? 'shadow-lg border-2 border-green-500' : ''}`}
              onClick={() => { setCurrentTheme('eco-friendly'); applyTheme('eco-friendly'); }}
              title="Eco-Friendly"
            >
              <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold text-xs">🌿</div>
            </motion.button>
            <motion.button
              animate={{ scale: currentTheme === 'platinum' ? 1.15 : 1, y: currentTheme === 'platinum' ? -2 : 0 }}
              whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
              className={`w-8 h-8 rounded-full overflow-hidden ${currentTheme === 'platinum' ? 'shadow-lg border-2 border-gray-400' : ''}`}
              onClick={() => { setCurrentTheme('platinum'); applyTheme('platinum'); }}
              title="Platinum"
            >
              <img src="https://placehold.co/32x32/f4f7f9/2c3e50?text=P" alt="Platinum Theme" className="w-full h-full object-cover" />
            </motion.button>
            <motion.button
              animate={{ scale: currentTheme === 'onyx' ? 1.15 : 1, y: currentTheme === 'onyx' ? -2 : 0 }}
              whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
              className={`w-8 h-8 rounded-full overflow-hidden ${currentTheme === 'onyx' ? 'shadow-lg border-2 border-yellow-600' : ''}`}
              onClick={() => { setCurrentTheme('onyx'); applyTheme('onyx'); }}
              title="Onyx"
            >
              <img src="https://placehold.co/32x32/1c1c1c/f1c40f?text=O" alt="Onyx Theme" className="w-full h-full object-cover" />
            </motion.button>
            <motion.button
              animate={{ scale: currentTheme === 'gilded-age' ? 1.15 : 1, y: currentTheme === 'gilded-age' ? -2 : 0 }}
              whileHover={{ scale: 1.2, y: -2 }} whileTap={{ scale: 1.1 }} transition={{ type: 'spring', stiffness: 300 }}
              className={`w-8 h-8 rounded-full overflow-hidden ${currentTheme === 'gilded-age' ? 'shadow-lg border-2 border-yellow-800' : ''}`}
              onClick={() => { setCurrentTheme('gilded-age'); applyTheme('gilded-age'); }}
              title="Gilded Age"
            >
              <img src="https://placehold.co/32x32/fdf8f0/d4ac61?text=G" alt="Gilded Age Theme" className="w-full h-full object-cover" />
            </motion.button>
          </div>

          {/* Main navigation menu */}
          <nav
            ref={navRef}
            className="flex-1 p-4 space-y-2 z-30 overflow-y-auto premium-scrollbar"
            style={{ 
              scrollBehavior: 'smooth'
            }}
          >
            {menuItems.map((item, idx) => {
              // Improved active state detection - check exact match or if path starts with the route
              const exactMatch = location.pathname === item.to;
              const startsWithMatch = item.to !== '/dashboard' && location.pathname.startsWith(item.to);
              const isActive = exactMatch || startsWithMatch;

              return (
                <Link
                  key={idx}
                  to={item.to}
                  className={`
                    group block flex items-center gap-4 p-3 rounded-xl
                    transition-colors duration-200 cursor-pointer
                  `}
                  style={{
                    backgroundColor: isActive ? 'var(--accent-bg)' : 'transparent',
                    color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
                    boxShadow: isActive ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none',
                    fontWeight: isActive ? 600 : 400, // Explicit font weight without class
                  }}
                >
                  <motion.span whileHover={{ scale: isActive ? 1 : 1.1, rotate: isActive ? 0 : -5 }} className="transition-transform duration-200">
                    {item.icon}
                  </motion.span>
                  {!collapsed && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="transition-opacity duration-200">{item.label}</motion.span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout section at the bottom */}
          <div className="p-4 border-t" style={{ borderColor: 'var(--accent-bg)' }}>
            <Link
              to="/"
              className="group block flex items-center gap-4 p-3 rounded-xl transition-all duration-200 cursor-pointer hover:opacity-75"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="group-hover:scale-110 transition-transform duration-200">
                <LogOut size={18} />
              </span>
              {!collapsed && <span className="transition-opacity duration-200">Log Out</span>}
            </Link>
          </div>

          {/* User Info section */}
          <div className="p-6 border-t z-20" style={{ borderColor: 'var(--accent-bg)' }}>
            {!collapsed && (
              <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                {user ? `Logged in as: ${user.name || user.email || role}` : "Not logged in"}
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu button - always visible on small screens */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="lg:hidden fixed top-4 left-4 z-[60] p-3 rounded-xl shadow-lg transition-all duration-200 hover:scale-110"
          style={{
            backgroundColor: 'var(--accent-bg)',
            color: 'var(--accent-text)'
          }}
        >
          <Menu size={24} />
        </button>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 lg:p-8 z-10 lg:ml-0 ml-0" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

          {/* Pending Approval Banner */}
          {isPendingApproval && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 flex items-start gap-3 shadow-sm">
              <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-amber-800 text-sm">Registration Pending Approval</p>
                <p className="text-amber-700 text-xs mt-0.5">Your property is under review by the StayOne admin team. Once approved, full app features will be unlocked. You can already view your monthly bill below.</p>
              </div>
              <button
                onClick={() => setShowBillingModal(true)}
                className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              >
                <CreditCard size={14} /> View Bill
              </button>
            </div>
          )}

          {/* Monthly Bill floating button (always visible for non-superadmin tenants) */}
          {tenantProfile && !isSuper && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShowBillingModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all hover:opacity-80"
                style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-text)', border: '1px solid var(--border-color)' }}
              >
                <CreditCard size={14} />
                Monthly Bill
                {billingInfo?.payment_status === 'unpaid' && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            </div>
          )}

          {/* Billing Modal */}
          {showBillingModal && (
            <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="text-indigo-600" size={22} />
                    <h2 className="text-xl font-bold text-gray-900">Property Billing</h2>
                  </div>
                  <button onClick={() => setShowBillingModal(false)} className="text-gray-400 hover:text-gray-700 text-xl font-bold">&times;</button>
                </div>

                {billingInfo ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Plan</span>
                        <span className="font-semibold text-gray-900 capitalize">{billingInfo.plan || tenantProfile?.plan_code || 'starter'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Aiosell Branch Code</span>
                        <span className="font-mono font-bold text-indigo-700">{billingInfo.branch_code || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Monthly Fee</span>
                        <span className="font-bold text-gray-900">₹{billingInfo.monthly_amount?.toLocaleString() || '—'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Status</span>
                        <span className={`font-bold ${billingInfo.payment_status === 'paid' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {billingInfo.payment_status === 'paid' ? '✅ Paid' : '⚠️ Unpaid'}
                        </span>
                      </div>
                      {billingInfo.next_billing_date && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Next Billing Date</span>
                          <span className="font-semibold text-gray-700">{billingInfo.next_billing_date}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Account Status</span>
                        <span className={`font-bold capitalize ${
                          billingInfo.subscription_status === 'active' ? 'text-emerald-600' :
                          billingInfo.subscription_status === 'pending_approval' ? 'text-amber-600' : 'text-red-500'
                        }`}>{billingInfo.subscription_status?.replace('_', ' ')}</span>
                      </div>
                    </div>

                    {billingInfo.payment_status !== 'paid' && (
                      <button
                        onClick={handlePayBill}
                        disabled={payingBill}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        {payingBill ? <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                          Processing...
                        </> : <><CreditCard size={16} /> Pay Monthly Bill</>}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">Loading billing info...</div>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}