import React, { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl, getMediaBaseUrl } from "./utils/env";

// ─── Guest Room Portal ────────────────────────────────────────────────────────
// Accessed by scanning the QR code placed in the room.
// URL format: http://localhost:3002/#/room/{roomId}
// ─────────────────────────────────────────────────────────────────────────────

const EMERGENCY = [
  { emoji: "🚒", label: "Fire", number: "101", color: "#ef4444", bg: "#fef2f2" },
  { emoji: "👮", label: "Police", number: "100", color: "#3b82f6", bg: "#eff6ff" },
  { emoji: "🚑", label: "Ambulance", number: "108", color: "#22c55e", bg: "#f0fdf4" },
];

const SERVICES = [
  { emoji: "🍽️", label: "Food & Drinks", desc: "Order meals, snacks & beverages to your room", color: "#f59e0b" },
  { emoji: "🛎️", label: "Room Service", desc: "Housekeeping, extra towels, pillows & more", color: "#8b5cf6" },
  { emoji: "🧹", label: "Housekeeping", desc: "Request cleaning or turndown service", color: "#06b6d4" },
  { emoji: "💡", label: "Maintenance", desc: "Report issues with AC, lights, plumbing etc.", color: "#f97316" },
  { emoji: "🅿️", label: "Parking", desc: "Valet, parking assistance & vehicle services", color: "#64748b" },
  { emoji: "🧾", label: "Checkout", desc: "Review bill and complete payment", color: "#10b981" },
  { emoji: "🧳", label: "Luggage Help", desc: "Luggage storage, porter & checkout assistance", color: "#ec4899" },
];

