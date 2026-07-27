import { APP_LOADING } from "../constants";
import "./app-loading-screen.css";

type AppLoadingScreenProps = {
  accountName?: string | null;
};

export function AppLoadingScreen({ accountName }: AppLoadingScreenProps) {
  return (
    <main className="app-loading-screen">
      <img
        className="app-loading-background"
        src={APP_LOADING.backgroundImage}
        alt=""
        aria-hidden="true"
      />
      <div className="app-loading-shade" aria-hidden="true" />
      <section className="app-loading-card" aria-live="polite">
        <div className="app-loading-spinner" aria-hidden="true" />
        <h1>{APP_LOADING.welcome(accountName)}</h1>
        <p>{APP_LOADING.message}</p>
      </section>
    </main>
  );
}
