import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import stayoneLogo from "../assets/stayonelogo.png";
import { jwtDecode } from "jwt-decode";
import { 
  Building2, 
  Mail, 
  Lock, 
  User, 
  Phone, 
  ArrowRight, 
  Loader2, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  Globe,
  Coins,
  Hotel,
  Clock,
  CreditCard,
  Hash,
  MapPin,
  FileText,
  Share2,
  Image as ImageIcon,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  MessageSquare,
  Copy,
  Check,
  ArrowUpRight
} from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [slugStatus, setSlugStatus] = useState({ checking: false, available: null, reason: "" });

  // Hotel Code (Compulsory)
  const [branchCode, setBranchCode] = useState("");

  // Optional Property Details
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [facebook, setFacebook] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showSocials, setShowSocials] = useState(false);

  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [selectedPlan, setSelectedPlan] = useState("starter"); // "starter", "growth", "enterprise", or "trial"
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const defaultFallbackPlans = [
    {
      id: 1,
      code: "starter",
      name: "Starter",
      price_monthly: 2999,
      max_rooms: 25,
      max_branches: 1,
      max_staff_users: 10,
      description: "Ideal for boutique resorts and homestays",
      badge: "POPULAR"
    },
    {
      id: 2,
      code: "growth",
      name: "Growth Pro",
      price_monthly: 6999,
      max_rooms: 75,
      max_branches: 3,
      max_staff_users: 30,
      description: "For growing resorts and multi-branch properties",
      badge: "MOST POPULAR"
    },
    {
      id: 3,
      code: "enterprise",
      name: "Enterprise Chain",
      price_monthly: 14999,
      max_rooms: 9999,
      max_branches: 999,
      max_staff_users: 9999,
      description: "For enterprise chains and large hotel groups",
      badge: "ENTERPRISE"
    },
    {
      id: 4,
      code: "trial",
      name: "14-Day Free Trial",
      price_monthly: 0,
      max_rooms: 20,
      max_branches: 1,
      max_staff_users: 10,
      description: "Ideal for testing all features free of charge",
      badge: "TRIAL"
    }
  ];

  const displayedPlans = (plans && plans.length > 0) ? plans : defaultFallbackPlans;
  const starterPlanObj = displayedPlans.find(p => p.code === "starter") || displayedPlans[0] || { price_monthly: 2999, max_rooms: 25 };
  const starterPlanPrice = (starterPlanObj.price_monthly || 2999).toLocaleString();
  const starterPlanRooms = starterPlanObj.max_rooms >= 999 ? "Unlimited" : (starterPlanObj.max_rooms || 25);

  // Fetch active SaaS plans from API dynamically (synced with Super Admin Dashboard)
  useEffect(() => {
    let isMounted = true;
    const fetchPlans = async () => {
      setPlansLoading(true);
      try {
        const res = await api.get("/saas/plans");
        if (isMounted && res.data && Array.isArray(res.data) && res.data.length > 0) {
          setPlans(res.data);
          if (!selectedPlan || !res.data.some(p => p.code === selectedPlan)) {
            const hasStarter = res.data.find(p => p.code === "starter");
            setSelectedPlan(hasStarter ? "starter" : res.data[0].code);
          }
        }
      } catch (err) {
        console.error("Failed to load SaaS plans from API:", err);
      } finally {
        if (isMounted) setPlansLoading(false);
      }
    };
    fetchPlans();
    return () => { isMounted = false; };
  }, []);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingApproval, setPendingApproval] = useState(false); // Show after successful registration
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [registeredTenant, setRegisteredTenant] = useState(null);
  const [raiseUtr, setRaiseUtr] = useState("");
  const [raisingPayment, setRaisingPayment] = useState(false);
  const [paymentRaisedSuccess, setPaymentRaisedSuccess] = useState(false);

  const handleRaisePaymentPending = async (e) => {
    e.preventDefault();
    if (!raiseUtr.trim()) return;
    setRaisingPayment(true);
    try {
      await api.post("/saas/raise-payment", {
        tenant_id: registeredTenant?.id,
        branch_code: branchCode,
        transaction_ref: raiseUtr.trim()
      });
      setPaymentRaisedSuccess(true);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to raise payment. Please try again.");
    } finally {
      setRaisingPayment(false);
    }
  };

  // Auto-generate slug from business name unless user manually edits it
  useEffect(() => {
    if (!isSlugCustomized && businessName) {
      const generated = businessName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      setSlug(generated);
    }
  }, [businessName, isSlugCustomized]);

  // Debounced check slug availability
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugStatus({ checking: false, available: null, reason: "" });
      return;
    }

    const timer = setTimeout(async () => {
      setSlugStatus(prev => ({ ...prev, checking: true }));
      try {
        const res = await api.get(`/saas/check-slug?slug=${encodeURIComponent(slug)}`);
        setSlugStatus({
          checking: false,
          available: res.data.available,
          reason: res.data.reason || ""
        });
      } catch (err) {
        setSlugStatus({ checking: false, available: false, reason: "Error checking slug" });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg("Banner image must be under 5MB");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (slugStatus.available === false) {
      setErrorMsg(slugStatus.reason || "Please choose an available URL slug.");
      return;
    }

    if (!branchCode.trim()) {
      setErrorMsg("Property Code / Hotel Code is compulsory. Please enter your hotel code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      // 1. Upload Banner Image if user provided one
      let uploadedImageUrl = undefined;
      if (imageFile) {
        try {
          const imgFormData = new FormData();
          imgFormData.append("image", imageFile);
          const uploadRes = await api.post("/saas/upload-image", imgFormData, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          if (uploadRes.data?.image_url) {
            uploadedImageUrl = uploadRes.data.image_url;
          }
        } catch (imgErr) {
          console.warn("Banner upload error, proceeding without it:", imgErr);
        }
      }

      const payload = {
        business_name: businessName.trim(),
        slug: slug.trim().toLowerCase(),
        branch_code: branchCode.trim().toUpperCase(),
        owner_name: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        currency,
        plan_code: selectedPlan,
        location: location.trim() || undefined,
        address: address.trim() || undefined,
        gst_number: gstNumber.trim().toUpperCase() || undefined,
        facebook: facebook.trim() || undefined,
        instagram: instagram.trim() || undefined,
        twitter: twitter.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        image_url: uploadedImageUrl
      };

      const res = await api.post("/saas/register", payload);

      if (res.data && res.data.success) {
        // Clear any tokens so user cannot bypass login before Super Admin acceptance
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("permissions");
        localStorage.removeItem("activeBranchId");

        if (res.data.tenant) {
          setRegisteredTenant(res.data.tenant);
        }

        // Show pending approval screen
        setPendingApproval(true);
      } else {
        setErrorMsg("Failed to complete setup. Please try again.");
      }
    } catch (err) {
      console.error("Registration error:", err);
      const detail = err.response?.data?.detail || err.message || "Registration failed. Please check your information.";
      setErrorMsg(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  // Pending approval screen after successful registration
  if (pendingApproval) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0f172a] font-sans p-6">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-10 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3">Registration Submitted!</h1>
          <p className="text-gray-600 text-base leading-relaxed mb-6">
            Your property registration has been submitted successfully. Your account and property will be activated <strong>only after Super Admin accepts your registration and confirms payment</strong>.
          </p>
          {/* Fast-Track Activation via Teqmates Box */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-purple-50/60 to-emerald-50/50 p-4 mb-6 space-y-3 text-left shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm">
                  <Zap size={15} className="fill-white" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 leading-tight">Pay at Teqmates</h4>
                  <p className="text-[11px] text-indigo-700 font-semibold">Fast-Track Activation</p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                ⚡ Within Minutes
              </span>
            </div>

            <div className="bg-white/95 p-3 rounded-xl border border-indigo-100 space-y-2 text-xs">
              <p className="text-gray-700 font-medium leading-relaxed">
                👉 <strong className="text-indigo-950 font-bold">Pay at Teqmates and share screenshot</strong> to activate your property within minutes!
              </p>
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Selected Plan:</span>
                  <span className="font-bold text-gray-800">
                    {displayedPlans.find(p => p.code === selectedPlan)?.name || "Starter"}
                    {registeredTenant?.monthly_amount > 0 ? ` (₹${(registeredTenant.monthly_amount).toLocaleString()}/mo)` : " (Free Trial)"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Payee:</span>
                  <span className="font-bold text-gray-800">Teqmates Technologies Pvt Ltd</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Teqmates UPI ID:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      teqmates@upi
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText("teqmates@upi");
                        setCopiedUpi(true);
                        setTimeout(() => setCopiedUpi(false), 2000);
                      }}
                      className="px-2 py-0.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors flex items-center gap-1"
                    >
                      {copiedUpi ? <><Check size={12} className="text-emerald-600" /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Submit UTR to Raise Payment */}
              {paymentRaisedSuccess ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-emerald-900 text-xs flex items-start gap-2 shadow-xs">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Payment Raised Successfully!</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      UTR <span className="font-mono font-bold text-emerald-950">{raiseUtr}</span> submitted. Super Admin will verify and accept your payment to activate your property.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRaisePaymentPending} className="bg-white/95 p-3 rounded-xl border border-indigo-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wide">
                      Already Paid? Raise Payment with UTR:
                    </span>
                    <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Step 2
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={raiseUtr}
                      onChange={(e) => setRaiseUtr(e.target.value)}
                      placeholder="Enter 12-digit UTR / Txn ID"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono uppercase focus:border-indigo-500 focus:outline-none"
                      required
                    />
                    <button
                      type="submit"
                      disabled={raisingPayment || !raiseUtr.trim()}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors shrink-0 shadow-xs"
                    >
                      {raisingPayment ? "Submitting..." : "Raise Payment"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <a
              href={`https://api.whatsapp.com/send?phone=919876543210&text=${encodeURIComponent(
                `Hi Teqmates, I have registered my property "${businessName}" (Code: ${branchCode}). Please find my payment screenshot attached to activate my property within minutes.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 group"
            >
              <MessageSquare size={16} />
              <span>Share Screenshot on WhatsApp (+91 98765 43210)</span>
              <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Standard Activation</p>
                <ul className="text-xs text-amber-700 mt-1 space-y-1 list-disc ml-4">
                  <li>Admin team reviews your registration details</li>
                  <li>Once verified and approved, full access is granted</li>
                  <li>You can log in and view your property status anytime</li>
                </ul>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 group"
          >
            <span>Go to Login</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <p className="text-xs text-gray-400 mt-4">You'll be notified when your property is approved.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex bg-[#0f172a] font-sans overflow-hidden">
      
      {/* LEFT PANEL - Registration Form */}
      <div className="w-full lg:w-[50%] xl:w-[42%] flex flex-col justify-between bg-white relative z-10 shadow-2xl overflow-y-auto max-h-screen">
        
        {/* Subtle top decoration */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600"></div>

        <div className="px-8 sm:px-12 md:px-14 py-10">
          
          {/* Header & Logo */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <img src={stayoneLogo} alt="Stayone Hospitality" className="h-10 w-auto object-contain" />
              <div>
                <span className="text-xl font-bold tracking-tight text-gray-900">Stayone</span>
                <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold uppercase">Cloud</span>
              </div>
            </div>
            
            <Link to="/" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
              Sign In Instead &rarr;
            </Link>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Register Your Property
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Set up your StayOne workspace. Simple monthly plans, no setup fees.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2 animate-in fade-in">
              <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-4">
            
            {/* Property Profile Banner (Optional) */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <ImageIcon size={14} className="text-emerald-600" />
                  <span>Property Profile Image</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">Optional</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {imagePreview ? (
                  <div className="relative w-full sm:w-36 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0 group">
                    <img src={imagePreview} alt="Property Banner" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100 shadow transition-opacity"
                      title="Remove image"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="w-full sm:w-36 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 flex-shrink-0">
                    <ImageIcon size={22} />
                  </div>
                )}

                <div className="flex-1 text-left w-full">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 hover:border-emerald-500 rounded-xl text-xs font-semibold text-slate-700 hover:text-emerald-700 transition-colors shadow-sm">
                    <Upload size={13} />
                    <span>{imageFile ? "Change Banner" : "Choose File"}</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Upload a property banner (Recommended: 1200x600px, JPG/PNG/WEBP).
                  </p>
                </div>
              </div>
            </div>

            {/* Business Section */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                <Hotel size={14} className="text-emerald-600" />
                <span>Property & Business Profile</span>
              </div>

              {/* Business Name */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Resort / Business Name <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-600">
                    <Building2 size={18} />
                  </div>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                    placeholder="e.g. Paradise Bay Beach Resort"
                    required
                  />
                </div>
              </div>

              {/* Subdomain Slug */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Workspace URL <span className="text-red-500">*</span>
                  </label>
                  {slugStatus.checking && (
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Checking...
                    </span>
                  )}
                  {!slugStatus.checking && slugStatus.available === true && (
                    <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> Available
                    </span>
                  )}
                  {!slugStatus.checking && slugStatus.available === false && (
                    <span className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                      <XCircle size={12} /> {slugStatus.reason || "Unavailable"}
                    </span>
                  )}
                </div>
                <div className="flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                  <div className="pl-3.5 pr-1 text-gray-400">
                    <Globe size={16} />
                  </div>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setIsSlugCustomized(true);
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                    className="w-full py-2.5 px-2 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
                    placeholder="paradisebay"
                    required
                  />
                  <span className="pr-3 text-xs text-gray-400 font-medium select-none">
                    .stayone.app
                  </span>
                </div>
              </div>

              {/* Branch Code / Hotel Code (Compulsory) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Branch Code / Hotel Code <span className="text-red-500 font-bold">*</span>
                  </label>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    Compulsory
                  </span>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-600 font-mono font-bold text-sm">
                    #
                  </div>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                    className="block w-full pl-9 pr-4 py-2.5 bg-white border border-amber-300 rounded-xl text-sm font-mono font-bold tracking-wider text-indigo-900 placeholder-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none uppercase shadow-sm"
                    placeholder="e.g. PBR or HCC001"
                    required
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Used for Channel Manager sync. Must match your hotel code exactly.
                </p>
              </div>

              {/* Location (Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">Location</label>
                  <span className="text-[10px] text-slate-400 font-medium">Optional</span>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-600">
                    <MapPin size={18} />
                  </div>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none"
                    placeholder="e.g., Varkala or Google Maps Link"
                  />
                </div>
              </div>

              {/* Currency & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Currency</label>
                  <div className="relative">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full py-2 px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 outline-none focus:border-emerald-500 transition-colors"
                    >
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                      <option value="AED">AED (د.إ) - UAE Dirham</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">Mobile / Phone</label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full py-2 px-3 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-500 transition-colors"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Owner Section */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                <User size={14} className="text-indigo-600" />
                <span>Primary Administrator Account</span>
              </div>

              {/* Owner Full Name */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Your Full Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-600">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    placeholder="e.g. Sophia Martinez"
                    required
                  />
                </div>
              </div>

              {/* Work Email */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Work Email (Login ID)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-600">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    placeholder="sophia@paradisebay.com"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-indigo-600">
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Compliance & Address (Optional) */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  <FileText size={14} className="text-emerald-600" />
                  <span>Compliance & Address</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600">Optional</span>
              </div>

              {/* GST Registration No */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">GST Registration No.</label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  className="block w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-mono text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none uppercase"
                  placeholder="e.g. 29AAAAA0000A1Z5"
                />
              </div>

              {/* Full Property Address */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Full Property Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="block w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none resize-none"
                  placeholder="Street, City, State, ZIP"
                />
              </div>
            </div>

            {/* Social Presence (Optional) */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <button
                type="button"
                onClick={() => setShowSocials(prev => !prev)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Share2 size={14} className="text-indigo-600" />
                  <span>Social Presence</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-600 normal-case tracking-normal">Optional</span>
                </div>
                <span className="text-slate-400 hover:text-slate-600">
                  {showSocials ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {showSocials && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">Facebook</label>
                    <input
                      type="text"
                      value={facebook}
                      onChange={(e) => setFacebook(e.target.value)}
                      placeholder="Profile URL"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">Instagram</label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="Username / URL"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">Twitter / X</label>
                    <input
                      type="text"
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      placeholder="Username"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 block mb-1">LinkedIn</label>
                    <input
                      type="text"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="Profile URL"
                      className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Plan Tier Selection: Dynamic SaaS Plans matching Admin Dashboard */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700">
                  Choose Resort Size & Plan
                </label>
                {plansLoading && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Syncing plans...
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {displayedPlans.map((plan) => {
                  const isSelected = selectedPlan === plan.code;
                  const roomText = plan.max_rooms >= 999 ? "Unlimited Rooms" : `Up to ${plan.max_rooms} Rooms`;
                  const isFree = !plan.price_monthly || plan.price_monthly === 0;

                  return (
                    <div
                      key={plan.id || plan.code}
                      onClick={() => setSelectedPlan(plan.code)}
                      className={`cursor-pointer p-3 rounded-xl border-2 transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/60 shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-gray-900 text-xs truncate">{plan.name}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {plan.badge && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded bg-amber-100 text-amber-800">
                                {plan.badge}
                              </span>
                            )}
                            {isSelected && (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                            )}
                          </div>
                        </div>
                        <div className="text-emerald-700 font-extrabold text-base">
                          {isFree ? "Free" : `₹${plan.price_monthly.toLocaleString()}`}
                          {!isFree && <span className="text-[11px] font-normal text-gray-500"> / mo</span>}
                        </div>
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                        <span className="font-medium text-gray-700">{roomText}</span>
                        <span>{plan.max_branches >= 999 ? "Unlimited Br." : plan.max_branches > 1 ? `${plan.max_branches} Branches` : "1 Branch"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Approval info badge */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-2 text-xs text-amber-800">
              <Clock size={16} className="text-amber-600 shrink-0" />
              <span className="font-medium">After registration, your property needs admin approval before full access is granted.</span>
            </div>

            {/* Billing info */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2 text-xs text-emerald-800">
              <CreditCard size={16} className="text-emerald-600 shrink-0" />
              <span className="font-medium">Monthly billing — view and pay your invoice from Day 1. No hidden fees.</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || slugStatus.available === false}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl shadow-lg shadow-gray-900/20 transform transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Registering Your Property...</span>
                </>
              ) : (
                <>
                  <span>Register My Property</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>© {new Date().getFullYear()} Stayone SaaS Platform</span>
          <div className="flex items-center gap-1.5 font-medium text-gray-500">
            <ShieldCheck size={14} className="text-indigo-500" />
            Instant Provisioning
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Marketing / Value Proposition */}
      <div className="hidden lg:flex flex-1 relative bg-slate-900 overflow-hidden flex-col justify-between p-16 text-white">
        {/* Background glow effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-emerald-600/30 to-teal-500/20 blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-indigo-600/30 to-purple-500/20 blur-[150px]"></div>

        {/* Brand Tagline */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold text-emerald-300 mb-6">
            <Sparkles size={14} />
            <span>Hospitality Intelligence Cloud</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-extrabold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400">
            The Complete Operating System for Modern Resorts
          </h2>
          <p className="mt-4 text-slate-300 max-w-lg text-base font-light leading-relaxed">
            Tailor-made for independent resorts, luxury villas, and multi-property chains. Starting at <strong>₹{starterPlanPrice}/month for up to {starterPlanRooms} rooms</strong> with zero setup fees.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="relative z-10 grid grid-cols-2 gap-6 my-auto pt-8">
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
            <div className="text-emerald-400 font-bold text-lg">Instant Setup</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your property dashboard and live booking engine are created in under 60 seconds.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
            <div className="text-teal-300 font-bold text-lg">Multi-Property</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Manage all your branches, resorts, and villas from a centralized enterprise command center.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
            <div className="text-indigo-300 font-bold text-lg">QR In-Room Dining</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Dynamic contactless guest room dining, amenities, and housekeeping requests right from their phone.
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
            <div className="text-amber-300 font-bold text-lg">Financial Ledgers</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Automated night audit, double-entry journal, day-book, GST invoicing, and revenue forecasting.
            </p>
          </div>
        </div>

        {/* Developer Credit */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-6">
          <span>Trusted by modern hospitality leaders worldwide</span>
          <a href="https://teqmates.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            Powered by <strong className="text-indigo-400">Teqmates</strong>
          </a>
        </div>
      </div>
    </div>
  );
}