export default function GuestRoomPortal({ roomId }) {
  const [room, setRoom] = useState(null);
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState(null);
  const [msgSent, setMsgSent] = useState(false);
  const [msgText, setMsgText] = useState("");

  // Food & Beverage states
  const [foodItems, setFoodItems] = useState([]);
  const [foodCategories, setFoodCategories] = useState([]);
  const [cart, setCart] = useState({}); // { foodItemId: quantity }
  const [foodOrderType, setFoodOrderType] = useState("room_service"); // "room_service" or "dine_in"
  const [deliveryRequest, setDeliveryRequest] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [foodSearch, setFoodSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [checkoutStep, setCheckoutStep] = useState(false);

  const API = getApiBaseUrl();
  const MEDIA = getMediaBaseUrl();

  const fetchRoomData = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/public/rooms?limit=100`, { headers: { "Content-Type": "application/json" } });
      if (!resp.ok) throw new Error("room fetch failed");
      const rooms = await resp.json();
      const found = rooms.find(r => r.id === parseInt(roomId));
      if (found) setRoom(found);
    } catch (e) {
      console.error("GuestPortal: room fetch error", e);
    }
    try {
      const resp2 = await fetch(`${API}/public/branches`);
      if (resp2.ok) {
        const brs = await resp2.json();
        if (brs && brs.length > 0) setBranch(brs[0]);
      }
    } catch (e) {
      console.error("GuestPortal: branch fetch error", e);
    }
    setLoading(false);
  }, [API, roomId]);

  useEffect(() => { 
    fetchRoomData(); 
  }, [fetchRoomData]);

  // Fetch food items and categories
  useEffect(() => {
    const fetchFoodData = async () => {
      try {
        const itemsResp = await fetch(`${API}/public/food-items`);
        if (itemsResp.ok) {
          const itemsData = await itemsResp.json();
          setFoodItems(itemsData);
        }
        const catsResp = await fetch(`${API}/public/food-categories`);
        if (catsResp.ok) {
          const catsData = await catsResp.json();
          setFoodCategories(catsData);
        }
      } catch (err) {
        console.error("Error fetching food data", err);
      }
    };
    fetchFoodData();
  }, [API]);

  const handleCall = (number) => { window.location.href = `tel:${number}`; };

  // Resolve price based on current time & selected order type (mirrors backend)
  const getResolvedPrice = (item, orderType = "room_service") => {
    if (!item) return 0;
    
    // 1. Time-wise Prices check
    let twp = item.time_wise_prices;
    if (twp) {
      if (typeof twp === 'string') {
        try { twp = JSON.parse(twp); } catch (e) { twp = []; }
      }
      if (Array.isArray(twp) && twp.length > 0) {
        const now = new Date();
        const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        for (const rule of twp) {
          const { from_time, to_time, price } = rule;
          if (from_time <= to_time) {
            if (currentTimeString >= from_time && currentTimeString <= to_time) {
              return parseFloat(price);
            }
          } else {
            // Midnight overlap
            if (currentTimeString >= from_time || currentTimeString <= to_time) {
              return parseFloat(price);
            }
          }
        }
      }
    }

    // 2. Room Service Price check
    if (orderType === "room_service" && item.room_service_price) {
      return parseFloat(item.room_service_price);
    }

    // 3. Fallback to Dine-In Price
    return parseFloat(item.price) || 0;
  };

  // Check food item availability in current hours
  const isItemAvailable = (item) => {
    if (!item.available) return false;
    if (item.always_available) return true;
    
    const now = new Date();
    const currentTime = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const from = item.available_from_time;
    const to = item.available_to_time;
    
    if (!from || !to) return true;
    if (from <= to) {
      return currentTime >= from && currentTime <= to;
    } else {
      // Midnight overlap
      return currentTime >= from || currentTime <= to;
    }
  };

  // Submit generic service request with fallback to WhatsApp
  const handleSendRequest = async () => {
    if (!msgText.trim()) return;
    
    let typeMap = {
      "Room Service": "room_service",
      "Housekeeping": "cleaning",
      "Maintenance": "maintenance",
      "Parking": "parking",
      "Luggage Help": "luggage"
    };
    
    const requestType = typeMap[activeService?.label] || "other";
    
    const payload = {
      room_id: parseInt(roomId),
      request_type: requestType,
      description: msgText.trim()
    };
    
    let apiSuccess = false;
    try {
      const resp = await fetch(`${API}/public/service-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        apiSuccess = true;
      }
    } catch (err) {
      console.error("API submission failed, falling back to WhatsApp", err);
    }
    
    if (!apiSuccess) {
      const phone = branch?.phone?.replace(/\D/g, "") || "";
      const text = encodeURIComponent(`[Room ${room?.number || roomId}] ${activeService?.label || "Request"}: ${msgText}`);
      if (phone) {
        window.open(`https://wa.me/91${phone}?text=${text}`, "_blank");
      }
    }
    
    setMsgSent(true);
    setTimeout(() => { setMsgSent(false); setMsgText(""); setActiveService(null); }, 3000);
  };

  // Place food order with fallback to WhatsApp
  const handlePlaceFoodOrder = async () => {
    const items = Object.entries(cart)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => ({
        food_item_id: parseInt(id),
        quantity: qty
      }));
      
    if (items.length === 0) return;

    let subtotal = 0;
    items.forEach(item => {
      const food = foodItems.find(f => f.id === item.food_item_id);
      if (food) {
        subtotal += getResolvedPrice(food, foodOrderType) * item.quantity;
      }
    });

    const payload = {
      room_id: parseInt(roomId),
      amount: subtotal,
      order_type: foodOrderType,
      delivery_request: foodOrderType === "room_service" ? deliveryRequest : `Table: ${tableNumber}`,
      items: items
    };

    let apiSuccess = false;
    try {
      const resp = await fetch(`${API}/public/food-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        apiSuccess = true;
      }
    } catch (err) {
      console.error("Food order API submission failed", err);
    }

    if (!apiSuccess) {
      const phone = branch?.phone?.replace(/\D/g, "") || "";
      const orderDetails = items.map(item => {
        const food = foodItems.find(f => f.id === item.food_item_id);
        const name = food ? food.name : `Item #${item.food_item_id}`;
        return `${name} x${item.quantity}`;
      }).join(", ");
      
      const instructions = foodOrderType === "room_service" ? deliveryRequest : `Table: ${tableNumber}`;
      const text = encodeURIComponent(
        `[Room ${room?.number || roomId}] Food Order (${foodOrderType === "room_service" ? "Room Service" : "Dine-In"}): ${orderDetails}. Instructions: ${instructions}`
      );
      if (phone) {
        window.open(`https://wa.me/91${phone}?text=${text}`, "_blank");
      }
    }

    setMsgSent(true);
    setCart({});
    setDeliveryRequest("");
    setTableNumber("");
    setCheckoutStep(false);
    setTimeout(() => {
      setMsgSent(false);
      setActiveService(null);
    }, 3000);
  };

  const getFoodItemCartQty = (id) => cart[id] || 0;

  const updateCartQty = (id, change) => {
    setCart(prev => {
      const newQty = (prev[id] || 0) + change;
      if (newQty <= 0) {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      }
      return { ...prev, [id]: newQty };
    });
  };

  const getCartTotal = () => {
    let total = 0;
    Object.entries(cart).forEach(([id, qty]) => {
      const item = foodItems.find(f => f.id === parseInt(id));
      if (item) {
        total += getResolvedPrice(item, foodOrderType) * qty;
      }
    });
    return total;
  };

  const getCartItemsCount = () => {
    return Object.values(cart).reduce((sum, q) => sum + q, 0);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "#94a3b8" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem", animation: "spin 1s linear infinite" }}>⟳</div>
        <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "0.9rem", letterSpacing: "0.1em" }}>LOADING ROOM SERVICES...</p>
      </div>
    </div>
  );

  const roomNumber = room?.number || roomId;
  const roomType = room?.type || "Guest Room";
  const resortName = branch?.name || "The Resort";
  const frontOfficePhone = branch?.phone || null;
  const address = branch?.address || "";
  const imgUrl = room?.image_url ? `${MEDIA}${room.image_url}` : null;

  if (room && room.status !== "Checked-in") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", flexDirection: "column", justifycontent: "space-between", fontFamily: "'Montserrat', sans-serif", color: "white" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&display=swap');
          .welcome-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 300px; height: 300px; background: rgba(245, 158, 11, 0.15); filter: blur(80px); border-radius: 50%; }
        `}</style>
        
        {/* Top brand */}
        <div style={{ padding: "40px 24px 0", textAlign: "center" }}>
          <p style={{ fontSize: "0.65rem", fontWeight: 800, color: "#f59e0b", letterSpacing: "0.4em", textTransform: "uppercase", margin: "0 0 10px" }}>
            {resortName}
          </p>
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", width: "40px", margin: "0 auto" }}></div>
        </div>

        {/* Center welcome card */}
        <div style={{ padding: "20px 24px", position: "relative", zIndex: 10, textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "20px", display: "inline-block" }}>🛎️</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.8rem", fontWeight: 700, margin: "0 0 16px", color: "#f59e0b" }}>
            Welcome to Room {roomNumber}
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.6, maxWidth: "340px", margin: "0 auto 30px" }}>
            This room is not currently checked-in. To access guest portal services (in-room dining, digital service requests, checkout, etc.), please complete your check-in with the front desk.
          </p>
          {frontOfficePhone && (
            <button
              onClick={() => {
                window.location.href = `tel:${frontOfficePhone}`;
              }}
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", borderRadius: "14px", padding: "14px 28px", color: "#0a0a0f", fontWeight: 800, fontSize: "0.85rem", letterSpacing: "0.05em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              📞 Call Reception
            </button>
          )}
        </div>

        {/* Footer info */}
        <div style={{ padding: "0 24px 40px", textAlign: "center" }}>
          <p style={{ fontSize: "0.6rem", color: "#4b5563", letterSpacing: "0.15em", textTransform: "uppercase", margin: 0 }}>
            Luxury Awaits You at Stayone
          </p>
        </div>
      </div>
    );
  }

  // Filtered food items
  const filteredFoodItems = foodItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(foodSearch.toLowerCase()) || 
                          item.description?.toLowerCase().includes(foodSearch.toLowerCase());
    const matchesCategory = selectedCategoryId === "all" || item.category_id === parseInt(selectedCategoryId);
    return matchesSearch && matchesCategory && isItemAvailable(item);
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&display=swap');
        .grp-card { background: white; border-radius: 20px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); margin: 0 16px 16px; overflow: hidden; }
        .grp-svc-btn { background: white; border: none; border-radius: 16px; padding: 16px; text-align: left; cursor: pointer; box-shadow: 0 2px 12px rgba(0,0,0,0.05); transition: all 0.2s; width: 100%; }
        .grp-svc-btn:active { transform: scale(0.97); box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
        .grp-emer-btn { border: none; border-radius: 16px; padding: 14px 8px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; }
        .grp-emer-btn:active { transform: scale(0.95); }
        .grp-call-btn { border: none; border-radius: 14px; padding: 14px 20px; font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 0.85rem; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; }
        .grp-call-btn:active { transform: scale(0.97); }
        .grp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-end; justify-content: center; z-index: 999; padding: 16px; }
        .grp-sheet { background: white; border-radius: 28px 28px 0 0; width: 100%; max-width: 500px; padding: 24px; box-sizing: border-box; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .grp-slide-up { animation: slideUp 0.3s cubic-bezier(0.23,1,0.32,1); }

        /* F&B Styles */
        .grp-menu-container { max-height: 40vh; overflow-y: auto; padding-right: 4px; margin-bottom: 12px; }
        .grp-menu-container::-webkit-scrollbar { width: 4px; }
        .grp-menu-container::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .grp-search-input { width: 100%; border: 2px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; font-family: 'Montserrat', sans-serif; font-size: 0.8rem; color: #1e293b; outline: none; margin-bottom: 12px; box-sizing: border-box; }
        .grp-search-input:focus { border-color: #6366f1; }
        .grp-food-card { display: flex; gap: 12px; align-items: center; background: #f8fafc; border-radius: 16px; padding: 10px; margin-bottom: 10px; border: 1px solid #f1f5f9; }
        .grp-food-img { width: 60px; height: 60px; border-radius: 10px; object-fit: cover; }
        .grp-food-img-placeholder { width: 60px; height: 60px; border-radius: 10px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .grp-food-qty-btn { width: 26px; height: 26px; border-radius: 8px; border: none; background: #6366f1; color: white; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .grp-food-qty-btn:active { transform: scale(0.9); }
        .grp-add-btn { background: #6366f1; color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 0.7rem; font-weight: 700; cursor: pointer; transition: all 0.2s; }
        .grp-add-btn:active { transform: scale(0.95); }
        .grp-cat-pills-row { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 12px; padding-bottom: 6px; }
        .grp-cat-pills-row::-webkit-scrollbar { display: none; }
        .grp-cat-pill { padding: 6px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s; white-space: nowrap; }
        .grp-cat-pill.active { background: #6366f1; color: white; }
        .grp-cat-pill.inactive { background: #f1f5f9; color: #64748b; }
        .grp-type-btn { flex: 1; border: 2px solid #e2e8f0; background: white; border-radius: 12px; padding: 10px; font-weight: 700; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .grp-type-btn.active { border-color: #6366f1; background: #f5f3ff; color: #6366f1; }
      `}</style>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e3a5f 100%)",
        padding: "0 0 32px",
        position: "relative",
        overflow: "hidden"
      }}>
        {imgUrl && (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.2 }}>
            <img src={imgUrl} alt="room" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}
        <div style={{ position: "relative", zIndex: 1, padding: "24px 20px 0" }}>
          <div style={{ color: "#f59e0b", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "4px" }}>
            {resortName}
          </div>
          <h1 style={{ color: "white", fontSize: "2rem", fontFamily: "'Playfair Display', serif", fontWeight: 700, margin: "0 0 4px", lineHeight: 1.1 }}>
            Room {roomNumber}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.2em", margin: 0 }}>
            {roomType}
          </p>
        </div>

        {/* Quick icons */}
        <div style={{ display: "flex", gap: "12px", padding: "20px 20px 0", position: "relative", zIndex: 1 }}>
          {[
            { emoji: "🍽️", label: "Food" },
            { emoji: "🛎️", label: "Service" },
            { emoji: "📞", label: "Desk" },
            { emoji: "💬", label: "Help" },
          ].map(q => (
            <div key={q.label} style={{ flex: 1, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", borderRadius: "14px", padding: "10px 4px", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: "4px" }}>{q.emoji}</div>
              <div style={{ color: "#cbd5e1", fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{q.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Front Office ── */}
      {frontOfficePhone && (
        <div className="grp-card" style={{ margin: "16px 16px 0" }}>
          <div style={{ padding: "20px", display: "flex", alignItems: "center", justifycontent: "space-between" }}>
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "4px" }}>Front Office</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#1e293b" }}>{frontOfficePhone}</div>
              {address && <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: "2px" }}>{address}</div>}
            </div>
            <button
              className="grp-call-btn"
              onClick={() => handleCall(frontOfficePhone)}
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white" }}
            >
              📞 Call
            </button>
          </div>
        </div>
      )}

      {/* ── Services ── */}
      <div style={{ padding: "20px 16px 8px" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "12px" }}>
          Room Services
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {SERVICES.map(svc => (
            <button key={svc.label} className="grp-svc-btn" onClick={() => setActiveService(svc)}>
              <div style={{ fontSize: "1.6rem", marginBottom: "8px" }}>{svc.emoji}</div>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>{svc.label}</div>
              <div style={{ fontSize: "0.65rem", color: "#94a3b8", lineHeight: 1.4 }}>{svc.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px", textAlign: "center" }}>
        <button
          className="grp-call-btn"
          onClick={async () => {
            const payload = { room_id: parseInt(roomId) };
            try {
              const resp = await fetch(`${API}/checkout-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
              });
              if (resp.ok) {
                setMsgSent(true);
                setTimeout(() => setMsgSent(false), 3000);
              }
            } catch (e) { console.error(e); }
          }}
          style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", fontSize: "0.9rem", padding: "12px 24px" }}
        >
          Start Checkout 🚀
        </button>
      </div>

      {/* ── Emergency ── */}
      <div style={{ padding: "8px 16px 20px" }}>
        <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "12px" }}>
          Emergency Numbers
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          {EMERGENCY.map(em => (
            <button key={em.label} className="grp-emer-btn" onClick={() => handleCall(em.number)} style={{ background: em.bg }}>
              <span style={{ fontSize: "1.8rem" }}>{em.emoji}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 700, color: em.color }}>{em.label}</span>
              <span style={{ fontSize: "1rem", fontWeight: 900, color: em.color }}>{em.number}</span>
              <span style={{ fontSize: "0.55rem", fontWeight: 600, color: em.color, opacity: 0.7, letterSpacing: "0.05em" }}>TAP TO CALL</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", padding: "16px 20px 40px", borderTop: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: 500 }}>
          {resortName} · Powered by Stayone
        </div>
      </div>

      {/* ── Service Request Sheet ── */}
      {activeService && (
        <div className="grp-overlay" onClick={() => { setActiveService(null); setCheckoutStep(false); }}>
          <div className="grp-sheet grp-slide-up" onClick={e => e.stopPropagation()}>
            
            {/* Success confirmation */}
            {msgSent ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#16a34a" }}>
                <div style={{ fontSize: "3rem", marginBottom: "10px" }}>✅</div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.5rem", fontWeight: 700, margin: "0 0 8px" }}>Request Received</h3>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>We are processing your request. Please wait...</p>
              </div>
            ) : activeService.label === "Food & Drinks" ? (
              
              /* Food & Drinks Flow */
              !checkoutStep ? (
                /* STEP 1: Food & Drinks Menu */
                <>
                  <div style={{ display: "flex", justifycontent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#1e293b", margin: 0 }}>F&B Ordering</h2>
                      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Select items from the restaurant menu</p>
                    </div>
                    <button onClick={() => setActiveService(null)} style={{ border: "none", background: "none", fontSize: "1.5rem", color: "#94a3b8", cursor: "pointer" }}>×</button>
                  </div>

                  {/* Category Filter pills */}
                  <div className="grp-cat-pills-row">
                    <button 
                      className={`grp-cat-pill ${selectedCategoryId === "all" ? "active" : "inactive"}`}
                      onClick={() => setSelectedCategoryId("all")}
                    >
                      All Items
                    </button>
                    {foodCategories.map(cat => (
                      <button 
                        key={cat.id} 
                        className={`grp-cat-pill ${selectedCategoryId === String(cat.id) ? "active" : "inactive"}`}
                        onClick={() => setSelectedCategoryId(String(cat.id))}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* Search input */}
                  <input 
                    type="text" 
                    placeholder="Search dishes or beverages..." 
                    className="grp-search-input"
                    value={foodSearch}
                    onChange={e => setFoodSearch(e.target.value)}
                  />

                  {/* Scrollable food item cards */}
                  <div className="grp-menu-container">
                    {filteredFoodItems.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8", fontSize: "0.8rem" }}>
                        No items found matching criteria.
                      </div>
                    ) : (
                      filteredFoodItems.map(item => {
                        const resolvedPrice = getResolvedPrice(item, foodOrderType);
                        const cartQty = getFoodItemCartQty(item.id);
                        const hasImg = item.images && item.images.length > 0;
                        return (
                          <div key={item.id} className="grp-food-card">
                            {hasImg ? (
                              <img 
                                src={item.images[0].image_url.startsWith("http") ? item.images[0].image_url : `${MEDIA}/${item.images[0].image_url}`} 
                                alt={item.name} 
                                className="grp-food-img" 
                              />
                            ) : (
                              <div className="grp-food-img-placeholder">🍛</div>
                            )}
                            <div style={{ flex: 1 }}>
                              <h4 style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e293b", margin: "0 0 2px" }}>{item.name}</h4>
                              <p style={{ fontSize: "0.65rem", color: "#94a3b8", margin: "0 0 6px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.3 }}>{item.description}</p>
                              <div style={{ display: "flex", justifycontent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#6366f1" }}>₹{resolvedPrice}</span>
                                
                                {cartQty > 0 ? (
                                  <div style={{ display: "flex", itemsAlign: "center", gap: "10px" }}>
                                    <button className="grp-food-qty-btn" onClick={() => updateCartQty(item.id, -1)}>-</button>
                                    <span style={{ fontSize: "0.8rem", fontWeight: 800, minWidth: "15px", textAlign: "center", alignSelf: "center" }}>{cartQty}</span>
                                    <button className="grp-food-qty-btn" onClick={() => updateCartQty(item.id, 1)}>+</button>
                                  </div>
                                ) : (
                                  <button className="grp-add-btn" onClick={() => updateCartQty(item.id, 1)}>Add</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Footer total & Next Button */}
                  {getCartItemsCount() > 0 && (
                    <div style={{ display: "flex", justifycontent: "space-between", itemsAlign: "center", borderTop: "1px solid #f1f5f9", paddingTop: "16px", marginTop: "8px" }}>
                      <div>
                        <div style={{ fontSize: "0.6rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Total Cart Value</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#1e293b" }}>₹{getCartTotal()}</div>
                      </div>
                      <button 
                        className="grp-call-btn" 
                        onClick={() => setCheckoutStep(true)}
                        style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", padding: "12px 24px" }}
                      >
                        Checkout ({getCartItemsCount()} items) →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* STEP 2: Checkout Cart summary & delivery instructions */
                <>
                  <div style={{ display: "flex", justifycontent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <div>
                      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#1e293b", margin: 0 }}>Review Order</h2>
                      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: 0 }}>Select delivery option & place order</p>
                    </div>
                    <button onClick={() => setCheckoutStep(false)} style={{ border: "none", background: "none", fontSize: "1.5rem", color: "#94a3b8", cursor: "pointer" }}>×</button>
                  </div>

                  {/* Delivery Selection */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                    <button 
                      className={`grp-type-btn ${foodOrderType === "room_service" ? "active" : ""}`}
                      onClick={() => setFoodOrderType("room_service")}
                    >
                      🛏️ Room Service
                    </button>
                    <button 
                      className={`grp-type-btn ${foodOrderType === "dine_in" ? "active" : ""}`}
                      onClick={() => setFoodOrderType("dine_in")}
                    >
                      🍽️ Dine-in Table
                    </button>
                  </div>

                  {/* Delivery Option Details */}
                  {foodOrderType === "room_service" ? (
                    <textarea
                      placeholder="Delivery instructions (e.g. bring extra glasses, deliver after 30 mins)..."
                      value={deliveryRequest}
                      onChange={e => setDeliveryRequest(e.target.value)}
                      rows={2}
                      style={{ width: "100%", border: "2px solid #e2e8f0", borderRadius: "14px", padding: "12px", fontFamily: "'Montserrat', sans-serif", fontSize: "0.8rem", color: "#1e293b", resize: "none", outline: "none", boxSizing: "border-box", marginBottom: "16px" }}
                    />
                  ) : (
                    <input 
                      type="number"
                      placeholder="Restaurant Table Number *"
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      style={{ width: "100%", border: "2px solid #e2e8f0", borderRadius: "12px", padding: "12px 14px", fontFamily: "'Montserrat', sans-serif", fontSize: "0.8rem", color: "#1e293b", outline: "none", boxSizing: "border-box", marginBottom: "16px" }}
                    />
                  )}

                  {/* Bill calculation details */}
                  <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "16px", marginBottom: "20px", fontSize: "0.75rem", color: "#1e293b" }}>
                    <div style={{ display: "flex", justifycontent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#64748b" }}>Subtotal</span>
                      <span style={{ fontWeight: 700 }}>₹{getCartTotal()}</span>
                    </div>
                    <div style={{ display: "flex", justifycontent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#64748b" }}>GST (5%)</span>
                      <span style={{ fontWeight: 700 }}>₹{(getCartTotal() * 0.05).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifycontent: "space-between", borderTop: "1px dashed #cbd5e1", paddingTop: "8px", fontSize: "0.9rem", fontWeight: 800 }}>
                      <span>Total Amount</span>
                      <span style={{ color: "#6366f1" }}>₹{(getCartTotal() * 1.05).toFixed(2)}</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px" }}>
                    <button 
                      className="grp-call-btn" 
                      onClick={() => setCheckoutStep(false)}
                      style={{ flex: 1, background: "#f1f5f9", color: "#64748b" }}
                    >
                      ← Back
                    </button>
                    <button 
                      className="grp-call-btn" 
                      onClick={handlePlaceFoodOrder}
                      disabled={foodOrderType === "dine_in" && !tableNumber}
                      style={{ flex: 2, background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", opacity: (foodOrderType === "dine_in" && !tableNumber) ? 0.6 : 1 }}
                    >
                      Confirm & Order 🚀
                    </button>
                  </div>
                </>
              )
            ) : activeService.label === "Checkout" ? (
              /* Checkout Flow */
              <>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "8px" }}>{activeService.emoji}</div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#1e293b", margin: "0 0 4px" }}>{activeService.label}</h2>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>{activeService.desc}</p>
                </div>
                <button
                  className="grp-call-btn"
                  onClick={async () => {
                    const payload = { room_id: parseInt(roomId) };
                    try {
                      const resp = await fetch(`${API}/checkout-request`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                      });
                      if (resp.ok) {
                        setMsgSent(true);
                        setTimeout(() => setMsgSent(false), 3000);
                      }
                    } catch (e) { console.error(e); }
                  }}
                  style={{ width: "100%", background: "linear-gradient(135deg, #10b981, #059669)", color: "white", fontSize: "0.9rem", padding: "16px" }}
                >
                  Start Checkout 🚀
                </button>
              </>
            ) : (
              
              /* Other Generic Services Flow */
              <>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>{activeService.emoji}</div>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.3rem", color: "#1e293b", margin: "0 0 4px" }}>{activeService.label}</h2>
                  <p style={{ fontSize: "0.75rem", color: "#94a3b8", margin: 0 }}>{activeService.desc}</p>
                </div>
                <textarea
                  placeholder={`Describe what you need for ${activeService.label}...`}
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  rows={4}
                  style={{ width: "100%", border: "2px solid #e2e8f0", borderRadius: "14px", padding: "14px", fontFamily: "'Montserrat', sans-serif", fontSize: "0.85rem", color: "#1e293b", resize: "none", outline: "none", boxSizing: "border-box", marginBottom: "12px" }}
                />
                <button
                  className="grp-call-btn"
                  onClick={handleSendRequest}
                  style={{ width: "100%", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "white", fontSize: "0.9rem", padding: "16px" }}
                >
                  Send Request 🚀
                </button>
                <button
                  className="grp-call-btn"
                  onClick={() => setActiveService(null)}
                  style={{ width: "100%", background: "#f1f5f9", color: "#64748b", marginTop: "8px", fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
