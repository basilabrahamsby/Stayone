import React, { useState, useEffect, useCallback, memo, useMemo, useRef } from "react"; // FORCE UPDATE
import DashboardLayout from "../layout/DashboardLayout";
import BannerMessage from "../components/BannerMessage";
import axios from "axios"; // We need axios to create the api service object
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, BedDouble, Users, Utensils, Package, Hash, Calendar, CreditCard, X, Search, Filter, XCircle, RefreshCw, Edit, Save, ChevronDown, User, Tag, Printer, Download, Mail, CheckCircle, Percent, FileText, Share2, ClipboardList, ChevronRight, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import { useNavigate } from "react-router-dom";
import autoTable from 'jspdf-autotable';
// Make sure to place your logo in the specified path or update the path accordingly.
import { useInfiniteScroll } from "./useInfiniteScroll";
import logo from '../assets/logo.jpeg';
import { formatCurrency } from '../utils/currency';
import { getApiBaseUrl } from "../utils/env";
import { formatDateIST, formatDateTimeIST } from "../utils/dateUtils";
import { usePermissions } from "../hooks/usePermissions";


// --- Placeholder for DashboardLayout ---
// In your actual project, you would remove this and use your own DashboardLayout component.


// --- API service ---
// Using the same API service setup as other pages
const api = axios.create({
  baseURL: getApiBaseUrl(),
});

// 1. Request Interceptor: Attaches the token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  const branchId = localStorage.getItem("activeBranchId");
  if (branchId && branchId !== 'all') {
    config.headers["X-Branch-ID"] = branchId;
  }
  return config;
}, error => {
  return Promise.reject(error);
});

const resolveLoginPath = () => {
  if (typeof window === "undefined") {
    return "/admin/login";
  }
  const path = window.location.pathname || "";
  return path.startsWith("/pommaadmin") ? "/pommaadmin/login" : "/admin/login";
};

// 2. Response Interceptor: Handles 401 errors globally
api.interceptors.response.use(response => {
  return response;
}, error => {
  if (error.response && error.response.status === 401) {
    // Token is invalid or expired
    localStorage.removeItem('token');
    // Use window.location to force a full page reload to clear any stale state
    window.location.href = resolveLoginPath();
    // You could also use a state management solution to show a "Session Expired" message
  }
  return Promise.reject(error);
});


// --- Helper Components ---

