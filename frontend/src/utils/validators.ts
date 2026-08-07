export const isEmail = (v: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const isPhone = (v: string) => /^[+\d][\d\s-]{6,}$/.test(v.trim());

export const required = (v: string) => (v.trim() ? null : "Required field");
export const minLength = (n: number) => (v: string) =>
  v.length >= n ? null : `Must be at least ${n} characters`;
