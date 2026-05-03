# Onway - تطبيق توصيل الطلبات

## Overview
Onway is a professional local delivery and shopping mobile application for iOS and Android, built with React Native and Expo. It allows users to browse and order products from multiple categories within their city. The project aims to provide a seamless multi-vendor experience, particularly for restaurants, and an efficient delivery system. The business vision is to capture the local delivery market by offering a user-friendly interface, robust features, and a scalable architecture.

## User Preferences
The user prefers clear and concise information. The agent should prioritize delivering accurate and up-to-date details, especially regarding the current system design and feature specifications. When making changes, the agent should confirm understanding of the request and outline the proposed steps before execution.

## System Architecture
Onway is built with a React Native (Expo) frontend using TypeScript, and a Node.js + Express backend. React Context is used for state management across key functionalities like authentication, cart, and orders. Navigation is handled by React Navigation 7+. The UI supports full Arabic RTL with the Tajawal font and features an Orange branding design system. Images are handled efficiently using `expo-image` with lazy loading and are stored as Base64 strings directly in Firestore to avoid Firebase Storage costs.

**Key Features:**
- **Arabic RTL UI:** Full right-to-left support with custom Arabic fonts.
- **Phone Authentication:** Secure login using Iraqi phone numbers.
- **Tab Navigation:** Five main tabs for intuitive user flow: Home, Categories, Cart, Orders, and Profile.
- **Product Categories:** Extensive product categorization with a modern grocery-style grid layout.
- **Dynamic Banners:** Engaging offer and auto-sliding carousel banners.
- **Admin Panel:** Comprehensive content management system for banners, categories, products, delivery areas, promo codes, and driver wallets.
- **Shopping Cart & Order History:** Standard e-commerce functionalities with status tracking.
- **Multi-Vendor System:** Full store/restaurant management — card-based UI with category filters (Restaurants, Stores, Grocery, Cafes, Pharmacies), inline open/close toggle, delivery options, working hours, min-order, description. Backend stores `hasDelivery`, `minOrder`, `openTime`, `closeTime`, `description`, and 5 `categoryType` values in Firestore.
- **Promotional Sections:** Admin-managed sections for Best Sellers, Featured Products, and Discounts.
- **Push Notifications:** Real-time order status updates for customers.
- **Promo Code System:** Supports fixed and percentage-based discounts with one-time-per-user enforcement.
- **Driver Wallet System:** Manages driver commissions, balances, and transaction history.
- **Live Vendor Ratings:** Customers rate delivered vendor orders (1–5 stars) via `POST /api/orders/:orderId/rate`. Firestore transaction updates vendor `rating` (weighted average) and `ratingCount`. Admin can override or reset ratings. UI hides stars when `rating === null` (no rating yet) — no more hardcoded 4.5 fallback.

**UI/UX Design:**
- **Branding:** Primary color #FF7622 (brand orange), secondary #FFF2EC.
- **Typography:** Cairo and Tajawal fonts.
- **Layout:** 16px screen padding, 14px grid gap, 16px border-radius for cards, 18px for banners.
- **Component Dimensions:** Category Card: 160x140px, Category Image: 72px, Banner Height: 160px.

**Technical Implementations:**
- **Image Handling:** All images (profile, product, banner, category) are compressed and stored as Base64 strings in Firestore, utilizing `expo-image-manipulator` to avoid Firebase Storage.
- **Firebase Integration:** Uses Firebase Admin SDK for backend data management and Firebase Client SDK for frontend data reading.
- **Order Workflow:** Full order status lifecycle: `pending → confirmed → preparing → ready → picked_up → in_delivery → delivered` (or `cancelled`). All statuses are typed in `FirestoreOrder.status`.
- **Batch Delivery System:** Drivers receive delivery batches (up to 3 orders) instead of single orders. Each batch (`DeliveryBatch`) tracks `driverId`, `status` (pending/in_progress/completed), `orderIds`, `totalOrders`, `completedOrders`, `totalDistance`, `totalEarnings`. Driver flow: batch offered → accept → pickup each order → deliver each order → batch completes.
  - Backend endpoints: `POST /api/driver/batch/accept`, `POST /api/driver/batch/pickup-order`, `POST /api/driver/batch/complete-order`.
  - Frontend: `DriverHomeScreen` shows pending/active batch card; `DriverBatchScreen` manages individual order steps.
  - Schema matches: `OrderStatus`, `BatchStatus`, `DeliveryBatch`, `DriverStats` interfaces.

## External Dependencies
- **Firebase Firestore:** Primary NoSQL database for user profiles, orders, categories, promo codes, vendor data, and driver wallets.
- **Expo:** Development platform for React Native, providing access to device features and simplifying build processes.
- **React Native:** Frontend framework for cross-platform mobile development.
- **Node.js + Express:** Backend server for API endpoints and business logic.
- **React Navigation:** Library for handling navigation within the mobile application.
- **Expo Push API:** For sending push notifications to users for order status updates.
- **AsyncStorage:** For local storage of authentication state on the client side.
- **Multer:** Node.js middleware for handling multipart/form-data, primarily for image uploads (though current strategy uses Base64 in JSON).
- **expo-image:** Optimized image component for React Native.
- **expo-image-manipulator:** For client-side image compression and resizing.