const KpiCard = React.memo(({ title, value, icon, color, prefix = '', suffix = '' }) => (
  <div className="bg-white p-4 rounded-xl shadow-md flex items-center">
    <div className={`rounded-full p-3 mr-4 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-800">{prefix}{value}{suffix}</p>
    </div>
  </div>
));
KpiCard.displayName = 'KpiCard';

const CheckoutDetailModal = React.memo(({ checkout, onClose, onUpdateSuccess, resortSettings }) => {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [printRoom, setPrintRoom] = useState(true);
  const [printFood, setPrintFood] = useState(true);
  const [printServices, setPrintServices] = useState(true);
  const { isSuperadmin } = usePermissions();

  useEffect(() => {
    if (checkout) {
      setLoading(true);
      api.get(`/bill/checkouts/${checkout.id}/details`)
        .then(response => {
          setDetails(response.data);
        })
        .catch(err => {
          console.error("Failed to load checkout details:", err);
          setDetails(null);
        })
        .finally(() => setLoading(false));
    }
  }, [checkout]);

  const handleViewBill = () => {
    if (details?.invoice_pdf_path) {
      // Download the PDF from the server
      const apiBaseUrl = window.location.origin + '/orchidapi';
      const pdfUrl = `${apiBaseUrl}/${details.invoice_pdf_path}`;
      window.open(pdfUrl, '_blank');
    }
  };

  if (!checkout) return null;

  // Debug logging
  if (details) {
    console.log("Checkout Details:", details);
    console.log("Bill Details:", details.bill_details);
    console.log("Invoice PDF Path:", details.invoice_pdf_path);
  }

  const handleDownloadPDF = async () => {
    if (!details) return;

    if (!printRoom && !printFood && !printServices) {
      alert("Please select at least one charge type to print.");
      return;
    }

    const doc = new jsPDF();

    // Try to load and add logo
    try {
      const img = new Image();
      img.src = logo;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      doc.addImage(img, 'JPEG', 90, 5, 30, 30);
    } catch (err) {
      console.warn("Could not load logo for PDF", err);
    }

    // 1. Header (Centered)
    const resortName = resortSettings?.branch_name || resortSettings?.resort_name || 'ORCHID TRAILS RESORT';
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(resortName.toUpperCase(), 105, 43, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);

    const address = resortSettings?.branch_address || resortSettings?.resort_address || '';
    if (address) {
      doc.text(address, 105, 49, { align: 'center' });
    }

    const phone = resortSettings?.branch_phone || '';
    const gst = resortSettings?.gst_number || '';
    
    let contactInfo = [];
    if (phone) contactInfo.push(`Phone: ${phone}`);
    if (gst) contactInfo.push(`GSTIN: ${gst}`);
    if (contactInfo.length > 0) {
      doc.text(contactInfo.join(' | '), 105, 55, { align: 'center' });
    }

    // TAX INVOICE Badge
    doc.setFillColor(5, 150, 105);
    doc.roundedRect(85, 60, 40, 7, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255); 
    doc.text('TAX INVOICE', 105, 65, { align: 'center' });
    
    // 2. Info Section Layout
    let startY = 73;
    let boxHeight = 46;
    
    // Draw Guest Details Box
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 252, 251); 
    doc.roundedRect(14, startY, 88, boxHeight, 3, 3, 'FD');

    // Draw Stay Details Box
    doc.roundedRect(108, startY, 88, boxHeight, 3, 3, 'FD');

    // Guest details text
    doc.setFontSize(10);
    doc.setTextColor(5, 150, 105); 
    doc.setFont('helvetica', 'bold');
    doc.text('GUEST DETAILS', 18, startY + 6);
    
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'normal');
    let currentY = startY + 13;
    doc.text(`Name: ${details.guest_name || 'N/A'}`, 18, currentY);
    
    const guestMobile = details.booking_details?.guest_mobile || details.guest_mobile || '';
    const guestEmail = details.booking_details?.guest_email || details.guest_email || '';
    
    if (guestMobile) {
      currentY += 6;
      doc.text(`Mobile: ${guestMobile}`, 18, currentY);
    }
    if (guestEmail) {
      currentY += 6;
      doc.text(`Email: ${guestEmail}`, 18, currentY);
    }
    
    if (details.pan_number) {
      currentY += 6;
      doc.text(`PAN: ${details.pan_number}`, 18, currentY);
    }
    const finalGstNumber = details.gst_number || details.guest_gstin || '';
    if (finalGstNumber) {
      currentY += 6;
      doc.text(`GSTIN: ${finalGstNumber}`, 18, currentY);
    }

    // Stay details text
    doc.setTextColor(5, 150, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('STAY DETAILS', 112, startY + 6);
    
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'normal');
    let rightY = startY + 13;
    doc.text(`Invoice No: ${details.invoice_number || `INV-${(details.id || details.booking_id || 0).toString().padStart(4, '0')}`}`, 112, rightY);
    
    rightY += 6;
    let createdDate = new Date();
    if (details.created_at) {
        const parsed = new Date(details.created_at);
        if (!isNaN(parsed.getTime())) {
            createdDate = parsed;
        }
    }
    doc.text(`Date: ${formatDateTimeIST(createdDate)}`, 112, rightY);
    
    rightY += 6;
    doc.text(`Room No(s): ${details.room_numbers?.join(', ') || details.room_number || 'N/A'}`, 112, rightY);

    const checkInDate = details.check_in || details.booking_details?.check_in;
    const checkOutDate = details.check_out || details.booking_details?.check_out;
    rightY += 6;
    doc.text(`Check-in: ${checkInDate ? new Date(checkInDate).toLocaleDateString('en-GB') : 'N/A'}`, 112, rightY);
    rightY += 6;
    doc.text(`Check-out: ${checkOutDate ? new Date(checkOutDate).toLocaleDateString('en-GB') : 'N/A'}`, 112, rightY);

    const adults = details.booking_details?.adults || details.adults || 0;
    const children = details.booking_details?.children || details.children || 0;
    if (adults > 0 || children > 0) {
      rightY += 6;
      doc.text(`Pax: ${adults} Adults, ${children} Children`, 112, rightY);
    }

    currentY = startY + boxHeight + 8;

    // Helper for currency formatting
    const formatPDFCurrency = (amt) => {
      const formatted = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amt || 0);
      return `Rs.${formatted}`;
    };

    // 4. Charges Table
    const chargesBody = [];
    let idx = 1;


    if (printRoom) {
      if (details.room_total > 0) {
        chargesBody.push([idx++, 'Room Stay Charges', '-', formatPDFCurrency(details.room_total)]);
      }
      if (details.package_total > 0) {
        chargesBody.push([idx++, 'Package Charges', '-', formatPDFCurrency(details.package_total)]);
      }
    }
    
    // Food orders
    if (printFood) {
      if (details.food_orders && details.food_orders.length > 0) {
        details.food_orders.forEach(order => {
          order.items?.forEach(item => {
            chargesBody.push([idx++, `Food: ${item.item_name}`, `x${item.quantity}`, formatPDFCurrency(item.total)]);
          });
        });
      }
    }

    // Services
    if (printServices) {
      if (details.services && details.services.length > 0) {
        details.services.forEach(service => {
          chargesBody.push([idx++, `Service: ${service.service_name}`, '-', formatPDFCurrency(service.charges)]);
        });
      }

      // Consumables details
      if (details.bill_details?.consumables_items && details.bill_details.consumables_items.length > 0) {
        details.bill_details.consumables_items.forEach(item => {
          chargesBody.push([
            idx++,
            `Consumable: ${item.item_name}`,
            `x${item.quantity || item.actual_consumed || 1}`,
            formatPDFCurrency(item.total_charge)
          ]);
        });
      }

      // Rentals
      if (details.bill_details?.inventory_usage && details.bill_details.inventory_usage.length > 0) {
        details.bill_details.inventory_usage.forEach(item => {
          chargesBody.push([
            idx++,
            `Rental: ${item.item_name}`,
            `x${item.quantity} ${item.unit || ''}`,
            formatPDFCurrency(item.rental_charge || 0)
          ]);
        });
      }

      // Damages
      if (details.bill_details?.asset_damages && details.bill_details.asset_damages.length > 0) {
        details.bill_details.asset_damages.forEach(item => {
          chargesBody.push([
            idx++,
            `Damage: ${item.item_name} ${item.notes ? `(${item.notes})` : ''}`,
            '-',
            formatPDFCurrency(item.total_charge || item.replacement_cost)
          ]);
        });
      }
      
      // Late checkout fee
      if (details.charges?.late_checkout_fee > 0 || details.bill_details?.late_checkout_fee > 0) {
        chargesBody.push([idx++, 'Late Checkout Fee', '-', formatPDFCurrency(details.charges?.late_checkout_fee || details.bill_details?.late_checkout_fee)]);
      }
    }

    autoTable(doc, {
      startY: currentY,
      head: [['Sl No.', 'Particulars', 'Qty/Nights', 'Amount']],
      body: chargesBody,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [249, 250, 249] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 40 }
      },
      styles: { cellPadding: 3, fontSize: 9, lineColor: [220, 220, 220], lineWidth: 0.1 }
    });

    // 5. Financial Summary
    const totalsY = doc.lastAutoTable.finalY + 8;
    
    let subtotal, tax, discount, advance, grand, balanceDue, originalSubtotal;


    // Modal Details Calculation
    originalSubtotal = (
      (details.room_total || 0) +
      (details.package_total || 0) +
      (details.food_total || 0) +
      (details.service_total || 0) +
      (details.consumables_charges || details.bill_details?.consumables_charges || 0) +
      (details.inventory_charges || details.bill_details?.inventory_charges || 0) +
      (details.asset_damage_charges || details.bill_details?.asset_damage_charges || 0) +
      (details.late_checkout_fee || details.charges?.late_checkout_fee || details.bill_details?.late_checkout_fee || 0) +
      (details.key_card_fee || 0)
    );

    const roomSubtotal = printRoom ? ((details.room_total || 0) + (details.package_total || 0)) : 0;
    const foodSubtotal = printFood ? (details.food_total || 0) : 0;
    const servicesSubtotal = printServices ? (
      (details.service_total || 0) +
      (details.consumables_charges || details.bill_details?.consumables_charges || 0) +
      (details.inventory_charges || details.bill_details?.inventory_charges || 0) +
      (details.asset_damage_charges || details.bill_details?.asset_damage_charges || 0) +
      (details.late_checkout_fee || details.charges?.late_checkout_fee || details.bill_details?.late_checkout_fee || 0) +
      (details.key_card_fee || 0)
    ) : 0;

    subtotal = roomSubtotal + foodSubtotal + servicesSubtotal;
    const scaleFactor = originalSubtotal > 0 ? (subtotal / originalSubtotal) : 1;

    tax = (details.tax_amount || 0) * scaleFactor;
    discount = (details.discount_amount || 0) * scaleFactor;
    advance = (details.advance_deposit || 0) * scaleFactor;
    grand = subtotal + tax - discount;
    balanceDue = Math.max(0, grand - advance);

    const summaryRows = [
      ['Gross Total', formatPDFCurrency(subtotal)]
    ];
    if (discount > 0) summaryRows.push(['Discount', `(-)${formatPDFCurrency(discount)}`]);
    if (tax > 0) {
      const taxable = subtotal - discount;
      summaryRows.push(['Taxable Amount', formatPDFCurrency(taxable)]);

      summaryRows.push(['CGST', `(+) ${formatPDFCurrency(tax/2)}`]);
      summaryRows.push(['SGST', `(+) ${formatPDFCurrency(tax/2)}`]);

    }
    summaryRows.push(['Grand Total', formatPDFCurrency(grand)]);
    if (advance > 0) summaryRows.push(['Advance Paid', `(-)${formatPDFCurrency(advance)}`]);

    autoTable(doc, {
      startY: totalsY,
      body: summaryRows,
      theme: 'plain',
      tableWidth: 'wrap',
      margin: { left: 110 },
      styles: { cellPadding: 3, fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'right', cellWidth: 50 },
        1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 }
      },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.findIndex(r => r[0] === 'Grand Total')) {
          // Grand Total line
          data.cell.styles.textColor = [31, 41, 55];
          data.cell.styles.fillColor = [243, 244, 246]; // Soft gray bg
          if (data.column.index === 1) data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // 6. Footer Layout
    let footerY = doc.lastAutoTable.finalY + 15;
    
    // Check if we need to add a new page for footer
    if (footerY > 260) {
        doc.addPage();
        footerY = 20;
    }

    // Terms and Conditions
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('Terms & Conditions:', 14, footerY);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('1. All disputes are subject to local jurisdiction.', 14, footerY + 5);
    doc.text('2. Late checkout is subject to availability and extra charges.', 14, footerY + 9);
    doc.text('3. Guests are responsible for any damage to resort property.', 14, footerY + 13);
    doc.text('4. No refund for early check-outs.', 14, footerY + 17);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(156, 163, 175);
    doc.text('This is a computer-generated invoice and requires no physical signature.', 105, footerY + 28, { align: 'center' });
    doc.setDrawColor(220, 220, 220);
    doc.line(14, footerY + 32, 196, footerY + 32);

    doc.save(`bill-${details.id}.pdf`);
  };

  const handleEditSuccess = (updatedCheckout) => {
    setIsEditing(false);
    if (onUpdateSuccess) onUpdateSuccess(updatedCheckout);
    
    // Re-fetch to get all nested relations (food_orders, services, etc)
    setLoading(true);
    api.get(`/bill/checkouts/${updatedCheckout.id}/details`)
      .then(response => {
        setDetails(response.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 overflow-y-auto">
      {isEditing ? (
        <EditCheckoutModal 
          checkout={details} 
          onClose={() => setIsEditing(false)} 
          onSuccess={handleEditSuccess} 
        />
      ) : (
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] p-6 relative animate-fade-in-up overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10">
          <X size={24} />
        </button>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Checkout Details (ID: {checkout.id})</h2>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors print:hidden shadow-md font-semibold"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
              {details?.invoice_pdf_path && (
                <button
                  onClick={handleViewBill}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors print:hidden shadow-md font-semibold"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  View Full PDF
                </button>
              )}
              {isSuperadmin && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors print:hidden shadow-md font-semibold"
                >
                  <Edit size={18} />
                  Edit Bill
                </button>
              )}
            </div>
            <div className="flex gap-4 mt-1 text-sm text-gray-600 font-semibold bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 print:hidden select-none">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-green-600 transition-colors">
                <input
                  type="checkbox"
                  checked={printRoom}
                  onChange={(e) => setPrintRoom(e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500 cursor-pointer h-4 w-4"
                />
                Room Charges
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-green-600 transition-colors">
                <input
                  type="checkbox"
                  checked={printFood}
                  onChange={(e) => setPrintFood(e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500 cursor-pointer h-4 w-4"
                />
                Food Charges
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-green-600 transition-colors">
                <input
                  type="checkbox"
                  checked={printServices}
                  onChange={(e) => setPrintServices(e.target.checked)}
                  className="rounded text-green-600 focus:ring-green-500 cursor-pointer h-4 w-4"
                />
                Services
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading details...</div>
        ) : details ? (
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">PAN Number</p>
                <p className="font-semibold">{details.pan_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Rooms</p>
                <p className="font-semibold">{details.room_numbers?.join(', ') || details.room_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Checkout Date</p>
                <p className="font-semibold">{formatDateTimeIST(details.created_at)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Payment Method</p>
                <p className="font-semibold">{details.payment_method || 'N/A'}</p>
              </div>
              {details.booking_id && (
                <div>
                  <p className="text-sm text-gray-500">Booking ID</p>
                  <p className="font-semibold">{details.booking_id}</p>
                </div>
              )}
              {details.package_booking_id && (
                <div>
                  <p className="text-sm text-gray-500">Package Booking ID</p>
                  <p className="font-semibold">{details.package_booking_id}</p>
                </div>
              )}
            </div>

            {/* Booking Details */}
            {details.booking_details && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Booking Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Check-in</p>
                    <p className="font-semibold">{details.booking_details.check_in}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Check-out</p>
                    <p className="font-semibold">{details.booking_details.check_out}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Adults</p>
                    <p className="font-semibold">{details.booking_details.adults}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Children</p>
                    <p className="font-semibold">{details.booking_details.children}</p>
                  </div>
                  {details.booking_details.package_name && (
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Package</p>
                      <p className="font-semibold">{details.booking_details.package_name}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Food Orders */}
            {details.food_orders && details.food_orders.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Food Orders</h3>
                <div className="space-y-4">
                  {details.food_orders.map((order, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">Order #{order.id}</p>
                          <p className="text-sm text-gray-500">Room: {order.room_number}</p>
                          <p className="text-sm text-gray-500">{formatDateTimeIST(order.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-indigo-600">{formatCurrency(order.amount)}</p>
                          <p className="text-sm text-gray-500">{order.status}</p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {order.items?.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex justify-between text-sm">
                            <span>{item.item_name} x {item.quantity}</span>
                            <span className="font-medium">{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Services */}
            {details.services && details.services.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Services</h3>
                <div className="space-y-2">
                  {details.services.map((service, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div>
                        <p className="font-semibold">{service.service_name}</p>
                        <p className="text-sm text-gray-500">Room: {service.room_number}</p>
                        {service.created_at && (
                          <p className="text-xs text-gray-400">{formatDateTimeIST(service.created_at)}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-indigo-600">{formatCurrency(service.charges)}</p>
                        <p className="text-sm text-gray-500">{service.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Consumables (from bill_details) */}
            {details.bill_details?.consumables_items?.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Consumables</h3>
                <div className="space-y-2">
                  {details.bill_details.consumables_items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold">{item.item_name}</p>
                        <p className="text-sm text-gray-500">
                          Qty: {item.quantity || item.actual_consumed}
                          {item.complimentary_limit > 0 && <span className="text-xs text-green-600 ml-2">(Limit: {item.complimentary_limit})</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-indigo-600">{formatCurrency(item.total_charge)}</p>
                        <p className="text-xs text-gray-400">@ {formatCurrency(item.charge_per_unit || 0)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 text-sm font-medium">
                    <span>Subtotal: {formatCurrency(details.consumables_charges || details.bill_details.consumables_charges || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Inventory Rentals (from bill_details) */}
            {details.bill_details?.inventory_usage?.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3">Rentals / Inventory</h3>
                <div className="space-y-2">
                  {details.bill_details.inventory_usage.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-blue-50 p-3 rounded-lg border border-blue-100">
                      <div className="flex-1">
                        <p className="font-semibold text-blue-800">{item.item_name}</p>
                        <p className="text-sm text-blue-600">
                          Qty: {item.quantity} {item.unit || ''}
                          {item.room_number && <span className="ml-2">Room: {item.room_number}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-blue-800">{formatCurrency(item.rental_charge || 0)}</p>
                        {item.rental_price > 0 && <p className="text-xs text-blue-400">@ {formatCurrency(item.rental_price)}</p>}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 text-sm font-medium text-blue-800">
                    <span>Subtotal: {formatCurrency(details.inventory_charges || details.bill_details.inventory_charges || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Asset Damages (from bill_details) */}
            {details.bill_details?.asset_damages?.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-3 text-red-600">Asset Damages</h3>
                <div className="space-y-2">
                  {details.bill_details.asset_damages.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-red-50 p-3 rounded-lg border border-red-100">
                      <div>
                        <p className="font-semibold text-red-700">{item.item_name}</p>
                        {item.notes && <p className="text-sm text-red-500 italic">"{item.notes}"</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-700">{formatCurrency(item.total_charge || item.replacement_cost)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 text-sm font-bold text-red-700">
                    <span>Total Damages: {formatCurrency(details.asset_damage_charges || details.bill_details.asset_damage_charges || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Bill Summary */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-3">Bill Summary</h3>
              <div className="space-y-2">
                {details.room_total > 0 && (
                  <div className="flex justify-between">
                    <span>Room Charges:</span>
                    <span className="font-medium">{formatCurrency(details.room_total)}</span>
                  </div>
                )}
                {details.package_total > 0 && (
                  <div className="flex justify-between">
                    <span>Package Charges:</span>
                    <span className="font-medium">{formatCurrency(details.package_total)}</span>
                  </div>
                )}
                {details.food_total > 0 && (
                  <div className="flex justify-between">
                    <span>Food Charges:</span>
                    <span className="font-medium">{formatCurrency(details.food_total)}</span>
                  </div>
                )}
                {details.service_total > 0 && (
                  <div className="flex justify-between">
                    <span>Service Charges:</span>
                    <span className="font-medium">{formatCurrency(details.service_total)}</span>
                  </div>
                )}
                {(details.consumables_charges > 0 || details.bill_details?.consumables_charges > 0) && (
                  <div className="flex justify-between">
                    <span>Consumables:</span>
                    <span className="font-medium">{formatCurrency(details.consumables_charges || details.bill_details.consumables_charges)}</span>
                  </div>
                )}
                {(details.inventory_charges > 0 || details.bill_details?.inventory_charges > 0) && (
                  <div className="flex justify-between">
                    <span>Inventory Charges:</span>
                    <span className="font-medium">{formatCurrency(details.inventory_charges || details.bill_details.inventory_charges)}</span>
                  </div>
                )}
                {(details.asset_damage_charges > 0 || details.bill_details?.asset_damage_charges > 0) && (
                  <div className="flex justify-between text-red-600">
                    <span>Asset Damages:</span>
                    <span className="font-medium">{formatCurrency(details.asset_damage_charges || details.bill_details.asset_damage_charges)}</span>
                  </div>
                )}
                {details.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span className="font-medium">{formatCurrency(details.tax_amount)}</span>
                  </div>
                )}
                {details.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span className="font-medium">-{formatCurrency(details.discount_amount)}</span>
                  </div>
                )}
                {details.advance_deposit > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Advance Paid:</span>
                    <span className="font-medium">-{formatCurrency(details.advance_deposit)}</span>
                  </div>
                )}
                {details.refund_amount > 0 && (
                  <div className="flex justify-between text-blue-600 font-bold">
                    <span>Refund Amount:</span>
                    <span className="font-bold">{formatCurrency(details.refund_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-indigo-600 pt-2 border-t">
                  <span>{details.refund_amount > 0 ? "Net Payable:" : "Grand Total:"}</span>
                  <span>{details.refund_amount > 0 ? formatCurrency(0) : formatCurrency(details.grand_total)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">Failed to load details</div>
        )}
      </div>
      )}
    </div>
  );
});
const EditCheckoutModal = ({ checkout, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    guest_name: checkout?.guest_name || "",
    room_number: checkout?.room_number || "",
    payment_method: checkout?.payment_method || "",
    payment_status: checkout?.payment_status || "Paid",
    room_total: checkout?.room_total || 0,
    food_total: checkout?.food_total || 0,
    service_total: checkout?.service_total || 0,
    package_total: checkout?.package_total || 0,
    tax_amount: checkout?.tax_amount || 0,
    discount_amount: checkout?.discount_amount || 0,
    grand_total: checkout?.grand_total || 0,
    pan_number: checkout?.pan_number || "",
    gst_number: checkout?.gst_number || "",
    notes: checkout?.notes || "",
    invoice_number: checkout?.invoice_number || ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    const newFormData = { ...formData, [name]: value };
    
    // Auto-calculate grand total if numerical fields change
    if (['room_total', 'food_total', 'service_total', 'package_total', 'tax_amount', 'discount_amount'].includes(name)) {
      const rt = parseFloat(newFormData.room_total) || 0;
      const ft = parseFloat(newFormData.food_total) || 0;
      const st = parseFloat(newFormData.service_total) || 0;
      const pt = parseFloat(newFormData.package_total) || 0;
      const tax = parseFloat(newFormData.tax_amount) || 0;
      const disc = parseFloat(newFormData.discount_amount) || 0;
      newFormData.grand_total = Math.round((rt + ft + st + pt + tax) - disc);
    }
    
    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api.put(`/bill/checkouts/${checkout.id}`, formData);
      onSuccess(response.data);
    } catch (err) {
      console.error("Failed to update checkout:", err);
      setError(err.response?.data?.detail || "Failed to update checkout record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 relative animate-fade-in-up">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800">
        <X size={24} />
      </button>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Final Bill (ID: {checkout.id})</h2>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm border border-red-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
            <input
              type="text"
              name="guest_name"
              value={formData.guest_name}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Number(s)</label>
            <input
              type="text"
              name="room_number"
              value={formData.room_number}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Split">Split</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
            <input
              type="text"
              name="pan_number"
              value={formData.pan_number}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
            <input
              type="text"
              name="gst_number"
              value={formData.gst_number}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
            <input
              type="text"
              name="invoice_number"
              value={formData.invoice_number}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Room Total</label>
            <input
              type="number"
              name="room_total"
              value={formData.room_total}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Food Total</label>
            <input
              type="number"
              name="food_total"
              value={formData.food_total}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Service Total</label>
            <input
              type="number"
              name="service_total"
              value={formData.service_total}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Package Total</label>
            <input
              type="number"
              name="package_total"
              value={formData.package_total}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Tax Amount</label>
            <input
              type="number"
              name="tax_amount"
              value={formData.tax_amount}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Discount</label>
            <input
              type="number"
              name="discount_amount"
              value={formData.discount_amount}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg outline-none text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grand Total (Auto-calculated)</label>
          <input
            type="number"
            name="grand_total"
            value={formData.grand_total}
            readOnly
            className="w-full px-4 py-3 bg-indigo-50 border-2 border-indigo-100 rounded-xl font-bold text-xl text-indigo-700 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows="2"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            placeholder="Reason for adjustment..."
          ></textarea>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : <><Save size={18} /> Save Changes</>}
          </button>
        </div>
      </form>
    </div>
  );
};

CheckoutDetailModal.displayName = 'CheckoutDetailModal';

const CHART_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6'];


const Billing = () => {
  const navigate = useNavigate(); // Not used here, but good practice if you use react-router for navigation
  const [roomNumber, setRoomNumber] = useState("");
  const [checkoutMode, setCheckoutMode] = useState("multiple");
  const [billData, setBillData] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [panNumber, setPanNumber] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [discount, setDiscount] = useState(0);
  const [enableLateFee, setEnableLateFee] = useState(true);
  const [lateFeeAmount, setLateFeeAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bannerMessage, setBannerMessage] = useState({ type: null, text: "" });
  const [activeRooms, setActiveRooms] = useState([]);
  const [checkouts, setCheckouts] = useState([]);
  const [selectedCheckout, setSelectedCheckout] = useState(null);
  const [hasMoreCheckouts, setHasMoreCheckouts] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [checkoutRequest, setCheckoutRequest] = useState(null);
  const [checkingInventory, setCheckingInventory] = useState(false);

  // Collapsible drawers for bill itemized details
  const [showFoodDetails, setShowFoodDetails] = useState(false);
  const [showConsumables, setShowConsumables] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showDamages, setShowDamages] = useState(false);
  
  // Custom Dropdown States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // New State for Inventory Verification Modal
  const [checkoutInventoryModal, setCheckoutInventoryModal] = useState(null); // Request ID
  const [checkoutInventoryDetails, setCheckoutInventoryDetails] = useState(null);
  const [activeRoomTab, setActiveRoomTab] = useState(0);
  const [verifiedRoomIndices, setVerifiedRoomIndices] = useState(new Set());
  const [returnLocations, setReturnLocations] = useState([]); // Valid return locations

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [guestNameFilter, setGuestNameFilter] = useState("");
  const [roomNumberFilter, setRoomNumberFilter] = useState("");
  const [bookingIdFilter, setBookingIdFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Resort settings state
  const [resortSettings, setResortSettings] = useState({
    resort_name: "Your Resort Name",
    resort_address: "123 Paradise Lane, Beach City",
    resort_phone: "",
    resort_email: "contact@yourresort.com",
    resort_website: "",
    gst_number: "",
    license_number: "",
    resort_location: ""
  });

  const [gstType, setGstType] = useState("CGST_SGST");
  const [gstSettings, setGstSettings] = useState({
    gst_enabled: true,
    gst_room_type: "SLAB",
    gst_slab_rate_1: "5",
    gst_slab_rate_2: "12",
    gst_slab_rate_3: "18"
  });

  const getDynamicTotals = () => {
    if (!billData) return { subtotal: 0, totalGST: 0, totalBill: 0, advanceDeposit: 0, netPayable: 0, refundAmount: 0 };
    const originalLateFee = billData.charges?.late_checkout_fee || 0;
    const currentLateFee = enableLateFee ? (parseFloat(lateFeeAmount) || 0) : 0;
    const diff = currentLateFee - originalLateFee;

    const subtotal = (billData.charges?.total_due || 0) + diff;
    let totalGST = billData.charges?.total_gst || 0;
    
    let discountAmount = parseFloat(discount) || 0;
    
    // Dynamically recalculate GST if discount is applied to room rent
    if (discountAmount > 0) {
      let roomCharges = billData.charges?.room_charges || 0;
      let packageCharges = billData.charges?.package_charges || 0;
      
      let roomDiscount = Math.min(discountAmount, roomCharges);
      roomCharges -= roomDiscount;
      let remainingDiscount = discountAmount - roomDiscount;
      
      let pkgDiscount = Math.min(remainingDiscount, packageCharges);
      packageCharges -= pkgDiscount;
      
      const numRooms = billData.room_numbers?.length || 1;
      const stayNights = billData.stay_nights || 1;
      const dailyRatePerRoom = (roomCharges + packageCharges) / Math.max(1, stayNights * numRooms);
      
      let newGstRate = parseFloat(gstSettings.room_gst_rate || 12);
      if (gstSettings.gst_room_type !== "MANUAL") {
        if (dailyRatePerRoom < 5000) newGstRate = parseFloat(gstSettings.gst_slab_rate_1 || 5);
        else if (dailyRatePerRoom <= 7500) newGstRate = parseFloat(gstSettings.gst_slab_rate_2 || 12);
        else newGstRate = parseFloat(gstSettings.gst_slab_rate_3 || 18);
      }
      
      // Assume exclusive GST for simplicity (standard for most hotels)
      const newRoomGst = roomCharges * (newGstRate / 100);
      const newPackageGst = packageCharges * (newGstRate / 100);
      
      const oldRoomGst = billData.charges?.room_gst || 0;
      const oldPackageGst = billData.charges?.package_gst || 0;
      
      totalGST = totalGST - oldRoomGst - oldPackageGst + newRoomGst + newPackageGst;
    }

    const rawTotalBill = subtotal + totalGST;
    const totalBill = Math.ceil(rawTotalBill);
    const roundOff = totalBill - rawTotalBill;
    const advanceDeposit = billData.charges?.advance_deposit || 0;
    const netPayable = totalBill - discountAmount - advanceDeposit;
    const refundAmount = Math.max(0, advanceDeposit - (totalBill - discountAmount));

    return { subtotal, totalGST, totalBill, roundOff, advanceDeposit, netPayable, refundAmount };
  };

  // Function to show banner message
  const showBannerMessage = (type, text) => {
    setBannerMessage({ type, text });
  };

  const closeBannerMessage = () => {
    setBannerMessage({ type: null, text: "" });
  };

  const loadMoreCheckouts = useCallback(async () => {
    if (isFetchingMore || !hasMoreCheckouts || loading) return;
    setIsFetchingMore(true);
    try {
      const response = await api.get(`/bill/checkouts?skip=${checkouts.length}&limit=20`);
      const newCheckouts = response.data || [];
      setCheckouts(prev => {
        const combined = [...prev, ...newCheckouts];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique;
      });
      if (newCheckouts.length < 20) {
        setHasMoreCheckouts(false);
      }
    } catch (err) {
      console.error("Failed to load more checkouts:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMoreCheckouts, checkouts.length, loading]);

  const loadMoreRef = useInfiniteScroll(loadMoreCheckouts, hasMoreCheckouts, isFetchingMore);
  const [kpiData, setKpiData] = useState({
    checkouts_today: 0,
    checkouts_total: 0,
    available_rooms: 0,
    booked_rooms: 0,
    food_revenue_today: 0,
    package_bookings_today: 0,
  });

  const [chartData, setChartData] = useState({
    revenue_breakdown: [],
    weekly_performance: [],
  });

  // Extract unique payment methods from checkouts
  const paymentMethods = useMemo(() => {
    const methods = new Set();
    checkouts.forEach(c => {
      if (c.payment_method) methods.add(c.payment_method);
    });
    return Array.from(methods).sort();
  }, [checkouts]);

  // Filter checkouts based on all filter criteria
  const filteredCheckouts = useMemo(() => {
    return checkouts.filter(c => {
      // General search - search across ID, guest name, room number, booking ID
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          c.id.toString().toLowerCase().includes(searchLower) ||
          c.guest_name?.toLowerCase().includes(searchLower) ||
          c.room_number?.toLowerCase().includes(searchLower) ||
          c.booking_id?.toString().toLowerCase().includes(searchLower) ||
          c.package_booking_id?.toString().toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Guest name filter
      if (guestNameFilter && !c.guest_name?.toLowerCase().includes(guestNameFilter.toLowerCase())) {
        return false;
      }

      // Room number filter
      if (roomNumberFilter && !c.room_number?.toLowerCase().includes(roomNumberFilter.toLowerCase())) {
        return false;
      }

      // Booking ID filter
      if (bookingIdFilter) {
        const bookingIdStr = bookingIdFilter.toLowerCase();
        const matchesBookingId =
          c.booking_id?.toString().toLowerCase().includes(bookingIdStr) ||
          c.package_booking_id?.toString().toLowerCase().includes(bookingIdStr);
        if (!matchesBookingId) return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== "All" && c.payment_method !== paymentMethodFilter) {
        return false;
      }

      // Date range filter
      if (fromDate || toDate) {
        const checkoutDate = new Date(c.created_at);
        if (fromDate && checkoutDate < new Date(fromDate)) return false;
        if (toDate && checkoutDate > new Date(toDate + 'T23:59:59')) return false;
      }

      // Amount range filter
      if (minAmount && c.grand_total < parseFloat(minAmount)) return false;
      if (maxAmount && c.grand_total > parseFloat(maxAmount)) return false;

      return true;
    });
  }, [checkouts, searchQuery, guestNameFilter, roomNumberFilter, bookingIdFilter, paymentMethodFilter, fromDate, toDate, minAmount, maxAmount]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (guestNameFilter) count++;
    if (roomNumberFilter) count++;
    if (bookingIdFilter) count++;
    if (paymentMethodFilter !== "All") count++;
    if (fromDate) count++;
    if (toDate) count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    return count;
  }, [searchQuery, guestNameFilter, roomNumberFilter, bookingIdFilter, paymentMethodFilter, fromDate, toDate, minAmount, maxAmount]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery("");
    setGuestNameFilter("");
    setRoomNumberFilter("");
    setBookingIdFilter("");
    setPaymentMethodFilter("All");
    setFromDate("");
    setToDate("");
    setMinAmount("");
    setMaxAmount("");
  };

  // Fetch initial data on component mount
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch resort settings
  useEffect(() => {
    const fetchResortSettings = async () => {
      try {
        const response = await api.get('/settings/');
        const settingsArray = response.data || [];
        const settingsObj = {};
        settingsArray.forEach(setting => {
          settingsObj[setting.key] = setting.value;
        });
        setResortSettings(prev => ({ ...prev, ...settingsObj }));

        // Process GST settings
        setGstSettings(prev => ({
          ...prev,
          gst_enabled: settingsObj.gst_enabled?.toLowerCase() === "true",
          gst_room_type: settingsObj.gst_room_type?.toUpperCase() || "SLAB",
          room_gst_rate: settingsObj.room_gst_rate || "12",
          gst_slab_rate_1: settingsObj.gst_slab_rate_1 || "5",
          gst_slab_rate_2: settingsObj.gst_slab_rate_2 || "12",
          gst_slab_rate_3: settingsObj.gst_slab_rate_3 || "18"
        }));
      } catch (error) {
        console.error('Failed to fetch resort settings:', error);
      }
    };
    fetchResortSettings();
  }, []);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all necessary data in parallel using Promise.allSettled to handle individual failures
      const results = await Promise.allSettled([
        api.get("/bill/checkouts?skip=0&limit=20").catch(err => ({ error: err, data: [] })),
        api.get("/dashboard/kpis").catch(err => ({ error: err, data: [{ checkouts_today: 0, checkouts_total: 0, available_rooms: 0, booked_rooms: 0, food_revenue_today: 0, package_bookings_today: 0 }] })),
        api.get("/dashboard/charts").catch(err => ({ error: err, data: { revenue_breakdown: [], weekly_performance: [] } })),
        api.get("/bill/active-rooms").catch(err => ({ error: err, data: [] }))
      ]);

      // Process checkouts result
      if (results[0].status === 'fulfilled' && !results[0].value.error) {
        setCheckouts(Array.isArray(results[0].value.data) ? results[0].value.data : []);
        setHasMoreCheckouts(results[0].value.data && results[0].value.data.length === 20);
      } else {
        console.error("Failed to load checkouts:", results[0].value?.error || results[0].reason);
        setCheckouts([]);
        setHasMoreCheckouts(false);
      }

      // Process KPI result
      if (results[1].status === 'fulfilled' && !results[1].value.error) {
        const kpiData = results[1].value.data;
        if (Array.isArray(kpiData) && kpiData.length > 0) {
          setKpiData(kpiData[0]);
        } else if (typeof kpiData === 'object') {
          setKpiData(kpiData);
        } else {
          setKpiData({
            checkouts_today: 0,
            checkouts_total: 0,
            available_rooms: 0,
            booked_rooms: 0,
            food_revenue_today: 0,
            package_bookings_today: 0,
          });
        }
      } else {
        console.error("Failed to load KPIs:", results[1].value?.error || results[1].reason);
        setKpiData({
          checkouts_today: 0,
          checkouts_total: 0,
          available_rooms: 0,
          booked_rooms: 0,
          food_revenue_today: 0,
          package_bookings_today: 0,
        });
      }

      // Process charts result
      if (results[2].status === 'fulfilled' && !results[2].value.error) {
        setChartData(results[2].value.data || { revenue_breakdown: [], weekly_performance: [] });
      } else {
        console.error("Failed to load charts:", results[2].value?.error || results[2].reason);
        setChartData({ revenue_breakdown: [], weekly_performance: [] });
      }

      // Process active rooms result
      if (results[3].status === 'fulfilled' && !results[3].value.error) {
        const roomsData = Array.isArray(results[3].value.data) ? results[3].value.data : [];
        console.log("Active rooms fetched:", roomsData);
        setActiveRooms(roomsData);
        if (roomsData.length === 0) {
          console.warn("No active rooms found. This could mean:");
          console.warn("1. No bookings are in 'checked-in' status");
          console.warn("2. All rooms in checked-in bookings are already marked as 'Available' (checked out)");
          console.warn("3. There are no active bookings");
        }
      } else {
        console.error("Failed to load active rooms:", results[3].value?.error || results[3].reason);
        setActiveRooms([]);
      }

      // Show error message only if all requests failed
      const allFailed = results.every(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value?.error));
      if (allFailed) {
        showBannerMessage("error", "Could not fetch dashboard data. Please check your connection and try again.");
      }
    } catch (err) {
      console.error("Unexpected error fetching initial data:", err);
      showBannerMessage("error", `Could not fetch dashboard data: ${err.message || 'Unknown error'}. Please refresh.`);
      // Set default values to prevent undefined errors
      setCheckouts([]);
      setActiveRooms([]);
      setKpiData({
        checkouts_today: 0,
        checkouts_total: 0,
        available_rooms: 0,
        booked_rooms: 0,
        food_revenue_today: 0,
        package_bookings_today: 0,
      });
      setChartData({
        revenue_breakdown: [],
        weekly_performance: []
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch checkout request status when room number changes
  useEffect(() => {
    const fetchCheckoutRequest = async () => {
      if (!roomNumber) {
        setCheckoutRequest(null);
        return;
      }

      try {
        const actualRoomNumber = roomNumber.includes('-') ? roomNumber.split('-')[1] : roomNumber;
        const res = await api.get(`/bill/checkout-request/${actualRoomNumber}?checkout_mode=${checkoutMode}`);
        if (res.data && res.data.exists) {
          setCheckoutRequest(res.data);
        } else {
          setCheckoutRequest(null);
        }
      } catch (error) {
        console.error("Error fetching checkout request:", error);
        setCheckoutRequest(null);
      }
    };

    fetchCheckoutRequest();
  }, [roomNumber]);

  const handleRequestCheckout = async () => {
    if (!roomNumber) {
      showBannerMessage("error", "Please select a booking to checkout.");
      return;
    }

    setLoading(true);
    try {
      const actualRoomNumber = roomNumber.includes('-') ? roomNumber.split('-')[1] : roomNumber;
      const res = await api.post(`/bill/checkout-request?room_number=${actualRoomNumber}&checkout_mode=${checkoutMode}`);
      showBannerMessage("success", res.data.message || "Checkout request created successfully. Please verify room inventory.");
      // Refresh checkout request status
      const requestRes = await api.get(`/bill/checkout-request/${actualRoomNumber}`);
      if (requestRes.data && requestRes.data.exists) {
        setCheckoutRequest(requestRes.data);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail;
      const message = typeof errorMsg === 'string' ? errorMsg : (error.message || 'Unknown error');
      showBannerMessage("error", `Error: ${message}`);
      console.error("Error creating checkout request:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckInventory = async () => {
    if (!checkoutRequest || !checkoutRequest.request_id) {
      showBannerMessage("error", "No checkout request found.");
      return;
    }

    setCheckingInventory(true);
    try {
      // 0. Fetch valid return locations first
      let validLocs = [];
      let laundryLocId = null;
      try {
        const locRes = await api.get('/inventory/locations?limit=100');
        validLocs = (locRes.data || []).filter(l =>
          l.is_inventory_point ||
          ['WAREHOUSE', 'CENTRAL_WAREHOUSE', 'BRANCH_STORE', 'SUB_STORE', 'STORE', 'DEPARTMENT', 'LAUNDRY'].includes(l.location_type)
        );
        const laundryLoc = validLocs.find(l => l.location_type === 'LAUNDRY' || l.name?.toLowerCase().includes('laundry'));
        if (laundryLoc) laundryLocId = laundryLoc.id;
        setReturnLocations(validLocs);
      } catch (e) {
        console.error("Failed to fetch return locations", e);
      }

      // 1. Fetch current inventory details (consumables & assets for all rooms)
      const res = await api.get(`/bill/checkout-request/${checkoutRequest.request_id}/inventory-details`);
      const details = res.data;

      if (details.room_details) {
        details.room_details = details.room_details.map(room => {
          const processedItems = (room.items || []).map(item => ({
            ...item,
            total_assigned: item.current_stock,
            available_stock: item.current_stock,
            used_qty: 0,
            missing_qty: 0,
            is_returned: item.is_rentable || item.track_laundry_cycle || false,
            return_location_id: item.track_laundry_cycle ? laundryLocId : null
          }));
          
          const processedAssets = (room.fixed_assets || []).map(vAsset => ({
            ...vAsset,
            is_present: true,
            is_damaged: false,
            damage_notes: "",
            current_stock: 1,
            available_stock: 1,
            request_replacement: false,
            is_returned: vAsset.track_laundry_cycle || false,
            return_location_id: vAsset.track_laundry_cycle ? laundryLocId : null
          }));

          return {
            ...room,
            items: processedItems,
            fixed_assets: processedAssets,
            inventory_notes: ''
          };
        });
      }
      details.laundryLocId = laundryLocId;

      setCheckoutInventoryDetails(details);
      setActiveRoomTab(0);
      setVerifiedRoomIndices(new Set([0])); // Start with the first room as visited
      setCheckoutInventoryModal(checkoutRequest.request_id);

    } catch (error) {
      const errorMsg = error.response?.data?.detail;
      const message = typeof errorMsg === 'string' ? errorMsg : (error.message || 'Unknown error');
      showBannerMessage("error", `Error fetching inventory details: ${message}`);
      console.error("Error checking inventory:", error);
    } finally {
      setCheckingInventory(false);
    }
  };

  const handleUpdateInventoryVerification = (index, field, value) => {
    const updatedDetails = { ...checkoutInventoryDetails };
    const room = updatedDetails.room_details[activeRoomTab];
    const newItems = [...room.items];
    const item = newItems[index];

    const unit = (item.unit || 'pcs').toLowerCase();
    const isDiscreteUnit = ['pcs', 'pc', 'can', 'bottle', 'unit', 'nos', 'number', 'pkt', 'pack', 'box', 'tray', 'piece', 'pieces'].includes(unit);

    let val = parseFloat(value) || 0;
    if (field === 'available_stock' && isDiscreteUnit) {
      val = Math.floor(val);
    }
    
    newItems[index] = { ...newItems[index], [field]: val };

    if (field === 'available_stock' || field === 'damage_qty') {
      const current = newItems[index].current_stock || 0;
      const good = field === 'available_stock' ? val : (newItems[index].available_stock || 0);
      const damaged = field === 'damage_qty' ? val : (newItems[index].damage_qty || 0);

      const isRental = newItems[index].is_rentable || (newItems[index].category_name && newItems[index].category_name.toLowerCase().includes('rental'));

      if (isRental) {
        newItems[index].missing_qty = Math.max(0, current - good - damaged);
        newItems[index].used_qty = 0;
      } else {
        let used = current - good - damaged;
        if (isDiscreteUnit) used = Math.round(used);
        else used = parseFloat(used.toFixed(2));

        newItems[index].used_qty = Math.max(0, used);
        newItems[index].missing_qty = 0;
      }
    }

    room.items = newItems;
    setCheckoutInventoryDetails(updatedDetails);
  };

  const handleUpdateReturnLocation = (index, locationId) => {
    const updatedDetails = { ...checkoutInventoryDetails };
    const room = updatedDetails.room_details[activeRoomTab];
    const newItems = [...room.items];
    newItems[index] = { ...newItems[index], return_location_id: locationId ? parseInt(locationId) : null };
    room.items = newItems;
    setCheckoutInventoryDetails(updatedDetails);
  };

  const handleUpdateAssetDamage = (index, field, value) => {
    const updatedDetails = { ...checkoutInventoryDetails };
    const room = updatedDetails.room_details[activeRoomTab];
    const newAssets = [...(room.fixed_assets || [])];
    newAssets[index] = { ...newAssets[index], [field]: value };
    room.fixed_assets = newAssets;
    setCheckoutInventoryDetails(updatedDetails);
  };

  const handleSubmitInventoryCheck = async (notes) => {
    if (!checkoutInventoryModal) return;

    setCheckingInventory(true);
    try {
      let allItems = [];
      let allAssetDamages = [];

      checkoutInventoryDetails.room_details.forEach(room => {
        const roomItems = room.items.map(item => ({
          item_id: item.id,
          used_qty: item.used_qty || 0,
          missing_qty: item.missing_qty || 0,
          damage_qty: item.damage_qty || 0,
          is_returned: !!item.is_returned,
          return_location_id: item.return_location_id,
          room_number: room.room_number
        }));
        allItems = allItems.concat(roomItems);

        const roomAssets = (room.fixed_assets || []).map(asset => ({
          asset_registry_id: asset.asset_registry_id || asset.id,
          item_id: asset.item_id,
          item_name: asset.item_name || asset.name,
          replacement_cost: asset.replacement_cost,
          is_present: asset.is_present !== false,
          is_damaged: asset.is_damaged || false,
          is_laundry: asset.return_location_id === checkoutInventoryDetails.laundryLocId,
          laundry_location_id: asset.return_location_id === checkoutInventoryDetails.laundryLocId ? checkoutInventoryDetails.laundryLocId : null,
          return_location_id: asset.return_location_id,
          request_replacement: asset.request_replacement || false,
          notes: asset.damage_notes || (asset.is_present === false ? "Missing at checkout" : asset.is_damaged ? "Damaged" : ""),
          room_number: room.room_number
        }));
        allAssetDamages = allAssetDamages.concat(roomAssets);
      });

      const res = await api.post(`/bill/checkout-request/${checkoutInventoryModal}/check-inventory`, {
        inventory_notes: notes || "",
        items: allItems,
        asset_damages: allAssetDamages
      });

      showBannerMessage("success", res.data.message || "Inventory checked successfully.");
      setCheckoutInventoryModal(null);
      setCheckoutInventoryDetails(null);
      setActiveRoomTab(0);

      // Refresh checkout request status
      const actualRoomNumber = roomNumber.includes('-') ? roomNumber.split('-')[1] : roomNumber;
      const requestRes = await api.get(`/bill/checkout-request/${actualRoomNumber}`);
      if (requestRes.data && requestRes.data.exists) {
        setCheckoutRequest(requestRes.data);
      }

    } catch (error) {
      console.error("Failed to submit inventory check:", error);
      alert(`Failed to submit inventory check: ${error.response?.data?.detail || error.message}`);
    } finally {
      setCheckingInventory(false);
    }
  };

  const handleGetBill = async () => {
    if (!roomNumber) {
      showBannerMessage("error", "Please select a booking to checkout.");
      return;
    }

    // Check if checkout request exists and is completed
    if (checkoutRequest && checkoutRequest.exists && checkoutRequest.status !== "completed") {
      showBannerMessage("error", "Please complete the checkout request (verify inventory) before getting the bill.");
      return;
    }

    setLoading(true);
    setBillData(null);
    setPanNumber("");
    setGstNumber("");
    setDiscount(0); // Reset discount when fetching a new bill
    try {
      // Extract actual room number from composite key if needed
      const actualRoomNumber = roomNumber.includes('-') ? roomNumber.split('-')[1] : roomNumber;
      const res = await api.get(`/bill/${actualRoomNumber}?checkout_mode=multiple`);
      if (res.data && res.data.room_numbers) {
        console.log("DEBUG BILL DATA:", res.data);
        console.log("INVENTORY CHARGES:", res.data.charges?.inventory_charges);
        setBillData(res.data);
        setPanNumber(res.data.pan_number || "");
        setGstNumber(res.data.gst_number || "");
        setEnableLateFee((res.data.charges?.late_checkout_fee || 0) > 0);
        setLateFeeAmount(res.data.charges?.late_checkout_fee || 0);
        const roomCount = res.data.room_numbers.length;
        showBannerMessage("success", `Bill retrieved for ${roomCount} room(s) in the booking.`);
      } else {
        throw new Error("Invalid bill data received");
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail;
      const message = typeof errorMsg === 'string' ? errorMsg : (error.message || 'Unknown error');
      showBannerMessage("error", `Error: ${message}`);
      setBillData(null);
      setPanNumber("");
      setGstNumber("");
      console.error("Error fetching bill:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!billData) {
      showBannerMessage("error", "Please retrieve the bill before checkout.");
      return;
    }
    if (!roomNumber) {
      showBannerMessage("error", "No booking selected for checkout.");
      return;
    }

    // Check if checkout request exists and is completed
    if (checkoutRequest && checkoutRequest.exists && checkoutRequest.status !== "completed") {
      showBannerMessage("error", "Please complete the checkout request (verify inventory) before completing checkout.");
      return;
    }

    // Validate discount amount
    const discountAmount = parseFloat(discount) || 0;
    if (discountAmount < 0) {
      showBannerMessage("error", "Discount amount cannot be negative.");
      return;
    }
    const { totalBill } = getDynamicTotals();
    if (discountAmount > totalBill) {
      showBannerMessage("error", "Discount cannot exceed the grand total.");
      return;
    }
    setLoading(true);
    try {
      // Extract actual room number from composite key if needed
      const actualRoomNumber = roomNumber.includes('-') ? roomNumber.split('-')[1] : roomNumber;
      const res = await api.post(`/bill/checkout/${actualRoomNumber}`, {
        payment_method: paymentMethod,
        discount_amount: discountAmount,
        checkout_mode: checkoutMode,
        enable_late_checkout_fee: enableLateFee,
        custom_late_checkout_fee: enableLateFee ? parseFloat(lateFeeAmount) || 0.0 : 0.0,
        pan_number: panNumber,
        gst_number: gstNumber,
      });
      const roomCount = billData.room_numbers?.length || 1;
      const modeText = checkoutMode === "single" ? "single room" : "all rooms";
      setBillData(null);
      setPanNumber("");
      setGstNumber("");
      setDiscount(0);
      setRoomNumber(""); // Clear input on successful checkout
      setCheckoutMode("multiple"); // Reset to default
      showBannerMessage("success", `Checkout successful! ${roomCount} room(s) (${modeText}) checked out. Checkout ID: ${res.data.checkout_id}`);
      // Immediately refresh all data after successful checkout
      await fetchInitialData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || "Checkout failed";

      // If it's a conflict error, it means it's already checked out. Show a clearer message.
      if (error.response?.status === 409) {
        const conflictMessage = errorMessage.includes("already")
          ? errorMessage
          : `This booking or room has already been checked out. ${errorMessage}`;
        showBannerMessage("error", conflictMessage);
        setBillData(null);
        setPanNumber("");
        setGstNumber("");
        setDiscount(0);
        setRoomNumber("");
        // Refresh active rooms list immediately
        fetchInitialData();
      } else if (error.response?.status === 404) {
        // Booking not found - might have been checked out already
        showBannerMessage("error", "Booking not found. It may have already been checked out. Refreshing...");
        setBillData(null);
        setPanNumber("");
        setGstNumber("");
        setRoomNumber("");
        fetchInitialData();
      } else {
        showBannerMessage("error", `Error: ${errorMessage}`);
      }
      console.error("Checkout error:", error);
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async (action = 'print') => {
    if (!billData) return;

    const doc = new jsPDF();

    // Try to load and add logo
    try {
      const img = new Image();
      img.src = logo;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      doc.addImage(img, 'JPEG', 90, 5, 30, 30);
    } catch (err) {
      console.warn("Could not load logo for PDF", err);
    }

    // 1. Header (Centered)
    const resortName = resortSettings?.branch_name || resortSettings?.resort_name || 'ORCHID TRAILS RESORT';
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(resortName.toUpperCase(), 105, 43, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);

    const address = resortSettings?.branch_address || resortSettings?.resort_address || '';
    if (address) {
      doc.text(address, 105, 49, { align: 'center' });
    }

    const phone = resortSettings?.branch_phone || '';
    const gst = resortSettings?.gst_number || '';
    
    let contactInfo = [];
    if (phone) contactInfo.push(`Phone: ${phone}`);
    if (gst) contactInfo.push(`GSTIN: ${gst}`);
    if (contactInfo.length > 0) {
      doc.text(contactInfo.join(' | '), 105, 55, { align: 'center' });
    }

    // TAX INVOICE Badge
    doc.setFillColor(5, 150, 105);
    doc.roundedRect(85, 60, 40, 7, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255); 
    doc.text('TAX INVOICE', 105, 65, { align: 'center' });
    
    // 2. Info Section Layout
    let startY = 73;
    let boxHeight = 46;
    
    // Draw Guest Details Box
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 252, 251); 
    doc.roundedRect(14, startY, 88, boxHeight, 3, 3, 'FD');

    // Draw Stay Details Box
    doc.roundedRect(108, startY, 88, boxHeight, 3, 3, 'FD');

    // Guest details text
    doc.setFontSize(10);
    doc.setTextColor(5, 150, 105); 
    doc.setFont('helvetica', 'bold');
    doc.text('GUEST DETAILS', 18, startY + 6);
    
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'normal');
    let currentY = startY + 13;
    doc.text(`Name: ${billData.guest_name || 'N/A'}`, 18, currentY);
    
    const guestMobile = billData.booking_details?.guest_mobile || billData.guest_mobile || '';
    const guestEmail = billData.booking_details?.guest_email || billData.guest_email || '';
    
    if (guestMobile) {
      currentY += 6;
      doc.text(`Mobile: ${guestMobile}`, 18, currentY);
    }
    if (guestEmail) {
      currentY += 6;
      doc.text(`Email: ${guestEmail}`, 18, currentY);
    }
    
    if (billData.pan_number) {
      currentY += 6;
      doc.text(`PAN: ${billData.pan_number}`, 18, currentY);
    }
    const currentGst = gstNumber || billData.gst_number || billData.guest_gstin || '';
    if (currentGst) {
      currentY += 6;
      doc.text(`GSTIN: ${currentGst}`, 18, currentY);
    }

    // Stay details text
    doc.setTextColor(5, 150, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('STAY DETAILS', 112, startY + 6);
    
    doc.setTextColor(55, 65, 81);
    doc.setFont('helvetica', 'normal');
    let rightY = startY + 13;
    doc.text(`Invoice No: ${billData.invoice_number || `INV-${(billData.id || billData.booking_id || 0).toString().padStart(4, '0')}`}`, 112, rightY);
    
    rightY += 6;
    let createdDate = new Date();
    if (billData.created_at) {
        const parsed = new Date(billData.created_at);
        if (!isNaN(parsed.getTime())) {
            createdDate = parsed;
        }
    }
    doc.text(`Date: ${formatDateTimeIST(createdDate)}`, 112, rightY);
    
    rightY += 6;
    doc.text(`Room No(s): ${billData.room_numbers?.join(', ') || billData.room_number || 'N/A'}`, 112, rightY);

    const checkInDate = billData.check_in || billData.booking_details?.check_in;
    const checkOutDate = billData.check_out || billData.booking_details?.check_out;
    rightY += 6;
    doc.text(`Check-in: ${checkInDate ? new Date(checkInDate).toLocaleDateString('en-GB') : 'N/A'}`, 112, rightY);
    rightY += 6;
    doc.text(`Check-out: ${checkOutDate ? new Date(checkOutDate).toLocaleDateString('en-GB') : 'N/A'}`, 112, rightY);

    const adults = billData.booking_details?.adults || billData.adults || 0;
    const children = billData.booking_details?.children || billData.children || 0;
    if (adults > 0 || children > 0) {
      rightY += 6;
      doc.text(`Pax: ${adults} Adults, ${children} Children`, 112, rightY);
    }

    currentY = startY + boxHeight + 8;

    // Helper for currency formatting
    const formatPDFCurrency = (amt) => {
      const formatted = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amt || 0);
      return `Rs.${formatted}`;
    };

    // 4. Charges Table
    const chargesBody = [];
    let idx = 1;


    if (billData.charges?.room_charges > 0) {
      chargesBody.push([idx++, 'Room Stay Charges', '-', formatPDFCurrency(billData.charges.room_charges)]);
    }
    if (billData.charges?.package_charges > 0) {
      chargesBody.push([idx++, 'Package Charges', '-', formatPDFCurrency(billData.charges.package_charges)]);
    }

    if (billData.charges?.food_items && billData.charges.food_items.length > 0) {
      billData.charges.food_items.forEach(item => {
        if (!item.is_paid || item.payment_status === "Complimentary") {
          chargesBody.push([idx++, `Food: ${item.item_name}`, `x${item.quantity}`, formatPDFCurrency(item.amount)]);
        }
      });
    }

    if (billData.charges?.service_items && billData.charges.service_items.length > 0) {
      billData.charges.service_items.forEach(item => {
        if (!item.is_paid) {
          chargesBody.push([idx++, `Service: ${item.service_name}`, '-', formatPDFCurrency(item.charges)]);
        }
      });
    }

    if (billData.charges?.consumables_items && billData.charges.consumables_items.length > 0) {
      billData.charges.consumables_items.forEach(item => {
        chargesBody.push([
          idx++,
          `Consumable: ${item.item_name}`,
          `x${item.quantity || item.actual_consumed || 1}`,
          formatPDFCurrency(item.total_charge)
        ]);
      });
    }

    if (billData.charges?.inventory_usage && billData.charges.inventory_usage.length > 0) {
      billData.charges.inventory_usage.forEach(item => {
        chargesBody.push([
          idx++,
          `Rental: ${item.item_name}`,
          `x${item.quantity} ${item.unit || ''}`,
          formatPDFCurrency(item.rental_charge || 0)
        ]);
      });
    }

    if (billData.charges?.asset_damages && billData.charges.asset_damages.length > 0) {
      billData.charges.asset_damages.forEach(item => {
        chargesBody.push([
          idx++,
          `Damage: ${item.item_name} ${item.notes ? `(${item.notes})` : ''}`,
          '-',
          formatPDFCurrency(item.total_charge || item.replacement_cost)
        ]);
      });
    }
    
    // Late Checkout Fee
    if (enableLateFee && parseFloat(lateFeeAmount) > 0) {
      chargesBody.push([
        idx++,
        'Late Checkout Fee',
        'Late check-out charge',
        formatPDFCurrency(parseFloat(lateFeeAmount))
      ]);
    } else if (billData.charges?.late_checkout_fee > 0) {
      chargesBody.push([idx++, 'Late Checkout Fee', '-', formatPDFCurrency(billData.charges.late_checkout_fee)]);
    }

    autoTable(doc, {
      startY: currentY,
      head: [['Sl No.', 'Particulars', 'Qty/Nights', 'Amount']],
      body: chargesBody,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [249, 250, 249] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 30 },
        3: { halign: 'right', cellWidth: 40 }
      },
      styles: { cellPadding: 3, fontSize: 9, lineColor: [220, 220, 220], lineWidth: 0.1 }
    });

    // 5. Financial Summary
    const totalsY = doc.lastAutoTable.finalY + 8;
    
    let subtotal, tax, discount, advance, grand, balanceDue, originalSubtotal;


    // Live BillData Calculation
    const dynTotals = getDynamicTotals();
    subtotal = dynTotals.subtotal;
    tax = dynTotals.totalGST;
    
    // Discount is applied explicitly on room/package, or we can use state
    discount = parseFloat(discountAmount) || 0;
    
    // Handle global advance/refund
    advance = billData.charges?.advance_deposit || 0;
    grand = subtotal + tax - discount;
    balanceDue = Math.max(0, grand - advance);

    const summaryRows = [
      ['Gross Total', formatPDFCurrency(subtotal)]
    ];
    if (discount > 0) summaryRows.push(['Discount', `(-)${formatPDFCurrency(discount)}`]);
    if (tax > 0) {
      const taxable = subtotal - discount;
      summaryRows.push(['Taxable Amount', formatPDFCurrency(taxable)]);

      if (gstType === 'IGST') {
        summaryRows.push(['IGST', `(+) ${formatPDFCurrency(tax)}`]);
      } else {
        summaryRows.push(['CGST', `(+) ${formatPDFCurrency(tax/2)}`]);
        summaryRows.push(['SGST', `(+) ${formatPDFCurrency(tax/2)}`]);
      }

    }
    summaryRows.push(['Grand Total', formatPDFCurrency(grand)]);
    if (advance > 0) summaryRows.push(['Advance Paid', `(-)${formatPDFCurrency(advance)}`]);

    autoTable(doc, {
      startY: totalsY,
      body: summaryRows,
      theme: 'plain',
      tableWidth: 'wrap',
      margin: { left: 110 },
      styles: { cellPadding: 3, fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'right', cellWidth: 50 },
        1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 }
      },
      didParseCell: (data) => {
        if (data.row.index === summaryRows.findIndex(r => r[0] === 'Grand Total')) {
          // Grand Total line
          data.cell.styles.textColor = [31, 41, 55];
          data.cell.styles.fillColor = [243, 244, 246]; // Soft gray bg
          if (data.column.index === 1) data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // 6. Footer Layout
    let footerY = doc.lastAutoTable.finalY + 15;
    
    // Check if we need to add a new page for footer
    if (footerY > 260) {
        doc.addPage();
        footerY = 20;
    }

    // Terms and Conditions
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text('Terms & Conditions:', 14, footerY);
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('1. All disputes are subject to local jurisdiction.', 14, footerY + 5);
    doc.text('2. Late checkout is subject to availability and extra charges.', 14, footerY + 9);
    doc.text('3. Guests are responsible for any damage to resort property.', 14, footerY + 13);
    doc.text('4. No refund for early check-outs.', 14, footerY + 17);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(156, 163, 175);
    doc.text('This is a computer-generated invoice and requires no physical signature.', 105, footerY + 28, { align: 'center' });
    doc.setDrawColor(220, 220, 220);
    doc.line(14, footerY + 32, 196, footerY + 32);

    if (action === 'print') {
      window.open(doc.output('bloburl'), '_blank');
    } else {
      doc.save(`bill-room-${billData.room_numbers.join('-')}.pdf`); // Downloads the file
    }
  };

  const generateBillText = (forWhatsApp = false) => {
    if (!billData) return "";

    const line = '----------------------------------------';
    const bold = (text) => forWhatsApp ? `*${text}*` : text.toUpperCase();

    let text = `${bold('Hotel Checkout Bill')}\n${line}\n`;
    text += `Guest Name: ${billData.guest_name}\n`;
    text += `Rooms: ${billData.room_numbers.join(', ')}\n`;
    text += `Check-in: ${new Date(billData.check_in).toLocaleDateString()}\n`;
    text += `Check-out: ${new Date(billData.check_out).toLocaleDateString()}\n`;
    text += `${line}\n`;
    text += `${bold('Itemized Charges:')}\n`;
    if (billData.charges.room_charges > 0) {
      const numRooms = billData.room_numbers?.length || 1;
      const dailyRatePerRoom = billData.charges.room_charges / (billData.stay_nights * numRooms);
      text += `Room Charges: ${formatCurrency(billData.charges.room_charges)} (${formatCurrency(dailyRatePerRoom)}/day × ${billData.stay_nights} ${billData.stay_nights === 1 ? 'night' : 'nights'} × ${numRooms} ${numRooms === 1 ? 'room' : 'rooms'})\n`;
    }
    if (billData.charges.package_charges > 0) text += `Package Charges: ${formatCurrency(billData.charges.package_charges)}\n`;

    if (billData.charges.food_items.length > 0) {
      text += `\nFood & Beverage:\n`;
      billData.charges.food_items.forEach(item => {
        text += `- ${item.item_name} (x${item.quantity}): ${formatCurrency(item.amount)}\n`;
      });
    }
    if (billData.charges.consumables_items && billData.charges.consumables_items.length > 0) {
      text += `\nConsumables:\n`;
      billData.charges.consumables_items.forEach(item => {
        text += `- ${item.item_name} (x${item.actual_consumed}): ${formatCurrency(item.total_charge)}\n`;
      });
    }
    if (billData.charges.service_items.length > 0) {
      text += `\nAdditional Services:\n`;
      billData.charges.service_items.forEach(item => {
        const serviceLabel = item.is_paid ? `${item.service_name} (Previously Billed)` : item.service_name;
        text += `- ${serviceLabel}: ${formatCurrency(item.charges)}\n`;
      });
    }

    if (billData.charges.inventory_usage && billData.charges.inventory_usage.length > 0) {
      text += `\nInventory Usage:\n`;
      billData.charges.inventory_usage.forEach(item => {
        text += `- ${item.item_name} (x${item.quantity} ${item.unit})\n`;
      });
    }

    if (enableLateFee && parseFloat(lateFeeAmount) > 0) {
      text += `\nLate Checkout Fee: ${formatCurrency(parseFloat(lateFeeAmount))}\n`;
    }

    text += `${line}\n`;
    const { subtotal, totalGST, totalBill, netPayable } = getDynamicTotals();
    const advancePaid = billData.charges.advance_deposit || 0;

    text += `Subtotal: ${formatCurrency(subtotal)}\n`;
    // GST Breakdown
    if (billData.charges.room_gst > 0) {
      const numRooms = billData.room_numbers?.length || 1;
      const stayNights = billData.stay_nights || 1;
      const dailyRatePerRoom = (billData.charges.room_charges || 0) / (stayNights * numRooms);
      const gstRate = gstSettings.gst_room_type === "MANUAL" ? `${gstSettings.room_gst_rate || 12}%` :
                     (dailyRatePerRoom < 5000 ? `${gstSettings.gst_slab_rate_1}%` :
                      dailyRatePerRoom <= 7500 ? `${gstSettings.gst_slab_rate_2}%` : `${gstSettings.gst_slab_rate_3}%`);
      text += `Room GST (${gstRate}): +${formatCurrency(billData.charges.room_gst || 0)}\n`;
    }
    if (billData.charges.package_gst > 0) {
      const numRooms = billData.room_numbers?.length || 1;
      const stayNights = billData.stay_nights || 1;
      const dailyRatePerRoom = (billData.charges.package_charges || 0) / (stayNights * numRooms);
      const gstRate = gstSettings.gst_room_type === "MANUAL" ? `${gstSettings.room_gst_rate || 12}%` :
                     (dailyRatePerRoom < 5000 ? `${gstSettings.gst_slab_rate_1}%` :
                      dailyRatePerRoom <= 7500 ? `${gstSettings.gst_slab_rate_2}%` : `${gstSettings.gst_slab_rate_3}%`);
      text += `Package GST (${gstRate}): +${formatCurrency(billData.charges.package_gst || 0)}\n`;
    }
    if (billData.charges.food_gst > 0) {
      text += `Food GST (${resortSettings.food_gst_rate || 5}%): +${formatCurrency(billData.charges.food_gst || 0)}\n`;
    }
    if (billData.charges.service_gst > 0) {
      text += `Service GST (${resortSettings.service_gst_rate || 5}%): +${formatCurrency(billData.charges.service_gst || 0)}\n`;
    }
    if (billData.charges.consumables_gst > 0) {
      text += `Consumables GST (${resortSettings.food_gst_rate || 5}%): +${formatCurrency(billData.charges.consumables_gst || 0)}\n`;
    }
    if (totalGST > 0) {
      if (gstType === 'IGST') {
        text += `IGST: +${formatCurrency(totalGST)}\n`;
      } else {
        text += `CGST: +${formatCurrency(totalGST / 2)}\n`;
        text += `SGST: +${formatCurrency(totalGST / 2)}\n`;
      }
    }
    text += `Total Bill Value: ${formatCurrency(totalBill)}\n`;
    if (discount > 0) text += `Discount: -${formatCurrency(parseFloat(discount))}\n`;
    if (advancePaid > 0) text += `Advance Paid: -${formatCurrency(advancePaid)}\n`;
    
    text += `${bold(netPayable >= 0 ? 'Net Payable:' : 'Refund Amount:')} ${formatCurrency(Math.abs(netPayable))}\n`;
    text += `${line}\nThank you for staying with us!`;

    return encodeURIComponent(text);
  };

  const handleWhatsAppShare = () => {
    const billText = generateBillText(true);
    window.open(`https://wa.me/?text=${billText}`, '_blank');
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent(`Your Hotel Bill for Room(s) ${billData.room_numbers.join(', ')}`);
    const body = generateBillText(false);
    // This will open the user's default email client. For GMail specifically:
    // window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <DashboardLayout>
      <BannerMessage
        message={bannerMessage}
        onClose={closeBannerMessage}
        autoDismiss={true}
        duration={5000}
      />
      {/* Animated Background */}
      <div className="bubbles-container">
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
        <li></li>
      </div>

      <div className="p-2 sm:p-4 md:p-6 bg-gray-50 min-h-screen">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">Business Dashboard & Checkout</h1>
          <button
            onClick={() => navigate('/subscription')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all hover:scale-105"
          >
            <CreditCard size={16} />
            <span>Monthly Subscription Bill</span>
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <KpiCard title="Checkouts Today" value={kpiData.checkouts_today} icon={<Hash size={22} className="text-indigo-600" />} color="bg-indigo-100" />
          <KpiCard title="Total Checkouts" value={kpiData.checkouts_total} icon={<Hash size={22} className="text-green-600" />} color="bg-green-100" />
          <KpiCard title="Available Rooms" value={kpiData.available_rooms} icon={<BedDouble size={22} className="text-blue-600" />} color="bg-blue-100" />
          <KpiCard title="Booked Rooms" value={kpiData.booked_rooms} icon={<BedDouble size={22} className="text-red-600" />} color="bg-red-100" />
          <KpiCard title="Food Revenue Today" value={kpiData.food_revenue_today.toLocaleString()} prefix="₹" icon={<Utensils size={22} className="text-yellow-600" />} color="bg-yellow-100" />
          <KpiCard title="Package Bookings Today" value={kpiData.package_bookings_today} icon={<Package size={22} className="text-purple-600" />} color="bg-purple-100" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 md:gap-8 mb-6 sm:mb-8">
          <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Weekly Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData.weekly_performance} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <XAxis dataKey="day" stroke="#6b7280" />
                <YAxis yAxisId="left" stroke="#6b7280" />
                <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#4f46e5" name="Revenue (₹)" />
                <Bar yAxisId="right" dataKey="checkouts" fill="#10b981" name="Checkouts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Total Revenue Breakdown</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={chartData.revenue_breakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {chartData.revenue_breakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Checkout Form */}
        <div className="bg-white p-4 sm:p-6 md:p-8 rounded-xl shadow-md w-full max-w-2xl mx-auto mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-800 mb-4 sm:mb-6">Process New Checkout</h2>
          <div className="mb-4">
            <label htmlFor="room-select" className="block text-gray-700 font-medium mb-2">
              Select a Room or Booking to Checkout
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full bg-white px-4 py-3 border border-gray-300 rounded-lg flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm hover:border-indigo-300 transition-all text-left"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <User size={20} className="text-gray-400 shrink-0" />
                  <div className="truncate">
                    {roomNumber ? (() => {
                      const parts = roomNumber.split('-');
                      const bookingId = parts[0];
                      const roomNum = parts[1];
                      const selected = activeRooms.find(b => b.booking_id.toString() === bookingId && b.room_number === roomNum);
                      return selected ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-700">{selected.guest_name}</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-gray-600 font-medium">Rooms: {selected.room_numbers?.join(', ') || selected.room_number}</span>
                        </div>
                      ) : "Select a Booking";
                    })() : (
                      <span className="text-gray-400">-- Select an Active Booking --</span>
                    )}
                  </div>
                </div>
                <ChevronDown size={20} className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isDropdownOpen && (
                <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-fade-in-down">
                  <div className="p-2 border-b bg-gray-50">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search guest or room..."
                        value={dropdownSearch}
                        onChange={(e) => setDropdownSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {activeRooms.filter(booking => {
                      const searchLower = dropdownSearch.toLowerCase();
                      return (
                        booking.guest_name?.toLowerCase().includes(searchLower) ||
                        booking.room_number?.toLowerCase().includes(searchLower) ||
                        booking.room_numbers?.some(r => r.toLowerCase().includes(searchLower)) ||
                        booking.booking_id?.toString().includes(searchLower)
                      );
                    }).length > 0 ? (
                      activeRooms
                        .filter(booking => {
                          const searchLower = dropdownSearch.toLowerCase();
                          return (
                            booking.guest_name?.toLowerCase().includes(searchLower) ||
                            booking.room_number?.toLowerCase().includes(searchLower) ||
                            booking.room_numbers?.some(r => r.toLowerCase().includes(searchLower)) ||
                            booking.booking_id?.toString().includes(searchLower)
                          );
                        })
                        .map((booking, index) => {
                          const uniqueValue = `${booking.booking_id}-${booking.room_number}-${booking.checkout_mode}`;
                          const isSelected = roomNumber === uniqueValue;
                          return (
                            <div
                              key={`${uniqueValue}-${index}`}
                              onClick={() => {
                                setRoomNumber(uniqueValue);
                                setBillData(null);
                                setPanNumber("");
                                setGstNumber("");
                                setIsDropdownOpen(false);
                                setDropdownSearch("");
                              }}
                              className={`p-4 cursor-pointer border-b last:border-0 hover:bg-indigo-50 transition-colors ${isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-gray-900">{booking.guest_name}</h4>
                                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                                  <Tag size={10} />
                                  ID: {booking.booking_id}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                  <BedDouble size={14} className="text-indigo-500" />
                                  <span className="font-medium">Rooms: {booking.room_numbers?.join(', ') || booking.room_number}</span>
                                </div>
                                {booking.booking_type === 'package' && (
                                  <span className="flex items-center gap-1 text-xs font-semibold text-purple-600">
                                    <Package size={14} />
                                    Package
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                    ) : (
                      <div className="p-8 text-center text-gray-500 italic">
                        No active bookings found for "{dropdownSearch}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {roomNumber && (() => {
              // Parse composite key to find the correct selection
              let selected = null;

              if (roomNumber.includes('-')) {
                const parts = roomNumber.split('-');
                if (parts.length >= 3) {
                  const [bookingId, roomNum] = parts;
                  selected = activeRooms.find(b =>
                    b.booking_id.toString() === bookingId &&
                    b.room_number === roomNum
                  );
                }
              } else {
                // Fallback for old format
                selected = activeRooms.find(b => b.room_number === roomNumber);
              }

              return (
                <div className="mt-2 p-3 bg-blue-50 border-blue-200 border rounded-lg text-sm text-blue-800">
                  <p className="font-semibold">
                    ✓ Booking Checkout: This will checkout ALL rooms in the booking
                  </p>
                  <p className="mt-1">Rooms: {selected?.room_numbers?.join(', ') || roomNumber}</p>
                </div>
              );
            })()}
          </div>

          {/* Checkout Request Status */}
          {checkoutRequest && checkoutRequest.exists && (
            <div className={`mb-4 p-3 rounded-lg ${checkoutRequest.status === 'completed' ? 'bg-green-50 border border-green-200' :
              checkoutRequest.status === 'in_progress' ? 'bg-blue-50 border border-blue-200' :
                'bg-yellow-50 border border-yellow-200'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-semibold ${checkoutRequest.status === 'completed' ? 'text-green-800' :
                    checkoutRequest.status === 'in_progress' ? 'text-blue-800' :
                      'text-yellow-800'
                    }`}>
                    {checkoutRequest.status === 'completed' ? '✓ Checkout Request Completed' :
                      checkoutRequest.status === 'in_progress' ? '🔄 Checkout Request In Progress' :
                        '⚠ Checkout Request Pending'}
                  </p>
                  {checkoutRequest.employee_name && (
                    <p className="text-xs text-gray-600 mt-1">
                      Assigned to: {checkoutRequest.employee_name}
                    </p>
                  )}
                  {checkoutRequest.inventory_checked_by && (
                    <p className="text-xs text-gray-600 mt-1">
                      Verified by: {checkoutRequest.inventory_checked_by}
                      {checkoutRequest.inventory_checked_at && ` on ${new Date(checkoutRequest.inventory_checked_at).toLocaleString()}`}
                    </p>
                  )}
                  {checkoutRequest.status !== 'completed' && (
                    <p className="text-xs text-gray-600 mt-1">
                      Please complete the checkout request in the Service Requests section before getting the bill.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Request Checkout Button */}
          {(!checkoutRequest || !checkoutRequest.exists) && (
            <button
              onClick={handleRequestCheckout}
              className="w-full bg-yellow-600 text-white py-2.5 rounded-lg font-semibold hover:bg-yellow-700 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 mb-4"
              disabled={loading}
            >
              {loading ? "Creating Request..." : "Request Checkout (Verify Inventory First)"}
            </button>
          )}

          {/* Get Bill Button - Only enabled if checkout request is completed or no request exists */}
          <button
            onClick={handleGetBill}
            className={`w-full py-2.5 rounded-lg font-semibold transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 mb-4 ${(checkoutRequest && checkoutRequest.exists && checkoutRequest.status !== 'completed')
              ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            disabled={loading || (checkoutRequest && checkoutRequest.exists && checkoutRequest.status !== 'completed')}
          >
            {loading ? "Fetching Bill..." : checkoutMode === "single" ? "Get Bill for Single Room" : "Get Bill for Entire Booking"}
          </button>

          {billData && (() => {
            // Calculate food charges - use food_charges if available, otherwise calculate from food_items (only unpaid items)
            const foodCharges = billData.charges.food_charges ||
              (billData.charges.food_items && billData.charges.food_items.length > 0
                ? billData.charges.food_items
                  .filter(item => !item.is_paid) // Only count unpaid items
                  .reduce((sum, item) => sum + (item.amount || 0), 0)
                : 0);

            // Consumables: Show ALL (Complimentary + Payable)
            const allConsumables = billData.charges.consumables_items || [];

            // For Inventory Usage, show all items that were used/issued (including complimentary)
            const payableInventory = billData.charges.inventory_usage?.filter(
              item => item.quantity > 0 || item.is_payable || (item.rental_price && item.rental_price > 0)
            ) || [];

            // Check if there are any food items (paid or unpaid)
            const hasFoodItems = billData.charges.food_items && billData.charges.food_items.length > 0;

            // Calculate room charge breakdown
            const numRooms = billData.room_numbers?.length || 1;
            const stayNights = billData.stay_nights || 1;
            const totalRoomCharges = billData.charges.room_charges || 0;
            const dailyRatePerRoom = totalRoomCharges > 0 && stayNights > 0 && numRooms > 0
              ? totalRoomCharges / (stayNights * numRooms)
              : 0;

            return (
              <div id="bill-details" className="bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden mb-6 animate-fade-in">
                {/* Gradient Header */}
                <div className="bg-gradient-to-r from-indigo-700 to-purple-800 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ClipboardList className="text-indigo-200" size={22} />
                    <h2 className="text-lg font-bold tracking-wide">Detailed Bill & Invoice</h2>
                  </div>
                  <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full font-medium backdrop-blur-sm">
                    Booking Bill
                  </span>
                </div>

                <div className="p-6">
                  {/* Guest Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-start space-x-3">
                      <div className="bg-indigo-50 rounded-lg p-2 text-indigo-600 mt-0.5">
                        <User size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Guest Name</p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">{billData.guest_name}</p>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-start space-x-3">
                      <div className="bg-purple-50 rounded-lg p-2 text-purple-600 mt-0.5">
                        <BedDouble size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Rooms Assigned</p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                          {billData.room_numbers.join(', ')} <span className="text-xs text-gray-400 font-normal">({billData.room_numbers.length} {billData.room_numbers.length === 1 ? 'room' : 'rooms'})</span>
                        </p>
                      </div>
                    </div>

                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-start space-x-3">
                      <div className="bg-emerald-50 rounded-lg p-2 text-emerald-600 mt-0.5">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Stay Period</p>
                        <p className="text-sm font-bold text-gray-800 mt-0.5">{billData.stay_nights} {billData.stay_nights === 1 ? 'night' : 'nights'}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 font-medium">
                          {new Date(billData.check_in).toLocaleDateString()} to {new Date(billData.check_out).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <h3 className="font-bold text-sm text-gray-800 mb-3 uppercase tracking-wider">Itemized Charges</h3>
                    
                    <div className="space-y-3">
                      {billData.charges.room_charges > 0 && (
                        <div className="flex justify-between items-start py-2 border-b border-gray-50">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">Room Charges</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatCurrency(dailyRatePerRoom)}/day × {stayNights} {stayNights === 1 ? 'night' : 'nights'} × {numRooms} {numRooms === 1 ? 'room' : 'rooms'}
                            </p>
                          </div>
                          <span className="font-mono text-sm font-bold text-gray-800">{formatCurrency(billData.charges.room_charges)}</span>
                        </div>
                      )}
                      
                      {billData.charges.package_charges > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-gray-800">Package Charges</span>
                          <span className="font-mono text-sm font-bold text-gray-800">{formatCurrency(billData.charges.package_charges)}</span>
                        </div>
                      )}
                      
                      {hasFoodItems && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <div>
                            <span className="text-sm font-semibold text-gray-800">Food Charges</span>
                            {foodCharges === 0 && billData.charges.food_items.some(item => item.is_paid) && (
                              <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded font-semibold ml-2">All Paid</span>
                            )}
                          </div>
                          <span className="font-mono text-sm font-bold text-gray-800">{formatCurrency(foodCharges)}</span>
                        </div>
                      )}

                      {billData.charges.service_charges > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-gray-800">Service Charges</span>
                          <span className="font-mono text-sm font-bold text-gray-800">{formatCurrency(billData.charges.service_charges)}</span>
                        </div>
                      )}

                      {billData.charges.consumables_charges > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-gray-800">Consumables Charges</span>
                          <span className="font-mono text-sm font-bold text-gray-800">{formatCurrency(billData.charges.consumables_charges)}</span>
                        </div>
                      )}

                      {billData.charges.inventory_charges > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-indigo-700">Inventory/Rental Charges</span>
                          <span className="font-mono text-sm font-bold text-indigo-700">{formatCurrency(billData.charges.inventory_charges)}</span>
                        </div>
                      )}

                      {billData.charges.asset_damage_charges > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-red-700">Asset Damage Charges</span>
                          <span className="font-mono text-sm font-bold text-red-700">{formatCurrency(billData.charges.asset_damage_charges)}</span>
                        </div>
                      )}

                      {enableLateFee && parseFloat(lateFeeAmount) > 0 && (
                        <div className="flex justify-between items-center py-2 border-b border-gray-50">
                          <span className="text-sm font-semibold text-amber-700">Late Checkout Fee</span>
                          <span className="font-mono text-sm font-bold text-amber-700">{formatCurrency(parseFloat(lateFeeAmount))}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Sub-item Details Toggles */}
                  <div className="mt-4 space-y-2">
                    {/* Food Items Collapsible */}
                    {hasFoodItems && (
                      <div className="border border-gray-150 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowFoodDetails(!showFoodDetails)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 transition text-xs font-bold text-gray-700"
                        >
                          <span className="flex items-center gap-2">
                            <Utensils size={14} className="text-indigo-600" />
                            Food & Beverage Details ({billData.charges.food_items.length} items)
                          </span>
                          {showFoodDetails ? <ChevronDown size={16} className="transform rotate-180 transition-transform text-gray-400" /> : <ChevronDown size={16} className="transition-transform text-gray-400" />}
                        </button>
                        {showFoodDetails && (
                          <div className="px-4 py-3 border-t bg-white space-y-1.5 max-h-48 overflow-y-auto">
                            {billData.charges.food_items.map((item, i) => (
                              <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-gray-50 last:border-0 last:pb-0">
                                <span className={item.is_paid ? "text-gray-400 line-through" : "text-gray-600"}>
                                  {item.item_name} <span className="text-gray-400 font-normal">x{item.quantity}</span>
                                </span>
                                <span className="font-mono text-gray-600 font-medium">
                                  {formatCurrency(item.amount)}
                                  {item.is_paid && <span className="ml-1 text-green-600 text-[10px] font-bold font-sans">(Paid)</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Consumables Collapsible */}
                    {allConsumables.length > 0 && (
                      <div className="border border-gray-150 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowConsumables(!showConsumables)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 transition text-xs font-bold text-gray-700"
                        >
                          <span className="flex items-center gap-2">
                            <Package size={14} className="text-indigo-600" />
                            Consumables Breakdown ({allConsumables.length} types)
                          </span>
                          {showConsumables ? <ChevronDown size={16} className="transform rotate-180 transition-transform text-gray-400" /> : <ChevronDown size={16} className="transition-transform text-gray-400" />}
                        </button>
                        {showConsumables && (
                          <div className="px-4 py-3 border-t bg-white space-y-1.5 max-h-48 overflow-y-auto">
                            {allConsumables.map((item, i) => (
                              <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-gray-50 last:border-0 last:pb-0">
                                <span className="text-gray-600">
                                  {item.item_name} <span className="text-gray-400">x{item.actual_consumed}</span>
                                  {item.complimentary_limit > 0 && item.total_charge > 0 && (
                                    <span className="text-[10px] text-gray-400 ml-1">({item.complimentary_limit} Free)</span>
                                  )}
                                </span>
                                <span className={`font-mono font-medium ${item.total_charge === 0 ? "text-green-600 font-bold font-sans" : "text-gray-600"}`}>
                                  {item.total_charge > 0 ? formatCurrency(item.total_charge) : "Complimentary"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Services Collapsible */}
                    {billData.charges.service_items.length > 0 && (
                      <div className="border border-gray-150 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowServices(!showServices)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 transition text-xs font-bold text-gray-700"
                        >
                          <span className="flex items-center gap-2">
                            <ClipboardList size={14} className="text-indigo-600" />
                            Additional Services ({billData.charges.service_items.length} services)
                          </span>
                          {showServices ? <ChevronDown size={16} className="transform rotate-180 transition-transform text-gray-400" /> : <ChevronDown size={16} className="transition-transform text-gray-400" />}
                        </button>
                        {showServices && (
                          <div className="px-4 py-3 border-t bg-white space-y-1.5 max-h-48 overflow-y-auto">
                            {billData.charges.service_items.map((item, i) => (
                              <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-gray-50 last:border-0 last:pb-0">
                                <span className={item.is_paid ? "text-gray-400 line-through" : "text-gray-600"}>
                                  {item.service_name}
                                </span>
                                <span className="font-mono text-gray-600 font-medium">
                                  {formatCurrency(item.charges)}
                                  {item.is_paid && <span className="ml-1 text-green-600 text-[10px] font-bold font-sans">({item.payment_status || "Paid"})</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inventory/Rental Usage Collapsible */}
                    {payableInventory.length > 0 && (
                      <div className="border border-gray-150 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowInventory(!showInventory)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 transition text-xs font-bold text-gray-700"
                        >
                          <span className="flex items-center gap-2">
                            <Package size={14} className="text-indigo-600" />
                            Inventory/Rental Usage ({payableInventory.length} items)
                          </span>
                          {showInventory ? <ChevronDown size={16} className="transform rotate-180 transition-transform text-gray-400" /> : <ChevronDown size={16} className="transition-transform text-gray-400" />}
                        </button>
                        {showInventory && (
                          <div className="px-4 py-3 border-t bg-white space-y-1.5 max-h-48 overflow-y-auto">
                            {payableInventory.map((item, i) => (
                              <div key={i} className="flex justify-between items-start text-xs pb-1.5 border-b border-gray-50 last:border-0 last:pb-0">
                                <div>
                                  <p className="text-gray-600 font-semibold">{item.item_name}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">
                                    Room {item.room_number} • Qty: {item.quantity} {item.unit} • {new Date(item.date).toLocaleDateString()}
                                  </p>
                                </div>
                                <span className="font-mono text-indigo-700 font-semibold">
                                  {formatCurrency(item.rental_charge !== undefined ? item.rental_charge : (item.rental_price * item.quantity))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Asset Damages Collapsible */}
                    {billData.charges.asset_damages && billData.charges.asset_damages.length > 0 && (
                      <div className="border border-red-150 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowDamages(!showDamages)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50/50 hover:bg-red-50 transition text-xs font-bold text-red-700"
                        >
                          <span className="flex items-center gap-2">
                            <AlertTriangle size={14} className="text-red-600" />
                            Asset Damages Reported ({billData.charges.asset_damages.length} incidents)
                          </span>
                          {showDamages ? <ChevronDown size={16} className="transform rotate-180 transition-transform text-red-400" /> : <ChevronDown size={16} className="transition-transform text-red-400" />}
                        </button>
                        {showDamages && (
                          <div className="px-4 py-3 border-t bg-white space-y-1.5 max-h-48 overflow-y-auto">
                            {billData.charges.asset_damages.map((item, i) => (
                              <div key={i} className="flex justify-between items-start text-xs pb-1.5 border-b border-gray-50 last:border-0 last:pb-0">
                                <div>
                                  <p className="text-red-700 font-semibold">{item.item_name}</p>
                                  {item.notes && <p className="text-[10px] text-gray-400 mt-0.5">Note: {item.notes}</p>}
                                </div>
                                <span className="font-mono text-red-600 font-bold">{formatCurrency(item.replacement_cost)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Summary & Totals Invoice Card */}
                  <div className="mt-6 pt-6 border-t border-gray-100 space-y-2 bg-gray-50/40 p-4 rounded-2xl border">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal:</span>
                      <span className="font-mono font-medium">{formatCurrency(getDynamicTotals().subtotal)}</span>
                    </div>

                    {/* GST Breakdown lines */}
                    {billData.charges.room_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Room GST ({
                          gstSettings.gst_room_type === "MANUAL" ? `${gstSettings.room_gst_rate || 12}%` :
                            dailyRatePerRoom < 5000 ? `${gstSettings.gst_slab_rate_1}%` :
                              dailyRatePerRoom <= 7500 ? `${gstSettings.gst_slab_rate_2}%` : `${gstSettings.gst_slab_rate_3}%`
                        }):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.room_gst || 0)}</span>
                      </div>
                    )}
                    
                    {billData.charges.package_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Package GST ({
                          gstSettings.gst_room_type === "MANUAL" ? `${gstSettings.room_gst_rate || 12}%` :
                            (billData.charges.package_charges / (stayNights * numRooms)) < 5000 ? `${gstSettings.gst_slab_rate_1}%` :
                              (billData.charges.package_charges / (stayNights * numRooms)) <= 7500 ? `${gstSettings.gst_slab_rate_2}%` : `${gstSettings.gst_slab_rate_3}%`
                        }):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.package_gst || 0)}</span>
                      </div>
                    )}

                    {billData.charges.food_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Food GST ({resortSettings.food_gst_rate || 5}%):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.food_gst || 0)}</span>
                      </div>
                    )}

                    {billData.charges.service_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Service GST ({resortSettings.service_gst_rate || 5}%):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.service_gst || 0)}</span>
                      </div>
                    )}

                    {billData.charges.consumables_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Consumables GST ({resortSettings.food_gst_rate || 5}%):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.consumables_gst || 0)}</span>
                      </div>
                    )}

                    {billData.charges.inventory_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Inventory GST ({resortSettings.service_gst_rate || 5}%):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.inventory_gst || 0)}</span>
                      </div>
                    )}

                    {billData.charges.asset_damage_gst > 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Damage GST (5%):</span>
                        <span className="font-mono">+{formatCurrency(billData.charges.asset_damage_gst || 0)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm font-semibold text-gray-700">
                      <span>{gstType === 'IGST' ? 'IGST:' : 'CGST:'}</span>
                      <span className="font-mono">+{formatCurrency(gstType === 'IGST' ? getDynamicTotals().totalGST : getDynamicTotals().totalGST / 2)}</span>
                    </div>
                    {gstType !== 'IGST' && (
                      <div className="flex justify-between text-sm font-semibold text-gray-700">
                        <span>SGST:</span>
                        <span className="font-mono">+{formatCurrency(getDynamicTotals().totalGST / 2)}</span>
                      </div>
                    )}
                    
                    {getDynamicTotals().roundOff > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-gray-500">
                        <span>Round Off:</span>
                        <span className="font-mono">+{formatCurrency(getDynamicTotals().roundOff)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm font-bold text-gray-800 border-t border-dashed pt-2 mt-1">
                      <span>Total Bill:</span>
                      <span className="font-mono">{formatCurrency(getDynamicTotals().totalBill)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-semibold">
                        <span>Discount:</span>
                        <span className="font-mono">-{formatCurrency(parseFloat(discount))}</span>
                      </div>
                    )}
                    
                    {getDynamicTotals().advanceDeposit > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                        <span>Advance Paid:</span>
                        <span className="font-mono">-{formatCurrency(getDynamicTotals().advanceDeposit)}</span>
                      </div>
                    )}

                    {/* Net Payable Highlight Banner */}
                    <div className="bg-gradient-to-r from-indigo-700 to-purple-800 text-white rounded-xl p-4 flex items-center justify-between mt-4 shadow-md">
                      <div className="flex items-center space-x-2">
                        <CreditCard size={18} className="text-indigo-200" />
                        <span className="text-sm font-bold">
                          {getDynamicTotals().netPayable >= 0 ? "Net Payable" : "Refund Due"}
                        </span>
                      </div>
                      <span className="text-xl font-black font-mono">
                        {formatCurrency(Math.abs(getDynamicTotals().netPayable))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {billData && (
            <>
              {/* Late Checkout Fee Settings */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4 animate-fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="enable-late-fee"
                      checked={enableLateFee}
                      onChange={(e) => {
                        setEnableLateFee(e.target.checked);
                        if (!e.target.checked) {
                          setLateFeeAmount(0);
                        } else {
                          setLateFeeAmount(billData.charges?.late_checkout_fee || 0);
                        }
                      }}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 cursor-pointer"
                    />
                    <label htmlFor="enable-late-fee" className="text-sm font-semibold text-amber-900 cursor-pointer select-none">
                      Apply Late Checkout Fee
                    </label>
                  </div>
                  {enableLateFee && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-amber-700 font-medium">Amount:</span>
                      <div className="relative rounded-md shadow-sm">
                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-500 text-xs">₹</span>
                        <input
                          type="number"
                          value={lateFeeAmount}
                          onChange={(e) => setLateFeeAmount(e.target.value)}
                          className="w-28 pl-6 pr-2 py-1 text-sm border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 bg-white"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {enableLateFee && billData.charges?.late_checkout_fee > 0 && parseFloat(lateFeeAmount) !== billData.charges.late_checkout_fee && (
                  <p className="text-xs text-amber-600 mt-2 font-medium">
                    * Overriding automatically calculated late checkout fee of {formatCurrency(billData.charges.late_checkout_fee)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="discount" className="block text-sm font-bold text-gray-700 mb-1.5">Discount (₹)</label>
                  <div className="relative rounded-md shadow-sm">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <Percent size={14} />
                    </span>
                    <input
                      type="number"
                      id="discount"
                      value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="payment-method" className="block text-sm font-bold text-gray-700 mb-1.5">Payment Method</label>
                  <div className="relative rounded-md shadow-sm">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <CreditCard size={14} />
                    </span>
                    <select
                      id="payment-method"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm h-[38px]"
                    >
                      <option value="Card">Card</option>
                      <option value="Cash">Cash</option>
                      <option value="Online">Online</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="gst-type" className="block text-sm font-bold text-gray-700 mb-1.5">GST Type</label>
                  <div className="relative rounded-md shadow-sm">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                      <FileText size={14} />
                    </span>
                    <select
                      id="gst-type"
                      value={gstType}
                      onChange={(e) => setGstType(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm h-[38px]"
                    >
                      <option value="CGST_SGST">Intra-State (CGST & SGST)</option>
                      <option value="IGST">Inter-State (IGST)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="pan-number" className="block text-sm font-bold text-gray-700 mb-1.5">Guest PAN Number</label>
                <div className="relative rounded-md shadow-sm">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <FileText size={14} />
                  </span>
                  <input
                    type="text"
                    id="pan-number"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                    placeholder="Enter Guest PAN (e.g. ABCDE1234F) - Optional"
                    maxLength={10}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="gst-number" className="block text-sm font-bold text-gray-700 mb-1.5">Guest GST Number</label>
                <div className="relative rounded-md shadow-sm">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                    <FileText size={14} />
                  </span>
                  <input
                    type="text"
                    id="gst-number"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
                    placeholder="Enter Guest GST Number (e.g. 22AAAAA0000A1Z5) - Optional"
                    maxLength={15}
                  />
                </div>
              </div>
              
              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <button
                    onClick={() => generatePDF('print')}
                    className="flex items-center justify-center gap-1.5 bg-slate-700 text-white py-2 px-3 rounded-lg font-semibold hover:bg-slate-800 transition text-sm shadow-sm"
                  >
                    <Printer size={15} />
                    Print
                  </button>
                  <button
                    onClick={() => generatePDF('download')}
                    className="flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 px-3 rounded-lg font-semibold hover:bg-indigo-700 transition text-sm shadow-sm"
                  >
                    <Download size={15} />
                    Download
                  </button>
                  <button
                    onClick={handleWhatsAppShare}
                    className="flex items-center justify-center gap-1.5 bg-green-600 text-white py-2 px-3 rounded-lg font-semibold hover:bg-green-700 transition text-sm shadow-sm"
                  >
                    <Share2 size={15} />
                    WhatsApp
                  </button>
                  <button
                    onClick={handleEmailShare}
                    className="flex items-center justify-center gap-1.5 bg-blue-600 text-white py-2 px-3 rounded-lg font-semibold hover:bg-blue-700 transition text-sm shadow-sm"
                  >
                    <Mail size={15} />
                    Email
                  </button>
                </div>
                <button
                  onClick={handleCheckout}
                  className="w-full bg-gradient-to-r from-rose-600 to-red-700 text-white py-3 rounded-xl font-bold text-lg hover:from-rose-700 hover:to-red-800 transition duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-md flex items-center justify-center gap-2"
                  disabled={loading}
                >
                  <CheckCircle size={20} />
                  {loading ? "Processing..." : "Complete Checkout & Close Billing"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* All Checkouts Report */}
        <div className="bg-white p-3 sm:p-6 rounded-xl shadow-md w-full max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Completed Checkouts</h2>
              <button
                onClick={() => {
                  setLoading(true);
                  fetchInitialData().finally(() => setLoading(false));
                }}
                className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors"
                title="Refresh Checkouts"
              >
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Showing {filteredCheckouts.length} of {checkouts.length} checkouts</span>
                <button
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <XCircle size={14} />
                  Clear Filters ({activeFiltersCount})
                </button>
              </div>
            )}
          </div>

          {/* Filters Section */}
          <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Filter size={18} className="text-indigo-600" />
              <h3 className="font-semibold text-gray-800">Filters & Search</h3>
            </div>

            {/* General Search */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, guest name, room number, booking ID..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Filter Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Guest Name Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
                <input
                  type="text"
                  value={guestNameFilter}
                  onChange={(e) => setGuestNameFilter(e.target.value)}
                  placeholder="Filter by guest name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Room Number Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Number</label>
                <input
                  type="text"
                  value={roomNumberFilter}
                  onChange={(e) => setRoomNumberFilter(e.target.value)}
                  placeholder="Filter by room number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Booking/Package ID Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Booking/Package ID</label>
                <input
                  type="text"
                  value={bookingIdFilter}
                  onChange={(e) => setBookingIdFilter(e.target.value)}
                  placeholder="Filter by booking ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Payment Method Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                >
                  <option value="All">All Methods</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range and Amount Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {/* From Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Min Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount (₹)</label>
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Max Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount (₹)</label>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="No limit"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="min-w-full text-xs sm:text-sm text-left">
              <thead className="bg-gray-50 border-b-2 border-gray-200 text-gray-800 uppercase tracking-wider">
                <tr>
                  <th className="p-2 sm:p-3">ID</th>
                  <th className="p-2 sm:p-3 hidden sm:table-cell">Guest</th>
                  <th className="p-2 sm:p-3">Rooms</th>
                  <th className="p-2 sm:p-3 hidden lg:table-cell">Booking/Package ID</th>
                  <th className="p-2 sm:p-3 hidden md:table-cell">Payment</th>
                  <th className="p-2 sm:p-3 hidden lg:table-cell">Date</th>
                  <th className="p-2 sm:p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCheckouts.length > 0 ? (
                  filteredCheckouts.map((c) => (
                    <tr key={c.id} className="hover:bg-indigo-50 cursor-pointer" onClick={() => setSelectedCheckout(c)}>
                      <td className="p-2 sm:p-3 font-medium text-gray-800 text-xs sm:text-sm">{c.id}</td>
                      <td className="p-2 sm:p-3 font-semibold text-gray-900 text-xs sm:text-sm hidden sm:table-cell">{c.guest_name}</td>
                      <td className="p-2 sm:p-3 text-gray-800 text-xs sm:text-sm">{c.room_number}</td>
                      <td className="p-2 sm:p-3 text-gray-800 text-xs sm:text-sm hidden lg:table-cell">{c.booking_id || c.package_booking_id || 'N/A'}</td>
                      <td className="p-2 sm:p-3 text-gray-800 text-xs sm:text-sm hidden md:table-cell">{c.payment_method}</td>
                      <td className="p-2 sm:p-3 text-gray-800 text-xs sm:text-sm hidden lg:table-cell">{new Date(c.created_at).toLocaleDateString()}</td>
                      <td className={`p-2 sm:p-3 font-bold text-right text-xs sm:text-sm ${c.grand_total < 0 ? "text-red-600" : "text-gray-900"}`}>
                        {c.grand_total < 0 ? `-${formatCurrency(Math.abs(c.grand_total))}` : formatCurrency(c.grand_total)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="p-4 text-center text-gray-500 text-sm sm:text-base">
                      {activeFiltersCount > 0 ? (
                        <div className="flex flex-col items-center gap-2">
                          <span>No checkouts match your filters.</span>
                          <button
                            onClick={clearAllFilters}
                            className="text-indigo-600 hover:text-indigo-800 underline text-sm"
                          >
                            Clear all filters
                          </button>
                        </div>
                      ) : (
                        "No completed checkouts found."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMoreCheckouts && (
            <div ref={loadMoreRef} className="text-center p-4">
              {isFetchingMore && <span className="text-indigo-600">Loading more checkouts...</span>}
            </div>
          )}
        </div>

        {selectedCheckout && (
          <CheckoutDetailModal 
            checkout={selectedCheckout} 
            onClose={() => setSelectedCheckout(null)} 
            onUpdateSuccess={(updated) => {
              setCheckouts(prev => prev.map(c => c.id === updated.id ? updated : c));
            }}
            resortSettings={resortSettings}
          />
        )}

        {/* Inventory Verification Modal */}
        {checkoutInventoryModal && checkoutInventoryDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Verify Room Inventory</h2>
                  <button
                    onClick={() => {
                      setCheckoutInventoryModal(null);
                      setCheckoutInventoryDetails(null);
                      setActiveRoomTab(0);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                {/* Room Tabs */}
                {checkoutInventoryDetails.room_details && checkoutInventoryDetails.room_details.length > 1 && (
                  <div className="mb-6 border-b border-gray-200">
                    <ul className="flex flex-wrap -mb-px text-sm font-medium text-center" role="tablist">
                      {checkoutInventoryDetails.room_details.map((room, idx) => (
                        <li className="mr-2" role="presentation" key={room.room_number || idx}>
                          <button
                            className={`inline-block p-4 border-b-2 rounded-t-lg transition hover:bg-gray-50 focus:outline-none ${activeRoomTab === idx ? "border-indigo-600 text-indigo-600 font-bold" : "border-transparent text-gray-500 hover:text-gray-600 hover:border-gray-300"}`}
                            onClick={() => {
                              setActiveRoomTab(idx);
                              setVerifiedRoomIndices(prev => new Set([...prev, idx]));
                            }}
                            type="button"
                          >
                            Room {room.room_number} {verifiedRoomIndices.has(idx) && <span className="ml-1 text-green-500">✓</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mb-4 bg-orange-50 border border-orange-200 p-4 rounded-lg">
                  <p className="text-sm text-orange-800 font-medium">
                    Verified {verifiedRoomIndices.size} of {checkoutInventoryDetails.room_details?.length || 1} rooms. 
                    {verifiedRoomIndices.size < (checkoutInventoryDetails.room_details?.length || 1) ? 
                      " Please review all rooms tabs before confirming." : 
                      " All rooms reviewed. You can now confirm the verification."}
                  </p>
                </div>

                {checkoutInventoryDetails.room_details && checkoutInventoryDetails.room_details[activeRoomTab] && (
                  <>
                    {/* Fixed Assets Section */}
                    {checkoutInventoryDetails.room_details[activeRoomTab].fixed_assets && checkoutInventoryDetails.room_details[activeRoomTab].fixed_assets.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-red-700">Fixed Assets Check</h3>
                        <div className="bg-red-50 p-4 rounded-lg border border-red-100 overflow-x-auto">
                          <table className="w-full text-sm min-w-[700px]">
                            <thead>
                              <tr className="border-b border-red-200">
                                <th className="text-left py-2 font-medium text-red-800">Asset Name</th>
                                <th className="text-left py-2 font-medium text-red-800">Serial No.</th>
                                <th className="text-center py-2 font-medium text-red-800">Current</th>
                                <th className="text-center py-2 font-medium text-red-800">Available</th>
                                <th className="text-right py-2 font-medium text-red-800">Cost</th>
                                <th className="text-center py-2 font-medium text-red-800">Damaged?</th>
                                <th className="text-center py-2 font-medium text-red-800">Return?</th>
                                <th className="text-left py-2 font-medium text-red-800">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {checkoutInventoryDetails.room_details[activeRoomTab].fixed_assets.map((asset, idx) => (
                                <tr key={idx} className="border-b border-red-100 last:border-0 hover:bg-red-50 transition-colors">
                                  <td className="py-2 text-gray-800 font-medium whitespace-nowrap">
                                    {asset.item_name}
                                    <div className="text-xs text-gray-500">{asset.asset_tag}</div>
                                  </td>
                                  <td className="py-2 text-gray-600 border-l border-r border-red-100 px-2 font-mono text-xs whitespace-nowrap">
                                    {asset.serial_number || '-'}
                                  </td>
                                  <td className="py-2 text-center text-gray-600">{asset.current_stock}</td>
                                  <td className="py-2 text-center px-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max={asset.current_stock}
                                      className={`w-14 border rounded p-1 text-center font-bold ${asset.available_stock < asset.current_stock ? 'text-red-600 bg-red-50 border-red-300' : 'text-green-600 border-gray-300'}`}
                                      value={asset.available_stock}
                                      onChange={(e) => handleUpdateAssetDamage(idx, 'available_stock', parseInt(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="py-2 text-right text-gray-600 font-medium whitespace-nowrap">
                                    {formatCurrency(asset.replacement_cost)}
                                  </td>
                                  <td className="py-2 text-center px-2">
                                    <div className="flex items-center justify-center space-x-2">
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                                        checked={asset.is_damaged === true}
                                        onChange={(e) => handleUpdateAssetDamage(idx, 'is_damaged', e.target.checked)}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 text-center px-2">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                      checked={asset.is_returned === true}
                                      onChange={(e) => handleUpdateAssetDamage(idx, 'is_returned', e.target.checked)}
                                    />
                                  </td>
                                  <td className="py-2 pl-2">
                                    <input
                                      type="text"
                                      className="w-full border border-gray-300 rounded p-1 text-sm bg-white"
                                      placeholder="Notes..."
                                      value={asset.damage_notes || ''}
                                      onChange={(e) => handleUpdateAssetDamage(idx, 'damage_notes', e.target.value)}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Consumables Section */}
                    {checkoutInventoryDetails.room_details[activeRoomTab].items && checkoutInventoryDetails.room_details[activeRoomTab].items.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 text-indigo-700">Consumables Check</h3>
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 overflow-x-auto">
                          <table className="w-full text-sm min-w-[700px]">
                            <thead>
                              <tr className="border-b border-indigo-200">
                                <th className="text-left py-2 font-medium text-indigo-800">Item</th>
                                <th className="text-center py-2 font-medium text-indigo-800">Current</th>
                                <th className="text-center py-2 font-medium text-indigo-800">Available</th>
                                <th className="text-center py-2 font-medium text-indigo-800">Damaged</th>
                                <th className="text-center py-2 font-medium text-indigo-800">Used/Miss</th>
                                <th className="text-center py-2 font-medium text-indigo-800">Return?</th>
                                <th className="text-left py-2 font-medium text-indigo-800">Return Loc.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {checkoutInventoryDetails.room_details[activeRoomTab].items.map((item, idx) => {
                                const isDiscreteUnit = ['pcs', 'pc', 'can', 'bottle', 'unit', 'nos', 'number', 'pkt', 'pack', 'box', 'tray', 'piece', 'pieces'].includes((item.unit || 'pcs').toLowerCase());
                                return (
                                  <tr key={idx} className="border-b border-indigo-100 last:border-0 hover:bg-indigo-50 transition-colors">
                                    <td className="py-3 text-gray-800 font-medium whitespace-nowrap">
                                      {item.item_name}
                                      <div className="text-xs text-gray-500">{item.unit || 'pcs'} | {formatCurrency(item.rental_price || item.unit_price)}</div>
                                      {item.is_rentable && <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded border border-blue-200 shrink-0 whitespace-nowrap">Rental</span>}
                                    </td>
                                    <td className="py-3 text-center font-medium text-gray-700">{item.current_stock}</td>
                                    <td className="py-3 text-center px-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={item.current_stock}
                                        step={isDiscreteUnit ? "1" : "0.01"}
                                        className={`w-16 border rounded p-1 text-center font-bold shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${item.available_stock < item.current_stock ? 'text-orange-600 bg-orange-50 border-orange-300' : 'text-green-600 border-gray-300'}`}
                                        value={item.available_stock}
                                        onChange={(e) => handleUpdateInventoryVerification(idx, 'available_stock', e.target.value)}
                                      />
                                    </td>
                                    <td className="py-3 text-center px-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max={Math.max(0, item.current_stock - (item.available_stock || 0))}
                                        step={isDiscreteUnit ? "1" : "0.01"}
                                        className="w-16 border border-gray-300 rounded p-1 text-center font-medium shadow-sm focus:ring-1 focus:ring-red-500 text-red-600 bg-red-50"
                                        value={item.damage_qty || 0}
                                        onChange={(e) => handleUpdateInventoryVerification(idx, 'damage_qty', e.target.value)}
                                      />
                                    </td>
                                    <td className="py-3 text-center whitespace-nowrap">
                                      {item.is_rentable ? (
                                        <div className="font-bold text-red-600">Miss: {item.missing_qty || 0}</div>
                                      ) : (
                                        <div className="font-bold text-orange-600">Used: {item.used_qty || 0}</div>
                                      )}
                                    </td>
                                    <td className="py-3 text-center">
                                      <input
                                        type="checkbox"
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        checked={item.is_returned === true}
                                        onChange={(e) => {
                                          const updatedDetails = { ...checkoutInventoryDetails };
                                          const room = updatedDetails.room_details[activeRoomTab];
                                          const newItems = [...room.items];
                                          newItems[idx] = { ...newItems[idx], is_returned: e.target.checked };
                                          room.items = newItems;
                                          setCheckoutInventoryDetails(updatedDetails);
                                        }}
                                      />
                                    </td>
                                    <td className="py-3 pl-2 min-w-[140px]">
                                      <select
                                        className="w-full border border-gray-300 rounded p-1.5 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                                        value={item.return_location_id || ""}
                                        onChange={(e) => handleUpdateReturnLocation(idx, e.target.value)}
                                      >
                                        <option value="">Move to (Optional)</option>
                                        {returnLocations.map(loc => (
                                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="mt-8 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-4 bg-gray-50 p-2 rounded">
                    <strong>Note:</strong> Items marked as missing or damaged will add charges to the final bill. Stock marked manually as used (for extra issue consumables) adds charges dynamically based on your issue price settings.
                  </p>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Audit Notes (Optional)
                  </label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 p-2 text-sm"
                    rows="2"
                    placeholder="Enter any remarks for the checkout..."
                    id="inventoryVerifyNotes"
                  ></textarea>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
                <div className="text-sm text-gray-600 font-medium">
                  {checkoutInventoryDetails.room_details && checkoutInventoryDetails.room_details.length > 1 && (
                    <span>
                      {activeRoomTab < checkoutInventoryDetails.room_details.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => setActiveRoomTab(prev => prev + 1)}
                          className="text-indigo-600 hover:text-indigo-800 font-bold underline"
                        >
                          Next: Room {checkoutInventoryDetails.room_details[activeRoomTab + 1].room_number} &rarr;
                        </button>
                      ) : (
                        <span className="text-green-600 font-bold">✓ All rooms reviewed</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutInventoryModal(null);
                      setCheckoutInventoryDetails(null);
                      setActiveRoomTab(0);
                    }}
                    className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSubmitInventoryCheck(document.getElementById('inventoryVerifyNotes')?.value)}
                    disabled={checkingInventory || (checkoutInventoryDetails?.room_details?.length > 1 && verifiedRoomIndices.size < checkoutInventoryDetails.room_details.length)}
                    className={`inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${checkingInventory || (checkoutInventoryDetails?.room_details?.length > 1 && verifiedRoomIndices.size < checkoutInventoryDetails.room_details.length) ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'}`}
                  >
                    {checkingInventory ? 'Verifying...' : 'Confirm Verification'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout >
  );
};



export default Billing;
