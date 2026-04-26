import React, {
  createContext,
  useContext,
  useState,
  Dispatch,
  SetStateAction,
  ReactNode,
} from "react";

interface VendorNotificationsContextType {
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
}

const VendorNotificationsContext = createContext<VendorNotificationsContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
});

export function VendorNotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  return (
    <VendorNotificationsContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </VendorNotificationsContext.Provider>
  );
}

export function useVendorNotifications() {
  return useContext(VendorNotificationsContext);
}
