import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "HIVE: Never solve the same problem twice", description: "The self-learning AI call center: known issues answered instantly from CockroachDB memory, novel ones reasoned through once on AWS Bedrock, then remembered forever." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
