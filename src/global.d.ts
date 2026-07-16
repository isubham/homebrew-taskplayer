export {};

declare global {
  interface Window {
    __TAURI__: {
      core: {
        invoke: <T = any>(cmd: string, args?: Record<string, any>) => Promise<T>;
      };
      event: {
        listen: (event: string, handler: (event: any) => void) => Promise<() => void>;
      };
    };
    Music?: {
      GENRES: Record<string, { label: string }>;
      snapshot: () => { playing: boolean };
      setOnChange: (callback: (state: any) => void) => void;
      setActive: (active: boolean) => void | Promise<void>;
      play: () => void | Promise<void>;
      pause: () => void;
      next: () => void | Promise<void>;
      previous: () => void | Promise<void>;
      setGenre: (genre: string) => void | Promise<void>;
      state: any;
      onStateChanged: (callback: (state: any) => void) => void;
      _onChange?: (state: any) => void;
      _onStateChanged?: (state: any) => void;
    };
  }
}
