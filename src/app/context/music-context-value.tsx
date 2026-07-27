import { createContext, useContext } from "react";

const MusicContext = createContext(null);

export function useMusic() {
  return useContext(MusicContext);
}

export function MusicContextValueProvider({ children, value }) {
  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}
