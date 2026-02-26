# Onway - تطبيق توصيل الطلبات

## Overview
تطبيق توصيل وتسوق محلي احترافي للهواتف المحمولة (iOS و Android) باستخدام React Native و Expo. يتيح للمستخدمين تصفح وطلب المنتجات من أقسام متعددة داخل المدينة.

## Tech Stack
- **Frontend**: React Native (Expo) with TypeScript
- **Backend**: Node.js + Express
- **State Management**: React Context (CartContext, OrderContext, AuthContext)
- **Navigation**: React Navigation 7+ with Bottom Tabs
- **Styling**: RTL Arabic support with Tajawal font
- **Images**: expo-image with lazy loading

## Project Structure
```
client/
├── App.tsx                 # Main app entry with providers
├── components/             # Reusable UI components
│   ├── BannerSlider.tsx   # Auto-sliding banner carousel (4s interval)
│   ├── OfferBanner.tsx    # Static offer banner with CTA
│   ├── CategoryCard.tsx   # Category grid card with lazy loading
│   ├── ProductCard.tsx    # Product listing card
│   ├── CartItemCard.tsx   # Cart item with quantity controls
│   ├── OrderCard.tsx      # Order history card
│   ├── SearchBar.tsx      # Search input component
│   └── EmptyState.tsx     # Empty state illustration
├── constants/
│   ├── theme.ts           # Design system, colors, typography
│   ├── categories.ts      # 10 categories and products data
│   └── currency.ts        # Iraqi Dinar formatting
├── context/
│   ├── AuthContext.tsx    # Phone authentication state
│   ├── CartContext.tsx    # Shopping cart state
│   └── OrderContext.tsx   # Orders state
├── navigation/
│   ├── RootStackNavigator.tsx
│   ├── MainTabNavigator.tsx
│   └── [Tab]StackNavigator.tsx
└── screens/
    ├── PhoneLoginScreen.tsx # Phone number login
    ├── HomeScreen.tsx       # Banners & 5-column category grid
    ├── CategoriesScreen.tsx # 2-column grid of all categories
    ├── ProductsScreen.tsx
    ├── CartScreen.tsx
    ├── CheckoutScreen.tsx
    ├── OrdersScreen.tsx
    ├── ProfileScreen.tsx
    └── AdminScreen.tsx      # Admin panel for content management

server/
├── index.ts               # Express server setup
├── routes.ts              # API routes with multer for uploads
├── firebase.ts            # Firebase Firestore configuration
└── storage.ts             # Data storage (fallback)
```

## Key Features
- **Arabic RTL UI**: Full right-to-left support with Arabic fonts
- **Phone Authentication**: Iraqi phone number login (00964xxx or 07xxx)
- **5 Tab Navigation**: الرئيسية، الأقسام، السلة، الطلبات، الحساب
- **10 Product Categories**: Modern grocery-style grid layout
- **Dynamic Banners**: Offer banner + auto-sliding carousel
- **Admin Panel**: Manage banners and categories with image upload
- **Shopping Cart**: Add/remove items, quantity controls
- **Order History**: View past orders with status tracking

## Categories (10 Total)
خضروات وفواكه، لحوم ودواجن، مخبوزات، ألبان وبيض، مواد غذائية، مشروبات، حلويات ووجبات خفيفة، منظفات وعناية، مستلزمات الأطفال، إلكترونيات وخدمات

## Currency & Locale
- **Currency**: Iraqi Dinar (د.ع)
- **Phone Format**: 009647xxxxxxxxx or 07xxxxxxxxx
- **Number Format**: Arabic numerals (٣٥٬٠٠٠)

## Design System (Talabaty-inspired)
```
Primary Color: #ff7a00 (vibrant orange)
Secondary Color: #fff3e6 (soft orange background)
Text Primary: #222222
Text Secondary: #666666
Card Background: #ffffff

Screen Padding: 16px
Grid Gap: 14px
Border Radius: 16px (cards), 18px (banners)

Category Card: 160x140px
Category Image: 72px
Banner Height: 160px

Font Family: Cairo, Tajawal
Font Sizes: Title 16px, Category 14px, Small 12px
```

## API Endpoints
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get single category
- `GET /api/banners` - Get active banners
- `GET /api/admin/banners` - Get all banners (admin)
- `POST /api/admin/banners` - Create banner (JSON with Base64 image)
- `PUT /api/admin/banners/:id` - Update banner
- `DELETE /api/admin/banners/:id` - Delete banner
- `POST /api/admin/categories` - Create category (JSON with Base64 image)
- `PUT /api/admin/categories/:id` - Update category (JSON with Base64 image)
- `DELETE /api/admin/categories/:id` - Delete category
- `POST /api/admin/products` - Create product (JSON with Base64 image)
- `PUT /api/admin/products/:id` - Update product (JSON with Base64 image)
- `DELETE /api/admin/products/:id` - Delete product
- `GET /api/orders` - Get orders (optional ?phoneNumber= filter)
- `GET /api/admin/orders` - Get all orders (admin)
- `POST /api/orders` - Create new order
- `PUT /api/admin/orders/:id/status` - Update order status
- `POST /api/users` - Create/update user profile (JSON with Base64 profileImage)

## Running the App
1. Backend runs on port 5000
2. Expo dev server runs on port 8081
3. Scan QR code with Expo Go to test on mobile device
4. Web preview available at localhost:8081

## Authentication
- Phone number login screen (orange background)
- Validates Iraqi phone formats (00964xxx or 07xxx)
- Stores auth state in AsyncStorage
- Shows login screen on first launch

