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
└── storage.ts             # Data storage
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
- `POST /api/admin/banners` - Create banner with image upload
- `PUT /api/admin/banners/:id` - Update banner
- `DELETE /api/admin/banners/:id` - Delete banner
- `POST /api/admin/categories` - Create category with image
- `PUT /api/admin/categories/:id` - Update category
- `DELETE /api/admin/categories/:id` - Delete category

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
- Two tabs: البانرات (banners) and الأقسام (categories)
- Image upload using expo-image-picker
- CRUD operations for banners and categories
- Banner types: "offer" (static top) and "slider" (carousel)

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
