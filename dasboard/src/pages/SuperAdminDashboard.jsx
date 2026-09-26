import React, { useEffect, useState, useMemo } from "react";
import DashboardLayout from "../layout/DashboardLayout";
import { formatCurrency } from '../utils/currency';
import API from "../services/api";
import { Building2, Users, Receipt, PiggyBank, Briefcase, Activity, CheckCircle, Clock, Shield, Hash, Ban, Power, Search, Filter, X, RotateCcw, Edit2, Camera, Upload, Loader2 } from "lucide-react";

// Premium styles imported
import "../styles/premium-dashboard.css";
import "../styles/bubble-animation.css";

// A premium KPI Card component specifically for Super Admin
const SuperAdminKPICard = ({ label, value, sub, icon: Icon, colorClass }) => (
    <div className={`relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 group`}>
        <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 transition-transform group-hover:scale-150 ${colorClass}`}></div>
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
                <h3 className="text-2xl font-bold text-gray-800 tracking-tight">{value}</h3>
                {sub && <p className="text-xs text-gray-400 mt-2 font-medium">{sub}</p>}
            </div>
            <div className={`p-3 rounded-xl ${colorClass} bg-opacity-20 text-gray-700 shadow-inner`}>
                <Icon size={24} />
            </div>
        </div>
    </div>
);

const renderLocationLink = (branch, defaultText = "N/A") => {
    if (!branch) return defaultText;
    const loc = (branch.location || "").trim();
    const addr = (branch.address || "").trim();
    
    const isUrl = (str) => {
        if (!str) return false;
        const s = str.toLowerCase();
        return s.startsWith("http://") || 
               s.startsWith("https://") || 
               s.startsWith("www.") ||
               s.includes("google.com/maps") ||
               s.includes("maps.google") ||
               s.includes("maps.app.goo.gl");
    };
    
    const getHref = (str) => {
        if (!str) return "";
        let s = str.trim();
        if (s.toLowerCase().startsWith("http://") || s.toLowerCase().startsWith("https://")) {
            return s;
        }
        return `https://${s}`;
    };
    
    // Check if either is a URL
    let url = "";
    if (isUrl(loc)) {
        url = getHref(loc);
    } else if (isUrl(addr)) {
        url = getHref(addr);
    }
    
    // Determine display text for location name
    let locDisplay = "";
    if (loc && !isUrl(loc)) {
        locDisplay = loc;
    }
    
    // Determine display text for address
    let addrDisplay = "";
    if (addr && !isUrl(addr)) {
        addrDisplay = addr;
    }
    
    if (url) {
        return (
            <div className="flex flex-col">
                {locDisplay && <span className="font-bold text-gray-800 text-xs uppercase tracking-wider">{locDisplay}</span>}
                <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-indigo-600 hover:text-indigo-800 underline font-medium text-sm transition-colors mt-0.5 inline-block"
                    onClick={(e) => e.stopPropagation()}
                >
                    {addrDisplay || "View on Google Maps"}
                </a>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col">
            {locDisplay && <span className="font-bold text-gray-800 text-xs uppercase tracking-wider">{locDisplay}</span>}
            <span className="text-sm text-gray-600">{addrDisplay || defaultText}</span>
        </div>
    );
};

