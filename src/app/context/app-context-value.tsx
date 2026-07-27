import { createContext, useContext } from "react";

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppContextValueProvider({ children, value }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
