# توصيلي - تطبيق توصيل الطلبات

## Overview
تطبيق توصيل وتسوق محلي احترافي للهواتف المحمولة (iOS و Android) باستخدام React Native و Expo. يتيح للمستخدمين تصفح وطلب المنتجات من أقسام متعددة داخل المدينة.

## Tech Stack
- **Frontend**: React Native (Expo) with TypeScript
- **Backend**: Node.js + Express
- **State Management**: React Context (CartContext, OrderContext)
- **Navigation**: React Navigation 7+ with Bottom Tabs
- **Styling**: RTL Arabic support with Tajawal font

## Project Structure
```
client/
├── App.tsx                 # Main app entry with providers
├── components/             # Reusable UI components
│   ├── BannerSlider.tsx   # Home page banner carousel
│   ├── CartItemCard.tsx   # Cart item with quantity controls
│   ├── CategoryCard.tsx   # Category grid card
│   ├── ProductCard.tsx    # Product listing card
│   ├── OrderCard.tsx      # Order history card
│   ├── SearchBar.tsx      # Search input component
│   └── EmptyState.tsx     # Empty state illustration
├── constants/
│   ├── theme.ts           # Colors, spacing, typography
│   ├── categories.ts      # Categories and products data
│   └── currency.ts        # Iraqi Dinar formatting
├── context/
│   ├── CartContext.tsx    # Shopping cart state
│   └── OrderContext.tsx   # Orders state
├── navigation/
│   ├── RootStackNavigator.tsx
│   ├── MainTabNavigator.tsx
│   └── [Tab]StackNavigator.tsx
└── screens/
    ├── HomeScreen.tsx     # Main home with banners & categories
    ├── CategoriesScreen.tsx
    ├── ProductsScreen.tsx
    ├── CartScreen.tsx
    ├── CheckoutScreen.tsx
    ├── OrdersScreen.tsx
    └── ProfileScreen.tsx

server/
├── index.ts               # Express server setup
├── routes.ts              # API routes
└── storage.ts             # Data storage
```

## Key Features
- **Arabic RTL UI**: Full right-to-left support with Arabic fonts
- **5 Tab Navigation**: الرئيسية، الأقسام، السلة، الطلبات، الحساب
- **6 Product Categories**: مواد غذائية، سوبر ماركت، صيدلية، إلكترونيات، ملابس، خدمات
- **Shopping Cart**: Add/remove items, quantity controls, total calculation
- **Checkout Flow**: Customer info, delivery address, order confirmation
- **Order History**: View past orders with status tracking

## Currency & Locale
- **Currency**: Iraqi Dinar (د.ع)
- **Phone Format**: 009647xxxxxxxxx
- **Number Format**: Arabic numerals (٣٥٬٠٠٠)

## Design System
- **Primary Color**: #FF8C42 (soft orange)
- **Font**: Tajawal (Arabic Google Font)
- **Border Radius**: 12-20px for cards
- **Spacing**: 8px base unit

## Running the App
1. Backend runs on port 5000
2. Expo dev server runs on port 8081
3. Scan QR code with Expo Go to test on mobile device
4. Web preview available at localhost:8081

## Recent Changes
- February 2026: Initial release with Arabic RTL support
- Currency set to Iraqi Dinar (د.ع)
- Phone format updated to Iraqi standard (00964)
