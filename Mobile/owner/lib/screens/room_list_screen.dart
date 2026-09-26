import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/room_provider.dart';
import '../providers/package_provider.dart';
import '../providers/booking_provider.dart';
import '../models/room.dart';
import '../models/booking.dart';
import '../models/package.dart';
import 'room_history_screen.dart';
import 'package_detail_screen.dart';
import '../config/constants.dart';

class RoomListScreen extends StatefulWidget {
  const RoomListScreen({super.key});

  @override
  State<RoomListScreen> createState() => _RoomListScreenState();
}

class _RoomListScreenState extends State<RoomListScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  
  @override
  void initState() {
    super.initState();
    // Tabs: All, Vacant, Occupied, Clean, Dirty, Maintenance, Packages
    _tabController = TabController(length: 7, vsync: this);
    Future.microtask(() {
      Provider.of<RoomProvider>(context, listen: false).fetchRooms();
      Provider.of<BookingProvider>(context, listen: false).fetchBookings();
      Provider.of<PackageProvider>(context, listen: false).fetchPackages();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  List<Room> _filterRooms(List<Room> rooms, int tabIndex, String query) {
    List<Room> filtered = rooms;

    // Filter by Tab
    switch (tabIndex) {
      case 1: // Vacant (Available)
        filtered = rooms.where((r) => r.status.toLowerCase() == 'available').toList();
        break;
      case 2: // Occupied (includes checked-in, occupied, and booked)
        filtered = rooms.where((r) => 
          r.status.toLowerCase() == 'occupied' || 
          r.status.toLowerCase() == 'booked' ||
          r.status.toLowerCase() == 'checked-in' ||
          r.status.toLowerCase().replaceAll(' ', '-') == 'checked-in'
        ).toList();
        break;
      case 3: // Clean
        filtered = rooms.where((r) => r.housekeepingStatus.toLowerCase() == 'clean').toList();
        break;
      case 4: // Dirty
        filtered = rooms.where((r) => r.housekeepingStatus.toLowerCase() == 'dirty').toList();
        break;
      case 5: // Maintenance
         filtered = rooms.where((r) => r.status.toLowerCase() == 'maintenance').toList();
         break;
    }

    // Filter by Search
    if (query.isNotEmpty) {
      filtered = filtered.where((r) => 
        r.roomNumber.toLowerCase().contains(query.toLowerCase())
      ).toList();
    }
    
    return filtered;
  }

  Booking? _findActiveBooking(String roomNumber, List<Booking> bookings) {
    try {
      return bookings.firstWhere((b) => 
        b.roomNumber == roomNumber && 
        (b.status.toLowerCase() == 'checked-in' || b.status.toLowerCase() == 'confirmed' || b.status.toLowerCase() == 'booked')
      );
    } catch (e) {
      return null;
    }
  }
  
  String _getImageUrl(String? path) {
    if (path == null || path.isEmpty) return 'https://placehold.co/400x300/e2e8f0/a0aec0?text=No+Image';
    if (path.startsWith('http')) return path;
    
    String baseUrl = AppConstants.baseUrl;
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.replaceAll('/api', '');
    }
    if (path.startsWith('/')) {
      return '$baseUrl$path';
    }
    return '$baseUrl/$path';
  }

  @override
  Widget build(BuildContext context) {
    final roomProvider = Provider.of<RoomProvider>(context);
    final bookingProvider = Provider.of<BookingProvider>(context);
    final packageProvider = Provider.of<PackageProvider>(context);

    bool isPackageTab = _tabController.index == 6;

    // KPI Calc
    final total = roomProvider.rooms.length;
    final available = roomProvider.rooms.where((r) => r.status.toLowerCase() == 'available').length;
    final occupiedRooms = roomProvider.rooms.where((r) => r.status.toLowerCase() == 'occupied' || r.status.toLowerCase() == 'booked' || r.status.toLowerCase() == 'checked-in');
    final occupied = occupiedRooms.length;
    final maintenance = roomProvider.rooms.where((r) => r.status.toLowerCase() == 'maintenance').length;
    final dirtyRooms = roomProvider.rooms.where((r) => r.housekeepingStatus.toLowerCase() == 'dirty');
    final dirty = dirtyRooms.length;
    final clean = roomProvider.rooms.where((r) => r.housekeepingStatus.toLowerCase() == 'clean').length;
    
    // RevPAR Estimate (Occupied Room Price Sum / Total Rooms)
    double revenueToday = occupiedRooms.fold(0, (sum, r) => sum + r.price);
    // Add checked-in bookings revenue? Room price is a proxy.
    double revPar = total > 0 ? revenueToday / total : 0;
    
    // Turnover
    double turnoverProgress = (clean + dirty) > 0 ? clean / (clean + dirty) : 1.0;

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF8FAFC),
        elevation: 0,
        scrolledUnderElevation: 0,
        title: const Text(
          'Room Operations',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: Color(0xFF064E3B),
            letterSpacing: -0.5,
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TabBar(
                controller: _tabController,
                isScrollable: true,
                indicator: BoxDecoration(
                  color: const Color(0xFF064E3B).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: const Color(0xFF064E3B).withOpacity(0.2),
                    width: 1,
                  ),
                ),
                indicatorSize: TabBarIndicatorSize.tab,
                labelColor: const Color(0xFF064E3B),
                unselectedLabelColor: const Color(0xFF64748B),
                labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                dividerColor: Colors.transparent,
                onTap: (index) => setState(() {}),
                tabs: const [
                  Tab(text: 'All'),
                  Tab(text: 'Vacant'),
                  Tab(text: 'Occupied'),
                  Tab(text: 'Clean'),
                  Tab(text: 'Dirty'),
                  Tab(text: 'Maint.'),
                  Tab(text: 'Packages'),
                ],
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // KPI Section (Horizontal Scroll)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Row(
              children: [
                _buildKpiCard('RevPAR', '₹${revPar.toStringAsFixed(0)}', Colors.purple),
                _buildTurnoverCard(clean, dirty),
                _buildKpiCard('Total', total.toString(), Colors.blue),
                _buildKpiCard('Available', available.toString(), Colors.green),
                _buildKpiCard('Occupied', occupied.toString(), Colors.red),
                _buildKpiCard('Maint.', maintenance.toString(), Colors.grey),
              ],
            ),
          ),
          
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.01),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  )
                ],
              ),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B)),
                decoration: InputDecoration(
                  hintText: 'Search Room Number...',
                  hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                  prefixIcon: const Icon(Icons.search_rounded, color: Color(0xFF64748B), size: 18),
                  filled: true,
                  fillColor: Colors.white,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 1.2),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: Color(0xFFE2E8F0), width: 1.2),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: const BorderSide(color: Color(0xFF064E3B), width: 1.5),
                  ),
                ),
                onChanged: (val) => setState(() {}),
              ),
            ),
          ),
          
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.65, // Adjusted to prevent layout overflow with badges
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: isPackageTab 
                  ? packageProvider.packages.length 
                  : _filterRooms(roomProvider.rooms, _tabController.index, _searchController.text).length,
              itemBuilder: (context, index) {
                if (isPackageTab) {
                    return _buildPackageCard(packageProvider.packages[index]);
                } else {
                    final room = _filterRooms(roomProvider.rooms, _tabController.index, _searchController.text)[index];
                    final activeBooking = _findActiveBooking(room.roomNumber, bookingProvider.bookings);
                    return _buildRoomCard(room, activeBooking);
                }
              },
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildTurnoverCard(int clean, int dirty) {
     int total = clean + dirty;
     double progress = total > 0 ? clean / total : 1.0;
     
     return Container(
       margin: const EdgeInsets.only(right: 12),
       padding: const EdgeInsets.all(12),
       decoration: BoxDecoration(
         color: Colors.white,
         borderRadius: BorderRadius.circular(16), 
         border: Border.all(color: const Color(0xFFE2E8F0), width: 1.2),
         boxShadow: [
           BoxShadow(
             color: Colors.black.withOpacity(0.01),
             blurRadius: 4,
             offset: const Offset(0, 2),
           )
         ],
       ),
       width: 145,
       child: Column(
         crossAxisAlignment: CrossAxisAlignment.start,
         children: [
            const Text(
              "TURNOVER", 
              style: TextStyle(
                color: Color(0xFF64748B), 
                fontSize: 8.5, 
                fontWeight: FontWeight.bold, 
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                 Text(
                   "$clean/$total Clean", 
                   style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: Color(0xFF0F172A)),
                 ),
                 Text(
                   "${(progress * 100).toInt()}%", 
                   style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF10B981)),
                 ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(3),
              child: LinearProgressIndicator(
                value: progress, 
                backgroundColor: const Color(0xFFF1F5F9), 
                color: const Color(0xFF064E3B), 
                minHeight: 5,
              ),
            ),
         ],
       ),
     );
  }

  Widget _buildKpiCard(String title, String value, Color color) {
    return Container(
      margin: const EdgeInsets.only(right: 12),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.01),
            blurRadius: 4,
            offset: const Offset(0, 2),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(), 
            style: const TextStyle(
              fontSize: 8.5, 
              fontWeight: FontWeight.bold, 
              color: Color(0xFF64748B),
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value, 
            style: TextStyle(
              fontSize: 18, 
              fontWeight: FontWeight.w800, 
              color: color == Colors.purple ? const Color(0xFF064E3B) : color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRoomImage(String? imageUrl) {
    final hasImage = imageUrl != null && imageUrl.isNotEmpty && !imageUrl.contains('placehold.co');
    if (!hasImage) {
      return Container(
        height: 100,
        width: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF064E3B), Color(0xFF042F2E)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Opacity(
              opacity: 0.15,
              child: Image.network(
                'https://images.unsplash.com/photo-1540518614846-7eded433c457?q=80&w=2070&auto=format&fit=crop',
                fit: BoxFit.cover,
                width: double.infinity,
                height: 100,
              ),
            ),
            const Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.local_florist_rounded, 
                  color: Color(0xFFC5A880), 
                  size: 24,
                ),
                SizedBox(height: 4),
                Text(
                  'STAYONE',
                  style: TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFC5A880),
                    letterSpacing: 1.5,
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    }

    return Container(
      height: 100,
      width: double.infinity,
      color: Colors.grey[100],
      child: Image.network(
        _getImageUrl(imageUrl),
        fit: BoxFit.cover,
        errorBuilder: (c, o, s) => _buildRoomImage(null),
      ),
    );
  }

  Widget _buildRoomCard(Room room, Booking? booking) {
    Color statusColor = Colors.grey;
    if (room.status.toLowerCase() == 'available') statusColor = const Color(0xFF064E3B);
    if (room.status.toLowerCase() == 'occupied' || room.status.toLowerCase() == 'booked' || room.status.toLowerCase() == 'checked-in') statusColor = const Color(0xFFDC2626);
    if (room.status.toLowerCase() == 'maintenance') statusColor = const Color(0xFFC5A880);
    
    bool isDirty = room.housekeepingStatus.toLowerCase() == 'dirty';
    
    String? statusInfo;
    if (isDirty && room.housekeepingUpdatedAt != null) {
       try {
         final diff = DateTime.now().difference(DateTime.parse(room.housekeepingUpdatedAt!));
         statusInfo = "Dirty for ${diff.inHours}h ${diff.inMinutes % 60}m";
       } catch (e) {}
    } else if (room.status == 'Maintenance' && room.lastMaintenanceDate != null) {
       statusInfo = "Last Service: ${room.lastMaintenanceDate}";
    }
    
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: isDirty ? const Color(0xFFEF4444) : const Color(0xFFE2E8F0), 
          width: isDirty ? 1.5 : 1.2,
        ),
      ),
      color: Colors.white,
      child: InkWell(
        onTap: () {
           Navigator.push(context, MaterialPageRoute(builder: (_) => RoomHistoryScreen(room: room)));
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image Section
            Stack(
              children: [
                _buildRoomImage(room.imageUrl),
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                     padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                     decoration: BoxDecoration(
                       color: statusColor,
                       borderRadius: BorderRadius.circular(10),
                     ),
                     child: Text(
                       room.status.toUpperCase(),
                       style: const TextStyle(
                         color: Colors.white, 
                         fontSize: 8.5, 
                         fontWeight: FontWeight.bold,
                         letterSpacing: 0.3,
                       ),
                     ),
                  ),
                )
              ],
            ),
            
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          room.roomNumber,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF0F172A)),
                        ),
                        Text(
                          '₹${room.price.toStringAsFixed(0)}',
                           style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF064E3B)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      room.type, 
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    
                    // Capacity
                    Row(
                      children: [
                        const Icon(Icons.people_outline_rounded, size: 13, color: Color(0xFF64748B)),
                        const SizedBox(width: 4),
                        Text(
                          '${room.adults}A, ${room.children}C Limit', 
                          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                    
                    const Spacer(),
                    
                    // Features
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (room.wifi) _buildFeatureIcon(Icons.wifi_rounded),
                        if (room.airConditioning) _buildFeatureIcon(Icons.ac_unit_rounded),
                        if (room.tv) _buildFeatureIcon(Icons.tv_rounded),
                      ],
                    ),
                     
                    const SizedBox(height: 8),

                    // Dirty Status or Guest Name
                    if (booking != null) 
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF064E3B).withOpacity(0.06), 
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF064E3B).withOpacity(0.12), width: 1),
                        ),
                        child: Row(
                          children: [
                             const Icon(Icons.person_outline_rounded, size: 11, color: Color(0xFF064E3B)),
                             const SizedBox(width: 4),
                             Expanded(
                               child: Text(
                                 booking.guestName, 
                                 style: const TextStyle(fontSize: 9.5, color: Color(0xFF064E3B), fontWeight: FontWeight.bold), 
                                 overflow: TextOverflow.ellipsis,
                               ),
                             ),
                          ],
                        ),
                      )
                    else if (statusInfo != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isDirty ? const Color(0xFFEF4444).withOpacity(0.06) : const Color(0xFF64748B).withOpacity(0.06), 
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: isDirty ? const Color(0xFFEF4444).withOpacity(0.12) : const Color(0xFF64748B).withOpacity(0.12), width: 1),
                        ),
                        child: Row(
                          children: [
                             Icon(
                               isDirty ? Icons.timer_outlined : Icons.build_circle_outlined, 
                               size: 11, 
                               color: isDirty ? const Color(0xFFEF4444) : const Color(0xFF64748B),
                             ),
                             const SizedBox(width: 4),
                             Expanded(
                               child: Text(
                                 statusInfo!, 
                                 style: TextStyle(
                                   fontSize: 9.5, 
                                   color: isDirty ? const Color(0xFFEF4444) : const Color(0xFF64748B),
                                   fontWeight: FontWeight.bold,
                                 ),
                                 overflow: TextOverflow.ellipsis,
                               ),
                             ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildFeatureIcon(IconData icon) {
     return Icon(icon, size: 13, color: const Color(0xFF64748B));
  }

  Widget _buildPackageCard(Package package) {
    return Card(
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFFE2E8F0), width: 1.2),
      ),
      color: Colors.white,
      child: InkWell(
        onTap: () {
           Navigator.push(context, MaterialPageRoute(builder: (_) => PackageDetailScreen(package: package)));
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 100,
              width: double.infinity,
              color: const Color(0xFF064E3B).withOpacity(0.05),
              child: package.imageUrls.isNotEmpty 
                  ? Image.network(_getImageUrl(package.imageUrls[0]), fit: BoxFit.cover, errorBuilder: (_,__,___) => const Icon(Icons.broken_image))
                  : const Icon(Icons.redeem_rounded, size: 36, color: Color(0xFF064E3B)),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      package.title, 
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Color(0xFF0F172A)), 
                      maxLines: 1, 
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      package.description ?? '', 
                      style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontWeight: FontWeight.w500), 
                      maxLines: 2, 
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                         Container(
                           padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                           decoration: BoxDecoration(
                             color: const Color(0xFFC5A880).withOpacity(0.12),
                             borderRadius: BorderRadius.circular(8),
                           ),
                           child: Text(
                             "${package.maxStayDays} Days", 
                             style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.bold, color: Color(0xFFC5A880)),
                           ),
                         ),
                         Text(
                           '₹${package.price.toStringAsFixed(0)}', 
                           style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF064E3B), fontSize: 14),
                         ),
                      ],
                    )
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
