import { useState } from "react";
import { LogoMark } from "./logo-mark";
import { useAppStore } from "@/lib/app-store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

type Tab = "email" | "phone";

export function LoginScreen() {
  const locale = useAppStore((s) => s.settings.locale);
  const busy = useAppStore((s) => s.ui.loginBusy);
  const error = useAppStore((s) => s.ui.loginError);
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("+880");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const store = useAppStore.getState();
    store.setLoginError("");
    store.setLoginBusy(true);
    try {
      const res = await fetch("/api/ds/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tab === "email"
            ? { email: email.trim(), password }
            : { mobile: phone.trim(), area_code: area, password },
        ),
      });
      const json = (await res.json()) as {
        token?: string;
        email?: string;
        mobile?: string;
        error?: string;
      };
      if (!res.ok || !json.token) {
        store.setLoginError(json.error || t(locale, "loginFailed"));
        return;
      }
      store.setAccount({
        token: json.token,
        email: json.email || email.trim(),
        mobile: json.mobile || phone.trim(),
      });
    } catch {
      store.setLoginError(t(locale, "loginFailed"));
    } finally {
      store.setLoginBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg px-6 text-fg">
      <div className="flex justify-end pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex rounded-[var(--radius-sm)] bg-elevated p-1 shadow-[var(--shadow-border)]">
          {(["en", "bn"] as Locale[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => useAppStore.getState().setLocale(id)}
              className={cn(
                "h-8 rounded-[6px] px-3 text-xs font-medium",
                locale === id ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {id === "en" ? "EN" : "বাংলা"}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-16" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t(locale, "appName")}</h1>
          <p className="mt-2 text-sm text-muted">{t(locale, "loginTagline")}</p>
        </div>

        <div className="mb-5 flex rounded-[var(--radius-sm)] bg-elevated p-1 shadow-[var(--shadow-border)]">
          {(["email", "phone"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "h-9 flex-1 rounded-[6px] text-sm font-medium",
                tab === id ? "bg-surface text-fg" : "text-muted",
              )}
            >
              {t(locale, id === "email" ? "email" : "phone")}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {tab === "email" ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t(locale, "email")}</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-[var(--radius-md)] bg-elevated px-3 text-[15px] shadow-[var(--shadow-border)] outline-none placeholder:text-faint"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t(locale, "phone")}</span>
              <div className="flex gap-2">
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="h-12 w-20 rounded-[var(--radius-md)] bg-elevated px-3 text-[15px] shadow-[var(--shadow-border)] outline-none"
                />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="1711…"
                  className="h-12 min-w-0 flex-1 rounded-[var(--radius-md)] bg-elevated px-3 text-[15px] shadow-[var(--shadow-border)] outline-none placeholder:text-faint"
                />
              </div>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{t(locale, "password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-[var(--radius-md)] bg-elevated px-3 text-[15px] shadow-[var(--shadow-border)] outline-none"
            />
          </label>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-accent text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {busy ? t(locale, "signingIn") : t(locale, "continueDeepSeek")}
          </button>
        </form>

        <button
          type="button"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-elevated text-sm font-medium text-fg shadow-[var(--shadow-border)]"
          onClick={() => {
            useAppStore.getState().setAccount({
              token: "",
              email: "",
              mobile: "",
              guest: true,
            });
          }}
        >
          {t(locale, "exploreWorkspace")}
        </button>

        <p className="mt-6 text-center text-xs leading-5 text-faint">{t(locale, "loginHint")}</p>
      </div>
    </div>
  );
}
