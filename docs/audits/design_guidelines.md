# Design Guidelines: Local Delivery Shopping App

## Brand Identity
**Purpose**: A local delivery shopping app for ordering products from multiple essential categories within one city.

**Aesthetic Direction**: Clean, modern, and approachable. Warm and inviting with soft orange as the signature color. The design should feel trustworthy and easy to navigate for Arabic-speaking users of all ages.

**RTL & Arabic Requirements**:
- ALL UI text must be in Arabic
- Full Right-To-Left layout support
- Use Arabic fonts with proper RTL alignment (system font or Tajawal/Cairo from Google Fonts)

## Navigation Architecture

**Root Navigation**: Tab Navigation (5 tabs)
- الرئيسية (Home)
- الفئات (Categories) 
- السلة (Cart) - with badge showing item count
- الطلبات (Orders)
- الحساب (Profile)

**Screen List**:
1. Splash Screen - App logo and name
2. Home Screen - Browse and search products
3. Categories Screen - Grid of shopping categories
4. Products Screen - List of products by category
5. Product Detail Screen - Full product information
6. Cart Screen - Review selected items
7. Checkout Screen - Complete order
8. Orders Screen - Order history and tracking
9. Profile Screen - User account and settings

## Screen-by-Screen Specifications

### Splash Screen
- **Layout**: Full-screen centered content
- **Components**: App logo (large), app name in Arabic below logo
- **Duration**: 2-3 seconds auto-transition

### Home Screen
- **Header**: Transparent, search bar with Arabic placeholder "ابحث عن منتجات..."
- **Content**: 
  - Banner slider (auto-scrolling offers/promotions)
  - Category grid (6 main categories with icons and Arabic labels)
  - Featured products section (horizontal scrollable list)
- **Safe Area**: Top (insets.top + 16px), Bottom (tabBarHeight + 16px)
- **Empty State**: Not applicable (home always has categories)

### Categories Screen
- **Header**: Default with title "الفئات"
- **Content**: Grid view (2 columns) of category cards
  - Each card: Icon, Arabic name, item count
  - Rounded corners, soft shadow
- **Safe Area**: Top (16px), Bottom (tabBarHeight + 16px)

### Products Screen
- **Header**: Default with category name, back button (right side for RTL), filter icon (left side)
- **Content**: Vertical list of product cards
  - Product image, name, price, "إضافة إلى السلة" button
- **Safe Area**: Top (16px), Bottom (tabBarHeight + 16px)
- **Empty State**: Illustration with text "لا توجد منتجات في هذه الفئة"

### Cart Screen
- **Header**: Default with title "السلة", clear all button (left side)
- **Content**: 
  - List of cart items with quantity controls (+/-)
  - Sticky footer with total price and "إتمام الطلب" button
- **Safe Area**: Top (16px), Bottom (tabBarHeight + 80px for sticky footer)
- **Empty State**: Illustration with "سلتك فارغة" and "ابدأ التسوق" button

### Checkout Screen
- **Header**: Default with "تأكيد الطلب", cancel button (right side)
- **Content**: Scrollable form
  - Input fields: الاسم، رقم الهاتف، العنوان، ملاحظات
  - Order summary card
  - "تأكيد الطلب" button at bottom
- **Safe Area**: Top (16px), Bottom (insets.bottom + 16px)
- **Form Buttons**: Below form content

### Profile Screen
- **Header**: Transparent
- **Content**: User avatar, name, settings list
- **Safe Area**: Top (insets.top + 16px), Bottom (tabBarHeight + 16px)

## Color Palette
- **Primary**: #E86520 (brand orange — single source of truth: client/constants/theme.ts)
- **Primary Light**: #F28B4E
- **Primary Dark**: #C4520F
- **Background**: #F5F5F5 (light gray)
- **Surface**: #FFFFFF (white)
- **Text Primary**: #2C2C2C
- **Text Secondary**: #757575
- **Border**: #E0E0E0
- **Success**: #4CAF50
- **Error**: #F44336

## Typography
- **Font Family**: System default Arabic font or Tajawal (Google Font)
- **Scale**:
  - Heading 1: 28px, Bold
  - Heading 2: 22px, Bold
  - Body: 16px, Regular
  - Caption: 14px, Regular
  - Button: 16px, SemiBold

## Visual Design
- **Spacing**: 8px base unit (xs: 4, sm: 8, md: 16, lg: 24, xl: 32)
- **Border Radius**: 12px for cards, 8px for buttons
- **Cards**: White background, subtle shadow (shadowOpacity: 0.05, shadowRadius: 8)
- **Buttons**: Primary buttons use primary color, rounded, height 48px
- **Icons**: Feather icons from @expo/vector-icons
- **Visual Feedback**: All touchable elements show opacity change on press (activeOpacity: 0.7)

## Assets to Generate

**Required Assets**:
1. **icon.png** - App icon with orange shopping bag or cart symbol - Used on device home screen
2. **splash-icon.png** - Same as icon.png - Used during app launch
3. **empty-cart.png** - Simple illustration of empty shopping cart - Used on Cart Screen when no items
4. **empty-products.png** - Illustration of empty shelves - Used on Products Screen when category has no items
5. **banner-offer-1.png** - Promotional banner with Arabic text - Used in Home Screen slider
6. **banner-offer-2.png** - Second promotional banner - Used in Home Screen slider

**Category Icons** (use Feather icons):
- مواد غذائية: shopping-bag
- سوبر ماركت: shopping-cart
- صيدلية: activity
- إلكترونيات: smartphone
- ملابس: tag
- خدمات: tool