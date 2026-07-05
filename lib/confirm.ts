// Branded, promise-based confirm dialog - the one replacement for native confirm() on anything
// that SPENDS money or DELETES data. Mirrors the flex() toast bus: call askConfirm(...) and the
// <ConfirmHost/> mounted in the root layout renders the modal and resolves the promise.
//
//   if (!(await askConfirm({ title: "Re-animate every scene?", tone: "spend", cost: "≈ R120" }))) return;

export type ConfirmTone = "danger" | "spend" | "default";

export type ConfirmOpts = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  // Optional pre-flight cost estimate shown prominently (e.g. "≈ R120"). Powers the P2-1 "see it before you spend" pattern.
  cost?: string;
};

export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  // No window (SSR) or nothing listening -> fail safe by NOT proceeding with a destructive/paid action.
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent("gas-confirm", { detail: { opts, resolve } }));
  });
}