## Admin Panel
- Access via Profile > لوحة التحكم
- Five tabs: البانرات، الأقسام، المنتجات، مناطق التوصيل، الطلبات
- Image upload using expo-image-picker
- CRUD operations for banners, categories, products, and delivery areas
- Banner types: "offer" (static top) and "slider" (carousel)
- Order status workflow: pending → confirmed → preparing → delivering → delivered (with cancel option)
- Orders connected to Firestore 'orders' collection

## Firebase Firestore Integration
- User data (profiles) are stored in Firebase Firestore 'users' collection
- Profile images are compressed to 200x200px, converted to Base64 strings, and stored directly in Firestore's 'profileImage' field
- This approach avoids Firebase Storage billing requirements
- Required secret: FIREBASE_SERVICE_ACCOUNT (JSON string of Firebase service account credentials)
- Falls back to in-memory storage if Firebase is not configured

### Image Handling (Base64 Strategy)
All images are compressed and stored as Base64 strings to avoid Firebase Storage costs:

**Size Configuration:**
- Profile images: 200x200px, 60% quality
- Product images: 400px width, 70% quality
- Banner images: 800px width, 70% quality  
- Category images: 300px width, 70% quality

**Implementation:**
- Compressed using expo-image-manipulator
- Converted to Base64 data URI format: `data:image/jpeg;base64,...`
- Stored directly in Firestore document (no Firebase Storage needed)
- All API endpoints accept JSON body with Base64 image strings
- UI components use getImageUrl() helper that detects Base64, HTTP URLs, or local paths
- Utility functions in `client/lib/imageUtils.ts`

### Backend (Admin SDK)
- Uses Firebase Admin SDK for full database access
- Configured in `server/firebase.ts`
- Handles user creation, updates, and queries

### Frontend (Client SDK)
- Firebase client SDK configured in `client/lib/firebase.ts`
- Project: onway-74c20
- Used for reading user profiles from Firestore
- API endpoints use Admin SDK for writes (more secure)

## Recent Changes
- February 2026: Updated design system to Talabaty-inspired theme
- Primary color changed to #ff5e00
- Categories reduced to 10 essential ones
- Added OfferBanner and BannerSlider components
- Added AdminScreen for content management
- HomeScreen: 5-column category grid with 14px gap
- CategoriesScreen: 2-column grid layout
- Banner dimensions: 160px height, 18px radius
- Category cards: 160x140px with 72px images
- Added full product search functionality
- Added PolicyScreen (سياسة الخصوصية)
- Added AboutScreen (من نحن وتواصل معنا)
- Added TermsScreen (الشروط والأحكام)
- Added FAQScreen (الأسئلة الشائعة)
- Added NotificationsScreen (إدارة الإشعارات)
- Added AddressesScreen (العناوين المحفوظة)
- Added PaymentScreen (طرق الدفع)
- All profile settings buttons are now functional
- Added dark mode toggle in profile settings
- Added flowers category (محلات الزهور) with 12 products
- **February 2026: Implemented comprehensive Base64 image strategy**
  - All images (profile, products, categories, banners) stored as Base64 in Firestore
  - Eliminates Firebase Storage billing requirement (app works for free)
  - Size-specific compression for each image type
  - Updated all UI components to render Base64 images correctly
  - Server endpoints converted from FormData to JSON with Base64
- **February 2026: Push Notifications for Order Status Updates**
  - Customers receive push notifications when order status changes
  - Notification messages in Arabic for each status: confirmed, preparing, delivering, delivered, cancelled
  - Push tokens stored in Firestore user profiles (pushToken field)
  - Uses Expo Push API for sending notifications
  - Sound alerts enabled for all notifications
  - Works on physical devices via Expo Go (not on web)
- **February 2026: Promotional Sections Admin Management**
  - Admin can manage 3 promotional sections: الأكثر مبيعاً (Best Sellers), المنتجات المتميزة (Featured), التخفيضات المميزة (Discounts)
  - Each section allows selecting products from the product list
  - Sections stored in Firestore 'promotionalSections' collection
  - HomeScreen displays products from admin-selected sections
  - Fallback to random products if no section is configured
  - API: GET /api/promotional-sections, PUT /api/admin/promotional-sections/:type
- **February 2026: Categories Firestore Integration**
  - Categories now stored in Firestore 'categories' collection
  - Added new "أشهر المطاعم" (Famous Restaurants) category with 5 sample products
  - Added bulk sample products to all 12 categories (50+ products total)
  - Categories: خضروات وفواكه، لحوم، ألبان، منظفات، مشروبات، عصائر، سناكس، شاي وقهوة، مستلزمات أطفال، هدايا وورود، خدمات المندوب، أشهر المطاعم
  - Default categories auto-initialized on first run
- **February 2026: Driver & Owner Earnings System**
  - Category-based driver earnings: Restaurant orders = 1000 IQD, other categories = 1500 IQD
  - Owner earnings = deliveryFee - driverEarning (minimum 0)
  - Admin panel owner earnings dashboard with 3 statistics cards: App Profits, Driver Earnings, Total Delivery Fees
  - Retroactive earnings calculation for orders delivered before the system was implemented
  - Driver earnings screen shows driverEarning per order with restaurant/delivery labels
  - Admin orders table includes driver name column
  - Order detail modal shows earnings breakdown (driver earning vs app earning)
  - API: GET /api/admin/owner-earnings, GET /api/driver/earnings?phoneNumber=
