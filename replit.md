# Onway - تطبيق توصيل الطلبات

## Overview
تطبيق توصيل وتسوق محلي احترافي للهواتف المحمولة (iOS و Android) باستخدام React Native و Expo. يتيح للمستخدمين تصفح وطلب المنتجات من أقسام متعددة داخل المدينة.

## Tech Stack
- **Frontend**: React Native (Expo) with TypeScript
- **Backend**: Node.js + Express
- **State Management**: React Context (CartContext, OrderContext)
- **Navigation**: React Navigation 7+ with Bottom Tabs
- **Styling**: RTL Arabic support with Tajawal font
- **Images**: expo-image with lazy loading

## Project Structure
```
client/
├── App.tsx                 # Main app entry with providers
├── components/             # Reusable UI components
│   ├── BannerSlider.tsx   # Home page banner carousel
│   ├── CartItemCard.tsx   # Cart item with quantity controls
│   ├── CategoryCard.tsx   # Category grid card with lazy loading images
│   ├── ProductCard.tsx    # Product listing card
│   ├── OrderCard.tsx      # Order history card
│   ├── SearchBar.tsx      # Search input component
│   └── EmptyState.tsx     # Empty state illustration
├── constants/
│   ├── theme.ts           # Colors, spacing, typography
│   ├── categories.ts      # 28 categories and products data
│   └── currency.ts        # Iraqi Dinar formatting
├── context/
│   ├── CartContext.tsx    # Shopping cart state
│   └── OrderContext.tsx   # Orders state
├── navigation/
│   ├── RootStackNavigator.tsx
│   ├── MainTabNavigator.tsx
│   └── [Tab]StackNavigator.tsx
└── screens/
    ├── HomeScreen.tsx     # Main home with banners & 4-column category grid
    ├── CategoriesScreen.tsx # Full 3-column grid of all 28 categories
    ├── ProductsScreen.tsx
    ├── CartScreen.tsx
    ├── CheckoutScreen.tsx
    ├── OrdersScreen.tsx
    └── ProfileScreen.tsx

server/
├── index.ts               # Express server setup
├── routes.ts              # API routes including /api/categories
└── storage.ts             # Data storage
```

## Key Features
- **Arabic RTL UI**: Full right-to-left support with Arabic fonts
- **5 Tab Navigation**: الرئيسية، الأقسام، السلة، الطلبات، الحساب
- **28 Product Categories**: Modern grocery-style grid layout with images
- **Lazy Loading Images**: Using expo-image for optimized performance
- **Shopping Cart**: Add/remove items, quantity controls, total calculation
- **Checkout Flow**: Customer info, delivery address, order confirmation
- **Order History**: View past orders with status tracking

## Categories (28 Total)
أضيف حديثاً، أفضل العروض، أساسيات الطبخ، المخبوزات، الفواكه والخضروات، اللحوم والدواجن، منتجات الألبان والبيض، جاهز للأكل، الأطعمة المجمدة، اللحوم المصنعة والمخللات، أجبان طازجة، المشروبات، معلبات، الوجبات الخفيفة والشوكولاتة، القهوة والشاي، البروتين والنظام الغذائي الخاص، طعام الإفطار، الطبخ والخبز، التوابل والصلصات، حليب، التنظيف والغسيل، العناية الشخصية، ركن الأطفال، الاستخدام الواحد، الصحة والجمال، المستلزمات المنزلية، رصيد الهاتف، الإلكترونيات

## Currency & Locale
- **Currency**: Iraqi Dinar (د.ع)
- **Phone Format**: 009647xxxxxxxxx
- **Number Format**: Arabic numerals (٣٥٬٠٠٠)

## Design System
- **Primary Color**: #FF8C42 (soft orange)
- **Font**: Tajawal (Arabic Google Font)
- **Border Radius**: 12-20px for cards
- **Spacing**: 8px base unit
- **Category Grid**: 4-column on home, 3-column on categories page

## API Endpoints
- `GET /api/categories` - Get all categories
- `GET /api/categories/:id` - Get single category

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

## Recent Changes
- February 2026: Renamed app to "Onway"
- Added phone login screen with registration
- Updated to 28 Arabic categories with modern grid layout
- Added lazy loading images using expo-image
- Currency set to Iraqi Dinar (د.ع)
- Phone format updated to Iraqi standard (00964)
- Created backend API for categories management