export default function SuperAdminDashboard() {
    const [tenants, setTenants] = useState([]);
    const [tenantsLoading, setTenantsLoading] = useState(false);
    const [approvingId, setApprovingId] = useState(null);
    const [togglingTenantId, setTogglingTenantId] = useState(null);
    const [togglingBranchId, setTogglingBranchId] = useState(null);
    const [hotelCodes, setHotelCodes] = useState({});
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(true);
    const [branches, setBranches] = useState([]);
    const [globalSummary, setGlobalSummary] = useState({
        total_revenue: 0,
        total_expenses: 0,
        active_employees: 0,
        occupied_rooms: 0,
        total_rooms: 0
    });

    // Property Approvals Search & Filter State
    const [tenantSearch, setTenantSearch] = useState("");
    const [tenantStatusFilter, setTenantStatusFilter] = useState("all"); // 'all' | 'pending' | 'active' | 'disabled'
    const [tenantPlanFilter, setTenantPlanFilter] = useState("all");

    // Branches Search & Filter State
    const [branchSearch, setBranchSearch] = useState("");
    const [branchStatusFilter, setBranchStatusFilter] = useState("all"); // 'all' | 'active' | 'disabled'

    const fetchTenants = async () => {
        setTenantsLoading(true);
        try {
            const res = await API.get("/saas/admin/tenants");
            const data = res.data || [];
            setTenants(data);
            const codes = {};
            data.forEach(t => {
                codes[t.id] = (t.branch_code && t.branch_code !== 'N/A') ? t.branch_code : '';
            });
            setHotelCodes(prev => ({ ...codes, ...prev }));
        } catch (e) {
            // ignore if not superadmin or endpoint unavailable
        } finally {
            setTenantsLoading(false);
        }
    };

    const handleApproveTenant = async (tenantId) => {
        const enteredCode = (hotelCodes[tenantId] !== undefined ? hotelCodes[tenantId] : "").trim().toUpperCase();
        setApprovingId(tenantId);
        try {
            const payload = enteredCode ? { branch_code: enteredCode } : {};
            const res = await API.post(`/saas/admin/approve-tenant/${tenantId}`, payload);
            alert(`✅ ${res.data?.message || "Property approved! Full access has been granted."}`);
            fetchTenants();
        } catch (e) {
            alert(e.response?.data?.detail || "Approval failed. Please try again.");
        } finally {
            setApprovingId(null);
        }
    };

    const handleToggleTenantStatus = async (tenant) => {
        const isCurrentlyActive = tenant.is_active !== false;
        const action = isCurrentlyActive ? "disable" : "enable";
        const propertyName = tenant.business_name || tenant.name;

        if (isCurrentlyActive && !window.confirm(`Are you sure you want to disable property "${propertyName}"?\n\nStaff and users of this property will not be able to log in or use the workspace until re-enabled.`)) {
            return;
        }

        setTogglingTenantId(tenant.id);
        try {
            const res = await API.post(`/saas/admin/toggle-tenant-status/${tenant.id}`);
            alert(`✅ ${res.data?.message || `Property ${action}d successfully.`}`);
            fetchTenants();
            // Also refresh global branches
            const config = { headers: { "X-Branch-ID": "all" } };
            const bRes = await API.get("/branches?include_inactive=true", config);
            setBranches(bRes.data || []);
        } catch (e) {
            alert(e.response?.data?.detail || `Failed to ${action} property.`);
        } finally {
            setTogglingTenantId(null);
        }
    };

    const handleToggleBranchStatus = async (branch) => {
        const isCurrentlyActive = branch.is_active !== false;
        const action = isCurrentlyActive ? "disable" : "enable";

        if (isCurrentlyActive && !window.confirm(`Are you sure you want to disable branch "${branch.name}"?`)) {
            return;
        }

        setTogglingBranchId(branch.id);
        try {
            await API.patch(`/branches/${branch.id}/toggle-status`);
            const config = { headers: { "X-Branch-ID": "all" } };
            const bRes = await API.get("/branches?include_inactive=true", config);
            setBranches(bRes.data || []);
            fetchTenants();
        } catch (e) {
            alert(e.response?.data?.detail || `Failed to ${action} branch.`);
        } finally {
            setTogglingBranchId(null);
        }
    };

    // Edit Property Modal State & Handlers
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const [editImageFile, setEditImageFile] = useState(null);
    const [editImagePreview, setEditImagePreview] = useState(null);
    const [editFormData, setEditFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        email: '',
        gst_number: '',
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: '',
        location: ''
    });

    const validateEmail = (email) => {
        if (!email) return true;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    };

    const handleOpenEditModal = (target) => {
        if (!target) return;
        
        let branchToEdit = target;
        // If target is tenant, find matching branch in branches list or construct fallback
        if (!target.code && (target.branch_code || target.branch_id)) {
            const found = branches.find(b => 
                (target.branch_id && b.id === target.branch_id) || 
                (b.tenant_id && b.tenant_id === target.id) ||
                (b.code && target.branch_code && b.code.toUpperCase() === target.branch_code.toUpperCase())
            );
            if (found) {
                branchToEdit = found;
            } else {
                branchToEdit = {
                    id: target.branch_id,
                    name: target.business_name || target.name || '',
                    code: target.branch_code && target.branch_code !== 'N/A' ? target.branch_code : '',
                    phone: target.contact_phone || '',
                    email: target.contact_email || target.email || '',
                    address: '',
                    location: '',
                    gst_number: '',
                    tenant_id: target.id
                };
            }
        }

        setEditingBranch(branchToEdit);
        setEditFormData({
            name: branchToEdit.name || '',
            code: branchToEdit.code || '',
            address: branchToEdit.address || '',
            phone: branchToEdit.phone || '',
            email: branchToEdit.email || '',
            gst_number: branchToEdit.gst_number || '',
            facebook: branchToEdit.facebook || '',
            instagram: branchToEdit.instagram || '',
            twitter: branchToEdit.twitter || '',
            linkedin: branchToEdit.linkedin || '',
            location: branchToEdit.location || ''
        });
        setEditImageFile(null);
        if (branchToEdit.image_url) {
            setEditImagePreview(
                branchToEdit.image_url.startsWith('http') 
                    ? branchToEdit.image_url 
                    : `${API.defaults.baseURL.replace('/api', '')}${branchToEdit.image_url}`
            );
        } else {
            setEditImagePreview(null);
        }
        setIsEditModalOpen(true);
    };

    const handleEditImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setEditImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditImagePreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmitEdit = async (e) => {
        e.preventDefault();
        if (!editingBranch || !editingBranch.id) {
            alert("No branch ID associated with this property yet.");
            return;
        }

        if (editFormData.email && !validateEmail(editFormData.email)) {
            alert('Please enter a valid email address');
            return;
        }

        if (!editFormData.name || !editFormData.name.trim()) {
            alert('Property name is required');
            return;
        }

        if (!editFormData.code || !editFormData.code.trim()) {
            alert('Hotel / Branch Code is required');
            return;
        }

        try {
            setIsSubmittingEdit(true);
            const data = new FormData();
            Object.keys(editFormData).forEach(key => {
                if (editFormData[key] !== null && editFormData[key] !== undefined) {
                    data.append(key, editFormData[key]);
                }
            });

            if (editImageFile) {
                data.append('image', editImageFile);
            }

            await API.put(`/branches/${editingBranch.id}`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            alert(`✅ Property "${editFormData.name}" updated successfully!`);
            setIsEditModalOpen(false);

            // Refresh data
            fetchTenants();
            const config = { headers: { "X-Branch-ID": "all" } };
            const bRes = await API.get("/branches?include_inactive=true", config);
            setBranches(bRes.data || []);
        } catch (error) {
            alert(error.response?.data?.detail || 'Failed to update property details.');
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    // Derived Counts & Options
    const uniquePlans = useMemo(() => {
        const plans = new Set();
        tenants.forEach(t => {
            const p = (t.plan_code || t.plan_name || '').toLowerCase().trim();
            if (p) plans.add(p);
        });
        return Array.from(plans);
    }, [tenants]);

    const pendingTenants = useMemo(() => tenants.filter(t => t.subscription_status === 'pending_approval'), [tenants]);
    const pendingTenantsCount = pendingTenants.length;
    const activeTenantsCount = useMemo(() => tenants.filter(t => t.subscription_status === 'active' && t.is_active !== false).length, [tenants]);
    const disabledTenantsCount = useMemo(() => tenants.filter(t => t.is_active === false).length, [tenants]);

    const filteredTenants = useMemo(() => {
        return tenants.filter(tenant => {
            // Status filter
            if (tenantStatusFilter === "pending") {
                if (tenant.subscription_status !== 'pending_approval') return false;
            } else if (tenantStatusFilter === "active") {
                if (tenant.subscription_status !== 'active' || tenant.is_active === false) return false;
            } else if (tenantStatusFilter === "disabled") {
                if (tenant.is_active !== false) return false;
            }

            // Plan filter
            if (tenantPlanFilter !== "all") {
                const p = (tenant.plan_code || tenant.plan_name || '').toLowerCase().trim();
                if (p !== tenantPlanFilter.toLowerCase()) return false;
            }

            // Search query
            if (tenantSearch.trim()) {
                const q = tenantSearch.toLowerCase().trim();
                const name = (tenant.business_name || tenant.name || '').toLowerCase();
                const slug = (tenant.slug || '').toLowerCase();
                const owner = (tenant.owner_name || '').toLowerCase();
                const email = (tenant.email || tenant.contact_email || '').toLowerCase();
                const phone = (tenant.contact_phone || '').toLowerCase();
                const code = (hotelCodes[tenant.id] || tenant.branch_code || '').toLowerCase();
                const plan = (tenant.plan_code || tenant.plan_name || '').toLowerCase();

                const match = name.includes(q) || slug.includes(q) || owner.includes(q) ||
                              email.includes(q) || phone.includes(q) || code.includes(q) || plan.includes(q);
                if (!match) return false;
            }

            return true;
        });
    }, [tenants, tenantStatusFilter, tenantPlanFilter, tenantSearch, hotelCodes]);

    const activeBranchesCount = useMemo(() => branches.filter(b => b.is_active !== false).length, [branches]);
    const disabledBranchesCount = useMemo(() => branches.filter(b => b.is_active === false).length, [branches]);

    const filteredBranches = useMemo(() => {
        return branches.filter(branch => {
            // Status filter
            if (branchStatusFilter === "active") {
                if (branch.is_active === false) return false;
            } else if (branchStatusFilter === "disabled") {
                if (branch.is_active !== false) return false;
            }

            // Search query
            if (branchSearch.trim()) {
                const q = branchSearch.toLowerCase().trim();
                const name = (branch.name || '').toLowerCase();
                const code = (branch.code || '').toLowerCase();
                const loc = (branch.location || '').toLowerCase();
                const addr = (branch.address || '').toLowerCase();
                const gst = (branch.gst_number || '').toLowerCase();

                const match = name.includes(q) || code.includes(q) || loc.includes(q) || addr.includes(q) || gst.includes(q);
                if (!match) return false;
            }

            return true;
        });
    }, [branches, branchStatusFilter, branchSearch]);

    useEffect(() => {
        let mounted = true;

        const fetchGlobalData = async (showLoading = true) => {
            try {
                if (showLoading || (branches.length === 0 && globalSummary.total_revenue === 0)) {
                    setLoading(true);
                }
                // Force headers to NOT use a specific branch so we get all branch data
                const config = { headers: { "X-Branch-ID": "all" } };

                const [branchesRes, overviewRes] = await Promise.allSettled([
                    API.get("/branches?include_inactive=true", config),
                    API.get("/saas/admin/overview", config)
                ]);

                if (!mounted) return;

                // Process branches
                if (branchesRes.status === "fulfilled") {
                    setBranches(branchesRes.value.data || []);
                }

                // Process high-speed aggregate summary
                if (overviewRes.status === "fulfilled" && overviewRes.value.data) {
                    const d = overviewRes.value.data;
                    setGlobalSummary({
                        total_revenue: d.total_revenue || 0,
                        total_expenses: d.total_expenses || 0,
                        active_employees: d.active_employees || 0,
                        occupied_rooms: d.occupied_rooms || 0,
                        total_rooms: d.total_rooms || 0
                    });
                }

            } catch (error) {
                console.error("Super Admin fetch error:", error);
                setErr("Failed to load global data. Please try again.");
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchGlobalData(true);
        fetchTenants();
        const interval = setInterval(() => fetchGlobalData(false), 300000); // 5 min
        return () => { mounted = false; clearInterval(interval); };
    }, []);

    const netProfit = globalSummary.total_revenue - globalSummary.total_expenses;
    const margin = globalSummary.total_revenue > 0 ? (netProfit / globalSummary.total_revenue * 100).toFixed(1) : 0;

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex bg-gray-50 items-center justify-center min-h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
                </div>
            </DashboardLayout>
        );
    }

    if (err) {
        return (
            <DashboardLayout>
                <div className="p-8 text-center bg-red-50 text-red-600 rounded-xl my-8 mx-auto max-w-2xl border border-red-200 shadow-sm">
                    <h2 className="text-xl font-bold mb-2">Error Loading Enterprise Dashboard</h2>
                    <p>{err}</p>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            {/* Background Animation */}
            <div className="bubbles-container">
                {[...Array(10)].map((_, i) => <li key={i}></li>)}
            </div>

            <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 z-10">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-6">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-purple-600 tracking-tight">
                            Enterprise Command Center
                        </h1>
                        <p className="text-sm sm:text-base text-gray-500 mt-1 font-medium">Global Multi-Branch Executive Overview</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="text-sm font-semibold text-gray-600">Global Sync Active</span>
                    </div>
                </header>

                {/* Top Tier KPIs */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <SuperAdminKPICard
                        label="Total Network Revenue"
                        value={formatCurrency(globalSummary.total_revenue)}
                        sub="Across all branches"
                        icon={Receipt}
                        colorClass="bg-emerald-500 text-emerald-100"
                    />
                    <SuperAdminKPICard
                        label="Total Network Expenses"
                        value={formatCurrency(globalSummary.total_expenses)}
                        sub="Global operating costs"
                        icon={PiggyBank}
                        colorClass="bg-rose-500 text-rose-100"
                    />
                    <SuperAdminKPICard
                        label="Enterprise Net Profit"
                        value={formatCurrency(netProfit)}
                        sub={`Global Margin: ${margin}%`}
                        icon={Activity}
                        colorClass="bg-blue-500 text-blue-100"
                    />
                    <SuperAdminKPICard
                        label="Total Active Branches"
                        value={branches.length}
                        sub="Managed properties"
                        icon={Building2}
                        colorClass="bg-purple-500 text-purple-100"
                    />
                    <SuperAdminKPICard
                        label="Global Workforce"
                        value={globalSummary.active_employees}
                        sub="Active employees"
                        icon={Users}
                        colorClass="bg-amber-500 text-amber-100"
                    />
                    <SuperAdminKPICard
                        label="Global Room Occupancy"
                        value={`${globalSummary.occupied_rooms} / ${globalSummary.total_rooms}`}
                        sub="Occupied vs Total Rooms"
                        icon={Briefcase}
                        colorClass="bg-cyan-500 text-cyan-100"
                    />
                </section>

                {/* Property Approvals Section */}
                <section className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-amber-100 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Shield className="text-amber-600" size={20} />
                            <h3 className="text-lg font-bold text-gray-800">Property Approvals</h3>
                            {pendingTenantsCount > 0 && (
                                <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400 text-white animate-pulse">
                                    {pendingTenantsCount} Pending
                                </span>
                            )}
                            <span className="text-xs text-gray-400 font-medium ml-2">
                                (Showing {filteredTenants.length} of {tenants.length})
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {(tenantSearch || tenantStatusFilter !== "all" || tenantPlanFilter !== "all") && (
                                <button
                                    onClick={() => {
                                        setTenantSearch("");
                                        setTenantStatusFilter("all");
                                        setTenantPlanFilter("all");
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1 transition-colors"
                                >
                                    <RotateCcw size={12} /> Reset Filters
                                </button>
                            )}
                            <button onClick={fetchTenants} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter Toolbar */}
                    <div className="p-4 sm:p-5 bg-white border-b border-gray-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                value={tenantSearch}
                                onChange={(e) => setTenantSearch(e.target.value)}
                                placeholder="Search property, owner, email, hotel code, plan..."
                                className="w-full pl-10 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-gray-800 placeholder-gray-400 shadow-sm"
                            />
                            {tenantSearch && (
                                <button
                                    onClick={() => setTenantSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Status Tabs & Plan Filter */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Status Filter Tabs */}
                            <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                                <button
                                    onClick={() => setTenantStatusFilter("all")}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${
                                        tenantStatusFilter === "all"
                                            ? "bg-white text-gray-900 shadow-sm"
                                            : "text-gray-600 hover:text-gray-900"
                                    }`}
                                >
                                    All ({tenants.length})
                                </button>
                                <button
                                    onClick={() => setTenantStatusFilter("pending")}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                        tenantStatusFilter === "pending"
                                            ? "bg-amber-500 text-white shadow-sm font-bold"
                                            : "text-amber-700 hover:text-amber-900"
                                    }`}
                                >
                                    <Clock size={12} /> Pending ({pendingTenantsCount})
                                </button>
                                <button
                                    onClick={() => setTenantStatusFilter("active")}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                        tenantStatusFilter === "active"
                                            ? "bg-emerald-600 text-white shadow-sm font-bold"
                                            : "text-emerald-700 hover:text-emerald-900"
                                    }`}
                                >
                                    <CheckCircle size={12} /> Active ({activeTenantsCount})
                                </button>
                                <button
                                    onClick={() => setTenantStatusFilter("disabled")}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                        tenantStatusFilter === "disabled"
                                            ? "bg-rose-600 text-white shadow-sm font-bold"
                                            : "text-rose-700 hover:text-rose-900"
                                    }`}
                                >
                                    <Ban size={12} /> Disabled ({disabledTenantsCount})
                                </button>
                            </div>

                            {/* Plan Filter */}
                            {uniquePlans.length > 0 && (
                                <select
                                    value={tenantPlanFilter}
                                    onChange={(e) => setTenantPlanFilter(e.target.value)}
                                    className="text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm cursor-pointer capitalize"
                                >
                                    <option value="all">All Plans</option>
                                    {uniquePlans.map(plan => (
                                        <option key={plan} value={plan} className="capitalize">
                                            {plan.charAt(0).toUpperCase() + plan.slice(1)} Plan
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {tenantsLoading ? (
                        <div className="px-6 py-10 text-center text-gray-400">Loading tenants...</div>
                    ) : tenants.length === 0 ? (
                        <div className="px-6 py-10 text-center text-gray-400">No registered properties found.</div>
                    ) : filteredTenants.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
                                <Search size={22} />
                            </div>
                            <p className="text-sm font-bold text-gray-800">No properties matched your search</p>
                            <p className="text-xs text-gray-500 mt-1">Try refining your search keyword or clearing the status filter.</p>
                            <button
                                onClick={() => {
                                    setTenantSearch("");
                                    setTenantStatusFilter("all");
                                    setTenantPlanFilter("all");
                                }}
                                className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1.5"
                            >
                                <RotateCcw size={12} /> Clear all filters
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-100">
                                    <tr>
                                        <th className="px-5 py-4">Property / Business</th>
                                        <th className="px-5 py-4">Owner</th>
                                        <th className="px-5 py-4">Aiosell Hotel Code</th>
                                        <th className="px-5 py-4">Plan</th>
                                        <th className="px-5 py-4">Status</th>
                                        <th className="px-5 py-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredTenants.map(tenant => (
                                        <tr key={tenant.id} className={`hover:bg-gray-50/50 transition-colors ${tenant.subscription_status === 'pending_approval' ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-5 py-4">
                                                <p className="font-semibold text-gray-900">{tenant.business_name || tenant.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">{tenant.slug}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-gray-700">{tenant.owner_name || '—'}</p>
                                                <p className="text-xs text-gray-400">{tenant.email || tenant.contact_email}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                {tenant.subscription_status === 'pending_approval' ? (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="relative flex items-center">
                                                            <span className="absolute left-2.5 text-xs text-gray-400 font-mono">#</span>
                                                            <input
                                                                type="text"
                                                                value={hotelCodes[tenant.id] !== undefined ? hotelCodes[tenant.id] : (tenant.branch_code && tenant.branch_code !== 'N/A' ? tenant.branch_code : '')}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
                                                                    setHotelCodes(prev => ({ ...prev, [tenant.id]: val }));
                                                                }}
                                                                placeholder="e.g. HCC001"
                                                                className="pl-6 pr-2.5 py-1.5 w-36 text-xs font-mono font-bold tracking-wider uppercase border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-indigo-900 shadow-sm"
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-amber-700 font-medium">Enter at approval</span>
                                                    </div>
                                                ) : (
                                                    <span className="font-mono font-bold text-indigo-700 text-sm tracking-wider">{tenant.branch_code || '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 capitalize text-gray-600">{tenant.plan_code || tenant.plan_name || 'starter'}</td>
                                            <td className="px-5 py-4">
                                                {tenant.subscription_status === 'pending_approval' ? (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                                        <Clock size={12} /> Pending Approval
                                                    </span>
                                                ) : tenant.is_active === false ? (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                                        <Ban size={12} /> Disabled
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                                        <CheckCircle size={12} /> Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(tenant)}
                                                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                                        title="Edit property details, code, and address"
                                                    >
                                                        <Edit2 size={12} /> Edit
                                                    </button>
                                                    {tenant.subscription_status === 'pending_approval' ? (
                                                        <button
                                                            onClick={() => handleApproveTenant(tenant.id)}
                                                            disabled={approvingId === tenant.id}
                                                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm hover:shadow"
                                                        >
                                                            {approvingId === tenant.id ? (
                                                                <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Approving...</>
                                                            ) : (
                                                                <><CheckCircle size={13} /> Approve Property</>
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleToggleTenantStatus(tenant)}
                                                            disabled={togglingTenantId === tenant.id}
                                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm ${
                                                                tenant.is_active === false
                                                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                    : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                                                            }`}
                                                            title={tenant.is_active === false ? "Enable this property workspace" : "Disable this property workspace"}
                                                        >
                                                            {togglingTenantId === tenant.id ? (
                                                                <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Updating...</>
                                                            ) : tenant.is_active === false ? (
                                                                <><Power size={13} /> Enable Property</>
                                                            ) : (
                                                                <><Ban size={13} /> Disable Property</>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Global Branches Overview */}
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Building2 className="text-indigo-600" size={20} />
                            <h3 className="text-lg font-bold text-gray-800">Active Properties</h3>
                            <span className="text-xs text-gray-400 font-medium ml-2">
                                (Showing {filteredBranches.length} of {branches.length})
                            </span>
                        </div>
                        {(branchSearch || branchStatusFilter !== "all") && (
                            <button
                                onClick={() => {
                                    setBranchSearch("");
                                    setBranchStatusFilter("all");
                                }}
                                className="text-xs text-gray-500 hover:text-gray-800 font-medium flex items-center gap-1 transition-colors"
                            >
                                <RotateCcw size={12} /> Reset Filters
                            </button>
                        )}
                    </div>

                    {/* Branches Search & Filter Toolbar */}
                    <div className="p-4 sm:p-5 bg-white border-b border-gray-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                value={branchSearch}
                                onChange={(e) => setBranchSearch(e.target.value)}
                                placeholder="Search branch name, aiosell code, location, GST..."
                                className="w-full pl-10 pr-9 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all text-gray-800 placeholder-gray-400 shadow-sm"
                            />
                            {branchSearch && (
                                <button
                                    onClick={() => setBranchSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Status Filter Tabs */}
                        <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
                            <button
                                onClick={() => setBranchStatusFilter("all")}
                                className={`px-3 py-1.5 rounded-lg transition-all ${
                                    branchStatusFilter === "all"
                                        ? "bg-white text-gray-900 shadow-sm"
                                        : "text-gray-600 hover:text-gray-900"
                                }`}
                            >
                                All ({branches.length})
                            </button>
                            <button
                                onClick={() => setBranchStatusFilter("active")}
                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                    branchStatusFilter === "active"
                                        ? "bg-emerald-600 text-white shadow-sm font-bold"
                                        : "text-emerald-700 hover:text-emerald-900"
                                }`}
                            >
                                <CheckCircle size={12} /> Active ({activeBranchesCount})
                            </button>
                            <button
                                onClick={() => setBranchStatusFilter("disabled")}
                                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                    branchStatusFilter === "disabled"
                                        ? "bg-rose-600 text-white shadow-sm font-bold"
                                        : "text-rose-700 hover:text-rose-900"
                                }`}
                            >
                                <Ban size={12} /> Disabled ({disabledBranchesCount})
                            </button>
                        </div>
                    </div>

                    {filteredBranches.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
                                <Search size={22} />
                            </div>
                            <p className="text-sm font-bold text-gray-800">No properties matched your search</p>
                            <p className="text-xs text-gray-500 mt-1">Try adjusting your keyword or clearing the filter.</p>
                            <button
                                onClick={() => {
                                    setBranchSearch("");
                                    setBranchStatusFilter("all");
                                }}
                                className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors inline-flex items-center gap-1.5"
                            >
                                <RotateCcw size={12} /> Clear search
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Branch Name</th>
                                        <th className="px-6 py-4">Aiosell Code</th>
                                        <th className="px-6 py-4">Location</th>
                                        <th className="px-6 py-4">GST Number</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredBranches.map(branch => (
                                        <tr key={branch.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-gray-900">{branch.name}</td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono font-bold text-indigo-700 text-sm tracking-wider">{branch.code || '—'}</span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600">
                                                {renderLocationLink(branch, "N/A")}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 font-mono text-xs">{branch.gst_number || "N/A"}</td>
                                            <td className="px-6 py-4">
                                                {branch.is_active === false ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                                                        <Ban size={11} /> Disabled
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                                        <CheckCircle size={11} /> Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleOpenEditModal(branch)}
                                                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                                                        title="Edit property details, code, and address"
                                                    >
                                                        <Edit2 size={12} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleBranchStatus(branch)}
                                                        disabled={togglingBranchId === branch.id}
                                                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                                            branch.is_active === false
                                                                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                                                                : "bg-gray-50 hover:bg-rose-50 text-gray-700 hover:text-rose-700 border border-gray-200 hover:border-rose-200"
                                                        }`}
                                                        title={branch.is_active === false ? "Enable this branch" : "Disable this branch"}
                                                    >
                                                        {togglingBranchId === branch.id ? (
                                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                        ) : branch.is_active === false ? (
                                                            <><Power size={12} /> Enable</>
                                                        ) : (
                                                            <><Ban size={12} /> Disable</>
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Edit Property Details Modal */}
                {isEditModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative my-8 animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto border border-gray-100">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between border-b border-gray-100 pb-5 mb-6">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                            <Edit2 size={18} />
                                        </div>
                                        Edit Property Details
                                    </h2>
                                    <p className="text-xs text-gray-500 mt-1 font-medium">
                                        Update property configuration, Aiosell hotel sync code, and contact information
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmitEdit} className="space-y-6">
                                {/* Banner / Profile Image */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                        Property Banner Image
                                    </label>
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-xl bg-gray-50 border border-gray-200">
                                        <div className="h-28 w-44 rounded-xl border-2 border-dashed border-gray-300 bg-white overflow-hidden flex items-center justify-center relative group flex-shrink-0 shadow-inner">
                                            {editImagePreview ? (
                                                <img
                                                    src={editImagePreview}
                                                    alt="Property Banner"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Building2 className="text-gray-300" size={36} />
                                            )}
                                            <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-xs font-bold gap-1">
                                                <Camera size={14} /> Change
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    onChange={handleEditImageChange}
                                                    accept="image/*"
                                                />
                                            </label>
                                        </div>
                                        <div className="flex-1 text-xs text-gray-500">
                                            <p className="font-bold text-gray-800 text-sm mb-0.5">High-resolution banner</p>
                                            <p className="text-gray-500">Recommended 1200x600px (JPG, PNG, or WEBP)</p>
                                            <label className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold cursor-pointer transition-colors border border-indigo-200 text-xs">
                                                <Upload size={12} /> Choose Image
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    onChange={handleEditImageChange}
                                                    accept="image/*"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Basic Info */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                                            <Building2 size={14} /> Core Information
                                        </h3>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">
                                                Property Name <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={editFormData.name}
                                                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="e.g. Stayone Wild Villa"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">
                                                Aiosell Hotel / Branch Code <span className="text-rose-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                                <input
                                                    type="text"
                                                    required
                                                    value={editFormData.code}
                                                    onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
                                                    className="w-full pl-8 pr-3.5 py-2 text-sm font-mono font-bold uppercase tracking-wider border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all text-indigo-950"
                                                    placeholder="e.g. PBR, GML, SWV"
                                                />
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Required for Aiosell OTA Channel Manager synchronization.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Location</label>
                                            <input
                                                type="text"
                                                value={editFormData.location}
                                                onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="e.g. Sultan Bathery, Wayanad"
                                            />
                                        </div>
                                    </div>

                                    {/* Contact Details */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                                            <Users size={14} /> Contact Information
                                        </h3>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Contact Phone</label>
                                            <input
                                                type="text"
                                                value={editFormData.phone}
                                                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="+91 98765 43210"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Contact Email</label>
                                            <input
                                                type="email"
                                                value={editFormData.email}
                                                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                                                className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="resort@stayone.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">GST Registration No.</label>
                                            <input
                                                type="text"
                                                value={editFormData.gst_number}
                                                onChange={(e) => setEditFormData({ ...editFormData, gst_number: e.target.value.toUpperCase() })}
                                                className="w-full px-3.5 py-2 text-sm font-mono border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                                placeholder="e.g. 32BLUPS54887K1Z1"
                                            />
                                        </div>
                                    </div>

                                    {/* Full Address */}
                                    <div className="col-span-1 md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-600 mb-1">Full Property Address / Google Maps Link</label>
                                        <textarea
                                            value={editFormData.address}
                                            onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                                            className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all"
                                            rows="2"
                                            placeholder="Karapothadi, Kulukunnu, Sultan Bathery, near Thottamoola, Kerala 673595 or Google Maps link"
                                        />
                                    </div>

                                    {/* Social Links */}
                                    <div className="col-span-1 md:col-span-2 space-y-3 pt-2 border-t border-gray-100">
                                        <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Social Links (Optional)</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Facebook</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.facebook}
                                                    onChange={(e) => setEditFormData({ ...editFormData, facebook: e.target.value })}
                                                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/30 outline-none"
                                                    placeholder="Profile URL"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Instagram</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.instagram}
                                                    onChange={(e) => setEditFormData({ ...editFormData, instagram: e.target.value })}
                                                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/30 outline-none"
                                                    placeholder="Profile or @handle"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Twitter / X</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.twitter}
                                                    onChange={(e) => setEditFormData({ ...editFormData, twitter: e.target.value })}
                                                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/30 outline-none"
                                                    placeholder="Profile or @handle"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">LinkedIn</label>
                                                <input
                                                    type="text"
                                                    value={editFormData.linkedin}
                                                    onChange={(e) => setEditFormData({ ...editFormData, linkedin: e.target.value })}
                                                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/30 outline-none"
                                                    placeholder="Profile URL"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Actions */}
                                <div className="flex items-center justify-end gap-3 pt-5 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditModalOpen(false)}
                                        disabled={isSubmittingEdit}
                                        className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingEdit}
                                        className="px-7 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl hover:shadow-lg transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-70"
                                    >
                                        {isSubmittingEdit ? (
                                            <>
                                                <Loader2 className="animate-spin" size={16} />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle size={16} />
                                                Save Changes
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}
