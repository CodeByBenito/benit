import { notFound } from "next/navigation";

/** Every /dev/* route is a development preview: none of them exists in production. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
